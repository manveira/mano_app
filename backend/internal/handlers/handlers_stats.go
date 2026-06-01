package handlers

// handlers_stats.go — Dashboard stats, courier orders, perfil negocio, KYC application

import (
	"net/http"
	"strings"
	"time"

	"mano-app/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// ─── Dashboard negocio: stats avanzadas ──────────────────────────────────────

// GET /dashboard/business/stats
// Devuelve ventas por día (últimos 7 o 30 días), top productos y top comisionistas.
func (h *Handler) BusinessDashboardStats(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "business_owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only business owners can view stats"})
		return
	}

	days := 7
	if c.Query("period") == "30d" {
		days = 30
	}
	since := time.Now().AddDate(0, 0, -days)

	// Negocios del owner
	var businesses []models.Business
	h.db.Where("owner_id = ?", claims.UserID).Find(&businesses)
	if len(businesses) == 0 {
		c.JSON(http.StatusOK, gin.H{"sales_by_day": []interface{}{}, "top_products": []interface{}{}, "top_freelancers": []interface{}{}})
		return
	}
	bizIDs := make([]uint, len(businesses))
	for i, b := range businesses {
		bizIDs[i] = b.ID
	}

	// Ventas por día
	type DaySale struct {
		Day     string  `json:"day"`
		Orders  int64   `json:"orders"`
		Revenue float64 `json:"revenue"`
	}
	var salesByDay []DaySale
	h.db.Raw(`
		SELECT DATE(created_at) as day, COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue
		FROM orders
		WHERE business_id IN ? AND payment_status = 'paid' AND created_at >= ?
		GROUP BY DATE(created_at)
		ORDER BY day ASC
	`, bizIDs, since).Scan(&salesByDay)

	// Top productos (por cantidad vendida)
	type TopProduct struct {
		ProductID   uint    `json:"product_id"`
		ProductName string  `json:"product_name"`
		Quantity    int64   `json:"quantity_sold"`
		Revenue     float64 `json:"revenue"`
	}
	var topProducts []TopProduct
	h.db.Raw(`
		SELECT oi.product_id, p.name as product_name,
		       SUM(oi.quantity) as quantity, SUM(oi.quantity * oi.unit_price) as revenue
		FROM order_items oi
		JOIN products p ON p.id = oi.product_id
		JOIN orders o ON o.id = oi.order_id
		WHERE o.business_id IN ? AND o.payment_status = 'paid' AND o.created_at >= ?
		GROUP BY oi.product_id, p.name
		ORDER BY quantity DESC
		LIMIT 5
	`, bizIDs, since).Scan(&topProducts)

	// Top comisionistas (por ventas generadas)
	type TopFreelancer struct {
		FreelancerID   uint    `json:"freelancer_id"`
		FreelancerName string  `json:"freelancer_name"`
		Sales          int64   `json:"sales"`
		Commission     float64 `json:"commission_earned"`
	}
	var topFreelancers []TopFreelancer
	h.db.Raw(`
		SELECT o.freelancer_id, u.name as freelancer_name,
		       COUNT(*) as sales, SUM(o.freelancer_commission) as commission_earned
		FROM orders o
		JOIN users u ON u.id = o.freelancer_id
		WHERE o.business_id IN ? AND o.payment_status = 'paid'
		  AND o.freelancer_id IS NOT NULL AND o.created_at >= ?
		GROUP BY o.freelancer_id, u.name
		ORDER BY sales DESC
		LIMIT 5
	`, bizIDs, since).Scan(&topFreelancers)

	c.JSON(http.StatusOK, gin.H{
		"period":          c.DefaultQuery("period", "7d"),
		"sales_by_day":    salesByDay,
		"top_products":    topProducts,
		"top_freelancers": topFreelancers,
	})
}

// ─── Dashboard freelancer ─────────────────────────────────────────────────────

// GET /dashboard/freelancer
// Ingresos por período y top productos vendidos por el comisionista.
func (h *Handler) FreelancerDashboard(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "freelancer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only freelancers can view this dashboard"})
		return
	}

	days := 7
	if c.Query("period") == "30d" {
		days = 30
	}
	since := time.Now().AddDate(0, 0, -days)

	// Ingresos por día
	type DayEarning struct {
		Day      string  `json:"day"`
		Sales    int64   `json:"sales"`
		Earnings float64 `json:"earnings"`
	}
	var earningsByDay []DayEarning
	h.db.Raw(`
		SELECT DATE(created_at) as day, COUNT(*) as sales,
		       COALESCE(SUM(freelancer_commission),0) as earnings
		FROM orders
		WHERE freelancer_id = ? AND payment_status = 'paid' AND created_at >= ?
		GROUP BY DATE(created_at)
		ORDER BY day ASC
	`, claims.UserID, since).Scan(&earningsByDay)

	// Top productos vendidos
	type TopProduct struct {
		ProductID   uint    `json:"product_id"`
		ProductName string  `json:"product_name"`
		Sales       int64   `json:"sales"`
		Earned      float64 `json:"earned"`
	}
	var topProducts []TopProduct
	h.db.Raw(`
		SELECT oi.product_id, p.name as product_name,
		       COUNT(*) as sales, SUM(o.freelancer_commission) as earned
		FROM orders o
		JOIN order_items oi ON oi.order_id = o.id
		JOIN products p ON p.id = oi.product_id
		WHERE o.freelancer_id = ? AND o.payment_status = 'paid' AND o.created_at >= ?
		GROUP BY oi.product_id, p.name
		ORDER BY sales DESC
		LIMIT 5
	`, claims.UserID, since).Scan(&topProducts)

	// Saldo actual
	var user models.User
	h.db.Select("earnings_balance").First(&user, claims.UserID)

	// Total del período
	var periodTotal float64
	h.db.Raw(`SELECT COALESCE(SUM(freelancer_commission),0) FROM orders WHERE freelancer_id = ? AND payment_status = 'paid' AND created_at >= ?`,
		claims.UserID, since).Scan(&periodTotal)

	c.JSON(http.StatusOK, gin.H{
		"period":          c.DefaultQuery("period", "7d"),
		"earnings_by_day": earningsByDay,
		"top_products":    topProducts,
		"balance":         user.EarningsBalance,
		"period_total":    periodTotal,
	})
}

// ─── Courier: pedidos disponibles ────────────────────────────────────────────

// GET /orders/courier
// Pedidos pagados sin repartidor asignado, disponibles para que un courier los tome.
func (h *Handler) CourierAvailableOrders(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var orders []models.Order
	h.db.Preload("OrderItems.Product").Preload("Business").
		Joins("LEFT JOIN deliveries ON deliveries.order_id = orders.id").
		Where("orders.status = 'paid' AND deliveries.id IS NULL").
		Order("orders.created_at ASC").
		Find(&orders)

	c.JSON(http.StatusOK, gin.H{"orders": orders, "count": len(orders)})
}

// ─── Perfil público del negocio ───────────────────────────────────────────────

// GET /negocio/:slug
func (h *Handler) BusinessPublicProfile(c *gin.Context) {
	slug := c.Param("slug")

	var business models.Business
	if err := h.db.Where("slug = ? AND is_approved = ?", slug, true).First(&business).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "business not found"})
		return
	}

	var products []models.Product
	h.db.Where("business_id = ? AND is_active = ?", business.ID, true).Find(&products)

	var totalOrders int64
	var totalRevenue float64
	h.db.Model(&models.Order{}).Where("business_id = ? AND payment_status = 'paid'", business.ID).Count(&totalOrders)
	h.db.Model(&models.Order{}).Select("COALESCE(SUM(total_amount),0)").
		Where("business_id = ? AND payment_status = 'paid'", business.ID).Scan(&totalRevenue)

	c.JSON(http.StatusOK, gin.H{
		"business": business,
		"products": products,
		"stats":    gin.H{"total_orders": totalOrders, "total_revenue": totalRevenue},
		"slug":     slug,
	})
}

func toSlug(name string) string {
	replacer := strings.NewReplacer(
		"á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u",
		"Á", "a", "É", "e", "Í", "i", "Ó", "o", "Ú", "u",
		"ñ", "n", "Ñ", "n", "ü", "u", "Ü", "u",
	)
	s := strings.ToLower(replacer.Replace(name))
	s = strings.ReplaceAll(s, " ", "-")
	var clean strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			clean.WriteRune(r)
		}
	}
	return clean.String()
}

// ─── KYC Application ─────────────────────────────────────────────────────────

type applyBusinessRequest struct {
	BusinessName     string `json:"business_name" binding:"required"`
	Category         string `json:"category" binding:"required"`
	Description      string `json:"description" binding:"required"`
	NequiNumber      string `json:"nequi_number" binding:"required"`
	DocumentImageURL string `json:"document_image_url"` // URL de foto del RUT/cédula
}

// POST /businesses/apply
// Cualquier usuario puede enviar una solicitud de registro de negocio.
func (h *Handler) ApplyBusiness(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req applyBusinessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verificar que no tenga una aplicación pendiente
	var existing models.BusinessApplication
	if h.db.Where("user_id = ? AND status = 'pending'", claims.UserID).First(&existing).Error == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "you already have a pending application"})
		return
	}

	app := models.BusinessApplication{
		UserID:           claims.UserID,
		BusinessName:     req.BusinessName,
		Category:         req.Category,
		Description:      req.Description,
		NequiNumber:      req.NequiNumber,
		DocumentImageURL: req.DocumentImageURL,
		Status:           "pending",
		CreatedAt:        time.Now(),
	}

	if err := h.db.Create(&app).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to submit application"})
		return
	}

	// Recargar para obtener ID y campos generados por la BD
	h.db.Last(&app, "user_id = ?", claims.UserID)

	c.JSON(http.StatusCreated, gin.H{
		"application": app,
		"message":     "Application submitted. Review takes 24-48 hours.",
	})
}

package handlers

// handlers_business.go — Sprint 3 (Plan Pro), Sprint 5 (Disputas), Sprint 6 (producto inactivo)

import (
	"net/http"
	"strconv"
	"time"

	"mano-app/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// ─── Sprint 3: Plan Pro ───────────────────────────────────────────────────────

// UpgradePro activa el plan Pro del comisionista por 30 días.
// En producción cobrar $15.000 vía Wompi. En mock, activa directamente.
// POST /sell/upgrade-pro
func (h *Handler) UpgradePro(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "freelancer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only freelancers can upgrade to Pro"})
		return
	}

	expires := time.Now().Add(30 * 24 * time.Hour)
	if err := h.db.Model(&models.User{}).Where("id = ?", claims.UserID).
		Updates(map[string]interface{}{
			"plan":            "pro",
			"plan_expires_at": expires,
		}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upgrade plan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"plan":            "pro",
		"plan_expires_at": expires,
		"message":         "Plan Pro activado por 30 días",
	})
}

// SellStats devuelve estadísticas avanzadas de los links del comisionista.
// Solo disponible para plan Pro.
// GET /sell/stats
func (h *Handler) SellStats(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "freelancer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only freelancers can view stats"})
		return
	}

	var user models.User
	h.db.Select("plan, plan_expires_at").First(&user, claims.UserID)

	isPro := user.Plan == "pro" && (user.PlanExpiresAt == nil || user.PlanExpiresAt.After(time.Now()))
	if !isPro {
		c.JSON(http.StatusForbidden, gin.H{"error": "advanced stats require Pro plan"})
		return
	}

	var links []models.ReferralLink
	h.db.Preload("Product").Where("freelancer_id = ? AND is_active = true", claims.UserID).Find(&links)

	type linkStat struct {
		Slug           string  `json:"slug"`
		ProductName    string  `json:"product_name"`
		Clicks         int     `json:"clicks"`
		Conversions    int     `json:"conversions"`
		ConversionRate float64 `json:"conversion_rate_pct"`
		EarnedTotal    float64 `json:"earned_total"`
	}

	stats := make([]linkStat, 0, len(links))
	for _, l := range links {
		rate := 0.0
		if l.Clicks > 0 {
			rate = float64(l.Conversions) / float64(l.Clicks) * 100
		}
		stats = append(stats, linkStat{
			Slug:           l.Slug,
			ProductName:    l.Product.Name,
			Clicks:         l.Clicks,
			Conversions:    l.Conversions,
			ConversionRate: rate,
			EarnedTotal:    float64(l.Conversions) * l.Product.Price * l.Product.CommissionRate,
		})
	}

	var totalEarned float64
	_ = totalEarned
	h.db.Model(&models.User{}).Select("earnings_balance").First(&user, claims.UserID)

	c.JSON(http.StatusOK, gin.H{
		"links":         stats,
		"total_balance": user.EarningsBalance,
		"plan_expires":  user.PlanExpiresAt,
	})
}

// ─── Sprint 5: Disputas ───────────────────────────────────────────────────────

type disputeRequest struct {
	Reason     string `json:"reason" binding:"required"`
	ReportedBy string `json:"reported_by" binding:"required,oneof=buyer business"`
}

// OpenDispute — buyer o business reporta un problema con la orden.
// Mueve la orden a "disputed" y bloquea el escrow.
// POST /orders/:id/dispute
func (h *Handler) OpenDispute(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	orderID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid order id"})
		return
	}

	var req disputeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var order models.Order
	if err := h.db.First(&order, orderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}

	// Verificar que quien reporta tiene relación con la orden
	if req.ReportedBy == "buyer" && (order.CustomerID == nil || *order.CustomerID != claims.UserID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the buyer can report as buyer"})
		return
	}
	if req.ReportedBy == "business" {
		var biz models.Business
		if err := h.db.First(&biz, order.BusinessID).Error; err != nil || biz.OwnerID != claims.UserID {
			c.JSON(http.StatusForbidden, gin.H{"error": "only the business owner can report as business"})
			return
		}
	}

	if order.EscrowStatus != "held" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "can only dispute orders that are in escrow"})
		return
	}
	if order.Status == "disputed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order is already disputed"})
		return
	}

	order.Status = "disputed"
	h.db.Save(&order)

	c.JSON(http.StatusOK, gin.H{
		"message":       "Dispute opened. Mano will review within 48 hours.",
		"status":        order.Status,
		"escrow_status": order.EscrowStatus,
		"reason":        req.Reason,
		"reported_by":   req.ReportedBy,
	})
}

type resolveDisputeRequest struct {
	Resolution string `json:"resolution" binding:"required,oneof=refund_buyer release_business"`
	Notes      string `json:"notes"`
}

// ResolveDispute — admin resuelve una disputa.
// POST /admin/disputes/:id/resolve
func (h *Handler) ResolveDispute(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only admins can resolve disputes"})
		return
	}

	orderID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid order id"})
		return
	}

	var req resolveDisputeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var order models.Order
	if err := h.db.First(&order, orderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	if order.Status != "disputed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order is not disputed"})
		return
	}

	now := time.Now()
	switch req.Resolution {
	case "refund_buyer":
		order.Status = "cancelled"
		order.EscrowStatus = "refunded"
		order.PaymentStatus = "refunded"
		// Marcar splits como fallidos
		h.db.Model(&models.CommissionSplit{}).Where("order_id = ? AND status = ?", order.ID, "pending").
			Updates(map[string]interface{}{"status": "failed", "released_at": now})

	case "release_business":
		order.Status = "delivered"
		order.EscrowStatus = "released"
		order.ConfirmedAt = &now
		// Liberar splits normalmente
		h.releaseEscrow(&order)
		// releaseEscrow ya guarda la orden, salir
		c.JSON(http.StatusOK, gin.H{
			"message":       "Dispute resolved: payment released to business",
			"status":        order.Status,
			"escrow_status": order.EscrowStatus,
		})
		return
	}

	h.db.Save(&order)
	c.JSON(http.StatusOK, gin.H{
		"message":        "Dispute resolved",
		"status":         order.Status,
		"escrow_status":  order.EscrowStatus,
		"payment_status": order.PaymentStatus,
	})
}

// ─── Sprint 6: Activar/desactivar producto ────────────────────────────────────

type patchProductRequest struct {
	IsActive *bool `json:"is_active"`
}

// PatchProduct — activa o desactiva un producto.
// PATCH /products/:id
func (h *Handler) PatchProduct(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "business_owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only business owners can update products"})
		return
	}

	productID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid product id"})
		return
	}

	var req patchProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var product models.Product
	if err := h.db.First(&product, productID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
		return
	}

	// Verificar ownership
	var biz models.Business
	if err := h.db.First(&biz, product.BusinessID).Error; err != nil || biz.OwnerID != claims.UserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "you can only update your own products"})
		return
	}

	if req.IsActive != nil {
		product.IsActive = *req.IsActive
		h.db.Save(&product)

		// Sincronizar estado de los links de referido con el estado del producto
		h.db.Model(&models.ReferralLink{}).Where("product_id = ?", product.ID).
			Update("is_active", *req.IsActive)
	}

	c.JSON(http.StatusOK, product)
}

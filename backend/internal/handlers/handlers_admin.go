package handlers

// handlers_admin.go — Panel de admin, delivery estados, stories expiradas, feed boost

import (
	"net/http"
	"strconv"
	"time"

	"mano-app/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// ─── Editar negocio ───────────────────────────────────────────────────────────

type patchBusinessRequest struct {
	Name                  string  `json:"name"`
	Description           string  `json:"description"`
	ImageURL              string  `json:"image_url"`
	DefaultCommissionRate float64 `json:"default_commission_rate"`
	Address               string  `json:"address"`
	Location              string  `json:"location"`
}

// PATCH /businesses/:id
func (h *Handler) PatchBusiness(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "business_owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only business owners can edit businesses"})
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var biz models.Business
	if err := h.db.First(&biz, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "business not found"})
		return
	}
	if biz.OwnerID != claims.UserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "not your business"})
		return
	}
	var req patchBusinessRequest
	c.ShouldBindJSON(&req)

	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
		updates["slug"] = generateUniqueSlug(h.db, req.Name)
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.ImageURL != "" {
		updates["image_url"] = req.ImageURL
	}
	if req.DefaultCommissionRate >= 0.10 && req.DefaultCommissionRate <= 0.40 {
		updates["default_commission_rate"] = req.DefaultCommissionRate
	}
	if req.Address != "" {
		updates["address"] = req.Address
	}
	if req.Location != "" {
		updates["location"] = req.Location
	}

	h.db.Model(&biz).Updates(updates)
	h.db.First(&biz, id)
	c.JSON(http.StatusOK, biz)
}

// GET /admin/applications — listar solicitudes KYC pendientes
func (h *Handler) AdminListApplications(c *gin.Context) {
	var apps []models.BusinessApplication
	h.db.Where("status = ?", "pending").Order("created_at ASC").Find(&apps)
	c.JSON(http.StatusOK, gin.H{"applications": apps, "count": len(apps)})
}

func (h *Handler) AdminOnly(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "admin" {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin access required"})
		return
	}
	c.Next()
}

// ─── Admin: negocios pendientes ───────────────────────────────────────────────

// GET /admin/businesses/pending
func (h *Handler) AdminListPendingBusinesses(c *gin.Context) {
	var businesses []models.Business
	h.db.Where("is_approved = ?", false).Find(&businesses)
	c.JSON(http.StatusOK, gin.H{"businesses": businesses, "count": len(businesses)})
}

// POST /admin/businesses/:id/approve
func (h *Handler) AdminApproveBusiness(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	result := h.db.Model(&models.Business{}).Where("id = ?", id).Update("is_approved", true)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "business not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "business approved", "business_id": id})
}

// POST /admin/businesses/:id/reject
func (h *Handler) AdminRejectBusiness(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var req struct {
		Reason string `json:"reason"`
	}
	c.ShouldBindJSON(&req)

	result := h.db.Model(&models.Business{}).Where("id = ?", id).Update("is_approved", false)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "business not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "business rejected", "business_id": id, "reason": req.Reason})
}

// ─── Admin: disputas ──────────────────────────────────────────────────────────

// GET /admin/disputes
func (h *Handler) AdminListDisputes(c *gin.Context) {
	var orders []models.Order
	h.db.Preload("OrderItems.Product").Where("status = ?", "disputed").
		Order("created_at DESC").Find(&orders)
	c.JSON(http.StatusOK, gin.H{"disputes": orders, "count": len(orders)})
}

// ─── Admin: retiros pendientes ────────────────────────────────────────────────

// GET /admin/withdrawals
func (h *Handler) AdminListWithdrawals(c *gin.Context) {
	var withdrawals []models.WithdrawalRequest
	h.db.Where("status = ?", "pending").Order("created_at ASC").Find(&withdrawals)
	c.JSON(http.StatusOK, gin.H{"withdrawals": withdrawals, "count": len(withdrawals)})
}

// PATCH /admin/withdrawals/:id — marcar retiro como procesado
func (h *Handler) AdminProcessWithdrawal(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	now := time.Now()
	result := h.db.Model(&models.WithdrawalRequest{}).Where("id = ?", id).
		Updates(map[string]interface{}{"status": "completed", "processed_at": now})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "withdrawal not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "withdrawal processed", "id": id})
}

// ─── Admin: crear usuario admin (solo en mock mode) ───────────────────────────

// POST /admin/seed-admin — crea un usuario admin para pruebas (solo MOCK_MODE)
func (h *Handler) SeedAdmin(c *gin.Context) {
	if !h.mockMode {
		c.JSON(http.StatusForbidden, gin.H{"error": "only available in mock mode"})
		return
	}
	var existing models.User
	if h.db.Where("role = ?", "admin").First(&existing).Error == nil {
		// Ya existe, devolver token
		token, _ := h.makeToken(existing)
		c.JSON(http.StatusOK, gin.H{"message": "admin already exists", "token": token, "email": existing.Email})
		return
	}
	hashed, _ := hashPassword("admin123")
	admin := models.User{
		Name:       "Admin Mano",
		Email:      "admin@mano.app",
		Password:   hashed,
		Role:       "admin",
		Username:   "admin",
		IsVerified: true,
		Plan:       "free",
	}
	h.db.Create(&admin)
	token, _ := h.makeToken(admin)
	c.JSON(http.StatusCreated, gin.H{"message": "admin created", "token": token, "email": admin.Email})
}

// ─── Delivery: actualizar estado ──────────────────────────────────────────────

type patchDeliveryRequest struct {
	Status string `json:"status" binding:"required,oneof=scheduled picked_up in_transit delivered failed"`
}

// PATCH /deliveries/:id/status — negocio o courier actualiza el estado de entrega
func (h *Handler) UpdateDeliveryStatus(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	deliveryID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid delivery id"})
		return
	}

	var req patchDeliveryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var delivery models.Delivery
	if err := h.db.First(&delivery, deliveryID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "delivery not found"})
		return
	}

	// Verificar que quien actualiza es el dueño del negocio de la orden
	var order models.Order
	h.db.First(&order, delivery.OrderID)
	var biz models.Business
	h.db.First(&biz, order.BusinessID)
	if biz.OwnerID != claims.UserID && claims.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the business owner can update delivery status"})
		return
	}

	now := time.Now()
	delivery.Status = req.Status
	if req.Status == "picked_up" {
		delivery.PickedUpAt = &now
	}
	if req.Status == "delivered" {
		delivery.DeliveredAt = &now
		// Actualizar estado de la orden
		h.db.Model(&order).Update("status", "delivered")
	}
	h.db.Save(&delivery)

	c.JSON(http.StatusOK, gin.H{"delivery": delivery, "order_status": order.Status})
}

// GET /deliveries/:id — ver estado de entrega (público para el comprador con su order_id)
func (h *Handler) GetDelivery(c *gin.Context) {
	deliveryID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid delivery id"})
		return
	}
	var delivery models.Delivery
	if err := h.db.First(&delivery, deliveryID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "delivery not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"delivery": delivery})
}

// ─── Feed: stories filtradas + boost publicidad ───────────────────────────────

// GetFeedV2 reemplaza GetFeed: filtra stories expiradas y ordena ads pagados primero
func (h *Handler) GetFeedV2(c *gin.Context) {
	// Stories no expiradas
	var stories []models.Story
	h.db.Where("expires_at > ? OR expires_at IS NULL", time.Now()).
		Order("created_at DESC").Find(&stories)

	// Anuncios activos — ordenados en memoria por prioridad de paquete
	var ads []models.Advertisement
	h.db.Where("active = ?", true).Order("created_at DESC").Find(&ads)

	// Ordenar en memoria por prioridad de paquete
	priority := map[string]int{"Paquete destacado": 1, "Paquete premium": 2, "Paquete básico": 3}
	for i := 0; i < len(ads)-1; i++ {
		for j := i + 1; j < len(ads); j++ {
			pi := priority[ads[i].PackageType]
			pj := priority[ads[j].PackageType]
			if pi == 0 {
				pi = 99
			}
			if pj == 0 {
				pj = 99
			}
			if pj < pi {
				ads[i], ads[j] = ads[j], ads[i]
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"stories": stories, "advertisements": ads})
}

// ListStoriesV2 filtra stories expiradas
func (h *Handler) ListStoriesV2(c *gin.Context) {
	var stories []models.Story
	h.db.Where("expires_at > ? OR expires_at IS NULL", time.Now()).
		Order("created_at DESC").Find(&stories)
	c.JSON(http.StatusOK, gin.H{"stories": stories})
}

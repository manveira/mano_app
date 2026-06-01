package handlers

// handlers_mock.go — Endpoints de simulación para desarrollo y pruebas.
// Solo activos cuando MOCK_MODE=true.
// NUNCA deben llegar a producción con datos reales.

import (
	"fmt"
	"net/http"
	"time"

	"mano-app/backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// MockGuard rechaza la petición si no estamos en modo mock.
func (h *Handler) MockGuard(c *gin.Context) {
	if !h.mockMode {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error": "mock endpoints are disabled in production (set MOCK_MODE=true to enable)",
		})
		return
	}
	c.Next()
}

// ─── Mock: Wompi ──────────────────────────────────────────────────────────────

// MockWompiApprove simula que Wompi aprobó el pago de una orden.
// Equivale a recibir el webhook "transaction.updated" con status APPROVED.
//
// POST /api/mock/wompi/approve
// Body: { "order_id": 1 }
func (h *Handler) MockWompiApprove(c *gin.Context) {
	var req struct {
		OrderID uint `json:"order_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var order models.Order
	if err := h.db.Preload("OrderItems").First(&order, req.OrderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	if order.PaymentStatus == "paid" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order already paid"})
		return
	}

	mockTxID := fmt.Sprintf("MOCK-TX-%d-%d", order.ID, time.Now().Unix())

	// Crear WompiTransaction simulada
	wompiTx := models.WompiTransaction{
		ID:            mockTxID,
		OrderID:       &order.ID,
		UserID:        func() uint { if order.CustomerID != nil { return *order.CustomerID }; return 0 }(),
		Amount:        int64(order.TotalAmount * 100),
		Currency:      "COP",
		Status:        "APPROVED",
		PaymentMethod: "MOCK_NEQUI",
		Reference:     mockTxID,
	}
	h.db.Create(&wompiTx)

	// Actualizar orden
	autoConfirm := time.Now().Add(24 * time.Hour)
	order.PaymentStatus = "paid"
	order.Status = "paid"
	order.EscrowStatus = "held"
	order.WompiTransactionID = mockTxID
	order.AutoConfirmAt = &autoConfirm
	h.db.Save(&order)

	// Crear CommissionSplits
	if err := h.createCommissionSplits(&order); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create splits: " + err.Error()})
		return
	}

	// Recargar splits para mostrarlos
	var splits []models.CommissionSplit
	h.db.Where("order_id = ?", order.ID).Find(&splits)

	c.JSON(http.StatusOK, gin.H{
		"message":          "✅ Pago simulado aprobado",
		"order_id":         order.ID,
		"escrow_status":    "held",
		"wompi_tx_id":      mockTxID,
		"commission_splits": splits,
	})
}

// MockWompiDecline simula que Wompi rechazó el pago.
//
// POST /api/mock/wompi/decline
// Body: { "order_id": 1 }
func (h *Handler) MockWompiDecline(c *gin.Context) {
	var req struct {
		OrderID uint `json:"order_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.db.Model(&models.Order{}).Where("id = ?", req.OrderID).
		Updates(map[string]interface{}{
			"payment_status": "failed",
			"status":         "payment_failed",
		})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "❌ Pago simulado rechazado",
		"order_id": req.OrderID,
		"status":   "payment_failed",
	})
}

// MockReleaseEscrow simula que el comprador confirmó la recepción del producto.
// Libera el escrow y distribuye el dinero.
//
// POST /api/mock/escrow/release
// Body: { "order_id": 1 }
func (h *Handler) MockReleaseEscrow(c *gin.Context) {
	var req struct {
		OrderID uint `json:"order_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var order models.Order
	if err := h.db.First(&order, req.OrderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	if order.EscrowStatus != "held" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":         "order is not in escrow",
			"escrow_status": order.EscrowStatus,
		})
		return
	}
	if order.Status == "disputed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order is under dispute"})
		return
	}

	if err := h.releaseEscrow(&order); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Recargar splits liberados
	var splits []models.CommissionSplit
	h.db.Where("order_id = ?", order.ID).Find(&splits)

	// Saldo actualizado del comisionista (si aplica)
	var freelancerBalance *float64
	if order.FreelancerID != nil {
		var user models.User
		h.db.Select("earnings_balance").First(&user, *order.FreelancerID)
		freelancerBalance = &user.EarningsBalance
	}

	c.JSON(http.StatusOK, gin.H{
		"message":            "✅ Escrow liberado — dinero distribuido",
		"order_id":           order.ID,
		"escrow_status":      "released",
		"commission_splits":  splits,
		"freelancer_balance": freelancerBalance,
	})
}

// MockAutoConfirm simula el auto-confirm de 24h (sin esperar).
// Libera todas las órdenes en escrow cuyo auto_confirm_at ya pasó O las fuerza.
//
// POST /api/mock/escrow/auto-confirm
// Body: { "order_id": 1 }  — o vacío para procesar todas las vencidas
func (h *Handler) MockAutoConfirm(c *gin.Context) {
	var req struct {
		OrderID *uint `json:"order_id"` // opcional
	}
	c.ShouldBindJSON(&req)

	query := h.db.Where("escrow_status = ? AND status != ?", "held", "disputed")
	if req.OrderID != nil {
		query = query.Where("id = ?", *req.OrderID)
	} else {
		query = query.Where("auto_confirm_at <= ?", time.Now())
	}

	var orders []models.Order
	query.Find(&orders)

	if len(orders) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "No hay órdenes pendientes de auto-confirm", "processed": 0})
		return
	}

	released := 0
	for i := range orders {
		if err := h.releaseEscrow(&orders[i]); err == nil {
			released++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   fmt.Sprintf("✅ %d orden(es) auto-confirmadas", released),
		"processed": released,
	})
}

// ─── Mock: Anti-fraude ────────────────────────────────────────────────────────

// MockFraudCheck simula el chequeo anti-fraude de una orden.
// Verifica si el comprador y el comisionista tienen la misma cédula.
//
// POST /api/mock/fraud/check
// Body: { "order_id": 1 }
func (h *Handler) MockFraudCheck(c *gin.Context) {
	var req struct {
		OrderID uint `json:"order_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var order models.Order
	if err := h.db.First(&order, req.OrderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}

	result := gin.H{
		"order_id":         order.ID,
		"buyer_document":   order.BuyerDocumentID,
		"has_referral":     order.FreelancerID != nil,
		"fraud_detected":   false,
		"commission_valid": true,
		"checks":           []string{},
	}

	checks := []string{}

	if order.FreelancerID != nil {
		var freelancer models.User
		h.db.Select("document_id, name, email").First(&freelancer, *order.FreelancerID)

		checks = append(checks, fmt.Sprintf("Comisionista: %s (%s)", freelancer.Name, freelancer.DocumentID))
		checks = append(checks, fmt.Sprintf("Comprador cédula: %s", order.BuyerDocumentID))

		if order.BuyerDocumentID != "" && order.BuyerDocumentID == freelancer.DocumentID {
			result["fraud_detected"] = true
			result["commission_valid"] = false
			result["fraud_reason"] = "⚠️ El comisionista y el comprador tienen la misma cédula — comisión anulada"
			checks = append(checks, "❌ FRAUDE DETECTADO: misma cédula")
		} else {
			checks = append(checks, "✅ Cédulas distintas — comisión válida")
		}
	} else {
		checks = append(checks, "ℹ️ Venta directa sin comisionista")
	}

	result["checks"] = checks
	c.JSON(http.StatusOK, result)
}

// ─── Mock: Flujo completo ─────────────────────────────────────────────────────

// MockFullFlow simula el flujo completo de una venta en un solo request:
// crear orden → pago aprobado → escrow → liberar.
// Útil para probar la distribución de dinero de punta a punta.
//
// POST /api/mock/flow/full-sale
// Body: { "product_id": 1, "quantity": 1, "referral_slug": "hamaca-casa-narino-maria-x7k2" }
// Requiere auth (customer)
func (h *Handler) MockFullFlow(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req struct {
		ProductID    uint   `json:"product_id" binding:"required"`
		Quantity     int    `json:"quantity" binding:"required,gt=0"`
		ReferralSlug string `json:"referral_slug"` // opcional
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1. Cargar producto
	var product models.Product
	if err := h.db.First(&product, req.ProductID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
		return
	}
	if product.Stock < req.Quantity {
		c.JSON(http.StatusBadRequest, gin.H{"error": "insufficient stock"})
		return
	}

	// 2. Resolver referral link (si viene)
	var referralLink *models.ReferralLink
	var freelancerID *uint
	var freelancerCommission float64

	if req.ReferralSlug != "" {
		var rl models.ReferralLink
		if h.db.Where("slug = ? AND is_active = true", req.ReferralSlug).First(&rl).Error == nil {
			referralLink = &rl
			freelancerID = &rl.FreelancerID

			// Anti-fraude: comisionista no puede comprarse a sí mismo
			var buyer models.User
			h.db.Select("document_id").First(&buyer, claims.UserID)
			var freelancer models.User
			h.db.Select("document_id").First(&freelancer, rl.FreelancerID)

			if buyer.DocumentID != "" && buyer.DocumentID == freelancer.DocumentID {
				// Venta válida pero sin comisión
				freelancerID = nil
				referralLink = nil
			} else {
				freelancerCommission = product.Price * float64(req.Quantity) * product.CommissionRate
			}
		}
	}

	// 3. Crear orden
	total := product.Price * float64(req.Quantity)
	var rlID *uint
	if referralLink != nil {
		rlID = &referralLink.ID
	}

	var buyer models.User
	h.db.Select("document_id").First(&buyer, claims.UserID)

	order := models.Order{
		BusinessID:           product.BusinessID,
		CustomerID:           &claims.UserID,
		BuyerDocumentID:      buyer.DocumentID,
		FreelancerID:         freelancerID,
		ReferralLinkID:       rlID,
		TotalAmount:          total,
		Commission:           total * platformCommissionRate,
		FreelancerCommission: freelancerCommission,
		Status:               "pending_payment",
		PaymentStatus:        "pending",
		EscrowStatus:         "pending",
		OrderItems: []models.OrderItem{
			{ProductID: product.ID, Quantity: req.Quantity, UnitPrice: product.Price},
		},
	}
	if err := h.db.Create(&order).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create order"})
		return
	}

	// Descontar stock
	h.db.Model(&models.Product{}).Where("id = ?", product.ID).
		UpdateColumn("stock", gorm.Expr("stock - ?", req.Quantity))

	// 4. Simular pago aprobado
	mockTxID := fmt.Sprintf("MOCK-TX-%d-%d", order.ID, time.Now().Unix())
	wompiTx := models.WompiTransaction{
		ID: mockTxID, OrderID: &order.ID, UserID: claims.UserID,
		Amount: int64(total * 100), Currency: "COP",
		Status: "APPROVED", PaymentMethod: "MOCK_NEQUI", Reference: mockTxID,
	}
	h.db.Create(&wompiTx)

	autoConfirm := time.Now().Add(24 * time.Hour)
	order.PaymentStatus = "paid"
	order.Status = "paid"
	order.EscrowStatus = "held"
	order.WompiTransactionID = mockTxID
	order.AutoConfirmAt = &autoConfirm
	h.db.Save(&order)
	h.createCommissionSplits(&order)

	// 5. Liberar escrow (simular confirmación del comprador)
	h.releaseEscrow(&order)

	// 6. Recargar todo para mostrar resultado
	var splits []models.CommissionSplit
	h.db.Where("order_id = ?", order.ID).Find(&splits)

	var freelancerBalance *float64
	if order.FreelancerID != nil {
		var u models.User
		h.db.Select("earnings_balance").First(&u, *order.FreelancerID)
		freelancerBalance = &u.EarningsBalance
	}

	fraudNote := ""
	if req.ReferralSlug != "" && freelancerID == nil {
		fraudNote = "⚠️ Anti-fraude: comisión anulada (comprador = comisionista)"
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "✅ Flujo completo simulado",
		"order": gin.H{
			"id":            order.ID,
			"total":         total,
			"escrow_status": "released",
			"status":        "delivered",
		},
		"distribution": gin.H{
			"total":              total,
			"platform_4pct":      order.Commission,
			"freelancer":         freelancerCommission,
			"business":           total - order.Commission - freelancerCommission,
		},
		"commission_splits":  splits,
		"freelancer_balance": freelancerBalance,
		"fraud_note":         fraudNote,
	})
}

// ─── Mock: Estado del sistema ─────────────────────────────────────────────────

// MockSystemStatus devuelve un resumen del estado actual de la BD para debugging.
//
// GET /api/mock/status
func (h *Handler) MockSystemStatus(c *gin.Context) {
	var counts struct {
		Users         int64 `json:"users"`
		Businesses    int64 `json:"businesses"`
		Products      int64 `json:"products"`
		Orders        int64 `json:"orders"`
		OrdersHeld    int64 `json:"orders_held"`
		ReferralLinks int64 `json:"referral_links"`
		Splits        int64 `json:"splits"`
		SplitsPending int64 `json:"splits_pending"`
	}

	h.db.Model(&models.User{}).Count(&counts.Users)
	h.db.Model(&models.Business{}).Count(&counts.Businesses)
	h.db.Model(&models.Product{}).Count(&counts.Products)
	h.db.Model(&models.Order{}).Count(&counts.Orders)
	h.db.Model(&models.Order{}).Where("escrow_status = ?", "held").Count(&counts.OrdersHeld)
	h.db.Model(&models.ReferralLink{}).Count(&counts.ReferralLinks)
	h.db.Model(&models.CommissionSplit{}).Count(&counts.Splits)
	h.db.Model(&models.CommissionSplit{}).Where("status = ?", "pending").Count(&counts.SplitsPending)

	// Saldos de comisionistas
	type freelancerBalance struct {
		Name            string  `json:"name"`
		Email           string  `json:"email"`
		EarningsBalance float64 `json:"earnings_balance"`
	}
	var balances []freelancerBalance
	h.db.Model(&models.User{}).
		Select("name, email, earnings_balance").
		Where("role = ? AND earnings_balance > 0", "freelancer").
		Scan(&balances)

	// Órdenes en escrow
	var heldOrders []models.Order
	h.db.Where("escrow_status = ?", "held").Find(&heldOrders)

	c.JSON(http.StatusOK, gin.H{
		"mock_mode": true,
		"counts":    counts,
		"freelancer_balances": balances,
		"held_orders": heldOrders,
	})
}

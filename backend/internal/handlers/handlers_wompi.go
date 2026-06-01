package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"mano-app/backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const platformCommissionRate = 0.04 // 4% fijo

// ─── Wompi: iniciar pago ──────────────────────────────────────────────────────

type initiateWompiRequest struct {
	OrderID     uint   `json:"order_id" binding:"required"`
	RedirectURL string `json:"redirect_url"`
}

// InitiateWompiPaymentGuest — igual que InitiateWompiPayment pero para órdenes guest (sin JWT).
// POST /api/payments/wompi/guest
func (h *Handler) InitiateWompiPaymentGuest(c *gin.Context) {
	var req initiateWompiRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var order models.Order
	if err := h.db.First(&order, req.OrderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	if order.CustomerID != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "use /payments/wompi/initiate for registered users"})
		return
	}
	if order.PaymentStatus == "paid" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order already paid"})
		return
	}
	h.generateWompiCheckout(c, &order, 0)
}

// InitiateWompiPayment genera la URL de pago de Wompi para una orden.
func (h *Handler) InitiateWompiPayment(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var req initiateWompiRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var order models.Order
	if err := h.db.First(&order, req.OrderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	if order.CustomerID == nil || *order.CustomerID != claims.UserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "not your order"})
		return
	}
	if order.PaymentStatus == "paid" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order already paid"})
		return
	}
	h.generateWompiCheckout(c, &order, claims.UserID)
}

func (h *Handler) generateWompiCheckout(c *gin.Context, order *models.Order, userID uint) {
	reference := fmt.Sprintf("MANO-%d-%d", order.ID, time.Now().Unix())
	amountCents := int64(order.TotalAmount * 100)

	integritySecret := os.Getenv("WOMPI_INTEGRITY_SECRET")
	sigData := fmt.Sprintf("%s%dCOP%s", reference, amountCents, integritySecret)
	h256 := hmac.New(sha256.New, []byte(integritySecret))
	h256.Write([]byte(sigData))
	signature := hex.EncodeToString(h256.Sum(nil))

	redirectURL := os.Getenv("APP_BASE_URL") + "/orders"

	wompiTx := models.WompiTransaction{
		ID: reference, OrderID: &order.ID, UserID: userID,
		Amount: amountCents, Currency: "COP", Status: "PENDING",
		Reference: reference, RedirectURL: redirectURL,
	}
	if err := h.db.Create(&wompiTx).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register transaction"})
		return
	}
	h.db.Model(order).Update("wompi_transaction_id", reference)

	publicKey := os.Getenv("WOMPI_PUBLIC_KEY")
	c.JSON(http.StatusOK, gin.H{
		"reference":    reference,
		"amount":       amountCents,
		"currency":     "COP",
		"signature":    signature,
		"public_key":   publicKey,
		"redirect_url": redirectURL,
		"checkout_url": fmt.Sprintf(
			"https://checkout.wompi.co/p/?public-key=%s&currency=COP&amount-in-cents=%d&reference=%s&signature:integrity=%s&redirect-url=%s",
			publicKey, amountCents, reference, signature, redirectURL,
		),
	})
}

// ─── Wompi: webhook ───────────────────────────────────────────────────────────

type wompiWebhookPayload struct {
	Event string `json:"event"`
	Data  struct {
		Transaction struct {
			ID             string `json:"id"`
			Reference      string `json:"reference"`
			Status         string `json:"status"`
			AmountInCents  int64  `json:"amount_in_cents"`
			PaymentMethod  struct {
				Type string `json:"type"`
			} `json:"payment_method"`
		} `json:"transaction"`
	} `json:"data"`
	Signature struct {
		Properties []string `json:"properties"`
		Checksum   string   `json:"checksum"`
	} `json:"signature"`
}

// WompiWebhook procesa eventos de Wompi (pago aprobado, rechazado, etc.)
func (h *Handler) WompiWebhook(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot read body"})
		return
	}

	var payload wompiWebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	// Verificar firma del evento
	eventsSecret := os.Getenv("WOMPI_EVENTS_SECRET")
	if eventsSecret != "" {
		if !verifyWompiSignature(payload, eventsSecret) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
			return
		}
	}

	tx := payload.Data.Transaction
	switch payload.Event {
	case "transaction.updated":
		switch tx.Status {
		case "APPROVED":
			if err := h.handleWompiApproved(tx.Reference, tx.ID, tx.PaymentMethod.Type); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		case "DECLINED", "VOIDED", "ERROR":
			h.handleWompiDeclined(tx.Reference, tx.Status)
		}
	}

	c.Status(http.StatusOK)
}

func (h *Handler) handleWompiApproved(reference, wompiID, paymentMethod string) error {
	// Actualizar WompiTransaction
	var wompiTx models.WompiTransaction
	if err := h.db.Where("reference = ?", reference).First(&wompiTx).Error; err != nil {
		return err
	}
	wompiTx.ID = wompiID
	wompiTx.Status = "APPROVED"
	wompiTx.PaymentMethod = paymentMethod
	h.db.Save(&wompiTx)

	if wompiTx.OrderID == nil {
		return nil
	}

	// Actualizar orden
	var order models.Order
	if err := h.db.First(&order, *wompiTx.OrderID).Error; err != nil {
		return err
	}

	order.PaymentStatus = "paid"
	order.Status = "paid"
	order.EscrowStatus = "held"
	order.WompiTransactionID = wompiID

	// Calcular auto-confirm: 24h desde ahora
	autoConfirm := time.Now().Add(24 * time.Hour)
	order.AutoConfirmAt = &autoConfirm

	if err := h.db.Save(&order).Error; err != nil {
		return err
	}

	// Crear CommissionSplits
	return h.createCommissionSplits(&order)
}

func (h *Handler) handleWompiDeclined(reference, status string) {
	var wompiTx models.WompiTransaction
	if h.db.Where("reference = ?", reference).First(&wompiTx).Error != nil {
		return
	}
	wompiTx.Status = status
	h.db.Save(&wompiTx)

	if wompiTx.OrderID != nil {
		h.db.Model(&models.Order{}).Where("id = ?", *wompiTx.OrderID).
			Updates(map[string]interface{}{
				"payment_status": "failed",
				"status":         "payment_failed",
			})
	}
}

// createCommissionSplits calcula y registra cómo se distribuye el dinero de una orden.
func (h *Handler) createCommissionSplits(order *models.Order) error {
	// Eliminar splits previos si existen (idempotente)
	h.db.Where("order_id = ?", order.ID).Delete(&models.CommissionSplit{})

	total := order.TotalAmount
	platformAmount := total * platformCommissionRate
	freelancerAmount := order.FreelancerCommission
	businessAmount := total - platformAmount - freelancerAmount

	splits := []models.CommissionSplit{
		{
			OrderID:       order.ID,
			RecipientType: "platform",
			RecipientID:   nil,
			Amount:        platformAmount,
			Percentage:    platformCommissionRate * 100,
			Status:        "pending",
		},
		{
			OrderID:       order.ID,
			RecipientType: "business",
			RecipientID:   &order.BusinessID,
			Amount:        businessAmount,
			Percentage:    (businessAmount / total) * 100,
			Status:        "pending",
		},
	}

	if order.FreelancerID != nil && freelancerAmount > 0 {
		splits = append(splits, models.CommissionSplit{
			OrderID:       order.ID,
			RecipientType: "freelancer",
			RecipientID:   order.FreelancerID,
			Amount:        freelancerAmount,
			Percentage:    (freelancerAmount / total) * 100,
			Status:        "pending",
		})
	}

	for _, s := range splits {
		if err := h.db.Create(&s).Error; err != nil {
			return err
		}
	}
	return nil
}

// ─── Confirmar recepción (comprador) ─────────────────────────────────────────

// ConfirmOrderReceived — el comprador confirma que recibió el producto.
// Esto libera el escrow y distribuye el dinero.
func (h *Handler) ConfirmOrderReceived(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	orderID, err := parseID(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid order id"})
		return
	}

	var order models.Order
	if err := h.db.First(&order, orderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	if (order.CustomerID == nil || *order.CustomerID != claims.UserID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not your order"})
		return
	}
	if order.EscrowStatus != "held" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order is not in escrow"})
		return
	}
	if order.Status == "disputed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order is under dispute, cannot confirm"})
		return
	}

	if err := h.releaseEscrow(&order); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to release escrow"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "order confirmed, payment released"})
}

// releaseEscrow distribuye el dinero a todos los recipientes.
func (h *Handler) releaseEscrow(order *models.Order) error {
	now := time.Now()
	order.EscrowStatus = "released"
	order.Status = "delivered"
	order.ConfirmedAt = &now

	if err := h.db.Save(order).Error; err != nil {
		return err
	}

	// Liberar splits
	var splits []models.CommissionSplit
	h.db.Where("order_id = ? AND status = ?", order.ID, "pending").Find(&splits)

	for _, split := range splits {
		split.Status = "released"
		split.ReleasedAt = &now
		h.db.Save(&split)

		// Acreditar saldo al comisionista
		if split.RecipientType == "freelancer" && split.RecipientID != nil {
			h.db.Model(&models.User{}).Where("id = ?", *split.RecipientID).
				UpdateColumn("earnings_balance", gorm.Expr("earnings_balance + ?", split.Amount))

			// Bono de $5.000 al referidor si esta es la primera venta del comisionista
			var salesCount int64
			h.db.Model(&models.Order{}).Where("freelancer_id = ? AND escrow_status = 'released'", *split.RecipientID).Count(&salesCount)
			if salesCount == 1 { // primera venta
				var freelancer models.User
				h.db.Select("referred_by").First(&freelancer, *split.RecipientID)
				if freelancer.ReferredBy != nil {
					h.db.Model(&models.User{}).Where("id = ?", *freelancer.ReferredBy).
						UpdateColumn("earnings_balance", gorm.Expr("earnings_balance + 5000"))
				}
			}

			// Marcar conversión en el referral link
			if order.ReferralLinkID != nil {
				h.db.Model(&models.ReferralLink{}).Where("id = ?", *order.ReferralLinkID).
					UpdateColumn("conversions", gorm.Expr("conversions + 1"))
			}
		}
	}

	return nil
}

// verifyWompiSignature verifica la firma HMAC-SHA256 del evento de Wompi.
// Wompi firma: SHA256(prop1_value + prop2_value + ... + timestamp + events_secret)
// Las propiedades a concatenar vienen en payload.Signature.Properties.
func verifyWompiSignature(payload wompiWebhookPayload, secret string) bool {
	if payload.Signature.Checksum == "" {
		return false
	}

	// Extraer valores de las propiedades indicadas por Wompi
	// Formato: "transaction.id", "transaction.status", "transaction.amount_in_cents", etc.
	tx := payload.Data.Transaction
	propValues := map[string]string{
		"transaction.id":              tx.ID,
		"transaction.status":          tx.Status,
		"transaction.amount_in_cents": strconv.FormatInt(tx.AmountInCents, 10),
		"transaction.reference":       tx.Reference,
	}

	var concat strings.Builder
	for _, prop := range payload.Signature.Properties {
		if val, ok := propValues[prop]; ok {
			concat.WriteString(val)
		}
	}
	concat.WriteString(secret)

	h := sha256.New()
	h.Write([]byte(concat.String()))
	expected := hex.EncodeToString(h.Sum(nil))

	return hmac.Equal([]byte(expected), []byte(payload.Signature.Checksum))
}

// ─── Referidos ────────────────────────────────────────────────────────────────

type affiliateRequest struct {
	ProductID uint `json:"product_id" binding:"required"`
}

// AffiliateToProduct — el comisionista se afilia a un producto y recibe su link único.
func (h *Handler) AffiliateToProduct(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "freelancer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only freelancers can affiliate to products"})
		return
	}

	var req affiliateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var product models.Product
	if err := h.db.First(&product, req.ProductID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
		return
	}
	if !product.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "product is not active"})
		return
	}

	// Verificar plan Pro para productos exclusivos
	if product.IsExclusive {
		var user models.User
		h.db.Select("plan, plan_expires_at").First(&user, claims.UserID)
		isPro := user.Plan == "pro" && (user.PlanExpiresAt == nil || user.PlanExpiresAt.After(time.Now()))
		if !isPro {
			c.JSON(http.StatusForbidden, gin.H{"error": "this product requires a Pro plan"})
			return
		}
	}

	// Verificar si ya existe un link activo para este comisionista × producto
	var existing models.ReferralLink
	if h.db.Where("freelancer_id = ? AND product_id = ? AND is_active = true", claims.UserID, req.ProductID).
		First(&existing).Error == nil {
		c.JSON(http.StatusOK, gin.H{"referral_link": existing, "message": "already affiliated"})
		return
	}

	// Generar slug único
	slug := generateSlug(product.Name, claims.UserID)

	link := models.ReferralLink{
		FreelancerID: claims.UserID,
		ProductID:    req.ProductID,
		BusinessID:   product.BusinessID,
		Slug:         slug,
		IsActive:     true,
	}

	if err := h.db.Create(&link).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create referral link"})
		return
	}

	baseURL := os.Getenv("APP_BASE_URL")
	if baseURL == "" {
		baseURL = "https://mano.app"
	}

	c.JSON(http.StatusCreated, gin.H{
		"referral_link": link,
		"url":           baseURL + "/r/" + slug,
	})
}

// TrackReferralClick — registra un click en un link de referido.
func (h *Handler) TrackReferralClick(c *gin.Context) {
	slug := c.Param("slug")

	var link models.ReferralLink
	if err := h.db.Where("slug = ?", slug).First(&link).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "link not found"})
		return
	}
	if !link.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "product is no longer available"})
		return
	}

	// Cargar producto para verificar que sigue activo
	var product models.Product
	h.db.First(&product, link.ProductID)
	if !product.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "product is no longer available"})
		return
	}

	// Registrar click
	click := models.ReferralClick{
		ReferralLinkID: link.ID,
		IPAddress:      c.ClientIP(),
		UserAgent:      c.GetHeader("User-Agent"),
	}
	h.db.Create(&click)

	// Incrementar contador
	h.db.Model(&link).UpdateColumn("clicks", gorm.Expr("clicks + 1"))

	c.JSON(http.StatusOK, gin.H{
		"product":          product,
		"referral_link_id": link.ID,
		"business_id":      link.BusinessID,
	})
}

// MyReferralCode — devuelve el código de referido del comisionista para compartir.
// GET /sell/referral-code
func (h *Handler) MyReferralCode(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var user models.User
	h.db.Select("referral_code, earnings_balance").First(&user, claims.UserID)

	var referredCount int64
	h.db.Model(&models.User{}).Where("referred_by = ?", claims.UserID).Count(&referredCount)

	baseURL := os.Getenv("APP_BASE_URL")
	if baseURL == "" {
		baseURL = "https://mano.app"
	}
	c.JSON(http.StatusOK, gin.H{
		"referral_code":  user.ReferralCode,
		"referral_url":   baseURL + "/signup?ref=" + user.ReferralCode,
		"referred_count": referredCount,
		"bonus_per_referral": 5000,
	})
}

// MyReferralLinks — lista los links del comisionista autenticado con sus stats.
func (h *Handler) MyReferralLinks(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "freelancer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only freelancers can view their links"})
		return
	}

	var links []models.ReferralLink
	h.db.Preload("Product").Where("freelancer_id = ? AND is_active = true", claims.UserID).Find(&links)

	baseURL := os.Getenv("APP_BASE_URL")
	if baseURL == "" {
		baseURL = "https://mano.app"
	}

	type linkWithURL struct {
		models.ReferralLink
		URL string `json:"url"`
	}

	result := make([]linkWithURL, len(links))
	for i, l := range links {
		result[i] = linkWithURL{ReferralLink: l, URL: baseURL + "/r/" + l.Slug}
	}

	// Saldo acumulado del comisionista
	var user models.User
	h.db.Select("earnings_balance").First(&user, claims.UserID)

	c.JSON(http.StatusOK, gin.H{
		"links":           result,
		"earnings_balance": user.EarningsBalance,
	})
}

// ─── Retiro de ganancias ──────────────────────────────────────────────────────

type withdrawalRequest struct {
	Amount      float64 `json:"amount" binding:"required,gt=0"`
	NequiNumber string  `json:"nequi_number" binding:"required"`
}

// RequestWithdrawal — el comisionista solicita retirar su saldo a Nequi.
func (h *Handler) RequestWithdrawal(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "freelancer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only freelancers can request withdrawals"})
		return
	}

	var req withdrawalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verificar saldo suficiente
	var user models.User
	h.db.First(&user, claims.UserID)
	if user.EarningsBalance < req.Amount {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "insufficient balance",
			"balance": user.EarningsBalance,
		})
		return
	}

	// Monto mínimo de retiro: $5.000 COP
	if req.Amount < 5000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "minimum withdrawal is $5.000 COP"})
		return
	}

	// Descontar saldo y crear solicitud
	h.db.Model(&user).UpdateColumn("earnings_balance", gorm.Expr("earnings_balance - ?", req.Amount))

	withdrawal := models.WithdrawalRequest{
		FreelancerID: claims.UserID,
		Amount:       req.Amount,
		NequiNumber:  req.NequiNumber,
		Status:       "pending",
	}
	if err := h.db.Create(&withdrawal).Error; err != nil {
		// Revertir descuento si falla
		h.db.Model(&user).UpdateColumn("earnings_balance", gorm.Expr("earnings_balance + ?", req.Amount))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create withdrawal request"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"withdrawal":      withdrawal,
		"remaining_balance": user.EarningsBalance - req.Amount,
		"message":         "Withdrawal request created. Processing in 1-2 business days.",
	})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// FreelancerStorefront — vitrina pública del comisionista.
// GET /api/vendedor/:username
// Devuelve el perfil público y todos sus productos activos con sus slugs.
func (h *Handler) FreelancerStorefront(c *gin.Context) {
	username := c.Param("username")

	var user models.User
	if err := h.db.Where("username = ? AND role = ?", username, "freelancer").
		Select("id, name, username").First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "freelancer not found"})
		return
	}

	var links []models.ReferralLink
	h.db.Preload("Product").Where("freelancer_id = ? AND is_active = true", user.ID).Find(&links)

	baseURL := os.Getenv("APP_BASE_URL")
	if baseURL == "" {
		baseURL = "https://mano.app"
	}

	type productEntry struct {
		ID             uint    `json:"id"`
		Name           string  `json:"name"`
		Description    string  `json:"description"`
		Price          float64 `json:"price"`
		ImageURL       string  `json:"image_url"`
		CommissionRate float64 `json:"commission_rate"`
		ReferralSlug   string  `json:"referral_slug"`
		ReferralURL    string  `json:"referral_url"`
	}

	products := make([]productEntry, 0, len(links))
	for _, l := range links {
		if l.Product.ID == 0 || !l.Product.IsActive {
			continue
		}
		products = append(products, productEntry{
			ID:             l.Product.ID,
			Name:           l.Product.Name,
			Description:    l.Product.Description,
			Price:          l.Product.Price,
			ImageURL:       l.Product.ImageURL,
			CommissionRate: l.Product.CommissionRate,
			ReferralSlug:   l.Slug,
			ReferralURL:    baseURL + "/r/" + l.Slug,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"freelancer": gin.H{"name": user.Name, "username": user.Username},
		"products":   products,
	})
}

func generateSlug(productName string, userID uint) string {
	// Normalizar nombre del producto
	slug := strings.ToLower(productName)
	slug = strings.ReplaceAll(slug, " ", "-")
	// Eliminar caracteres especiales básicos
	var clean strings.Builder
	for _, r := range slug {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			clean.WriteRune(r)
		}
	}
	// Agregar sufijo único: userID + random 4 chars
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	suffix := make([]byte, 4)
	for i := range suffix {
		suffix[i] = chars[rand.Intn(len(chars))]
	}
	return fmt.Sprintf("%s-%d-%s", clean.String(), userID, string(suffix))
}

func parseID(c *gin.Context, param string) (uint64, error) {
	return strconv.ParseUint(c.Param(param), 10, 64)
}

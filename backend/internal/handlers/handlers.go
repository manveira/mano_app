package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"mano-app/backend/internal/models"
	"mano-app/backend/pkg/notifications"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stripe/stripe-go/v74"
	"github.com/stripe/stripe-go/v74/paymentintent"
	"github.com/stripe/stripe-go/v74/webhook"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var allowedRoles = map[string]bool{
	"business_owner": true,
	"freelancer":     true,
	"customer":       true,
}

type Handler struct {
	db               *gorm.DB
	jwtSecret        string
	stripeSecretKey  string
	stripeWebhookKey string
	mockMode         bool
}

type tokenClaims struct {
	UserID uint   `json:"user_id"`
	Role   string `json:"role"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

type signUpRequest struct {
	Name         string `json:"name" binding:"required"`
	Email        string `json:"email" binding:"required,email"`
	Password     string `json:"password" binding:"required,min=8"`
	Role         string `json:"role" binding:"required,oneof=business_owner freelancer customer"`
	Phone        string `json:"phone"`
	DocumentID   string `json:"document_id"`
	NequiNumber  string `json:"nequi_number"`
	Username     string `json:"username"`
	ReferralCode string `json:"referral_code"` // código de quien invitó
}

type signInRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type businessRequest struct {
	Name                  string  `json:"name" binding:"required"`
	Description           string  `json:"description" binding:"required"`
	Category              string  `json:"category" binding:"required"`
	Location              string  `json:"location" binding:"required"`
	Address               string  `json:"address"`
	Latitude              float64 `json:"latitude"`
	Longitude             float64 `json:"longitude"`
	ImageURL              string  `json:"image_url"`
	DefaultCommissionRate float64 `json:"default_commission_rate"`
	MonthlyLimit          int     `json:"monthly_limit"`
}

type productRequest struct {
	BusinessID     uint    `json:"business_id" binding:"required"`
	Name           string  `json:"name" binding:"required"`
	Description    string  `json:"description" binding:"required"`
	Price          float64 `json:"price" binding:"required,gt=0"`
	Stock          int     `json:"stock" binding:"required,gte=0"`
	ImageURL       string  `json:"image_url"`
	CommissionRate float64 `json:"commission_rate"`
	IsExclusive    bool    `json:"is_exclusive"`
}

type orderItemRequest struct {
	ProductID uint `json:"product_id" binding:"required"`
	Quantity  int  `json:"quantity" binding:"required,gt=0"`
}

type createOrderRequest struct {
	BusinessID   uint               `json:"business_id" binding:"required"`
	FreelancerID *uint              `json:"freelancer_id,omitempty"`
	Items        []orderItemRequest `json:"items" binding:"required,dive,required"`
	// Campos guest (sin JWT)
	GuestName  string `json:"guest_name"`
	GuestPhone string `json:"guest_phone"`
}

type storyRequest struct {
	Title    string `json:"title" binding:"required"`
	Content  string `json:"content" binding:"required"`
	MediaURL string `json:"media_url"`
}

type advertisementRequest struct {
	BusinessID  uint   `json:"business_id" binding:"required"`
	Title       string `json:"title" binding:"required"`
	Description string `json:"description" binding:"required"`
	ImageURL    string `json:"image_url"`
	PackageType string `json:"package_type" binding:"required"`
	Active      bool   `json:"active"`
}

type packagePurchaseRequest struct {
	BusinessID uint `json:"business_id" binding:"required"`
	PackageID  uint `json:"package_id" binding:"required"`
}

type paymentMethodRequest struct {
	Provider    string `json:"provider" binding:"required"`
	AccountID   string `json:"account_id" binding:"required"`
	DisplayName string `json:"display_name" binding:"required"`
	Type        string `json:"type" binding:"required"`
}

type deliveryRequest struct {
	OrderID  uint   `json:"order_id" binding:"required"`
	ETA      string `json:"eta" binding:"required"`
	Tracking string `json:"tracking"`
}

func NewHandler(db *gorm.DB, jwtSecret, stripeSecretKey, stripeWebhookKey string, mockMode bool) *Handler {
	stripe.Key = stripeSecretKey
	return &Handler{
		db:               db,
		jwtSecret:        jwtSecret,
		stripeSecretKey:  stripeSecretKey,
		stripeWebhookKey: stripeWebhookKey,
		mockMode:         mockMode,
	}
}

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) SignUp(c *gin.Context) {
	var req signUpRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !allowedRoles[req.Role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}

	hashed, err := hashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	// Validar phone único si se provee
	if req.Phone != "" {
		var existing models.User
		if h.db.Where("phone = ?", req.Phone).First(&existing).Error == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "phone number already registered"})
			return
		}
	}

	// Generar username si no se provee
	username := req.Username
	if username == "" {
		username = strings.ToLower(strings.ReplaceAll(req.Name, " ", ""))
		// Asegurar unicidad agregando sufijo numérico si ya existe
		var count int64
		h.db.Model(&models.User{}).Where("username LIKE ?", username+"%").Count(&count)
		if count > 0 {
			username = fmt.Sprintf("%s%d", username, count)
		}
	}

	// Resolver referral_code si viene
	var referredBy *uint
	if req.ReferralCode != "" {
		var referrer models.User
		if h.db.Where("referral_code = ?", req.ReferralCode).First(&referrer).Error == nil {
			referredBy = &referrer.ID
		}
	}

	user := models.User{
		Name:         req.Name,
		Email:        strings.ToLower(req.Email),
		Password:     hashed,
		Role:         req.Role,
		Phone:        req.Phone,
		DocumentID:   req.DocumentID,
		NequiNumber:  req.NequiNumber,
		Username:     username,
		ReferralCode: generateReferralCode(username),
		ReferredBy:   referredBy,
	}

	if err := h.db.Create(&user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email already registered or invalid data"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": user.ID, "email": user.Email, "role": user.Role, "username": user.Username})
}

func (h *Handler) SignIn(c *gin.Context) {
	var req signInRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := h.db.Where("email = ?", strings.ToLower(req.Email)).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if err := verifyPassword(user.Password, req.Password); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, err := h.makeToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token, "user": gin.H{"id": user.ID, "name": user.Name, "email": user.Email, "role": user.Role}})
}

func (h *Handler) AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization required"})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header"})
			return
		}

		token, err := jwt.ParseWithClaims(parts[1], &tokenClaims{}, func(token *jwt.Token) (interface{}, error) {
			return []byte(h.jwtSecret), nil
		}, jwt.WithValidMethods([]string{"HS256"}))
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		claims, ok := token.Claims.(*tokenClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			return
		}

		c.Set("user_claims", claims)
		c.Next()
	}
}

func (h *Handler) Me(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}

	var user models.User
	h.db.Select("id, name, email, role, username, plan, plan_expires_at, earnings_balance, is_verified").
		First(&user, claims.UserID)

	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (h *Handler) CreateBusiness(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "business_owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only business owners can create businesses"})
		return
	}

	var req businessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	business := models.Business{
		OwnerID:     claims.UserID,
		Name:        req.Name,
		Slug:        generateUniqueSlug(h.db, req.Name),
		Description: req.Description,
		Category:    req.Category,
		Location:    req.Location,
		Address:     req.Address,
		Latitude:    req.Latitude,
		Longitude:   req.Longitude,
		ImageURL:    req.ImageURL,
		DefaultCommissionRate: func() float64 {
			if req.DefaultCommissionRate >= 0.10 && req.DefaultCommissionRate <= 0.40 {
				return req.DefaultCommissionRate
			}
			return 0.15
		}(),
		MonthlyLimit: req.MonthlyLimit,
	}

	if err := h.db.Create(&business).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create business"})
		return
	}

	c.JSON(http.StatusCreated, business)
}

func (h *Handler) ListBusinesses(c *gin.Context) {
	var businesses []models.Business
	query := h.db.Where("is_approved = ?", true)

	if category := c.Query("category"); category != "" {
		query = query.Where("category ILIKE ?", "%"+category+"%")
	}
	if location := c.Query("location"); location != "" {
		query = query.Where("location ILIKE ?", "%"+location+"%")
	}

	if err := query.Find(&businesses).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list businesses"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"businesses": businesses})
}

func (h *Handler) GetBusiness(c *gin.Context) {
	businessID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid business id"})
		return
	}

	var business models.Business
	if err := h.db.Preload("Products").First(&business, businessID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "business not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch business"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"business": business, "products": business.Products})
}

func (h *Handler) CreateProduct(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "business_owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only business owners can create products"})
		return
	}

	var req productRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var business models.Business
	if err := h.db.First(&business, req.BusinessID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "business not found"})
		return
	}
	if business.OwnerID != claims.UserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "you can only add products to your own business"})
		return
	}
	if !business.IsApproved {
		c.JSON(http.StatusForbidden, gin.H{"error": "business is not approved yet"})
		return
	}

	commissionRate := req.CommissionRate
	if commissionRate == 0 {
		commissionRate = business.DefaultCommissionRate
	}
	if commissionRate < 0.10 || commissionRate > 0.40 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "commission_rate must be between 10% and 40%"})
		return
	}

	product := models.Product{
		BusinessID:     req.BusinessID,
		Name:           req.Name,
		Description:    req.Description,
		Price:          req.Price,
		Stock:          req.Stock,
		ImageURL:       req.ImageURL,
		CommissionRate: commissionRate,
		IsActive:       true,
		IsExclusive:    req.IsExclusive,
	}

	if err := h.db.Create(&product).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create product"})
		return
	}

	c.JSON(http.StatusCreated, product)
}

func (h *Handler) ListProducts(c *gin.Context) {
	var products []models.Product
	query := h.db.Model(&models.Product{}).Where("is_active = ?", true)

	// Verificar si el usuario tiene plan Pro para ver exclusivos
	isPro := false
	if authHeader := c.GetHeader("Authorization"); authHeader != "" {
		if claims := h.getClaimsFromHeader(authHeader); claims != nil {
			var user models.User
			h.db.Select("plan, plan_expires_at").First(&user, claims.UserID)
			isPro = user.Plan == "pro" && (user.PlanExpiresAt == nil || user.PlanExpiresAt.After(time.Now()))
		}
	}
	if !isPro {
		query = query.Where("is_exclusive = ?", false)
	}

	if businessID := c.Param("id"); businessID != "" {
		query = query.Where("business_id = ?", businessID)
	}
	if businessID := c.Query("business_id"); businessID != "" {
		query = query.Where("business_id = ?", businessID)
	}

	if err := query.Find(&products).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list products"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"products": products})
}

func (h *Handler) CreateOrder(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var req createOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var buyer models.User
	h.db.Select("document_id").First(&buyer, claims.UserID)
	h.buildAndCreateOrder(c, req, &claims.UserID, buyer.DocumentID, "", "")
}

// CreateGuestOrder — endpoint público para compradores sin cuenta.
// POST /api/orders/guest
func (h *Handler) CreateGuestOrder(c *gin.Context) {
	var req createOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.GuestName == "" || req.GuestPhone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "guest_name and guest_phone are required"})
		return
	}
	h.buildAndCreateOrder(c, req, nil, "", req.GuestName, req.GuestPhone)
}

func (h *Handler) buildAndCreateOrder(c *gin.Context, req createOrderRequest, customerID *uint, buyerDocID, guestName, guestPhone string) {
	var business models.Business
	if err := h.db.First(&business, req.BusinessID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "business not found"})
		return
	}

	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order must include at least one product item"})
		return
	}

	// Validar límite mensual del negocio
	if business.MonthlyLimit > 0 {
		var monthSold int64
		startOfMonth := time.Now().UTC().Truncate(24*time.Hour).AddDate(0, 0, -time.Now().Day()+1)
		h.db.Model(&models.OrderItem{}).
			Joins("JOIN orders ON orders.id = order_items.order_id").
			Where("orders.business_id = ? AND orders.payment_status != 'failed' AND orders.created_at >= ?", req.BusinessID, startOfMonth).
			Select("COALESCE(SUM(order_items.quantity), 0)").Scan(&monthSold)
		totalRequested := int64(0)
		for _, item := range req.Items {
			totalRequested += int64(item.Quantity)
		}
		if monthSold+totalRequested > int64(business.MonthlyLimit) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":          "exceeds business monthly limit",
				"monthly_limit":  business.MonthlyLimit,
				"units_sold":     monthSold,
				"units_requested": totalRequested,
			})
			return
		}
	}

	order := models.Order{
		BusinessID:      req.BusinessID,
		CustomerID:      customerID,
		FreelancerID:    req.FreelancerID,
		BuyerDocumentID: buyerDocID,
		GuestName:       guestName,
		GuestPhone:      guestPhone,
		Status:          "pending_payment",
		PaymentStatus:   "pending",
	}

	var total float64
	for _, item := range req.Items {
		var product models.Product
		if err := h.db.First(&product, item.ProductID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "product not found"})
			return
		}
		if product.BusinessID != req.BusinessID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "product does not belong to selected business"})
			return
		}
		if item.Quantity <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid quantity"})
			return
		}
		if product.Stock < item.Quantity {
			c.JSON(http.StatusBadRequest, gin.H{"error": "insufficient stock for product: " + product.Name})
			return
		}

		orderItem := models.OrderItem{
			ProductID: product.ID,
			Quantity:  item.Quantity,
			UnitPrice: product.Price,
		}
		order.OrderItems = append(order.OrderItems, orderItem)
		total += product.Price * float64(item.Quantity)
	}

	order.TotalAmount = total
	order.Commission = total * platformCommissionRate

	// Calcular comisión del freelancer si viene asignado
	if req.FreelancerID != nil {
		// Usar el commission_rate del primer producto (todos deben ser del mismo negocio)
		if len(order.OrderItems) > 0 {
			var firstProduct models.Product
			h.db.Select("commission_rate").First(&firstProduct, order.OrderItems[0].ProductID)
			order.FreelancerCommission = total * firstProduct.CommissionRate
		}
	}

	if err := h.db.Create(&order).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create order"})
		return
	}

	// Descontar stock de cada producto
	for _, item := range req.Items {
		h.db.Model(&models.Product{}).Where("id = ?", item.ProductID).
			UpdateColumn("stock", gorm.Expr("stock - ?", item.Quantity))
	}

	c.JSON(http.StatusCreated, order)

	// Notificar al negocio por email (asíncrono, no bloquea)
	var owner models.User
	if h.db.Select("email, name").First(&owner, business.OwnerID).Error == nil {
		notifications.SendOrderNotification(owner.Email, business.Name, order.ID, order.TotalAmount)
	}
}

func (h *Handler) CreateOrderPayment(c *gin.Context) {
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

	var order models.Order
	if err := h.db.Preload("OrderItems").First(&order, orderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}

	if (order.CustomerID == nil || *order.CustomerID != claims.UserID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the customer can pay for this order"})
		return
	}

	if order.PaymentStatus == "paid" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order is already paid"})
		return
	}

	params := &stripe.PaymentIntentParams{
		Amount:             stripe.Int64(int64(order.TotalAmount * 100)),
		Currency:           stripe.String("usd"),
		PaymentMethodTypes: stripe.StringSlice([]string{"card"}),
	}
	params.Metadata = map[string]string{
		"order_id":    strconv.FormatUint(uint64(order.ID), 10),
		"customer_id": func() string { if order.CustomerID != nil { return strconv.FormatUint(uint64(*order.CustomerID), 10) }; return "guest" }(),
		"business_id": strconv.FormatUint(uint64(order.BusinessID), 10),
	}
	if order.FreelancerID != nil {
		params.Metadata["freelancer_id"] = strconv.FormatUint(uint64(*order.FreelancerID), 10)
	}

	pi, err := paymentintent.New(params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create payment intent"})
		return
	}

	transaction := models.PaymentTransaction{
		UserID:                claims.UserID,
		OrderID:               &order.ID,
		BusinessID:            &order.BusinessID,
		Amount:                order.TotalAmount,
		Currency:              "usd",
		Status:                "pending",
		Type:                  "order_payment",
		Reference:             pi.ID,
		StripePaymentIntentID: pi.ID,
	}

	if err := h.db.Create(&transaction).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record payment transaction"})
		return
	}

	order.WompiTransactionID = pi.ID
	order.PaymentStatus = "pending"
	order.Status = "pending_payment"
	if err := h.db.Save(&order).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update order payment status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"client_secret": pi.ClientSecret, "payment_intent_id": pi.ID})
}

func (h *Handler) ListOrders(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var orders []models.Order
	query := h.db

	// If business_owner, show orders for their businesses
	if claims.Role == "business_owner" {
		var businesses []models.Business
		if err := h.db.Where("owner_id = ?", claims.UserID).Find(&businesses).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch businesses"})
			return
		}
		businessIDs := make([]uint, len(businesses))
		for i, b := range businesses {
			businessIDs[i] = b.ID
		}
		query = query.Where("business_id IN ?", businessIDs)
	} else {
		// If customer, show only their orders
		query = query.Where("customer_id = ?", claims.UserID)
	}

	if err := query.Preload("OrderItems.Product").Preload("Delivery").Order("created_at DESC").Find(&orders).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch orders"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"orders": orders})
}

func (h *Handler) GetOrder(c *gin.Context) {
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

	var order models.Order
	if err := h.db.Preload("OrderItems.Product").Preload("Delivery").Preload("CommissionSplits").First(&order, orderID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch order"})
		}
		return
	}

	// Verify authorization: customer or business owner
	if (order.CustomerID == nil || *order.CustomerID != claims.UserID) {
		// Check if user is the business owner
		var business models.Business
		if err := h.db.First(&business, order.BusinessID).Error; err != nil || business.OwnerID != claims.UserID {
			c.JSON(http.StatusForbidden, gin.H{"error": "you don't have permission to view this order"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"order": order})
}

func (h *Handler) StripeWebhook(c *gin.Context) {
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read webhook body"})
		return
	}

	sigHeader := c.GetHeader("Stripe-Signature")
	event, err := webhook.ConstructEvent(payload, sigHeader, h.stripeWebhookKey)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to verify webhook signature"})
		return
	}

	switch event.Type {
	case "payment_intent.succeeded":
		var pi stripe.PaymentIntent
		if err := json.Unmarshal(event.Data.Raw, &pi); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid webhook payload"})
			return
		}
		if err := h.handlePaymentIntentSucceeded(&pi); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to handle payment success"})
			return
		}
	case "payment_intent.payment_failed":
		var pi stripe.PaymentIntent
		if err := json.Unmarshal(event.Data.Raw, &pi); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid webhook payload"})
			return
		}
		if err := h.handlePaymentIntentFailed(&pi); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to handle payment failure"})
			return
		}
	default:
		c.JSON(http.StatusOK, gin.H{"message": "event ignored"})
		return
	}

	c.Status(http.StatusOK)
}

func (h *Handler) handlePaymentIntentSucceeded(pi *stripe.PaymentIntent) error {
	var tx models.PaymentTransaction
	if err := h.db.Where("stripe_payment_intent_id = ?", pi.ID).First(&tx).Error; err != nil {
		return err
	}

	tx.Status = "succeeded"
	if err := h.db.Save(&tx).Error; err != nil {
		return err
	}

	if tx.OrderID != nil {
		var order models.Order
		if err := h.db.First(&order, *tx.OrderID).Error; err != nil {
			return err
		}
		order.PaymentStatus = "paid"
		order.Status = "completed"
		order.WompiTransactionID = pi.ID
		return h.db.Save(&order).Error
	}

	return nil
}

func (h *Handler) handlePaymentIntentFailed(pi *stripe.PaymentIntent) error {
	var tx models.PaymentTransaction
	if err := h.db.Where("stripe_payment_intent_id = ?", pi.ID).First(&tx).Error; err != nil {
		return err
	}

	tx.Status = "failed"
	if err := h.db.Save(&tx).Error; err != nil {
		return err
	}

	if tx.OrderID != nil {
		var order models.Order
		if err := h.db.First(&order, *tx.OrderID).Error; err != nil {
			return err
		}
		order.PaymentStatus = "failed"
		order.Status = "payment_failed"
		order.WompiTransactionID = pi.ID
		return h.db.Save(&order).Error
	}

	return nil
}

func (h *Handler) BusinessDashboard(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "business_owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only business owners can view dashboard"})
		return
	}

	var businesses []models.Business
	if err := h.db.Where("owner_id = ?", claims.UserID).Find(&businesses).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load businesses"})
		return
	}

	type businessStats struct {
		BusinessID uint    `json:"business_id"`
		Name       string  `json:"name"`
		Orders     int64   `json:"orders"`
		Revenue    float64 `json:"revenue"`
	}

	stats := make([]businessStats, 0, len(businesses))

	for _, business := range businesses {
		var count int64
		var revenue float64
		h.db.Model(&models.Order{}).
			Where("business_id = ? AND status IN ?", business.ID, []string{"pending", "completed", "delivered"}).
			Count(&count)
		h.db.Model(&models.Order{}).
			Select("COALESCE(SUM(total_amount),0)").
			Where("business_id = ? AND status IN ?", business.ID, []string{"pending", "completed", "delivered"}).
			Scan(&revenue)

		stats = append(stats, businessStats{
			BusinessID: business.ID,
			Name:       business.Name,
			Orders:     count,
			Revenue:    revenue,
		})
	}

	c.JSON(http.StatusOK, gin.H{"dashboard": stats})
}

func (h *Handler) GetFeed(c *gin.Context) {
	var stories []models.Story
	var ads []models.Advertisement

	h.db.Find(&stories)
	h.db.Where("active = ?", true).Find(&ads)

	c.JSON(http.StatusOK, gin.H{"stories": stories, "advertisements": ads})
}

func (h *Handler) ListStories(c *gin.Context) {
	var stories []models.Story
	if err := h.db.Find(&stories).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load stories"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"stories": stories})
}

func (h *Handler) CreateStory(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req storyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	story := models.Story{
		UserID:   claims.UserID,
		Title:    req.Title,
		Content:  req.Content,
		MediaURL: req.MediaURL,
	}

	if err := h.db.Create(&story).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create story"})
		return
	}

	c.JSON(http.StatusCreated, story)
}

func (h *Handler) CreateAdvertisement(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "business_owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only business owners can create advertisements"})
		return
	}

	var req advertisementRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var business models.Business
	if err := h.db.First(&business, req.BusinessID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "business not found"})
		return
	}
	if business.OwnerID != claims.UserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "you can only create ads for your own business"})
		return
	}

	ad := models.Advertisement{
		BusinessID:  req.BusinessID,
		Title:       req.Title,
		Description: req.Description,
		ImageURL:    req.ImageURL,
		PackageType: req.PackageType,
		Active:      req.Active,
	}

	if err := h.db.Create(&ad).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create advertisement"})
		return
	}

	c.JSON(http.StatusCreated, ad)
}

func (h *Handler) ListAdvertisements(c *gin.Context) {
	var ads []models.Advertisement
	if err := h.db.Where("active = ?", true).Find(&ads).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load advertisements"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"advertisements": ads})
}

func (h *Handler) ListPackages(c *gin.Context) {
	var packages []models.AdvertisingPackage
	if err := h.db.Where("active = ?", true).Find(&packages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load packages"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"packages": packages})
}

func (h *Handler) PurchasePackage(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "business_owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only business owners can purchase packages"})
		return
	}

	var req packagePurchaseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var business models.Business
	if err := h.db.First(&business, req.BusinessID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "business not found"})
		return
	}
	if business.OwnerID != claims.UserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "you can only buy packages for your own business"})
		return
	}

	var pkg models.AdvertisingPackage
	if err := h.db.First(&pkg, req.PackageID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "package not found"})
		return
	}

	transaction := models.PaymentTransaction{
		UserID:     claims.UserID,
		BusinessID: &business.ID,
		Amount:     pkg.Price,
		Currency:   "USD",
		Status:     "pending",
		Type:       "package_purchase",
		Reference:  strings.ToUpper(strings.ReplaceAll(pkg.Name, " ", "_")) + "_" + time.Now().Format("20060102150405"),
		CreatedAt:  time.Now(),
	}

	if err := h.db.Create(&transaction).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register transaction"})
		return
	}

	ad := models.Advertisement{
		BusinessID:  business.ID,
		Title:       pkg.Name,
		Description: pkg.Description,
		ImageURL:    business.ImageURL,
		PackageType: pkg.Name,
		Active:      true,
	}

	if err := h.db.Create(&ad).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to activate advertisement"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"transaction": transaction, "advertisement": ad})
}

func (h *Handler) CreatePaymentMethod(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req paymentMethodRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	paymentMethod := models.PaymentMethod{
		UserID:      claims.UserID,
		Provider:    req.Provider,
		AccountID:   req.AccountID,
		DisplayName: req.DisplayName,
		Type:        req.Type,
		Verified:    false,
	}

	if err := h.db.Create(&paymentMethod).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save payment method"})
		return
	}

	c.JSON(http.StatusCreated, paymentMethod)
}

func (h *Handler) ListPaymentMethods(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var methods []models.PaymentMethod
	if err := h.db.Where("user_id = ?", claims.UserID).Find(&methods).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load payment methods"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"payment_methods": methods})
}

func (h *Handler) GetNearbyBusinesses(c *gin.Context) {
	lat := c.Query("latitude")
	lng := c.Query("longitude")
	radiusQuery := c.DefaultQuery("radius_km", "5")

	var businesses []models.Business
	if err := h.db.Find(&businesses).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load businesses"})
		return
	}

	if lat == "" || lng == "" {
		c.JSON(http.StatusOK, gin.H{"businesses": businesses})
		return
	}

	latitude, err := strconv.ParseFloat(lat, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid latitude"})
		return
	}
	longitude, err := strconv.ParseFloat(lng, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid longitude"})
		return
	}
	radius, err := strconv.ParseFloat(radiusQuery, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid radius_km"})
		return
	}

	var matches []models.Business
	for _, business := range businesses {
		if business.Latitude == 0 && business.Longitude == 0 {
			continue
		}
		if distanceKM(latitude, longitude, business.Latitude, business.Longitude) <= radius {
			matches = append(matches, business)
		}
	}

	c.JSON(http.StatusOK, gin.H{"businesses": matches})
}

func (h *Handler) Recommendations(c *gin.Context) {
	var ads []models.Advertisement
	var businesses []models.Business

	h.db.Where("active = ?", true).Find(&ads)
	h.db.Limit(20).Find(&businesses)

	lat := c.Query("latitude")
	lng := c.Query("longitude")
	if lat != "" && lng != "" {
		latitude, latErr := strconv.ParseFloat(lat, 64)
		longitude, lngErr := strconv.ParseFloat(lng, 64)
		if latErr == nil && lngErr == nil {
			filtered := make([]models.Business, 0, len(businesses))
			for _, business := range businesses {
				if business.Latitude == 0 && business.Longitude == 0 {
					continue
				}
				if distanceKM(latitude, longitude, business.Latitude, business.Longitude) <= 10 {
					filtered = append(filtered, business)
				}
			}
			businesses = filtered
		}
	}

	c.JSON(http.StatusOK, gin.H{"recommendations": gin.H{"advertisements": ads, "local_businesses": businesses}})
}

func distanceKM(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusKm = 6371.0

	latRad1 := lat1 * math.Pi / 180
	latRad2 := lat2 * math.Pi / 180
	deltaLat := (lat2 - lat1) * math.Pi / 180
	deltaLon := (lon2 - lon1) * math.Pi / 180

	a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
		math.Cos(latRad1)*math.Cos(latRad2)*math.Sin(deltaLon/2)*math.Sin(deltaLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusKm * c
}

func (h *Handler) CreateDelivery(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req deliveryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var order models.Order
	if err := h.db.Preload("Delivery").First(&order, req.OrderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}

	if (order.CustomerID == nil || *order.CustomerID != claims.UserID) && claims.Role != "business_owner" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the customer or business owner can request delivery updates"})
		return
	}

	delivery := models.Delivery{
		OrderID:  req.OrderID,
		Status:   "scheduled",
		ETA:      req.ETA,
		Tracking: req.Tracking,
	}

	if err := h.db.Create(&delivery).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create delivery"})
		return
	}

	c.JSON(http.StatusCreated, delivery)
}

func (h *Handler) MyBusinesses(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var businesses []models.Business
	if err := h.db.Where("owner_id = ?", claims.UserID).Find(&businesses).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch businesses"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"businesses": businesses})
}

func (h *Handler) makeToken(user models.User) (string, error) {
	claims := tokenClaims{
		UserID: user.ID,
		Role:   user.Role,
		Email:  user.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(72 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}

func (h *Handler) getClaims(c *gin.Context) *tokenClaims {
	value, exists := c.Get("user_claims")
	if !exists {
		return nil
	}
	claims, ok := value.(*tokenClaims)
	if !ok {
		return nil
	}
	return claims
}

// getClaimsFromHeader parsea el token directamente del header sin middleware.
// Usado en endpoints públicos que opcionalmente leen el usuario.
func (h *Handler) getClaimsFromHeader(authHeader string) *tokenClaims {
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 {
		return nil
	}
	token, err := jwt.ParseWithClaims(parts[1], &tokenClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(h.jwtSecret), nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !token.Valid {
		return nil
	}
	claims, ok := token.Claims.(*tokenClaims)
	if !ok {
		return nil
	}
	return claims
}

func generateReferralCode(username string) string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	code := make([]byte, 6)
	for i := range code {
		code[i] = chars[rand.Intn(len(chars))]
	}
	return username[:min(4, len(username))] + string(code)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func generateUniqueSlug(db *gorm.DB, name string) string {
	replacer := strings.NewReplacer(
		"á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u",
		"Á", "a", "É", "e", "Í", "i", "Ó", "o", "Ú", "u",
		"ñ", "n", "Ñ", "n",
	)
	s := strings.ToLower(replacer.Replace(name))
	s = strings.ReplaceAll(s, " ", "-")
	var clean strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			clean.WriteRune(r)
		}
	}
	base := clean.String()
	slug := base
	var count int64
	for i := 1; ; i++ {
		db.Model(&models.Business{}).Where("slug = ?", slug).Count(&count)
		if count == 0 {
			break
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}
	return slug
}

func hashPassword(password string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hashed), err
}

func verifyPassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}

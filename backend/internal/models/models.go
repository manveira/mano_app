package models

import "time"

// ─── Usuarios ────────────────────────────────────────────────────────────────

type User struct {
	ID              uint            `gorm:"primaryKey" json:"id"`
	Name            string          `json:"name"`
	Email           string          `json:"email" gorm:"uniqueIndex;not null"`
	Password        string          `json:"-"`
	Role            string          `json:"role" gorm:"not null"`
	Username        string          `json:"username" gorm:"uniqueIndex"`
	DocumentID      string          `json:"document_id" gorm:"index"`
	Phone           string          `json:"phone" gorm:"uniqueIndex"`
	NequiNumber     string          `json:"nequi_number"`
	IsVerified      bool            `json:"is_verified" gorm:"default:false"`
	Plan            string          `json:"plan" gorm:"default:free"`
	PlanExpiresAt   *time.Time      `json:"plan_expires_at"`
	EarningsBalance float64         `json:"earnings_balance" gorm:"default:0"`
	ReferralCode    string          `json:"referral_code" gorm:"uniqueIndex"`
	ReferredBy      *uint           `json:"referred_by"`
	Businesses      []Business      `gorm:"foreignKey:OwnerID" json:"businesses,omitempty"`
	Stories         []Story         `gorm:"foreignKey:UserID" json:"stories,omitempty"`
	Orders          []Order         `gorm:"foreignKey:CustomerID" json:"orders,omitempty"`
	PaymentMethods  []PaymentMethod `gorm:"foreignKey:UserID" json:"payment_methods,omitempty"`
}

// ─── Negocios ─────────────────────────────────────────────────────────────────

type Business struct {
	ID                   uint            `gorm:"primaryKey" json:"id"`
	OwnerID              uint            `json:"owner_id"`
	Name                 string          `json:"name"`
	Slug                 string          `json:"slug" gorm:"uniqueIndex"`
	Description          string          `json:"description"`
	Category             string          `json:"category"`
	Location             string          `json:"location"`
	Address              string          `json:"address"`
	Latitude             float64         `json:"latitude"`
	Longitude            float64         `json:"longitude"`
	ImageURL             string          `json:"image_url"`
	IsFeatured           bool            `json:"is_featured"`
	IsApproved           bool            `json:"is_approved" gorm:"default:false"`
	DefaultCommissionRate float64        `json:"default_commission_rate" gorm:"default:0.10"`
	MonthlyLimit         int             `json:"monthly_limit" gorm:"default:0"` // 0 = sin límite
	Advertisements       []Advertisement `gorm:"foreignKey:BusinessID" json:"advertisements,omitempty"`
	Products             []Product       `gorm:"foreignKey:BusinessID" json:"products,omitempty"`
}

// BusinessApplication — solicitud de registro de negocio (KYC manual)
type BusinessApplication struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	UserID          uint      `json:"user_id"`
	BusinessName    string    `json:"business_name"`
	Category        string    `json:"category"`
	Description     string    `json:"description"`
	NequiNumber     string    `json:"nequi_number"`
	DocumentImageURL string   `json:"document_image_url"` // foto del RUT o cédula
	Status          string    `json:"status" gorm:"default:pending"` // pending | approved | rejected
	RejectionReason string    `json:"rejection_reason"`
	ReviewedBy      *uint     `json:"reviewed_by"`
	ReviewedAt      *time.Time `json:"reviewed_at"`
	CreatedAt       time.Time `json:"created_at"`
}

// ─── Productos ────────────────────────────────────────────────────────────────

type Product struct {
	ID             uint    `gorm:"primaryKey" json:"id"`
	BusinessID     uint    `json:"business_id"`
	Name           string  `json:"name"`
	Description    string  `json:"description"`
	Price          float64 `json:"price"`
	Stock          int     `json:"stock"`
	ImageURL       string  `json:"image_url"`
	CommissionRate float64 `json:"commission_rate"`
	IsActive       bool    `json:"is_active" gorm:"default:true"`
	IsExclusive    bool    `json:"is_exclusive" gorm:"default:false"`
}

// ─── Links de referido ────────────────────────────────────────────────────────

// ReferralLink — link único por comisionista × producto
type ReferralLink struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	FreelancerID uint      `json:"freelancer_id"`
	Freelancer   User      `gorm:"foreignKey:FreelancerID" json:"freelancer,omitempty"`
	ProductID    uint      `json:"product_id"`
	Product      Product   `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	BusinessID   uint      `json:"business_id"`
	Slug         string    `json:"slug" gorm:"uniqueIndex"` // ej: hamaca-casa-nariño-x7k2
	Clicks       int       `json:"clicks" gorm:"default:0"`
	Conversions  int       `json:"conversions" gorm:"default:0"`
	IsActive     bool      `json:"is_active" gorm:"default:true"`
	CreatedAt    time.Time `json:"created_at"`
}

// ReferralClick — registro de cada click en un link
type ReferralClick struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	ReferralLinkID uint      `json:"referral_link_id"`
	IPAddress      string    `json:"ip_address"`
	UserAgent      string    `json:"user_agent"`
	ConvertedToOrder bool    `json:"converted_to_order" gorm:"default:false"`
	OrderID        *uint     `json:"order_id"`
	CreatedAt      time.Time `json:"created_at"`
}

// ─── Órdenes ──────────────────────────────────────────────────────────────────

type Order struct {
	ID                 uint             `gorm:"primaryKey" json:"id"`
	BusinessID         uint             `json:"business_id"`
	Business           Business         `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"business,omitempty"`
	CustomerID         *uint            `json:"customer_id,omitempty"` // nil si es guest
	GuestName          string           `json:"guest_name"`
	GuestPhone         string           `json:"guest_phone"`
	BuyerDocumentID    string           `json:"buyer_document_id"`
	FreelancerID       *uint            `json:"freelancer_id,omitempty"`
	ReferralLinkID     *uint            `json:"referral_link_id,omitempty"`
	TotalAmount        float64          `json:"total_amount"`
	Status             string           `json:"status"` // pending_payment | paid | dispatched | in_transit | delivered | disputed | cancelled
	PaymentStatus      string           `json:"payment_status"` // pending | paid | failed | refunded
	EscrowStatus       string           `json:"escrow_status" gorm:"default:pending"` // pending | held | released | refunded
	Commission         float64          `json:"commission"` // comisión total de plataforma (4%)
	FreelancerCommission float64        `json:"freelancer_commission"` // comisión del comisionista
	WompiTransactionID string           `json:"wompi_transaction_id"`
	ConfirmedAt        *time.Time       `json:"confirmed_at"` // cuando el comprador confirma recepción
	AutoConfirmAt      *time.Time       `json:"auto_confirm_at"` // 24h después de "in_transit"
	OrderItems         []OrderItem      `gorm:"foreignKey:OrderID" json:"items,omitempty"`
	CommissionSplits   []CommissionSplit `gorm:"foreignKey:OrderID" json:"commission_splits,omitempty"`
	Delivery           Delivery         `gorm:"foreignKey:OrderID" json:"delivery,omitempty"`
	CreatedAt          time.Time        `json:"created_at"`
	UpdatedAt          time.Time        `json:"updated_at"`
}

type OrderItem struct {
	ID        uint    `gorm:"primaryKey" json:"id"`
	OrderID   uint    `json:"order_id"`
	ProductID uint    `json:"product_id"`
	Product   Product `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unit_price"`
}

// ─── Distribución de dinero ───────────────────────────────────────────────────

// CommissionSplit — cómo se distribuye el dinero de una orden
type CommissionSplit struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	OrderID       uint      `json:"order_id"`
	RecipientType string    `json:"recipient_type"` // business | freelancer | platform
	RecipientID   *uint     `json:"recipient_id"`   // null para platform
	Amount        float64   `json:"amount"`
	Percentage    float64   `json:"percentage"`
	Status        string    `json:"status" gorm:"default:pending"` // pending | released | failed
	ReleasedAt    *time.Time `json:"released_at"`
}

// ─── Pagos Wompi ──────────────────────────────────────────────────────────────

type WompiTransaction struct {
	ID                string    `gorm:"primaryKey" json:"id"` // ID de Wompi
	OrderID           *uint     `json:"order_id"`
	UserID            uint      `json:"user_id"`
	Amount            int64     `json:"amount"` // en centavos COP
	Currency          string    `json:"currency" gorm:"default:COP"`
	Status            string    `json:"status"` // PENDING | APPROVED | DECLINED | VOIDED | ERROR
	PaymentMethod     string    `json:"payment_method"` // CARD | NEQUI | PSE | BANCOLOMBIA_TRANSFER
	Reference         string    `json:"reference" gorm:"uniqueIndex"`
	RedirectURL       string    `json:"redirect_url"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// WithdrawalRequest — solicitud de retiro de ganancias del comisionista
type WithdrawalRequest struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	FreelancerID  uint      `json:"freelancer_id"`
	Amount        float64   `json:"amount"`
	NequiNumber   string    `json:"nequi_number"`
	Status        string    `json:"status" gorm:"default:pending"` // pending | processing | completed | failed
	ProcessedAt   *time.Time `json:"processed_at"`
	Notes         string    `json:"notes"`
	CreatedAt     time.Time `json:"created_at"`
}

// ─── Contenido social ─────────────────────────────────────────────────────────

type Story struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `json:"user_id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	MediaURL  string    `json:"media_url"`
	ExpiresAt time.Time `json:"expires_at"` // 24h después de creación
	CreatedAt time.Time `json:"created_at"`
}

type Advertisement struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	BusinessID  uint       `json:"business_id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	ImageURL    string     `json:"image_url"`
	PackageType string     `json:"package_type"`
	Active      bool       `json:"active"`
	ExpiresAt   *time.Time `json:"expires_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

// ─── Pagos y métodos ──────────────────────────────────────────────────────────

type PaymentMethod struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	UserID      uint   `json:"user_id"`
	Provider    string `json:"provider"`
	AccountID   string `json:"account_id"`
	DisplayName string `json:"display_name"`
	Type        string `json:"type"`
	Verified    bool   `json:"verified"`
}

type PaymentTransaction struct {
	ID                    uint      `gorm:"primaryKey" json:"id"`
	UserID                uint      `json:"user_id"`
	BusinessID            *uint     `json:"business_id,omitempty"`
	OrderID               *uint     `json:"order_id,omitempty"`
	Amount                float64   `json:"amount"`
	Currency              string    `json:"currency"`
	Status                string    `json:"status"`
	Type                  string    `json:"type"`
	Reference             string    `json:"reference"`
	StripePaymentIntentID string    `json:"stripe_payment_intent_id"`
	CreatedAt             time.Time `json:"created_at"`
}

type AdvertisingPackage struct {
	ID           uint    `gorm:"primaryKey" json:"id"`
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	Price        float64 `json:"price"`
	DurationDays int     `json:"duration_days"`
	Active       bool    `json:"active"`
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

type Delivery struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	OrderID    uint      `json:"order_id"`
	CourierID  *uint     `json:"courier_id"` // null si el negocio entrega por su cuenta
	Type       string    `json:"type" gorm:"default:business_own"` // business_own | mano_courier
	Status     string    `json:"status"` // scheduled | picked_up | in_transit | delivered | failed
	ETA        string    `json:"eta"`
	Tracking   string    `json:"tracking"`
	PickedUpAt *time.Time `json:"picked_up_at"`
	DeliveredAt *time.Time `json:"delivered_at"`
}

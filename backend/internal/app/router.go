package app

import (
	"mano-app/backend/internal/handlers"
	"mano-app/backend/pkg/config"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func NewRouter(cfg *config.Config, db *gorm.DB) *gin.Engine {
	r := gin.Default()
	h := handlers.NewHandler(db, cfg.JWTSecret, cfg.StripeSecretKey, cfg.StripeWebhookKey, cfg.MockMode)

	api := r.Group("/api")
	{
		// ── Auth ──────────────────────────────────────────────────────────────
		auth := api.Group("/auth")
		{
			auth.POST("/signup", h.SignUp)
			auth.POST("/signin", h.SignIn)
		}

		// ── Públicos ──────────────────────────────────────────────────────────
		api.GET("/health", h.Health)
		api.GET("/businesses", h.ListBusinesses)
		api.GET("/businesses/:id", h.GetBusiness)
		api.GET("/businesses/:id/products", h.ListProducts)
		api.GET("/products", h.ListProducts)
		api.GET("/feed", h.GetFeedV2)       // stories filtradas + boost publicidad
		api.GET("/stories", h.ListStoriesV2) // filtra expiradas
		api.GET("/ads", h.ListAdvertisements)
		api.GET("/packages", h.ListPackages)
		api.GET("/recommendations", h.Recommendations)
		api.GET("/map/nearby", h.GetNearbyBusinesses)
		api.GET("/r/:slug", h.TrackReferralClick)
		api.GET("/vendedor/:username", h.FreelancerStorefront)
		api.GET("/negocio/:slug", h.BusinessPublicProfile)
		api.GET("/deliveries/:id", h.GetDelivery)
		api.POST("/orders/guest", h.CreateGuestOrder)        // compra sin registro
		api.POST("/payments/wompi/guest", h.InitiateWompiPaymentGuest) // pago guest

		// Webhooks
		api.POST("/webhooks/stripe", h.StripeWebhook)
		api.POST("/webhooks/wompi", h.WompiWebhook)

		// ── Autenticados ──────────────────────────────────────────────────────
		secured := api.Group("/").Use(h.AuthMiddleware())
		{
			secured.GET("/me", h.Me)
			secured.GET("/me/businesses", h.MyBusinesses)

			secured.POST("/businesses", h.CreateBusiness)
			secured.POST("/products", h.CreateProduct)
			secured.PATCH("/products/:id", h.PatchProduct)

			secured.POST("/orders", h.CreateOrder)
			secured.GET("/orders/courier", h.CourierAvailableOrders) // ANTES de /:id
			secured.GET("/orders", h.ListOrders)
			secured.GET("/orders/:id", h.GetOrder)
			secured.POST("/orders/:id/confirm", h.ConfirmOrderReceived)
			secured.POST("/orders/:id/dispute", h.OpenDispute)
			secured.POST("/orders/:id/pay", h.CreateOrderPayment)

			secured.POST("/payments/wompi/initiate", h.InitiateWompiPayment)

			secured.GET("/dashboard", h.BusinessDashboard)
			secured.GET("/dashboard/business/stats", h.BusinessDashboardStats)
			secured.GET("/dashboard/freelancer", h.FreelancerDashboard)
			secured.POST("/businesses/apply", h.ApplyBusiness)
			secured.PATCH("/businesses/:id", h.PatchBusiness)

			secured.POST("/stories", h.CreateStory)
			secured.POST("/ads", h.CreateAdvertisement)
			secured.POST("/packages/purchase", h.PurchasePackage)

			secured.POST("/payment-methods", h.CreatePaymentMethod)
			secured.GET("/payment-methods", h.ListPaymentMethods)

			secured.POST("/deliveries", h.CreateDelivery)
			secured.PATCH("/deliveries/:id/status", h.UpdateDeliveryStatus)

			secured.POST("/sell/affiliate", h.AffiliateToProduct)
			secured.GET("/sell/links", h.MyReferralLinks)
			secured.GET("/sell/referral-code", h.MyReferralCode)
			secured.POST("/sell/withdraw", h.RequestWithdrawal)
			secured.POST("/sell/upgrade-pro", h.UpgradePro)
			secured.GET("/sell/stats", h.SellStats)

			// ── Admin ─────────────────────────────────────────────────────────
			secured.POST("/admin/disputes/:id/resolve", h.ResolveDispute)
		}

		// ── Admin (auth + admin role) ──────────────────────────────────────────
		adminGroup := api.Group("/admin").Use(h.AuthMiddleware(), h.AdminOnly)
		{
			adminGroup.GET("/businesses/pending", h.AdminListPendingBusinesses)
			adminGroup.GET("/applications", h.AdminListApplications)
			adminGroup.POST("/businesses/approve/:id", h.AdminApproveBusiness)
			adminGroup.POST("/businesses/reject/:id", h.AdminRejectBusiness)
			adminGroup.GET("/disputes", h.AdminListDisputes)
			adminGroup.POST("/disputes/resolve/:id", h.ResolveDispute)
			adminGroup.GET("/withdrawals", h.AdminListWithdrawals)
			adminGroup.PATCH("/withdrawals/process/:id", h.AdminProcessWithdrawal)
		}

		// ── Mock (solo MOCK_MODE=true) ─────────────────────────────────────────
		mock := api.Group("/mock").Use(h.MockGuard)
		{
			mock.GET("/status", h.MockSystemStatus)
			mock.POST("/wompi/approve", h.MockWompiApprove)
			mock.POST("/wompi/decline", h.MockWompiDecline)
			mock.POST("/escrow/release", h.MockReleaseEscrow)
			mock.POST("/escrow/auto-confirm", h.MockAutoConfirm)
			mock.POST("/fraud/check", h.MockFraudCheck)
			mock.POST("/flow/full-sale", h.AuthMiddleware(), h.MockFullFlow)
			mock.POST("/seed-admin", h.SeedAdmin) // crear admin para pruebas
		}
	}

	return r
}

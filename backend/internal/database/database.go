package database

import (
	"log"
	"time"

	"mano-app/backend/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func hashPassword(password string) string {
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash)
}

func New(dsn string) (*gorm.DB, error) {
	var db *gorm.DB
	var err error
	for i := 0; i < 10; i++ {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			break
		}
		log.Printf("waiting for postgres... attempt %d/10", i+1)
		time.Sleep(3 * time.Second)
	}
	if err != nil {
		return nil, err
	}

	if err := db.AutoMigrate(
		&models.User{},
		&models.BusinessApplication{},
		&models.Business{},
		&models.Product{},
		&models.ReferralLink{},
		&models.ReferralClick{},
		&models.Order{},
		&models.OrderItem{},
		&models.CommissionSplit{},
		&models.WompiTransaction{},
		&models.WithdrawalRequest{},
		&models.Story{},
		&models.Advertisement{},
		&models.PaymentMethod{},
		&models.PaymentTransaction{},
		&models.AdvertisingPackage{},
		&models.Delivery{},
	); err != nil {
		return nil, err
	}

	if err := seedAdvertisingPackages(db); err != nil {
		return nil, err
	}

	if err := seedTestData(db); err != nil {
		return nil, err
	}

	log.Println("database migrated successfully")
	return db, nil
}

func seedAdvertisingPackages(db *gorm.DB) error {
	packages := []models.AdvertisingPackage{
		{Name: "Paquete básico", Description: "Visibilidad estándar en feed local.", Price: 29990, DurationDays: 7, Active: true},
		{Name: "Paquete premium", Description: "Mayor alcance y prioridad en recomendaciones.", Price: 69990, DurationDays: 14, Active: true},
		{Name: "Paquete destacado", Description: "Aparece primero para turistas y clientes locales.", Price: 129990, DurationDays: 30, Active: true},
	}
	for _, pkg := range packages {
		var existing models.AdvertisingPackage
		if db.Where("name = ?", pkg.Name).First(&existing).Error == nil {
			continue
		}
		if err := db.Create(&pkg).Error; err != nil {
			return err
		}
	}
	return nil
}

func seedTestData(db *gorm.DB) error {
	var userCount int64
	db.Model(&models.User{}).Count(&userCount)
	if userCount > 0 {
		return nil
	}

	// ── Usuarios ──────────────────────────────────────────────────────────────
	owner := models.User{
		Name: "Juan Pérez", Email: "juan@example.com", Password: hashPassword("password123"),
		Role: "business_owner", Username: "juan", DocumentID: "12345678",
		Phone: "3001234567", NequiNumber: "3001234567", IsVerified: true, Plan: "free",
		ReferralCode: "JUAN-A1B2",
	}
	customer := models.User{
		Name: "Carlos López", Email: "carlos@example.com", Password: hashPassword("password123"),
		Role: "customer", Username: "carlos", DocumentID: "87654321",
		Phone: "3109876543", IsVerified: true, Plan: "free",
		ReferralCode: "CARL-C3D4",
	}
	freelancer := models.User{
		Name: "María García", Email: "maria@example.com", Password: hashPassword("password123"),
		Role: "freelancer", Username: "maria", DocumentID: "11223344",
		Phone: "3205551234", NequiNumber: "3205551234", IsVerified: true, Plan: "free",
		ReferralCode: "MARI-E5F6",
	}

	for _, u := range []*models.User{&owner, &customer, &freelancer} {
		if err := db.Create(u).Error; err != nil {
			return err
		}
	}

	// ── Negocios ──────────────────────────────────────────────────────────────
	business1 := models.Business{
		OwnerID: owner.ID, Name: "Café La Esquina", Slug: "cafe-la-esquina",
		Description: "Café artesanal con especialidad en espressos", Category: "Café",
		Location: "Centro Histórico", Address: "Calle Principal 123",
		Latitude: 1.7989, Longitude: -78.7628,
		ImageURL: "https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=400",
		IsFeatured: true, IsApproved: true, DefaultCommissionRate: 0.15,
	}
	business2 := models.Business{
		OwnerID: owner.ID, Name: "Artesanías Casa Nariño", Slug: "artesanias-casa-narino",
		Description: "Hamacas, mochilas y artesanías del Pacífico colombiano", Category: "Artesanías",
		Location: "Tumaco", Address: "Barrio El Morro 45",
		Latitude: 1.8003, Longitude: -78.7612,
		ImageURL: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400",
		IsFeatured: false, IsApproved: true, DefaultCommissionRate: 0.20,
	}

	for _, b := range []*models.Business{&business1, &business2} {
		if err := db.Create(b).Error; err != nil {
			return err
		}
	}

	// ── Productos ─────────────────────────────────────────────────────────────
	products := []models.Product{
		{BusinessID: business1.ID, Name: "Espresso Doble", Description: "Café espresso premium de grano único", Price: 4500, Stock: 100, CommissionRate: 0.15, ImageURL: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300"},
		{BusinessID: business1.ID, Name: "Cappuccino Clásico", Description: "Cappuccino con leche cremosa", Price: 5500, Stock: 100, CommissionRate: 0.15, ImageURL: "https://images.unsplash.com/photo-1517668808822-9ebb02ae2a0e?w=300"},
		{BusinessID: business1.ID, Name: "Latte Macchiato", Description: "Latte con arte decorativo", Price: 6000, Stock: 80, CommissionRate: 0.15, ImageURL: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=300"},
		{BusinessID: business2.ID, Name: "Hamaca Artesanal", Description: "Hamaca tejida a mano, colores del Pacífico", Price: 120000, Stock: 20, CommissionRate: 0.20, ImageURL: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300"},
		{BusinessID: business2.ID, Name: "Mochila Wayuu", Description: "Mochila auténtica tejida por artesanas locales", Price: 85000, Stock: 15, CommissionRate: 0.20, ImageURL: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300"},
		{BusinessID: business2.ID, Name: "Collar de Tagua", Description: "Collar artesanal de tagua y semillas naturales", Price: 35000, Stock: 30, CommissionRate: 0.20, ImageURL: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=300"},
	}
	for i := range products {
		if err := db.Create(&products[i]).Error; err != nil {
			return err
		}
	}

	// ── Link de referido de prueba (María → Hamaca) ───────────────────────────
	referralLink := models.ReferralLink{
		FreelancerID: freelancer.ID,
		ProductID:    products[3].ID, // Hamaca Artesanal
		BusinessID:   business2.ID,
		Slug:         "hamaca-casa-narino-maria-x7k2",
		Clicks:       12,
		Conversions:  2,
		IsActive:     true,
	}
	if err := db.Create(&referralLink).Error; err != nil {
		return err
	}

	// ── Orden completada de prueba ────────────────────────────────────────────
	now := time.Now()
	order1 := models.Order{
		BusinessID:           business1.ID,
		CustomerID:           &customer.ID,
		BuyerDocumentID:      "87654321",
		Status:               "delivered",
		PaymentStatus:        "paid",
		EscrowStatus:         "released",
		TotalAmount:          15500,
		Commission:           620,
		FreelancerCommission: 0,
		ConfirmedAt:          &now,
	}
	if err := db.Create(&order1).Error; err != nil {
		return err
	}
	for _, item := range []models.OrderItem{
		{OrderID: order1.ID, ProductID: products[0].ID, Quantity: 2, UnitPrice: 4500},
		{OrderID: order1.ID, ProductID: products[1].ID, Quantity: 1, UnitPrice: 5500},
	} {
		if err := db.Create(&item).Error; err != nil {
			return err
		}
	}

	// ── Orden con comisionista de prueba ──────────────────────────────────────
	autoConfirm := time.Now().Add(24 * time.Hour)
	order2 := models.Order{
		BusinessID:           business2.ID,
		CustomerID:           &customer.ID,
		BuyerDocumentID:      "87654321",
		FreelancerID:         &freelancer.ID,
		ReferralLinkID:       &referralLink.ID,
		Status:               "paid",
		PaymentStatus:        "paid",
		EscrowStatus:         "held",
		TotalAmount:          120000,
		Commission:           4800,
		FreelancerCommission: 24000,
		AutoConfirmAt:        &autoConfirm,
	}
	if err := db.Create(&order2).Error; err != nil {
		return err
	}
	item2 := models.OrderItem{OrderID: order2.ID, ProductID: products[3].ID, Quantity: 1, UnitPrice: 120000}
	if err := db.Create(&item2).Error; err != nil {
		return err
	}

	// CommissionSplits para order2
	splits := []models.CommissionSplit{
		{OrderID: order2.ID, RecipientType: "business", RecipientID: &business2.ID, Amount: 91200, Percentage: 76, Status: "pending"},
		{OrderID: order2.ID, RecipientType: "freelancer", RecipientID: &freelancer.ID, Amount: 24000, Percentage: 20, Status: "pending"},
		{OrderID: order2.ID, RecipientType: "platform", RecipientID: nil, Amount: 4800, Percentage: 4, Status: "pending"},
	}
	for _, s := range splits {
		if err := db.Create(&s).Error; err != nil {
			return err
		}
	}

	// ── Story ─────────────────────────────────────────────────────────────────
	story := models.Story{
		UserID:    owner.ID,
		Title:     "Nuevo lote de hamacas disponible",
		Content:   "Acaban de llegar 20 hamacas nuevas tejidas por artesanas de Tumaco. ¡Comparte el link y gana!",
		MediaURL:  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400",
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	if err := db.Create(&story).Error; err != nil {
		return err
	}

	// ── Anuncio activo (para que el feed tenga contenido) ─────────────────────
	ad := models.Advertisement{
		BusinessID:  business2.ID,
		Title:       "Artesanías del Pacífico — Envíos a todo Colombia",
		Description: "Hamacas, mochilas y collares tejidos a mano por artesanas de Tumaco.",
		ImageURL:    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400",
		PackageType: "Paquete básico",
		Active:      true,
	}
	if err := db.Create(&ad).Error; err != nil {
		return err
	}

	log.Println("test data seeded successfully")
	return nil
}

package config

import "os"

type Config struct {
	ServerPort       string
	DatabaseDSN      string
	JWTSecret        string
	StripeSecretKey  string
	StripeWebhookKey string
	MockMode         bool   // true = simular Wompi sin llamadas reales
}

func Load() *Config {
	return &Config{
		ServerPort:       getEnv("SERVER_PORT", ":8080"),
		DatabaseDSN:      getEnv("DATABASE_DSN", "postgres://user:pass@localhost:5432/mano?sslmode=disable"),
		JWTSecret:        getEnv("JWT_SECRET", "replace-this-secret"),
		StripeSecretKey:  getEnv("STRIPE_SECRET_KEY", ""),
		StripeWebhookKey: getEnv("STRIPE_WEBHOOK_SECRET", ""),
		MockMode:         getEnv("MOCK_MODE", "false") == "true",
	}
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

package config

import (
	"errors"
	"log"
	"os"
)

type Config struct {
	ServerPort       string
	DatabaseDSN      string
	JWTSecret        string
	StripeSecretKey  string
	StripeWebhookKey string
	MockMode         bool // true = simular Wompi sin llamadas reales
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

// Validate rechaza configuraciones inseguras fuera de MOCK_MODE (producción/staging).
// Falla rápido al arrancar en vez de funcionar con un secreto por defecto que cualquiera conoce.
func (c *Config) Validate() error {
	if c.MockMode {
		return nil
	}
	if c.JWTSecret == "" || c.JWTSecret == "replace-this-secret" || len(c.JWTSecret) < 32 {
		return errors.New("JWT_SECRET debe definirse con al menos 32 caracteres cuando MOCK_MODE no es true (genera uno con: openssl rand -hex 32)")
	}
	// Los pagos se pueden apagar, pero se avisa claramente: sin estas variables Wompi no funciona.
	for _, k := range []string{"WOMPI_PUBLIC_KEY", "WOMPI_INTEGRITY_SECRET", "WOMPI_EVENTS_SECRET", "WOMPI_PRIVATE_KEY"} {
		if os.Getenv(k) == "" {
			log.Printf("AVISO: %s vacío; los pagos con Wompi no funcionarán completos hasta definirlo", k)
		}
	}
	return nil
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

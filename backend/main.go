package main

import (
	"log"

	"mano-app/backend/internal/app"
	"mano-app/backend/internal/database"
	"mano-app/backend/pkg/config"
)

func main() {
	cfg := config.Load()
	db, err := database.New(cfg.DatabaseDSN)
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	router := app.NewRouter(cfg, db)

	log.Printf("starting Mano App backend on port %s", cfg.ServerPort)
	if err := router.Run(cfg.ServerPort); err != nil {
		log.Fatalf("failed to run server: %v", err)
	}
}

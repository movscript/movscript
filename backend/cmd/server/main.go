package main

import (
	"context"
	"encoding/hex"
	"log"

	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/config"
	"github.com/movscript/movscript/internal/db"
	"github.com/movscript/movscript/internal/genjob"
	"github.com/movscript/movscript/internal/router"
	"github.com/movscript/movscript/internal/storage"
)

func main() {
	cfg := config.Load()

	if key, err := hex.DecodeString(cfg.EncryptionKey); err != nil || len(key) != 32 {
		log.Fatal("ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate one with: openssl rand -hex 32")
	}

	database, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	store, err := storage.NewMinIOStorage(
		cfg.MinIOEndpoint, cfg.MinIOAccessKey, cfg.MinIOSecretKey,
		cfg.MinIOBucket, cfg.MinIOUseSSL,
	)
	if err != nil {
		log.Fatalf("failed to initialize MinIO storage: %v", err)
	}
	log.Printf("storage backend: minio (endpoint=%s, bucket=%s)", cfg.MinIOEndpoint, cfg.MinIOBucket)

	// Start GenJob worker pool (4 concurrent workers).
	encKey, _ := hex.DecodeString(cfg.EncryptionKey)
	registry := ai.NewRegistry(database, encKey)
	aiService := ai.NewAIService(database, registry)
	worker := genjob.NewWorker(database, aiService, store, encKey)
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	worker.Start(workerCtx, 4)

	r := router.New(database, cfg, store)

	log.Printf("server listening on :%s", cfg.ServerPort)
	if err := r.Run(":" + cfg.ServerPort); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

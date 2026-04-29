package main

import (
	"context"
	"encoding/hex"
	"log"
	"log/slog"

	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/config"
	"github.com/movscript/movscript/internal/db"
	"github.com/movscript/movscript/internal/genjob"
	"github.com/movscript/movscript/internal/observability"
	"github.com/movscript/movscript/internal/router"
	"github.com/movscript/movscript/internal/storage"
)

func main() {
	cfg := config.Load()

	if err := cfg.ValidateStartup(); err != nil {
		log.Fatal(err)
	}
	observability.Logger().Info("startup_config_validated", slog.Any("config", cfg.SafeSummary()))

	database, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	if err := db.EnsureMigrationsCurrent(database); err != nil {
		log.Fatalf("database migration check failed: %v", err)
	}

	store, err := storage.NewMinIOStorage(
		cfg.MinIOEndpoint, cfg.MinIOAccessKey, cfg.MinIOSecretKey,
		cfg.MinIOBucket, cfg.MinIOUseSSL,
	)
	if err != nil {
		log.Fatalf("failed to initialize MinIO storage: %v", err)
	}
	observability.Logger().Info("storage_initialized", slog.String("backend", "minio"), slog.String("endpoint", cfg.MinIOEndpoint), slog.String("bucket", cfg.MinIOBucket))

	// Start GenJob worker pool (4 concurrent workers).
	encKey, _ := hex.DecodeString(cfg.EncryptionKey)
	registry := ai.NewRegistry(database, encKey)
	aiService := ai.NewAIService(database, registry)
	worker := genjob.NewWorker(database, aiService, store, encKey)
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	worker.Start(workerCtx, 4)

	r := router.New(database, cfg, store)

	observability.Logger().Info("server_listening", slog.String("port", cfg.ServerPort))
	if err := r.Run(":" + cfg.ServerPort); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

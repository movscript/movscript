package bootstrap

import (
	"context"
	"encoding/hex"
	"fmt"
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
	entitlementapp "github.com/movscript/movscript/internal/app/entitlement"
	hubapp "github.com/movscript/movscript/internal/app/hub"
	"github.com/movscript/movscript/internal/domain/commercial"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/auth"
	"github.com/movscript/movscript/internal/infra/config"
	"github.com/movscript/movscript/internal/infra/db"
	"github.com/movscript/movscript/internal/infra/jobrunner"
	"github.com/movscript/movscript/internal/infra/observability"
	"github.com/movscript/movscript/internal/infra/storage"
	"github.com/movscript/movscript/internal/interfaces/http/router"
	"gorm.io/gorm"
)

type App struct {
	Config       *config.Config
	DB           *gorm.DB
	Store        storage.Storage
	Tokens       *auth.Manager
	Registry     *ai.Registry
	AIService    *ai.AIService
	Entitlements commercial.EntitlementService
	Worker       *jobrunner.Worker
	Router       *gin.Engine
}

func New() (*App, error) {
	cfg := config.Load()
	if err := cfg.ValidateStartup(); err != nil {
		return nil, err
	}
	observability.Logger().Info("startup_config_validated", slog.Any("config", cfg.SafeSummary()))

	database, err := db.Connect(cfg)
	if err != nil {
		return nil, fmt.Errorf("connect database: %w", err)
	}
	if cfg.AppMode == "local" && cfg.DBDriver == "sqlite" {
		if err := db.RunMigrations(database); err != nil {
			return nil, fmt.Errorf("run local database migrations: %w", err)
		}
	} else {
		if err := db.EnsureMigrationsCurrent(database); err != nil {
			return nil, fmt.Errorf("check database migrations: %w", err)
		}
	}

	store, err := storage.New(cfg)
	if err != nil {
		return nil, fmt.Errorf("initialize object storage: %w", err)
	}
	observability.Logger().Info(
		"storage_initialized",
		slog.String("backend", store.Backend()),
	)
	if err := hubapp.NewService(database, store).Seed(context.Background()); err != nil {
		return nil, fmt.Errorf("seed hub packages: %w", err)
	}

	tokens, err := auth.NewManager(cfg.AuthTokenSecret, time.Duration(cfg.AuthTokenTTLHours)*time.Hour)
	if err != nil {
		return nil, fmt.Errorf("initialize auth manager: %w", err)
	}

	encKey, err := hex.DecodeString(cfg.EncryptionKey)
	if err != nil {
		return nil, fmt.Errorf("decode encryption key: %w", err)
	}

	registry := ai.NewRegistry(database, encKey)
	aiService := ai.NewAIService(database, registry)
	entitlements := entitlementapp.NewService(database, cfg)
	worker := jobrunner.NewWorker(database, aiService, store, encKey)

	engine := router.New(router.Dependencies{
		DB:            database,
		Config:        cfg,
		Store:         store,
		Tokens:        tokens,
		Registry:      registry,
		AIService:     aiService,
		Entitlements:  entitlements,
		EncryptionKey: encKey,
	})

	return &App{
		Config:       cfg,
		DB:           database,
		Store:        store,
		Tokens:       tokens,
		Registry:     registry,
		AIService:    aiService,
		Entitlements: entitlements,
		Worker:       worker,
		Router:       engine,
	}, nil
}

func (a *App) StartWorkers(ctx context.Context, workers int) {
	if a == nil || a.Worker == nil || workers <= 0 {
		return
	}
	a.Worker.Start(ctx, workers)
}

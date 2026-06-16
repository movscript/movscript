package bootstrap

import (
	"context"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	entitlementapp "github.com/movscript/movscript/internal/app/entitlement"
	hubapp "github.com/movscript/movscript/internal/app/hub"
	"github.com/movscript/movscript/internal/app/systemstream"
	"github.com/movscript/movscript/internal/domain/entitlement"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/auth"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/infra/config"
	"github.com/movscript/movscript/internal/infra/db"
	"github.com/movscript/movscript/internal/infra/observability"
	"github.com/movscript/movscript/internal/infra/runner"
	"github.com/movscript/movscript/internal/infra/storage"
	"github.com/movscript/movscript/internal/interfaces/http/router"
	providerassembly "github.com/movscript/movscript/internal/providers/assembly"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

type App struct {
	Config         *config.Config
	DB             *gorm.DB
	Store          storage.Storage
	Tokens         *auth.Manager
	Registry       *ai.Registry
	AIService      *ai.AIService
	ImageVerifier  ai.ImageVerificationClient
	Cache          cache.Cache
	VectorIndex    providercontract.VectorIndexProvider
	Entitlements   entitlement.EntitlementService
	SystemMessages *systemstream.Hub
	Worker         *runner.Worker
	Router         *gin.Engine
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
	if shouldRunStartupMigrations() || cfg.AppMode == "local" && cfg.DBDriver == "sqlite" {
		if err := db.RunMigrations(database); err != nil {
			return nil, fmt.Errorf("run database migrations: %w", err)
		}
	} else {
		if err := db.EnsureMigrationsCurrent(database); err != nil {
			return nil, fmt.Errorf("check database migrations: %w", err)
		}
	}

	tokens, err := auth.NewManager(cfg.AuthTokenSecret, time.Duration(cfg.AuthTokenTTLHours)*time.Hour)
	if err != nil {
		return nil, fmt.Errorf("initialize auth manager: %w", err)
	}

	encKey, err := hex.DecodeString(cfg.EncryptionKey)
	if err != nil {
		return nil, fmt.Errorf("decode encryption key: %w", err)
	}

	providers, err := providerassembly.BuildRuntimeProviders(context.Background(), database, cfg, encKey)
	if err != nil {
		return nil, fmt.Errorf("build runtime providers: %w", err)
	}
	store := providers.Store
	registry := providers.Registry
	aiService := providers.AIService
	cacheStore := providers.Cache
	vectorIndex := providers.VectorIndex
	observability.Logger().Info(
		"storage_initialized",
		slog.String("backend", store.Backend()),
	)
	if err := hubapp.NewService(database, store).Seed(context.Background()); err != nil {
		return nil, fmt.Errorf("seed hub packages: %w", err)
	}
	if err := migrateEditionModules(context.Background(), database, cfg); err != nil {
		return nil, fmt.Errorf("migrate edition modules: %w", err)
	}
	if err := seedEditionData(context.Background(), database, cfg); err != nil {
		return nil, fmt.Errorf("seed edition data: %w", err)
	}
	var imageVerifier ai.ImageVerificationClient
	if cfg.ImageVerifyBaseURL != "" {
		imageVerifier = ai.NewHTTPImageVerificationClient(cfg.ImageVerifyBaseURL, cfg.ImageVerifyAPIKey)
	}
	entitlements := entitlementapp.NewService(database, cfg)
	systemMessages := systemstream.NewHub()
	worker := runner.NewWorker(database, aiService, store, encKey, systemMessages)

	engine := router.New(router.Dependencies{
		DB:             database,
		Config:         cfg,
		Store:          store,
		Tokens:         tokens,
		Registry:       registry,
		AIService:      aiService,
		ImageVerifier:  imageVerifier,
		Cache:          cacheStore,
		VectorIndex:    vectorIndex,
		Entitlements:   entitlements,
		SystemMessages: systemMessages,
		EncryptionKey:  encKey,
	})

	return &App{
		Config:         cfg,
		DB:             database,
		Store:          store,
		Tokens:         tokens,
		Registry:       registry,
		AIService:      aiService,
		Cache:          cacheStore,
		VectorIndex:    vectorIndex,
		Entitlements:   entitlements,
		SystemMessages: systemMessages,
		Worker:         worker,
		Router:         engine,
	}, nil
}

func (a *App) StartWorkers(ctx context.Context, workers int) {
	if a == nil || a.Worker == nil || workers <= 0 {
		return
	}
	a.Worker.Start(ctx, workers)
}

func shouldRunStartupMigrations() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("MOVSCRIPT_AUTO_MIGRATE"))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

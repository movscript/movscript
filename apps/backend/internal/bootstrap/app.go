package bootstrap

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	entitlementapp "github.com/movscript/movscript/internal/app/entitlement"
	hubapp "github.com/movscript/movscript/internal/app/hub"
	mediastreamapp "github.com/movscript/movscript/internal/app/mediastream"
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
	background     sync.WaitGroup
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

func (a *App) StartMediaStreamCleanup(ctx context.Context) {
	if a == nil || a.DB == nil || a.Store == nil {
		return
	}
	interval := mediaStreamCleanupInterval()
	if interval <= 0 {
		return
	}
	limit := mediaStreamCleanupLimit()
	service := mediastreamapp.NewService(a.DB, a.Store)
	a.background.Add(1)
	go func() {
		defer a.background.Done()
		service.RunExpiredCleanupLoop(ctx, mediastreamapp.CleanupLoopOptions{
			Interval: interval,
			Limit:    limit,
			OnResult: func(result mediastreamapp.CleanupExpiredResult) {
				if result.Candidates == 0 && result.Deleted == 0 {
					return
				}
				observability.Logger().Info(
					"media_stream_expired_gc_completed",
					slog.String("backend", result.Backend),
					slog.Int("candidates", result.Candidates),
					slog.Int("deleted", result.Deleted),
					slog.Int("objects_deleted", result.ObjectsDeleted),
					slog.Int64("freed_bytes", result.FreedBytes),
				)
			},
			OnError: func(err error) {
				observability.Logger().Warn("media_stream_expired_gc_failed", slog.String("error", err.Error()))
			},
		})
	}()
	observability.Logger().Info(
		"media_stream_expired_gc_started",
		slog.Duration("interval", interval),
		slog.Int("limit", limit),
	)
}

func (a *App) WaitForBackground(ctx context.Context) error {
	if a == nil {
		return nil
	}
	return errors.Join(a.waitForWorkers(ctx), waitGroupContext(ctx, &a.background))
}

func (a *App) Close() error {
	if a == nil {
		return nil
	}
	var errs []error
	if a.Cache != nil {
		if err := a.Cache.Close(); err != nil {
			errs = append(errs, fmt.Errorf("close cache: %w", err))
		}
	}
	if a.DB != nil {
		sqlDB, err := a.DB.DB()
		if err != nil {
			errs = append(errs, fmt.Errorf("resolve database handle: %w", err))
		} else if err := sqlDB.Close(); err != nil {
			errs = append(errs, fmt.Errorf("close database: %w", err))
		}
	}
	return errors.Join(errs...)
}

func (a *App) waitForWorkers(ctx context.Context) error {
	if a == nil || a.Worker == nil {
		return nil
	}
	return a.Worker.WaitContext(ctx)
}

func waitGroupContext(ctx context.Context, wg *sync.WaitGroup) error {
	if wg == nil {
		return nil
	}
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func shouldRunStartupMigrations() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("MOVSCRIPT_AUTO_MIGRATE"))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func mediaStreamCleanupInterval() time.Duration {
	value := strings.TrimSpace(os.Getenv("MOVSCRIPT_MEDIA_STREAM_GC_INTERVAL_SECONDS"))
	if value == "" {
		return 0
	}
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		return 0
	}
	return time.Duration(seconds) * time.Second
}

func mediaStreamCleanupLimit() int {
	value := strings.TrimSpace(os.Getenv("MOVSCRIPT_MEDIA_STREAM_GC_LIMIT"))
	if value == "" {
		return 100
	}
	limit, err := strconv.Atoi(value)
	if err != nil || limit <= 0 {
		return 100
	}
	if limit > 1000 {
		return 1000
	}
	return limit
}

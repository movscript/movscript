package db

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/movscript/movscript/internal/infra/config"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func Connect(cfg *config.Config) (*gorm.DB, error) {
	switch cfg.DBDriver {
	case "postgres":
		return connectPostgres(cfg)
	case "sqlite":
		return connectSQLite(cfg)
	default:
		return nil, fmt.Errorf("unsupported database driver %q", cfg.DBDriver)
	}
}

func connectPostgres(cfg *config.Config) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName,
	)

	return open(postgres.Open(dsn))
}

func connectSQLite(cfg *config.Config) (*gorm.DB, error) {
	path := cfg.DBPath
	if path == "" {
		return nil, fmt.Errorf("DB_PATH is required")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve sqlite database path: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return nil, fmt.Errorf("create sqlite database directory: %w", err)
	}
	return open(sqlite.Open(abs + "?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"))
}

func open(dialector gorm.Dialector) (*gorm.DB, error) {
	db, err := gorm.Open(dialector, &gorm.Config{
		// Prevents GORM from trying to create FK constraints across tables during
		// AutoMigrate. Without this, migrating Script (which has a has-many to Episode)
		// causes GORM to ALTER episodes before that table exists, rolling back the
		// entire transaction and leaving scripts uncreated — which then breaks the
		// Episode migration that references it.
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return nil, err
	}

	return db, nil
}

package db

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Connect(config Config) (*gorm.DB, error) {
	switch config.Driver {
	case "postgres":
		return connectPostgres(config)
	case "sqlite":
		return connectSQLite(config)
	default:
		return nil, fmt.Errorf("unsupported auth database driver %q", config.Driver)
	}
}

func connectPostgres(config Config) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		config.Host,
		config.Port,
		config.User,
		config.Password,
		config.Name,
	)
	return open(postgres.Open(dsn), config)
}

func connectSQLite(config Config) (*gorm.DB, error) {
	if config.Path == "" {
		return nil, fmt.Errorf("MOVSCRIPT_AUTH_DB_PATH is required when MOVSCRIPT_AUTH_DB_DRIVER=sqlite")
	}
	if config.Path == ":memory:" {
		return open(sqlite.Open("file::memory:?cache=shared"), config)
	}
	abs, err := filepath.Abs(config.Path)
	if err != nil {
		return nil, fmt.Errorf("resolve auth sqlite database path: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return nil, fmt.Errorf("create auth sqlite database directory: %w", err)
	}
	return open(sqlite.Open(abs+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"), config)
}

func open(dialector gorm.Dialector, config Config) (*gorm.DB, error) {
	slowThreshold := 200 * time.Millisecond
	if config.SlowThresholdMS > 0 {
		slowThreshold = time.Duration(config.SlowThresholdMS) * time.Millisecond
	}
	return gorm.Open(dialector, &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
		Logger: logger.New(slog.NewLogLogger(slog.Default().Handler(), slog.LevelWarn), logger.Config{
			SlowThreshold: slowThreshold,
			LogLevel:      logger.Warn,
		}),
	})
}

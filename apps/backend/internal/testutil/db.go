package testutil

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func OpenSQLite(t testing.TB, name string, models ...any) *gorm.DB {
	t.Helper()
	return OpenSQLiteWithConfig(t, name, &gorm.Config{}, models...)
}

func OpenSQLiteWithConfig(t testing.TB, name string, config *gorm.Config, models ...any) *gorm.DB {
	t.Helper()
	if name == "" {
		name = "test.db"
	}
	if config == nil {
		config = &gorm.Config{}
	}
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), name)), config)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if len(models) > 0 {
		if err := db.AutoMigrate(models...); err != nil {
			t.Fatalf("migrate sqlite: %v", err)
		}
	}
	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func OpenPostgresDryRun(t testing.TB) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(postgres.New(postgres.Config{
		Conn:             dryRunConnPool{},
		WithoutReturning: true,
	}), &gorm.Config{
		DryRun: true,
		Logger: logger.Discard,
	})
	if err != nil {
		t.Fatalf("open postgres dry-run db: %v", err)
	}
	return db
}

type dryRunConnPool struct{}

func (dryRunConnPool) PrepareContext(context.Context, string) (*sql.Stmt, error) {
	return nil, errors.New("unexpected prepare in dry run")
}

func (dryRunConnPool) ExecContext(context.Context, string, ...any) (sql.Result, error) {
	return nil, errors.New("unexpected exec in dry run")
}

func (dryRunConnPool) QueryContext(context.Context, string, ...any) (*sql.Rows, error) {
	return nil, errors.New("unexpected query in dry run")
}

func (dryRunConnPool) QueryRowContext(context.Context, string, ...any) *sql.Row {
	return nil
}

func (dryRunConnPool) Commit() error {
	return nil
}

func (dryRunConnPool) Rollback() error {
	return nil
}

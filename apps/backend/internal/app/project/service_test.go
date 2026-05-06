package project

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type dryRunConnPool struct{}

func (dryRunConnPool) PrepareContext(context.Context, string) (*sql.Stmt, error) {
	return nil, errors.New("unexpected prepare in dry run")
}

func (dryRunConnPool) ExecContext(context.Context, string, ...interface{}) (sql.Result, error) {
	return nil, errors.New("unexpected exec in dry run")
}

func (dryRunConnPool) QueryContext(context.Context, string, ...interface{}) (*sql.Rows, error) {
	return nil, errors.New("unexpected query in dry run")
}

func (dryRunConnPool) QueryRowContext(context.Context, string, ...interface{}) *sql.Row {
	return nil
}

func (dryRunConnPool) Commit() error {
	return nil
}

func (dryRunConnPool) Rollback() error {
	return nil
}

func TestCreateBuildsOwnerMemberWithoutPanic(t *testing.T) {
	db, err := gorm.Open(postgres.New(postgres.Config{
		Conn:             dryRunConnPool{},
		WithoutReturning: true,
	}), &gorm.Config{
		DryRun: true,
		Logger: logger.Discard,
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

	orgID := uint(3)
	service := NewService(db)

	defer func() {
		if recovered := recover(); recovered != nil {
			t.Fatalf("Create panicked: %v", recovered)
		}
	}()

	project, err := service.Create(context.Background(), CreateInput{
		Name:          "Film",
		Description:   "desc",
		TotalEpisodes: 12,
	}, 7, &orgID)
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if project.Name != "Film" || project.OwnerID != 7 || project.OrgID == nil || *project.OrgID != orgID {
		t.Fatalf("unexpected project: %+v", project)
	}
}

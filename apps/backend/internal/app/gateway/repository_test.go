package gateway

import (
	"context"
	"testing"

	domaingateway "github.com/movscript/movscript/internal/domain/gateway"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestGormRepositoryUpdateAPIKeyPersistsDomainFields(t *testing.T) {
	db := openModelGatewayRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	key := domaingateway.NewAPIKey(domaingateway.NewAPIKeySpec{
		Name:            "Original",
		KeyPrefix:       "mgw_prefix",
		KeyHash:         "hash",
		OwnerUserID:     1,
		AllowedModelIDs: []uint{1},
		AllowedScopes:   []string{"model:chat"},
	})
	if err := repo.CreateAPIKey(context.Background(), &key); err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	name := " Updated "
	enabled := false
	projectID := uint(9)
	key.ApplyUpdate(domaingateway.APIKeyUpdateSpec{
		Name:            &name,
		ProjectID:       &projectID,
		ProjectIDSet:    true,
		AllowedModelIDs: []uint{2, 3},
		AllowedScopes:   []string{"*"},
		IsEnabled:       &enabled,
	})
	if err := repo.UpdateAPIKey(context.Background(), &key); err != nil {
		t.Fatalf("UpdateAPIKey() error = %v", err)
	}

	var row model.GatewayAPIKey
	if err := db.First(&row, key.ID).Error; err != nil {
		t.Fatalf("load key: %v", err)
	}
	if row.Name != "Updated" {
		t.Fatalf("Name = %q, want Updated", row.Name)
	}
	if row.AllowedModelIDs != "[2,3]" {
		t.Fatalf("AllowedModelIDs = %q, want [2,3]", row.AllowedModelIDs)
	}
	if row.AllowedScopes != `["*"]` {
		t.Fatalf("AllowedScopes = %q, want [\"*\"]", row.AllowedScopes)
	}
	if row.IsEnabled {
		t.Fatal("IsEnabled = true, want false")
	}
	if row.ProjectID == nil || *row.ProjectID != projectID {
		t.Fatalf("ProjectID = %#v, want %d", row.ProjectID, projectID)
	}
}

func openModelGatewayRepositoryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "modelgateway_repository.db", &model.GatewayAPIKey{})
}

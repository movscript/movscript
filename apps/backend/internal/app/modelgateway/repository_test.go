package modelgateway

import (
	"context"
	"testing"

	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestGormRepositoryUpdateAPIKeyPersistsDomainFields(t *testing.T) {
	db := openModelGatewayRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	key := domainmodelgateway.NewAPIKey(domainmodelgateway.NewAPIKeySpec{
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
	key.ApplyUpdate(domainmodelgateway.APIKeyUpdateSpec{
		Name:            &name,
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
}

func openModelGatewayRepositoryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.GatewayAPIKey{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

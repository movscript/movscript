package auth

import (
	"context"
	"path/filepath"
	"testing"

	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestGormRepositoryUpdateUserPersistsUpdateSpecZeroValues(t *testing.T) {
	db := openAuthRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	row := model.User{
		Username:     "alice",
		PasswordHash: "old-hash",
		DisplayName:  "Alice",
		AvatarURL:    "avatar",
		Locale:       "en",
		Status:       domainauth.UserStatusActive,
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	empty := ""

	if err := repo.UpdateUser(context.Background(), row.ID, domainauth.UserUpdateSpec{
		PasswordHash: &empty,
		DisplayName:  &empty,
		AvatarURL:    &empty,
		Locale:       &empty,
	}); err != nil {
		t.Fatalf("UpdateUser() error = %v", err)
	}

	var stored model.User
	if err := db.First(&stored, row.ID).Error; err != nil {
		t.Fatalf("load user: %v", err)
	}
	if stored.PasswordHash != "" || stored.DisplayName != "" || stored.AvatarURL != "" || stored.Locale != "" {
		t.Fatalf("zero-value user updates were not persisted: %+v", stored)
	}
}

func openAuthRepositoryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "auth_repository.db")), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.User{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

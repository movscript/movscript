package db

import (
	"fmt"

	"github.com/movscript/movscript/internal/infra/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func Connect(cfg *config.Config) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName,
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
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

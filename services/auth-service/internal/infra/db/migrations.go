package db

import (
	persistencemodel "github.com/movscript/auth-service/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func RunMigrations(db *gorm.DB) error {
	return db.AutoMigrate(
		&persistencemodel.User{},
		&persistencemodel.Organization{},
		&persistencemodel.OrganizationMember{},
	)
}

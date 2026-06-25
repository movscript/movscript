package org

import (
	"strings"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func generateUniqueJoinCode(db *gorm.DB) (string, error) {
	for i := 0; i < 8; i++ {
		code, err := GenerateJoinCode()
		if err != nil {
			return "", err
		}
		var count int64
		if err := db.Model(&persistencemodel.Organization{}).Where("join_code = ?", code).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return code, nil
		}
	}
	return "", ErrConflict
}

func EnsureJoinCode(db *gorm.DB, org *persistencemodel.Organization) error {
	if strings.TrimSpace(org.JoinCode) != "" {
		return nil
	}
	code, err := generateUniqueJoinCode(db)
	if err != nil {
		return err
	}
	org.JoinCode = code
	return db.Model(org).Update("join_code", code).Error
}

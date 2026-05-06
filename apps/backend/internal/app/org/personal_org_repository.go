package org

import (
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"gorm.io/gorm"
)

func generateUniqueJoinCode(db *gorm.DB) (string, error) {
	for i := 0; i < 8; i++ {
		code, err := GenerateJoinCode()
		if err != nil {
			return "", err
		}
		var count int64
		if err := db.Model(&model.Organization{}).Where("join_code = ?", code).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return code, nil
		}
	}
	return "", ErrConflict
}

func EnsureJoinCode(db *gorm.DB, org *model.Organization) error {
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

func CreatePersonalOrg(db *gorm.DB, user *model.User) error {
	var count int64
	db.Model(&model.Organization{}).Where("slug = ?", user.Username).Count(&count)
	org := domainorg.NewPersonalOrg(*user, count > 0)
	if err := db.Create(&org).Error; err != nil {
		return err
	}
	member := domainorg.OwnerMember(org.ID, user.ID)
	return db.Create(&member).Error
}

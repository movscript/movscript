//go:build !enterprise

package handler

import "gorm.io/gorm"

type orgCommercialDeps struct{}

func newOrgCommercialDeps(db *gorm.DB) orgCommercialDeps {
	return orgCommercialDeps{}
}

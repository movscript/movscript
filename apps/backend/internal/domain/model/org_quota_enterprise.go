//go:build enterprise

package model

import "gorm.io/gorm"

// OrgQuota stores the monthly commercial budget cap for an organization.
type OrgQuota struct {
	gorm.Model
	OrgID         uint    `gorm:"uniqueIndex;not null" json:"org_id"`
	MonthlyBudget float64 `gorm:"default:0" json:"monthly_budget"`
}

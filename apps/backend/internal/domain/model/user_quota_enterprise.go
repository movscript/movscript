//go:build enterprise

package model

import "gorm.io/gorm"

type UserQuota struct {
	gorm.Model
	UserID  uint    `gorm:"uniqueIndex;not null" json:"user_id"`
	Balance float64 `gorm:"default:0" json:"balance"`
}

package model

import "gorm.io/gorm"

type AdminSetting struct {
	gorm.Model
	Key       string `gorm:"uniqueIndex;not null;size:128" json:"key"`
	ValueJSON string `gorm:"type:text;not null" json:"value_json"`
}

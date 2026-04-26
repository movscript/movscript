package model

import "gorm.io/gorm"

type UserQuota struct {
	gorm.Model
	UserID  uint    `gorm:"uniqueIndex;not null" json:"user_id"`
	Balance float64 `gorm:"default:0" json:"balance"`
}

type UsageLog struct {
	gorm.Model
	UserID          uint          `gorm:"not null" json:"user_id"`
	AIModelConfigID uint          `gorm:"not null" json:"ai_model_config_id"`
	OperationType   string        `gorm:"not null" json:"operation_type"` // text|image|video
	InputTokens     int           `gorm:"default:0" json:"input_tokens"`
	OutputTokens    int           `gorm:"default:0" json:"output_tokens"`
	DurationSec     int           `gorm:"default:0" json:"duration_sec"` // per_second billing
	ImageCount      int           `gorm:"default:1" json:"image_count"`  // per_image billing
	Cost            float64       `gorm:"default:0" json:"cost"`
	User            User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
	AIModelConfig   AIModelConfig `gorm:"foreignKey:AIModelConfigID" json:"ai_model_config,omitempty"`
}

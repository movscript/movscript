package model

import "gorm.io/gorm"

// PaymentConfig stores encrypted merchant credentials for a payment provider.
// Supported types: "alipay" | "wechat_pay" | "stripe".
type PaymentConfig struct {
	gorm.Model
	Name         string `gorm:"not null" json:"name"`
	ConfigType   string `gorm:"not null;index" json:"config_type"`
	Mode         string `gorm:"not null;default:sandbox" json:"mode"`
	Currency     string `gorm:"not null;default:CNY" json:"currency"`
	ConfigJSON   string `gorm:"not null" json:"-"`
	Priority     int    `gorm:"default:0" json:"priority"`
	IsEnabled    bool   `gorm:"default:true" json:"is_enabled"`
	MaskedConfig string `gorm:"-" json:"masked_config,omitempty"`
}

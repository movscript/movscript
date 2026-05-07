package paymentconfig

import "github.com/movscript/movscript/internal/domain/model"

func ConfigFromModel(config model.PaymentConfig) Config {
	return Config{
		ID:           config.ID,
		Name:         config.Name,
		ConfigType:   config.ConfigType,
		Mode:         config.Mode,
		Currency:     config.Currency,
		ConfigJSON:   config.ConfigJSON,
		Priority:     config.Priority,
		IsEnabled:    config.IsEnabled,
		MaskedConfig: config.MaskedConfig,
	}
}

func (config Config) ToModel() model.PaymentConfig {
	var target model.PaymentConfig
	config.ApplyToModel(&target)
	return target
}

func (config Config) ApplyToModel(target *model.PaymentConfig) {
	target.Model.ID = config.ID
	target.Name = config.Name
	target.ConfigType = config.ConfigType
	target.Mode = config.Mode
	target.Currency = config.Currency
	target.ConfigJSON = config.ConfigJSON
	target.Priority = config.Priority
	target.IsEnabled = config.IsEnabled
	target.MaskedConfig = config.MaskedConfig
}

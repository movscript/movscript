package cloudfileconfig

import "github.com/movscript/movscript/internal/domain/model"

func ConfigFromModel(config model.CloudFileConfig) Config {
	return Config{
		ID:           config.ID,
		Name:         config.Name,
		ConfigType:   config.ConfigType,
		ConfigJSON:   config.ConfigJSON,
		Priority:     config.Priority,
		IsEnabled:    config.IsEnabled,
		MaskedConfig: config.MaskedConfig,
	}
}

func (config Config) ToModel() model.CloudFileConfig {
	var target model.CloudFileConfig
	config.ApplyToModel(&target)
	return target
}

func (config Config) ApplyToModel(target *model.CloudFileConfig) {
	target.Model.ID = config.ID
	target.Name = config.Name
	target.ConfigType = config.ConfigType
	target.ConfigJSON = config.ConfigJSON
	target.Priority = config.Priority
	target.IsEnabled = config.IsEnabled
	target.MaskedConfig = config.MaskedConfig
}

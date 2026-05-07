package cloudfileconfig

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func ConfigFromModel(config persistencemodel.CloudFileConfig) Config {
	return Config{
		ID:           config.ID,
		Name:         config.Name,
		ConfigType:   config.ConfigType,
		ConfigJSON:   config.ConfigJSON,
		Priority:     config.Priority,
		IsEnabled:    config.IsEnabled,
		MaskedConfig: config.MaskedConfig,
		CreatedAt:    config.CreatedAt,
		UpdatedAt:    config.UpdatedAt,
	}
}

func (config Config) ToModel() persistencemodel.CloudFileConfig {
	var target persistencemodel.CloudFileConfig
	config.ApplyToModel(&target)
	return target
}

func (config Config) ApplyToModel(target *persistencemodel.CloudFileConfig) {
	target.Model.ID = config.ID
	target.Model.CreatedAt = config.CreatedAt
	target.Model.UpdatedAt = config.UpdatedAt
	target.Name = config.Name
	target.ConfigType = config.ConfigType
	target.ConfigJSON = config.ConfigJSON
	target.Priority = config.Priority
	target.IsEnabled = config.IsEnabled
	target.MaskedConfig = config.MaskedConfig
}

package feature

import "github.com/movscript/movscript/internal/domain/model"

func FeatureConfigFromModel(config model.FeatureConfig) FeatureConfig {
	return FeatureConfig{
		ID:                   config.ID,
		FeatureKey:           config.FeatureKey,
		DisplayName:          config.DisplayName,
		Description:          config.Description,
		Capability:           config.Capability,
		IsEnabled:            config.IsEnabled,
		OrgID:                config.OrgID,
		AllowedModelIDs:      config.AllowedModelIDs,
		DefaultModelID:       config.DefaultModelID,
		AllowedRoles:         config.AllowedRoles,
		SystemPromptOverride: config.SystemPromptOverride,
		MaxTokensOverride:    config.MaxTokensOverride,
		CreatedAt:            config.CreatedAt,
		UpdatedAt:            config.UpdatedAt,
	}
}

func (config FeatureConfig) ToModel() model.FeatureConfig {
	var target model.FeatureConfig
	config.ApplyToModel(&target)
	return target
}

func (config FeatureConfig) ApplyToModel(target *model.FeatureConfig) {
	target.Model.ID = config.ID
	target.Model.CreatedAt = config.CreatedAt
	target.Model.UpdatedAt = config.UpdatedAt
	target.FeatureKey = config.FeatureKey
	target.DisplayName = config.DisplayName
	target.Description = config.Description
	target.Capability = config.Capability
	target.IsEnabled = config.IsEnabled
	target.OrgID = config.OrgID
	target.AllowedModelIDs = config.AllowedModelIDs
	target.DefaultModelID = config.DefaultModelID
	target.AllowedRoles = config.AllowedRoles
	target.SystemPromptOverride = config.SystemPromptOverride
	target.MaxTokensOverride = config.MaxTokensOverride
}

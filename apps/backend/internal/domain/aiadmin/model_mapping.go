package aiadmin

import "github.com/movscript/movscript/internal/domain/model"

func CredentialFromModel(credential model.AICredential) Credential {
	models := make([]ModelConfig, 0, len(credential.Models))
	for _, config := range credential.Models {
		models = append(models, ModelConfigFromModel(config))
	}
	return Credential{
		ID:                   credential.ID,
		AdapterType:          credential.AdapterType,
		DisplayName:          credential.DisplayName,
		BaseURL:              credential.BaseURL,
		EncryptedKey:         credential.EncryptedKey,
		MaskedKey:            credential.MaskedKey,
		IsEnabled:            credential.IsEnabled,
		OrgID:                credential.OrgID,
		Models:               models,
		FilesAPIEnabled:      credential.FilesAPIEnabled,
		FilesAPIBaseURL:      credential.FilesAPIBaseURL,
		FilesAPIEncryptedKey: credential.FilesAPIEncryptedKey,
		FilesAPIMaskedKey:    credential.FilesAPIMaskedKey,
		CreatedAt:            credential.CreatedAt,
		UpdatedAt:            credential.UpdatedAt,
	}
}

func (credential Credential) ToModel() model.AICredential {
	var target model.AICredential
	credential.ApplyToModel(&target)
	return target
}

func (credential Credential) ApplyToModel(target *model.AICredential) {
	target.Model.ID = credential.ID
	target.Model.CreatedAt = credential.CreatedAt
	target.Model.UpdatedAt = credential.UpdatedAt
	target.AdapterType = credential.AdapterType
	target.DisplayName = credential.DisplayName
	target.BaseURL = credential.BaseURL
	target.EncryptedKey = credential.EncryptedKey
	target.MaskedKey = credential.MaskedKey
	target.IsEnabled = credential.IsEnabled
	target.OrgID = credential.OrgID
	target.Models = make([]model.AIModelConfig, 0, len(credential.Models))
	for _, config := range credential.Models {
		target.Models = append(target.Models, config.ToModel())
	}
	target.FilesAPIEnabled = credential.FilesAPIEnabled
	target.FilesAPIBaseURL = credential.FilesAPIBaseURL
	target.FilesAPIEncryptedKey = credential.FilesAPIEncryptedKey
	target.FilesAPIMaskedKey = credential.FilesAPIMaskedKey
}

func ModelConfigFromModel(config model.AIModelConfig) ModelConfig {
	return ModelConfig{
		ID:                    config.ID,
		CredentialID:          config.CredentialID,
		ModelDefID:            config.ModelDefID,
		ModelIDOverride:       config.ModelIDOverride,
		IsEnabled:             config.IsEnabled,
		Priority:              config.Priority,
		CreditsInputPer1M:     config.CreditsInputPer1M,
		CreditsOutputPer1M:    config.CreditsOutputPer1M,
		CreditsPerImage:       config.CreditsPerImage,
		CreditsPerSecond:      config.CreditsPerSecond,
		CreditsPerCall:        config.CreditsPerCall,
		CustomDisplayName:     config.CustomDisplayName,
		ShortName:             config.ShortName,
		CustomCapabilities:    config.CustomCapabilities,
		CustomBillingMode:     config.CustomBillingMode,
		CustomAcceptsImage:    config.CustomAcceptsImage,
		CustomMaxInputImages:  config.CustomMaxInputImages,
		CustomMaxInputVideos:  config.CustomMaxInputVideos,
		CustomImageEditField:  config.CustomImageEditField,
		CustomSupportedParams: config.CustomSupportedParams,
		CreatedAt:             config.CreatedAt,
		UpdatedAt:             config.UpdatedAt,
	}
}

func (config ModelConfig) ToModel() model.AIModelConfig {
	var target model.AIModelConfig
	config.ApplyToModel(&target)
	return target
}

func (config ModelConfig) ApplyToModel(target *model.AIModelConfig) {
	target.Model.ID = config.ID
	target.Model.CreatedAt = config.CreatedAt
	target.Model.UpdatedAt = config.UpdatedAt
	target.CredentialID = config.CredentialID
	target.ModelDefID = config.ModelDefID
	target.ModelIDOverride = config.ModelIDOverride
	target.IsEnabled = config.IsEnabled
	target.Priority = config.Priority
	target.CreditsInputPer1M = config.CreditsInputPer1M
	target.CreditsOutputPer1M = config.CreditsOutputPer1M
	target.CreditsPerImage = config.CreditsPerImage
	target.CreditsPerSecond = config.CreditsPerSecond
	target.CreditsPerCall = config.CreditsPerCall
	target.CustomDisplayName = config.CustomDisplayName
	target.ShortName = config.ShortName
	target.CustomCapabilities = config.CustomCapabilities
	target.CustomBillingMode = config.CustomBillingMode
	target.CustomAcceptsImage = config.CustomAcceptsImage
	target.CustomMaxInputImages = config.CustomMaxInputImages
	target.CustomMaxInputVideos = config.CustomMaxInputVideos
	target.CustomImageEditField = config.CustomImageEditField
	target.CustomSupportedParams = config.CustomSupportedParams
}

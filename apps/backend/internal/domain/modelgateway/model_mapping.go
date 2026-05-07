package modelgateway

import "github.com/movscript/movscript/internal/domain/model"

func APIKeyFromModel(key model.GatewayAPIKey) APIKey {
	return APIKey{
		ID:              key.ID,
		Name:            key.Name,
		KeyPrefix:       key.KeyPrefix,
		KeyHash:         key.KeyHash,
		OwnerUserID:     key.OwnerUserID,
		OrgID:           key.OrgID,
		ProjectID:       key.ProjectID,
		AllowedModelIDs: key.AllowedModelIDs,
		AllowedScopes:   key.AllowedScopes,
		RateLimitRPM:    key.RateLimitRPM,
		MonthlyBudget:   key.MonthlyBudget,
		IsEnabled:       key.IsEnabled,
		LastUsedAt:      key.LastUsedAt,
	}
}

func (key APIKey) ToModel() model.GatewayAPIKey {
	var target model.GatewayAPIKey
	key.ApplyToModel(&target)
	return target
}

func (key APIKey) ApplyToModel(target *model.GatewayAPIKey) {
	target.Model.ID = key.ID
	target.Name = key.Name
	target.KeyPrefix = key.KeyPrefix
	target.KeyHash = key.KeyHash
	target.OwnerUserID = key.OwnerUserID
	target.OrgID = key.OrgID
	target.ProjectID = key.ProjectID
	target.AllowedModelIDs = key.AllowedModelIDs
	target.AllowedScopes = key.AllowedScopes
	target.RateLimitRPM = key.RateLimitRPM
	target.MonthlyBudget = key.MonthlyBudget
	target.IsEnabled = key.IsEnabled
	target.LastUsedAt = key.LastUsedAt
}

package modelgateway

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func APIKeyFromModel(key persistencemodel.GatewayAPIKey) APIKey {
	target := APIKey{
		ID:              key.ID,
		Name:            key.Name,
		KeyPrefix:       key.KeyPrefix,
		KeyHash:         key.KeyHash,
		OwnerUserID:     key.OwnerUserID,
		OrgID:           key.OrgID,
		ProjectID:       key.ProjectID,
		AllowedModelIDs: key.AllowedModelIDs,
		AllowedScopes:   key.AllowedScopes,
		IsEnabled:       key.IsEnabled,
		LastUsedAt:      key.LastUsedAt,
		CreatedAt:       key.CreatedAt,
		UpdatedAt:       key.UpdatedAt,
	}
	applyAPIKeyRuntimeFromModel(&target, key)
	return target
}

func (key APIKey) ToModel() persistencemodel.GatewayAPIKey {
	var target persistencemodel.GatewayAPIKey
	key.ApplyToModel(&target)
	return target
}

func (key APIKey) ApplyToModel(target *persistencemodel.GatewayAPIKey) {
	target.Model.ID = key.ID
	target.Name = key.Name
	target.KeyPrefix = key.KeyPrefix
	target.KeyHash = key.KeyHash
	target.OwnerUserID = key.OwnerUserID
	target.OrgID = key.OrgID
	target.ProjectID = key.ProjectID
	target.AllowedModelIDs = key.AllowedModelIDs
	target.AllowedScopes = key.AllowedScopes
	target.IsEnabled = key.IsEnabled
	target.LastUsedAt = key.LastUsedAt
	target.CreatedAt = key.CreatedAt
	target.UpdatedAt = key.UpdatedAt
	applyAPIKeyRuntimeToModel(key, target)
}

package ai

import persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"

func CredentialFromModel(credential persistencemodel.AICredential) Credential {
	return Credential{
		ID:                   credential.ID,
		AdapterType:          credential.AdapterType,
		DisplayName:          credential.DisplayName,
		BaseURL:              credential.BaseURL,
		EncryptedKey:         credential.EncryptedKey,
		MaskedKey:            credential.MaskedKey,
		IsEnabled:            credential.IsEnabled,
		OrgID:                credential.OrgID,
		FilesAPIEnabled:      credential.FilesAPIEnabled,
		FilesAPIBaseURL:      credential.FilesAPIBaseURL,
		FilesAPIEncryptedKey: credential.FilesAPIEncryptedKey,
		FilesAPIMaskedKey:    credential.FilesAPIMaskedKey,
		CreatedAt:            credential.CreatedAt,
		UpdatedAt:            credential.UpdatedAt,
	}
}

func (credential Credential) ToModel() persistencemodel.AICredential {
	var target persistencemodel.AICredential
	credential.ApplyToModel(&target)
	return target
}

func (credential Credential) ApplyToModel(target *persistencemodel.AICredential) {
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
	target.FilesAPIEnabled = credential.FilesAPIEnabled
	target.FilesAPIBaseURL = credential.FilesAPIBaseURL
	target.FilesAPIEncryptedKey = credential.FilesAPIEncryptedKey
	target.FilesAPIMaskedKey = credential.FilesAPIMaskedKey
}

package aiadmin

import "github.com/movscript/movscript/internal/domain/model"

func CredentialFromModel(credential model.AICredential) Credential {
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
	}
}

func (credential Credential) ToModel() model.AICredential {
	var target model.AICredential
	credential.ApplyToModel(&target)
	return target
}

func (credential Credential) ApplyToModel(target *model.AICredential) {
	target.Model.ID = credential.ID
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

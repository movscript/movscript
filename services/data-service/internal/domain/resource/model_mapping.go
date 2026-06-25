package resource

import (
	"encoding/json"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func RawResourceFromModel(resource persistencemodel.RawResource) RawResource {
	return RawResource{
		ID:                          resource.ID,
		OwnerID:                     resource.OwnerID,
		OrgID:                       resource.OrgID,
		BlobID:                      resource.BlobID,
		FolderID:                    resource.FolderID,
		Type:                        resource.Type,
		Name:                        resource.Name,
		FilePath:                    resource.FilePath,
		URL:                         resource.URL,
		Size:                        resource.Size,
		MimeType:                    resource.MimeType,
		StorageBackend:              resource.StorageBackend,
		StorageKey:                  resource.StorageKey,
		DirectURL:                   resource.DirectURL,
		VerificationStatus:          resource.VerificationStatus,
		VerificationRef:             resource.VerificationRef,
		VerifiedAt:                  resource.VerifiedAt,
		VerificationProvider:        resource.VerificationProvider,
		VerificationError:           resource.VerificationError,
		ProviderAssetCertifications: parseProviderAssetCertifications(resource.ProviderAssetCertifications),
		ProviderGeneratedArtifact:   parseProviderGeneratedArtifact(resource.ProviderGeneratedArtifact),
		CloudUploads:                resource.CloudUploads,
		CreatedAt:                   resource.CreatedAt,
		UpdatedAt:                   resource.UpdatedAt,
	}
}

func (resource RawResource) ToModel() persistencemodel.RawResource {
	var target persistencemodel.RawResource
	resource.ApplyToModel(&target)
	return target
}

func (resource RawResource) ApplyToModel(target *persistencemodel.RawResource) {
	target.Model.ID = resource.ID
	target.Model.CreatedAt = resource.CreatedAt
	target.Model.UpdatedAt = resource.UpdatedAt
	target.OwnerID = resource.OwnerID
	target.OrgID = resource.OrgID
	target.BlobID = resource.BlobID
	target.FolderID = resource.FolderID
	target.Type = resource.Type
	target.Name = resource.Name
	target.FilePath = resource.FilePath
	target.URL = resource.URL
	target.Size = resource.Size
	target.MimeType = resource.MimeType
	target.StorageBackend = resource.StorageBackend
	target.StorageKey = resource.StorageKey
	target.DirectURL = resource.DirectURL
	target.VerificationStatus = resource.VerificationStatus
	target.VerificationRef = resource.VerificationRef
	target.VerifiedAt = resource.VerifiedAt
	target.VerificationProvider = resource.VerificationProvider
	target.VerificationError = resource.VerificationError
	target.ProviderAssetCertifications = marshalProviderAssetCertifications(resource.ProviderAssetCertifications)
	target.ProviderGeneratedArtifact = marshalProviderGeneratedArtifact(resource.ProviderGeneratedArtifact)
	target.CloudUploads = resource.CloudUploads
}

func parseProviderAssetCertifications(raw string) map[string]any {
	if raw == "" {
		return nil
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(raw), &out); err != nil || len(out) == 0 {
		return nil
	}
	return out
}

func marshalProviderAssetCertifications(value map[string]any) string {
	if len(value) == 0 {
		return "{}"
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func parseProviderGeneratedArtifact(raw string) map[string]any {
	if raw == "" {
		return nil
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(raw), &out); err != nil || len(out) == 0 {
		return nil
	}
	return out
}

func marshalProviderGeneratedArtifact(value map[string]any) string {
	if len(value) == 0 {
		return "{}"
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

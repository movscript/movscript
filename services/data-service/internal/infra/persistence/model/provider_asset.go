package model

import (
	"time"

	"gorm.io/gorm"
)

const (
	ProviderAssetStatusActive     = "active"
	ProviderAssetStatusProcessing = "processing"
	ProviderAssetStatusFailed     = "failed"

	ProviderAssetGroupOriginManaged = "managed"
	ProviderAssetGroupOriginRemote  = "remote"
	ProviderAssetGroupOriginManual  = "manual"
)

// ProviderAssetGroup mirrors a remote provider asset-library group.
type ProviderAssetGroup struct {
	gorm.Model
	ProviderID       string     `gorm:"not null;index;uniqueIndex:uidx_provider_asset_groups_remote" json:"provider_id"`
	ProviderKind     string     `gorm:"not null;index" json:"provider_kind"`
	ProviderCategory string     `gorm:"default:'';index" json:"provider_category,omitempty"`
	OrgID            *uint      `gorm:"index" json:"org_id,omitempty"`
	ProjectID        string     `gorm:"default:'';index" json:"project_id,omitempty"`
	ProjectName      string     `gorm:"default:''" json:"project_name,omitempty"`
	SettingID        string     `gorm:"default:'';index" json:"setting_id,omitempty"`
	ModelScope       string     `gorm:"default:'';index" json:"model_scope,omitempty"`
	Scope            string     `gorm:"default:'';index" json:"scope,omitempty"`
	RemoteGroupID    string     `gorm:"not null;uniqueIndex:uidx_provider_asset_groups_remote" json:"remote_group_id"`
	Name             string     `gorm:"not null" json:"name"`
	Origin           string     `gorm:"not null;default:'managed';index" json:"origin"`
	Status           string     `gorm:"not null;default:'active';index" json:"status"`
	RawMetadataJSON  string     `gorm:"type:text;not null;default:'{}'" json:"raw_metadata_json"`
	LastSyncedAt     *time.Time `gorm:"index" json:"last_synced_at,omitempty"`
}

// ProviderAsset mirrors one remote asset inside a ProviderAssetGroup.
type ProviderAsset struct {
	gorm.Model
	ProviderID        string              `gorm:"not null;index;uniqueIndex:uidx_provider_assets_remote" json:"provider_id"`
	ProviderKind      string              `gorm:"not null;index" json:"provider_kind"`
	OrgID             *uint               `gorm:"index" json:"org_id,omitempty"`
	GroupID           uint                `gorm:"not null;index" json:"group_id"`
	Group             *ProviderAssetGroup `gorm:"foreignKey:GroupID" json:"group,omitempty"`
	RemoteGroupID     string              `gorm:"not null;index" json:"remote_group_id"`
	RemoteAssetID     string              `gorm:"not null;uniqueIndex:uidx_provider_assets_remote" json:"remote_asset_id"`
	AssetURI          string              `gorm:"not null;index" json:"asset_uri"`
	HubAssetID        string              `gorm:"default:'';index" json:"hub_asset_id,omitempty"`
	SourceResourceID  *uint               `gorm:"index" json:"source_resource_id,omitempty"`
	SourceCandidateID string              `gorm:"default:'';index" json:"source_candidate_id,omitempty"`
	SourceURL         string              `gorm:"type:text;default:''" json:"source_url,omitempty"`
	SourceHash        string              `gorm:"default:'';index" json:"source_hash,omitempty"`
	Name              string              `gorm:"not null" json:"name"`
	AssetType         string              `gorm:"not null;default:'image';index" json:"asset_type"`
	MimeType          string              `gorm:"default:''" json:"mime_type,omitempty"`
	Status            string              `gorm:"not null;default:'active';index" json:"status"`
	RawStatus         string              `gorm:"default:''" json:"raw_status,omitempty"`
	RawMetadataJSON   string              `gorm:"type:text;not null;default:'{}'" json:"raw_metadata_json"`
	LastSyncedAt      *time.Time          `gorm:"index" json:"last_synced_at,omitempty"`
}

// ProviderAssetModelCertification records model-specific eligibility for a remote provider asset.
type ProviderAssetModelCertification struct {
	gorm.Model
	ProviderAssetID uint           `gorm:"not null;index;uniqueIndex:uidx_provider_asset_model_certs" json:"provider_asset_id"`
	ProviderAsset   *ProviderAsset `gorm:"foreignKey:ProviderAssetID" json:"provider_asset,omitempty"`
	ProviderID      string         `gorm:"not null;index" json:"provider_id"`
	PublicModelID   string         `gorm:"not null;default:'';uniqueIndex:uidx_provider_asset_model_certs" json:"public_model_id"`
	ProviderModelID string         `gorm:"not null;default:'';uniqueIndex:uidx_provider_asset_model_certs" json:"provider_model_id"`
	Capability      string         `gorm:"not null;default:'video_generation';index" json:"capability"`
	Status          string         `gorm:"not null;default:'active';index" json:"status"`
	AssetURI        string         `gorm:"not null;default:''" json:"asset_uri"`
	RemoteAssetID   string         `gorm:"not null;default:'';index" json:"remote_asset_id"`
	CertifiedAt     *time.Time     `gorm:"index" json:"certified_at,omitempty"`
	ExpiresAt       *time.Time     `gorm:"index" json:"expires_at,omitempty"`
	Error           string         `gorm:"type:text;default:''" json:"error,omitempty"`
	RawMetadataJSON string         `gorm:"type:text;not null;default:'{}'" json:"raw_metadata_json"`
}

package providerasset

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type ProviderRef struct {
	ProviderID       string
	ProviderKind     string
	ProviderCategory string
}

type RemoteObject map[string]any
type Certification map[string]any

type Group struct {
	gorm.Model
	ProviderID       string     `json:"provider_id"`
	ProviderKind     string     `json:"provider_kind"`
	ProviderCategory string     `json:"provider_category,omitempty"`
	OrgID            *uint      `json:"org_id,omitempty"`
	ProjectID        string     `json:"project_id,omitempty"`
	ProjectName      string     `json:"project_name,omitempty"`
	SettingID        string     `json:"setting_id,omitempty"`
	ModelScope       string     `json:"model_scope,omitempty"`
	Scope            string     `json:"scope,omitempty"`
	RemoteGroupID    string     `json:"remote_group_id"`
	Name             string     `json:"name"`
	Origin           string     `json:"origin"`
	Status           string     `json:"status"`
	RawMetadataJSON  string     `json:"raw_metadata_json"`
	LastSyncedAt     *time.Time `json:"last_synced_at,omitempty"`
}

type Asset struct {
	gorm.Model
	ProviderID        string     `json:"provider_id"`
	ProviderKind      string     `json:"provider_kind"`
	OrgID             *uint      `json:"org_id,omitempty"`
	GroupID           uint       `json:"group_id"`
	Group             *Group     `json:"group,omitempty"`
	RemoteGroupID     string     `json:"remote_group_id"`
	RemoteAssetID     string     `json:"remote_asset_id"`
	AssetURI          string     `json:"asset_uri"`
	HubAssetID        string     `json:"hub_asset_id,omitempty"`
	SourceResourceID  *uint      `json:"source_resource_id,omitempty"`
	SourceCandidateID string     `json:"source_candidate_id,omitempty"`
	SourceURL         string     `json:"source_url,omitempty"`
	SourceHash        string     `json:"source_hash,omitempty"`
	Name              string     `json:"name"`
	AssetType         string     `json:"asset_type"`
	MimeType          string     `json:"mime_type,omitempty"`
	Status            string     `json:"status"`
	RawStatus         string     `json:"raw_status,omitempty"`
	RawMetadataJSON   string     `json:"raw_metadata_json"`
	LastSyncedAt      *time.Time `json:"last_synced_at,omitempty"`
}

type ModelCertification struct {
	gorm.Model
	ProviderAssetID uint       `json:"provider_asset_id"`
	ProviderAsset   *Asset     `json:"provider_asset,omitempty"`
	ProviderID      string     `json:"provider_id"`
	PublicModelID   string     `json:"public_model_id"`
	ProviderModelID string     `json:"provider_model_id"`
	Capability      string     `json:"capability"`
	Status          string     `json:"status"`
	AssetURI        string     `json:"asset_uri"`
	RemoteAssetID   string     `json:"remote_asset_id"`
	CertifiedAt     *time.Time `json:"certified_at,omitempty"`
	ExpiresAt       *time.Time `json:"expires_at,omitempty"`
	Error           string     `json:"error,omitempty"`
	RawMetadataJSON string     `json:"raw_metadata_json"`
}

type LibraryRecordResult struct {
	Group         Group              `json:"group"`
	Asset         Asset              `json:"asset"`
	Certification ModelCertification `json:"model_certification"`
}

type AssetWithCertifications struct {
	Asset
	ModelCertifications []ModelCertification `json:"model_certifications"`
}

type RecordLibraryInput struct {
	ProjectID         string
	ProjectName       string
	SettingID         string
	Name              string
	Model             string
	AssetGroupID      string
	AssetGroupName    string
	SourceCandidateID string
}

func (s *Service) ListGroups(ctx context.Context, providerID string, orgID *uint, projectID string) ([]Group, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("provider asset store is unavailable")
	}
	var groups []persistencemodel.ProviderAssetGroup
	query := s.db.WithContext(ctx).
		Where("provider_id = ?", providerID).
		Order("updated_at DESC, id DESC")
	if orgID != nil {
		query = query.Where("org_id IS NULL OR org_id = ?", *orgID)
	} else {
		query = query.Where("org_id IS NULL")
	}
	if projectID = strings.TrimSpace(projectID); projectID != "" {
		query = query.Where("project_id = ?", projectID)
	}
	if err := query.Find(&groups).Error; err != nil {
		return nil, err
	}
	return groupsFromModels(groups), nil
}

func (s *Service) ListAssets(ctx context.Context, providerID string, groupRef string, orgID *uint) (Group, []AssetWithCertifications, error) {
	group, err := s.LookupGroup(ctx, providerID, groupRef)
	if err != nil {
		return Group{}, nil, err
	}
	var assets []persistencemodel.ProviderAsset
	query := s.db.WithContext(ctx).
		Where("provider_id = ? AND group_id = ?", providerID, group.ID).
		Order("updated_at DESC, id DESC")
	if orgID != nil {
		query = query.Where("org_id IS NULL OR org_id = ?", *orgID)
	} else {
		query = query.Where("org_id IS NULL")
	}
	if err := query.Find(&assets).Error; err != nil {
		return group, nil, err
	}
	ids := make([]uint, 0, len(assets))
	for _, asset := range assets {
		ids = append(ids, asset.ID)
	}
	var certs []persistencemodel.ProviderAssetModelCertification
	if len(ids) > 0 {
		if err := s.db.WithContext(ctx).
			Where("provider_asset_id IN ?", ids).
			Order("public_model_id ASC, provider_model_id ASC, id ASC").
			Find(&certs).Error; err != nil {
			return group, nil, err
		}
	}
	certsByAsset := make(map[uint][]ModelCertification)
	for _, cert := range certs {
		certsByAsset[cert.ProviderAssetID] = append(certsByAsset[cert.ProviderAssetID], modelCertificationFromModel(cert))
	}
	items := make([]AssetWithCertifications, 0, len(assets))
	for _, asset := range assets {
		items = append(items, AssetWithCertifications{
			Asset:               assetFromModel(asset),
			ModelCertifications: certsByAsset[asset.ID],
		})
	}
	return group, items, nil
}

func (s *Service) LookupGroup(ctx context.Context, providerID string, groupRef string) (Group, error) {
	if s == nil || s.db == nil {
		return Group{}, fmt.Errorf("provider asset store is unavailable")
	}
	var group persistencemodel.ProviderAssetGroup
	groupRef = strings.TrimSpace(groupRef)
	if groupRef == "" {
		return Group{}, gorm.ErrRecordNotFound
	}
	query := s.db.WithContext(ctx).Where("provider_id = ?", providerID)
	if id64, err := strconv.ParseUint(groupRef, 10, 64); err == nil && id64 > 0 {
		query = query.Where("id = ? OR remote_group_id = ?", uint(id64), groupRef)
	} else {
		query = query.Where("remote_group_id = ? OR scope = ?", groupRef, groupRef)
	}
	err := query.First(&group).Error
	return groupFromModel(group), err
}

func (s *Service) RecordRemoteGroups(ctx context.Context, orgID *uint, provider ProviderRef, remoteGroups []RemoteObject) ([]Group, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("provider asset store is unavailable")
	}
	now := time.Now().UTC()
	groups := make([]Group, 0, len(remoteGroups))
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, rawGroup := range remoteGroups {
			remoteGroupID := remoteGroupID(rawGroup)
			if remoteGroupID == "" {
				continue
			}
			status := statusValue(firstString(rawGroup, "status", "Status", "state", "State"))
			if status == "" || status == "unknown" {
				status = persistencemodel.ProviderAssetStatusActive
			}
			name := firstNonEmptyString(firstString(rawGroup, "name", "Name", "group_name", "GroupName"), remoteGroupID)
			group, err := upsertGroup(tx, persistencemodel.ProviderAssetGroup{
				ProviderID:       provider.ProviderID,
				ProviderKind:     provider.ProviderKind,
				ProviderCategory: provider.ProviderCategory,
				OrgID:            cloneUintPtr(orgID),
				Scope:            firstNonEmptyString(firstString(rawGroup, "scope", "Scope"), "remote:"+remoteGroupID),
				RemoteGroupID:    remoteGroupID,
				Name:             name,
				Origin:           persistencemodel.ProviderAssetGroupOriginRemote,
				Status:           status,
				RawMetadataJSON:  marshalJSON(rawGroup),
				LastSyncedAt:     &now,
			})
			if err != nil {
				return err
			}
			groups = append(groups, groupFromModel(group))
		}
		return nil
	})
	return groups, err
}

func (s *Service) EnsureRemoteGroupMirror(ctx context.Context, orgID *uint, provider ProviderRef, groupRef string) (Group, error) {
	if s == nil || s.db == nil {
		return Group{}, fmt.Errorf("provider asset store is unavailable")
	}
	groupRef = strings.TrimSpace(groupRef)
	if groupRef == "" {
		return Group{}, gorm.ErrRecordNotFound
	}
	now := time.Now().UTC()
	group, err := upsertGroup(s.db.WithContext(ctx), persistencemodel.ProviderAssetGroup{
		ProviderID:       provider.ProviderID,
		ProviderKind:     provider.ProviderKind,
		ProviderCategory: provider.ProviderCategory,
		OrgID:            cloneUintPtr(orgID),
		Scope:            "manual:" + groupRef,
		RemoteGroupID:    groupRef,
		Name:             groupRef,
		Origin:           persistencemodel.ProviderAssetGroupOriginManual,
		Status:           persistencemodel.ProviderAssetStatusActive,
		RawMetadataJSON:  "{}",
		LastSyncedAt:     &now,
	})
	return groupFromModel(group), err
}

func (s *Service) RecordRemoteAssets(ctx context.Context, orgID *uint, provider ProviderRef, group Group, model string, remoteAssets []RemoteObject) ([]AssetWithCertifications, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("provider asset store is unavailable")
	}
	now := time.Now().UTC()
	items := make([]AssetWithCertifications, 0, len(remoteAssets))
	model = strings.TrimSpace(model)
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, rawAsset := range remoteAssets {
			remoteAssetID := remoteAssetID(rawAsset)
			if remoteAssetID == "" {
				continue
			}
			remoteGroupID := firstNonEmptyString(remoteGroupID(rawAsset), group.RemoteGroupID)
			assetURI := remoteAssetURI(rawAsset, remoteAssetID)
			status := statusValue(firstString(rawAsset, "status", "Status", "state", "State"))
			if status == "" || status == "unknown" {
				status = persistencemodel.ProviderAssetStatusActive
			}
			rawMetadata := marshalJSON(rawAsset)
			asset, err := upsertAsset(tx, persistencemodel.ProviderAsset{
				ProviderID:      provider.ProviderID,
				ProviderKind:    provider.ProviderKind,
				OrgID:           cloneUintPtr(orgID),
				GroupID:         group.ID,
				RemoteGroupID:   remoteGroupID,
				RemoteAssetID:   remoteAssetID,
				AssetURI:        assetURI,
				HubAssetID:      remoteAssetID,
				SourceURL:       firstString(rawAsset, "source_url", "SourceURL", "URL", "url", "asset_url", "assetUrl"),
				Name:            firstNonEmptyString(firstString(rawAsset, "name", "Name", "asset_name", "AssetName"), remoteAssetID),
				AssetType:       firstNonEmptyString(firstString(rawAsset, "asset_type", "AssetType", "type", "Type"), "image"),
				MimeType:        firstString(rawAsset, "mime_type", "MimeType", "mime", "Mime"),
				Status:          status,
				RawStatus:       firstString(rawAsset, "status", "Status", "state", "State"),
				RawMetadataJSON: rawMetadata,
				LastSyncedAt:    &now,
			})
			if err != nil {
				return err
			}
			item := AssetWithCertifications{Asset: assetFromModel(asset)}
			if model != "" {
				cert, err := upsertModelCertification(tx, persistencemodel.ProviderAssetModelCertification{
					ProviderAssetID: asset.ID,
					ProviderID:      provider.ProviderID,
					PublicModelID:   model,
					ProviderModelID: model,
					Capability:      "video_i2v",
					Status:          status,
					AssetURI:        assetURI,
					RemoteAssetID:   remoteAssetID,
					CertifiedAt:     &now,
					Error:           firstString(rawAsset, "error", "Error", "message", "Message"),
					RawMetadataJSON: rawMetadata,
				})
				if err != nil {
					return err
				}
				item.ModelCertifications = append(item.ModelCertifications, modelCertificationFromModel(cert))
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}

func (s *Service) RecordLibraryRecord(ctx context.Context, orgID *uint, provider ProviderRef, input RecordLibraryInput, resource domainresource.RawResource, certification Certification) (LibraryRecordResult, error) {
	var result LibraryRecordResult
	if s == nil || s.db == nil || len(certification) == 0 {
		return result, nil
	}
	now := time.Now().UTC()
	model := strings.TrimSpace(firstNonEmptyString(
		stringValue(certification["model"]),
		stringValue(certification["public_model_id"]),
		stringValue(certification["provider_model_id"]),
		input.Model,
	))
	remoteGroupID := strings.TrimSpace(firstNonEmptyString(
		stringValue(certification["asset_group_id"]),
		stringValue(certification["group_id"]),
		input.AssetGroupID,
	))
	if remoteGroupID == "" {
		remoteGroupID = "default"
	}
	groupScope := strings.TrimSpace(groupScope(input.ProjectID, input.ProjectName, input.SettingID))
	groupName := strings.TrimSpace(firstNonEmptyString(input.AssetGroupName, groupName(groupScope, input.ProjectID, input.ProjectName, input.SettingID)))
	assetURI := strings.TrimSpace(stringValue(certification["asset_uri"]))
	hubAssetID := strings.TrimSpace(stringValue(certification["hub_asset_id"]))
	remoteAssetID := strings.TrimSpace(firstNonEmptyString(hubAssetID, strings.TrimPrefix(assetURI, "asset://")))
	if remoteAssetID == "" {
		remoteAssetID = assetURI
	}
	rawMetadata := marshalJSON(certification)
	sourceResourceID := resource.ID
	status := statusValue(firstNonEmptyString(stringValue(certification["status"]), stringValue(certification["raw_status"])))
	if status == "" || status == "unknown" {
		status = persistencemodel.ProviderAssetStatusProcessing
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		group, err := upsertGroup(tx, persistencemodel.ProviderAssetGroup{
			ProviderID:       provider.ProviderID,
			ProviderKind:     provider.ProviderKind,
			ProviderCategory: provider.ProviderCategory,
			OrgID:            cloneUintPtr(orgID),
			ProjectID:        strings.TrimSpace(input.ProjectID),
			ProjectName:      strings.TrimSpace(input.ProjectName),
			SettingID:        strings.TrimSpace(input.SettingID),
			ModelScope:       "",
			Scope:            groupScope,
			RemoteGroupID:    remoteGroupID,
			Name:             groupName,
			Origin:           groupOrigin(input),
			Status:           persistencemodel.ProviderAssetStatusActive,
			RawMetadataJSON:  rawMetadata,
			LastSyncedAt:     &now,
		})
		if err != nil {
			return err
		}
		result.Group = groupFromModel(group)
		asset, err := upsertAsset(tx, persistencemodel.ProviderAsset{
			ProviderID:        provider.ProviderID,
			ProviderKind:      provider.ProviderKind,
			OrgID:             cloneUintPtr(orgID),
			GroupID:           group.ID,
			RemoteGroupID:     remoteGroupID,
			RemoteAssetID:     remoteAssetID,
			AssetURI:          assetURI,
			HubAssetID:        hubAssetID,
			SourceResourceID:  &sourceResourceID,
			SourceCandidateID: strings.TrimSpace(firstNonEmptyString(stringValue(certification["source_candidate_id"]), input.SourceCandidateID)),
			SourceURL:         strings.TrimSpace(stringValue(certification["source_url"])),
			SourceHash:        strings.TrimSpace(stringValue(certification["source_hash"])),
			Name:              strings.TrimSpace(firstNonEmptyString(input.Name, resource.Name, remoteAssetID)),
			AssetType:         "image",
			MimeType:          resource.MimeType,
			Status:            status,
			RawStatus:         strings.TrimSpace(stringValue(certification["raw_status"])),
			RawMetadataJSON:   rawMetadata,
			LastSyncedAt:      &now,
		})
		if err != nil {
			return err
		}
		result.Asset = assetFromModel(asset)
		cert, err := upsertModelCertification(tx, persistencemodel.ProviderAssetModelCertification{
			ProviderAssetID: asset.ID,
			ProviderID:      provider.ProviderID,
			PublicModelID:   model,
			ProviderModelID: strings.TrimSpace(firstNonEmptyString(stringValue(certification["provider_model_id"]), model)),
			Capability:      "video_i2v",
			Status:          status,
			AssetURI:        assetURI,
			RemoteAssetID:   remoteAssetID,
			CertifiedAt:     &now,
			Error:           strings.TrimSpace(firstNonEmptyString(stringValue(certification["error"]), stringValue(certification["message"]))),
			RawMetadataJSON: rawMetadata,
		})
		if err != nil {
			return err
		}
		result.Certification = modelCertificationFromModel(cert)
		return nil
	})
	return result, err
}

func upsertGroup(tx *gorm.DB, next persistencemodel.ProviderAssetGroup) (persistencemodel.ProviderAssetGroup, error) {
	var existing persistencemodel.ProviderAssetGroup
	err := tx.Where("provider_id = ? AND remote_group_id = ?", next.ProviderID, next.RemoteGroupID).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if err := tx.Create(&next).Error; err != nil {
			return next, err
		}
		return next, nil
	}
	if err != nil {
		return existing, err
	}
	next.ID = existing.ID
	updates := map[string]any{
		"provider_kind":     next.ProviderKind,
		"provider_category": next.ProviderCategory,
		"origin":            next.Origin,
		"status":            next.Status,
		"raw_metadata_json": next.RawMetadataJSON,
		"last_synced_at":    next.LastSyncedAt,
	}
	if next.OrgID != nil {
		updates["org_id"] = next.OrgID
	}
	if strings.TrimSpace(next.ProjectID) != "" {
		updates["project_id"] = next.ProjectID
	}
	if strings.TrimSpace(next.ProjectName) != "" {
		updates["project_name"] = next.ProjectName
	}
	if strings.TrimSpace(next.SettingID) != "" {
		updates["setting_id"] = next.SettingID
	}
	if strings.TrimSpace(next.ModelScope) != "" {
		updates["model_scope"] = next.ModelScope
	}
	if strings.TrimSpace(next.Scope) != "" {
		updates["scope"] = next.Scope
	}
	if strings.TrimSpace(next.Name) != "" {
		updates["name"] = next.Name
	}
	if err := tx.Model(&existing).Updates(updates).Error; err != nil {
		return existing, err
	}
	if err := tx.First(&existing, existing.ID).Error; err != nil {
		return existing, err
	}
	return existing, nil
}

func upsertAsset(tx *gorm.DB, next persistencemodel.ProviderAsset) (persistencemodel.ProviderAsset, error) {
	var existing persistencemodel.ProviderAsset
	err := tx.Where("provider_id = ? AND remote_asset_id = ?", next.ProviderID, next.RemoteAssetID).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if err := tx.Create(&next).Error; err != nil {
			return next, err
		}
		return next, nil
	}
	if err != nil {
		return existing, err
	}
	updates := map[string]any{
		"provider_kind":     next.ProviderKind,
		"group_id":          next.GroupID,
		"remote_group_id":   next.RemoteGroupID,
		"asset_uri":         next.AssetURI,
		"hub_asset_id":      next.HubAssetID,
		"name":              next.Name,
		"asset_type":        next.AssetType,
		"mime_type":         next.MimeType,
		"status":            next.Status,
		"raw_status":        next.RawStatus,
		"raw_metadata_json": next.RawMetadataJSON,
		"last_synced_at":    next.LastSyncedAt,
	}
	if next.OrgID != nil {
		updates["org_id"] = next.OrgID
	}
	if next.SourceResourceID != nil {
		updates["source_resource_id"] = next.SourceResourceID
	}
	if strings.TrimSpace(next.SourceCandidateID) != "" {
		updates["source_candidate_id"] = next.SourceCandidateID
	}
	if strings.TrimSpace(next.SourceURL) != "" {
		updates["source_url"] = next.SourceURL
	}
	if strings.TrimSpace(next.SourceHash) != "" {
		updates["source_hash"] = next.SourceHash
	}
	if err := tx.Model(&existing).Updates(updates).Error; err != nil {
		return existing, err
	}
	if err := tx.First(&existing, existing.ID).Error; err != nil {
		return existing, err
	}
	return existing, nil
}

func upsertModelCertification(tx *gorm.DB, next persistencemodel.ProviderAssetModelCertification) (persistencemodel.ProviderAssetModelCertification, error) {
	var existing persistencemodel.ProviderAssetModelCertification
	err := tx.Where("provider_asset_id = ? AND public_model_id = ? AND provider_model_id = ?", next.ProviderAssetID, next.PublicModelID, next.ProviderModelID).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if err := tx.Create(&next).Error; err != nil {
			return next, err
		}
		return next, nil
	}
	if err != nil {
		return existing, err
	}
	updates := map[string]any{
		"provider_id":       next.ProviderID,
		"capability":        next.Capability,
		"status":            next.Status,
		"asset_uri":         next.AssetURI,
		"remote_asset_id":   next.RemoteAssetID,
		"certified_at":      next.CertifiedAt,
		"expires_at":        next.ExpiresAt,
		"error":             next.Error,
		"raw_metadata_json": next.RawMetadataJSON,
	}
	if err := tx.Model(&existing).Updates(updates).Error; err != nil {
		return existing, err
	}
	if err := tx.First(&existing, existing.ID).Error; err != nil {
		return existing, err
	}
	return existing, nil
}

func groupFromModel(group persistencemodel.ProviderAssetGroup) Group {
	return Group{
		Model:            group.Model,
		ProviderID:       group.ProviderID,
		ProviderKind:     group.ProviderKind,
		ProviderCategory: group.ProviderCategory,
		OrgID:            group.OrgID,
		ProjectID:        group.ProjectID,
		ProjectName:      group.ProjectName,
		SettingID:        group.SettingID,
		ModelScope:       group.ModelScope,
		Scope:            group.Scope,
		RemoteGroupID:    group.RemoteGroupID,
		Name:             group.Name,
		Origin:           group.Origin,
		Status:           group.Status,
		RawMetadataJSON:  group.RawMetadataJSON,
		LastSyncedAt:     group.LastSyncedAt,
	}
}

func groupsFromModels(groups []persistencemodel.ProviderAssetGroup) []Group {
	out := make([]Group, 0, len(groups))
	for _, group := range groups {
		out = append(out, groupFromModel(group))
	}
	return out
}

func assetFromModel(asset persistencemodel.ProviderAsset) Asset {
	return Asset{
		Model:             asset.Model,
		ProviderID:        asset.ProviderID,
		ProviderKind:      asset.ProviderKind,
		OrgID:             asset.OrgID,
		GroupID:           asset.GroupID,
		RemoteGroupID:     asset.RemoteGroupID,
		RemoteAssetID:     asset.RemoteAssetID,
		AssetURI:          asset.AssetURI,
		HubAssetID:        asset.HubAssetID,
		SourceResourceID:  asset.SourceResourceID,
		SourceCandidateID: asset.SourceCandidateID,
		SourceURL:         asset.SourceURL,
		SourceHash:        asset.SourceHash,
		Name:              asset.Name,
		AssetType:         asset.AssetType,
		MimeType:          asset.MimeType,
		Status:            asset.Status,
		RawStatus:         asset.RawStatus,
		RawMetadataJSON:   asset.RawMetadataJSON,
		LastSyncedAt:      asset.LastSyncedAt,
	}
}

func modelCertificationFromModel(cert persistencemodel.ProviderAssetModelCertification) ModelCertification {
	return ModelCertification{
		Model:           cert.Model,
		ProviderAssetID: cert.ProviderAssetID,
		ProviderID:      cert.ProviderID,
		PublicModelID:   cert.PublicModelID,
		ProviderModelID: cert.ProviderModelID,
		Capability:      cert.Capability,
		Status:          cert.Status,
		AssetURI:        cert.AssetURI,
		RemoteAssetID:   cert.RemoteAssetID,
		CertifiedAt:     cert.CertifiedAt,
		ExpiresAt:       cert.ExpiresAt,
		Error:           cert.Error,
		RawMetadataJSON: cert.RawMetadataJSON,
	}
}

func groupOrigin(input RecordLibraryInput) string {
	if strings.TrimSpace(input.AssetGroupID) != "" {
		return persistencemodel.ProviderAssetGroupOriginManual
	}
	return persistencemodel.ProviderAssetGroupOriginManaged
}

func remoteGroupID(value RemoteObject) string {
	return firstString(value, "asset_group_id", "AssetGroupId", "AssetGroupID", "group_id", "GroupId", "GroupID", "id", "Id")
}

func remoteAssetID(value RemoteObject) string {
	assetID := firstString(value, "hub_asset_id", "asset_id", "assetId", "AssetId", "AssetID", "id", "Id")
	if assetID != "" {
		return assetID
	}
	return strings.TrimPrefix(firstString(value, "asset_uri", "assetUri", "AssetURI", "URI"), "asset://")
}

func remoteAssetURI(value RemoteObject, remoteAssetID string) string {
	assetURI := firstString(value, "asset_uri", "assetUri", "AssetURI", "URI")
	if assetURI != "" {
		return assetURI
	}
	if strings.TrimSpace(remoteAssetID) == "" {
		return ""
	}
	return "asset://" + strings.TrimSpace(remoteAssetID)
}

func marshalJSON(value any) string {
	raw, err := json.Marshal(value)
	if err != nil || len(raw) == 0 {
		return "{}"
	}
	return string(raw)
}

func firstString(value RemoteObject, keys ...string) string {
	for _, key := range keys {
		if raw, ok := value[key]; ok {
			if text := stringValue(raw); text != "" {
				return text
			}
		}
	}
	return ""
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func stringValue(value any) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		if v == float64(int64(v)) {
			return strconv.FormatInt(int64(v), 10)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case json.Number:
		return strings.TrimSpace(v.String())
	default:
		text := strings.TrimSpace(fmt.Sprint(v))
		if text == "<nil>" {
			return ""
		}
		return text
	}
}

func statusValue(value string) string {
	status := strings.ToLower(strings.TrimSpace(value))
	switch status {
	case "success", "succeeded", "available", "enabled", "ready":
		return persistencemodel.ProviderAssetStatusActive
	case "running", "pending", "creating":
		return persistencemodel.ProviderAssetStatusProcessing
	case "error", "failed", "failure":
		return persistencemodel.ProviderAssetStatusFailed
	default:
		return status
	}
}

func groupScope(projectID string, projectName string, settingID string) string {
	parts := []string{}
	if strings.TrimSpace(projectID) != "" {
		parts = append(parts, "project:"+strings.TrimSpace(projectID))
	}
	if strings.TrimSpace(settingID) != "" {
		parts = append(parts, "setting:"+strings.TrimSpace(settingID))
	}
	if len(parts) == 0 && strings.TrimSpace(projectName) != "" {
		parts = append(parts, "project_name:"+strings.TrimSpace(projectName))
	}
	if len(parts) == 0 {
		return "default"
	}
	return strings.Join(parts, "/")
}

func groupName(scope string, projectID string, projectName string, settingID string) string {
	if strings.TrimSpace(projectName) != "" {
		return strings.TrimSpace(projectName)
	}
	if strings.TrimSpace(projectID) != "" {
		return "Project " + strings.TrimSpace(projectID)
	}
	if strings.TrimSpace(settingID) != "" {
		return "Setting " + strings.TrimSpace(settingID)
	}
	if strings.TrimSpace(scope) != "" && scope != "default" {
		return strings.TrimSpace(scope)
	}
	return "Default"
}

func cloneUintPtr(value *uint) *uint {
	if value == nil {
		return nil
	}
	next := *value
	return &next
}

package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

type providerAssetLibraryRecordResult struct {
	Group         persistencemodel.ProviderAssetGroup              `json:"group"`
	Asset         persistencemodel.ProviderAsset                   `json:"asset"`
	Certification persistencemodel.ProviderAssetModelCertification `json:"model_certification"`
}

type providerAssetWithCertifications struct {
	persistencemodel.ProviderAsset
	ModelCertifications []persistencemodel.ProviderAssetModelCertification `json:"model_certifications"`
}

func (h *ProviderAssetHandler) ListProviderAssetGroups(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
		return
	}
	provider, err := h.resolveProviderAssetProvider(c.Request.Context(), providerRefParam(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	var groups []persistencemodel.ProviderAssetGroup
	query := h.db.WithContext(c.Request.Context()).
		Where("provider_id = ?", provider.ProviderID).
		Order("updated_at DESC, id DESC")
	if orgID := currentOrgID(c); orgID != nil {
		query = query.Where("org_id IS NULL OR org_id = ?", *orgID)
	} else {
		query = query.Where("org_id IS NULL")
	}
	if projectID := strings.TrimSpace(c.Query("project_id")); projectID != "" {
		query = query.Where("project_id = ?", projectID)
	}
	if err := query.Find(&groups).Error; err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": groups, "total": len(groups)})
}

func (h *ProviderAssetHandler) ListProviderAssets(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
		return
	}
	provider, err := h.resolveProviderAssetProvider(c.Request.Context(), providerRefParam(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	group, err := h.lookupProviderAssetGroup(c.Request.Context(), provider.ProviderID, c.Param("group_ref"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("provider asset group not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	var assets []persistencemodel.ProviderAsset
	query := h.db.WithContext(c.Request.Context()).
		Where("provider_id = ? AND group_id = ?", provider.ProviderID, group.ID).
		Order("updated_at DESC, id DESC")
	if orgID := currentOrgID(c); orgID != nil {
		query = query.Where("org_id IS NULL OR org_id = ?", *orgID)
	} else {
		query = query.Where("org_id IS NULL")
	}
	if err := query.Find(&assets).Error; err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	ids := make([]uint, 0, len(assets))
	for _, asset := range assets {
		ids = append(ids, asset.ID)
	}
	var certs []persistencemodel.ProviderAssetModelCertification
	if len(ids) > 0 {
		if err := h.db.WithContext(c.Request.Context()).
			Where("provider_asset_id IN ?", ids).
			Order("public_model_id ASC, provider_model_id ASC, id ASC").
			Find(&certs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
			return
		}
	}
	certsByAsset := make(map[uint][]persistencemodel.ProviderAssetModelCertification)
	for _, cert := range certs {
		certsByAsset[cert.ProviderAssetID] = append(certsByAsset[cert.ProviderAssetID], cert)
	}
	items := make([]providerAssetWithCertifications, 0, len(assets))
	for _, asset := range assets {
		items = append(items, providerAssetWithCertifications{
			ProviderAsset:       asset,
			ModelCertifications: certsByAsset[asset.ID],
		})
	}
	c.JSON(http.StatusOK, gin.H{"group": group, "items": items, "total": len(items)})
}

func (h *ProviderAssetHandler) SyncProviderAssetGroups(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
		return
	}
	provider, err := h.resolveProviderAssetProvider(c.Request.Context(), providerRefParam(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	model := strings.TrimSpace(c.Query("model"))
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	remoteGroups, err := h.fetchRemoteProviderAssetGroups(ctx, provider, model)
	if err != nil {
		c.JSON(http.StatusBadGateway, api.InvalidInput(err.Error()))
		return
	}
	groups, err := h.recordRemoteProviderAssetGroups(ctx, currentOrgID(c), provider, remoteGroups)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": groups, "total": len(groups), "synced": len(groups)})
}

func (h *ProviderAssetHandler) SyncProviderAssets(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
		return
	}
	provider, err := h.resolveProviderAssetProvider(c.Request.Context(), providerRefParam(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	group, err := h.lookupProviderAssetGroup(c.Request.Context(), provider.ProviderID, c.Param("group_ref"))
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
			return
		}
		group, err = h.ensureRemoteProviderAssetGroupMirror(c.Request.Context(), currentOrgID(c), provider, c.Param("group_ref"))
		if err != nil {
			c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
			return
		}
	}
	model := strings.TrimSpace(c.Query("model"))
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	remoteAssets, err := h.fetchRemoteProviderAssets(ctx, provider, group.RemoteGroupID, model)
	if err != nil {
		c.JSON(http.StatusBadGateway, api.InvalidInput(err.Error()))
		return
	}
	assets, err := h.recordRemoteProviderAssets(ctx, currentOrgID(c), provider, group, model, remoteAssets)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"group": group, "items": assets, "total": len(assets), "synced": len(assets)})
}

func providerRefParam(c *gin.Context) string {
	providerRef := strings.TrimSpace(c.Param("provider_ref"))
	if providerRef == "" {
		providerRef = strings.TrimSpace(c.Param("provider_id"))
	}
	return providerRef
}

func (h *ProviderAssetHandler) lookupProviderAssetGroup(ctx context.Context, providerID string, groupRef string) (persistencemodel.ProviderAssetGroup, error) {
	var group persistencemodel.ProviderAssetGroup
	groupRef = strings.TrimSpace(groupRef)
	if groupRef == "" {
		return group, gorm.ErrRecordNotFound
	}
	query := h.db.WithContext(ctx).Where("provider_id = ?", providerID)
	if id64, err := strconv.ParseUint(groupRef, 10, 64); err == nil && id64 > 0 {
		query = query.Where("id = ? OR remote_group_id = ?", uint(id64), groupRef)
	} else {
		query = query.Where("remote_group_id = ? OR scope = ?", groupRef, groupRef)
	}
	err := query.First(&group).Error
	return group, err
}

func (h *ProviderAssetHandler) recordRemoteProviderAssetGroups(ctx context.Context, orgID *uint, provider providerAssetProviderRef, remoteGroups []map[string]any) ([]persistencemodel.ProviderAssetGroup, error) {
	now := time.Now().UTC()
	groups := make([]persistencemodel.ProviderAssetGroup, 0, len(remoteGroups))
	err := h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, rawGroup := range remoteGroups {
			remoteGroupID := providerAssetRemoteGroupID(rawGroup)
			if remoteGroupID == "" {
				continue
			}
			status := providerAssetStatus(firstString(rawGroup, "status", "Status", "state", "State"))
			if status == "" || status == "unknown" {
				status = persistencemodel.ProviderAssetStatusActive
			}
			name := firstNonEmptyString(firstString(rawGroup, "name", "Name", "group_name", "GroupName"), remoteGroupID)
			group, err := upsertProviderAssetGroup(tx, persistencemodel.ProviderAssetGroup{
				ProviderID:       provider.ProviderID,
				ProviderKind:     provider.ProviderKind,
				ProviderCategory: provider.ProviderCategory,
				OrgID:            cloneUintPtr(orgID),
				Scope:            firstNonEmptyString(firstString(rawGroup, "scope", "Scope"), "remote:"+remoteGroupID),
				RemoteGroupID:    remoteGroupID,
				Name:             name,
				Origin:           persistencemodel.ProviderAssetGroupOriginRemote,
				Status:           status,
				RawMetadataJSON:  marshalProviderAssetJSON(rawGroup),
				LastSyncedAt:     &now,
			})
			if err != nil {
				return err
			}
			groups = append(groups, group)
		}
		return nil
	})
	return groups, err
}

func (h *ProviderAssetHandler) ensureRemoteProviderAssetGroupMirror(ctx context.Context, orgID *uint, provider providerAssetProviderRef, groupRef string) (persistencemodel.ProviderAssetGroup, error) {
	groupRef = strings.TrimSpace(groupRef)
	if groupRef == "" {
		return persistencemodel.ProviderAssetGroup{}, gorm.ErrRecordNotFound
	}
	now := time.Now().UTC()
	return upsertProviderAssetGroup(h.db.WithContext(ctx), persistencemodel.ProviderAssetGroup{
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
}

func (h *ProviderAssetHandler) recordRemoteProviderAssets(ctx context.Context, orgID *uint, provider providerAssetProviderRef, group persistencemodel.ProviderAssetGroup, model string, remoteAssets []map[string]any) ([]providerAssetWithCertifications, error) {
	now := time.Now().UTC()
	items := make([]providerAssetWithCertifications, 0, len(remoteAssets))
	model = strings.TrimSpace(model)
	err := h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, rawAsset := range remoteAssets {
			remoteAssetID := providerAssetRemoteAssetID(rawAsset)
			if remoteAssetID == "" {
				continue
			}
			remoteGroupID := firstNonEmptyString(providerAssetRemoteGroupID(rawAsset), group.RemoteGroupID)
			assetURI := providerAssetRemoteAssetURI(rawAsset, remoteAssetID)
			status := providerAssetStatus(firstString(rawAsset, "status", "Status", "state", "State"))
			if status == "" || status == "unknown" {
				status = persistencemodel.ProviderAssetStatusActive
			}
			rawMetadata := marshalProviderAssetJSON(rawAsset)
			asset, err := upsertProviderAsset(tx, persistencemodel.ProviderAsset{
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
			item := providerAssetWithCertifications{ProviderAsset: asset}
			if model != "" {
				cert, err := upsertProviderAssetModelCertification(tx, persistencemodel.ProviderAssetModelCertification{
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
				item.ModelCertifications = append(item.ModelCertifications, cert)
			}
			items = append(items, item)
		}
		return nil
	})
	return items, err
}

func (h *ProviderAssetHandler) recordProviderAssetLibraryRecord(ctx context.Context, orgID *uint, provider providerAssetProviderRef, body providerAssetCertifyRequest, resource domainresource.RawResource, certification map[string]any) (providerAssetLibraryRecordResult, error) {
	var result providerAssetLibraryRecordResult
	if h == nil || h.db == nil || len(certification) == 0 {
		return result, nil
	}
	now := time.Now().UTC()
	model := strings.TrimSpace(firstNonEmptyString(
		providerAssetStringValue(certification["model"]),
		providerAssetStringValue(certification["public_model_id"]),
		providerAssetStringValue(certification["provider_model_id"]),
		body.Model,
	))
	remoteGroupID := strings.TrimSpace(firstNonEmptyString(
		providerAssetStringValue(certification["asset_group_id"]),
		providerAssetStringValue(certification["group_id"]),
		body.AssetGroupID,
	))
	if remoteGroupID == "" {
		remoteGroupID = "default"
	}
	groupScope := strings.TrimSpace(providerAssetGroupScope(body.ProjectID, body.ProjectName, body.SettingID))
	groupName := strings.TrimSpace(firstNonEmptyString(body.AssetGroupName, providerAssetGroupName(groupScope, body.ProjectID, body.ProjectName, body.SettingID)))
	assetURI := strings.TrimSpace(providerAssetStringValue(certification["asset_uri"]))
	hubAssetID := strings.TrimSpace(providerAssetStringValue(certification["hub_asset_id"]))
	remoteAssetID := strings.TrimSpace(firstNonEmptyString(hubAssetID, strings.TrimPrefix(assetURI, "asset://")))
	if remoteAssetID == "" {
		remoteAssetID = assetURI
	}
	rawMetadata := marshalProviderAssetJSON(certification)
	sourceResourceID := resource.ID
	status := providerAssetStatus(firstNonEmptyString(providerAssetStringValue(certification["status"]), providerAssetStringValue(certification["raw_status"])))
	if status == "" || status == "unknown" {
		status = persistencemodel.ProviderAssetStatusProcessing
	}
	err := h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		group, err := upsertProviderAssetGroup(tx, persistencemodel.ProviderAssetGroup{
			ProviderID:       provider.ProviderID,
			ProviderKind:     provider.ProviderKind,
			ProviderCategory: provider.ProviderCategory,
			OrgID:            cloneUintPtr(orgID),
			ProjectID:        strings.TrimSpace(body.ProjectID),
			ProjectName:      strings.TrimSpace(body.ProjectName),
			SettingID:        strings.TrimSpace(body.SettingID),
			ModelScope:       "",
			Scope:            groupScope,
			RemoteGroupID:    remoteGroupID,
			Name:             groupName,
			Origin:           providerAssetGroupOrigin(body),
			Status:           persistencemodel.ProviderAssetStatusActive,
			RawMetadataJSON:  rawMetadata,
			LastSyncedAt:     &now,
		})
		if err != nil {
			return err
		}
		result.Group = group
		asset, err := upsertProviderAsset(tx, persistencemodel.ProviderAsset{
			ProviderID:        provider.ProviderID,
			ProviderKind:      provider.ProviderKind,
			OrgID:             cloneUintPtr(orgID),
			GroupID:           group.ID,
			RemoteGroupID:     remoteGroupID,
			RemoteAssetID:     remoteAssetID,
			AssetURI:          assetURI,
			HubAssetID:        hubAssetID,
			SourceResourceID:  &sourceResourceID,
			SourceCandidateID: strings.TrimSpace(providerAssetStringValue(certification["source_candidate_id"])),
			SourceURL:         strings.TrimSpace(providerAssetStringValue(certification["source_url"])),
			SourceHash:        strings.TrimSpace(providerAssetStringValue(certification["source_hash"])),
			Name:              strings.TrimSpace(firstNonEmptyString(body.Name, resource.Name, remoteAssetID)),
			AssetType:         "image",
			MimeType:          resource.MimeType,
			Status:            status,
			RawStatus:         strings.TrimSpace(providerAssetStringValue(certification["raw_status"])),
			RawMetadataJSON:   rawMetadata,
			LastSyncedAt:      &now,
		})
		if err != nil {
			return err
		}
		result.Asset = asset
		cert, err := upsertProviderAssetModelCertification(tx, persistencemodel.ProviderAssetModelCertification{
			ProviderAssetID: asset.ID,
			ProviderID:      provider.ProviderID,
			PublicModelID:   model,
			ProviderModelID: strings.TrimSpace(firstNonEmptyString(providerAssetStringValue(certification["provider_model_id"]), model)),
			Capability:      "video_i2v",
			Status:          status,
			AssetURI:        assetURI,
			RemoteAssetID:   remoteAssetID,
			CertifiedAt:     &now,
			Error:           strings.TrimSpace(firstNonEmptyString(providerAssetStringValue(certification["error"]), providerAssetStringValue(certification["message"]))),
			RawMetadataJSON: rawMetadata,
		})
		if err != nil {
			return err
		}
		result.Certification = cert
		return nil
	})
	return result, err
}

func upsertProviderAssetGroup(tx *gorm.DB, next persistencemodel.ProviderAssetGroup) (persistencemodel.ProviderAssetGroup, error) {
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

func upsertProviderAsset(tx *gorm.DB, next persistencemodel.ProviderAsset) (persistencemodel.ProviderAsset, error) {
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

func upsertProviderAssetModelCertification(tx *gorm.DB, next persistencemodel.ProviderAssetModelCertification) (persistencemodel.ProviderAssetModelCertification, error) {
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

func providerAssetGroupOrigin(body providerAssetCertifyRequest) string {
	if strings.TrimSpace(body.AssetGroupID) != "" {
		return persistencemodel.ProviderAssetGroupOriginManual
	}
	return persistencemodel.ProviderAssetGroupOriginManaged
}

func providerAssetRemoteGroupID(value map[string]any) string {
	return firstString(value, "asset_group_id", "AssetGroupId", "AssetGroupID", "group_id", "GroupId", "GroupID", "id", "Id")
}

func providerAssetRemoteAssetID(value map[string]any) string {
	assetID := firstString(value, "hub_asset_id", "asset_id", "assetId", "AssetId", "AssetID", "id", "Id")
	if assetID != "" {
		return assetID
	}
	return strings.TrimPrefix(firstString(value, "asset_uri", "assetUri", "AssetURI", "URI"), "asset://")
}

func providerAssetRemoteAssetURI(value map[string]any, remoteAssetID string) string {
	assetURI := firstString(value, "asset_uri", "assetUri", "AssetURI", "URI")
	if assetURI != "" {
		return assetURI
	}
	if strings.TrimSpace(remoteAssetID) == "" {
		return ""
	}
	return "asset://" + strings.TrimSpace(remoteAssetID)
}

func marshalProviderAssetJSON(value any) string {
	raw, err := json.Marshal(value)
	if err != nil || len(raw) == 0 {
		return "{}"
	}
	return string(raw)
}

func providerAssetStringValue(value any) string {
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

func cloneUintPtr(value *uint) *uint {
	if value == nil {
		return nil
	}
	next := *value
	return &next
}

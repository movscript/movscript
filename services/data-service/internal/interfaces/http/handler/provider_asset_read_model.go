package handler

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/app/providerasset"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

type providerAssetLibraryRecordResult = providerasset.LibraryRecordResult
type providerAssetWithCertifications = providerasset.AssetWithCertifications
type providerAssetProviderRef = providerasset.ProviderRef

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
	groups, err := h.providerAssetStore().ListGroups(c.Request.Context(), provider.ProviderID, currentOrgID(c), c.Query("project_id"))
	if err != nil {
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
	group, items, err := h.providerAssetStore().ListAssets(c.Request.Context(), provider.ProviderID, c.Param("group_ref"), currentOrgID(c))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("provider asset group not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
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

func (h *ProviderAssetHandler) providerAssetStore() *providerasset.Service {
	if h == nil {
		return providerasset.NewService(nil)
	}
	if h.providerAssets != nil {
		return h.providerAssets
	}
	return providerasset.NewService(h.db)
}

func (h *ProviderAssetHandler) lookupProviderAssetGroup(ctx context.Context, providerID string, groupRef string) (providerasset.Group, error) {
	return h.providerAssetStore().LookupGroup(ctx, providerID, groupRef)
}

func (h *ProviderAssetHandler) recordRemoteProviderAssetGroups(ctx context.Context, orgID *uint, provider providerAssetProviderRef, remoteGroups []map[string]any) ([]providerasset.Group, error) {
	return h.providerAssetStore().RecordRemoteGroups(ctx, orgID, provider, providerAssetRemoteObjects(remoteGroups))
}

func (h *ProviderAssetHandler) ensureRemoteProviderAssetGroupMirror(ctx context.Context, orgID *uint, provider providerAssetProviderRef, groupRef string) (providerasset.Group, error) {
	return h.providerAssetStore().EnsureRemoteGroupMirror(ctx, orgID, provider, groupRef)
}

func (h *ProviderAssetHandler) recordRemoteProviderAssets(ctx context.Context, orgID *uint, provider providerAssetProviderRef, group providerasset.Group, model string, remoteAssets []map[string]any) ([]providerAssetWithCertifications, error) {
	return h.providerAssetStore().RecordRemoteAssets(ctx, orgID, provider, group, model, providerAssetRemoteObjects(remoteAssets))
}

func (h *ProviderAssetHandler) recordProviderAssetLibraryRecord(ctx context.Context, orgID *uint, provider providerAssetProviderRef, body providerAssetCertifyRequest, resource domainresource.RawResource, certification map[string]any) (providerAssetLibraryRecordResult, error) {
	return h.providerAssetStore().RecordLibraryRecord(ctx, orgID, provider, providerasset.RecordLibraryInput{
		ProjectID:         body.ProjectID,
		ProjectName:       body.ProjectName,
		SettingID:         body.SettingID,
		Name:              body.Name,
		Model:             body.Model,
		AssetGroupID:      body.AssetGroupID,
		AssetGroupName:    body.AssetGroupName,
		SourceCandidateID: body.SourceCandidateID,
	}, resource, providerasset.Certification(certification))
}

func providerAssetRemoteObjects(values []map[string]any) []providerasset.RemoteObject {
	out := make([]providerasset.RemoteObject, 0, len(values))
	for _, value := range values {
		out = append(out, providerasset.RemoteObject(value))
	}
	return out
}

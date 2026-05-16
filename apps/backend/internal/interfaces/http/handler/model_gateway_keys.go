package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	modelgatewayapp "github.com/movscript/movscript/internal/app/modelgateway"
	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
	audit "github.com/movscript/movscript/internal/interfaces/http/auditlog"
)

func (h *ModelGatewayHandler) ListAPIKeys(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	keys, err := h.service.ListAPIKeys(c.Request.Context(), user.ID, currentOrgID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": keys})
}

func (h *ModelGatewayHandler) CreateAPIKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var req createGatewayAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.service.CreateAPIKey(c.Request.Context(), modelgatewayapp.CreateAPIKeyInput{
		OwnerUserID:     user.ID,
		OrgID:           currentOrgID(c),
		Name:            req.Name,
		ProjectID:       req.ProjectID,
		AllowedModelIDs: req.AllowedModelIDs,
		AllowedScopes:   req.AllowedScopes,
		Runtime:         req.Runtime.toAppInput(),
	})
	if err != nil {
		writeGatewayAPIKeyError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "model_gateway.api_key.admin_created",
		TargetType: "model_gateway_api_key",
		TargetID:   audit.TargetID(result.Key.ID),
		Metadata:   gatewayAPIKeyAuditMetadata(result.Key),
	})
	c.JSON(http.StatusCreated, gatewayAPIKeyCreateResponse{APIKey: result.Key, Key: result.RawKey})
}

func (h *ModelGatewayHandler) UpdateAPIKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var req updateGatewayAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	key, err := h.service.UpdateAPIKey(c.Request.Context(), modelgatewayapp.UpdateAPIKeyInput{
		ID:              parseID(c.Param("id")),
		OwnerUserID:     user.ID,
		OrgID:           currentOrgID(c),
		Name:            req.Name,
		ProjectID:       req.ProjectID,
		ProjectIDSet:    req.ProjectIDSet,
		AllowedModelIDs: req.AllowedModelIDs,
		AllowedScopes:   req.AllowedScopes,
		IsEnabled:       req.IsEnabled,
		Runtime:         req.Runtime.toAppInput(),
	})
	if err != nil {
		writeGatewayAPIKeyError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "model_gateway.api_key.admin_updated",
		TargetType: "model_gateway_api_key",
		TargetID:   audit.TargetID(key.ID),
		Metadata:   gatewayAPIKeyAuditMetadata(key),
	})
	c.JSON(http.StatusOK, key)
}

func (h *ModelGatewayHandler) DeleteAPIKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	key, err := h.service.DeleteAPIKey(c.Request.Context(), parseID(c.Param("id")), user.ID, currentOrgID(c))
	if err != nil {
		writeGatewayAPIKeyError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "model_gateway.api_key.admin_deleted",
		TargetType: "model_gateway_api_key",
		TargetID:   audit.TargetID(key.ID),
		Metadata:   gatewayAPIKeyAuditMetadata(key),
	})
	c.Status(http.StatusNoContent)
}

func writeGatewayAPIKeyError(c *gin.Context, err error) {
	if errors.Is(err, modelgatewayapp.ErrAPIKeyNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "api key not found"})
		return
	}
	if errors.Is(err, modelgatewayapp.ErrProjectNotFound) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "project not found"})
		return
	}
	if errors.Is(err, modelgatewayapp.ErrProjectOutsideOrg) {
		c.JSON(http.StatusForbidden, gin.H{"error": "project is outside current workspace"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}

func gatewayAPIKeyAuditMetadata(key domainmodelgateway.APIKey) map[string]any {
	return map[string]any{
		"api_key_id":        key.ID,
		"name":              key.Name,
		"key_prefix":        key.KeyPrefix,
		"owner_user_id":     key.OwnerUserID,
		"org_id":            key.OrgID,
		"project_id":        key.ProjectID,
		"allowed_model_ids": key.AllowedModelIDs,
		"allowed_scopes":    key.AllowedScopes,
		"is_enabled":        key.IsEnabled,
	}
}

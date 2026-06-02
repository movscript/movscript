package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/interfaces/http/api"
)

func (h *SemanticEntityHandler) ApplyProductionWorkspace(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var raw map[string]any
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if err := validateProductionWorkspaceSnapshotPayload(raw); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	var req semanticapp.ApplyProductionWorkspaceRequest
	if err := bindMap(raw, &req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if req.Workspace == nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput("workspace is required"))
		return
	}

	resp, err := h.semantic.ApplyProductionWorkspace(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *SemanticEntityHandler) PreviewProductionWorkspaceApply(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var raw map[string]any
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if err := validateProductionWorkspaceSnapshotPayload(raw); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	var req semanticapp.ApplyProductionWorkspaceRequest
	if err := bindMap(raw, &req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if req.Workspace == nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput("workspace is required"))
		return
	}

	resp, err := h.semantic.PreviewProductionWorkspaceApply(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func validateProductionWorkspaceSnapshotPayload(raw map[string]any) error {
	if raw["mode"] != "snapshot" {
		return errors.New("production workspace requires mode snapshot")
	}
	if containsActionKey(raw["workspace"]) {
		return errors.New("production workspace snapshot must not include action fields")
	}
	return nil
}

func bindMap(value map[string]any, out any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, out)
}

func containsActionKey(value any) bool {
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			if containsActionKey(item) {
				return true
			}
		}
	case map[string]any:
		if _, ok := typed["action"]; ok {
			return true
		}
		for _, item := range typed {
			if containsActionKey(item) {
				return true
			}
		}
	}
	return false
}

func (h *SemanticEntityHandler) ApplyProjectStandardsWorkspace(c *gin.Context) {
	h.applyProjectLayerWorkspace(c, "project_standards_workspace")
}

func (h *SemanticEntityHandler) ApplySettingWorkspace(c *gin.Context) {
	h.applyProjectLayerWorkspace(c, "setting_workspace")
}

func (h *SemanticEntityHandler) ApplyAssetWorkspace(c *gin.Context) {
	h.applyProjectLayerWorkspace(c, "asset_workspace")
}

func (h *SemanticEntityHandler) applyProjectLayerWorkspace(c *gin.Context, routeScope string) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ApplyProjectLayerWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if routeScope != "" {
		if req.Scope != "" && req.Scope != routeScope {
			c.JSON(http.StatusBadRequest, api.InvalidInput("workspace scope does not match apply route"))
			return
		}
		req.Scope = routeScope
	}
	if req.Workspace == nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput("workspace is required"))
		return
	}

	resp, err := h.semantic.ApplyProjectLayerWorkspace(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *SemanticEntityHandler) PreviewProjectStandardsWorkspaceApply(c *gin.Context) {
	h.previewProjectLayerWorkspaceApply(c, "project_standards_workspace")
}

func (h *SemanticEntityHandler) PreviewSettingWorkspaceApply(c *gin.Context) {
	h.previewProjectLayerWorkspaceApply(c, "setting_workspace")
}

func (h *SemanticEntityHandler) PreviewAssetWorkspaceApply(c *gin.Context) {
	h.previewProjectLayerWorkspaceApply(c, "asset_workspace")
}

func (h *SemanticEntityHandler) previewProjectLayerWorkspaceApply(c *gin.Context, routeScope string) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ApplyProjectLayerWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if routeScope != "" {
		if req.Scope != "" && req.Scope != routeScope {
			c.JSON(http.StatusBadRequest, api.InvalidInput("workspace scope does not match apply route"))
			return
		}
		req.Scope = routeScope
	}
	if req.Workspace == nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput("workspace is required"))
		return
	}

	resp, err := h.semantic.PreviewProjectLayerWorkspaceApply(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":      "ok",
		"dry_run":     true,
		"would_apply": resp,
	})
}

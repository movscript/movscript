package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/interfaces/http/api"
)

func (h *SemanticEntityHandler) ApplyProductionProposal(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var raw map[string]any
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if err := validateProductionProposalSnapshotPayload(raw); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	var req semanticapp.ApplyProductionProposalRequest
	if err := bindMap(raw, &req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if req.Proposal == nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput("proposal is required"))
		return
	}

	resp, err := h.semantic.ApplyProductionProposal(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *SemanticEntityHandler) PreviewProductionProposalApply(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var raw map[string]any
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if err := validateProductionProposalSnapshotPayload(raw); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	var req semanticapp.ApplyProductionProposalRequest
	if err := bindMap(raw, &req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if req.Proposal == nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput("proposal is required"))
		return
	}

	resp, err := h.semantic.PreviewProductionProposalApply(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func validateProductionProposalSnapshotPayload(raw map[string]any) error {
	if raw["mode"] != "snapshot" {
		return errors.New("production proposal requires mode snapshot")
	}
	if containsActionKey(raw["proposal"]) {
		return errors.New("production proposal snapshot must not include action fields")
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

func (h *SemanticEntityHandler) ApplyProjectStandardsProposal(c *gin.Context) {
	h.applyProjectLayerProposal(c, "project_standards_proposal")
}

func (h *SemanticEntityHandler) ApplySettingProposal(c *gin.Context) {
	h.applyProjectLayerProposal(c, "setting_proposal")
}

func (h *SemanticEntityHandler) ApplyAssetProposal(c *gin.Context) {
	h.applyProjectLayerProposal(c, "asset_proposal")
}

func (h *SemanticEntityHandler) applyProjectLayerProposal(c *gin.Context, routeScope string) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ApplyProjectLayerProposalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if routeScope != "" {
		if req.Scope != "" && req.Scope != routeScope {
			c.JSON(http.StatusBadRequest, api.InvalidInput("proposal scope does not match apply route"))
			return
		}
		req.Scope = routeScope
	}
	if req.Proposal == nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput("proposal is required"))
		return
	}

	resp, err := h.semantic.ApplyProjectLayerProposal(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *SemanticEntityHandler) PreviewProjectStandardsProposalApply(c *gin.Context) {
	h.previewProjectLayerProposalApply(c, "project_standards_proposal")
}

func (h *SemanticEntityHandler) PreviewSettingProposalApply(c *gin.Context) {
	h.previewProjectLayerProposalApply(c, "setting_proposal")
}

func (h *SemanticEntityHandler) PreviewAssetProposalApply(c *gin.Context) {
	h.previewProjectLayerProposalApply(c, "asset_proposal")
}

func (h *SemanticEntityHandler) previewProjectLayerProposalApply(c *gin.Context, routeScope string) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ApplyProjectLayerProposalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if routeScope != "" {
		if req.Scope != "" && req.Scope != routeScope {
			c.JSON(http.StatusBadRequest, api.InvalidInput("proposal scope does not match apply route"))
			return
		}
		req.Scope = routeScope
	}
	if req.Proposal == nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput("proposal is required"))
		return
	}

	resp, err := h.semantic.PreviewProjectLayerProposalApply(c.Request.Context(), projectID, req)
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

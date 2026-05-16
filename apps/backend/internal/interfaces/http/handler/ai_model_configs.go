package handler

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	aiadminapp "github.com/movscript/movscript/internal/app/aiadmin"
	"github.com/movscript/movscript/internal/app/dto"
	domainaiadmin "github.com/movscript/movscript/internal/domain/aiadmin"
	"github.com/movscript/movscript/internal/infra/ai"
	audit "github.com/movscript/movscript/internal/interfaces/http/auditlog"
)

func (h *AIHandler) ListModelConfigs(c *gin.Context) {
	cfgs, err := h.service.ListModelConfigs(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfgs)
}

func (h *AIHandler) CreateModelConfig(c *gin.Context) {
	var req dto.AIModelConfigInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// custom_capabilities is always required; presets are only UI templates.
	if req.CustomCapabilities == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "custom_capabilities is required (e.g. \"text\" or \"image\")"})
		return
	}

	cfg, err := h.service.CreateModelConfig(c.Request.Context(), parseUint(c.Param("id")), req)
	if err != nil {
		writeModelConfigError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "ai_model_config.admin_created",
		TargetType: "ai_model_config",
		TargetID:   audit.TargetID(cfg.ID),
		Metadata:   modelConfigAuditMetadata(cfg),
	})
	c.JSON(http.StatusCreated, cfg)
}

func (h *AIHandler) UpdateModelConfig(c *gin.Context) {
	var req dto.AIModelConfigInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.CustomCapabilities == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "custom_capabilities is required (e.g. \"text\" or \"image\")"})
		return
	}
	cfg, err := h.service.UpdateModelConfig(c.Request.Context(), c.Param("modelId"), req)
	if err != nil {
		writeModelConfigError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "ai_model_config.admin_updated",
		TargetType: "ai_model_config",
		TargetID:   audit.TargetID(cfg.ID),
		Metadata:   modelConfigAuditMetadata(cfg),
	})
	c.JSON(http.StatusOK, cfg)
}

func (h *AIHandler) DeleteModelConfig(c *gin.Context) {
	cfg, err := h.service.DeleteModelConfig(c.Request.Context(), c.Param("modelId"))
	if err != nil {
		writeModelConfigError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "ai_model_config.admin_deleted",
		TargetType: "ai_model_config",
		TargetID:   audit.TargetID(cfg.ID),
		Metadata:   modelConfigAuditMetadata(cfg),
	})
	c.Status(http.StatusNoContent)
}

// PatchModelConfig updates a model config by its own ID (no credential_id in path).
// Supports partial updates for all custom metadata, credit prices, and flags.
// Used by the admin feature-config tab for inline editing.
func (h *AIHandler) PatchModelConfig(c *gin.Context) {
	var req struct {
		ModelIDOverride       *string  `json:"model_id_override"`
		IsEnabled             *bool    `json:"is_enabled"`
		Priority              *int     `json:"priority"`
		CreditsInputPer1M     *float64 `json:"credits_input_per_1m"`
		CreditsOutputPer1M    *float64 `json:"credits_output_per_1m"`
		CreditsPerImage       *float64 `json:"credits_per_image"`
		CreditsPerSecond      *float64 `json:"credits_per_second"`
		CreditsPerCall        *float64 `json:"credits_per_call"`
		CustomDisplayName     *string  `json:"custom_display_name"`
		ShortName             *string  `json:"short_name"`
		CustomCapabilities    *string  `json:"custom_capabilities"`
		CustomPricingMode     *string  `json:"custom_pricing_mode"`
		CustomAcceptsImage    *bool    `json:"custom_accepts_image"`
		CustomMaxInputImages  *int     `json:"custom_max_input_images"`
		CustomMaxInputVideos  *int     `json:"custom_max_input_videos"`
		CustomImageEditField  *string  `json:"custom_image_edit_field"`
		CustomSupportedParams *string  `json:"custom_supported_params"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfg, err := h.service.PatchModelConfig(c.Request.Context(), aiadminapp.PatchModelConfigInput{
		ID:                    c.Param("id"),
		ModelIDOverride:       req.ModelIDOverride,
		IsEnabled:             req.IsEnabled,
		Priority:              req.Priority,
		CreditsInputPer1M:     req.CreditsInputPer1M,
		CreditsOutputPer1M:    req.CreditsOutputPer1M,
		CreditsPerImage:       req.CreditsPerImage,
		CreditsPerSecond:      req.CreditsPerSecond,
		CreditsPerCall:        req.CreditsPerCall,
		CustomDisplayName:     req.CustomDisplayName,
		ShortName:             req.ShortName,
		CustomCapabilities:    req.CustomCapabilities,
		CustomPricingMode:     req.CustomPricingMode,
		CustomAcceptsImage:    req.CustomAcceptsImage,
		CustomMaxInputImages:  req.CustomMaxInputImages,
		CustomMaxInputVideos:  req.CustomMaxInputVideos,
		CustomImageEditField:  req.CustomImageEditField,
		CustomSupportedParams: req.CustomSupportedParams,
	})
	if err != nil {
		writeModelConfigError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "ai_model_config.admin_patched",
		TargetType: "ai_model_config",
		TargetID:   audit.TargetID(cfg.ID),
		Metadata:   modelConfigAuditMetadata(cfg),
	})
	c.JSON(http.StatusOK, cfg)
}

func (h *AIHandler) PreviewModelConfigContract(c *gin.Context) {
	var req struct {
		AdapterType           string `json:"adapter_type"`
		CustomCapabilities    string `json:"custom_capabilities"`
		CustomAcceptsImage    bool   `json:"custom_accepts_image"`
		CustomMaxInputImages  int    `json:"custom_max_input_images"`
		CustomMaxInputVideos  int    `json:"custom_max_input_videos"`
		CustomSupportedParams string `json:"custom_supported_params"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.service.PreviewModelConfigContract(aiadminapp.PreviewModelConfigContractInput{
		AdapterType:           req.AdapterType,
		CustomCapabilities:    req.CustomCapabilities,
		CustomAcceptsImage:    req.CustomAcceptsImage,
		CustomMaxInputImages:  req.CustomMaxInputImages,
		CustomMaxInputVideos:  req.CustomMaxInputVideos,
		CustomSupportedParams: req.CustomSupportedParams,
	})
	if err != nil {
		writeModelConfigError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

// TestModelConfig runs a minimal generation to verify a model config works.
func (h *AIHandler) TestModelConfig(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	result, err := h.service.TestModelConfig(ctx, c.Param("modelId"))
	if err != nil {
		if errors.Is(err, aiadminapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "credential not found"})
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "ai_model_config.admin_tested",
		TargetType: "ai_model_config",
		TargetID:   c.Param("modelId"),
		Metadata: map[string]any{
			"model_config_id": c.Param("modelId"),
			"success":         result.Success,
			"latency_ms":      result.LatencyMs,
			"message_len":     len(result.Message),
		},
	})
	c.JSON(http.StatusOK, result)
}

// DebugModelConfig makes the actual API call for a model config and returns raw HTTP details.
// Unlike TestModelConfig, image models are actually called (may incur cost).
// Video models use a read-only list request to avoid creating billable tasks.
func (h *AIHandler) DebugModelConfig(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	result, err := h.service.DebugModelConfig(ctx, c.Param("modelId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "ai_model_config.admin_debugged",
		TargetType: "ai_model_config",
		TargetID:   c.Param("modelId"),
		Metadata:   modelConfigDebugAuditMetadata(c.Param("modelId"), result),
	})
	c.JSON(http.StatusOK, result)
}

func writeModelConfigError(c *gin.Context, err error) {
	if errors.Is(err, aiadminapp.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"code": "NOT_FOUND", "message": err.Error(), "error": err.Error()})
		return
	}
	if errors.Is(err, aiadminapp.ErrInvalidModelConfig) {
		c.JSON(http.StatusBadRequest, gin.H{"code": "INVALID_MODEL_CONFIG", "message": err.Error(), "error": err.Error()})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"code": "INTERNAL_ERROR", "message": err.Error(), "error": err.Error()})
}

func modelConfigAuditMetadata(cfg domainaiadmin.ModelConfig) map[string]any {
	return map[string]any{
		"model_config_id":     cfg.ID,
		"credential_id":       cfg.CredentialID,
		"model_def_id":        cfg.ModelDefID,
		"model_id_override":   cfg.ModelIDOverride,
		"is_enabled":          cfg.IsEnabled,
		"priority":            cfg.Priority,
		"custom_display_name": cfg.CustomDisplayName,
		"short_name":          cfg.ShortName,
		"custom_capabilities": cfg.CustomCapabilities,
		"custom_pricing_mode": cfg.CustomPricingMode,
	}
}

func modelConfigDebugAuditMetadata(id string, result ai.DebugCallResult) map[string]any {
	return map[string]any{
		"model_config_id":   id,
		"success":           result.Success,
		"model_id":          result.ModelID,
		"endpoint":          redactAuditURL(result.Endpoint),
		"method":            result.Method,
		"response_status":   result.ResponseStatus,
		"latency_ms":        result.LatencyMs,
		"error_present":     result.Error != "",
		"request_body_len":  len(result.RequestBody),
		"response_body_len": len(result.ResponseBody),
	}
}

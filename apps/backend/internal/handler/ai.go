package handler

import (
	"context"
	"encoding/hex"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	aiadminapp "github.com/movscript/movscript/internal/app/aiadmin"
	"github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

type AIHandler struct {
	registry *ai.Registry
	service  *aiadminapp.Service
}

func NewAIHandler(db *gorm.DB, encryptionKeyHex string, registry *ai.Registry) *AIHandler {
	key, _ := hex.DecodeString(encryptionKeyHex)
	return &AIHandler{registry: registry, service: aiadminapp.NewService(db, key, registry)}
}

// ── Adapter & Model Presets ───────────────────────────────────────────────────

func (h *AIHandler) ListAdapters(c *gin.Context) {
	c.JSON(http.StatusOK, ai.AdapterDefs)
}

// ListModelPresets returns read-only templates for the admin add-model form.
// Presets never participate in runtime routing or generation parameter control.
func (h *AIHandler) ListModelPresets(c *gin.Context) {
	c.JSON(http.StatusOK, ai.ModelPresets())
}

// ── Credentials ───────────────────────────────────────────────────────────────

func (h *AIHandler) ListCredentials(c *gin.Context) {
	creds, err := h.service.ListCredentials(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, creds)
}

func (h *AIHandler) CreateCredential(c *gin.Context) {
	var req struct {
		AdapterType     string            `json:"adapter_type" binding:"required"`
		DisplayName     string            `json:"display_name" binding:"required"`
		Credentials     map[string]string `json:"credentials"`
		FilesAPIEnabled bool              `json:"files_api_enabled"`
		FilesAPIBaseURL string            `json:"files_api_base_url"`
		FilesAPIKey     string            `json:"files_api_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	def := ai.GetAdapterDef(req.AdapterType)
	if def == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown adapter type: " + req.AdapterType})
		return
	}
	for _, field := range def.CredFields {
		if field.Required && req.Credentials[field.Key] == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing required credential: " + field.Key})
			return
		}
	}

	cred, err := h.service.CreateCredential(c.Request.Context(), aiadminapp.CreateCredentialInput{
		AdapterType:     req.AdapterType,
		DisplayName:     req.DisplayName,
		Credentials:     req.Credentials,
		FilesAPIEnabled: req.FilesAPIEnabled,
		FilesAPIBaseURL: req.FilesAPIBaseURL,
		FilesAPIKey:     req.FilesAPIKey,
	})
	if err != nil {
		if errors.Is(err, aiadminapp.ErrEncryptFilesAPIKey) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt files api key"})
			return
		}
		if errors.Is(err, aiadminapp.ErrEncryptCredentials) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt credentials"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, cred)
}

// autoCreateModelConfigs was removed — models are now created manually by the admin.

// SyncModels was removed — model configs are admin-declared.

func (h *AIHandler) UpdateCredential(c *gin.Context) {
	var req struct {
		DisplayName     string            `json:"display_name"`
		BaseURL         *string           `json:"base_url"`
		APIKey          string            `json:"api_key"`
		IsEnabled       *bool             `json:"is_enabled"`
		FilesAPIEnabled *bool             `json:"files_api_enabled"`
		FilesAPIBaseURL *string           `json:"files_api_base_url"`
		FilesAPIKey     string            `json:"files_api_key"`
		Credentials     map[string]string `json:"credentials"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cred, err := h.service.UpdateCredential(c.Request.Context(), aiadminapp.UpdateCredentialInput{
		ID:              c.Param("id"),
		DisplayName:     req.DisplayName,
		BaseURL:         req.BaseURL,
		APIKey:          req.APIKey,
		IsEnabled:       req.IsEnabled,
		FilesAPIEnabled: req.FilesAPIEnabled,
		FilesAPIBaseURL: req.FilesAPIBaseURL,
		FilesAPIKey:     req.FilesAPIKey,
		Credentials:     req.Credentials,
	})
	if err != nil {
		if errors.Is(err, aiadminapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if errors.Is(err, aiadminapp.ErrEncryptFilesAPIKey) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt files api key"})
			return
		}
		if errors.Is(err, aiadminapp.ErrEncryptCredentials) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt credentials"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cred)
}

func (h *AIHandler) DeleteCredential(c *gin.Context) {
	_ = h.service.DeleteCredential(c.Request.Context(), c.Param("id"))
	c.Status(http.StatusNoContent)
}

// ListRemoteModels calls the provider's /models endpoint and returns available model IDs.
// Only supported for OpenAI-compatible providers (including custom).
func (h *AIHandler) ListRemoteModels(c *gin.Context) {
	cred, err := h.service.GetCredential(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	provider, err := h.registry.BuildForCredential(cred)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	type modelFetcher interface {
		FetchModels(ctx context.Context) ([]string, error)
	}
	fetcher, ok := provider.(modelFetcher)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this provider does not support model listing"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	ids, err := fetcher.FetchModels(ctx)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"models": ids})
}

// TestCredential tests connectivity for a credential (provider-level ping).
func (h *AIHandler) TestCredential(c *gin.Context) {
	cred, err := h.service.GetCredential(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	provider, err := h.registry.BuildForCredential(cred)
	if err != nil {
		c.JSON(http.StatusOK, testResult{Success: false, Message: err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	start := time.Now()
	if err := provider.Ping(ctx); err != nil {
		c.JSON(http.StatusOK, testResult{Success: false, Message: err.Error(), LatencyMs: time.Since(start).Milliseconds()})
		return
	}
	c.JSON(http.StatusOK, testResult{Success: true, Message: "连接正常", LatencyMs: time.Since(start).Milliseconds()})
}

// ── Model Configs ────────────────────────────────────────────────────────────

func (h *AIHandler) ListModelConfigs(c *gin.Context) {
	cfgs, err := h.service.ListModelConfigs(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfgs)
}

func (h *AIHandler) CreateModelConfig(c *gin.Context) {
	var req service.AIModelConfigInput
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, cfg)
}

func (h *AIHandler) UpdateModelConfig(c *gin.Context) {
	var req service.AIModelConfigInput
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
		if errors.Is(err, aiadminapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfg)
}

func (h *AIHandler) DeleteModelConfig(c *gin.Context) {
	_ = h.service.DeleteModelConfig(c.Request.Context(), c.Param("modelId"))
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
		CustomBillingMode     *string  `json:"custom_billing_mode"`
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
		CustomBillingMode:     req.CustomBillingMode,
		CustomAcceptsImage:    req.CustomAcceptsImage,
		CustomMaxInputImages:  req.CustomMaxInputImages,
		CustomMaxInputVideos:  req.CustomMaxInputVideos,
		CustomImageEditField:  req.CustomImageEditField,
		CustomSupportedParams: req.CustomSupportedParams,
	})
	if err != nil {
		if errors.Is(err, aiadminapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfg)
}

// TestModelConfig runs a minimal generation to verify a model config works.
func (h *AIHandler) TestModelConfig(c *gin.Context) {
	cfg, err := h.service.GetModelConfig(c.Request.Context(), c.Param("modelId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	cred, err := h.service.GetCredential(c.Request.Context(), cfg.CredentialID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "credential not found"})
		return
	}
	def := ai.ResolveModelDef(cfg.ModelDefID, cred.AdapterType, cfg.CustomDisplayName, cfg.CustomCapabilities, cfg.CustomBillingMode, cfg.CustomAcceptsImage, cfg.CustomMaxInputImages, cfg.CustomMaxInputVideos, cfg.CustomImageEditField, cfg.CustomSupportedParams)

	// Skip generation test for image/video to avoid unintended billing.
	hasText := false
	for _, cap := range def.Capabilities {
		if cap == "text" {
			hasText = true
			break
		}
	}
	if !hasText {
		c.JSON(http.StatusOK, testResult{
			Success: true,
			Message: "图像/视频模型跳过生成测试（避免计费），请通过凭据连接测试验证 key",
		})
		return
	}

	provider, _, err := h.registry.BuildForConfig(cfg)
	if err != nil {
		c.JSON(http.StatusOK, testResult{Success: false, Message: err.Error()})
		return
	}
	modelID := ai.ResolveModelID(cfg.ModelIDOverride, def)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	start := time.Now()
	_, err = provider.TextGenerate(ctx, ai.TextRequest{
		Model:     modelID,
		Messages:  []ai.Message{{Role: "user", Content: "Hi"}},
		MaxTokens: 1,
	})
	if err != nil {
		c.JSON(http.StatusOK, testResult{Success: false, Message: err.Error(), LatencyMs: time.Since(start).Milliseconds()})
		return
	}
	c.JSON(http.StatusOK, testResult{Success: true, Message: "模型响应正常", LatencyMs: time.Since(start).Milliseconds()})
}

// DebugModelConfig makes the actual API call for a model config and returns raw HTTP details.
// Unlike TestModelConfig, image models are actually called (may incur cost).
// Video models use a read-only list request to avoid creating billable tasks.
func (h *AIHandler) DebugModelConfig(c *gin.Context) {
	cfg, err := h.service.GetModelConfig(c.Request.Context(), c.Param("modelId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	result := h.registry.DebugCall(ctx, cfg)
	c.JSON(http.StatusOK, result)
}

func (h *AIHandler) ListUsersWithQuota(c *gin.Context) {
	result, err := h.service.ListUsersWithQuota(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AIHandler) SetUserQuota(c *gin.Context) {
	userID := parseUint(c.Param("id"))
	var req struct {
		Balance float64 `json:"balance" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	quota, err := h.service.SetUserQuota(c.Request.Context(), userID, req.Balance)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, quota)
}

// ── Admin: usage logs ─────────────────────────────────────────────────────────

func (h *AIHandler) ListUsageLogs(c *gin.Context) {
	page := max(1, parseInt(c.DefaultQuery("page", "1")))
	pageSize := max(1, parseInt(c.DefaultQuery("page_size", "50")))
	if pageSize > 200 {
		pageSize = 200
	}
	pageResult, err := h.service.ListUsageLogs(c.Request.Context(), aiadminapp.UsageLogFilter{
		UserID:        c.Query("user_id"),
		ModelConfigID: c.Query("model_config_id"),
		ProviderID:    c.Query("provider_id"),
		Start:         c.Query("start"),
		End:           c.Query("end"),
		Page:          page,
		PageSize:      pageSize,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"total": pageResult.Total, "items": pageResult.Items, "page": pageResult.Page, "page_size": pageResult.PageSize})
}

// ── User: own quota & usage ───────────────────────────────────────────────────

func (h *AIHandler) GetMyQuota(c *gin.Context) {
	u := currentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	summary, err := h.service.GetMyQuota(c.Request.Context(), u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"balance":                 summary.Balance,
		"total_cost_this_month":   summary.TotalCostThisMonth,
		"total_tokens_this_month": summary.TotalTokensThisMonth,
	})
}

func (h *AIHandler) GetMyUsageLogs(c *gin.Context) {
	u := currentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	page := max(1, parseInt(c.DefaultQuery("page", "1")))
	pageSize := max(1, parseInt(c.DefaultQuery("page_size", "20")))
	pageResult, err := h.service.GetMyUsageLogs(c.Request.Context(), u.ID, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"total": pageResult.Total, "items": pageResult.Items})
}

// ── helpers ───────────────────────────────────────────────────────────────────

type testResult struct {
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	LatencyMs int64  `json:"latency_ms"`
}

func parseUint(s string) uint {
	var v uint
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		v = v*10 + uint(c-'0')
	}
	return v
}

func parseInt(s string) int {
	v := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return v
		}
		v = v*10 + int(c-'0')
	}
	return v
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

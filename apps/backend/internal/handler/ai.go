package handler

import (
	"context"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/crypto"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

type AIHandler struct {
	db            *gorm.DB
	encryptionKey []byte
	registry      *ai.Registry
}

func NewAIHandler(db *gorm.DB, encryptionKeyHex string, registry *ai.Registry) *AIHandler {
	key, _ := hex.DecodeString(encryptionKeyHex)
	return &AIHandler{db: db, encryptionKey: key, registry: registry}
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
	var creds []model.AICredential
	h.db.Preload("Models").Find(&creds)
	for i := range creds {
		if creds[i].EncryptedKey != "" {
			if plain, err := crypto.Decrypt(creds[i].EncryptedKey, h.encryptionKey); err == nil {
				creds[i].MaskedKey = crypto.MaskKey(plain)
			}
		}
		if creds[i].FilesAPIEncryptedKey != "" {
			if plain, err := crypto.Decrypt(creds[i].FilesAPIEncryptedKey, h.encryptionKey); err == nil {
				creds[i].FilesAPIMaskedKey = crypto.MaskKey(plain)
			}
		}
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

	baseURL := def.DefaultBaseURL
	if v := req.Credentials["base_url"]; v != "" {
		baseURL = v
	}

	cred := model.AICredential{
		AdapterType:     req.AdapterType,
		DisplayName:     req.DisplayName,
		BaseURL:         baseURL,
		IsEnabled:       true,
		FilesAPIEnabled: req.FilesAPIEnabled,
		FilesAPIBaseURL: req.FilesAPIBaseURL,
	}
	if req.FilesAPIKey != "" {
		encFilesKey, _, err := h.registry.EncryptRawKey(req.FilesAPIKey)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt files api key"})
			return
		}
		cred.FilesAPIEncryptedKey = encFilesKey
		cred.FilesAPIMaskedKey = crypto.MaskKey(req.FilesAPIKey)
	}
	encKey, masked, err := h.registry.EncryptCredentials(req.AdapterType, req.Credentials)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt credentials"})
		return
	}
	cred.EncryptedKey = encKey
	cred.MaskedKey = masked

	if err := h.db.Create(&cred).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, cred)
}

// autoCreateModelConfigs was removed — models are now created manually by the admin.

// SyncModels was removed — model configs are admin-declared.

func (h *AIHandler) UpdateCredential(c *gin.Context) {
	var cred model.AICredential
	if err := h.db.First(&cred, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
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
	if req.DisplayName != "" {
		cred.DisplayName = req.DisplayName
	}
	if req.BaseURL != nil {
		cred.BaseURL = *req.BaseURL
	}
	if req.IsEnabled != nil {
		cred.IsEnabled = *req.IsEnabled
	}
	if req.FilesAPIEnabled != nil {
		cred.FilesAPIEnabled = *req.FilesAPIEnabled
	}
	if req.FilesAPIBaseURL != nil {
		cred.FilesAPIBaseURL = *req.FilesAPIBaseURL
	}
	if req.FilesAPIKey != "" {
		encFilesKey, _, err := h.registry.EncryptRawKey(req.FilesAPIKey)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt files api key"})
			return
		}
		cred.FilesAPIEncryptedKey = encFilesKey
		cred.FilesAPIMaskedKey = crypto.MaskKey(req.FilesAPIKey)
	}
	if req.APIKey != "" {
		if req.Credentials == nil {
			req.Credentials = map[string]string{}
		}
		req.Credentials["api_key"] = req.APIKey
	}
	if len(req.Credentials) > 0 {
		if v, ok := req.Credentials["base_url"]; ok {
			cred.BaseURL = v
		}
		if cred.AdapterType == ai.AdapterKling && (req.Credentials["access_key"] != "" || req.Credentials["secret_key"] != "") {
			if plain, err := crypto.Decrypt(cred.EncryptedKey, h.encryptionKey); err == nil {
				parts := splitKlingCredential(plain)
				if req.Credentials["access_key"] == "" {
					req.Credentials["access_key"] = parts[0]
				}
				if req.Credentials["secret_key"] == "" {
					req.Credentials["secret_key"] = parts[1]
				}
			}
		}
		encKey, masked, err := h.registry.EncryptCredentials(cred.AdapterType, req.Credentials)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt credentials"})
			return
		}
		if encKey != "" {
			cred.EncryptedKey = encKey
			cred.MaskedKey = masked
		}
	}
	h.db.Save(&cred)
	if cred.EncryptedKey != "" {
		if plain, err := crypto.Decrypt(cred.EncryptedKey, h.encryptionKey); err == nil {
			cred.MaskedKey = crypto.MaskKey(plain)
		}
	}
	c.JSON(http.StatusOK, cred)
}

func splitKlingCredential(key string) [2]string {
	for i, c := range key {
		if c == ':' {
			return [2]string{key[:i], key[i+1:]}
		}
	}
	return [2]string{key, ""}
}

func (h *AIHandler) DeleteCredential(c *gin.Context) {
	h.db.Delete(&model.AICredential{}, c.Param("id"))
	c.Status(http.StatusNoContent)
}

// ListRemoteModels calls the provider's /models endpoint and returns available model IDs.
// Only supported for OpenAI-compatible providers (including custom).
func (h *AIHandler) ListRemoteModels(c *gin.Context) {
	var cred model.AICredential
	if err := h.db.First(&cred, c.Param("id")).Error; err != nil {
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
	var cred model.AICredential
	if err := h.db.First(&cred, c.Param("id")).Error; err != nil {
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
	var cfgs []model.AIModelConfig
	h.db.Where("credential_id = ?", c.Param("id")).Find(&cfgs)
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

	cfg := service.NewAIModelConfig(req, parseUint(c.Param("id")))
	if err := h.db.Create(&cfg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, cfg)
}

func (h *AIHandler) UpdateModelConfig(c *gin.Context) {
	var cfg model.AIModelConfig
	if err := h.db.First(&cfg, c.Param("modelId")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req service.AIModelConfigInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.CustomCapabilities == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "custom_capabilities is required (e.g. \"text\" or \"image\")"})
		return
	}
	service.ApplyAIModelConfigInput(&cfg, req)
	h.db.Save(&cfg)
	c.JSON(http.StatusOK, cfg)
}

func (h *AIHandler) DeleteModelConfig(c *gin.Context) {
	h.db.Delete(&model.AIModelConfig{}, c.Param("modelId"))
	c.Status(http.StatusNoContent)
}

// PatchModelConfig updates a model config by its own ID (no credential_id in path).
// Supports partial updates for all custom metadata, credit prices, and flags.
// Used by the admin feature-config tab for inline editing.
func (h *AIHandler) PatchModelConfig(c *gin.Context) {
	var cfg model.AIModelConfig
	if err := h.db.First(&cfg, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
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
	if req.ModelIDOverride != nil {
		cfg.ModelIDOverride = *req.ModelIDOverride
	}
	if req.CustomDisplayName != nil {
		cfg.CustomDisplayName = *req.CustomDisplayName
	}
	if req.ShortName != nil {
		cfg.ShortName = *req.ShortName
	}
	if req.CustomCapabilities != nil {
		cfg.CustomCapabilities = *req.CustomCapabilities
	}
	if req.CustomBillingMode != nil {
		cfg.CustomBillingMode = *req.CustomBillingMode
	}
	if req.CustomAcceptsImage != nil {
		cfg.CustomAcceptsImage = *req.CustomAcceptsImage
	}
	if req.CustomMaxInputImages != nil {
		cfg.CustomMaxInputImages = *req.CustomMaxInputImages
	}
	if req.CustomMaxInputVideos != nil {
		cfg.CustomMaxInputVideos = *req.CustomMaxInputVideos
	}
	if req.CustomImageEditField != nil {
		cfg.CustomImageEditField = *req.CustomImageEditField
	}
	if req.CustomSupportedParams != nil {
		cfg.CustomSupportedParams = *req.CustomSupportedParams
	}
	if req.IsEnabled != nil {
		cfg.IsEnabled = *req.IsEnabled
	}
	if req.Priority != nil {
		cfg.Priority = *req.Priority
	}
	if req.CreditsInputPer1M != nil {
		cfg.CreditsInputPer1M = *req.CreditsInputPer1M
	}
	if req.CreditsOutputPer1M != nil {
		cfg.CreditsOutputPer1M = *req.CreditsOutputPer1M
	}
	if req.CreditsPerImage != nil {
		cfg.CreditsPerImage = *req.CreditsPerImage
	}
	if req.CreditsPerSecond != nil {
		cfg.CreditsPerSecond = *req.CreditsPerSecond
	}
	if req.CreditsPerCall != nil {
		cfg.CreditsPerCall = *req.CreditsPerCall
	}
	h.db.Save(&cfg)
	c.JSON(http.StatusOK, cfg)
}

// TestModelConfig runs a minimal generation to verify a model config works.
func (h *AIHandler) TestModelConfig(c *gin.Context) {
	var cfg model.AIModelConfig
	if err := h.db.First(&cfg, c.Param("modelId")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var cred model.AICredential
	if err := h.db.First(&cred, cfg.CredentialID).Error; err != nil {
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
	var cfg model.AIModelConfig
	if err := h.db.First(&cfg, c.Param("modelId")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	result := h.registry.DebugCall(ctx, cfg)
	c.JSON(http.StatusOK, result)
}

// ── Admin: user management & quotas ──────────────────────────────────────────

type userWithQuota struct {
	model.User
	Balance float64 `json:"balance"`
}

func (h *AIHandler) ListUsersWithQuota(c *gin.Context) {
	var users []model.User
	h.db.Find(&users)
	result := make([]userWithQuota, len(users))
	for i, u := range users {
		var quota model.UserQuota
		h.db.Where("user_id = ?", u.ID).First(&quota)
		result[i] = userWithQuota{User: u, Balance: quota.Balance}
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
	var quota model.UserQuota
	result := h.db.Where("user_id = ?", userID).First(&quota)
	if result.Error != nil {
		quota = model.UserQuota{UserID: userID, Balance: req.Balance}
		h.db.Create(&quota)
	} else {
		quota.Balance = req.Balance
		h.db.Save(&quota)
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
	offset := (page - 1) * pageSize

	q := h.db.Model(&model.UsageLog{}).Preload("User").Preload("AIModelConfig")
	if uid := c.Query("user_id"); uid != "" {
		q = q.Where("user_id = ?", uid)
	}
	if modelID := c.Query("model_config_id"); modelID != "" {
		q = q.Where("ai_model_config_id = ?", modelID)
	}
	if providerID := c.Query("provider_id"); providerID != "" {
		q = q.Joins("JOIN ai_model_configs ON ai_model_configs.id = usage_logs.ai_model_config_id").
			Where("ai_model_configs.credential_id = ?", providerID)
	}
	if start := c.Query("start"); start != "" {
		q = q.Where("usage_logs.created_at >= ?", start)
	}
	if end := c.Query("end"); end != "" {
		q = q.Where("usage_logs.created_at <= ?", end)
	}

	var total int64
	q.Count(&total)

	var logs []model.UsageLog
	q.Order("usage_logs.created_at DESC").Limit(pageSize).Offset(offset).Find(&logs)
	c.JSON(http.StatusOK, gin.H{"total": total, "items": logs, "page": page, "page_size": pageSize})
}

// ── User: own quota & usage ───────────────────────────────────────────────────

func (h *AIHandler) GetMyQuota(c *gin.Context) {
	u := currentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	var quota model.UserQuota
	h.db.Where("user_id = ?", u.ID).First(&quota)

	var totalCost float64
	var totalTokens int64
	h.db.Model(&model.UsageLog{}).
		Where("user_id = ? AND created_at >= date_trunc('month', now())", u.ID).
		Select("COALESCE(SUM(cost), 0)").Scan(&totalCost)
	h.db.Model(&model.UsageLog{}).
		Where("user_id = ? AND created_at >= date_trunc('month', now())", u.ID).
		Select("COALESCE(SUM(input_tokens + output_tokens), 0)").Scan(&totalTokens)

	c.JSON(http.StatusOK, gin.H{
		"balance":                 quota.Balance,
		"total_cost_this_month":   totalCost,
		"total_tokens_this_month": totalTokens,
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
	offset := (page - 1) * pageSize

	var total int64
	h.db.Model(&model.UsageLog{}).Where("user_id = ?", u.ID).Count(&total)

	var logs []model.UsageLog
	h.db.Where("user_id = ?", u.ID).
		Preload("AIModelConfig").
		Order("created_at DESC").
		Limit(pageSize).Offset(offset).
		Find(&logs)
	c.JSON(http.StatusOK, gin.H{"total": total, "items": logs})
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

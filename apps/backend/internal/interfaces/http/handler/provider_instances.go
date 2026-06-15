package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	adminai "github.com/movscript/movscript/internal/app/admin/ai"
	"github.com/movscript/movscript/internal/infra/config"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	providerassembly "github.com/movscript/movscript/internal/providers/assembly"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

var providerActivationHTTPClient = &http.Client{Timeout: 20 * time.Second}

func (h *AIHandler) ListProviderInstances(c *gin.Context) {
	instances, err := h.service.ListProviderInstances(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if h.newAPIGatewayMode() {
		instances = filterNonAIGatewayCredentialInstances(instances)
	}
	instances = append(startupProviderInstances(h.cfg), instances...)
	c.JSON(http.StatusOK, gin.H{"items": instances})
}

func (h *AIHandler) TestProviderInstance(c *gin.Context) {
	ctx, cancel := contextWithProviderInstanceTimeout(c)
	defer cancel()
	instanceID := c.Param("id")
	result, err := h.service.TestProviderInstance(ctx, instanceID)
	if err != nil {
		if errors.Is(err, adminai.ErrNotFound) {
			startupResult, startupErr := providerassembly.TestStartupProviderInstance(ctx, h.cfg, instanceID)
			if startupErr != nil {
				if errors.Is(startupErr, providerassembly.ErrProviderInstanceNotFound) {
					c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": startupErr.Error()})
				return
			}
			result = adminai.TestResult{Success: startupResult.Success, Message: startupResult.Message, LatencyMs: startupResult.LatencyMs}
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "provider_instance.admin_tested",
		TargetType: "provider_instance",
		TargetID:   instanceID,
		Metadata: map[string]any{
			"provider_instance_id": instanceID,
			"success":              result.Success,
			"latency_ms":           result.LatencyMs,
			"message_len":          len(result.Message),
		},
	})
	c.JSON(http.StatusOK, result)
}

func (h *AIHandler) GetProviderInstanceConfig(c *gin.Context) {
	instance, ok := h.startupProviderInstance(c.Param("id"))
	if !ok || !instance.ConfigEditable {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	draft, err := h.service.GetProviderInstanceConfigDraft(c.Request.Context(), instance)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, draft)
}

func (h *AIHandler) UpdateProviderInstanceConfig(c *gin.Context) {
	instance, ok := h.startupProviderInstance(c.Param("id"))
	if !ok || !instance.ConfigEditable {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req adminai.ProviderInstanceConfigDraftInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	draft, err := h.service.UpdateProviderInstanceConfigDraft(c.Request.Context(), instance, req)
	if err != nil {
		if errors.Is(err, adminai.ErrInvalidProviderInstanceConfig) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "provider_instance.config_draft.admin_updated",
		TargetType: "provider_instance",
		TargetID:   instance.ID,
		Metadata: map[string]any{
			"provider_instance_id": instance.ID,
			"config_fields":        providerInstanceFieldKeys(draft.ConfigFields),
			"secret_fields":        providerInstanceFieldConfigured(draft.SecretFields),
			"requires_restart":     draft.RequiresRestart,
		},
	})
	c.JSON(http.StatusOK, draft)
}

func (h *AIHandler) ApplyProviderInstanceConfig(c *gin.Context) {
	instance, ok := h.startupProviderInstance(c.Param("id"))
	if !ok || !instance.ConfigEditable {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	envPath := ""
	if h.cfg != nil {
		envPath = h.cfg.ProviderEnvPath
	}
	result, err := h.service.ApplyProviderInstanceConfigDraft(c.Request.Context(), instance, envPath)
	if err != nil {
		if errors.Is(err, adminai.ErrInvalidProviderInstanceConfig) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if h.cfg != nil {
		result.ActivationMode = adminai.ProviderActivationMode(h.cfg.EffectiveProviderAssembly().DeploymentProfile)
		result.ActivationPlan = h.providerActivationPlan(instance.ID, result.ActivationMode, result.EnvPath, result.EnvKeys, result.SecretKeys)
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "provider_instance.config_draft.admin_applied",
		TargetType: "provider_instance",
		TargetID:   instance.ID,
		Metadata: map[string]any{
			"provider_instance_id": instance.ID,
			"env_path":             result.EnvPath,
			"env_keys":             result.EnvKeys,
			"secret_keys":          result.SecretKeys,
			"requires_restart":     result.RequiresRestart,
			"activation_mode":      result.ActivationMode,
		},
	})
	c.JSON(http.StatusOK, result)
}

func (h *AIHandler) ActivateProviderInstanceConfig(c *gin.Context) {
	instance, ok := h.startupProviderInstance(c.Param("id"))
	if !ok || !instance.ConfigEditable {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if h.cfg == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider activation is not configured"})
		return
	}
	mode := adminai.ProviderActivationMode(h.cfg.EffectiveProviderAssembly().DeploymentProfile)
	plan := h.providerActivationPlan(instance.ID, mode, h.cfg.ProviderEnvPath, nil, nil)
	if plan.Action != "rollout_backend_deployment" || !plan.CanAutoApply {
		c.JSON(http.StatusConflict, gin.H{"error": "automatic deployment rollout is not available for this provider activation plan"})
		return
	}
	result, err := h.triggerDeploymentRolloutWebhook(c.Request.Context(), instance, plan)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "provider_instance.config_activation.admin_triggered",
		TargetType: "provider_instance",
		TargetID:   instance.ID,
		Metadata: map[string]any{
			"provider_instance_id": instance.ID,
			"activation_mode":      result.ActivationMode,
			"activation_action":    result.ActivationPlan.Action,
			"activation_host":      result.ActivationPlan.Host,
			"latency_ms":           result.LatencyMs,
			"message_len":          len(result.Message),
		},
	})
	c.JSON(http.StatusOK, result)
}

func contextWithProviderInstanceTimeout(c *gin.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Request.Context(), 15*time.Second)
}

func (h *AIHandler) startupProviderInstance(id string) (adminai.ProviderInstance, bool) {
	for _, instance := range startupProviderInstances(h.cfg) {
		if instance.ID == id {
			return instance, true
		}
	}
	return adminai.ProviderInstance{}, false
}

func startupProviderInstances(cfg *config.Config) []adminai.ProviderInstance {
	if cfg == nil {
		return nil
	}
	instances := cfg.EffectiveProviderInstances()
	out := make([]adminai.ProviderInstance, 0, len(instances))
	for _, instance := range instances {
		out = append(out, adminai.ProviderInstance{
			ID:              instance.ID,
			Type:            instance.Type,
			Adapter:         instance.Adapter,
			Label:           instance.Label,
			DisplayName:     instance.Label,
			ManagedBy:       instance.ManagedBy,
			Configured:      instance.Configured,
			Enabled:         true,
			ConfigEditable:  len(instance.ConfigFields) > 0 || len(instance.SecretFields) > 0,
			RequiresRestart: true,
			ConfigFields:    providerConfigFields(instance.ConfigFields),
			SecretFields:    providerSecretFields(instance.SecretFields),
			Capabilities:    instance.Capabilities,
		})
	}
	return out
}

func providerInstanceFieldKeys(fields []adminai.ProviderInstanceField) []string {
	out := make([]string, 0, len(fields))
	for _, field := range fields {
		out = append(out, field.Key)
	}
	return out
}

func providerInstanceFieldConfigured(fields []adminai.ProviderInstanceField) map[string]bool {
	out := make(map[string]bool, len(fields))
	for _, field := range fields {
		out[field.Key] = field.Configured
	}
	return out
}

func providerConfigFields(fields []config.ProviderConfigField) []adminai.ProviderInstanceField {
	out := make([]adminai.ProviderInstanceField, 0, len(fields))
	for _, field := range fields {
		out = append(out, adminai.ProviderInstanceField{Key: field.Key, Required: field.Required, Configured: field.Configured})
	}
	return out
}

func providerSecretFields(fields []config.ProviderSecretField) []adminai.ProviderInstanceField {
	out := make([]adminai.ProviderInstanceField, 0, len(fields))
	for _, field := range fields {
		out = append(out, adminai.ProviderInstanceField{Key: field.Key, Required: field.Required, Configured: field.Configured})
	}
	return out
}

func filterNonAIGatewayCredentialInstances(instances []adminai.ProviderInstance) []adminai.ProviderInstance {
	out := make([]adminai.ProviderInstance, 0, len(instances))
	for _, instance := range instances {
		if instance.Type == providercontract.TypeAIGateway && instance.LegacyRef != nil && instance.LegacyRef.Kind == "ai_credential" {
			continue
		}
		out = append(out, instance)
	}
	return out
}

func (h *AIHandler) providerActivationPlan(instanceID string, mode string, envPath string, envKeys []string, secretKeys []string) adminai.ProviderActivationPlan {
	opts := adminai.ProviderActivationPlanOptions{
		ProviderInstanceID:                 instanceID,
		DeploymentRolloutWebhookConfigured: h.cfg != nil && strings.TrimSpace(h.cfg.ProviderActivationRolloutWebhookURL) != "",
	}
	return adminai.ProviderActivationPlanForModeWithOptions(mode, envPath, envKeys, secretKeys, opts)
}

func (h *AIHandler) triggerDeploymentRolloutWebhook(ctx context.Context, instance adminai.ProviderInstance, plan adminai.ProviderActivationPlan) (adminai.ProviderActivationApplyResult, error) {
	if h.cfg == nil {
		return adminai.ProviderActivationApplyResult{}, fmt.Errorf("provider activation is not configured")
	}
	webhookURL := strings.TrimSpace(h.cfg.ProviderActivationRolloutWebhookURL)
	parsed, err := url.Parse(webhookURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return adminai.ProviderActivationApplyResult{}, fmt.Errorf("deployment rollout webhook URL is invalid")
	}
	payload := map[string]any{
		"provider_instance_id": instance.ID,
		"provider_type":        instance.Type,
		"provider_adapter":     instance.Adapter,
		"activation_mode":      plan.Mode,
		"activation_action":    plan.Action,
		"activation_host":      plan.Host,
		"deployment_profile":   h.cfg.EffectiveProviderAssembly().DeploymentProfile,
		"env_path":             h.cfg.ProviderEnvPath,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return adminai.ProviderActivationApplyResult{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return adminai.ProviderActivationApplyResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token := strings.TrimSpace(h.cfg.ProviderActivationRolloutWebhookToken); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	started := time.Now()
	res, err := providerActivationHTTPClient.Do(req)
	latency := time.Since(started).Milliseconds()
	if err != nil {
		return adminai.ProviderActivationApplyResult{}, fmt.Errorf("deployment rollout webhook failed: %w", err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1024))
	message := strings.TrimSpace(string(raw))
	if message == "" {
		message = res.Status
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return adminai.ProviderActivationApplyResult{}, fmt.Errorf("deployment rollout webhook returned %s: %s", res.Status, message)
	}
	return adminai.ProviderActivationApplyResult{
		ProviderInstanceID: instance.ID,
		ActivationMode:     plan.Mode,
		ActivationPlan:     plan,
		Success:            true,
		Message:            message,
		LatencyMs:          latency,
	}, nil
}

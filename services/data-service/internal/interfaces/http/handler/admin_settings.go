package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	"gorm.io/gorm"
)

type AdminSettingsHandler struct {
	db      *gorm.DB
	service *adminsettings.Service
}

type usagePolicyDiagnosis struct {
	Status             string                            `json:"status"`
	Mode               string                            `json:"mode"`
	EnforcementReady   bool                              `json:"enforcement_ready"`
	Observable         bool                              `json:"observable"`
	ConfiguredLimits   usagePolicyLimitSummary           `json:"configured_limits"`
	Runtime            usagePolicyRuntimeDiagnosis       `json:"runtime"`
	Policy             adminsettings.UsagePolicySettings `json:"policy"`
	Checks             []usagePolicyDiagnosticCheck      `json:"checks"`
	Blockers           []string                          `json:"blockers"`
	Warnings           []string                          `json:"warnings"`
	RecommendedActions []string                          `json:"recommended_actions"`
}

type usagePolicyLimitSummary struct {
	DefaultUsageCreditLimit   bool `json:"default_usage_credit_limit"`
	DefaultMonthlyCreditLimit bool `json:"default_monthly_credit_limit"`
	DefaultDailyCreditLimit   bool `json:"default_daily_credit_limit"`
	GatewayRequestsPerMinute  bool `json:"gateway_requests_per_minute"`
	GatewayConcurrent         bool `json:"gateway_concurrent"`
	GatewayEstimatedCost      bool `json:"gateway_estimated_cost"`
}

type usagePolicyRuntimeDiagnosis struct {
	UsageAccountingAvailable          bool `json:"usage_accounting_available"`
	PolicyDocumentAvailable           bool `json:"policy_document_available"`
	GatewayRuntimeEnforcementVerified bool `json:"gateway_runtime_enforcement_verified"`
}

type usagePolicyDiagnosticCheck struct {
	Code    string         `json:"code"`
	Status  string         `json:"status"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

var generationToolHTTPClient = http.DefaultClient
var resourceAccessProfileHTTPClient = http.DefaultClient

func NewAdminSettingsHandler(db *gorm.DB, encryptionKeyHex string) *AdminSettingsHandler {
	return &AdminSettingsHandler{db: db, service: adminsettings.NewService(db, encryptionKeyHex)}
}

func (h *AdminSettingsHandler) GetGenerationToolsSettings(c *gin.Context) {
	settings, err := h.service.PublicGenerationToolsSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询生成工具设置失败"))
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminSettingsHandler) UpdateGenerationToolsSettings(c *gin.Context) {
	var req adminsettings.GenerationToolsSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.UpdateGenerationToolsSettings(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, adminsettings.ErrInvalidGenerationToolsSettings) {
			c.JSON(http.StatusBadRequest, api.InvalidInput("生成工具设置无效：启用服务器必须填写 http/https Base URL，超时需在 1000-600000ms 之间"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("保存生成工具设置失败"))
		return
	}
	serverMeta := make([]map[string]any, 0, len(updated.Servers))
	for _, server := range updated.Servers {
		serverMeta = append(serverMeta, map[string]any{
			"id":           server.ID,
			"type":         server.Type,
			"name":         server.Name,
			"enabled":      server.Enabled,
			"base_url":     server.BaseURL,
			"timeout_ms":   server.TimeoutMS,
			"priority":     server.Priority,
			"auth_kind":    server.AuthKind,
			"username_set": server.Username != "",
			"password_set": server.PasswordSet,
			"token_set":    server.TokenSet,
			"tags":         server.Tags,
		})
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.generation_tools.admin_updated",
		TargetType: "admin_setting",
		TargetID:   adminsettings.GenerationToolsSettingsKey,
		Metadata: map[string]any{
			"allow_local":        updated.AllowLocal,
			"default_server_id":  updated.DefaultServerID,
			"default_server_ids": updated.DefaultServerIDs,
			"server_count":       len(updated.Servers),
			"servers":            serverMeta,
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *AdminSettingsHandler) GetProviderAssetSettings(c *gin.Context) {
	settings, err := h.service.PublicProviderAssetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询素材库认证设置失败"))
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminSettingsHandler) UpdateProviderAssetSettings(c *gin.Context) {
	var req adminsettings.ProviderAssetSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.UpdateProviderAssetSettings(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, adminsettings.ErrInvalidProviderAssetSettings) {
			c.JSON(http.StatusBadRequest, api.InvalidInput("素材库认证设置无效：公网地址和火山 OpenAPI 地址必须是 http/https URL，且需填写 AK/SK"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("保存素材库认证设置失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.provider_assets.admin_updated",
		TargetType: "admin_setting",
		TargetID:   adminsettings.ProviderAssetSettingsKey,
		Metadata: map[string]any{
			"ark_openapi_base_url":  updated.ArkOpenAPIBaseURL,
			"ark_region":            updated.ArkRegion,
			"ark_access_key_id_set": updated.ArkAccessKeyID != "",
			"ark_secret_key_set":    updated.ArkSecretKeySet,
			"ark_asset_group_count": len(updated.ArkAssetGroups),
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *AdminSettingsHandler) GetResourceAccessSettings(c *gin.Context) {
	settings, err := h.service.PublicResourceAccessSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询资源公网访问设置失败"))
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminSettingsHandler) UpdateResourceAccessSettings(c *gin.Context) {
	var req adminsettings.ResourceAccessSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.UpdateResourceAccessSettings(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, adminsettings.ErrInvalidResourceAccessSettings) {
			c.JSON(http.StatusBadRequest, api.InvalidInput("资源公网访问设置无效：启用 public tunnel/public backend/object relay 时必须填写 http/https 公网地址，启用签名时必须填写签名密钥"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("保存资源公网访问设置失败"))
		return
	}
	profiles := make([]map[string]any, 0, len(updated.Profiles))
	for _, profile := range updated.Profiles {
		profiles = append(profiles, map[string]any{
			"id":                 profile.ID,
			"mode":               profile.Mode,
			"enabled":            profile.Enabled,
			"public_base_url":    profile.PublicBaseURL,
			"signing_enabled":    profile.SigningEnabled,
			"signing_secret_set": profile.SigningSecretSet,
			"expires_seconds":    profile.ExpiresSeconds,
		})
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.resource_access.admin_updated",
		TargetType: "admin_setting",
		TargetID:   adminsettings.ResourceAccessSettingsKey,
		Metadata: map[string]any{
			"default_profile_id": updated.DefaultProfileID,
			"profile_count":      len(updated.Profiles),
			"profiles":           profiles,
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *AdminSettingsHandler) ListResourceAccessProfiles(c *gin.Context) {
	settings, err := h.service.PublicResourceAccessSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询资源公网访问 Profile 失败"))
		return
	}
	c.JSON(http.StatusOK, settings)
}

type resourceAccessProfileUpsertRequest struct {
	adminsettings.ResourceAccessProfile
	DefaultProfileID string `json:"default_profile_id,omitempty"`
}

func (h *AdminSettingsHandler) UpsertResourceAccessProfile(c *gin.Context) {
	var req resourceAccessProfileUpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	profileID := c.Param("profileID")
	updated, err := h.service.UpsertResourceAccessProfile(c.Request.Context(), profileID, req.ResourceAccessProfile, req.DefaultProfileID)
	if err != nil {
		if errors.Is(err, adminsettings.ErrInvalidResourceAccessSettings) {
			c.JSON(http.StatusBadRequest, api.InvalidInput("资源公网访问 Profile 无效：启用 public tunnel/public backend/object relay 时必须填写 http/https 公网地址，启用签名时必须填写签名密钥"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("保存资源公网访问 Profile 失败"))
		return
	}
	normalizedProfileID := adminsettings.NormalizeResourceAccessProfileID(firstNonEmpty(profileID, req.ID))
	profile, _ := findResourceAccessProfile(updated, normalizedProfileID)
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.resource_access_profile.admin_upserted",
		TargetType: "admin_setting",
		TargetID:   normalizedProfileID,
		Metadata: map[string]any{
			"default_profile_id": updated.DefaultProfileID,
			"profile":            resourceAccessProfileAuditMetadata(profile),
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *AdminSettingsHandler) DeleteResourceAccessProfile(c *gin.Context) {
	profileID := c.Param("profileID")
	updated, err := h.service.DeleteResourceAccessProfile(c.Request.Context(), profileID)
	if err != nil {
		if errors.Is(err, adminsettings.ErrResourceAccessProfileNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("资源公网访问 Profile 不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("删除资源公网访问 Profile 失败"))
		return
	}
	normalizedProfileID := adminsettings.NormalizeResourceAccessProfileID(profileID)
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.resource_access_profile.admin_deleted",
		TargetType: "admin_setting",
		TargetID:   normalizedProfileID,
		Metadata: map[string]any{
			"default_profile_id": updated.DefaultProfileID,
			"profile_id":         normalizedProfileID,
		},
	})
	c.JSON(http.StatusOK, updated)
}

type resourceAccessProfileTestResult struct {
	Status        string `json:"status"`
	ProfileID     string `json:"profile_id"`
	Mode          string `json:"mode"`
	Enabled       bool   `json:"enabled"`
	HealthURL     string `json:"health_url,omitempty"`
	Reachable     bool   `json:"reachable"`
	StatusCode    int    `json:"status_code,omitempty"`
	ContentType   string `json:"content_type,omitempty"`
	ContentLength int64  `json:"content_length,omitempty"`
	Error         string `json:"error,omitempty"`
}

func (h *AdminSettingsHandler) TestResourceAccessProfile(c *gin.Context) {
	settings, err := h.service.ResourceAccessSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("读取资源公网访问 Profile 失败"))
		return
	}
	profileID := c.Param("profileID")
	profile, ok := findResourceAccessProfile(settings, profileID)
	if !ok {
		c.JSON(http.StatusNotFound, api.NotFound("资源公网访问 Profile 不存在"))
		return
	}
	result := checkResourceAccessProfileHealth(c.Request.Context(), profile)
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.resource_access_profile.admin_tested",
		TargetType: "admin_setting",
		TargetID:   result.ProfileID,
		Metadata: map[string]any{
			"profile_id":  result.ProfileID,
			"mode":        result.Mode,
			"enabled":     result.Enabled,
			"health_url":  result.HealthURL,
			"reachable":   result.Reachable,
			"status_code": result.StatusCode,
			"status":      result.Status,
		},
	})
	c.JSON(http.StatusOK, result)
}

type resourceAccessRouteDiagnoseRequest struct {
	RouteID           any    `json:"route_id,omitempty"`
	ProfileID         string `json:"profile_id,omitempty"`
	Transport         string `json:"transport,omitempty"`
	RequiredMediaType string `json:"required_media_type,omitempty"`
	Purpose           string `json:"purpose,omitempty"`
}

func (h *AdminSettingsHandler) DiagnoseResourceAccessRoute(c *gin.Context) {
	var req resourceAccessRouteDiagnoseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	settings, err := h.service.ResourceAccessSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("读取资源公网访问配置失败"))
		return
	}
	transport := strings.TrimSpace(req.Transport)
	if transport == "" {
		transport = "public_url"
	}
	blockers := []string{}
	warnings := []string{}
	if transport != "public_url" {
		blockers = append(blockers, "unsupported_resource_transport")
	}
	profile, ok := findResourceAccessProfile(settings, req.ProfileID)
	profileMeta := map[string]any{}
	if !ok {
		blockers = append(blockers, "missing_resource_access_profile")
	} else {
		profileMeta = resourceAccessProfileAuditMetadata(profile)
		if !profile.Enabled {
			blockers = append(blockers, "resource_access_profile_disabled")
		}
		if !isPublicResourceAccessMode(profile.Mode) {
			blockers = append(blockers, "unsupported_resource_access_mode")
		}
		if strings.TrimSpace(profile.PublicBaseURL) == "" {
			blockers = append(blockers, "missing_public_base_url")
		}
		if profile.SigningEnabled && strings.TrimSpace(profile.SigningSecret) == "" && !profile.SigningSecretSet {
			blockers = append(blockers, "missing_signing_secret")
		}
		if strings.TrimSpace(profile.InternalBaseURL) == "" && profile.Mode == "object_relay" {
			warnings = append(warnings, "object_relay_internal_base_url_not_configured")
		}
	}
	ready := len(blockers) == 0
	status := "error"
	if ready {
		status = "ok"
	}
	response := gin.H{
		"status":              status,
		"ready":               ready,
		"route_id":            req.RouteID,
		"transport":           transport,
		"purpose":             strings.TrimSpace(req.Purpose),
		"required_media_type": strings.TrimSpace(req.RequiredMediaType),
		"default_profile_id":  settings.DefaultProfileID,
		"profile":             profileMeta,
		"blockers":            blockers,
		"warnings":            warnings,
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.resource_access_route.admin_diagnosed",
		TargetType: "admin_setting",
		TargetID:   adminsettings.ResourceAccessSettingsKey,
		Metadata: map[string]any{
			"route_id":   req.RouteID,
			"transport":  transport,
			"profile_id": profileMeta["id"],
			"ready":      ready,
			"blockers":   blockers,
			"warnings":   warnings,
		},
	})
	c.JSON(http.StatusOK, response)
}

func (h *AdminSettingsHandler) GetUsagePolicySettings(c *gin.Context) {
	settings, err := h.service.UsagePolicySettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询用量策略设置失败"))
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminSettingsHandler) DiagnoseUsagePolicy(c *gin.Context) {
	settings, err := h.service.UsagePolicySettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("诊断用量策略设置失败"))
		return
	}
	c.JSON(http.StatusOK, diagnoseUsagePolicy(settings))
}

func (h *AdminSettingsHandler) UpdateUsagePolicySettings(c *gin.Context) {
	var req adminsettings.UsagePolicySettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.UpdateUsagePolicySettings(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, adminsettings.ErrInvalidUsagePolicySettings) {
			c.JSON(http.StatusBadRequest, api.InvalidInput("用量策略设置无效：mode 必须是 off/observe/enforce，额度、请求限制和告警阈值必须为非负数，告警阈值需在 0-100 之间"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("保存用量策略设置失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.usage_policy.admin_updated",
		TargetType: "admin_setting",
		TargetID:   adminsettings.UsagePolicySettingsKey,
		Metadata: map[string]any{
			"mode":                         updated.Mode,
			"default_usage_credit_limit":   updated.DefaultUsageCreditLimit,
			"default_monthly_credit_limit": updated.DefaultMonthlyCreditLimit,
			"default_daily_credit_limit":   updated.DefaultDailyCreditLimit,
			"alert_thresholds":             updated.AlertThresholds,
			"gateway": map[string]any{
				"max_requests_per_minute":     updated.Gateway.MaxRequestsPerMinute,
				"max_concurrent_requests":     updated.Gateway.MaxConcurrentRequests,
				"max_estimated_cost_per_call": updated.Gateway.MaxEstimatedCostPerCall,
			},
		},
	})
	c.JSON(http.StatusOK, updated)
}

func diagnoseUsagePolicy(settings adminsettings.UsagePolicySettings) usagePolicyDiagnosis {
	limits := usagePolicyLimitSummary{
		DefaultUsageCreditLimit:   settings.DefaultUsageCreditLimit > 0,
		DefaultMonthlyCreditLimit: settings.DefaultMonthlyCreditLimit > 0,
		DefaultDailyCreditLimit:   settings.DefaultDailyCreditLimit > 0,
		GatewayRequestsPerMinute:  settings.Gateway.MaxRequestsPerMinute > 0,
		GatewayConcurrent:         settings.Gateway.MaxConcurrentRequests > 0,
		GatewayEstimatedCost:      settings.Gateway.MaxEstimatedCostPerCall > 0,
	}
	runtime := usagePolicyRuntimeDiagnosis{
		UsageAccountingAvailable:          true,
		PolicyDocumentAvailable:           true,
		GatewayRuntimeEnforcementVerified: false,
	}
	diagnosis := usagePolicyDiagnosis{
		Status:           "disabled",
		Mode:             settings.Mode,
		Observable:       settings.Mode == "observe" || settings.Mode == "enforce",
		ConfiguredLimits: limits,
		Runtime:          runtime,
		Policy:           settings,
		Blockers:         []string{},
		Warnings:         []string{},
		Checks: []usagePolicyDiagnosticCheck{{
			Code:    "usage_policy_document",
			Status:  "ready",
			Message: "Usage policy settings document is available.",
		}, {
			Code:    "usage_accounting",
			Status:  "ready",
			Message: "Usage accounting and usage log surfaces are available.",
		}},
		RecommendedActions: []string{},
	}

	switch settings.Mode {
	case "off":
		diagnosis.Checks = append(diagnosis.Checks, usagePolicyDiagnosticCheck{
			Code:    "usage_policy_mode",
			Status:  "disabled",
			Message: "Usage policy mode is off; no policy enforcement is expected.",
		})
		diagnosis.RecommendedActions = append(diagnosis.RecommendedActions, "Switch mode to observe before enforcement rollout.")
	case "observe":
		diagnosis.Status = "observe"
		diagnosis.Warnings = append(diagnosis.Warnings, "usage_policy_observe_mode")
		diagnosis.Checks = append(diagnosis.Checks, usagePolicyDiagnosticCheck{
			Code:    "usage_policy_mode",
			Status:  "warning",
			Message: "Usage policy is in observe mode; diagnostics and reporting are allowed but calls are not blocked by this policy document.",
		})
		diagnosis.RecommendedActions = append(diagnosis.RecommendedActions, "Review usage logs and configured limits before switching mode to enforce.")
	case "enforce":
		diagnosis.Checks = append(diagnosis.Checks, usagePolicyDiagnosticCheck{
			Code:    "usage_policy_mode",
			Status:  "ready",
			Message: "Usage policy mode is enforce.",
		})
		if !hasConfiguredUsagePolicyLimit(limits) {
			diagnosis.Status = "blocked"
			diagnosis.Blockers = append(diagnosis.Blockers, "missing_usage_policy_limits")
			diagnosis.Checks = append(diagnosis.Checks, usagePolicyDiagnosticCheck{
				Code:    "usage_policy_limits",
				Status:  "blocked",
				Message: "Enforce mode needs at least one default credit or gateway limit.",
			})
			diagnosis.RecommendedActions = append(diagnosis.RecommendedActions, "Configure at least one default usage, monthly, daily, request, concurrency, or estimated-cost limit.")
			break
		}
		diagnosis.Checks = append(diagnosis.Checks, usagePolicyDiagnosticCheck{
			Code:    "usage_policy_limits",
			Status:  "ready",
			Message: "At least one usage policy limit is configured.",
		})
		if !runtime.GatewayRuntimeEnforcementVerified {
			diagnosis.Status = "degraded"
			diagnosis.Warnings = append(diagnosis.Warnings, "gateway_runtime_enforcement_not_verified")
			diagnosis.Checks = append(diagnosis.Checks, usagePolicyDiagnosticCheck{
				Code:    "gateway_runtime_enforcement",
				Status:  "warning",
				Message: "Gateway runtime enforcement for this admin usage policy document is not verified in the current deployment.",
			})
			diagnosis.RecommendedActions = append(diagnosis.RecommendedActions, "Verify or wire gateway/entitlement runtime enforcement before treating the policy as blocking.")
			break
		}
		diagnosis.Status = "ready"
		diagnosis.EnforcementReady = true
		diagnosis.Checks = append(diagnosis.Checks, usagePolicyDiagnosticCheck{
			Code:    "gateway_runtime_enforcement",
			Status:  "ready",
			Message: "Gateway runtime enforcement is verified for this deployment.",
		})
	default:
		diagnosis.Status = "blocked"
		diagnosis.Blockers = append(diagnosis.Blockers, "invalid_usage_policy_mode")
		diagnosis.Checks = append(diagnosis.Checks, usagePolicyDiagnosticCheck{
			Code:    "usage_policy_mode",
			Status:  "blocked",
			Message: "Usage policy mode must be off, observe, or enforce.",
		})
	}

	return diagnosis
}

func hasConfiguredUsagePolicyLimit(limits usagePolicyLimitSummary) bool {
	return limits.DefaultUsageCreditLimit ||
		limits.DefaultMonthlyCreditLimit ||
		limits.DefaultDailyCreditLimit ||
		limits.GatewayRequestsPerMinute ||
		limits.GatewayConcurrent ||
		limits.GatewayEstimatedCost
}

func (h *AdminSettingsHandler) GetOrgGenerationToolsSettings(c *gin.Context) {
	member := currentOrgMember(c)
	if member == nil {
		c.JSON(http.StatusForbidden, api.Forbidden("无工作区信息"))
		return
	}
	settings, err := h.service.PublicOrgGenerationToolsSettings(c.Request.Context(), member.OrgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询组织生成工具设置失败"))
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminSettingsHandler) UpdateOrgGenerationToolsSettings(c *gin.Context) {
	member := currentOrgMember(c)
	if member == nil {
		c.JSON(http.StatusForbidden, api.Forbidden("无工作区信息"))
		return
	}
	var req adminsettings.GenerationToolsSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.UpdateOrgGenerationToolsSettings(c.Request.Context(), member.OrgID, req)
	if err != nil {
		if errors.Is(err, adminsettings.ErrInvalidGenerationToolsSettings) {
			c.JSON(http.StatusBadRequest, api.InvalidInput("组织生成工具设置无效：启用服务器必须填写 http/https Base URL，超时需在 1000-600000ms 之间"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("保存组织生成工具设置失败"))
		return
	}
	var actorID *uint
	if user := currentUser(c); user != nil {
		actorID = &user.ID
	}
	orgID := member.OrgID
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.generation_tools.org_updated",
		TargetType: "org_setting",
		TargetID:   adminsettings.OrgGenerationToolsSettingsKey(orgID),
		ActorID:    actorID,
		OrgID:      &orgID,
		Metadata: map[string]any{
			"allow_local":        updated.AllowLocal,
			"default_server_id":  updated.DefaultServerID,
			"default_server_ids": updated.DefaultServerIDs,
			"server_count":       len(updated.Servers),
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *AdminSettingsHandler) GetRuntimeGenerationToolsSettings(c *gin.Context) {
	settings, err := h.publicRuntimeGenerationToolsSettings(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询生成工具设置失败"))
		return
	}
	c.JSON(http.StatusOK, settings)
}

type generationToolCallRequest struct {
	ToolType    string         `json:"tool_type"`
	ServerID    string         `json:"server_id"`
	ServerScope string         `json:"server_scope,omitempty"`
	Operation   string         `json:"operation"`
	Path        string         `json:"path,omitempty"`
	Workflow    map[string]any `json:"workflow,omitempty"`
	Payload     map[string]any `json:"payload,omitempty"`
	ClientID    string         `json:"client_id,omitempty"`
	PromptID    string         `json:"prompt_id,omitempty"`
	Filename    string         `json:"filename,omitempty"`
	Subfolder   string         `json:"subfolder,omitempty"`
	FileType    string         `json:"file_type,omitempty"`
}

func (h *AdminSettingsHandler) ProxyGenerationToolCall(c *gin.Context) {
	var req generationToolCallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	settings, err := h.privateRuntimeGenerationToolsSettings(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询生成工具设置失败"))
		return
	}
	server, ok := findRuntimeGenerationToolServer(settings, req.ToolType, req.ServerID, req.ServerScope)
	if !ok {
		c.JSON(http.StatusNotFound, api.NotFound("生成工具服务器不存在或未启用"))
		return
	}
	path, body, err := generationToolProxyRequest(server, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if server.Type == "comfyui" && strings.TrimSpace(strings.ToLower(req.Operation)) == "view" {
		data, statusCode, err := callGenerationToolServerBytes(c, server, path)
		if err != nil {
			c.JSON(statusCode, api.Internal(err.Error()))
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
			"server": runtimeGenerationToolServerPublic(server),
			"data":   data,
		})
		return
	}
	data, statusCode, err := callGenerationToolServer(c, server, path, body)
	if err != nil {
		c.JSON(statusCode, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"server": runtimeGenerationToolServerPublic(server),
		"data":   data,
	})
}

func (h *AdminSettingsHandler) publicRuntimeGenerationToolsSettings(c *gin.Context) (adminsettings.GenerationToolsSettings, error) {
	adminSettings, err := h.service.PublicGenerationToolsSettings(c.Request.Context())
	if err != nil {
		return adminSettings, err
	}
	member := currentOrgMember(c)
	if member == nil {
		return adminSettings, nil
	}
	orgSettings, err := h.service.PublicOrgGenerationToolsSettings(c.Request.Context(), member.OrgID)
	if err != nil {
		return adminSettings, err
	}
	return mergeRuntimeGenerationToolsSettings(adminSettings, orgSettings), nil
}

func (h *AdminSettingsHandler) privateRuntimeGenerationToolsSettings(c *gin.Context) (adminsettings.GenerationToolsSettings, error) {
	adminSettings, err := h.service.GenerationToolsSettings(c.Request.Context())
	if err != nil {
		return adminSettings, err
	}
	member := currentOrgMember(c)
	if member == nil {
		return adminSettings, nil
	}
	orgSettings, err := h.service.OrgGenerationToolsSettings(c.Request.Context(), member.OrgID)
	if err != nil {
		return adminSettings, err
	}
	return mergeRuntimeGenerationToolsSettings(adminSettings, orgSettings), nil
}

func mergeRuntimeGenerationToolsSettings(adminSettings adminsettings.GenerationToolsSettings, orgSettings adminsettings.GenerationToolsSettings) adminsettings.GenerationToolsSettings {
	merged := adminsettings.GenerationToolsSettings{
		AllowLocal:       adminSettings.AllowLocal && orgSettings.AllowLocal,
		DefaultServerID:  adminSettings.DefaultServerID,
		DefaultServerIDs: mergeRuntimeGenerationToolDefaultServerIDs(adminSettings.DefaultServerIDs, orgSettings.DefaultServerIDs),
		Servers:          make([]adminsettings.GenerationToolServer, 0, len(orgSettings.Servers)+len(adminSettings.Servers)),
	}
	if orgSettings.DefaultServerID != "" {
		merged.DefaultServerID = orgSettings.DefaultServerID
	}
	merged.Servers = append(merged.Servers, orgSettings.Servers...)
	merged.Servers = append(merged.Servers, adminSettings.Servers...)
	return merged
}

func mergeRuntimeGenerationToolDefaultServerIDs(adminDefaults, orgDefaults map[string]string) map[string]string {
	merged := map[string]string{}
	for key, value := range adminDefaults {
		if value != "" {
			merged[key] = value
		}
	}
	for key, value := range orgDefaults {
		if value != "" {
			merged[key] = value
		}
	}
	if len(merged) == 0 {
		return nil
	}
	return merged
}

func findRuntimeGenerationToolServer(settings adminsettings.GenerationToolsSettings, toolType, serverID, serverScope string) (adminsettings.GenerationToolServer, bool) {
	toolType = strings.TrimSpace(strings.ToLower(toolType))
	serverID = strings.TrimSpace(serverID)
	serverScope = strings.TrimSpace(strings.ToLower(serverScope))
	defaultServerID := strings.TrimSpace(settings.DefaultServerIDs[toolType])
	if defaultServerID == "" {
		defaultServerID = strings.TrimSpace(settings.DefaultServerID)
	}
	var fallback *adminsettings.GenerationToolServer
	for i := range settings.Servers {
		server := settings.Servers[i]
		if !server.Enabled || server.Type != toolType {
			continue
		}
		if serverScope != "" && server.Scope != serverScope {
			continue
		}
		if serverID != "" && server.ID == serverID {
			return server, true
		}
		if serverID == "" && defaultServerID != "" && server.ID == defaultServerID {
			return server, true
		}
		if serverID == "" && betterRuntimeGenerationToolFallback(server, fallback) {
			current := server
			fallback = &current
		}
	}
	if serverID == "" && fallback != nil {
		return *fallback, true
	}
	return adminsettings.GenerationToolServer{}, false
}

func betterRuntimeGenerationToolFallback(server adminsettings.GenerationToolServer, current *adminsettings.GenerationToolServer) bool {
	if current == nil {
		return true
	}
	return generationToolRuntimeScopeRank(server.Scope) < generationToolRuntimeScopeRank(current.Scope) ||
		(generationToolRuntimeScopeRank(server.Scope) == generationToolRuntimeScopeRank(current.Scope) && server.Priority < current.Priority)
}

func generationToolRuntimeScopeRank(scope string) int {
	switch scope {
	case "org":
		return 0
	case "admin":
		return 1
	default:
		return 2
	}
}

func generationToolProxyRequest(server adminsettings.GenerationToolServer, req generationToolCallRequest) (string, map[string]any, error) {
	operation := strings.TrimSpace(strings.ToLower(req.Operation))
	switch server.Type {
	case "comfyui":
		switch operation {
		case "status":
			return "/system_stats", nil, nil
		case "object_info":
			return "/object_info", nil, nil
		case "queue":
			return "/queue", nil, nil
		case "history":
			if strings.TrimSpace(req.PromptID) == "" {
				return "/history", nil, nil
			}
			return "/history/" + urlPathEscape(req.PromptID), nil, nil
		case "view":
			if strings.TrimSpace(req.Filename) == "" {
				return "", nil, errors.New("view requires filename")
			}
			values := url.Values{}
			values.Set("filename", strings.TrimSpace(req.Filename))
			if strings.TrimSpace(req.Subfolder) != "" {
				values.Set("subfolder", strings.TrimSpace(req.Subfolder))
			}
			fileType := strings.TrimSpace(req.FileType)
			if fileType == "" {
				fileType = "output"
			}
			values.Set("type", fileType)
			return "/view?" + values.Encode(), nil, nil
		case "queue_prompt":
			if req.Workflow == nil {
				return "", nil, errors.New("queue_prompt requires workflow")
			}
			body := map[string]any{"prompt": req.Workflow}
			if strings.TrimSpace(req.ClientID) != "" {
				body["client_id"] = strings.TrimSpace(req.ClientID)
			}
			return "/prompt", body, nil
		default:
			return "", nil, errors.New("unsupported ComfyUI operation")
		}
	case "webui":
		switch operation {
		case "status", "progress":
			return "/sdapi/v1/progress?skip_current_image=true", nil, nil
		case "models":
			return "/sdapi/v1/sd-models", nil, nil
		case "txt2img":
			if req.Payload == nil {
				return "", nil, errors.New("txt2img requires payload")
			}
			return "/sdapi/v1/txt2img", req.Payload, nil
		case "img2img":
			if req.Payload == nil {
				return "", nil, errors.New("img2img requires payload")
			}
			return "/sdapi/v1/img2img", req.Payload, nil
		case "get":
			if !strings.HasPrefix(req.Path, "/sdapi/v1/") || strings.Contains(req.Path, "://") {
				return "", nil, errors.New("get requires a safe /sdapi/v1/... path")
			}
			return req.Path, nil, nil
		default:
			return "", nil, errors.New("unsupported WebUI operation")
		}
	default:
		return "", nil, errors.New("unsupported generation tool type")
	}
}

func callGenerationToolServerBytes(c *gin.Context, server adminsettings.GenerationToolServer, path string) (any, int, error) {
	upstreamReq, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, strings.TrimRight(server.BaseURL, "/")+path, nil)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	if server.AuthKind == "bearer" && server.Token != "" {
		upstreamReq.Header.Set("Authorization", "Bearer "+server.Token)
	} else if server.AuthKind == "basic" && server.Username != "" && server.Password != "" {
		upstreamReq.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(server.Username+":"+server.Password)))
	}
	client := *generationToolHTTPClient
	client.Timeout = time.Duration(server.TimeoutMS) * time.Millisecond
	res, err := client.Do(upstreamReq)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 24<<20))
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, http.StatusBadGateway, errors.New("生成工具服务器调用失败")
	}
	mimeType := strings.TrimSpace(strings.Split(res.Header.Get("Content-Type"), ";")[0])
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	return gin.H{
		"mime_type": mimeType,
		"base64":    base64.StdEncoding.EncodeToString(raw),
	}, http.StatusOK, nil
}

func callGenerationToolServer(c *gin.Context, server adminsettings.GenerationToolServer, path string, body map[string]any) (any, int, error) {
	var reader io.Reader
	method := http.MethodGet
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		reader = bytes.NewReader(raw)
		method = http.MethodPost
	}
	upstreamReq, err := http.NewRequestWithContext(c.Request.Context(), method, strings.TrimRight(server.BaseURL, "/")+path, reader)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	if body != nil {
		upstreamReq.Header.Set("Content-Type", "application/json")
	}
	if server.AuthKind == "bearer" && server.Token != "" {
		upstreamReq.Header.Set("Authorization", "Bearer "+server.Token)
	} else if server.AuthKind == "basic" && server.Username != "" && server.Password != "" {
		upstreamReq.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(server.Username+":"+server.Password)))
	}
	client := *generationToolHTTPClient
	client.Timeout = time.Duration(server.TimeoutMS) * time.Millisecond
	res, err := client.Do(upstreamReq)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 24<<20))
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	var data any
	if len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, &data); err != nil {
			data = string(raw)
		}
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return data, http.StatusBadGateway, errors.New("生成工具服务器调用失败")
	}
	return data, http.StatusOK, nil
}

func runtimeGenerationToolServerPublic(server adminsettings.GenerationToolServer) gin.H {
	return gin.H{
		"id":           server.ID,
		"scope":        server.Scope,
		"type":         server.Type,
		"name":         server.Name,
		"enabled":      server.Enabled,
		"base_url":     server.BaseURL,
		"timeout_ms":   server.TimeoutMS,
		"priority":     server.Priority,
		"auth_kind":    server.AuthKind,
		"password_set": server.Password != "",
		"token_set":    server.Token != "",
		"tags":         server.Tags,
	}
}

func findResourceAccessProfile(settings adminsettings.ResourceAccessSettings, profileID string) (adminsettings.ResourceAccessProfile, bool) {
	profileID = adminsettings.NormalizeResourceAccessProfileID(profileID)
	if profileID == "" {
		profileID = settings.DefaultProfileID
	}
	if profileID != "" {
		for _, profile := range settings.Profiles {
			if profile.ID == profileID {
				return profile, true
			}
		}
		return adminsettings.ResourceAccessProfile{}, false
	}
	if len(settings.Profiles) > 0 {
		return settings.Profiles[0], true
	}
	return adminsettings.ResourceAccessProfile{}, false
}

func checkResourceAccessProfileHealth(ctx context.Context, profile adminsettings.ResourceAccessProfile) resourceAccessProfileTestResult {
	result := resourceAccessProfileTestResult{
		Status:    "error",
		ProfileID: profile.ID,
		Mode:      profile.Mode,
		Enabled:   profile.Enabled,
	}
	if !profile.Enabled {
		result.Error = "resource access profile is disabled"
		return result
	}
	if !isPublicResourceAccessMode(profile.Mode) {
		result.Error = "resource access profile mode does not expose a public health URL"
		return result
	}
	if strings.TrimSpace(profile.PublicBaseURL) == "" {
		result.Error = "resource access profile public_base_url is required"
		return result
	}
	result.HealthURL = strings.TrimRight(profile.PublicBaseURL, "/") + profile.HealthCheckPath
	checkCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(checkCtx, http.MethodHead, result.HealthURL, nil)
	if err != nil {
		result.Error = err.Error()
		return result
	}
	resp, err := resourceAccessProfileHTTPClient.Do(req)
	if err == nil && resp != nil && (resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusNotImplemented || resp.StatusCode == http.StatusNotFound) {
		_ = resp.Body.Close()
		req, err = http.NewRequestWithContext(checkCtx, http.MethodGet, result.HealthURL, nil)
		if err == nil {
			resp, err = resourceAccessProfileHTTPClient.Do(req)
		}
	}
	if err != nil {
		result.Error = err.Error()
		return result
	}
	if resp == nil {
		result.Error = "resource access profile health check returned no response"
		return result
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
	result.StatusCode = resp.StatusCode
	result.ContentType = resp.Header.Get("Content-Type")
	result.ContentLength = resp.ContentLength
	result.Reachable = resp.StatusCode >= 200 && resp.StatusCode < 400
	if result.Reachable {
		result.Status = "ok"
	} else {
		result.Error = resp.Status
	}
	return result
}

func isPublicResourceAccessMode(mode string) bool {
	return mode == "public_tunnel" || mode == "public_backend" || mode == "object_relay"
}

func resourceAccessProfileAuditMetadata(profile adminsettings.ResourceAccessProfile) map[string]any {
	if profile.ID == "" {
		return map[string]any{}
	}
	return map[string]any{
		"id":                 profile.ID,
		"name":               profile.Name,
		"enabled":            profile.Enabled,
		"mode":               profile.Mode,
		"public_base_url":    profile.PublicBaseURL,
		"internal_base_url":  profile.InternalBaseURL,
		"signing_enabled":    profile.SigningEnabled,
		"signing_secret_set": profile.SigningSecretSet || strings.TrimSpace(profile.SigningSecret) != "",
		"expires_seconds":    profile.ExpiresSeconds,
		"health_check_path":  profile.HealthCheckPath,
	}
}

func urlPathEscape(value string) string {
	return url.PathEscape(strings.TrimSpace(value))
}

package handler

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"github.com/movscript/movscript/internal/testutil"
)

func TestProviderAssetSettingsUpdateMasksSecretsAndAudits(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-provider-asset-settings.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuditLog{})
	handler := NewAdminSettingsHandler(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	router := gin.New()
	router.GET("/admin/settings/provider-assets", handler.GetProviderAssetSettings)
	router.PUT("/admin/settings/provider-assets", handler.UpdateProviderAssetSettings)

	req := httptest.NewRequest(http.MethodPut, "/admin/settings/provider-assets", strings.NewReader(`{
		"public_base_url": "https://public.example.com",
		"signing_secret": "signing-secret",
		"ark_openapi_base_url": "https://ark.cn-beijing.volcengineapi.com",
		"ark_region": "cn-beijing",
		"ark_access_key_id": "ak-test",
		"ark_secret_access_key": "ark-secret"
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected provider asset settings update, got %d: %s", res.Code, res.Body.String())
	}
	if strings.Contains(res.Body.String(), "signing-secret") || strings.Contains(res.Body.String(), "ark-secret") {
		t.Fatalf("settings response leaked provider asset secret: %s", res.Body.String())
	}
	if strings.Contains(res.Body.String(), "public_base_url") ||
		strings.Contains(res.Body.String(), "signing_secret_set") ||
		!strings.Contains(res.Body.String(), `"ark_secret_key_set":true`) ||
		!strings.Contains(res.Body.String(), `"ark_openapi_base_url":"https://ark.cn-beijing.volcengineapi.com"`) {
		t.Fatalf("unexpected provider asset settings response: %s", res.Body.String())
	}
	if countAuditAction(t, db, "settings.provider_assets.admin_updated") != 1 {
		t.Fatalf("expected provider asset settings audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "settings.provider_assets.admin_updated", "ark-secret")

	getRes := httptest.NewRecorder()
	router.ServeHTTP(getRes, httptest.NewRequest(http.MethodGet, "/admin/settings/provider-assets", nil))
	if getRes.Code != http.StatusOK {
		t.Fatalf("expected provider asset settings get, got %d: %s", getRes.Code, getRes.Body.String())
	}
	if strings.Contains(getRes.Body.String(), "signing-secret") ||
		strings.Contains(getRes.Body.String(), "ark-secret") ||
		strings.Contains(getRes.Body.String(), "public_base_url") ||
		strings.Contains(getRes.Body.String(), "signing_secret_set") ||
		!strings.Contains(getRes.Body.String(), `"ark_secret_key_set":true`) {
		t.Fatalf("unexpected provider asset settings get response: %s", getRes.Body.String())
	}
}

func TestUsagePolicySettingsUpdateAuditsAndRejectsInvalidPolicy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-usage-policy-settings.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuditLog{})
	handler := NewAdminSettingsHandler(db, "")
	router := gin.New()
	router.GET("/admin/settings/usage-policy", handler.GetUsagePolicySettings)
	router.GET("/admin/settings/usage-policy/diagnose", handler.DiagnoseUsagePolicy)
	router.PUT("/admin/settings/usage-policy", handler.UpdateUsagePolicySettings)

	getDefaults := httptest.NewRecorder()
	router.ServeHTTP(getDefaults, httptest.NewRequest(http.MethodGet, "/admin/settings/usage-policy", nil))
	if getDefaults.Code != http.StatusOK {
		t.Fatalf("expected usage policy defaults, got %d: %s", getDefaults.Code, getDefaults.Body.String())
	}
	if !strings.Contains(getDefaults.Body.String(), `"mode":"off"`) {
		t.Fatalf("unexpected usage policy defaults: %s", getDefaults.Body.String())
	}

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/settings/usage-policy", strings.NewReader(`{
		"mode":"observe",
		"default_usage_credit_limit":1000,
		"default_monthly_credit_limit":250,
		"default_daily_credit_limit":25,
		"alert_thresholds":[50,80,100],
		"gateway":{
			"max_requests_per_minute":60,
			"max_concurrent_requests":4,
			"max_estimated_cost_per_call":3.5
		},
		"notes":"rollout"
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()
	router.ServeHTTP(updateRes, updateReq)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected usage policy update, got %d: %s", updateRes.Code, updateRes.Body.String())
	}
	if !strings.Contains(updateRes.Body.String(), `"mode":"observe"`) ||
		!strings.Contains(updateRes.Body.String(), `"max_requests_per_minute":60`) {
		t.Fatalf("unexpected usage policy update response: %s", updateRes.Body.String())
	}
	if countAuditAction(t, db, "settings.usage_policy.admin_updated") != 1 {
		t.Fatalf("expected usage policy update audit log")
	}

	diagnoseRes := httptest.NewRecorder()
	router.ServeHTTP(diagnoseRes, httptest.NewRequest(http.MethodGet, "/admin/settings/usage-policy/diagnose", nil))
	if diagnoseRes.Code != http.StatusOK {
		t.Fatalf("expected usage policy diagnose, got %d: %s", diagnoseRes.Code, diagnoseRes.Body.String())
	}
	if !strings.Contains(diagnoseRes.Body.String(), `"status":"observe"`) ||
		!strings.Contains(diagnoseRes.Body.String(), `"enforcement_ready":false`) ||
		!strings.Contains(diagnoseRes.Body.String(), `"usage_policy_observe_mode"`) {
		t.Fatalf("unexpected usage policy observe diagnosis: %s", diagnoseRes.Body.String())
	}

	invalidReq := httptest.NewRequest(http.MethodPut, "/admin/settings/usage-policy", strings.NewReader(`{
		"mode":"enforce",
		"alert_thresholds":[150]
	}`))
	invalidReq.Header.Set("Content-Type", "application/json")
	invalidRes := httptest.NewRecorder()
	router.ServeHTTP(invalidRes, invalidReq)
	if invalidRes.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid usage policy to return 400, got %d: %s", invalidRes.Code, invalidRes.Body.String())
	}
	if countAuditAction(t, db, "settings.usage_policy.admin_updated") != 1 {
		t.Fatalf("expected invalid usage policy not to write audit")
	}
}

func TestUsagePolicySettingsDiagnoseReportsRuntimeEnforcementGaps(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-usage-policy-diagnose.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuditLog{})
	handler := NewAdminSettingsHandler(db, "")
	router := gin.New()
	router.GET("/admin/settings/usage-policy/diagnose", handler.DiagnoseUsagePolicy)
	router.PUT("/admin/settings/usage-policy", handler.UpdateUsagePolicySettings)

	defaultRes := httptest.NewRecorder()
	router.ServeHTTP(defaultRes, httptest.NewRequest(http.MethodGet, "/admin/settings/usage-policy/diagnose", nil))
	if defaultRes.Code != http.StatusOK {
		t.Fatalf("expected default usage policy diagnose, got %d: %s", defaultRes.Code, defaultRes.Body.String())
	}
	if !strings.Contains(defaultRes.Body.String(), `"status":"disabled"`) ||
		!strings.Contains(defaultRes.Body.String(), `"mode":"off"`) ||
		!strings.Contains(defaultRes.Body.String(), `"enforcement_ready":false`) {
		t.Fatalf("unexpected default usage policy diagnosis: %s", defaultRes.Body.String())
	}

	noLimitReq := httptest.NewRequest(http.MethodPut, "/admin/settings/usage-policy", strings.NewReader(`{"mode":"enforce"}`))
	noLimitReq.Header.Set("Content-Type", "application/json")
	noLimitUpdate := httptest.NewRecorder()
	router.ServeHTTP(noLimitUpdate, noLimitReq)
	if noLimitUpdate.Code != http.StatusOK {
		t.Fatalf("expected enforce no-limit usage policy update, got %d: %s", noLimitUpdate.Code, noLimitUpdate.Body.String())
	}
	noLimitRes := httptest.NewRecorder()
	router.ServeHTTP(noLimitRes, httptest.NewRequest(http.MethodGet, "/admin/settings/usage-policy/diagnose", nil))
	if noLimitRes.Code != http.StatusOK {
		t.Fatalf("expected no-limit usage policy diagnose, got %d: %s", noLimitRes.Code, noLimitRes.Body.String())
	}
	if !strings.Contains(noLimitRes.Body.String(), `"status":"blocked"`) ||
		!strings.Contains(noLimitRes.Body.String(), `"missing_usage_policy_limits"`) {
		t.Fatalf("unexpected enforce no-limit usage policy diagnosis: %s", noLimitRes.Body.String())
	}

	limitReq := httptest.NewRequest(http.MethodPut, "/admin/settings/usage-policy", strings.NewReader(`{
		"mode":"enforce",
		"gateway":{"max_requests_per_minute":60}
	}`))
	limitReq.Header.Set("Content-Type", "application/json")
	limitUpdate := httptest.NewRecorder()
	router.ServeHTTP(limitUpdate, limitReq)
	if limitUpdate.Code != http.StatusOK {
		t.Fatalf("expected enforce limited usage policy update, got %d: %s", limitUpdate.Code, limitUpdate.Body.String())
	}
	limitRes := httptest.NewRecorder()
	router.ServeHTTP(limitRes, httptest.NewRequest(http.MethodGet, "/admin/settings/usage-policy/diagnose", nil))
	if limitRes.Code != http.StatusOK {
		t.Fatalf("expected limited usage policy diagnose, got %d: %s", limitRes.Code, limitRes.Body.String())
	}
	if !strings.Contains(limitRes.Body.String(), `"status":"degraded"`) ||
		!strings.Contains(limitRes.Body.String(), `"gateway_runtime_enforcement_not_verified"`) ||
		!strings.Contains(limitRes.Body.String(), `"gateway_runtime_enforcement_verified":false`) {
		t.Fatalf("unexpected enforce limited usage policy diagnosis: %s", limitRes.Body.String())
	}
}

func TestResourceAccessProfileAdminEndpointsMaskSecretsDiagnoseAndAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	healthServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/healthz" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	t.Cleanup(healthServer.Close)

	db := testutil.OpenSQLite(t, "handler-resource-access-profile-admin.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuditLog{})
	handler := NewAdminSettingsHandler(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	router := gin.New()
	router.GET("/admin/settings/resource-access/profiles", handler.ListResourceAccessProfiles)
	router.PUT("/admin/settings/resource-access/profiles/:profileID", handler.UpsertResourceAccessProfile)
	router.DELETE("/admin/settings/resource-access/profiles/:profileID", handler.DeleteResourceAccessProfile)
	router.POST("/admin/settings/resource-access/profiles/:profileID/test", handler.TestResourceAccessProfile)
	router.POST("/admin/settings/resource-access/routes/diagnose", handler.DiagnoseResourceAccessRoute)

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/settings/resource-access/profiles/public-tunnel", strings.NewReader(`{
		"name":"Local Tunnel",
		"enabled":true,
		"mode":"public_tunnel",
		"public_base_url":"`+healthServer.URL+`",
		"signing_enabled":true,
		"signing_secret":"profile-secret",
		"expires_seconds":120,
		"health_check_path":"/healthz",
		"default_profile_id":"public-tunnel"
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()
	router.ServeHTTP(updateRes, updateReq)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected resource access profile upsert, got %d: %s", updateRes.Code, updateRes.Body.String())
	}
	if strings.Contains(updateRes.Body.String(), "profile-secret") ||
		!strings.Contains(updateRes.Body.String(), `"signing_secret_set":true`) ||
		!strings.Contains(updateRes.Body.String(), `"default_profile_id":"public-tunnel"`) {
		t.Fatalf("unexpected resource access profile upsert response: %s", updateRes.Body.String())
	}
	if countAuditAction(t, db, "settings.resource_access_profile.admin_upserted") != 1 {
		t.Fatalf("expected resource access profile upsert audit")
	}
	assertAuditMetadataDoesNotContain(t, db, "settings.resource_access_profile.admin_upserted", "profile-secret")

	listRes := httptest.NewRecorder()
	router.ServeHTTP(listRes, httptest.NewRequest(http.MethodGet, "/admin/settings/resource-access/profiles", nil))
	if listRes.Code != http.StatusOK {
		t.Fatalf("expected resource access profile list, got %d: %s", listRes.Code, listRes.Body.String())
	}
	if strings.Contains(listRes.Body.String(), "profile-secret") ||
		!strings.Contains(listRes.Body.String(), `"public_base_url":"`+healthServer.URL+`"`) {
		t.Fatalf("unexpected resource access profile list response: %s", listRes.Body.String())
	}

	testRes := httptest.NewRecorder()
	router.ServeHTTP(testRes, httptest.NewRequest(http.MethodPost, "/admin/settings/resource-access/profiles/public-tunnel/test", strings.NewReader(`{}`)))
	if testRes.Code != http.StatusOK {
		t.Fatalf("expected resource access profile test, got %d: %s", testRes.Code, testRes.Body.String())
	}
	if strings.Contains(testRes.Body.String(), "profile-secret") ||
		!strings.Contains(testRes.Body.String(), `"status":"ok"`) ||
		!strings.Contains(testRes.Body.String(), `"reachable":true`) ||
		!strings.Contains(testRes.Body.String(), `"health_url":"`+healthServer.URL+`/healthz"`) {
		t.Fatalf("unexpected resource access profile test response: %s", testRes.Body.String())
	}
	if countAuditAction(t, db, "settings.resource_access_profile.admin_tested") != 1 {
		t.Fatalf("expected resource access profile test audit")
	}

	diagnoseReq := httptest.NewRequest(http.MethodPost, "/admin/settings/resource-access/routes/diagnose", strings.NewReader(`{
		"route_id": 99,
		"profile_id":"public-tunnel",
		"transport":"public_url",
		"required_media_type":"image",
		"purpose":"generation"
	}`))
	diagnoseReq.Header.Set("Content-Type", "application/json")
	diagnoseRes := httptest.NewRecorder()
	router.ServeHTTP(diagnoseRes, diagnoseReq)
	if diagnoseRes.Code != http.StatusOK {
		t.Fatalf("expected resource access route diagnose, got %d: %s", diagnoseRes.Code, diagnoseRes.Body.String())
	}
	if strings.Contains(diagnoseRes.Body.String(), "profile-secret") ||
		!strings.Contains(diagnoseRes.Body.String(), `"ready":true`) ||
		!strings.Contains(diagnoseRes.Body.String(), `"blockers":[]`) ||
		!strings.Contains(diagnoseRes.Body.String(), `"id":"public-tunnel"`) {
		t.Fatalf("unexpected resource access route diagnose response: %s", diagnoseRes.Body.String())
	}
	if countAuditAction(t, db, "settings.resource_access_route.admin_diagnosed") != 1 {
		t.Fatalf("expected resource access route diagnose audit")
	}

	deleteRes := httptest.NewRecorder()
	router.ServeHTTP(deleteRes, httptest.NewRequest(http.MethodDelete, "/admin/settings/resource-access/profiles/public-tunnel", nil))
	if deleteRes.Code != http.StatusOK {
		t.Fatalf("expected resource access profile delete, got %d: %s", deleteRes.Code, deleteRes.Body.String())
	}
	if strings.Contains(deleteRes.Body.String(), "profile-secret") ||
		strings.Contains(deleteRes.Body.String(), `"id":"public-tunnel"`) {
		t.Fatalf("unexpected resource access profile delete response: %s", deleteRes.Body.String())
	}
	if countAuditAction(t, db, "settings.resource_access_profile.admin_deleted") != 1 {
		t.Fatalf("expected resource access profile delete audit")
	}
}

func TestGenerationToolsRuntimeProxyUsesStoredSecretWithoutLeakingIt(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var upstreamAuth string
	var upstreamBody map[string]any
	previousClient := generationToolHTTPClient
	generationToolHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		upstreamAuth = r.Header.Get("Authorization")
		if r.URL.Path == "/view" {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"image/png"}},
				Body:       io.NopCloser(strings.NewReader("image-bytes")),
			}, nil
		}
		if r.URL.Path != "/prompt" {
			t.Fatalf("unexpected upstream path: %s", r.URL.String())
		}
		if err := json.NewDecoder(r.Body).Decode(&upstreamBody); err != nil {
			t.Fatalf("decode upstream body: %v", err)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"prompt_id":"abc123"}`)),
		}, nil
	})}
	t.Cleanup(func() { generationToolHTTPClient = previousClient })

	db := testutil.OpenSQLite(t, "handler-generation-tools-runtime-proxy.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuditLog{})
	handler := NewAdminSettingsHandler(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	router := gin.New()
	router.PUT("/admin/settings/generation-tools", handler.UpdateGenerationToolsSettings)
	router.GET("/generation-tools/settings", handler.GetRuntimeGenerationToolsSettings)
	router.POST("/generation-tools/call", handler.ProxyGenerationToolCall)

	updateBody := `{
		"allow_local": false,
		"default_server_id": "shared-comfy",
		"servers": [{
			"id": "shared-comfy",
			"type": "comfyui",
			"name": "Shared Comfy",
			"enabled": true,
			"base_url": "https://gpu.example.com",
			"timeout_ms": 120000,
			"priority": 10,
			"auth_kind": "bearer",
			"token": "shared-secret"
		}]
	}`
	updateReq := httptest.NewRequest(http.MethodPut, "/admin/settings/generation-tools", strings.NewReader(updateBody))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()
	router.ServeHTTP(updateRes, updateReq)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected settings update, got %d: %s", updateRes.Code, updateRes.Body.String())
	}

	getRes := httptest.NewRecorder()
	router.ServeHTTP(getRes, httptest.NewRequest(http.MethodGet, "/generation-tools/settings", nil))
	if getRes.Code != http.StatusOK {
		t.Fatalf("expected runtime settings, got %d: %s", getRes.Code, getRes.Body.String())
	}
	if strings.Contains(getRes.Body.String(), "shared-secret") || !strings.Contains(getRes.Body.String(), `"token_set":true`) {
		t.Fatalf("runtime settings leaked or missed secret marker: %s", getRes.Body.String())
	}

	callReq := httptest.NewRequest(http.MethodPost, "/generation-tools/call", strings.NewReader(`{
		"tool_type": "comfyui",
		"server_id": "shared-comfy",
		"operation": "queue_prompt",
		"workflow": {"1": {"class_type": "CheckpointLoaderSimple"}}
	}`))
	callReq.Header.Set("Content-Type", "application/json")
	callRes := httptest.NewRecorder()
	router.ServeHTTP(callRes, callReq)
	if callRes.Code != http.StatusOK {
		t.Fatalf("expected proxy call, got %d: %s", callRes.Code, callRes.Body.String())
	}
	if strings.Contains(callRes.Body.String(), "shared-secret") {
		t.Fatalf("proxy response leaked secret: %s", callRes.Body.String())
	}
	if upstreamAuth != "Bearer shared-secret" {
		t.Fatalf("upstream auth = %q", upstreamAuth)
	}
	if _, ok := upstreamBody["prompt"].(map[string]any); !ok {
		t.Fatalf("upstream prompt body missing: %#v", upstreamBody)
	}

	viewReq := httptest.NewRequest(http.MethodPost, "/generation-tools/call", strings.NewReader(`{
		"tool_type": "comfyui",
		"server_id": "shared-comfy",
		"operation": "view",
		"filename": "frame.png",
		"file_type": "output"
	}`))
	viewReq.Header.Set("Content-Type", "application/json")
	viewRes := httptest.NewRecorder()
	router.ServeHTTP(viewRes, viewReq)
	if viewRes.Code != http.StatusOK {
		t.Fatalf("expected proxy view call, got %d: %s", viewRes.Code, viewRes.Body.String())
	}
	if strings.Contains(viewRes.Body.String(), "shared-secret") || !strings.Contains(viewRes.Body.String(), `"mime_type":"image/png"`) {
		t.Fatalf("unexpected proxy view response: %s", viewRes.Body.String())
	}
}

func TestGenerationToolsRuntimeProxyUsesBasicAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var upstreamAuth string
	previousClient := generationToolHTTPClient
	generationToolHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		upstreamAuth = r.Header.Get("Authorization")
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`[{"title":"model"}]`)),
		}, nil
	})}
	t.Cleanup(func() { generationToolHTTPClient = previousClient })

	db := testutil.OpenSQLite(t, "handler-generation-tools-runtime-basic.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuditLog{})
	handler := NewAdminSettingsHandler(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	router := gin.New()
	router.PUT("/admin/settings/generation-tools", handler.UpdateGenerationToolsSettings)
	router.POST("/generation-tools/call", handler.ProxyGenerationToolCall)

	updateReq := httptest.NewRequest(http.MethodPut, "/admin/settings/generation-tools", strings.NewReader(`{
		"allow_local": true,
		"servers": [{
			"id": "shared-webui",
			"type": "webui",
			"name": "Shared WebUI",
			"enabled": true,
			"base_url": "https://webui.example.com",
			"timeout_ms": 120000,
			"priority": 10,
			"auth_kind": "basic",
			"username": "operator",
			"password": "webui-secret"
		}]
	}`))
	updateReq.Header.Set("Content-Type", "application/json")
	updateRes := httptest.NewRecorder()
	router.ServeHTTP(updateRes, updateReq)
	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected settings update, got %d: %s", updateRes.Code, updateRes.Body.String())
	}

	callReq := httptest.NewRequest(http.MethodPost, "/generation-tools/call", strings.NewReader(`{
		"tool_type": "webui",
		"server_id": "shared-webui",
		"operation": "models"
	}`))
	callReq.Header.Set("Content-Type", "application/json")
	callRes := httptest.NewRecorder()
	router.ServeHTTP(callRes, callReq)
	if callRes.Code != http.StatusOK {
		t.Fatalf("expected proxy call, got %d: %s", callRes.Code, callRes.Body.String())
	}
	wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("operator:webui-secret"))
	if upstreamAuth != wantAuth {
		t.Fatalf("upstream auth = %q, want %q", upstreamAuth, wantAuth)
	}
}

func TestGenerationToolsRuntimeSettingsMergesOrgBeforeAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-generation-tools-runtime-org.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuditLog{})
	handler := NewAdminSettingsHandler(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, domainidentity.UserProfile{ID: 7, Username: "owner", Status: domainidentity.UserStatusActive})
		c.Set(middleware.ContextOrgMemberKey, domainorg.OrganizationMember{ID: 9, OrgID: 42, UserID: 7, Role: domainorg.RoleOwner})
		c.Next()
	})
	router.PUT("/admin/settings/generation-tools", handler.UpdateGenerationToolsSettings)
	router.GET("/orgs/:orgId/generation-tools/settings", handler.GetOrgGenerationToolsSettings)
	router.PUT("/orgs/:orgId/generation-tools/settings", handler.UpdateOrgGenerationToolsSettings)
	router.GET("/generation-tools/settings", handler.GetRuntimeGenerationToolsSettings)

	adminReq := httptest.NewRequest(http.MethodPut, "/admin/settings/generation-tools", strings.NewReader(`{
		"allow_local": true,
		"default_server_id": "admin-comfy",
		"servers": [{
			"id": "admin-comfy",
			"type": "comfyui",
			"name": "Admin Comfy",
			"enabled": true,
			"base_url": "https://admin-gpu.example.com",
			"timeout_ms": 120000,
			"priority": 20,
			"auth_kind": "bearer",
			"token": "admin-secret"
		}]
	}`))
	adminReq.Header.Set("Content-Type", "application/json")
	adminRes := httptest.NewRecorder()
	router.ServeHTTP(adminRes, adminReq)
	if adminRes.Code != http.StatusOK {
		t.Fatalf("expected admin settings update, got %d: %s", adminRes.Code, adminRes.Body.String())
	}

	orgReq := httptest.NewRequest(http.MethodPut, "/orgs/42/generation-tools/settings", strings.NewReader(`{
		"allow_local": false,
		"default_server_id": "org-webui",
		"servers": [{
			"id": "org-webui",
			"type": "webui",
			"name": "Org WebUI",
			"enabled": true,
			"base_url": "https://org-webui.example.com",
			"timeout_ms": 120000,
			"priority": 10,
			"auth_kind": "basic",
			"username": "operator",
			"password": "org-secret"
		}]
	}`))
	orgReq.Header.Set("Content-Type", "application/json")
	orgRes := httptest.NewRecorder()
	router.ServeHTTP(orgRes, orgReq)
	if orgRes.Code != http.StatusOK {
		t.Fatalf("expected org settings update, got %d: %s", orgRes.Code, orgRes.Body.String())
	}
	if strings.Contains(orgRes.Body.String(), "org-secret") || !strings.Contains(orgRes.Body.String(), `"scope":"org"`) {
		t.Fatalf("org settings response leaked secret or missed scope: %s", orgRes.Body.String())
	}

	runtimeRes := httptest.NewRecorder()
	router.ServeHTTP(runtimeRes, httptest.NewRequest(http.MethodGet, "/generation-tools/settings", nil))
	if runtimeRes.Code != http.StatusOK {
		t.Fatalf("expected runtime settings, got %d: %s", runtimeRes.Code, runtimeRes.Body.String())
	}
	body := runtimeRes.Body.String()
	if strings.Contains(body, "admin-secret") || strings.Contains(body, "org-secret") {
		t.Fatalf("runtime settings leaked secret: %s", body)
	}
	if !strings.Contains(body, `"allow_local":false`) ||
		!strings.Contains(body, `"default_server_id":"org-webui"`) ||
		!strings.Contains(body, `"default_server_ids":{"comfyui":"admin-comfy","webui":"org-webui"}`) ||
		!strings.Contains(body, `"scope":"org"`) ||
		!strings.Contains(body, `"scope":"admin"`) {
		t.Fatalf("runtime settings did not merge org and admin layers: %s", body)
	}
	if countAuditAction(t, db, "settings.generation_tools.org_updated") != 1 {
		t.Fatalf("expected org generation tools audit log")
	}
}

func TestGenerationToolsRuntimeProxyUsesDefaultAndOrgBeforeAdminFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousClient := generationToolHTTPClient
	var upstreamHost string
	generationToolHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		upstreamHost = r.URL.Host
		if r.URL.Path != "/sdapi/v1/sd-models" {
			t.Fatalf("unexpected upstream path: %s", r.URL.String())
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`[{"title":"model-a"}]`)),
		}, nil
	})}
	t.Cleanup(func() { generationToolHTTPClient = previousClient })

	db := testutil.OpenSQLite(t, "handler-generation-tools-runtime-proxy-default.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuditLog{})
	handler := NewAdminSettingsHandler(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, domainidentity.UserProfile{ID: 7, Username: "owner", Status: domainidentity.UserStatusActive})
		c.Set(middleware.ContextOrgMemberKey, domainorg.OrganizationMember{ID: 9, OrgID: 42, UserID: 7, Role: domainorg.RoleOwner})
		c.Next()
	})
	router.PUT("/admin/settings/generation-tools", handler.UpdateGenerationToolsSettings)
	router.PUT("/orgs/:orgId/generation-tools/settings", handler.UpdateOrgGenerationToolsSettings)
	router.POST("/generation-tools/call", handler.ProxyGenerationToolCall)

	adminReq := httptest.NewRequest(http.MethodPut, "/admin/settings/generation-tools", strings.NewReader(`{
		"allow_local": true,
		"servers": [{
			"id": "admin-webui",
			"type": "webui",
			"name": "Admin WebUI",
			"enabled": true,
			"base_url": "https://admin-webui.example.com",
			"timeout_ms": 120000,
			"priority": 1,
			"auth_kind": "none"
		}]
	}`))
	adminReq.Header.Set("Content-Type", "application/json")
	adminRes := httptest.NewRecorder()
	router.ServeHTTP(adminRes, adminReq)
	if adminRes.Code != http.StatusOK {
		t.Fatalf("expected admin settings update, got %d: %s", adminRes.Code, adminRes.Body.String())
	}

	orgReq := httptest.NewRequest(http.MethodPut, "/orgs/42/generation-tools/settings", strings.NewReader(`{
		"allow_local": true,
		"default_server_id": "org-webui",
		"servers": [{
			"id": "org-webui",
			"type": "webui",
			"name": "Org WebUI",
			"enabled": true,
			"base_url": "https://org-webui.example.com",
			"timeout_ms": 120000,
			"priority": 99,
			"auth_kind": "none"
		}]
	}`))
	orgReq.Header.Set("Content-Type", "application/json")
	orgRes := httptest.NewRecorder()
	router.ServeHTTP(orgRes, orgReq)
	if orgRes.Code != http.StatusOK {
		t.Fatalf("expected org settings update, got %d: %s", orgRes.Code, orgRes.Body.String())
	}

	callReq := httptest.NewRequest(http.MethodPost, "/generation-tools/call", strings.NewReader(`{
		"tool_type": "webui",
		"operation": "models"
	}`))
	callReq.Header.Set("Content-Type", "application/json")
	callRes := httptest.NewRecorder()
	router.ServeHTTP(callRes, callReq)
	if callRes.Code != http.StatusOK {
		t.Fatalf("expected proxy call, got %d: %s", callRes.Code, callRes.Body.String())
	}
	if upstreamHost != "org-webui.example.com" || !strings.Contains(callRes.Body.String(), `"id":"org-webui"`) {
		t.Fatalf("expected org default server, host=%q body=%s", upstreamHost, callRes.Body.String())
	}

	orgReq = httptest.NewRequest(http.MethodPut, "/orgs/42/generation-tools/settings", strings.NewReader(`{
		"allow_local": true,
		"servers": [{
			"id": "org-webui",
			"type": "webui",
			"name": "Org WebUI",
			"enabled": true,
			"base_url": "https://org-webui.example.com",
			"timeout_ms": 120000,
			"priority": 99,
			"auth_kind": "none"
		}]
	}`))
	orgReq.Header.Set("Content-Type", "application/json")
	orgRes = httptest.NewRecorder()
	router.ServeHTTP(orgRes, orgReq)
	if orgRes.Code != http.StatusOK {
		t.Fatalf("expected org settings update without default, got %d: %s", orgRes.Code, orgRes.Body.String())
	}
	upstreamHost = ""
	callRes = httptest.NewRecorder()
	callReq = httptest.NewRequest(http.MethodPost, "/generation-tools/call", strings.NewReader(`{
		"tool_type": "webui",
		"operation": "models"
	}`))
	callReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(callRes, callReq)
	if callRes.Code != http.StatusOK {
		t.Fatalf("expected proxy fallback call, got %d: %s", callRes.Code, callRes.Body.String())
	}
	if upstreamHost != "org-webui.example.com" || !strings.Contains(callRes.Body.String(), `"id":"org-webui"`) {
		t.Fatalf("expected org fallback before admin despite priority, host=%q body=%s", upstreamHost, callRes.Body.String())
	}
}

func TestGenerationToolsRuntimeProxyUsesServerScopeToDisambiguateDuplicateIDs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousClient := generationToolHTTPClient
	var upstreamHost string
	generationToolHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		upstreamHost = r.URL.Host
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`[{"title":"model-a"}]`)),
		}, nil
	})}
	t.Cleanup(func() { generationToolHTTPClient = previousClient })

	db := testutil.OpenSQLite(t, "handler-generation-tools-runtime-proxy-scope.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuditLog{})
	handler := NewAdminSettingsHandler(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, domainidentity.UserProfile{ID: 7, Username: "owner", Status: domainidentity.UserStatusActive})
		c.Set(middleware.ContextOrgMemberKey, domainorg.OrganizationMember{ID: 9, OrgID: 42, UserID: 7, Role: domainorg.RoleOwner})
		c.Next()
	})
	router.PUT("/admin/settings/generation-tools", handler.UpdateGenerationToolsSettings)
	router.PUT("/orgs/:orgId/generation-tools/settings", handler.UpdateOrgGenerationToolsSettings)
	router.POST("/generation-tools/call", handler.ProxyGenerationToolCall)

	adminReq := httptest.NewRequest(http.MethodPut, "/admin/settings/generation-tools", strings.NewReader(`{
		"allow_local": true,
		"servers": [{
			"id": "shared-webui",
			"type": "webui",
			"name": "Admin WebUI",
			"enabled": true,
			"base_url": "https://admin-webui.example.com",
			"timeout_ms": 120000,
			"priority": 1,
			"auth_kind": "none"
		}]
	}`))
	adminReq.Header.Set("Content-Type", "application/json")
	adminRes := httptest.NewRecorder()
	router.ServeHTTP(adminRes, adminReq)
	if adminRes.Code != http.StatusOK {
		t.Fatalf("expected admin settings update, got %d: %s", adminRes.Code, adminRes.Body.String())
	}
	orgReq := httptest.NewRequest(http.MethodPut, "/orgs/42/generation-tools/settings", strings.NewReader(`{
		"allow_local": true,
		"servers": [{
			"id": "shared-webui",
			"type": "webui",
			"name": "Org WebUI",
			"enabled": true,
			"base_url": "https://org-webui.example.com",
			"timeout_ms": 120000,
			"priority": 99,
			"auth_kind": "none"
		}]
	}`))
	orgReq.Header.Set("Content-Type", "application/json")
	orgRes := httptest.NewRecorder()
	router.ServeHTTP(orgRes, orgReq)
	if orgRes.Code != http.StatusOK {
		t.Fatalf("expected org settings update, got %d: %s", orgRes.Code, orgRes.Body.String())
	}

	callReq := httptest.NewRequest(http.MethodPost, "/generation-tools/call", strings.NewReader(`{
		"tool_type": "webui",
		"server_id": "shared-webui",
		"operation": "models"
	}`))
	callReq.Header.Set("Content-Type", "application/json")
	callRes := httptest.NewRecorder()
	router.ServeHTTP(callRes, callReq)
	if callRes.Code != http.StatusOK {
		t.Fatalf("expected proxy call, got %d: %s", callRes.Code, callRes.Body.String())
	}
	if upstreamHost != "org-webui.example.com" {
		t.Fatalf("expected unscoped duplicate id to use org first, got host=%q", upstreamHost)
	}

	upstreamHost = ""
	callReq = httptest.NewRequest(http.MethodPost, "/generation-tools/call", strings.NewReader(`{
		"tool_type": "webui",
		"server_id": "shared-webui",
		"server_scope": "admin",
		"operation": "models"
	}`))
	callReq.Header.Set("Content-Type", "application/json")
	callRes = httptest.NewRecorder()
	router.ServeHTTP(callRes, callReq)
	if callRes.Code != http.StatusOK {
		t.Fatalf("expected scoped proxy call, got %d: %s", callRes.Code, callRes.Body.String())
	}
	if upstreamHost != "admin-webui.example.com" || !strings.Contains(callRes.Body.String(), `"scope":"admin"`) {
		t.Fatalf("expected scoped duplicate id to use admin server, host=%q body=%s", upstreamHost, callRes.Body.String())
	}
}

func TestAdminGenerationToolsSettingsUpdateMasksSecretsAndAudits(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-admin-generation-tools-settings.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuditLog{})
	handler := NewAdminSettingsHandler(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	router := gin.New()
	router.GET("/admin/settings/generation-tools", handler.GetGenerationToolsSettings)
	router.PUT("/admin/settings/generation-tools", handler.UpdateGenerationToolsSettings)

	req := httptest.NewRequest(http.MethodPut, "/admin/settings/generation-tools", strings.NewReader(`{
		"allow_local": true,
		"default_server_id": "shared-comfy",
		"servers": [
			{
				"id": "shared-comfy",
				"type": "comfyui",
				"name": "Shared Comfy",
				"enabled": true,
				"base_url": "http://gpu.example.com:8188",
				"timeout_ms": 120000,
				"priority": 10,
				"auth_kind": "bearer",
				"token": "comfy-secret"
			},
			{
				"id": "shared-webui",
				"type": "webui",
				"name": "Shared WebUI",
				"enabled": true,
				"base_url": "https://webui.example.com",
				"timeout_ms": 180000,
				"priority": 20,
				"auth_kind": "basic",
				"username": "operator",
				"password": "webui-secret"
			}
		]
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected generation tools settings update, got %d: %s", res.Code, res.Body.String())
	}
	if strings.Contains(res.Body.String(), "comfy-secret") || strings.Contains(res.Body.String(), "webui-secret") {
		t.Fatalf("settings response leaked generation tool secret: %s", res.Body.String())
	}
	if countAuditAction(t, db, "settings.generation_tools.admin_updated") != 1 {
		t.Fatalf("expected generation tools settings audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "settings.generation_tools.admin_updated", "comfy-secret")
	assertAuditMetadataDoesNotContain(t, db, "settings.generation_tools.admin_updated", "webui-secret")

	getRes := httptest.NewRecorder()
	router.ServeHTTP(getRes, httptest.NewRequest(http.MethodGet, "/admin/settings/generation-tools", nil))
	if getRes.Code != http.StatusOK {
		t.Fatalf("expected generation tools settings get, got %d: %s", getRes.Code, getRes.Body.String())
	}
	if strings.Contains(getRes.Body.String(), "comfy-secret") ||
		strings.Contains(getRes.Body.String(), "webui-secret") ||
		!strings.Contains(getRes.Body.String(), `"token_set":true`) ||
		!strings.Contains(getRes.Body.String(), `"password_set":true`) {
		t.Fatalf("unexpected generation tools settings get response: %s", getRes.Body.String())
	}
}

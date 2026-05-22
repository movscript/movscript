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
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"github.com/movscript/movscript/internal/testutil"
)

func TestAdminAuthSettingsUpdateMasksPasswordAndAudits(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-admin-auth-settings.db", &persistencemodel.AdminSetting{}, &persistencemodel.AuditLog{})
	handler := NewAdminSettingsHandler(db, "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	router := gin.New()
	router.GET("/admin/settings/auth", handler.GetAuthSettings)
	router.PUT("/admin/settings/auth", handler.UpdateAuthSettings)

	req := httptest.NewRequest(http.MethodPut, "/admin/settings/auth", strings.NewReader(`{
		"registration_enabled": true,
		"require_email_verification": true,
		"email": {
			"enabled": true,
			"host": "smtp.example.com",
			"port": 587,
			"username": "mailer",
			"password": "smtp-secret",
			"from_email": "noreply@example.com",
			"from_name": "Movscript",
			"use_start_tls": true
		}
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected settings update, got %d: %s", res.Code, res.Body.String())
	}
	if strings.Contains(res.Body.String(), "smtp-secret") {
		t.Fatalf("settings response leaked smtp password: %s", res.Body.String())
	}
	if countAuditAction(t, db, "settings.auth.admin_updated") != 1 {
		t.Fatalf("expected settings audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "settings.auth.admin_updated", "smtp-secret")

	getRes := httptest.NewRecorder()
	router.ServeHTTP(getRes, httptest.NewRequest(http.MethodGet, "/admin/settings/auth", nil))
	if getRes.Code != http.StatusOK {
		t.Fatalf("expected settings get, got %d: %s", getRes.Code, getRes.Body.String())
	}
	if strings.Contains(getRes.Body.String(), "smtp-secret") || !strings.Contains(getRes.Body.String(), `"password_set":true`) {
		t.Fatalf("unexpected settings get response: %s", getRes.Body.String())
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
		c.Set(middleware.ContextUserKey, domainauth.UserProfile{ID: 7, Username: "owner", Status: domainauth.UserStatusActive})
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
		c.Set(middleware.ContextUserKey, domainauth.UserProfile{ID: 7, Username: "owner", Status: domainauth.UserStatusActive})
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
		c.Set(middleware.ContextUserKey, domainauth.UserProfile{ID: 7, Username: "owner", Status: domainauth.UserStatusActive})
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

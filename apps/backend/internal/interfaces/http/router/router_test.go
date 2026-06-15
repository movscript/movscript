package router

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	tokenauth "github.com/movscript/movscript/internal/infra/auth"
	"github.com/movscript/movscript/internal/infra/config"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestNewRegistersCoreRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := New(Dependencies{Config: &config.Config{}})

	routes := map[string]bool{}
	for _, route := range r.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	expected := []string{
		"GET /health",
		"GET /v1/models",
		"POST /v1/chat/completions",
		"GET /api/v1/auth/config",
		"GET /api/v1/auth/me",
		"POST /api/v1/orgs/join",
		"POST /api/v1/auth/code/start",
		"POST /api/v1/auth/code/verify",
		"POST /api/v1/auth/register",
		"POST /api/v1/auth/login",
		"POST /api/v1/auth/logout",
		"PATCH /api/v1/auth/profile",
		"GET /api/v1/models",
		"GET /api/v1/ws",
		"GET /api/v1/users",
		"GET /api/v1/backend/dependencies",
		"GET /api/v1/backend/provider-health",
		"GET /api/v1/backend/provider-instances",
		"GET /api/v1/backend/provider-descriptors",
		"GET /api/v1/resources",
		"POST /api/v1/resources/upload",
		"GET /api/v1/jobs",
		"GET /api/v1/agent/telemetry",
		"POST /api/v1/agent/telemetry",
		"GET /api/v1/canvases",
		"GET /api/v1/projects",
		"GET /api/v1/projects/:id/workspace",
		"GET /api/v1/projects/:id/decisions",
		"PUT /api/v1/projects/:id/decisions/candidates",
		"POST /api/v1/projects/:id/decisions/candidates",
		"PUT /api/v1/projects/:id/decisions/selection",
		"DELETE /api/v1/projects/:id/decisions/selection",
		"GET /api/v1/projects/:id/git/*gitPath",
		"POST /api/v1/projects/:id/git/*gitPath",
		"POST /api/v1/agent-runtime/sessions",
		"GET /api/v1/agent-runtime/sessions/:sessionId/events",
		"POST /api/v1/agent-runtime/sessions/:sessionId/messages",
		"GET /api/v1/agent-runtime/sessions/:sessionId/tools",
		"DELETE /api/v1/agent-runtime/sessions/:sessionId",
		"POST /api/v1/agent-runtime/permissions/:requestId/decision",
		"GET /api/v1/admin/projects",
		"GET /api/v1/admin/debug/jobs",
		"GET /api/hub/packages",
		"GET /api/hub/packages/:id/download",
	}

	for _, route := range expected {
		if !routes[route] {
			t.Fatalf("expected route %q to be registered", route)
		}
	}
}

func TestProjectWorkspaceReturnsTemporaryGitRemoteURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-project-workspace-temporary-git-url.db",
		&persistencemodel.User{},
		&persistencemodel.Organization{},
		&persistencemodel.OrganizationMember{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.ProjectRepository{},
	)
	tokens, err := tokenauth.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		WorkspaceStorageBackend:   "gitea",
		WorkspaceCloneURLStrategy: "temporary",
		GiteaRepoPrefix:           "project-",
	}
	r := New(Dependencies{Config: cfg, DB: db, Tokens: tokens})

	user := persistencemodel.User{Username: "workspace-user", Status: "active", SystemRole: domainauth.SystemRoleUser}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	org := persistencemodel.Organization{Name: "Workspace Org", Slug: "workspace-org", Status: "active", CreatedBy: user.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrganizationMember{OrgID: org.ID, UserID: user.ID, Role: "owner"}).Error; err != nil {
		t.Fatal(err)
	}
	project := persistencemodel.Project{Name: "Workspace Project", OwnerID: user.ID, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.ProjectMember{ProjectID: project.ID, UserID: user.ID, Role: "owner"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.ProjectRepository{
		ProjectID:     project.ID,
		Provider:      "gitea",
		Owner:         "workspace-org",
		Repo:          "project-1",
		DefaultBranch: "main",
		Status:        "active",
	}).Error; err != nil {
		t.Fatal(err)
	}
	bearer, _, err := tokens.Issue(tokenauth.Subject{UserID: user.ID, Username: user.Username, SystemRole: user.SystemRole})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/workspace", nil)
	req.Header.Set("Authorization", "Bearer "+bearer)
	req.Header.Set("X-Org-ID", strconv.FormatUint(uint64(org.ID), 10))
	res := httptest.NewRecorder()

	r.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", res.Code, res.Body.String())
	}
	var body struct {
		GitRemoteURL       string `json:"gitRemoteUrl"`
		GitRemoteStrategy  string `json:"gitRemoteStrategy"`
		GitRemoteExpiresAt int64  `json:"gitRemoteExpiresAt"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.GitRemoteStrategy != "temporary" || body.GitRemoteExpiresAt == 0 {
		t.Fatalf("workspace clone metadata = %+v, want temporary with expiry", body)
	}
	remoteURL, err := url.Parse(body.GitRemoteURL)
	if err != nil {
		t.Fatalf("parse git remote URL: %v", err)
	}
	gitToken := remoteURL.Query().Get("git_token")
	if gitToken == "" {
		t.Fatalf("git remote URL %q missing git_token", body.GitRemoteURL)
	}
	claims, err := tokens.Verify(gitToken)
	if err != nil {
		t.Fatalf("verify git token: %v", err)
	}
	if claims.Purpose != tokenauth.GitProxyTokenPurpose || claims.ProjectID != project.ID || claims.OrgID != org.ID {
		t.Fatalf("git token claims = %+v", claims)
	}
}

func TestBackendDependenciesEndpointReturnsEffectiveProviders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-backend-dependencies.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{})
	tokens, err := tokenauth.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		DependencyProfile:       "local",
		DBDriver:                "sqlite",
		StorageBackend:          "filesystem",
		WorkspaceStorageBackend: "git-http-backend",
		AIGatewayProvider:       "local",
		CacheBackend:            "memory",
	}
	r := New(Dependencies{Config: cfg, DB: db, Tokens: tokens})

	user := persistencemodel.User{Username: "deps-user", Status: "active", SystemRole: "user"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	token, _, err := tokens.Issue(tokenauth.Subject{UserID: user.ID, Username: user.Username, SystemRole: user.SystemRole})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/backend/dependencies", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()

	r.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", res.Code, res.Body.String())
	}
	var body config.ProviderAssembly
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Profile != "local" || body.Database != "sqlite" || body.ObjectStorage != "filesystem" || body.WorkspaceStorage != "http" || body.AIGateway != "local" || body.VectorIndex != "local-index" || body.Cache != "memory" || body.MediaProcessing != "desktop-managed" || body.AgentRuntime != "desktop-managed" {
		t.Fatalf("dependencies response = %+v, want local sqlite/filesystem/http/local/local-index/memory/desktop-managed/desktop-managed-agent", body)
	}
	if body.DeploymentProfile != "personal-local" || body.AssemblyMode != "startup" || len(body.Providers) != 8 {
		t.Fatalf("provider assembly response = %+v, want personal-local startup with eight providers", body)
	}
	var legacyBody config.DependencyProviders
	if err := json.Unmarshal(res.Body.Bytes(), &legacyBody); err != nil {
		t.Fatalf("decode legacy response: %v", err)
	}
	if legacyBody.Profile != "local" || legacyBody.WorkspaceStorage != "http" {
		t.Fatalf("legacy dependencies response = %+v, want local/http compatibility", legacyBody)
	}
}

func TestBackendProviderInstancesEndpointReturnsRedactedConfigStatus(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-backend-provider-instances.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{})
	tokens, err := tokenauth.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		DependencyProfile:       "external",
		DBDriver:                "postgres",
		DBHost:                  "db",
		DBPort:                  "5432",
		DBUser:                  "postgres",
		DBPassword:              "super-secret",
		DBName:                  "movscript",
		StorageBackend:          "minio",
		MinIOEndpoint:           "minio:9000",
		MinIOAccessKey:          "access-key",
		MinIOSecretKey:          "secret-key",
		MinIOBucket:             "movscript",
		WorkspaceStorageBackend: "gitea",
		GiteaBaseURL:            "http://gitea:3000",
		GiteaToken:              "token",
		AIGatewayProvider:       "new-api",
		CacheBackend:            "redis",
		RedisAddr:               "redis:6379",
		RedisPassword:           "redis-secret",
		MediaProcessingProvider: "external-worker",
		AgentRuntimeProvider:    "remote-runtime",
	}
	r := New(Dependencies{Config: cfg, DB: db, Tokens: tokens})

	user := persistencemodel.User{Username: "instances-user", Status: "active", SystemRole: "user"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	token, _, err := tokens.Issue(tokenauth.Subject{UserID: user.ID, Username: user.Username, SystemRole: user.SystemRole})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/backend/provider-instances", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()

	r.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", res.Code, res.Body.String())
	}
	if body := res.Body.String(); body == "" || strings.Contains(body, "super-secret") || strings.Contains(body, "secret-key") || strings.Contains(body, "redis-secret") {
		t.Fatalf("provider instances leaked secret values: %s", body)
	}
	var body struct {
		Items []config.ProviderInstance `json:"items"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Items) != 8 {
		t.Fatalf("provider instance count = %d, want 8: %+v", len(body.Items), body.Items)
	}
	seenSecretStatus := false
	for _, item := range body.Items {
		if item.Type == "blob_storage" && item.Adapter == "minio" {
			for _, secret := range item.SecretFields {
				if secret.Key == "minio_secret_key" && secret.Configured {
					seenSecretStatus = true
				}
			}
		}
	}
	if !seenSecretStatus {
		t.Fatalf("provider instances missing minio secret status: %+v", body.Items)
	}
}

func TestBackendProviderHealthEndpointReturnsStartupReadiness(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-backend-provider-health.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{})
	tokens, err := tokenauth.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		DependencyProfile:       "custom",
		DBDriver:                "sqlite",
		DBPath:                  "movscript.db",
		StorageBackend:          "filesystem",
		FilesystemStorageRoot:   t.TempDir(),
		WorkspaceStorageBackend: "http",
		GitHTTPRoot:             t.TempDir(),
		GitBinary:               "git",
		AIGatewayProvider:       "local",
		CacheBackend:            "memory",
		MediaProcessingProvider: "desktop-managed",
		AgentRuntimeProvider:    "desktop-managed",
	}
	r := New(Dependencies{Config: cfg, DB: db, Tokens: tokens})

	user := persistencemodel.User{Username: "health-user", Status: "active", SystemRole: "user"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	token, _, err := tokens.Issue(tokenauth.Subject{UserID: user.ID, Username: user.Username, SystemRole: user.SystemRole})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/backend/provider-health", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()

	r.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", res.Code, res.Body.String())
	}
	var body struct {
		Items []struct {
			Type         string   `json:"type"`
			Adapter      string   `json:"adapter"`
			Status       string   `json:"status"`
			Capabilities []string `json:"capabilities"`
		} `json:"items"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Items) != 8 {
		t.Fatalf("health item count = %d, want 8: %+v", len(body.Items), body.Items)
	}
	for _, item := range body.Items {
		if item.Status != "ok" || len(item.Capabilities) == 0 {
			t.Fatalf("health item = %+v, want ok with capabilities", item)
		}
	}
}

func TestBackendProviderDescriptorsEndpointReturnsBuiltIns(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-backend-provider-descriptors.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{})
	tokens, err := tokenauth.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	r := New(Dependencies{Config: &config.Config{}, DB: db, Tokens: tokens})

	user := persistencemodel.User{Username: "descriptors-user", Status: "active", SystemRole: "user"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	token, _, err := tokens.Issue(tokenauth.Subject{UserID: user.ID, Username: user.Username, SystemRole: user.SystemRole})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/backend/provider-descriptors", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()

	r.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", res.Code, res.Body.String())
	}
	var body []struct {
		Type     string `json:"type"`
		Adapter  string `json:"adapter"`
		Assembly string `json:"assembly"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	seen := map[string]bool{}
	for _, desc := range body {
		seen[desc.Type+":"+desc.Adapter] = true
		if desc.Assembly != "startup" {
			t.Fatalf("descriptor = %+v, want startup assembly", desc)
		}
	}
	if !seen["ai_gateway:new-api"] || !seen["workspace_repository:gitea"] || !seen["blob_storage:minio"] {
		t.Fatalf("provider descriptors missing expected built-ins: %+v", body)
	}
}

func TestRegisterPreflightAllowsLocalViteOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := New(Dependencies{Config: &config.Config{}})

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/auth/register", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "content-type")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d; body = %q", w.Code, http.StatusNoContent, w.Body.String())
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, "http://localhost:5173")
	}
}

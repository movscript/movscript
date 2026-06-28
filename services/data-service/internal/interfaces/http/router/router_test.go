package router

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"github.com/movscript/auth-service/pkg/authprovider"
	"github.com/movscript/movscript/internal/infra/config"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	scopedtoken "github.com/movscript/movscript/internal/infra/scopedtoken"
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
		"POST /api/v1/orgs/join",
		"GET /api/v1/models",
		"GET /api/v1/ws",
		"GET /api/v1/users",
		"GET /api/v1/backend/dependencies",
		"GET /api/v1/backend/provider-health",
		"GET /api/v1/backend/provider-instances",
		"GET /api/v1/backend/provider-descriptors",
		"GET /api/v1/resources",
		"GET /api/v1/resources/:id",
		"GET /api/v1/resources/:id/usages",
		"POST /api/v1/resources/upload",
		"GET /api/v1/provider-assets/providers/:provider_ref/groups",
		"POST /api/v1/provider-assets/providers/:provider_ref/groups/sync",
		"GET /api/v1/provider-assets/providers/:provider_ref/groups/:group_ref/assets",
		"POST /api/v1/provider-assets/providers/:provider_ref/groups/:group_ref/assets/sync",
		"POST /api/v1/provider-assets/providers/:provider_ref/certify",
		"POST /api/v1/provider-assets/seedance2/certify",
		"POST /api/v1/resource-access/resolve",
		"POST /api/v1/resource-access/check",
		"GET /api/v1/resource-access/resources/:id/file",
		"GET /api/v1/admin/settings/provider-assets",
		"PUT /api/v1/admin/settings/provider-assets",
		"GET /api/v1/admin/providers/:providerID/asset-library",
		"PUT /api/v1/admin/providers/:providerID/asset-library",
		"GET /api/v1/jobs",
		"GET /api/v1/jobs/:id",
		"GET /api/v1/agent/telemetry",
		"POST /api/v1/agent/telemetry",
		"GET /api/v1/canvases",
		"GET /api/v1/projects",
		"POST /api/v1/projects/resolve",
		"POST /api/v1/projects/ensure",
		"GET /api/v1/project-data/spaces",
		"POST /api/v1/project-data/spaces",
		"GET /api/v1/project-data/spaces/:spaceID/decisions",
		"GET /api/v1/project-data/decisions",
		"POST /api/v1/project-data/decisions/query",
		"PUT /api/v1/project-data/decisions/candidates",
		"POST /api/v1/project-data/decisions/candidates",
		"PUT /api/v1/project-data/decisions/selection",
		"DELETE /api/v1/project-data/decisions/selection",
		"GET /api/v1/projects/:id/workspace",
		"GET /api/v1/projects/:id/decisions",
		"POST /api/v1/projects/:id/decisions/query",
		"PUT /api/v1/projects/:id/decisions/candidates",
		"POST /api/v1/projects/:id/decisions/candidates",
		"POST /api/v1/projects/:id/content-units/:contentUnitId/candidates/generate",
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
		"POST /api/v1/audio/align",
		"GET /api/v1/admin/projects",
		"GET /api/hub/packages",
		"GET /api/hub/packages/:id/download",
	}
	expected = append(expected, expectedEditionCoreRoutesForTest()...)

	for _, route := range expected {
		if !routes[route] {
			t.Fatalf("expected route %q to be registered", route)
		}
	}
}

func TestProjectWorkspaceReturnsTemporaryGitRemoteURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-project-workspace-temporary-git-url.db",
		&persistencemodel.Organization{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
		&persistencemodel.ProjectRepository{},
	)
	tokens, err := scopedtoken.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		WorkspaceStorageBackend:   "gitea",
		WorkspaceCloneURLStrategy: "temporary",
		GiteaRepoPrefix:           "project-",
	}
	authProvider := newRouterTestAuthProvider()
	authIdentity := newRouterTestAuthIdentity()
	r := New(Dependencies{Config: cfg, DB: db, Tokens: tokens, AuthProvider: authProvider, AuthIdentity: authIdentity})

	user := newRouterExternalUser("workspace-user", domainidentity.SystemRoleUser)
	org := persistencemodel.Organization{Name: "Workspace Org", Slug: "workspace-org", Status: "active", CreatedBy: user.ID}
	if err := db.Create(&org).Error; err != nil {
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
	addRouterAuthUser(authProvider, "sk-workspace-user", user)
	authIdentity.addMembership(user.ID, org.ID, org.Name, org.Slug, org.Status, "owner")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/workspace", nil)
	req.Header.Set("Authorization", "Bearer sk-workspace-user")
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
	if claims.Purpose != scopedtoken.GitProxyTokenPurpose || claims.ProjectID != project.ID || claims.OrgID != org.ID {
		t.Fatalf("git token claims = %+v", claims)
	}
}

func TestProjectResolveAndEnsureUseProjectUIDWithoutLocalPath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-project-identity.db",
		&persistencemodel.Organization{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
	)
	tokens, err := scopedtoken.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	authProvider := newRouterTestAuthProvider()
	authIdentity := newRouterTestAuthIdentity()
	r := New(Dependencies{Config: &config.Config{}, DB: db, Tokens: tokens, AuthProvider: authProvider, AuthIdentity: authIdentity})
	user := newRouterExternalUser("project-identity-user", domainidentity.SystemRoleUser)
	org := persistencemodel.Organization{Name: "Project Identity Org", Slug: "project-identity-org", Status: "active", CreatedBy: user.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	addRouterAuthUser(authProvider, "sk-project-identity-user", user)
	authIdentity.addMembership(user.ID, org.ID, org.Name, org.Slug, org.Status, "owner")

	body := `{"project_uid":"prj_local_identity","name":"Readable Project","description":"desc","local_path":"/tmp/should-not-be-stored"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects/ensure", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer sk-project-identity-user")
	req.Header.Set("X-Org-ID", strconv.FormatUint(uint64(org.ID), 10))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("ensure status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var ensured struct {
		Created bool `json:"created"`
		Project struct {
			ID         uint   `json:"ID"`
			Name       string `json:"name"`
			ProjectUID string `json:"project_uid"`
			LocalPath  string `json:"local_path"`
		} `json:"project"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &ensured); err != nil {
		t.Fatalf("decode ensure response: %v", err)
	}
	if !ensured.Created || ensured.Project.ProjectUID != "prj_local_identity" || ensured.Project.Name != "Readable Project" || ensured.Project.LocalPath != "" {
		t.Fatalf("ensure response = %+v", ensured)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/v1/projects/resolve", strings.NewReader(`{"project_uid":"prj_local_identity"}`))
	req.Header.Set("Authorization", "Bearer sk-project-identity-user")
	req.Header.Set("X-Org-ID", strconv.FormatUint(uint64(org.ID), 10))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("resolve status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var resolved struct {
		Project struct {
			ID         uint   `json:"ID"`
			ProjectUID string `json:"project_uid"`
			LocalPath  string `json:"local_path"`
		} `json:"project"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resolved); err != nil {
		t.Fatalf("decode resolve response: %v", err)
	}
	if resolved.Project.ID != ensured.Project.ID || resolved.Project.ProjectUID != "prj_local_identity" || resolved.Project.LocalPath != "" {
		t.Fatalf("resolve response = %+v", resolved)
	}
}

func TestProjectEnsureUsesLocalOwnerWorkspaceWithoutOrgHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-project-local-owner.db",
		&persistencemodel.Organization{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectMember{},
	)
	authProvider := authprovider.NewLocalOwnerProvider(authprovider.LocalOwnerOptions{
		Subject: "local-owner",
		Claims: map[string]string{
			"user_id":     strconv.FormatUint(uint64(authidentity.LocalOwnerUserID), 10),
			"username":    "local-owner",
			"system_role": domainidentity.SystemRoleUser,
			"status":      domainidentity.UserStatusActive,
		},
	})
	r := New(Dependencies{
		Config:       &config.Config{AuthMode: "local-owner"},
		DB:           db,
		AuthProvider: authProvider,
		AuthIdentity: authidentity.NewLocalOwnerManager(authidentity.LocalOwnerOptions{}),
	})

	body := `{"project_uid":"prj_local_owner","name":"Local Owner Project"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects/ensure", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("ensure status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var ensured struct {
		Project struct {
			ProjectUID string `json:"project_uid"`
		} `json:"project"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &ensured); err != nil {
		t.Fatalf("decode ensure response: %v", err)
	}
	if ensured.Project.ProjectUID != "prj_local_owner" {
		t.Fatalf("ensure response = %+v", ensured)
	}
}

func TestProjectDataRoutesUseScopedProjectUID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-project-data.db",
		&persistencemodel.Organization{},
		&persistencemodel.ProjectDataSpace{},
		&persistencemodel.ProjectDataDecisionContext{},
	)
	tokens, err := scopedtoken.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	authProvider := newRouterTestAuthProvider()
	authIdentity := newRouterTestAuthIdentity()
	r := New(Dependencies{Config: &config.Config{}, DB: db, Tokens: tokens, AuthProvider: authProvider, AuthIdentity: authIdentity})

	user := newRouterExternalUser("project-data-user", domainidentity.SystemRoleUser)
	org := persistencemodel.Organization{Name: "Project Data Org", Slug: "project-data-org", Status: "active", CreatedBy: user.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	addRouterAuthUser(authProvider, "sk-project-data-user", user)
	authIdentity.addMembership(user.ID, org.ID, org.Name, org.Slug, org.Status, "owner")

	body := `{"project_uid":"prj_http","title":"HTTP Project","target_kind":"content_unit","target_ref":"content_units/cu_a","candidates":[{"id":"candidate_a","resource_id":101}]}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/project-data/decisions/candidates", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer sk-project-data-user")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("replace scoped candidates status = %d, body = %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/project-data/spaces?scope_kind=user", nil)
	req.Header.Set("Authorization", "Bearer sk-project-data-user")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list scoped spaces status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var spaces struct {
		Items []struct {
			ID             uint   `json:"id"`
			ScopeKind      string `json:"scope_kind"`
			ScopeID        string `json:"scope_id"`
			ProjectUID     string `json:"project_uid"`
			CandidateCount int64  `json:"candidate_count"`
		} `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &spaces); err != nil {
		t.Fatalf("decode project data spaces: %v", err)
	}
	if len(spaces.Items) != 1 || spaces.Items[0].ProjectUID != "prj_http" || spaces.Items[0].CandidateCount != 1 {
		t.Fatalf("unexpected project data spaces: %#v", spaces.Items)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/project-data/spaces/"+strconv.FormatUint(uint64(spaces.Items[0].ID), 10)+"/decisions?scope_kind=user", nil)
	req.Header.Set("Authorization", "Bearer sk-project-data-user")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list scoped decisions status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var decisions struct {
		Items []struct {
			TargetKind string            `json:"target_kind"`
			TargetRef  string            `json:"target_ref"`
			Candidates []json.RawMessage `json:"candidates"`
		} `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &decisions); err != nil {
		t.Fatalf("decode project data decisions: %v", err)
	}
	if len(decisions.Items) != 1 || decisions.Items[0].TargetRef != "content_units/cu_a" || len(decisions.Items[0].Candidates) != 1 {
		t.Fatalf("unexpected project data decisions: %#v", decisions.Items)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/project-data/spaces?scope_kind=user&scope_id=999999", nil)
	req.Header.Set("Authorization", "Bearer sk-project-data-user")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("foreign user scope status = %d, want 403; body = %s", rec.Code, rec.Body.String())
	}
}

func TestBackendDependenciesEndpointReturnsEffectiveProviders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-backend-dependencies.db", &persistencemodel.Organization{})
	tokens, err := scopedtoken.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
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
	authProvider := newRouterTestAuthProvider()
	r := New(Dependencies{Config: cfg, DB: db, Tokens: tokens, AuthProvider: authProvider, AuthIdentity: newRouterTestAuthIdentity()})

	user := newRouterExternalUser("deps-user", domainidentity.SystemRoleUser)
	addRouterAuthUser(authProvider, "sk-deps-user", user)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/backend/dependencies", nil)
	req.Header.Set("Authorization", "Bearer sk-deps-user")
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
}

func TestBackendProviderInstancesEndpointReturnsRedactedConfigStatus(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "router-backend-provider-instances.db", &persistencemodel.Organization{})
	tokens, err := scopedtoken.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
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
		AIGatewayProvider:       "local",
		CacheBackend:            "redis",
		RedisAddr:               "redis:6379",
		RedisPassword:           "redis-secret",
		MediaProcessingProvider: "external-worker",
		AgentRuntimeProvider:    "remote-runtime",
	}
	authProvider := newRouterTestAuthProvider()
	r := New(Dependencies{Config: cfg, DB: db, Tokens: tokens, AuthProvider: authProvider, AuthIdentity: newRouterTestAuthIdentity()})

	user := newRouterExternalUser("instances-user", domainidentity.SystemRoleUser)
	addRouterAuthUser(authProvider, "sk-instances-user", user)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/backend/provider-instances", nil)
	req.Header.Set("Authorization", "Bearer sk-instances-user")
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
	db := testutil.OpenSQLite(t, "router-backend-provider-health.db", &persistencemodel.Organization{})
	tokens, err := scopedtoken.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
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
	authProvider := newRouterTestAuthProvider()
	r := New(Dependencies{Config: cfg, DB: db, Tokens: tokens, AuthProvider: authProvider, AuthIdentity: newRouterTestAuthIdentity()})

	user := newRouterExternalUser("health-user", domainidentity.SystemRoleUser)
	addRouterAuthUser(authProvider, "sk-health-user", user)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/backend/provider-health", nil)
	req.Header.Set("Authorization", "Bearer sk-health-user")
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
	db := testutil.OpenSQLite(t, "router-backend-provider-descriptors.db", &persistencemodel.Organization{})
	tokens, err := scopedtoken.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	authProvider := newRouterTestAuthProvider()
	r := New(Dependencies{Config: &config.Config{}, DB: db, Tokens: tokens, AuthProvider: authProvider, AuthIdentity: newRouterTestAuthIdentity()})

	user := newRouterExternalUser("descriptors-user", domainidentity.SystemRoleUser)
	addRouterAuthUser(authProvider, "sk-descriptors-user", user)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/backend/provider-descriptors", nil)
	req.Header.Set("Authorization", "Bearer sk-descriptors-user")
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
	if !seen["ai_gateway:local"] || !seen["workspace_repository:gitea"] || !seen["blob_storage:minio"] {
		t.Fatalf("provider descriptors missing expected built-ins: %+v", body)
	}
}

func TestRegisterPreflightAllowsLocalViteOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := New(Dependencies{Config: &config.Config{}})

	for _, origin := range []string{
		"http://localhost:5173",
		"http://localhost:8765",
		"http://127.0.0.1:8765",
		"http://localhost:8766",
		"http://127.0.0.1:8766",
		"file://",
	} {
		t.Run(origin, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodOptions, "/api/v1/projects/resolve", nil)
			req.Header.Set("Origin", origin)
			req.Header.Set("Access-Control-Request-Method", http.MethodPost)
			req.Header.Set("Access-Control-Request-Headers", "content-type,x-movscript-route-tier")
			w := httptest.NewRecorder()

			r.ServeHTTP(w, req)

			if w.Code != http.StatusNoContent {
				t.Fatalf("status = %d, want %d; body = %q", w.Code, http.StatusNoContent, w.Body.String())
			}
			if got := w.Header().Get("Access-Control-Allow-Origin"); got != origin {
				t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, origin)
			}
			if got := w.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(strings.ToLower(got), "x-movscript-route-tier") {
				t.Fatalf("Access-Control-Allow-Headers = %q, want x-movscript-route-tier", got)
			}
		})
	}
}

type routerTestAuthProvider struct {
	contexts map[string]authprovider.AuthContext
}

var nextRouterExternalUserID uint = 100

func newRouterExternalUser(username string, systemRole string) testutil.ExternalUser {
	nextRouterExternalUserID++
	user := testutil.NewExternalUser(nextRouterExternalUserID, username)
	user.SystemRole = systemRole
	return user
}

func addRouterAuthUser(provider *routerTestAuthProvider, token string, user testutil.ExternalUser) {
	provider.addUser(token, user.ID, user.Username, user.SystemRole)
}

func newRouterTestAuthProvider() *routerTestAuthProvider {
	return &routerTestAuthProvider{contexts: map[string]authprovider.AuthContext{}}
}

func (p *routerTestAuthProvider) addUser(token string, userID uint, username string, systemRole string) {
	p.contexts[token] = authprovider.AuthContext{
		Authenticated: true,
		Mode:          authprovider.ModeOpaqueKey,
		Principal: authprovider.Principal{
			Kind:    authprovider.PrincipalCloudUser,
			Subject: "user_" + strconv.FormatUint(uint64(userID), 10),
		},
		Claims: map[string]string{
			"user_id":     strconv.FormatUint(uint64(userID), 10),
			"username":    username,
			"system_role": systemRole,
			"status":      domainidentity.UserStatusActive,
		},
	}
}

func (p *routerTestAuthProvider) Mode() authprovider.Mode {
	return authprovider.ModeOpaqueKey
}

func (p *routerTestAuthProvider) Authenticate(_ context.Context, request authprovider.Request) (authprovider.AuthContext, error) {
	context, ok := p.contexts[request.Token]
	if !ok {
		return authprovider.InactiveContext(authprovider.ModeOpaqueKey, "missing-token"), nil
	}
	return context, nil
}

func (p *routerTestAuthProvider) Authorize(_ context.Context, context authprovider.AuthContext, _ string, _ *authprovider.Resource) (authprovider.Decision, error) {
	return authprovider.AllowIfAuthenticated(context), nil
}

type routerTestAuthIdentity struct {
	users       map[uint]domainidentity.UserProfile
	memberships map[uint][]authidentity.OrgMembership
}

func newRouterTestAuthIdentity() *routerTestAuthIdentity {
	return &routerTestAuthIdentity{
		users:       map[uint]domainidentity.UserProfile{},
		memberships: map[uint][]authidentity.OrgMembership{},
	}
}

func (i *routerTestAuthIdentity) addMembership(userID uint, orgID uint, name string, slug string, status string, role string) {
	if status == "" {
		status = "active"
	}
	if role == "" {
		role = "owner"
	}
	i.memberships[userID] = append(i.memberships[userID], authidentity.OrgMembership{
		OrgID:   orgID,
		OrgName: name,
		OrgSlug: slug,
		Plan:    "team",
		Status:  status,
		Role:    role,
	})
}

func (i *routerTestAuthIdentity) UserProfile(ctx context.Context, userID uint) (domainidentity.UserProfile, error) {
	if user, ok := i.users[userID]; ok {
		return user, nil
	}
	return domainidentity.UserProfile{ID: userID, Username: "router-user", SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive}, nil
}

func (i *routerTestAuthIdentity) OrgMemberships(ctx context.Context, userID uint) ([]authidentity.OrgMembership, error) {
	if memberships, ok := i.memberships[userID]; ok {
		return memberships, nil
	}
	return []authidentity.OrgMembership{{
		OrgID:   1,
		OrgName: "Test Workspace",
		OrgSlug: "test-workspace",
		Plan:    "team",
		Status:  "active",
		Role:    "owner",
	}}, nil
}

func (i *routerTestAuthIdentity) ListUsers(ctx context.Context, filter authidentity.ListUsersFilter) (authidentity.UserPage, error) {
	return authidentity.UserPage{Items: []domainidentity.UserProfile{}, Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (i *routerTestAuthIdentity) CreateUser(ctx context.Context, input authidentity.CreateUserInput) (domainidentity.UserProfile, error) {
	return domainidentity.UserProfile{}, authidentity.ErrBadRequest
}

func (i *routerTestAuthIdentity) CreateUserWithPassword(ctx context.Context, input authidentity.CreateUserInput, password string) (domainidentity.UserProfile, error) {
	return domainidentity.UserProfile{}, authidentity.ErrBadRequest
}

func (i *routerTestAuthIdentity) UpdateUser(ctx context.Context, userID uint, input authidentity.UpdateUserInput) (domainidentity.UserProfile, error) {
	return domainidentity.UserProfile{}, authidentity.ErrBadRequest
}

func (i *routerTestAuthIdentity) SetUserPasswordHash(ctx context.Context, userID uint, passwordHash string) (domainidentity.UserProfile, error) {
	return domainidentity.UserProfile{}, authidentity.ErrBadRequest
}

func (i *routerTestAuthIdentity) ListOrgs(ctx context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error) {
	return authidentity.OrgPage{Items: []authidentity.Organization{}, Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (i *routerTestAuthIdentity) CreateOrg(ctx context.Context, input authidentity.CreateOrgInput) (authidentity.Organization, error) {
	return authidentity.Organization{}, authidentity.ErrBadRequest
}

func (i *routerTestAuthIdentity) UpdateOrg(ctx context.Context, orgID uint, input authidentity.UpdateOrgInput) (authidentity.Organization, error) {
	return authidentity.Organization{}, authidentity.ErrBadRequest
}

func (i *routerTestAuthIdentity) ListOrgMembers(ctx context.Context, orgID uint) ([]authidentity.OrganizationMember, error) {
	return []authidentity.OrganizationMember{}, nil
}

func (i *routerTestAuthIdentity) AddOrgMember(ctx context.Context, orgID uint, input authidentity.OrgMemberInput) (authidentity.OrganizationMember, error) {
	return authidentity.OrganizationMember{}, authidentity.ErrBadRequest
}

func (i *routerTestAuthIdentity) UpdateOrgMember(ctx context.Context, orgID uint, userID uint, input authidentity.OrgMemberInput) (authidentity.OrganizationMember, error) {
	return authidentity.OrganizationMember{}, authidentity.ErrBadRequest
}

func (i *routerTestAuthIdentity) RemoveOrgMember(ctx context.Context, orgID uint, userID uint) (bool, error) {
	return false, authidentity.ErrBadRequest
}

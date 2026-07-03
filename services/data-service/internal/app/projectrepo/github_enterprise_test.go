package projectrepo

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func TestGitHubSelfHostedAdapterHealthChecksCurrentUser(t *testing.T) {
	var sawBearer bool
	adapter := NewGitHubSelfHostedAdapter("https://github.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://github.example.com/api/v3/user" {
			t.Fatalf("unexpected url %s", r.URL.String())
		}
		sawBearer = r.Header.Get("Authorization") == "Bearer admin-token"
		return jsonResponse(http.StatusOK, `{"id":1,"login":"admin"}`), nil
	})}

	health := adapter.Health(context.Background())

	if health.Status != providercontract.HealthStatusOK {
		t.Fatalf("health = %+v, want ok", health)
	}
	if !strings.Contains(health.Message, "admin") {
		t.Fatalf("health message = %q, want authenticated username", health.Message)
	}
	if !sawBearer {
		t.Fatal("expected bearer auth header")
	}
}

func TestGitHubSelfHostedAdapterKeepsAPIBaseURL(t *testing.T) {
	adapter := NewGitHubSelfHostedAdapter("https://github.example.com/api/v3", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	if adapter.apiBaseURL != "https://github.example.com/api/v3" {
		t.Fatalf("api base url = %q", adapter.apiBaseURL)
	}
	if adapter.baseURL != "https://github.example.com" {
		t.Fatalf("web base url = %q", adapter.baseURL)
	}
}

func TestGitHubSelfHostedAdapterCreatesOrganizationRepo(t *testing.T) {
	var requests []string
	adapter := NewGitHubSelfHostedAdapter("https://github.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requests = append(requests, r.Method+" "+r.URL.Path)
		switch r.Method + " " + r.URL.Path {
		case "GET /api/v3/repos/movscript-org-team/movscript-project-10":
			return jsonResponse(http.StatusNotFound, `{"message":"not found"}`), nil
		case "POST /api/v3/orgs/movscript-org-team/repos":
			return jsonResponse(http.StatusCreated, `{"id":88,"name":"movscript-project-10","owner":{"login":"movscript-org-team"}}`), nil
		case "GET /api/v3/repos/movscript-org-team/movscript-project-10/branches/main":
			return jsonResponse(http.StatusOK, `{"commit":{"sha":"abc123"}}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
			return nil, nil
		}
	})}

	result, err := adapter.EnsureRepository(context.Background(), EnsureRepositoryInput{
		Owner:         "movscript-org-team",
		Repo:          "movscript-project-10",
		DefaultBranch: "main",
		Private:       true,
		OwnerType:     OwnerTypeOrganization,
	})
	if err != nil {
		t.Fatalf("EnsureRepository returned error: %v", err)
	}
	if result.ProviderRepoID != "88" || result.HeadCommit != "abc123" {
		t.Fatalf("result = %+v, want repo id and head commit", result)
	}
	assertRequestSequence(t, requests, []string{
		"GET /api/v3/repos/movscript-org-team/movscript-project-10",
		"POST /api/v3/orgs/movscript-org-team/repos",
		"GET /api/v3/repos/movscript-org-team/movscript-project-10/branches/main",
	})
}

func TestGitHubSelfHostedAdapterRejectsPersonalRepoOwnerMismatch(t *testing.T) {
	adapter := NewGitHubSelfHostedAdapter("https://github.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.Method + " " + r.URL.Path {
		case "GET /api/v3/repos/alice/movscript-project-10":
			return jsonResponse(http.StatusNotFound, `{"message":"not found"}`), nil
		case "GET /api/v3/user":
			return jsonResponse(http.StatusOK, `{"id":1,"login":"admin"}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
			return nil, nil
		}
	})}

	_, err := adapter.EnsureRepository(context.Background(), EnsureRepositoryInput{
		Owner:         "alice",
		Repo:          "movscript-project-10",
		DefaultBranch: "main",
		Private:       true,
		OwnerType:     OwnerTypeUser,
	})
	if err == nil || !strings.Contains(err.Error(), "does not match token user") {
		t.Fatalf("EnsureRepository error = %v, want owner mismatch", err)
	}
}

func TestGitHubSelfHostedAdapterEnsuresCollaboratorWithMappedPermission(t *testing.T) {
	var payload map[string]any
	adapter := NewGitHubSelfHostedAdapter("https://github.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodPut || r.URL.Path != "/api/v3/repos/movscript-org/movscript-project-10/collaborators/alice" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		return jsonResponse(http.StatusNoContent, ``), nil
	})}

	if err := adapter.EnsureRepoCollaborator(context.Background(), "movscript-org", "movscript-project-10", "alice", "write"); err != nil {
		t.Fatalf("EnsureRepoCollaborator returned error: %v", err)
	}
	if payload["permission"] != "push" {
		t.Fatalf("payload = %#v, want GitHub push permission", payload)
	}
}

func TestGitHubSelfHostedAdapterChecksRepoAccess(t *testing.T) {
	adapter := NewGitHubSelfHostedAdapter("https://github.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/v3/repos/movscript-org/movscript-project-10/collaborators/alice/permission" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		return jsonResponse(http.StatusOK, `{"permission":"push"}`), nil
	})}

	result, err := adapter.CheckRepoAccess(context.Background(), RepositoryAccessRequest{
		Owner:      "movscript-org",
		Repo:       "movscript-project-10",
		Username:   "alice",
		Permission: "write",
	})

	if err != nil {
		t.Fatalf("CheckRepoAccess returned error: %v", err)
	}
	if !result.Allowed || result.Permission != "write" {
		t.Fatalf("access = %+v, want allowed write", result)
	}
}

func TestGitHubSelfHostedAdapterCloneURLStrategies(t *testing.T) {
	adapter := NewGitHubSelfHostedAdapter("https://github.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	direct, err := adapter.GetCloneURL(context.Background(), providercontract.RepositoryCloneURLRequest{
		Ref: providercontract.RepositoryRef{Owner: "movscript-org", Repo: "movscript-project-10"},
	})
	if err != nil {
		t.Fatalf("GetCloneURL direct returned error: %v", err)
	}
	if direct.Strategy != providercontract.RepositoryCloneURLStrategyDirect || direct.URL != "https://github.example.com/movscript-org/movscript-project-10.git" {
		t.Fatalf("direct clone = %+v, want direct provider URL", direct)
	}
	proxy, err := adapter.GetCloneURL(context.Background(), providercontract.RepositoryCloneURLRequest{
		Ref:               providercontract.RepositoryRef{Owner: "movscript-org", Repo: "movscript-project-10"},
		PreferredStrategy: providercontract.RepositoryCloneURLStrategyProxy,
		PublicURL:         "/api/v1/projects/1/git/movscript-project-10.git",
	})
	if err != nil {
		t.Fatalf("GetCloneURL proxy returned error: %v", err)
	}
	if proxy.Strategy != providercontract.RepositoryCloneURLStrategyProxy || proxy.URL != "/api/v1/projects/1/git/movscript-project-10.git" {
		t.Fatalf("proxy clone = %+v, want public proxy URL", proxy)
	}
}

func TestGitHubSelfHostedAdapterProvidesGitHTTPProxyTarget(t *testing.T) {
	adapter := NewGitHubSelfHostedAdapter("https://github.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}

	target, err := adapter.GetGitHTTPProxyTarget(context.Background(), providercontract.GitHTTPProxyTargetRequest{
		Ref: providercontract.RepositoryRef{Owner: "movscript-org", Repo: "movscript-project-10", DefaultBranch: "main"},
	})

	if err != nil {
		t.Fatalf("GetGitHTTPProxyTarget returned error: %v", err)
	}
	if target.Provider != ProviderGitHubSelfHosted || target.BaseURL != "https://github.example.com" || target.AuthUsername != "x-access-token" || target.AuthSecret != "admin-token" {
		t.Fatalf("target = %+v, want GitHub Self-hosted proxy target with token auth", target)
	}
}

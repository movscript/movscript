package projectrepo

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func TestGitLabAdapterHealthChecksCurrentUser(t *testing.T) {
	var sawToken bool
	adapter := NewGitLabAdapter("https://gitlab.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://gitlab.example.com/api/v4/user" {
			t.Fatalf("unexpected url %s", r.URL.String())
		}
		sawToken = r.Header.Get("PRIVATE-TOKEN") == "admin-token"
		return jsonResponse(http.StatusOK, `{"id":1,"username":"admin"}`), nil
	})}

	health := adapter.Health(context.Background())

	if health.Status != providercontract.HealthStatusOK {
		t.Fatalf("health = %+v, want ok", health)
	}
	if !strings.Contains(health.Message, "admin") {
		t.Fatalf("health message = %q, want authenticated username", health.Message)
	}
	if !sawToken {
		t.Fatal("expected PRIVATE-TOKEN auth header")
	}
}

func TestGitLabAdapterKeepsAPIBaseURL(t *testing.T) {
	adapter := NewGitLabAdapter("https://gitlab.example.com/api/v4", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	if adapter.apiBaseURL != "https://gitlab.example.com/api/v4" {
		t.Fatalf("api base url = %q", adapter.apiBaseURL)
	}
	if adapter.baseURL != "https://gitlab.example.com" {
		t.Fatalf("web base url = %q", adapter.baseURL)
	}
}

func TestGitLabAdapterCreatesOrganizationProject(t *testing.T) {
	var requests []string
	adapter := NewGitLabAdapter("https://gitlab.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requests = append(requests, r.Method+" "+r.URL.EscapedPath())
		switch r.Method + " " + r.URL.EscapedPath() {
		case "GET /api/v4/projects/movscript-org-team%2Fmovscript-project-10":
			return jsonResponse(http.StatusNotFound, `{"message":"404 Project Not Found"}`), nil
		case "GET /api/v4/groups/movscript-org-team":
			return jsonResponse(http.StatusOK, `{"id":42}`), nil
		case "POST /api/v4/projects":
			return jsonResponse(http.StatusCreated, `{"id":88}`), nil
		case "GET /api/v4/projects/movscript-org-team%2Fmovscript-project-10/repository/branches/main":
			return jsonResponse(http.StatusOK, `{"commit":{"id":"abc123"}}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.EscapedPath())
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
		t.Fatalf("result = %+v, want project id and head commit", result)
	}
	assertRequestSequence(t, requests, []string{
		"GET /api/v4/projects/movscript-org-team%2Fmovscript-project-10",
		"GET /api/v4/groups/movscript-org-team",
		"POST /api/v4/projects",
		"GET /api/v4/projects/movscript-org-team%2Fmovscript-project-10/repository/branches/main",
	})
}

func TestGitLabAdapterRejectsPersonalProjectOwnerMismatch(t *testing.T) {
	adapter := NewGitLabAdapter("https://gitlab.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.Method + " " + r.URL.EscapedPath() {
		case "GET /api/v4/projects/alice%2Fmovscript-project-10":
			return jsonResponse(http.StatusNotFound, `{"message":"404 Project Not Found"}`), nil
		case "GET /api/v4/user":
			return jsonResponse(http.StatusOK, `{"id":1,"username":"admin"}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.EscapedPath())
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

func TestGitLabAdapterEnsuresCollaboratorByUsername(t *testing.T) {
	var requests []string
	var postPayload map[string]any
	adapter := NewGitLabAdapter("https://gitlab.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requests = append(requests, r.Method+" "+r.URL.RequestURI())
		switch r.Method + " " + r.URL.RequestURI() {
		case "GET /api/v4/users?username=alice":
			return jsonResponse(http.StatusOK, `[{"id":7,"username":"alice"}]`), nil
		case "PUT /api/v4/projects/movscript-org%2Fmovscript-project-10/members/7":
			return jsonResponse(http.StatusNotFound, `{"message":"404 Member Not Found"}`), nil
		case "POST /api/v4/projects/movscript-org%2Fmovscript-project-10/members":
			if err := json.NewDecoder(r.Body).Decode(&postPayload); err != nil {
				t.Fatalf("decode payload: %v", err)
			}
			return jsonResponse(http.StatusCreated, `{"id":7}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.RequestURI())
			return nil, nil
		}
	})}

	if err := adapter.EnsureRepoCollaborator(context.Background(), "movscript-org", "movscript-project-10", "alice", "write"); err != nil {
		t.Fatalf("EnsureRepoCollaborator returned error: %v", err)
	}
	assertRequestSequence(t, requests, []string{
		"GET /api/v4/users?username=alice",
		"PUT /api/v4/projects/movscript-org%2Fmovscript-project-10/members/7",
		"POST /api/v4/projects/movscript-org%2Fmovscript-project-10/members",
	})
	if postPayload["user_id"] != float64(7) || postPayload["access_level"] != float64(30) {
		t.Fatalf("post payload = %#v, want developer access for user 7", postPayload)
	}
}

func TestGitLabAdapterChecksRepoAccess(t *testing.T) {
	adapter := NewGitLabAdapter("https://gitlab.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.Method + " " + r.URL.RequestURI() {
		case "GET /api/v4/users?username=alice":
			return jsonResponse(http.StatusOK, `[{"id":7,"username":"alice"}]`), nil
		case "GET /api/v4/projects/movscript-org%2Fmovscript-project-10/members/all/7":
			return jsonResponse(http.StatusOK, `{"access_level":40}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.RequestURI())
			return nil, nil
		}
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
	if !result.Allowed || result.Permission != "admin" {
		t.Fatalf("access = %+v, want admin satisfying write", result)
	}
}

func TestGitLabAdapterCloneURLStrategies(t *testing.T) {
	adapter := NewGitLabAdapter("https://gitlab.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	direct, err := adapter.GetCloneURL(context.Background(), providercontract.RepositoryCloneURLRequest{
		Ref: providercontract.RepositoryRef{Owner: "movscript-org", Repo: "movscript-project-10"},
	})
	if err != nil {
		t.Fatalf("GetCloneURL direct returned error: %v", err)
	}
	if direct.Strategy != providercontract.RepositoryCloneURLStrategyDirect || direct.URL != "https://gitlab.example.com/movscript-org/movscript-project-10.git" {
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
	if _, err := adapter.GetCloneURL(context.Background(), providercontract.RepositoryCloneURLRequest{
		Ref:               providercontract.RepositoryRef{Owner: "movscript-org", Repo: "movscript-project-10"},
		PreferredStrategy: providercontract.RepositoryCloneURLStrategyTemporary,
	}); err == nil || !strings.Contains(err.Error(), "temporary") {
		t.Fatalf("temporary clone err = %v, want unsupported temporary strategy", err)
	}
}

func TestGitLabAdapterProvidesGitHTTPProxyTarget(t *testing.T) {
	adapter := NewGitLabAdapter("https://gitlab.example.com", "admin-token")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}

	target, err := adapter.GetGitHTTPProxyTarget(context.Background(), providercontract.GitHTTPProxyTargetRequest{
		Ref: providercontract.RepositoryRef{Owner: "movscript-org", Repo: "movscript-project-10", DefaultBranch: "main"},
	})

	if err != nil {
		t.Fatalf("GetGitHTTPProxyTarget returned error: %v", err)
	}
	if target.Provider != ProviderGitLab || target.BaseURL != "https://gitlab.example.com" || target.AuthUsername != "oauth2" || target.AuthSecret != "admin-token" {
		t.Fatalf("target = %+v, want GitLab proxy target with token auth", target)
	}
}

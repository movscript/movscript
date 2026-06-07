package projectrepo

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestGiteaAdapterUsesAdminBasicAuthWhenTokenMissing(t *testing.T) {
	var sawBasic bool
	adapter := NewGiteaAdapterWithAdminAuth("http://gitea.local", "", "movscript", "movscript12345")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/api/v1/user" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		want := "Basic " + base64.StdEncoding.EncodeToString([]byte("movscript:movscript12345"))
		sawBasic = r.Header.Get("Authorization") == want
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"id":1,"username":"movscript"}`)),
		}, nil
	})}

	if _, err := adapter.currentUser(context.Background()); err != nil {
		t.Fatalf("currentUser returned error: %v", err)
	}
	if !sawBasic {
		t.Fatal("expected admin BasicAuth header")
	}
}

func TestGiteaAdapterResetsExistingUserPasswordBeforeCreatingToken(t *testing.T) {
	var requests []string
	var sawResetPassword bool
	var sawTokenBasicAuth bool
	var sawTokenScope bool
	adapter := NewGiteaAdapterWithAdminAuth("http://gitea.local", "admin-token", "", "")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requests = append(requests, r.Method+" "+r.URL.Path)
		switch r.Method + " " + r.URL.Path {
		case "GET /api/v1/users/movscript-user-1":
			return jsonResponse(http.StatusOK, `{"id":2,"username":"movscript-user-1"}`), nil
		case "PATCH /api/v1/admin/users/movscript-user-1":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode reset body: %v", err)
			}
			sawResetPassword = body["login_name"] == "movscript-user-1" && body["password"] == "new-password" && body["must_change_password"] == false
			return jsonResponse(http.StatusOK, `{}`), nil
		case "POST /api/v1/users/movscript-user-1/tokens":
			want := "Basic " + base64.StdEncoding.EncodeToString([]byte("movscript-user-1:new-password"))
			sawTokenBasicAuth = r.Header.Get("Authorization") == want
			var body struct {
				Name   string   `json:"name"`
				Scopes []string `json:"scopes"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode token body: %v", err)
			}
			sawTokenScope = body.Name == "desktop-token" && len(body.Scopes) == 1 && body.Scopes[0] == "write:repository"
			return jsonResponse(http.StatusCreated, `{"token":"user-token"}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
			return nil, nil
		}
	})}

	result, err := adapter.EnsureUser(context.Background(), EnsureUserInput{
		Username:  "movscript-user-1",
		Email:     "movscript-user-1@users.movscript.local",
		Password:  "new-password",
		TokenName: "desktop-token",
	})
	if err != nil {
		t.Fatalf("EnsureUser returned error: %v", err)
	}
	if result.Token != "user-token" {
		t.Fatalf("token = %q, want user-token", result.Token)
	}
	if !sawResetPassword {
		t.Fatal("expected existing user password reset")
	}
	if !sawTokenBasicAuth {
		t.Fatal("expected token creation with reset user password")
	}
	if !sawTokenScope {
		t.Fatal("expected token creation with repository write scope")
	}
	assertRequestSequence(t, requests, []string{
		"GET /api/v1/users/movscript-user-1",
		"PATCH /api/v1/admin/users/movscript-user-1",
		"POST /api/v1/users/movscript-user-1/tokens",
	})
}

func TestGiteaAdapterCreatesOrganizationOwnerBeforeRepo(t *testing.T) {
	var requests []string
	var sawCreateOrg bool
	var sawCreateRepo bool
	adapter := NewGiteaAdapterWithAdminAuth("http://gitea.local", "admin-token", "", "")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requests = append(requests, r.Method+" "+r.URL.Path)
		switch r.Method + " " + r.URL.Path {
		case "GET /api/v1/orgs/ms-org-acme":
			return jsonResponse(http.StatusNotFound, `{"message":"not found"}`), nil
		case "POST /api/v1/orgs":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode org body: %v", err)
			}
			sawCreateOrg = body["username"] == "ms-org-acme" && body["full_name"] == "Acme Studio"
			return jsonResponse(http.StatusCreated, `{"id":9,"username":"ms-org-acme","full_name":"Acme Studio"}`), nil
		case "GET /api/v1/repos/ms-org-acme/project-7":
			return jsonResponse(http.StatusNotFound, `{"message":"not found"}`), nil
		case "POST /api/v1/orgs/ms-org-acme/repos":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode repo body: %v", err)
			}
			sawCreateRepo = body["name"] == "project-7" && body["private"] == true
			return jsonResponse(http.StatusCreated, `{"id":77,"name":"project-7","full_name":"ms-org-acme/project-7"}`), nil
		case "GET /api/v1/repos/ms-org-acme/project-7/branches/main":
			return jsonResponse(http.StatusNotFound, `{"message":"not found"}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
			return nil, nil
		}
	})}

	result, err := adapter.EnsureRepository(context.Background(), EnsureRepositoryInput{
		Owner:         "ms-org-acme",
		Repo:          "project-7",
		DefaultBranch: "main",
		Private:       true,
		OwnerType:     OwnerTypeOrganization,
		OwnerName:     "Acme Studio",
	})
	if err != nil {
		t.Fatalf("EnsureRepository returned error: %v", err)
	}
	if result.ProviderRepoID != "77" {
		t.Fatalf("repo id = %q, want 77", result.ProviderRepoID)
	}
	if !sawCreateOrg || !sawCreateRepo {
		t.Fatalf("sawCreateOrg=%t sawCreateRepo=%t", sawCreateOrg, sawCreateRepo)
	}
	assertRequestSequence(t, requests, []string{
		"GET /api/v1/orgs/ms-org-acme",
		"POST /api/v1/orgs",
		"GET /api/v1/repos/ms-org-acme/project-7",
		"POST /api/v1/orgs/ms-org-acme/repos",
		"GET /api/v1/repos/ms-org-acme/project-7/branches/main",
	})
}

func TestGiteaAdapterCreatesPersonalRepoUnderOwnerUser(t *testing.T) {
	var requests []string
	var sawCreateRepo bool
	adapter := NewGiteaAdapterWithAdminAuth("http://gitea.local", "admin-token", "", "")
	if adapter == nil {
		t.Fatal("adapter is nil")
	}
	adapter.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requests = append(requests, r.Method+" "+r.URL.Path)
		switch r.Method + " " + r.URL.Path {
		case "GET /api/v1/users/admin":
			return jsonResponse(http.StatusOK, `{"id":3,"username":"admin"}`), nil
		case "GET /api/v1/repos/admin/movscript-project-10":
			return jsonResponse(http.StatusNotFound, `{"message":"not found"}`), nil
		case "POST /api/v1/admin/users/admin/repos":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode repo body: %v", err)
			}
			sawCreateRepo = body["name"] == "movscript-project-10" && body["private"] == true && body["default_branch"] == "main"
			return jsonResponse(http.StatusCreated, `{"id":88,"name":"movscript-project-10","full_name":"admin/movscript-project-10"}`), nil
		case "GET /api/v1/repos/admin/movscript-project-10/branches/main":
			return jsonResponse(http.StatusNotFound, `{"message":"not found"}`), nil
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
			return nil, nil
		}
	})}

	result, err := adapter.EnsureRepository(context.Background(), EnsureRepositoryInput{
		Owner:         "admin",
		Repo:          "movscript-project-10",
		DefaultBranch: "main",
		Private:       true,
		OwnerType:     OwnerTypeUser,
		OwnerName:     "admin",
	})
	if err != nil {
		t.Fatalf("EnsureRepository returned error: %v", err)
	}
	if result.ProviderRepoID != "88" {
		t.Fatalf("repo id = %q, want 88", result.ProviderRepoID)
	}
	if !sawCreateRepo {
		t.Fatal("expected repo creation under personal owner")
	}
	assertRequestSequence(t, requests, []string{
		"GET /api/v1/users/admin",
		"GET /api/v1/repos/admin/movscript-project-10",
		"POST /api/v1/admin/users/admin/repos",
		"GET /api/v1/repos/admin/movscript-project-10/branches/main",
	})
}

func jsonResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func assertRequestSequence(t *testing.T, got []string, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("requests = %#v, want %#v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("requests = %#v, want %#v", got, want)
		}
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

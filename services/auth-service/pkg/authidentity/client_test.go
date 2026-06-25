package authidentity

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestClientReadsUserProfileAndOrgMemberships(t *testing.T) {
	var seenAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		switch r.URL.Path {
		case "/v1/auth/users/7":
			writeTestJSON(t, w, map[string]any{
				"id":            7,
				"username":      "alice",
				"system_role":   "user",
				"status":        "active",
				"primary_email": "alice@example.com",
			})
		case "/v1/auth/users/7/org-memberships":
			writeTestJSON(t, w, map[string]any{
				"items": []map[string]any{{
					"org_id":      3,
					"org_name":    "Studio",
					"org_slug":    "studio",
					"is_personal": false,
					"plan":        "team",
					"status":      "active",
					"role":        "owner",
				}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, err := NewClient(server.URL, "sk-admin", server.Client())
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	profile, err := client.UserProfile(t.Context(), 7)
	if err != nil {
		t.Fatalf("UserProfile returned error: %v", err)
	}
	memberships, err := client.OrgMemberships(t.Context(), 7)
	if err != nil {
		t.Fatalf("OrgMemberships returned error: %v", err)
	}

	if seenAuth != "Bearer sk-admin" {
		t.Fatalf("Authorization = %q, want management bearer", seenAuth)
	}
	if profile.ID != 7 || profile.Username != "alice" || profile.PrimaryEmail == nil || *profile.PrimaryEmail != "alice@example.com" {
		t.Fatalf("profile = %#v", profile)
	}
	if len(memberships) != 1 || memberships[0].OrgID != 3 || memberships[0].Role != "owner" {
		t.Fatalf("memberships = %#v", memberships)
	}
}

func TestClientManagesUsers(t *testing.T) {
	var seenAuth string
	var createBody CreateUserInput
	var createWithPasswordUserBody CreateUserInput
	var createWithPasswordBody CreateUserWithPasswordInput
	var updateBody UpdateUserInput
	var passwordBody SetUserPasswordHashInput
	var createWithPasswordPasswordEndpointCalled bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/v1/auth/users":
			if got := r.URL.Query(); got.Get("query") != "ali" || got.Get("user_id") != "7" || got.Get("system_role") != "admin" || got.Get("status") != "active" || got.Get("page") != "1" || got.Get("page_size") != "20" {
				t.Fatalf("unexpected user query: %s", r.URL.RawQuery)
			}
			writeTestJSON(t, w, map[string]any{
				"items": []map[string]any{{
					"id":          7,
					"username":    "alice",
					"system_role": "admin",
					"status":      "active",
				}},
				"total":     1,
				"page":      1,
				"page_size": 20,
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/auth/users":
			var body CreateUserInput
			decodeTestJSON(t, r, &body)
			createBody = body
			w.WriteHeader(http.StatusCreated)
			writeTestJSON(t, w, map[string]any{
				"id":          8,
				"username":    body.Username,
				"system_role": "user",
				"status":      "active",
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/auth/users/with-password":
			decodeTestJSON(t, r, &createWithPasswordBody)
			createWithPasswordUserBody = createWithPasswordBody.CreateUserInput
			w.WriteHeader(http.StatusCreated)
			writeTestJSON(t, w, map[string]any{
				"id":          9,
				"username":    createWithPasswordBody.Username,
				"system_role": "user",
				"status":      "active",
			})
		case r.Method == http.MethodPatch && r.URL.Path == "/v1/auth/users/7":
			decodeTestJSON(t, r, &updateBody)
			writeTestJSON(t, w, map[string]any{
				"id":          7,
				"username":    "alice",
				"system_role": valueOr(updateBody.SystemRole, "user"),
				"status":      valueOr(updateBody.Status, "active"),
			})
		case r.Method == http.MethodPut && r.URL.Path == "/v1/auth/users/7/password":
			decodeTestJSON(t, r, &passwordBody)
			writeTestJSON(t, w, map[string]any{
				"id":          7,
				"username":    "alice",
				"system_role": "user",
				"status":      "active",
			})
		case r.Method == http.MethodPut && r.URL.Path == "/v1/auth/users/8/password":
			createWithPasswordPasswordEndpointCalled = true
			http.Error(w, "unexpected password endpoint", http.StatusTeapot)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, err := NewClient(server.URL, "sk-admin", server.Client())
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	userID := uint(7)
	page, err := client.ListUsers(t.Context(), ListUsersFilter{Query: "ali", UserID: &userID, SystemRole: "admin", Status: "active", Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("ListUsers returned error: %v", err)
	}
	email := "new@example.com"
	created, err := client.CreateUser(t.Context(), CreateUserInput{Username: "new-user", Email: &email})
	if err != nil {
		t.Fatalf("CreateUser returned error: %v", err)
	}
	createdWithPassword, err := client.CreateUserWithPassword(t.Context(), CreateUserInput{Username: "password-user"}, "secret-pass")
	if err != nil {
		t.Fatalf("CreateUserWithPassword returned error: %v", err)
	}
	status := "disabled"
	role := "super_admin"
	updated, err := client.UpdateUser(t.Context(), 7, UpdateUserInput{SystemRole: &role, Status: &status})
	if err != nil {
		t.Fatalf("UpdateUser returned error: %v", err)
	}
	passwordUpdated, err := client.SetUserPasswordHash(t.Context(), 7, "hash-secret")
	if err != nil {
		t.Fatalf("SetUserPasswordHash returned error: %v", err)
	}

	if seenAuth != "Bearer sk-admin" {
		t.Fatalf("Authorization = %q, want management bearer", seenAuth)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != 7 {
		t.Fatalf("page = %#v", page)
	}
	if createBody.Username != "new-user" || createBody.Email == nil || *createBody.Email != "new@example.com" {
		t.Fatalf("create body = %#v", createBody)
	}
	if created.ID != 8 || created.Username != "new-user" {
		t.Fatalf("created = %#v", created)
	}
	if createdWithPassword.ID != 9 || createWithPasswordUserBody.Username != "password-user" {
		t.Fatalf("created with password = %#v create body = %#v", createdWithPassword, createWithPasswordUserBody)
	}
	if createWithPasswordBody.Password != "secret-pass" || createWithPasswordPasswordEndpointCalled {
		t.Fatalf("CreateUserWithPassword body = %#v password endpoint called=%v", createWithPasswordBody, createWithPasswordPasswordEndpointCalled)
	}
	if updateBody.SystemRole == nil || *updateBody.SystemRole != "super_admin" || updateBody.Status == nil || *updateBody.Status != "disabled" {
		t.Fatalf("update body = %#v", updateBody)
	}
	if updated.ID != 7 || updated.SystemRole != "super_admin" || updated.Status != "disabled" {
		t.Fatalf("updated = %#v", updated)
	}
	if passwordBody.PasswordHash != "hash-secret" || passwordUpdated.ID != 7 {
		t.Fatalf("password body = %#v updated=%#v", passwordBody, passwordUpdated)
	}
}

func TestClientManagesOrgsAndMembers(t *testing.T) {
	var createOrgBody CreateOrgInput
	var updateOrgBody UpdateOrgInput
	var addMemberBody OrgMemberInput
	var updateMemberBody OrgMemberInput
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/v1/auth/orgs":
			if got := r.URL.Query(); got.Get("query") != "studio" || got.Get("org_id") != "3" || got.Get("user_id") != "7" || got.Get("status") != "active" || got.Get("plan") != "team" || got.Get("is_personal") != "false" || got.Get("page") != "1" || got.Get("page_size") != "10" {
				t.Fatalf("unexpected org query: %s", r.URL.RawQuery)
			}
			writeTestJSON(t, w, map[string]any{
				"items": []map[string]any{{
					"id":          3,
					"name":        "Studio",
					"slug":        "studio",
					"is_personal": false,
					"plan":        "team",
					"status":      "active",
					"created_by":  7,
				}},
				"total":     1,
				"page":      1,
				"page_size": 10,
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/auth/orgs":
			decodeTestJSON(t, r, &createOrgBody)
			w.WriteHeader(http.StatusCreated)
			writeTestJSON(t, w, map[string]any{
				"id":          4,
				"name":        createOrgBody.Name,
				"slug":        createOrgBody.Slug,
				"is_personal": false,
				"plan":        createOrgBody.Plan,
				"status":      "active",
				"created_by":  createOrgBody.CreatedBy,
			})
		case r.Method == http.MethodPatch && r.URL.Path == "/v1/auth/orgs/3":
			decodeTestJSON(t, r, &updateOrgBody)
			writeTestJSON(t, w, map[string]any{
				"id":          3,
				"name":        valueOr(updateOrgBody.Name, "Studio"),
				"slug":        valueOr(updateOrgBody.Slug, "studio"),
				"is_personal": false,
				"plan":        valueOr(updateOrgBody.Plan, "team"),
				"status":      valueOr(updateOrgBody.Status, "active"),
				"created_by":  7,
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/auth/orgs/3/members":
			writeTestJSON(t, w, map[string]any{
				"items": []map[string]any{{
					"id":      11,
					"org_id":  3,
					"user_id": 7,
					"role":    "owner",
				}},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/auth/orgs/3/members":
			decodeTestJSON(t, r, &addMemberBody)
			w.WriteHeader(http.StatusCreated)
			writeTestJSON(t, w, map[string]any{
				"id":      12,
				"org_id":  3,
				"user_id": addMemberBody.UserID,
				"role":    addMemberBody.Role,
			})
		case r.Method == http.MethodPatch && r.URL.Path == "/v1/auth/orgs/3/members/8":
			decodeTestJSON(t, r, &updateMemberBody)
			writeTestJSON(t, w, map[string]any{
				"id":      12,
				"org_id":  3,
				"user_id": 8,
				"role":    updateMemberBody.Role,
			})
		case r.Method == http.MethodDelete && r.URL.Path == "/v1/auth/orgs/3/members/8":
			writeTestJSON(t, w, map[string]any{"removed": true})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, err := NewClient(server.URL, "sk-admin", server.Client())
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	userID := uint(7)
	orgID := uint(3)
	isPersonal := false
	page, err := client.ListOrgs(t.Context(), ListOrgsFilter{Query: "studio", OrgID: &orgID, UserID: &userID, Status: "active", Plan: "team", IsPersonal: &isPersonal, Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("ListOrgs returned error: %v", err)
	}
	created, err := client.CreateOrg(t.Context(), CreateOrgInput{Name: "New Studio", Slug: "new-studio", CreatedBy: 7, Plan: "team"})
	if err != nil {
		t.Fatalf("CreateOrg returned error: %v", err)
	}
	newName := "Renamed Studio"
	updated, err := client.UpdateOrg(t.Context(), 3, UpdateOrgInput{Name: &newName})
	if err != nil {
		t.Fatalf("UpdateOrg returned error: %v", err)
	}
	members, err := client.ListOrgMembers(t.Context(), 3)
	if err != nil {
		t.Fatalf("ListOrgMembers returned error: %v", err)
	}
	added, err := client.AddOrgMember(t.Context(), 3, OrgMemberInput{UserID: 8, Role: "editor"})
	if err != nil {
		t.Fatalf("AddOrgMember returned error: %v", err)
	}
	changed, err := client.UpdateOrgMember(t.Context(), 3, 8, OrgMemberInput{Role: "viewer"})
	if err != nil {
		t.Fatalf("UpdateOrgMember returned error: %v", err)
	}
	removed, err := client.RemoveOrgMember(t.Context(), 3, 8)
	if err != nil {
		t.Fatalf("RemoveOrgMember returned error: %v", err)
	}

	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != 3 {
		t.Fatalf("page = %#v", page)
	}
	if !reflect.DeepEqual(createOrgBody, CreateOrgInput{Name: "New Studio", Slug: "new-studio", CreatedBy: 7, Plan: "team"}) {
		t.Fatalf("create org body = %#v", createOrgBody)
	}
	if created.ID != 4 || created.CreatedBy != 7 {
		t.Fatalf("created = %#v", created)
	}
	if updateOrgBody.Name == nil || *updateOrgBody.Name != "Renamed Studio" || updated.Name != "Renamed Studio" {
		t.Fatalf("update org = body %#v, response %#v", updateOrgBody, updated)
	}
	if len(members) != 1 || members[0].Role != "owner" {
		t.Fatalf("members = %#v", members)
	}
	if addMemberBody.UserID != 8 || addMemberBody.Role != "editor" || added.UserID != 8 || added.Role != "editor" {
		t.Fatalf("add member body = %#v, response = %#v", addMemberBody, added)
	}
	if updateMemberBody.Role != "viewer" || changed.Role != "viewer" {
		t.Fatalf("update member body = %#v, response = %#v", updateMemberBody, changed)
	}
	if !removed {
		t.Fatalf("removed = false")
	}
}

func TestClientMapsNotFoundAndUnauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	withoutToken, err := NewClient(server.URL, "", server.Client())
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}
	if _, err := withoutToken.UserProfile(t.Context(), 7); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("UserProfile err = %v, want ErrUnauthorized", err)
	}

	withToken, err := NewClient(server.URL, "sk-admin", server.Client())
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}
	if _, err := withToken.UserProfile(t.Context(), 7); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("UserProfile err = %v, want ErrUserNotFound", err)
	}
	if _, err := withToken.ListOrgMembers(t.Context(), 3); !errors.Is(err, ErrOrgNotFound) {
		t.Fatalf("ListOrgMembers err = %v, want ErrOrgNotFound", err)
	}
}

func TestNewClientRequiresBaseURL(t *testing.T) {
	if _, err := NewClient(" ", "sk-admin", nil); !errors.Is(err, ErrInvalidConfig) {
		t.Fatalf("NewClient err = %v, want ErrInvalidConfig", err)
	}
}

func writeTestJSON(t *testing.T, w http.ResponseWriter, value any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		t.Fatalf("encode response: %v", err)
	}
}

func decodeTestJSON(t *testing.T, r *http.Request, value any) {
	t.Helper()
	if err := json.NewDecoder(r.Body).Decode(value); err != nil {
		t.Fatalf("decode request: %v", err)
	}
}

func valueOr(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	return *value
}

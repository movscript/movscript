package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	identityapp "github.com/movscript/auth-service/internal/app/identity"
	"github.com/movscript/auth-service/internal/app/introspection"
	domainauth "github.com/movscript/auth-service/internal/domain/auth"
	"github.com/movscript/auth-service/internal/infra/db"
	"github.com/movscript/auth-service/internal/infra/dbidentity"
	persistencemodel "github.com/movscript/auth-service/internal/infra/persistence/model"
	"github.com/movscript/auth-service/internal/infra/staticidentity"
	"github.com/movscript/auth-service/internal/infra/statickeys"
	"golang.org/x/crypto/bcrypt"
)

func TestHealthEndpoint(t *testing.T) {
	server := httptest.NewServer(NewHandler(introspection.NewService(nil)))
	defer server.Close()

	response, err := http.Get(server.URL + "/health")
	if err != nil {
		t.Fatalf("health request failed: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status: %d", response.StatusCode)
	}
}

func TestKeyManagementEndpointsRequireManagementToken(t *testing.T) {
	keys, err := statickeys.New(nil)
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	server := httptest.NewServer(NewHandler(introspection.NewService(keys)))
	defer server.Close()

	response, err := http.Post(server.URL+"/v1/auth/keys/issue", "application/json", strings.NewReader(`{"principal_id":"agent_1"}`))
	if err != nil {
		t.Fatalf("issue request failed: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusUnauthorized)
	}
}

func TestKeyManagementEndpointsIssueAndRevokeOpaqueKeys(t *testing.T) {
	keys, err := statickeys.New(nil)
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	server := httptest.NewServer(NewHandlerWithOptions(introspection.NewService(keys), HandlerOptions{ManagementToken: "sk-admin"}))
	defer server.Close()

	issueReq, err := http.NewRequest(http.MethodPost, server.URL+"/v1/auth/keys/issue", strings.NewReader(`{"principal_id":"agent_1","type":"agent","claims":{"scope":"project:read"},"prefix":"sk-test"}`))
	if err != nil {
		t.Fatalf("new issue request: %v", err)
	}
	issueReq.Header.Set("Authorization", "Bearer sk-admin")
	issueReq.Header.Set("Content-Type", "application/json")
	issueRes, err := http.DefaultClient.Do(issueReq)
	if err != nil {
		t.Fatalf("issue request failed: %v", err)
	}
	defer issueRes.Body.Close()
	if issueRes.StatusCode != http.StatusCreated {
		t.Fatalf("issue status = %d, want %d", issueRes.StatusCode, http.StatusCreated)
	}
	var issued domainauth.IssueKeyResponse
	if err := json.NewDecoder(issueRes.Body).Decode(&issued); err != nil {
		t.Fatalf("decode issue response: %v", err)
	}
	if !strings.HasPrefix(issued.Token, "sk-test_") || issued.Principal.ID != "agent_1" {
		t.Fatalf("unexpected issue response: %#v", issued)
	}

	introspectBody, _ := json.Marshal(domainauth.IntrospectRequest{Token: issued.Token})
	introspectRes, err := http.Post(server.URL+"/v1/auth/introspect", "application/json", bytes.NewReader(introspectBody))
	if err != nil {
		t.Fatalf("introspect request failed: %v", err)
	}
	defer introspectRes.Body.Close()
	var introspected domainauth.IntrospectResponse
	if err := json.NewDecoder(introspectRes.Body).Decode(&introspected); err != nil {
		t.Fatalf("decode introspect response: %v", err)
	}
	if !introspected.Active || introspected.Claims["scope"] != "project:read" {
		t.Fatalf("unexpected introspection response: %#v", introspected)
	}

	revokeBody, _ := json.Marshal(domainauth.RevokeKeyRequest{TokenID: issued.TokenID})
	revokeReq, err := http.NewRequest(http.MethodPost, server.URL+"/v1/auth/keys/revoke", bytes.NewReader(revokeBody))
	if err != nil {
		t.Fatalf("new revoke request: %v", err)
	}
	revokeReq.Header.Set("Authorization", "Bearer sk-admin")
	revokeReq.Header.Set("Content-Type", "application/json")
	revokeRes, err := http.DefaultClient.Do(revokeReq)
	if err != nil {
		t.Fatalf("revoke request failed: %v", err)
	}
	defer revokeRes.Body.Close()
	if revokeRes.StatusCode != http.StatusOK {
		t.Fatalf("revoke status = %d, want %d", revokeRes.StatusCode, http.StatusOK)
	}

	introspectRes, err = http.Post(server.URL+"/v1/auth/introspect", "application/json", bytes.NewReader(introspectBody))
	if err != nil {
		t.Fatalf("introspect after revoke request failed: %v", err)
	}
	defer introspectRes.Body.Close()
	if err := json.NewDecoder(introspectRes.Body).Decode(&introspected); err != nil {
		t.Fatalf("decode revoked introspect response: %v", err)
	}
	if introspected.Active {
		t.Fatalf("expected revoked token to be inactive: %#v", introspected)
	}
}

func TestIntrospectEndpoint(t *testing.T) {
	keys, err := statickeys.FromJSON(`[{"key":"sk-test","principal_id":"agent_1","type":"agent","claims":{"scope":"project:read"}}]`)
	if err != nil {
		t.Fatalf("FromJSON returned error: %v", err)
	}
	server := httptest.NewServer(NewHandler(introspection.NewService(keys)))
	defer server.Close()

	body := bytes.NewBufferString(`{"token":"sk-test"}`)
	response, err := http.Post(server.URL+"/v1/auth/introspect", "application/json", body)
	if err != nil {
		t.Fatalf("introspect request failed: %v", err)
	}
	defer response.Body.Close()

	var payload domainauth.IntrospectResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	if !payload.Active {
		t.Fatal("expected active token")
	}
	if payload.Principal == nil || payload.Principal.ID != "agent_1" {
		t.Fatalf("unexpected principal: %#v", payload.Principal)
	}
	if payload.AuthContext == nil || payload.AuthContext.Claims["scope"] != "project:read" {
		t.Fatalf("unexpected auth context: %#v", payload.AuthContext)
	}
}

func TestIdentityEndpointsRequireManagementToken(t *testing.T) {
	identities := staticidentity.New(staticidentity.Config{
		Users: []domainauth.UserProfile{{ID: 7, Username: "alice", SystemRole: "user", Status: "active"}},
	})
	server := httptest.NewServer(NewHandlerWithOptions(introspection.NewService(nil), HandlerOptions{
		ManagementToken: "sk-admin",
		IdentityService: identityapp.NewService(identities),
	}))
	defer server.Close()

	response, err := http.Get(server.URL + "/v1/auth/users/7")
	if err != nil {
		t.Fatalf("identity request failed: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusUnauthorized)
	}
}

func TestIdentityEndpointsRequireIdentityService(t *testing.T) {
	server := httptest.NewServer(NewHandlerWithOptions(introspection.NewService(nil), HandlerOptions{
		ManagementToken: "sk-admin",
	}))
	defer server.Close()

	request, err := http.NewRequest(http.MethodGet, server.URL+"/v1/auth/users/7", nil)
	if err != nil {
		t.Fatalf("new identity request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer sk-admin")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("identity request failed: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusServiceUnavailable)
	}
}

func TestIdentityEndpointsReturnUserAndOrgMemberships(t *testing.T) {
	identities := staticidentity.New(staticidentity.Config{
		Users: []domainauth.UserProfile{{ID: 7, Username: "alice", SystemRole: "user", Status: "active"}},
		OrgMemberships: []staticidentity.OrgMembershipConfigRecord{{
			UserID: 7,
			OrgMembership: domainauth.OrgMembership{
				OrgID: 3, OrgName: "Studio", OrgSlug: "studio", Role: "owner", Plan: "team", Status: "active",
			},
		}},
	})
	server := httptest.NewServer(NewHandlerWithOptions(introspection.NewService(nil), HandlerOptions{
		ManagementToken: "sk-admin",
		IdentityService: identityapp.NewService(identities),
	}))
	defer server.Close()

	userReq, err := http.NewRequest(http.MethodGet, server.URL+"/v1/auth/users/7", nil)
	if err != nil {
		t.Fatalf("new user request: %v", err)
	}
	userReq.Header.Set("Authorization", "Bearer sk-admin")
	userRes, err := http.DefaultClient.Do(userReq)
	if err != nil {
		t.Fatalf("user request failed: %v", err)
	}
	defer userRes.Body.Close()
	if userRes.StatusCode != http.StatusOK {
		t.Fatalf("user status = %d, want %d", userRes.StatusCode, http.StatusOK)
	}
	var profile domainauth.UserProfile
	if err := json.NewDecoder(userRes.Body).Decode(&profile); err != nil {
		t.Fatalf("decode profile: %v", err)
	}
	if profile.ID != 7 || profile.Username != "alice" {
		t.Fatalf("profile = %#v", profile)
	}

	membershipReq, err := http.NewRequest(http.MethodGet, server.URL+"/v1/auth/users/7/org-memberships", nil)
	if err != nil {
		t.Fatalf("new membership request: %v", err)
	}
	membershipReq.Header.Set("Authorization", "Bearer sk-admin")
	membershipRes, err := http.DefaultClient.Do(membershipReq)
	if err != nil {
		t.Fatalf("membership request failed: %v", err)
	}
	defer membershipRes.Body.Close()
	if membershipRes.StatusCode != http.StatusOK {
		t.Fatalf("membership status = %d, want %d", membershipRes.StatusCode, http.StatusOK)
	}
	var body struct {
		Items []domainauth.OrgMembership `json:"items"`
	}
	if err := json.NewDecoder(membershipRes.Body).Decode(&body); err != nil {
		t.Fatalf("decode memberships: %v", err)
	}
	if len(body.Items) != 1 || body.Items[0].OrgID != 3 {
		t.Fatalf("memberships = %#v", body.Items)
	}
}

func TestIdentityManagementEndpointsCreateListAndUpdateUsers(t *testing.T) {
	identityService := newDBIdentityService(t)
	server := httptest.NewServer(NewHandlerWithOptions(introspection.NewService(nil), HandlerOptions{
		ManagementToken: "sk-admin",
		IdentityService: identityService,
	}))
	defer server.Close()

	createReq, err := http.NewRequest(http.MethodPost, server.URL+"/v1/auth/users", strings.NewReader(`{"username":"alice","email":"alice@example.com","display_name":"Alice"}`))
	if err != nil {
		t.Fatalf("new create request: %v", err)
	}
	createReq.Header.Set("Authorization", "Bearer sk-admin")
	createReq.Header.Set("Content-Type", "application/json")
	createRes, err := http.DefaultClient.Do(createReq)
	if err != nil {
		t.Fatalf("create request failed: %v", err)
	}
	defer createRes.Body.Close()
	if createRes.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d", createRes.StatusCode, http.StatusCreated)
	}
	var created domainauth.UserProfile
	if err := json.NewDecoder(createRes.Body).Decode(&created); err != nil {
		t.Fatalf("decode created user: %v", err)
	}
	if created.ID == 0 || created.Username != "alice" {
		t.Fatalf("created = %#v", created)
	}

	listReq, err := http.NewRequest(http.MethodGet, server.URL+"/v1/auth/users?query=ali", nil)
	if err != nil {
		t.Fatalf("new list request: %v", err)
	}
	listReq.Header.Set("Authorization", "Bearer sk-admin")
	listRes, err := http.DefaultClient.Do(listReq)
	if err != nil {
		t.Fatalf("list request failed: %v", err)
	}
	defer listRes.Body.Close()
	if listRes.StatusCode != http.StatusOK {
		t.Fatalf("list status = %d, want %d", listRes.StatusCode, http.StatusOK)
	}
	var page identityapp.UserPage
	if err := json.NewDecoder(listRes.Body).Decode(&page); err != nil {
		t.Fatalf("decode list page: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != created.ID {
		t.Fatalf("page = %#v", page)
	}

	patchReq, err := http.NewRequest(http.MethodPatch, server.URL+"/v1/auth/users/"+strconv.Itoa(int(created.ID)), strings.NewReader(`{"status":"suspended","display_name":"Alice Updated"}`))
	if err != nil {
		t.Fatalf("new patch request: %v", err)
	}
	patchReq.Header.Set("Authorization", "Bearer sk-admin")
	patchReq.Header.Set("Content-Type", "application/json")
	patchRes, err := http.DefaultClient.Do(patchReq)
	if err != nil {
		t.Fatalf("patch request failed: %v", err)
	}
	defer patchRes.Body.Close()
	if patchRes.StatusCode != http.StatusOK {
		t.Fatalf("patch status = %d, want %d", patchRes.StatusCode, http.StatusOK)
	}
	var updated domainauth.UserProfile
	if err := json.NewDecoder(patchRes.Body).Decode(&updated); err != nil {
		t.Fatalf("decode updated user: %v", err)
	}
	if updated.Status != domainauth.UserStatusSuspended || updated.DisplayName != "Alice Updated" {
		t.Fatalf("updated = %#v", updated)
	}

	passwordReq, err := http.NewRequest(http.MethodPut, server.URL+"/v1/auth/users/"+strconv.Itoa(int(created.ID))+"/password", strings.NewReader(`{"password_hash":"hash-secret"}`))
	if err != nil {
		t.Fatalf("new password request: %v", err)
	}
	passwordReq.Header.Set("Authorization", "Bearer sk-admin")
	passwordReq.Header.Set("Content-Type", "application/json")
	passwordRes, err := http.DefaultClient.Do(passwordReq)
	if err != nil {
		t.Fatalf("password request failed: %v", err)
	}
	defer passwordRes.Body.Close()
	if passwordRes.StatusCode != http.StatusOK {
		t.Fatalf("password status = %d, want %d", passwordRes.StatusCode, http.StatusOK)
	}
	var passwordUpdated domainauth.UserProfile
	if err := json.NewDecoder(passwordRes.Body).Decode(&passwordUpdated); err != nil {
		t.Fatalf("decode password updated user: %v", err)
	}
	if passwordUpdated.ID != created.ID {
		t.Fatalf("password updated = %#v, want user id %d", passwordUpdated, created.ID)
	}

	emptyPasswordReq, err := http.NewRequest(http.MethodPut, server.URL+"/v1/auth/users/"+strconv.Itoa(int(created.ID))+"/password", strings.NewReader(`{"password_hash":" "}`))
	if err != nil {
		t.Fatalf("new empty password request: %v", err)
	}
	emptyPasswordReq.Header.Set("Authorization", "Bearer sk-admin")
	emptyPasswordReq.Header.Set("Content-Type", "application/json")
	emptyPasswordRes, err := http.DefaultClient.Do(emptyPasswordReq)
	if err != nil {
		t.Fatalf("empty password request failed: %v", err)
	}
	defer emptyPasswordRes.Body.Close()
	if emptyPasswordRes.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty password status = %d, want %d", emptyPasswordRes.StatusCode, http.StatusBadRequest)
	}
}

func TestIdentityManagementEndpointCreatesUserWithPasswordAtomically(t *testing.T) {
	database, err := db.Connect(db.Config{Driver: "sqlite", Path: filepath.Join(t.TempDir(), "auth.db")})
	if err != nil {
		t.Fatalf("connect sqlite: %v", err)
	}
	if err := db.RunMigrations(database); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	identityService := identityapp.NewService(dbidentity.New(database))
	server := httptest.NewServer(NewHandlerWithOptions(introspection.NewService(nil), HandlerOptions{
		ManagementToken: "sk-admin",
		IdentityService: identityService,
	}))
	defer server.Close()

	createReq, err := http.NewRequest(http.MethodPost, server.URL+"/v1/auth/users/with-password", strings.NewReader(`{"username":"password-user","password":"secret-pass"}`))
	if err != nil {
		t.Fatalf("new create request: %v", err)
	}
	createReq.Header.Set("Authorization", "Bearer sk-admin")
	createReq.Header.Set("Content-Type", "application/json")
	createRes, err := http.DefaultClient.Do(createReq)
	if err != nil {
		t.Fatalf("create request failed: %v", err)
	}
	defer createRes.Body.Close()
	if createRes.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d", createRes.StatusCode, http.StatusCreated)
	}
	var created domainauth.UserProfile
	if err := json.NewDecoder(createRes.Body).Decode(&created); err != nil {
		t.Fatalf("decode created user: %v", err)
	}
	var row persistencemodel.User
	if err := database.First(&row, created.ID).Error; err != nil {
		t.Fatalf("load created user: %v", err)
	}
	if row.PasswordHash == "" || row.PasswordHash == "secret-pass" {
		t.Fatalf("password hash = %q, want stored bcrypt hash", row.PasswordHash)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(row.PasswordHash), []byte("secret-pass")); err != nil {
		t.Fatalf("stored hash does not match submitted password: %v", err)
	}

	memberships, err := identityService.OrgMemberships(t.Context(), created.ID)
	if err != nil {
		t.Fatalf("OrgMemberships returned error: %v", err)
	}
	if len(memberships) != 1 || !memberships[0].IsPersonal || memberships[0].Role != domainauth.OrgRoleOwner {
		t.Fatalf("memberships = %#v", memberships)
	}

	emptyReq, err := http.NewRequest(http.MethodPost, server.URL+"/v1/auth/users/with-password", strings.NewReader(`{"username":"empty-password","password":" "}`))
	if err != nil {
		t.Fatalf("new empty create request: %v", err)
	}
	emptyReq.Header.Set("Authorization", "Bearer sk-admin")
	emptyReq.Header.Set("Content-Type", "application/json")
	emptyRes, err := http.DefaultClient.Do(emptyReq)
	if err != nil {
		t.Fatalf("empty create request failed: %v", err)
	}
	defer emptyRes.Body.Close()
	if emptyRes.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty create status = %d, want %d", emptyRes.StatusCode, http.StatusBadRequest)
	}
}

func TestOrgManagementEndpointsCreateListAndManageMembers(t *testing.T) {
	identityService := newDBIdentityService(t)
	server := httptest.NewServer(NewHandlerWithOptions(introspection.NewService(nil), HandlerOptions{
		ManagementToken: "sk-admin",
		IdentityService: identityService,
	}))
	defer server.Close()

	owner := createHTTPUser(t, server.URL, "owner")
	member := createHTTPUser(t, server.URL, "member")

	createOrgReq, err := http.NewRequest(http.MethodPost, server.URL+"/v1/auth/orgs", strings.NewReader(`{"name":"Studio","slug":"studio","created_by":`+strconv.Itoa(int(owner.ID))+`}`))
	if err != nil {
		t.Fatalf("new create org request: %v", err)
	}
	createOrgReq.Header.Set("Authorization", "Bearer sk-admin")
	createOrgReq.Header.Set("Content-Type", "application/json")
	createOrgRes, err := http.DefaultClient.Do(createOrgReq)
	if err != nil {
		t.Fatalf("create org request failed: %v", err)
	}
	defer createOrgRes.Body.Close()
	if createOrgRes.StatusCode != http.StatusCreated {
		t.Fatalf("create org status = %d, want %d", createOrgRes.StatusCode, http.StatusCreated)
	}
	var org domainauth.Organization
	if err := json.NewDecoder(createOrgRes.Body).Decode(&org); err != nil {
		t.Fatalf("decode org: %v", err)
	}
	if org.ID == 0 || org.Slug != "studio" {
		t.Fatalf("org = %#v", org)
	}

	listOrgReq, err := http.NewRequest(http.MethodGet, server.URL+"/v1/auth/orgs?query=studio&org_id="+strconv.Itoa(int(org.ID))+"&is_personal=false", nil)
	if err != nil {
		t.Fatalf("new list orgs request: %v", err)
	}
	listOrgReq.Header.Set("Authorization", "Bearer sk-admin")
	listOrgRes, err := http.DefaultClient.Do(listOrgReq)
	if err != nil {
		t.Fatalf("list orgs request failed: %v", err)
	}
	defer listOrgRes.Body.Close()
	if listOrgRes.StatusCode != http.StatusOK {
		t.Fatalf("list orgs status = %d, want %d", listOrgRes.StatusCode, http.StatusOK)
	}
	var orgPage identityapp.OrgPage
	if err := json.NewDecoder(listOrgRes.Body).Decode(&orgPage); err != nil {
		t.Fatalf("decode org page: %v", err)
	}
	if orgPage.Total != 1 || orgPage.Items[0].ID != org.ID {
		t.Fatalf("org page = %#v", orgPage)
	}

	addMemberReq, err := http.NewRequest(http.MethodPost, server.URL+"/v1/auth/orgs/"+strconv.Itoa(int(org.ID))+"/members", strings.NewReader(`{"user_id":`+strconv.Itoa(int(member.ID))+`,"role":"member"}`))
	if err != nil {
		t.Fatalf("new add member request: %v", err)
	}
	addMemberReq.Header.Set("Authorization", "Bearer sk-admin")
	addMemberReq.Header.Set("Content-Type", "application/json")
	addMemberRes, err := http.DefaultClient.Do(addMemberReq)
	if err != nil {
		t.Fatalf("add member request failed: %v", err)
	}
	defer addMemberRes.Body.Close()
	if addMemberRes.StatusCode != http.StatusCreated {
		t.Fatalf("add member status = %d, want %d", addMemberRes.StatusCode, http.StatusCreated)
	}

	patchMemberReq, err := http.NewRequest(http.MethodPatch, server.URL+"/v1/auth/orgs/"+strconv.Itoa(int(org.ID))+"/members/"+strconv.Itoa(int(member.ID)), strings.NewReader(`{"role":"admin"}`))
	if err != nil {
		t.Fatalf("new patch member request: %v", err)
	}
	patchMemberReq.Header.Set("Authorization", "Bearer sk-admin")
	patchMemberReq.Header.Set("Content-Type", "application/json")
	patchMemberRes, err := http.DefaultClient.Do(patchMemberReq)
	if err != nil {
		t.Fatalf("patch member request failed: %v", err)
	}
	defer patchMemberRes.Body.Close()
	if patchMemberRes.StatusCode != http.StatusOK {
		t.Fatalf("patch member status = %d, want %d", patchMemberRes.StatusCode, http.StatusOK)
	}
	var updatedMember domainauth.OrganizationMember
	if err := json.NewDecoder(patchMemberRes.Body).Decode(&updatedMember); err != nil {
		t.Fatalf("decode updated member: %v", err)
	}
	if updatedMember.Role != domainauth.OrgRoleAdmin {
		t.Fatalf("updated member = %#v", updatedMember)
	}

	listMembersReq, err := http.NewRequest(http.MethodGet, server.URL+"/v1/auth/orgs/"+strconv.Itoa(int(org.ID))+"/members", nil)
	if err != nil {
		t.Fatalf("new list members request: %v", err)
	}
	listMembersReq.Header.Set("Authorization", "Bearer sk-admin")
	listMembersRes, err := http.DefaultClient.Do(listMembersReq)
	if err != nil {
		t.Fatalf("list members request failed: %v", err)
	}
	defer listMembersRes.Body.Close()
	var membersBody struct {
		Items []domainauth.OrganizationMember `json:"items"`
	}
	if err := json.NewDecoder(listMembersRes.Body).Decode(&membersBody); err != nil {
		t.Fatalf("decode members: %v", err)
	}
	if len(membersBody.Items) != 2 {
		t.Fatalf("members = %#v", membersBody.Items)
	}
}

func createHTTPUser(t *testing.T, baseURL string, username string) domainauth.UserProfile {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, baseURL+"/v1/auth/users", strings.NewReader(`{"username":"`+username+`"}`))
	if err != nil {
		t.Fatalf("new user request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer sk-admin")
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("create user request failed: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create user %q status = %d, want %d", username, res.StatusCode, http.StatusCreated)
	}
	var user domainauth.UserProfile
	if err := json.NewDecoder(res.Body).Decode(&user); err != nil {
		t.Fatalf("decode user: %v", err)
	}
	return user
}

func newDBIdentityService(t *testing.T) *identityapp.Service {
	t.Helper()
	database, err := db.Connect(db.Config{Driver: "sqlite", Path: filepath.Join(t.TempDir(), "auth.db")})
	if err != nil {
		t.Fatalf("connect sqlite: %v", err)
	}
	if err := db.RunMigrations(database); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	return identityapp.NewService(dbidentity.New(database))
}

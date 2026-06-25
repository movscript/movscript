package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestOrgAdminCreateInvitationWritesAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-admin-invitation.db", &persistencemodel.Organization{}, &persistencemodel.OrgInvitation{}, &persistencemodel.AuditLog{})
	org := persistencemodel.Organization{Name: "Team", Slug: "team", Plan: "team", Status: "active", CreatedBy: 1}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}), nil)
	router := gin.New()
	router.POST("/admin/orgs/:id/invitations", handler.CreateInvitation)

	req := httptest.NewRequest(http.MethodPost, "/admin/orgs/1/invitations", strings.NewReader(`{"role":"viewer","note":"partner"}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusCreated {
		t.Fatalf("expected invitation created, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "org.invitation.admin_created") != 1 {
		t.Fatalf("expected create invitation audit log")
	}

	invalidReq := httptest.NewRequest(http.MethodPost, "/admin/orgs/1/invitations", strings.NewReader(`{"role":"bad"}`))
	invalidReq.Header.Set("Content-Type", "application/json")
	invalidRes := httptest.NewRecorder()
	router.ServeHTTP(invalidRes, invalidReq)

	if invalidRes.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid role rejected, got %d: %s", invalidRes.Code, invalidRes.Body.String())
	}
	if countAuditAction(t, db, "org.invitation.admin_created") != 1 {
		t.Fatalf("invalid invitation should not add audit log")
	}

	suspended := persistencemodel.Organization{Name: "Suspended", Slug: "suspended-invite", Plan: "team", Status: "suspended", CreatedBy: 1}
	if err := db.Create(&suspended).Error; err != nil {
		t.Fatal(err)
	}
	suspendedReq := httptest.NewRequest(http.MethodPost, "/admin/orgs/2/invitations", strings.NewReader(`{"role":"member"}`))
	suspendedReq.Header.Set("Content-Type", "application/json")
	suspendedRes := httptest.NewRecorder()
	router.ServeHTTP(suspendedRes, suspendedReq)

	if suspendedRes.Code != http.StatusBadRequest {
		t.Fatalf("expected suspended org rejected, got %d: %s", suspendedRes.Code, suspendedRes.Body.String())
	}
	if countAuditAction(t, db, "org.invitation.admin_created") != 1 {
		t.Fatalf("suspended invitation should not add audit log")
	}
}

func TestOrgAdminRotateJoinCodeWritesAuditAndRejectsPersonalOrg(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-admin-rotate-code.db", &persistencemodel.Organization{}, &persistencemodel.AuditLog{})
	identity := newFakeAuthIdentityManager()
	owner, err := identity.CreateUser(t.Context(), authIdentityCreateUser("rotate-owner"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := identity.CreateOrg(t.Context(), authidentityCreateOrg("Team", "team", owner.ID)); err != nil {
		t.Fatal(err)
	}
	team := persistencemodel.Organization{Name: "Team", Slug: "team", JoinCode: "OLDTEAM123", Plan: "team", Status: "active", CreatedBy: 1}
	personal := persistencemodel.Organization{Name: "Personal", Slug: "personal", IsPersonal: true, Plan: "personal", Status: "active", CreatedBy: 1}
	if err := db.Create(&team).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&personal).Error; err != nil {
		t.Fatal(err)
	}

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}), identity)
	router := gin.New()
	router.POST("/admin/orgs/:id/join-code/rotate", handler.RotateJoinCode)

	req := httptest.NewRequest(http.MethodPost, "/admin/orgs/1/join-code/rotate", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected join code rotation, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "org.join_code.admin_rotated") != 1 {
		t.Fatalf("expected join code rotation audit log")
	}
	var updated persistencemodel.Organization
	if err := db.First(&updated, team.ID).Error; err != nil {
		t.Fatalf("load updated org: %v", err)
	}
	if updated.JoinCode == "" || updated.JoinCode == "OLDTEAM123" {
		t.Fatalf("join code was not rotated: %+v", updated)
	}
	assertAuditMetadataDoesNotContain(t, db, "org.join_code.admin_rotated", "OLDTEAM123")
	assertAuditMetadataDoesNotContain(t, db, "org.join_code.admin_rotated", updated.JoinCode)
	assertAuditMetadataDoesNotContain(t, db, "org.join_code.admin_rotated", "join_code")

	personalReq := httptest.NewRequest(http.MethodPost, "/admin/orgs/2/join-code/rotate", nil)
	personalRes := httptest.NewRecorder()
	router.ServeHTTP(personalRes, personalReq)
	if personalRes.Code != http.StatusConflict {
		t.Fatalf("expected personal org conflict, got %d: %s", personalRes.Code, personalRes.Body.String())
	}
	if countAuditAction(t, db, "org.join_code.admin_rotated") != 1 {
		t.Fatalf("personal org rejection should not add audit log")
	}
}

func TestOrgAdminRevokeInvitationWritesAuditAndRejectsMissing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-admin-revoke-invitation.db", &persistencemodel.Organization{}, &persistencemodel.OrgInvitation{}, &persistencemodel.AuditLog{})
	org := persistencemodel.Organization{Name: "Team", Slug: "team-revoke-invitation", Plan: "team", Status: "active", CreatedBy: 1}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	invitation := persistencemodel.OrgInvitation{OrgID: org.ID, Token: "revoke-token", Role: "member", CreatedBy: 1, ExpiresAt: time.Now().UTC().Add(time.Hour)}
	if err := db.Create(&invitation).Error; err != nil {
		t.Fatal(err)
	}

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}), nil)
	router := gin.New()
	router.DELETE("/admin/orgs/:id/invitations/:invitationId", handler.RevokeInvitation)

	res := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/admin/orgs/%d/invitations/%d", org.ID, invitation.ID), nil)
	router.ServeHTTP(res, req)
	if res.Code != http.StatusNoContent {
		t.Fatalf("expected invitation revoked, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "org.invitation.admin_revoked") != 1 {
		t.Fatalf("expected revoke invitation audit log")
	}

	missingInvitationRes := httptest.NewRecorder()
	missingInvitationReq := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/admin/orgs/%d/invitations/%d", org.ID, invitation.ID), nil)
	router.ServeHTTP(missingInvitationRes, missingInvitationReq)
	if missingInvitationRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing invitation rejected, got %d: %s", missingInvitationRes.Code, missingInvitationRes.Body.String())
	}
	if countAuditAction(t, db, "org.invitation.admin_revoked") != 1 {
		t.Fatalf("missing invitation should not add audit log")
	}

	missingOrgRes := httptest.NewRecorder()
	missingOrgReq := httptest.NewRequest(http.MethodDelete, "/admin/orgs/0/invitations/1", nil)
	router.ServeHTTP(missingOrgRes, missingOrgReq)
	if missingOrgRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing org rejected, got %d: %s", missingOrgRes.Code, missingOrgRes.Body.String())
	}
	if countAuditAction(t, db, "org.invitation.admin_revoked") != 1 {
		t.Fatalf("missing org should not add audit log")
	}
}

func TestOrgAdminDetailReturnsOperationalSummary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-admin-detail.db",
		&persistencemodel.Organization{},
		&persistencemodel.OrgInvitation{},
		&persistencemodel.Project{},
		&persistencemodel.RawResource{},
		&persistencemodel.UsageLog{},
		&persistencemodel.AuditLog{},
	)
	identity := newFakeAuthIdentityManager()
	owner, err := identity.CreateUser(t.Context(), authIdentityCreateUser("detail-owner"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := identity.CreateOrg(t.Context(), authidentityCreateOrg("Team", "team-detail", owner.ID)); err != nil {
		t.Fatal(err)
	}
	org := persistencemodel.Organization{Name: "Team", Slug: "team-detail", Plan: "team", Status: "active", CreatedBy: 1}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrgInvitation{OrgID: org.ID, Token: "detail-token", Role: "member", CreatedBy: 1, ExpiresAt: time.Now().UTC().Add(time.Hour)}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.Project{Name: "Recent", OwnerID: 1, OrgID: &org.ID}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.RawResource{Name: "Asset", OwnerID: 1, OrgID: &org.ID, Type: "image", FilePath: "asset.png"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.UsageLog{UserID: 1, OrgID: &org.ID, RuntimeModelID: 1, OperationType: "image", InputTokens: 3, OutputTokens: 4, ImageCount: 2, Cost: 1.5}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.AuditLog{OrgID: &org.ID, Action: "org.invitation.admin_created", TargetType: "org_invitation", TargetID: "1"}).Error; err != nil {
		t.Fatal(err)
	}

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}), identity)
	router := gin.New()
	router.GET("/admin/orgs/:id/detail", handler.Detail)

	res := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/admin/orgs/%d/detail", org.ID), nil)
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected org detail, got %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		Org struct {
			ID          uint  `json:"ID"`
			MemberCount int64 `json:"member_count"`
		} `json:"org"`
		ActiveInvitations int64 `json:"active_invitations"`
		ProjectCount      int64 `json:"project_count"`
		ResourceCount     int64 `json:"resource_count"`
		Projects          []struct {
			ID   uint   `json:"ID"`
			Name string `json:"name"`
		} `json:"projects"`
		Usage struct {
			Calls        int64   `json:"calls"`
			Cost         float64 `json:"cost"`
			InputTokens  int64   `json:"input_tokens"`
			OutputTokens int64   `json:"output_tokens"`
			Images       int64   `json:"images"`
		} `json:"usage"`
		Audit struct {
			Records    int64  `json:"records"`
			LastAction string `json:"last_action"`
		} `json:"audit"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode org detail: %v", err)
	}
	if body.Org.ID != org.ID || body.Org.MemberCount != 1 || body.ActiveInvitations != 1 || body.ProjectCount != 1 || body.ResourceCount != 1 {
		t.Fatalf("unexpected detail counts: %+v", body)
	}
	if len(body.Projects) != 1 || body.Projects[0].Name != "Recent" {
		t.Fatalf("unexpected projects: %+v", body.Projects)
	}
	if body.Usage.Calls != 1 || body.Usage.Cost != 1.5 || body.Usage.InputTokens != 3 || body.Usage.OutputTokens != 4 || body.Usage.Images != 2 {
		t.Fatalf("unexpected usage summary: %+v", body.Usage)
	}
	if body.Audit.Records != 1 || body.Audit.LastAction != "org.invitation.admin_created" {
		t.Fatalf("unexpected audit summary: %+v", body.Audit)
	}

	missingRes := httptest.NewRecorder()
	missingReq := httptest.NewRequest(http.MethodGet, "/admin/orgs/999/detail", nil)
	router.ServeHTTP(missingRes, missingReq)
	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing org rejected, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
}

func authIdentityCreateUser(username string) authidentity.CreateUserInput {
	status := domainidentity.UserStatusActive
	role := domainidentity.SystemRoleUser
	return authidentity.CreateUserInput{Username: username, Status: &status, SystemRole: &role}
}

func authidentityCreateOrg(name string, slug string, ownerID uint) authidentity.CreateOrgInput {
	return authidentity.CreateOrgInput{Name: name, Slug: slug, CreatedBy: ownerID}
}

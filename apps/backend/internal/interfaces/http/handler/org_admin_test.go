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
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestOrgAdminAddMemberWritesAuditAndRejectsDuplicate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-admin.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.AuditLog{})
	user := persistencemodel.User{Username: "org-member", SystemRole: "user"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	org := persistencemodel.Organization{Name: "Team", Slug: "team", Plan: "team", Status: "active", CreatedBy: user.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.POST("/admin/orgs/:id/members", handler.AddMember)

	req := httptest.NewRequest(http.MethodPost, "/admin/orgs/1/members", strings.NewReader(`{"user_id":1,"role":"admin"}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusCreated {
		t.Fatalf("expected member created, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "org.member.admin_added") != 1 {
		t.Fatalf("expected add member audit log")
	}

	duplicateReq := httptest.NewRequest(http.MethodPost, "/admin/orgs/1/members", strings.NewReader(`{"user_id":1,"role":"member"}`))
	duplicateReq.Header.Set("Content-Type", "application/json")
	duplicateRes := httptest.NewRecorder()
	router.ServeHTTP(duplicateRes, duplicateReq)

	if duplicateRes.Code != http.StatusConflict {
		t.Fatalf("expected duplicate conflict, got %d: %s", duplicateRes.Code, duplicateRes.Body.String())
	}
	if countAuditAction(t, db, "org.member.admin_added") != 1 {
		t.Fatalf("duplicate member should not add audit log")
	}

	disabledUser := persistencemodel.User{Username: "disabled-org-member", SystemRole: "user", Status: "disabled"}
	if err := db.Create(&disabledUser).Error; err != nil {
		t.Fatal(err)
	}
	disabledReq := httptest.NewRequest(http.MethodPost, "/admin/orgs/1/members", strings.NewReader(`{"user_id":2,"role":"member"}`))
	disabledReq.Header.Set("Content-Type", "application/json")
	disabledRes := httptest.NewRecorder()
	router.ServeHTTP(disabledRes, disabledReq)
	if disabledRes.Code != http.StatusBadRequest {
		t.Fatalf("expected disabled member rejected, got %d: %s", disabledRes.Code, disabledRes.Body.String())
	}
	if countAuditAction(t, db, "org.member.admin_added") != 1 {
		t.Fatalf("disabled member should not add audit log")
	}
}

func TestOrgAdminCreateWritesAuditAndRejectsDuplicateSlug(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-admin-create.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.AuditLog{})
	owner := persistencemodel.User{Username: "owner-user", SystemRole: "user"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatal(err)
	}

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.POST("/admin/orgs", handler.Create)

	req := httptest.NewRequest(http.MethodPost, "/admin/orgs", strings.NewReader(`{"name":"Admin Team","slug":"admin-team","owner_user_id":1}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusCreated {
		t.Fatalf("expected org created, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "org.admin_created") != 1 {
		t.Fatalf("expected create org audit log")
	}
	var created persistencemodel.Organization
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created org: %v", err)
	}
	if created.JoinCode == "" {
		t.Fatalf("expected created org response to include join code")
	}
	assertAuditMetadataDoesNotContain(t, db, "org.admin_created", created.JoinCode)
	assertAuditMetadataDoesNotContain(t, db, "org.admin_created", "join_code")

	duplicateReq := httptest.NewRequest(http.MethodPost, "/admin/orgs", strings.NewReader(`{"name":"Admin Team Copy","slug":"admin-team","owner_user_id":1}`))
	duplicateReq.Header.Set("Content-Type", "application/json")
	duplicateRes := httptest.NewRecorder()
	router.ServeHTTP(duplicateRes, duplicateReq)

	if duplicateRes.Code != http.StatusConflict {
		t.Fatalf("expected duplicate slug conflict, got %d: %s", duplicateRes.Code, duplicateRes.Body.String())
	}
	if countAuditAction(t, db, "org.admin_created") != 1 {
		t.Fatalf("duplicate org should not add audit log")
	}

	disabledOwner := persistencemodel.User{Username: "disabled-owner-user", SystemRole: "user", Status: "disabled"}
	if err := db.Create(&disabledOwner).Error; err != nil {
		t.Fatal(err)
	}
	disabledReq := httptest.NewRequest(http.MethodPost, "/admin/orgs", strings.NewReader(`{"name":"Disabled Owner","slug":"disabled-owner","owner_user_id":2}`))
	disabledReq.Header.Set("Content-Type", "application/json")
	disabledRes := httptest.NewRecorder()
	router.ServeHTTP(disabledRes, disabledReq)
	if disabledRes.Code != http.StatusBadRequest {
		t.Fatalf("expected disabled owner rejected, got %d: %s", disabledRes.Code, disabledRes.Body.String())
	}
	if countAuditAction(t, db, "org.admin_created") != 1 {
		t.Fatalf("disabled owner should not add audit log")
	}
}

func TestOrgAdminListFiltersByOrgID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-admin-list.db", &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{})
	target := persistencemodel.Organization{Name: "Target", Slug: "target", Plan: "team", Status: "active", CreatedBy: 1}
	other := persistencemodel.Organization{Name: "Other", Slug: "other", Plan: "team", Status: "active", CreatedBy: 2}
	if err := db.Create(&target).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&other).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrganizationMember{OrgID: target.ID, UserID: 1, Role: "owner"}).Error; err != nil {
		t.Fatal(err)
	}

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.GET("/admin/orgs", handler.List)

	res := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/admin/orgs?org_id=%d", target.ID), nil)
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected org list, got %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		Items []struct {
			ID          uint  `json:"ID"`
			MemberCount int64 `json:"member_count"`
		} `json:"items"`
		Total int64 `json:"total"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode org list: %v", err)
	}
	if body.Total != 1 || len(body.Items) != 1 || body.Items[0].ID != target.ID || body.Items[0].MemberCount != 1 {
		t.Fatalf("unexpected org list body: %+v", body)
	}

	invalidRes := httptest.NewRecorder()
	invalidReq := httptest.NewRequest(http.MethodGet, "/admin/orgs?org_id=bad", nil)
	router.ServeHTTP(invalidRes, invalidReq)
	if invalidRes.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid org_id rejected, got %d: %s", invalidRes.Code, invalidRes.Body.String())
	}
}

func TestOrgAdminCreateInvitationWritesAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-admin-invitation.db", &persistencemodel.Organization{}, &persistencemodel.OrgInvitation{}, &persistencemodel.AuditLog{})
	org := persistencemodel.Organization{Name: "Team", Slug: "team", Plan: "team", Status: "active", CreatedBy: 1}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
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
	db := testutil.OpenSQLite(t, "handler-org-admin-rotate-code.db", &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.AuditLog{})
	team := persistencemodel.Organization{Name: "Team", Slug: "team", JoinCode: "OLDTEAM123", Plan: "team", Status: "active", CreatedBy: 1}
	personal := persistencemodel.Organization{Name: "Personal", Slug: "personal", IsPersonal: true, Plan: "personal", Status: "active", CreatedBy: 1}
	if err := db.Create(&team).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&personal).Error; err != nil {
		t.Fatal(err)
	}

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
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

func TestOrgAdminUpdateMemberWritesAuditAndRejectsFailures(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-admin-update-member.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.AuditLog{})
	owner := persistencemodel.User{Username: "org-owner", SystemRole: "user"}
	memberUser := persistencemodel.User{Username: "org-update-member", SystemRole: "user"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&memberUser).Error; err != nil {
		t.Fatal(err)
	}
	org := persistencemodel.Organization{Name: "Team", Slug: "team-update-member", Plan: "team", Status: "active", CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrganizationMember{OrgID: org.ID, UserID: owner.ID, Role: "owner"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrganizationMember{OrgID: org.ID, UserID: memberUser.ID, Role: "member"}).Error; err != nil {
		t.Fatal(err)
	}

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.PATCH("/admin/orgs/:id/members/:userId", handler.UpdateMember)

	res := performJSON(router, http.MethodPatch, fmt.Sprintf("/admin/orgs/%d/members/%d", org.ID, memberUser.ID), `{"role":"admin"}`)
	if res.Code != http.StatusOK {
		t.Fatalf("expected member updated, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "org.member.admin_updated") != 1 {
		t.Fatalf("expected update member audit log")
	}

	invalidRes := performJSON(router, http.MethodPatch, fmt.Sprintf("/admin/orgs/%d/members/%d", org.ID, memberUser.ID), `{"role":"bad"}`)
	if invalidRes.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid role rejected, got %d: %s", invalidRes.Code, invalidRes.Body.String())
	}
	if countAuditAction(t, db, "org.member.admin_updated") != 1 {
		t.Fatalf("invalid member update should not add audit log")
	}

	missingRes := performJSON(router, http.MethodPatch, fmt.Sprintf("/admin/orgs/%d/members/999", org.ID), `{"role":"viewer"}`)
	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing member rejected, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
	if countAuditAction(t, db, "org.member.admin_updated") != 1 {
		t.Fatalf("missing member should not add audit log")
	}

	lastOwnerRes := performJSON(router, http.MethodPatch, fmt.Sprintf("/admin/orgs/%d/members/%d", org.ID, owner.ID), `{"role":"member"}`)
	if lastOwnerRes.Code != http.StatusConflict {
		t.Fatalf("expected last owner rejected, got %d: %s", lastOwnerRes.Code, lastOwnerRes.Body.String())
	}
	if countAuditAction(t, db, "org.member.admin_updated") != 1 {
		t.Fatalf("last owner rejection should not add audit log")
	}
}

func TestOrgAdminRemoveMemberWritesAuditAndRejectsFailures(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-admin-remove-member.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.AuditLog{})
	owner := persistencemodel.User{Username: "remove-owner", SystemRole: "user"}
	memberUser := persistencemodel.User{Username: "remove-member", SystemRole: "user"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&memberUser).Error; err != nil {
		t.Fatal(err)
	}
	org := persistencemodel.Organization{Name: "Team", Slug: "team-remove-member", Plan: "team", Status: "active", CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrganizationMember{OrgID: org.ID, UserID: owner.ID, Role: "owner"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrganizationMember{OrgID: org.ID, UserID: memberUser.ID, Role: "member"}).Error; err != nil {
		t.Fatal(err)
	}

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.DELETE("/admin/orgs/:id/members/:userId", handler.RemoveMember)

	res := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/admin/orgs/%d/members/%d", org.ID, memberUser.ID), nil)
	router.ServeHTTP(res, req)
	if res.Code != http.StatusNoContent {
		t.Fatalf("expected member removed, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "org.member.admin_removed") != 1 {
		t.Fatalf("expected remove member audit log")
	}

	missingRes := httptest.NewRecorder()
	missingReq := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/admin/orgs/%d/members/%d", org.ID, memberUser.ID), nil)
	router.ServeHTTP(missingRes, missingReq)
	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing member rejected, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
	if countAuditAction(t, db, "org.member.admin_removed") != 1 {
		t.Fatalf("missing member should not add audit log")
	}

	lastOwnerRes := httptest.NewRecorder()
	lastOwnerReq := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/admin/orgs/%d/members/%d", org.ID, owner.ID), nil)
	router.ServeHTTP(lastOwnerRes, lastOwnerReq)
	if lastOwnerRes.Code != http.StatusConflict {
		t.Fatalf("expected last owner rejected, got %d: %s", lastOwnerRes.Code, lastOwnerRes.Body.String())
	}
	if countAuditAction(t, db, "org.member.admin_removed") != 1 {
		t.Fatalf("last owner rejection should not add audit log")
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

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
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

func TestOrgAdminUpdateWritesAuditAndRejectsInvalidInput(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-admin-update.db", &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.AuditLog{})
	org := persistencemodel.Organization{Name: "Team", Slug: "team-update", Plan: "team", Status: "active", CreatedBy: 1}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.PATCH("/admin/orgs/:id", handler.Update)

	res := performJSON(router, http.MethodPatch, fmt.Sprintf("/admin/orgs/%d", org.ID), `{"name":"Updated Team","plan":"team","status":"suspended"}`)
	if res.Code != http.StatusOK {
		t.Fatalf("expected org updated, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "org.admin_updated") != 1 {
		t.Fatalf("expected update org audit log")
	}

	invalidPlanRes := performJSON(router, http.MethodPatch, fmt.Sprintf("/admin/orgs/%d", org.ID), `{"plan":"enterprise"}`)
	if invalidPlanRes.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid plan rejected, got %d: %s", invalidPlanRes.Code, invalidPlanRes.Body.String())
	}
	if countAuditAction(t, db, "org.admin_updated") != 1 {
		t.Fatalf("invalid plan should not add audit log")
	}

	noFieldsRes := performJSON(router, http.MethodPatch, fmt.Sprintf("/admin/orgs/%d", org.ID), `{}`)
	if noFieldsRes.Code != http.StatusBadRequest {
		t.Fatalf("expected no fields rejected, got %d: %s", noFieldsRes.Code, noFieldsRes.Body.String())
	}
	if countAuditAction(t, db, "org.admin_updated") != 1 {
		t.Fatalf("no fields request should not add audit log")
	}

	missingRes := performJSON(router, http.MethodPatch, "/admin/orgs/999", `{"status":"active"}`)
	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing org rejected, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
	if countAuditAction(t, db, "org.admin_updated") != 1 {
		t.Fatalf("missing org should not add audit log")
	}
}

func TestOrgAdminDetailReturnsOperationalSummary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-admin-detail.db",
		&persistencemodel.Organization{},
		&persistencemodel.OrganizationMember{},
		&persistencemodel.OrgInvitation{},
		&persistencemodel.Project{},
		&persistencemodel.RawResource{},
		&persistencemodel.UsageLog{},
		&persistencemodel.AuditLog{},
	)
	org := persistencemodel.Organization{Name: "Team", Slug: "team-detail", Plan: "team", Status: "active", CreatedBy: 1}
	if err := db.Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrganizationMember{OrgID: org.ID, UserID: 1, Role: "owner"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.OrgInvitation{OrgID: org.ID, Token: "detail-token", Role: "member", CreatedBy: 1, ExpiresAt: time.Now().UTC().Add(time.Hour)}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.Project{Name: "Recent", OwnerID: 1, OrgID: &org.ID, Status: "planning"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.RawResource{Name: "Asset", OwnerID: 1, OrgID: &org.ID, Type: "image", FilePath: "asset.png"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.UsageLog{UserID: 1, OrgID: &org.ID, AIModelConfigID: 1, OperationType: "image", InputTokens: 3, OutputTokens: 4, ImageCount: 2, Cost: 1.5}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&persistencemodel.AuditLog{OrgID: &org.ID, Action: "org.member.admin_added", TargetType: "org_member", TargetID: "1"}).Error; err != nil {
		t.Fatal(err)
	}

	handler := NewOrgAdminHandler(db.Session(&gorm.Session{SkipHooks: true}))
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
	if body.Audit.Records != 1 || body.Audit.LastAction != "org.member.admin_added" {
		t.Fatalf("unexpected audit summary: %+v", body.Audit)
	}

	missingRes := httptest.NewRecorder()
	missingReq := httptest.NewRequest(http.MethodGet, "/admin/orgs/999/detail", nil)
	router.ServeHTTP(missingRes, missingReq)
	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing org rejected, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
}

func performJSON(router http.Handler, method string, target string, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	return res
}

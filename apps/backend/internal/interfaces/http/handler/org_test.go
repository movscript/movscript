package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	tokenauth "github.com/movscript/movscript/internal/infra/auth"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestOrgMemberWritesScopedAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-member-audit.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.AuditLog{})

	owner := persistencemodel.User{Username: "org-owner", Status: domainauth.UserStatusActive}
	memberUser := persistencemodel.User{Username: "org-member", Status: domainauth.UserStatusActive}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	if err := db.Create(&memberUser).Error; err != nil {
		t.Fatalf("create member user: %v", err)
	}
	org := persistencemodel.Organization{Name: "Team", Slug: "team", Plan: domainorg.PlanTeam, Status: domainorg.StatusActive, CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	ownerMember := persistencemodel.OrganizationMember{OrgID: org.ID, UserID: owner.ID, Role: domainorg.RoleOwner}
	if err := db.Create(&ownerMember).Error; err != nil {
		t.Fatalf("create owner member: %v", err)
	}

	h := NewOrgHandler(db.Session(&gorm.Session{SkipHooks: true}))
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserKey, domainauth.UserProfile{
			ID:         owner.ID,
			Username:   owner.Username,
			SystemRole: domainauth.SystemRoleUser,
			Status:     domainauth.UserStatusActive,
		})
		c.Set(middleware.ContextOrgMemberKey, domainorg.OrganizationMember{
			ID:     ownerMember.ID,
			OrgID:  org.ID,
			UserID: owner.ID,
			Role:   ownerMember.Role,
		})
		c.Next()
	})
	router.POST("/orgs/:orgId/members", h.AddMember)
	router.DELETE("/orgs/:orgId/members/:userId", h.RemoveMember)

	addReq := httptest.NewRequest(http.MethodPost, "/orgs/"+strconv.FormatUint(uint64(org.ID), 10)+"/members", strings.NewReader(`{"user_id":`+strconv.FormatUint(uint64(memberUser.ID), 10)+`,"role":"member"}`))
	addReq.Header.Set("Content-Type", "application/json")
	addRes := httptest.NewRecorder()
	router.ServeHTTP(addRes, addReq)
	if addRes.Code != http.StatusCreated {
		t.Fatalf("expected member add, got %d: %s", addRes.Code, addRes.Body.String())
	}
	assertOrgAuditOrgID(t, db, "org.member_added", org.ID)

	removeReq := httptest.NewRequest(http.MethodDelete, "/orgs/"+strconv.FormatUint(uint64(org.ID), 10)+"/members/"+strconv.FormatUint(uint64(memberUser.ID), 10), nil)
	removeRes := httptest.NewRecorder()
	router.ServeHTTP(removeRes, removeReq)
	if removeRes.Code != http.StatusOK {
		t.Fatalf("expected member remove, got %d: %s", removeRes.Code, removeRes.Body.String())
	}
	assertOrgAuditOrgID(t, db, "org.member_removed", org.ID)

	missingReq := httptest.NewRequest(http.MethodDelete, "/orgs/"+strconv.FormatUint(uint64(org.ID), 10)+"/members/"+strconv.FormatUint(uint64(memberUser.ID), 10), nil)
	missingRes := httptest.NewRecorder()
	router.ServeHTTP(missingRes, missingReq)
	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing member delete to fail, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
	if countAuditAction(t, db, "org.member_removed") != 1 {
		t.Fatalf("missing member delete should not add remove audit log")
	}
}

func TestAcceptInvitationRegistersAndIssuesCredential(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-invite-register.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{}, &persistencemodel.OrgInvitation{}, &persistencemodel.AuthSession{})
	owner := persistencemodel.User{Username: "invite-owner", Status: domainauth.UserStatusActive}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	org := persistencemodel.Organization{Name: "Invite Team", Slug: "invite-team", Plan: domainorg.PlanTeam, Status: domainorg.StatusActive, CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	inv := persistencemodel.OrgInvitation{OrgID: org.ID, Token: "invite-register-token", Role: domainorg.RoleMember, CreatedBy: owner.ID, ExpiresAt: time.Now().Add(time.Hour)}
	if err := db.Create(&inv).Error; err != nil {
		t.Fatalf("create invitation: %v", err)
	}
	tokens, err := tokenauth.NewManager("0123456789abcdef0123456789abcdef", 3600)
	if err != nil {
		t.Fatalf("create token manager: %v", err)
	}

	h := NewOrgHandler(db, tokens)
	router := gin.New()
	router.POST("/invitations/:token/accept", h.AcceptInvitation)
	req := httptest.NewRequest(http.MethodPost, "/invitations/invite-register-token/accept", strings.NewReader(`{"username":"invite-new","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected invite accept, got %d: %s", res.Code, res.Body.String())
	}

	var body struct {
		OrgID          uint   `json:"org_id"`
		Token          string `json:"token"`
		TokenType      string `json:"token_type"`
		OrgMemberships []struct {
			OrgID uint `json:"org_id"`
		} `json:"org_memberships"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.OrgID != org.ID || body.Token == "" || body.TokenType != "Bearer" {
		t.Fatalf("credential response = %+v, want org/token", body)
	}
	foundMembership := false
	for _, membership := range body.OrgMemberships {
		if membership.OrgID == org.ID {
			foundMembership = true
		}
	}
	if !foundMembership {
		t.Fatalf("org memberships = %+v, want accepted org", body.OrgMemberships)
	}
}

func assertOrgAuditOrgID(t *testing.T, db *gorm.DB, action string, orgID uint) {
	t.Helper()
	var auditRow persistencemodel.AuditLog
	if err := db.Where("action = ?", action).First(&auditRow).Error; err != nil {
		t.Fatalf("load %s audit: %v", action, err)
	}
	if auditRow.OrgID == nil || *auditRow.OrgID != orgID {
		t.Fatalf("expected %s audit org_id %d, got %+v", action, orgID, auditRow.OrgID)
	}
}

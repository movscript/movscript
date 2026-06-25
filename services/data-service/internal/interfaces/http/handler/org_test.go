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
	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestOrgListComesFromAuthIdentityMemberships(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-list-auth-identity.db", &persistencemodel.Organization{})
	userID := uint(41)
	orgID := uint(77)
	identity := newFakeAuthIdentityManager()
	identity.users[userID] = domainidentity.UserProfile{ID: userID, Username: "workspace-user", Status: domainidentity.UserStatusActive}
	identity.orgs[orgID] = authidentity.Organization{ID: orgID, Name: "Auth Team", Slug: "auth-team", Plan: domainorg.PlanTeam, Status: domainorg.StatusActive}
	identity.members[orgID] = map[uint]authidentity.OrganizationMember{
		userID: {OrgID: orgID, UserID: userID, Role: domainorg.RoleAdmin},
	}
	h := NewOrgHandler(db, identity)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, domainidentity.UserProfile{ID: userID, Username: "workspace-user", Status: domainidentity.UserStatusActive})
		c.Next()
	})
	router.GET("/orgs", h.List)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/orgs", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("expected org list, got %d: %s", res.Code, res.Body.String())
	}
	var body []struct {
		ID         uint   `json:"ID"`
		Name       string `json:"name"`
		Slug       string `json:"slug"`
		IsPersonal bool   `json:"is_personal"`
		Plan       string `json:"plan"`
		Status     string `json:"status"`
		Role       string `json:"role"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode org list: %v", err)
	}
	if len(body) != 1 || body[0].ID != orgID || body[0].Name != "Auth Team" || body[0].Role != domainorg.RoleAdmin {
		t.Fatalf("org list body = %+v, want AuthIdentity membership", body)
	}
	if db.Migrator().HasTable("organization_members") {
		t.Fatal("org list must not require a data-service organization_members table")
	}
}

func TestOrgMemberWritesScopedAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-member-audit.db", &persistencemodel.Organization{}, &persistencemodel.AuditLog{})

	owner := newHandlerExternalUser("org-owner")
	memberUserID := owner.ID + 100
	identity := newFakeAuthIdentityManager()
	identity.users[owner.ID] = handlerUserProfile(owner)
	identity.users[memberUserID] = domainidentity.UserProfile{ID: memberUserID, Username: "org-member", Status: domainidentity.UserStatusActive}
	org := persistencemodel.Organization{Name: "Team", Slug: "team", Plan: domainorg.PlanTeam, Status: domainorg.StatusActive, CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	identity.orgs[org.ID] = authidentity.Organization{ID: org.ID, Name: org.Name, Slug: org.Slug, Plan: org.Plan, Status: org.Status, CreatedBy: org.CreatedBy}
	identity.members[org.ID] = map[uint]authidentity.OrganizationMember{
		owner.ID: {ID: 1, OrgID: org.ID, UserID: owner.ID, Role: domainorg.RoleOwner},
	}
	h := NewOrgHandler(db.Session(&gorm.Session{SkipHooks: true}), identity)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, domainidentity.UserProfile{
			ID:         owner.ID,
			Username:   owner.Username,
			SystemRole: domainidentity.SystemRoleUser,
			Status:     domainidentity.UserStatusActive,
		})
		c.Set(middleware.ContextOrgMemberKey, domainorg.OrganizationMember{
			OrgID:  org.ID,
			UserID: owner.ID,
			Role:   domainorg.RoleOwner,
		})
		c.Next()
	})
	router.POST("/orgs/:orgId/members", h.AddMember)
	router.DELETE("/orgs/:orgId/members/:userId", h.RemoveMember)

	addReq := httptest.NewRequest(http.MethodPost, "/orgs/"+strconv.FormatUint(uint64(org.ID), 10)+"/members", strings.NewReader(`{"username":"org-member","role":"member"}`))
	addReq.Header.Set("Content-Type", "application/json")
	addRes := httptest.NewRecorder()
	router.ServeHTTP(addRes, addReq)
	if addRes.Code != http.StatusCreated {
		t.Fatalf("expected member add, got %d: %s", addRes.Code, addRes.Body.String())
	}
	assertOrgAuditOrgID(t, db, "org.member_added", org.ID)
	if _, ok := identity.members[org.ID][memberUserID]; !ok {
		t.Fatalf("expected AuthIdentity member %d to be added", memberUserID)
	}

	if db.Migrator().HasTable("users") {
		t.Fatal("org member add must not require a data-service users table")
	}

	removeReq := httptest.NewRequest(http.MethodDelete, "/orgs/"+strconv.FormatUint(uint64(org.ID), 10)+"/members/"+strconv.FormatUint(uint64(memberUserID), 10), nil)
	removeRes := httptest.NewRecorder()
	router.ServeHTTP(removeRes, removeReq)
	if removeRes.Code != http.StatusOK {
		t.Fatalf("expected member remove, got %d: %s", removeRes.Code, removeRes.Body.String())
	}
	assertOrgAuditOrgID(t, db, "org.member_removed", org.ID)
	if _, ok := identity.members[org.ID][memberUserID]; ok {
		t.Fatalf("expected AuthIdentity member %d to be removed", memberUserID)
	}

	missingReq := httptest.NewRequest(http.MethodDelete, "/orgs/"+strconv.FormatUint(uint64(org.ID), 10)+"/members/"+strconv.FormatUint(uint64(memberUserID), 10), nil)
	missingRes := httptest.NewRecorder()
	router.ServeHTTP(missingRes, missingReq)
	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected missing member delete to fail, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
	if countAuditAction(t, db, "org.member_removed") != 1 {
		t.Fatalf("missing member delete should not add remove audit log")
	}
}

func TestAcceptInvitationRegistersWithoutIssuingDataServiceCredential(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-invite-register.db", &persistencemodel.Organization{}, &persistencemodel.OrgInvitation{})
	owner := newHandlerExternalUser("invite-owner")
	org := persistencemodel.Organization{Name: "Invite Team", Slug: "invite-team", Plan: domainorg.PlanTeam, Status: domainorg.StatusActive, CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	inv := persistencemodel.OrgInvitation{OrgID: org.ID, Token: "invite-register-token", Role: domainorg.RoleMember, CreatedBy: owner.ID, ExpiresAt: time.Now().Add(time.Hour)}
	if err := db.Create(&inv).Error; err != nil {
		t.Fatalf("create invitation: %v", err)
	}

	identity := newFakeAuthIdentityManager()
	identity.nextUserID = owner.ID + 10
	identity.orgs[org.ID] = authidentity.Organization{ID: org.ID, Name: org.Name, Slug: org.Slug, Plan: org.Plan, Status: org.Status, CreatedBy: org.CreatedBy}
	h := NewOrgHandler(db, identity)
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
		OrgID uint `json:"org_id"`
		User  struct {
			ID       uint   `json:"id"`
			Username string `json:"username"`
		} `json:"user"`
		Token     string `json:"token"`
		TokenType string `json:"token_type"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.OrgID != org.ID || body.User.Username != "invite-new" {
		t.Fatalf("invite response = %+v, want org/user", body)
	}
	if body.Token != "" || body.TokenType != "" {
		t.Fatalf("invite response must not include data-service credential: %+v", body)
	}
	if identity.createUserWithPasswordCalls != 1 || identity.lastCreatedPassword != "secret" {
		t.Fatalf("invite registration should use AuthIdentity CreateUserWithPassword once, got calls=%d password=%q", identity.createUserWithPasswordCalls, identity.lastCreatedPassword)
	}
	if identity.setPasswordHashCalls != 0 {
		t.Fatalf("invite registration must not call SetUserPasswordHash from Data Service, got %d calls", identity.setPasswordHashCalls)
	}
	if db.Migrator().HasTable("users") {
		t.Fatal("invite registration must not create or require a data-service users table")
	}
	if _, ok := identity.members[org.ID][body.User.ID]; !ok {
		t.Fatalf("expected AuthIdentity invitation member for auth user %d", body.User.ID)
	}
	if db.Migrator().HasTable("organization_members") {
		t.Fatal("invite registration must not create or require data-service organization_members")
	}
}

func TestOrgUsageUsernamesComeFromAuthIdentity(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-org-usage-auth-identity.db",
		&persistencemodel.Organization{},
		&persistencemodel.UsageLog{},
	)
	owner := newHandlerExternalUser("usage-owner")
	org := persistencemodel.Organization{Name: "Usage Team", Slug: "usage-team", Plan: domainorg.PlanTeam, Status: domainorg.StatusActive, CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	targetUserID := owner.ID + 99
	if err := db.Create(&persistencemodel.UsageLog{UserID: targetUserID, OrgID: &org.ID, RuntimeModelID: 1, OperationType: "text", InputTokens: 2, OutputTokens: 3, Cost: 1.5}).Error; err != nil {
		t.Fatalf("create usage log: %v", err)
	}
	identity := newFakeAuthIdentityManager()
	identity.users[targetUserID] = domainidentity.UserProfile{ID: targetUserID, Username: "usage-auth-user", Status: domainidentity.UserStatusActive}
	h := NewOrgHandler(db, identity)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, domainidentity.UserProfile{ID: owner.ID, Username: owner.Username, Status: domainidentity.UserStatusActive})
		c.Set(middleware.ContextOrgMemberKey, domainorg.OrganizationMember{OrgID: org.ID, UserID: owner.ID, Role: domainorg.RoleOwner})
		c.Next()
	})
	router.GET("/orgs/:orgId/usage", h.GetUsage)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/orgs/"+strconv.FormatUint(uint64(org.ID), 10)+"/usage", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("expected usage response, got %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		ByUser []struct {
			UserID   uint   `json:"user_id"`
			Username string `json:"username"`
			Tokens   int    `json:"tokens"`
		} `json:"by_user"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode usage response: %v", err)
	}
	if len(body.ByUser) != 1 || body.ByUser[0].UserID != targetUserID || body.ByUser[0].Username != "usage-auth-user" || body.ByUser[0].Tokens != 5 {
		t.Fatalf("usage body = %+v, want AuthIdentity username and tokens", body)
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

package handler

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	domainorg "github.com/movscript/movscript/internal/domain/org"
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

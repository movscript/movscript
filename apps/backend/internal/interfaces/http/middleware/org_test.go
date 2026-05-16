package middleware

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
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestResolveOrgMemberRejectsSuspendedWorkspace(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, user, org := newOrgMiddlewareFixture(t, domainauth.SystemRoleUser)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(ContextUserKey, domainauth.UserProfile{ID: user.ID, Username: user.Username, SystemRole: domainauth.SystemRoleUser, Status: domainauth.UserStatusActive})
		c.Next()
	})
	r.GET("/api/v1/projects", ResolveOrgMember(db), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects", nil)
	req.Header.Set("X-Org-ID", strconv.FormatUint(uint64(org.ID), 10))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d: %s", w.Code, http.StatusForbidden, w.Body.String())
	}
	if got := w.Body.String(); !strings.Contains(got, api.CodeForbidden) || !strings.Contains(got, "工作区已暂停") {
		t.Fatalf("body = %q, want suspended forbidden response", got)
	}
}

func TestResolveOrgMemberBypassesSuspendedWorkspaceForAdminSuperAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, user, org := newOrgMiddlewareFixture(t, domainauth.SystemRoleSuperAdmin)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(ContextUserKey, domainauth.UserProfile{ID: user.ID, Username: user.Username, SystemRole: domainauth.SystemRoleSuperAdmin, Status: domainauth.UserStatusActive})
		c.Next()
	})
	r.GET("/api/v1/admin/overview", ResolveOrgMember(db), func(c *gin.Context) {
		if _, ok := CurrentOrgMemberFromContext(c); ok {
			t.Fatalf("admin bypass should not bind a suspended org member")
		}
		c.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/overview", nil)
	req.Header.Set("X-Org-ID", strconv.FormatUint(uint64(org.ID), 10))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d: %s", w.Code, http.StatusNoContent, w.Body.String())
	}
}

func newOrgMiddlewareFixture(t *testing.T, systemRole string) (*gorm.DB, persistencemodel.User, persistencemodel.Organization) {
	t.Helper()
	db := testutil.OpenSQLite(t, "middleware-org.db", &persistencemodel.User{}, &persistencemodel.Organization{}, &persistencemodel.OrganizationMember{})
	user := persistencemodel.User{Username: "workspace-user", SystemRole: systemRole, Status: domainauth.UserStatusActive}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	org := persistencemodel.Organization{
		Name:      "Suspended",
		Slug:      "middleware-suspended",
		JoinCode:  "MIDORG1",
		Plan:      domainorg.PlanTeam,
		Status:    domainorg.StatusSuspended,
		CreatedBy: user.ID,
	}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	member := persistencemodel.OrganizationMember{OrgID: org.ID, UserID: user.ID, Role: domainorg.RoleOwner}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("create member: %v", err)
	}
	return db, user, org
}

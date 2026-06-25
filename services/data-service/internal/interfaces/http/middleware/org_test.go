package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"github.com/movscript/auth-service/pkg/authprovider"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	domainproject "github.com/movscript/movscript/internal/domain/project"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestResolveOrgMemberRejectsSuspendedWorkspace(t *testing.T) {
	gin.SetMode(gin.TestMode)
	_, user, org := newOrgMiddlewareFixture(t, domainidentity.SystemRoleUser)
	identity := newOrgMiddlewareIdentity(user, org, domainorg.RoleOwner)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, user.ID, user.Username, domainidentity.SystemRoleUser, domainidentity.UserStatusActive)
		c.Next()
	})
	r.GET("/api/v1/projects", ResolveOrgMember(identity), func(c *gin.Context) {
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
	_, user, org := newOrgMiddlewareFixture(t, domainidentity.SystemRoleSuperAdmin)
	identity := newOrgMiddlewareIdentity(user, org, domainorg.RoleOwner)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, user.ID, user.Username, domainidentity.SystemRoleSuperAdmin, domainidentity.UserStatusActive)
		c.Next()
	})
	r.GET("/api/v1/admin/overview", ResolveOrgMember(identity), func(c *gin.Context) {
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

func TestRequireProjectRoleRejectsViewerAndAllowsOwner(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "middleware-project-role.db", &persistencemodel.Project{}, &persistencemodel.ProjectMember{})
	owner := testutil.NewExternalUser(201, "project-owner")
	viewer := testutil.NewExternalUser(202, "project-viewer")
	project := persistencemodel.Project{Name: "Role Test", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&persistencemodel.ProjectMember{ProjectID: project.ID, UserID: owner.ID, Role: domainproject.RoleOwner}).Error; err != nil {
		t.Fatalf("create owner member: %v", err)
	}
	if err := db.Create(&persistencemodel.ProjectMember{ProjectID: project.ID, UserID: viewer.ID, Role: domainproject.RoleViewer}).Error; err != nil {
		t.Fatalf("create viewer member: %v", err)
	}

	r := gin.New()
	r.Use(func(c *gin.Context) {
		userID := viewer.ID
		if c.GetHeader("X-Test-User") == "owner" {
			userID = owner.ID
		}
		setTestAuthContextUser(c, userID, "test-user", domainidentity.SystemRoleUser, domainidentity.UserStatusActive)
		c.Next()
	})
	r.POST("/projects/:id/members", RequireProjectRole(db, domainproject.RoleOwner), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	viewerReq := httptest.NewRequest(http.MethodPost, "/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members", nil)
	viewerRes := httptest.NewRecorder()
	r.ServeHTTP(viewerRes, viewerReq)
	if viewerRes.Code != http.StatusForbidden {
		t.Fatalf("viewer status = %d, want %d: %s", viewerRes.Code, http.StatusForbidden, viewerRes.Body.String())
	}

	ownerReq := httptest.NewRequest(http.MethodPost, "/projects/"+strconv.FormatUint(uint64(project.ID), 10)+"/members", nil)
	ownerReq.Header.Set("X-Test-User", "owner")
	ownerRes := httptest.NewRecorder()
	r.ServeHTTP(ownerRes, ownerReq)
	if ownerRes.Code != http.StatusNoContent {
		t.Fatalf("owner status = %d, want %d: %s", ownerRes.Code, http.StatusNoContent, ownerRes.Body.String())
	}
}

func newOrgMiddlewareFixture(t *testing.T, systemRole string) (*gorm.DB, testutil.ExternalUser, persistencemodel.Organization) {
	t.Helper()
	db := testutil.OpenSQLite(t, "middleware-org.db", &persistencemodel.Organization{})
	user := testutil.NewExternalUser(301, "workspace-user")
	user.SystemRole = systemRole
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
	return db, user, org
}

type orgMiddlewareIdentity struct {
	user       testutil.ExternalUser
	membership authidentity.OrgMembership
}

func newOrgMiddlewareIdentity(user testutil.ExternalUser, org persistencemodel.Organization, role string) *orgMiddlewareIdentity {
	return &orgMiddlewareIdentity{
		user: user,
		membership: authidentity.OrgMembership{
			OrgID:      org.ID,
			OrgName:    org.Name,
			OrgSlug:    org.Slug,
			IsPersonal: org.IsPersonal,
			Plan:       org.Plan,
			Status:     org.Status,
			Role:       role,
		},
	}
}

func (i *orgMiddlewareIdentity) UserProfile(ctx context.Context, userID uint) (domainidentity.UserProfile, error) {
	if userID != i.user.ID {
		return domainidentity.UserProfile{}, authidentity.ErrUserNotFound
	}
	return domainidentity.UserProfile{ID: i.user.ID, Username: i.user.Username, SystemRole: i.user.SystemRole, Status: i.user.Status}, nil
}

func (i *orgMiddlewareIdentity) OrgMemberships(ctx context.Context, userID uint) ([]authidentity.OrgMembership, error) {
	if userID != i.user.ID {
		return nil, authidentity.ErrUserNotFound
	}
	return []authidentity.OrgMembership{i.membership}, nil
}

func setTestAuthContextUser(c *gin.Context, userID uint, username string, systemRole string, status string) {
	c.Set(ContextAuthContextKey, authprovider.AuthContext{
		Authenticated: true,
		Mode:          authprovider.ModeOpaqueKey,
		Principal: authprovider.Principal{
			Kind:    authprovider.PrincipalCloudUser,
			Subject: "user_" + strconv.FormatUint(uint64(userID), 10),
		},
		Claims: map[string]string{
			"user_id":     strconv.FormatUint(uint64(userID), 10),
			"username":    username,
			"system_role": systemRole,
			"status":      status,
		},
	})
}

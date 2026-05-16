package middleware

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	orgapp "github.com/movscript/movscript/internal/app/org"
	projectapp "github.com/movscript/movscript/internal/app/project"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

const ContextOrgMemberKey = "currentOrgMember"

// ResolveOrgMember selects the current workspace membership for the authenticated user.
// It prefers X-Org-ID when provided, otherwise falls back to the personal org,
// then any other org membership if no personal org exists.
func ResolveOrgMember(db *gorm.DB) gin.HandlerFunc {
	orgService := orgapp.NewService(db)
	return func(c *gin.Context) {
		user, ok := CurrentUserFromContext(c)
		if !ok {
			c.Next()
			return
		}
		if user.SystemRole == domainauth.SystemRoleSuperAdmin && isAdminAPIPath(c.Request.URL.Path) {
			c.Next()
			return
		}

		var preferredOrgID *uint
		if raw := strings.TrimSpace(c.GetHeader("X-Org-ID")); raw != "" {
			parsed, err := strconv.ParseUint(raw, 10, 64)
			if err != nil || parsed == 0 {
				c.AbortWithStatusJSON(http.StatusBadRequest, api.InvalidInput("无效的组织 ID"))
				return
			}
			orgID := uint(parsed)
			preferredOrgID = &orgID
		}

		member, found, err := orgService.ResolveCurrentMember(c.Request.Context(), user.ID, preferredOrgID)
		if err == orgapp.ErrForbidden {
			c.AbortWithStatusJSON(http.StatusForbidden, api.Forbidden("你没有权限访问该工作区"))
			return
		}
		if errors.Is(err, orgapp.ErrSuspended) {
			c.AbortWithStatusJSON(http.StatusForbidden, api.Forbidden("工作区已暂停"))
			return
		}
		if err != nil || !found {
			c.Next()
			return
		}
		c.Set(ContextOrgMemberKey, member)
		c.Next()
	}
}

func isAdminAPIPath(path string) bool {
	return path == "/api/v1/admin" || strings.HasPrefix(path, "/api/v1/admin/")
}

// RequireProjectInCurrentOrg aborts when :id does not belong to the current workspace.
// It is intended for /projects/:id and nested project routes.
func RequireProjectInCurrentOrg(db *gorm.DB) gin.HandlerFunc {
	projectService := projectapp.NewService(db)
	return func(c *gin.Context) {
		member, ok := CurrentOrgMemberFromContext(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, api.Forbidden("无工作区信息"))
			return
		}

		projectID, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil || projectID == 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, api.InvalidInput("无效的项目 ID"))
			return
		}

		belongs, err := projectService.BelongsToOrg(c.Request.Context(), uint(projectID), member.OrgID)
		if err == projectapp.ErrProjectNotFound {
			c.AbortWithStatusJSON(http.StatusNotFound, api.NotFound("项目不存在"))
			return
		}
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, api.Internal("项目校验失败"))
			return
		}
		if !belongs {
			c.AbortWithStatusJSON(http.StatusForbidden, api.ForbiddenProject("项目不属于当前工作区"))
			return
		}
		c.Next()
	}
}

// InjectOrgMember loads the OrganizationMember for the current user + :orgId path param.
// Sets ContextOrgMemberKey in gin context. Aborts with 403 if user is not a member.
func InjectOrgMember(db *gorm.DB) gin.HandlerFunc {
	orgService := orgapp.NewService(db)
	return func(c *gin.Context) {
		user, ok := CurrentUserFromContext(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, api.AuthRequired())
			return
		}

		orgIDStr := c.Param("orgId")
		orgID, err := strconv.ParseUint(orgIDStr, 10, 64)
		if err != nil || orgID == 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, api.InvalidInput("无效的组织 ID"))
			return
		}

		member, err := orgService.GetMemberForUser(c.Request.Context(), uint(orgID), user.ID)
		if err != nil {
			if errors.Is(err, orgapp.ErrSuspended) {
				c.AbortWithStatusJSON(http.StatusForbidden, api.Forbidden("工作区已暂停"))
				return
			}
			c.AbortWithStatusJSON(http.StatusForbidden, api.Forbidden("你不是该组织的成员"))
			return
		}

		c.Set(ContextOrgMemberKey, member)
		c.Next()
	}
}

// RequireOrgRole aborts with 403 if the injected org member doesn't have one of the given roles.
// Must be used after InjectOrgMember.
func RequireOrgRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		member, ok := CurrentOrgMemberFromContext(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, api.Forbidden("无组织成员信息"))
			return
		}
		for _, r := range roles {
			if member.Role == r {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, api.Forbidden("权限不足"))
	}
}

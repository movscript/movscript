package middleware

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	orgapp "github.com/movscript/movscript/internal/app/org"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	"gorm.io/gorm"
)

const ContextOrgMemberKey = "currentOrgMember"

// ResolveOrgMember selects the current workspace membership for the authenticated user.
// It prefers X-Org-ID when provided, otherwise falls back to the personal org,
// then any other org membership if no personal org exists.
func ResolveOrgMember(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		u, ok := c.Get(ContextUserKey)
		if !ok {
			c.Next()
			return
		}
		user := u.(*model.User)

		var members []model.OrganizationMember
		if err := db.Where("user_id = ?", user.ID).Find(&members).Error; err != nil || len(members) == 0 {
			_ = orgapp.CreatePersonalOrg(db.WithContext(c.Request.Context()), user)
			if err := db.Where("user_id = ?", user.ID).Find(&members).Error; err != nil || len(members) == 0 {
				c.Next()
				return
			}
		}

		selected := members[0]
		if raw := strings.TrimSpace(c.GetHeader("X-Org-ID")); raw != "" {
			orgID, err := strconv.ParseUint(raw, 10, 64)
			if err != nil || orgID == 0 {
				c.AbortWithStatusJSON(http.StatusBadRequest, apierr.InvalidInput("无效的组织 ID"))
				return
			}
			for _, member := range members {
				if member.OrgID == uint(orgID) {
					selected = member
					c.Set(ContextOrgMemberKey, &selected)
					c.Next()
					return
				}
			}
			c.AbortWithStatusJSON(http.StatusForbidden, apierr.Forbidden("你没有权限访问该工作区"))
			return
		}

		for _, member := range members {
			var org model.Organization
			if err := db.Select("id, is_personal").First(&org, member.OrgID).Error; err == nil && org.IsPersonal {
				selected = member
				c.Set(ContextOrgMemberKey, &selected)
				c.Next()
				return
			}
		}

		c.Set(ContextOrgMemberKey, &selected)
		c.Next()
	}
}

// InjectOrgMember loads the OrganizationMember for the current user + :orgId path param.
// Sets ContextOrgMemberKey in gin context. Aborts with 403 if user is not a member.
func InjectOrgMember(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		u, ok := c.Get(ContextUserKey)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, apierr.AuthRequired())
			return
		}
		user := u.(*model.User)

		orgIDStr := c.Param("orgId")
		orgID, err := strconv.ParseUint(orgIDStr, 10, 64)
		if err != nil || orgID == 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, apierr.InvalidInput("无效的组织 ID"))
			return
		}

		var member model.OrganizationMember
		if err := db.Where("org_id = ? AND user_id = ?", orgID, user.ID).First(&member).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, apierr.Forbidden("你不是该组织的成员"))
			return
		}

		c.Set(ContextOrgMemberKey, &member)
		c.Next()
	}
}

// RequireOrgRole aborts with 403 if the injected org member doesn't have one of the given roles.
// Must be used after InjectOrgMember.
func RequireOrgRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		m, ok := c.Get(ContextOrgMemberKey)
		if !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, apierr.Forbidden("无组织成员信息"))
			return
		}
		member := m.(*model.OrganizationMember)
		for _, r := range roles {
			if member.Role == r {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, apierr.Forbidden("权限不足"))
	}
}

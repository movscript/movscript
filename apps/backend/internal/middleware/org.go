package middleware

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

const ContextOrgMemberKey = "currentOrgMember"

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

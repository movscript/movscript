package middleware

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

const ContextUserKey = "currentUser"

// Identity reads X-User-ID header (or ?uid= query param fallback) and loads the user into gin context.
func Identity(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		idStr := c.GetHeader("X-User-ID")
		if idStr == "" {
			idStr = c.Query("uid") // fallback for native browser elements (<video>, <img>)
		}
		if idStr != "" {
			id, err := strconv.ParseUint(idStr, 10, 64)
			if err == nil {
				var user model.User
				if db.First(&user, id).Error == nil {
					c.Set(ContextUserKey, &user)
				}
			}
		}
		c.Next()
	}
}

// RequireSystemRole aborts with 403 if the current user doesn't have one of the given system roles.
func RequireSystemRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		u, ok := c.Get(ContextUserKey)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, apierr.AuthRequired())
			return
		}
		user := u.(*model.User)
		for _, r := range roles {
			if user.SystemRole == r {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, apierr.Forbidden("权限不足"))
	}
}

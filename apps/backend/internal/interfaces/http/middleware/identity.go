package middleware

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	authapp "github.com/movscript/movscript/internal/app/auth"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/auth"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	"gorm.io/gorm"
)

const ContextUserKey = "currentUser"
const SessionCookieName = "movscript_session"

// Identity reads a self-hosted session cookie or signed Bearer token and loads the user into gin context.
func Identity(db *gorm.DB, tokens *auth.Manager) gin.HandlerFunc {
	authService := authapp.NewService(db)
	return func(c *gin.Context) {
		raw, ok := auth.BearerToken(c.GetHeader("Authorization"))
		if !ok {
			if session, err := c.Cookie(SessionCookieName); err == nil && session != "" {
				if user, err := authService.UserForSession(c.Request.Context(), session); err == nil {
					c.Set(ContextUserKey, &user)
				}
			}
			c.Next()
			return
		}
		if !auth.LooksSigned(raw) {
			c.Next()
			return
		}

		claims, err := tokens.Verify(raw)
		if err != nil {
			status := http.StatusUnauthorized
			msg := "登录凭证无效"
			if errors.Is(err, auth.ErrExpiredToken) {
				msg = "登录已过期，请重新登录"
			}
			c.AbortWithStatusJSON(status, apierr.Response{Code: apierr.CodeAuthRequired, Message: msg, Action: apierr.ActionLogout})
			return
		}

		var user model.User
		if db.First(&user, claims.UserID).Error == nil {
			c.Set(ContextUserKey, &user)
		}
		c.Next()
	}
}

// RequireAuth aborts with 401 if the request has no authenticated principal.
func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := c.Get(ContextUserKey); !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, apierr.AuthRequired())
			return
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

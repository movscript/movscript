package middleware

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	authapp "github.com/movscript/movscript/internal/app/auth"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/infra/auth"
	"github.com/movscript/movscript/internal/interfaces/http/api"
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
				if profile, err := authService.UserForSession(c.Request.Context(), session); err == nil {
					c.Set(ContextUserKey, profile)
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
			c.AbortWithStatusJSON(status, api.Response{Code: api.CodeAuthRequired, Message: msg, Action: api.ActionLogout})
			return
		}

		if profile, err := authService.CurrentUser(c.Request.Context(), claims.UserID); err == nil {
			c.Set(ContextUserKey, profile)
		}
		c.Next()
	}
}

// RequireAuth aborts with 401 if the request has no authenticated principal.
func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := CurrentUserProfileFromContext(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, api.AuthRequired())
			return
		}
		if user.Status != "" && user.Status != domainauth.UserStatusActive {
			c.AbortWithStatusJSON(http.StatusForbidden, api.Response{Code: api.CodeForbidden, Message: "账号已被禁用或暂停", Action: api.ActionLogout})
			return
		}
		c.Next()
	}
}

// RequireSystemRole aborts with 403 if the current user doesn't have one of the given system roles.
func RequireSystemRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := CurrentUserFromContext(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, api.AuthRequired())
			return
		}
		for _, r := range roles {
			if user.SystemRole == r {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, api.Forbidden("权限不足"))
	}
}

package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"github.com/movscript/auth-service/pkg/authprovider"
	"github.com/movscript/movscript/internal/interfaces/http/api"
)

const ContextAuthContextKey = "authContext"
const ContextPreferredOrgIDKey = "preferredOrgID"
const SessionCookieName = "movscript_session"
const GitProxyTokenQueryParam = "git_token"

// Identity authenticates requests through the configured AuthProvider.
func Identity(provider authprovider.Provider) gin.HandlerFunc {
	return IdentityWithAuthProvider(provider)
}

// IdentityWithAuthProvider resolves opaque sk-* keys into AuthContext.
func IdentityWithAuthProvider(provider authprovider.Provider) gin.HandlerFunc {
	return func(c *gin.Context) {
		if provider != nil && provider.Mode() == authprovider.ModeLocalOwner {
			if context, err := provider.Authenticate(c.Request.Context(), authprovider.Request{}); err == nil && context.Authenticated {
				c.Set(ContextAuthContextKey, context)
			}
			c.Next()
			return
		}
		raw, ok := bearerToken(c.GetHeader("Authorization"))
		if ok && provider != nil && strings.HasPrefix(raw, "sk-") {
			if context, err := provider.Authenticate(c.Request.Context(), authprovider.Request{Token: raw}); err == nil && context.Authenticated {
				c.Set(ContextAuthContextKey, context)
			}
		}
		c.Next()
	}
}

func bearerToken(header string) (string, bool) {
	header = strings.TrimSpace(header)
	if len(header) < len("Bearer ")+1 || !strings.EqualFold(header[:len("Bearer ")], "Bearer ") {
		return "", false
	}
	token := strings.TrimSpace(header[len("Bearer "):])
	return token, token != ""
}

// RequireAuth aborts with 401 if the request has no authenticated principal.
func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := CurrentUserProfileFromContext(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, api.AuthRequired())
			return
		}
		if user.Status != "" && user.Status != domainidentity.UserStatusActive {
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

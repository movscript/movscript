package middleware

import (
	"crypto/subtle"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	authapp "github.com/movscript/movscript/internal/app/auth"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/infra/auth"
	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

const ContextUserKey = "currentUser"
const ContextPreferredOrgIDKey = "preferredOrgID"
const SessionCookieName = "movscript_session"
const GitProxyTokenQueryParam = "git_token"
const AccessTokenQueryParam = "access_token"

// Identity reads a self-hosted session cookie, signed Bearer token, or Git BasicAuth token and loads the user into gin context.
func Identity(db *gorm.DB, tokens *auth.Manager, encryptionKey ...[]byte) gin.HandlerFunc {
	authService := authapp.NewService(db)
	var gitCredentialKey []byte
	if len(encryptionKey) > 0 {
		gitCredentialKey = encryptionKey[0]
	}
	return func(c *gin.Context) {
		if isGitProxyRequest(c.Request) && len(gitCredentialKey) > 0 {
			if profile, ok := gitBasicAuthUser(c.Request, db, authService, gitCredentialKey); ok {
				c.Set(ContextUserKey, profile)
				c.Next()
				return
			}
		}
		if isGitProxyRequest(c.Request) && tokens != nil {
			if handled := identityFromGitProxyToken(c, db, authService, tokens); handled {
				return
			}
		}
		raw, ok := auth.BearerToken(c.GetHeader("Authorization"))
		if !ok {
			raw = strings.TrimSpace(c.Query(AccessTokenQueryParam))
			ok = raw != ""
		}
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

func identityFromGitProxyToken(c *gin.Context, db *gorm.DB, authService *authapp.Service, tokens *auth.Manager) bool {
	raw := strings.TrimSpace(c.Query(GitProxyTokenQueryParam))
	if raw == "" {
		return false
	}
	claims, err := tokens.Verify(raw)
	if err != nil {
		status := http.StatusUnauthorized
		msg := "Git clone 凭证无效"
		if errors.Is(err, auth.ErrExpiredToken) {
			msg = "Git clone 凭证已过期"
		}
		c.AbortWithStatusJSON(status, api.Response{Code: api.CodeAuthRequired, Message: msg})
		return true
	}
	if claims.Purpose != auth.GitProxyTokenPurpose || claims.ProjectID == 0 {
		c.AbortWithStatusJSON(http.StatusUnauthorized, api.Response{Code: api.CodeAuthRequired, Message: "Git clone 凭证无效"})
		return true
	}
	if projectIDFromGitProxyPath(c.Request.URL.Path) != claims.ProjectID {
		c.AbortWithStatusJSON(http.StatusForbidden, api.Forbidden("Git clone 凭证不匹配当前项目"))
		return true
	}
	profile, err := authService.CurrentUser(c.Request.Context(), claims.UserID)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, api.AuthRequired())
		return true
	}
	c.Set(ContextUserKey, profile)
	if claims.OrgID != 0 {
		c.Set(ContextPreferredOrgIDKey, claims.OrgID)
	}
	c.Next()
	return true
}

func projectIDFromGitProxyPath(path string) uint {
	path = strings.TrimSpace(path)
	const prefix = "/api/v1/projects/"
	if !strings.HasPrefix(path, prefix) {
		return 0
	}
	rest := strings.TrimPrefix(path, prefix)
	segment, _, _ := strings.Cut(rest, "/")
	id, err := strconv.ParseUint(segment, 10, 64)
	if err != nil {
		return 0
	}
	return uint(id)
}

func isGitProxyRequest(req *http.Request) bool {
	return req != nil && strings.Contains(req.URL.Path, "/git/")
}

func gitBasicAuthUser(req *http.Request, db *gorm.DB, authService *authapp.Service, encryptionKey []byte) (domainauth.UserProfile, bool) {
	username, secret, ok := req.BasicAuth()
	if !ok || strings.TrimSpace(username) == "" || secret == "" {
		return domainauth.UserProfile{}, false
	}
	var credential persistencemodel.UserGitCredential
	if err := db.WithContext(req.Context()).Where("provider = ? AND username = ? AND status = ?", "gitea", strings.TrimSpace(username), "active").First(&credential).Error; err != nil {
		return domainauth.UserProfile{}, false
	}
	token, err := crypto.Decrypt(credential.EncryptedToken, encryptionKey)
	if err != nil || subtle.ConstantTimeCompare([]byte(token), []byte(secret)) != 1 {
		return domainauth.UserProfile{}, false
	}
	profile, err := authService.CurrentUser(req.Context(), credential.UserID)
	if err != nil {
		return domainauth.UserProfile{}, false
	}
	return profile, true
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

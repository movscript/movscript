package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"github.com/movscript/auth-service/pkg/authprovider"
	"github.com/movscript/movscript/internal/interfaces/http/api"
)

type fakeAuthProvider struct {
	context authprovider.AuthContext
}

func (p fakeAuthProvider) Mode() authprovider.Mode {
	return p.context.Mode
}

func (p fakeAuthProvider) Authenticate(_ context.Context, request authprovider.Request) (authprovider.AuthContext, error) {
	if request.Token == "sk-test" {
		return p.context, nil
	}
	return authprovider.InactiveContext(p.context.Mode, "missing-token"), nil
}

func (p fakeAuthProvider) Authorize(_ context.Context, context authprovider.AuthContext, _ string, _ *authprovider.Resource) (authprovider.Decision, error) {
	return authprovider.AllowIfAuthenticated(context), nil
}

func TestRequireAuthRejectsForgedHeaderIdentity(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Identity(nil))
	r.GET("/protected", RequireAuth(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	for name, headers := range map[string]map[string]string{
		"x-user-id":      {"X-User-ID": "1"},
		"uid-query":      {},
		"bearer-user-id": {"Authorization": "Bearer user_1"},
		"numeric-bearer": {"Authorization": "Bearer 1"},
	} {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/protected", nil)
			if name == "uid-query" {
				req = httptest.NewRequest(http.MethodGet, "/protected?uid=1", nil)
			}
			for key, value := range headers {
				req.Header.Set(key, value)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", w.Code, http.StatusUnauthorized)
			}
		})
	}
}

func TestIdentityWithAuthProviderWritesOpaqueAuthContext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	provider := fakeAuthProvider{context: authprovider.AuthContext{
		Authenticated: true,
		Mode:          authprovider.ModeOpaqueKey,
		Principal: authprovider.Principal{
			Kind:    authprovider.PrincipalAgent,
			Subject: "agent_1",
		},
		Scopes: []string{"project:read"},
		Claims: map[string]string{"source": "auth-service"},
	}}
	r.Use(IdentityWithAuthProvider(provider))
	r.GET("/auth-context", func(c *gin.Context) {
		context, ok := CurrentAuthContextFromContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing auth context"})
			return
		}
		if _, ok := CurrentUserProfileFromContext(c); ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "opaque auth context should not forge current user"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"mode":      context.Mode,
			"principal": context.Principal.Subject,
			"scope":     context.Scopes[0],
		})
	})

	req := httptest.NewRequest(http.MethodGet, "/auth-context", nil)
	req.Header.Set("Authorization", "Bearer sk-test")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", w.Code, http.StatusOK, w.Body.String())
	}
	if got := w.Body.String(); !strings.Contains(got, `"principal":"agent_1"`) || !strings.Contains(got, `"scope":"project:read"`) {
		t.Fatalf("body = %q", got)
	}
}

func TestIdentityWithAuthProviderDerivesUserClaimsForProtectedRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	provider := fakeAuthProvider{context: authprovider.AuthContext{
		Authenticated: true,
		Mode:          authprovider.ModeOpaqueKey,
		Principal: authprovider.Principal{
			Kind:    authprovider.PrincipalCloudUser,
			Subject: "user_7",
		},
		Claims: map[string]string{
			"user_id":     "7",
			"username":    "cloud-user",
			"system_role": domainidentity.SystemRoleUser,
			"status":      domainidentity.UserStatusActive,
		},
	}}
	r.Use(IdentityWithAuthProvider(provider))
	r.GET("/protected", RequireAuth(), func(c *gin.Context) {
		user, ok := CurrentUserProfileFromContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing auth context user"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"id":       user.ID,
			"username": user.Username,
		})
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer sk-test")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", w.Code, http.StatusOK, w.Body.String())
	}
	if got := w.Body.String(); !strings.Contains(got, `"id":7`) || !strings.Contains(got, `"username":"cloud-user"`) {
		t.Fatalf("body = %q", got)
	}
}

func TestIdentityWithLocalOwnerProviderDoesNotRequireBearerToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	provider := authprovider.NewLocalOwnerProvider(authprovider.LocalOwnerOptions{
		Subject: "local-owner",
		Claims: map[string]string{
			"user_id":     "1",
			"username":    "local-owner",
			"system_role": domainidentity.SystemRoleUser,
			"status":      domainidentity.UserStatusActive,
		},
	})
	r.Use(IdentityWithAuthProvider(provider))
	r.GET("/protected", RequireAuth(), func(c *gin.Context) {
		user, ok := CurrentUserProfileFromContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing auth context user"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"id":       user.ID,
			"username": user.Username,
		})
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/protected", nil))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", w.Code, http.StatusOK, w.Body.String())
	}
	if got := w.Body.String(); !strings.Contains(got, `"id":1`) || !strings.Contains(got, `"username":"local-owner"`) {
		t.Fatalf("body = %q", got)
	}
}

func TestRequireAuthRejectsOpaqueAuthContextWithoutUserClaims(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	provider := fakeAuthProvider{context: authprovider.AuthContext{
		Authenticated: true,
		Mode:          authprovider.ModeOpaqueKey,
		Principal: authprovider.Principal{
			Kind:    authprovider.PrincipalAgent,
			Subject: "agent_1",
		},
		Claims: map[string]string{"scope": "project:read"},
	}}
	r.Use(IdentityWithAuthProvider(provider))
	r.GET("/protected", RequireAuth(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer sk-test")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestRequireAuthRejectsNonActiveUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(ContextAuthContextKey, authprovider.AuthContext{
			Authenticated: true,
			Mode:          authprovider.ModeOpaqueKey,
			Principal: authprovider.Principal{
				Kind:    authprovider.PrincipalCloudUser,
				Subject: "user_1",
			},
			Claims: map[string]string{
				"user_id":     "1",
				"username":    "disabled",
				"system_role": domainidentity.SystemRoleUser,
				"status":      "disabled",
			},
		})
		c.Next()
	})
	r.GET("/protected", RequireAuth(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/protected", nil))

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusForbidden)
	}
	if got := w.Body.String(); got == "" || !strings.Contains(got, api.CodeForbidden) {
		t.Fatalf("body = %q, want forbidden code", got)
	}
	if got := w.Body.String(); !strings.Contains(got, api.ActionLogout) {
		t.Fatalf("body = %q, want logout action", got)
	}
}

func TestIdentityRejectsLegacyGitBasicAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Identity(nil))
	r.GET("/api/v1/projects/:id/git/*gitPath", RequireAuth(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	gitReq := httptest.NewRequest(http.MethodGet, "/api/v1/projects/1/git/repo.git/info/refs", nil)
	gitReq.SetBasicAuth("movscript-user-1", "gitea-token")
	gitRes := httptest.NewRecorder()
	r.ServeHTTP(gitRes, gitReq)
	if gitRes.Code != http.StatusUnauthorized {
		t.Fatalf("git status = %d, want %d: %s", gitRes.Code, http.StatusUnauthorized, gitRes.Body.String())
	}
}

func TestIdentityRejectsLegacyGitProxyQueryToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Identity(nil))
	r.GET("/api/v1/projects/:id/git/*gitPath", RequireAuth(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects/7/git/repo.git/info/refs?git_token=legacy-token", nil)
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d: %s", res.Code, http.StatusUnauthorized, res.Body.String())
	}
}

func TestRequireSystemRoleRejectsUnauthenticatedAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/admin", RequireSystemRole("super_admin"), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("X-User-ID", "1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
	if got := w.Body.String(); got == "" || !strings.Contains(got, api.CodeAuthRequired) {
		t.Fatalf("body = %q, want auth required code", got)
	}
}

package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/infra/auth"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	"gorm.io/gorm"
)

func TestRequireAuthRejectsForgedHeaderIdentity(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	tokens, err := auth.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	r.Use(Identity(&gorm.DB{}, tokens))
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

func TestRequireAuthRejectsNonActiveUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(ContextUserKey, domainauth.UserProfile{ID: 1, Username: "disabled", SystemRole: domainauth.SystemRoleUser, Status: "disabled"})
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
	if got := w.Body.String(); got == "" || !strings.Contains(got, apierr.CodeForbidden) {
		t.Fatalf("body = %q, want forbidden code", got)
	}
	if got := w.Body.String(); !strings.Contains(got, apierr.ActionLogout) {
		t.Fatalf("body = %q, want logout action", got)
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
	if got := w.Body.String(); got == "" || !strings.Contains(got, apierr.CodeAuthRequired) {
		t.Fatalf("body = %q, want auth required code", got)
	}
}

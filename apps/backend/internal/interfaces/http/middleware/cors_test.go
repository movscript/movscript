package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAppendMissingOriginKeepsElectronAdminOriginWithExplicitOrigins(t *testing.T) {
	origins := appendMissingOrigin([]string{"https://api.example.com"}, electronAdminOrigin)
	if len(origins) != 2 {
		t.Fatalf("origins length = %d, want 2", len(origins))
	}
	if origins[0] != "https://api.example.com" || origins[1] != electronAdminOrigin {
		t.Fatalf("origins = %#v", origins)
	}
}

func TestAppendMissingOriginDoesNotDuplicateElectronAdminOrigin(t *testing.T) {
	origins := appendMissingOrigin([]string{electronAdminOrigin}, electronAdminOrigin)
	if len(origins) != 1 || origins[0] != electronAdminOrigin {
		t.Fatalf("origins = %#v", origins)
	}
}

func TestCORSAllowsPackagedDesktopFileOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CORS(nil))
	r.GET("/ws", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Origin", "file://")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d; body = %q", w.Code, http.StatusNoContent, w.Body.String())
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "file://" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want file://", got)
	}
}

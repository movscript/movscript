package router

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRegisterAdminStaticRoutesServesAdminAppAndFallbacks(t *testing.T) {
	gin.SetMode(gin.TestMode)
	adminDir := t.TempDir()
	mustWriteFile(t, filepath.Join(adminDir, "index.html"), "<html>admin shell</html>")
	mustWriteFile(t, filepath.Join(adminDir, "assets", "app.js"), "console.log('admin')")

	r := gin.New()
	registerAdminStaticRoutes(r, adminDir)

	redirect := httptest.NewRecorder()
	r.ServeHTTP(redirect, httptest.NewRequest(http.MethodGet, "/admin", nil))
	if redirect.Code != http.StatusMovedPermanently {
		t.Fatalf("/admin status = %d, want %d", redirect.Code, http.StatusMovedPermanently)
	}
	if location := redirect.Header().Get("Location"); location != "/admin/" {
		t.Fatalf("/admin Location = %q, want /admin/", location)
	}

	index := httptest.NewRecorder()
	r.ServeHTTP(index, httptest.NewRequest(http.MethodGet, "/admin/", nil))
	if index.Code != http.StatusOK || index.Body.String() != "<html>admin shell</html>" {
		t.Fatalf("/admin/ response = %d %q", index.Code, index.Body.String())
	}

	asset := httptest.NewRecorder()
	r.ServeHTTP(asset, httptest.NewRequest(http.MethodGet, "/admin/assets/app.js", nil))
	if asset.Code != http.StatusOK || asset.Body.String() != "console.log('admin')" {
		t.Fatalf("/admin/assets/app.js response = %d %q", asset.Code, asset.Body.String())
	}

	deepLink := httptest.NewRecorder()
	r.ServeHTTP(deepLink, httptest.NewRequest(http.MethodGet, "/admin/models", nil))
	if deepLink.Code != http.StatusOK || deepLink.Body.String() != "<html>admin shell</html>" {
		t.Fatalf("/admin/models response = %d %q", deepLink.Code, deepLink.Body.String())
	}
}

func TestRegisterAdminStaticRoutesSkipsMissingAdminBuild(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	registerAdminStaticRoutes(r, filepath.Join(t.TempDir(), "missing-admin"))

	res := httptest.NewRecorder()
	r.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/admin/", nil))
	if res.Code != http.StatusNotFound {
		t.Fatalf("/admin/ status with missing admin build = %d, want %d", res.Code, http.StatusNotFound)
	}
}

func TestResolveAdminStaticDirRequiresIndexHTML(t *testing.T) {
	emptyDir := t.TempDir()
	if resolved, ok := resolveAdminStaticDir(emptyDir); ok || resolved != "" {
		t.Fatalf("resolveAdminStaticDir empty dir = %q %v, want empty false", resolved, ok)
	}

	adminDir := t.TempDir()
	mustWriteFile(t, filepath.Join(adminDir, "index.html"), "admin")
	resolved, ok := resolveAdminStaticDir(adminDir)
	if !ok {
		t.Fatal("resolveAdminStaticDir did not resolve directory containing index.html")
	}
	if resolved != adminDir {
		t.Fatalf("resolveAdminStaticDir = %q, want %q", resolved, adminDir)
	}
}

func mustWriteFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

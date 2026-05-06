package router

import (
	"log/slog"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/observability"
)

func registerAdminStaticRoutes(r *gin.Engine, configuredDir string) {
	adminDir, ok := resolveAdminStaticDir(configuredDir)
	if !ok {
		observability.Logger().Warn("admin_static_unavailable", slog.String("dir", configuredDir))
		return
	}

	r.GET("/admin", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/admin/")
	})
	r.GET("/admin/*filepath", func(c *gin.Context) {
		requestPath := strings.TrimPrefix(c.Param("filepath"), "/")
		if requestPath == "" {
			c.File(filepath.Join(adminDir, "index.html"))
			return
		}

		cleanPath := strings.TrimPrefix(path.Clean("/"+requestPath), "/")
		fullPath := filepath.Join(adminDir, filepath.FromSlash(cleanPath))
		if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
			c.File(fullPath)
			return
		}

		c.File(filepath.Join(adminDir, "index.html"))
	})

	observability.Logger().Info("admin_static_enabled", slog.String("dir", adminDir))
}

func resolveAdminStaticDir(configuredDir string) (string, bool) {
	candidates := []string{}
	if strings.TrimSpace(configuredDir) != "" {
		candidates = append(candidates, configuredDir)
	}
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "admin"))
	}
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(cwd, "admin"),
			filepath.Join(cwd, "../admin/dist"),
			filepath.Join(cwd, "../../apps/admin/dist"),
		)
	}

	for _, candidate := range candidates {
		if hasAdminIndex(candidate) {
			abs, err := filepath.Abs(candidate)
			if err == nil {
				return abs, true
			}
			return candidate, true
		}
	}
	return "", false
}

func hasAdminIndex(dir string) bool {
	if strings.TrimSpace(dir) == "" {
		return false
	}
	info, err := os.Stat(filepath.Join(dir, "index.html"))
	return err == nil && !info.IsDir()
}

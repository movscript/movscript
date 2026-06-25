//go:build !runtime_overlay

package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	hubapp "github.com/movscript/movscript/internal/app/hub"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

type HubHandler struct {
	service *hubapp.Service
	store   storage.Storage
}

func NewHubHandler(db *gorm.DB, store storage.Storage, _ string) *HubHandler {
	return &HubHandler{service: hubapp.NewService(db, store), store: store}
}

func (h *HubHandler) ListPackages(c *gin.Context) {
	items, err := h.service.List(c.Request.Context(), false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *HubHandler) DownloadPackage(c *gin.Context) {
	download, err := h.service.Download(c.Request.Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, hubapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "hub item not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if strings.HasPrefix(download.Key, "seed/") || download.Key == "" {
		h.writeManifestDownload(c, download.Item)
		return
	}
	body, size, contentType, err := h.store.GetObject(c.Request.Context(), download.Key, -1, -1)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer body.Close()

	c.Header("Content-Type", defaultHubString(download.ContentType, contentType))
	c.Header("Content-Disposition", `attachment; filename="`+download.FileName+`"`)
	if size > 0 {
		c.Header("Content-Length", strconv.FormatInt(size, 10))
	}
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, body)
}

func (h *HubHandler) writeManifestDownload(c *gin.Context, item hubapp.Package) {
	c.Header("Content-Type", "application/json; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="`+item.ID+`.movhub.json"`)
	_ = json.NewEncoder(c.Writer).Encode(gin.H{
		"schemaVersion":  "movhub.manifest/v1",
		"id":             item.ID,
		"title":          item.Title,
		"kind":           item.Kind,
		"version":        item.Version,
		"license":        item.License,
		"compatibility":  item.Compatibility,
		"creator":        item.Creator,
		"tags":           item.Tags,
		"repository":     item.Repository,
		"installCommand": item.InstallCommand,
	})
}

func splitHubTags(v string) []string {
	parts := strings.FieldsFunc(v, func(r rune) bool { return r == ',' || r == '，' || r == '\n' })
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

func defaultHubString(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}

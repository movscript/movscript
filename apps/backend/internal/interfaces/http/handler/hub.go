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
	service    *hubapp.Service
	store      storage.Storage
	adminToken string
}

func NewHubHandler(db *gorm.DB, store storage.Storage, adminToken string) *HubHandler {
	return &HubHandler{service: hubapp.NewService(db, store), store: store, adminToken: adminToken}
}

func (h *HubHandler) ListPackages(c *gin.Context) {
	items, err := h.service.List(c.Request.Context(), false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *HubHandler) ListAdminPackages(c *gin.Context) {
	if !h.requireHubAdmin(c) {
		return
	}
	items, err := h.service.List(c.Request.Context(), true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *HubHandler) CreatePackage(c *gin.Context) {
	if !h.requireHubAdmin(c) {
		return
	}
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	defer file.Close()

	title := strings.TrimSpace(c.PostForm("title"))
	creator := strings.TrimSpace(c.PostForm("creator"))
	summary := strings.TrimSpace(c.PostForm("summary"))
	if title == "" || creator == "" || summary == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title, creator and summary are required"})
		return
	}

	item, err := h.service.Create(c.Request.Context(), hubapp.CreateInput{
		Title:         title,
		Kind:          c.DefaultPostForm("kind", hubapp.KindPlugin),
		Category:      c.PostForm("category"),
		Creator:       creator,
		License:       c.DefaultPostForm("license", "Free Community License"),
		Summary:       summary,
		Tags:          splitHubTags(c.PostForm("tags")),
		Version:       c.DefaultPostForm("version", "0.1.0"),
		FileSizeBytes: header.Size,
		FileName:      header.Filename,
		ContentType:   header.Header.Get("Content-Type"),
		Compatibility: c.DefaultPostForm("compatibility", "Workbench >= 0.4"),
		Repository:    c.PostForm("repository"),
		SubmittedBy:   h.actorName(c),
		Body:          file,
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, item)
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

func (h *HubHandler) PatchPackage(c *gin.Context) {
	if !h.requireHubAdmin(c) {
		return
	}
	var req hubapp.PatchInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	item, err := h.service.Patch(c.Request.Context(), c.Param("id"), h.actorName(c), req)
	h.writeItem(c, item, err)
}

func (h *HubHandler) ApprovePackage(c *gin.Context) {
	if !h.requireHubAdmin(c) {
		return
	}
	var req struct {
		ReviewNote string `json:"reviewNote"`
	}
	_ = c.ShouldBindJSON(&req)
	item, err := h.service.Publish(c.Request.Context(), c.Param("id"), h.actorName(c), req.ReviewNote)
	h.writeItem(c, item, err)
}

func (h *HubHandler) RejectPackage(c *gin.Context) {
	if !h.requireHubAdmin(c) {
		return
	}
	var req struct {
		ReviewNote string `json:"reviewNote"`
	}
	_ = c.ShouldBindJSON(&req)
	item, err := h.service.Reject(c.Request.Context(), c.Param("id"), h.actorName(c), req.ReviewNote)
	h.writeItem(c, item, err)
}

func (h *HubHandler) TakeDownPackage(c *gin.Context) {
	if !h.requireHubAdmin(c) {
		return
	}
	var req struct {
		ReviewNote string `json:"reviewNote"`
	}
	_ = c.ShouldBindJSON(&req)
	item, err := h.service.TakeDown(c.Request.Context(), c.Param("id"), h.actorName(c), req.ReviewNote)
	h.writeItem(c, item, err)
}

func (h *HubHandler) writeItem(c *gin.Context, item hubapp.Package, err error) {
	if err != nil {
		if errors.Is(err, hubapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "hub item not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
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

func (h *HubHandler) requireHubAdmin(c *gin.Context) bool {
	token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	if h.adminToken != "" && token == h.adminToken {
		return true
	}
	user := currentUser(c)
	if user != nil && user.SystemRole == "super_admin" {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{"error": "hub admin access required"})
	c.Abort()
	return false
}

func (h *HubHandler) actorName(c *gin.Context) string {
	if v := strings.TrimSpace(c.GetHeader("X-Admin-ID")); v != "" {
		return v
	}
	if user := currentUser(c); user != nil {
		if user.PrimaryEmail != nil && *user.PrimaryEmail != "" {
			return *user.PrimaryEmail
		}
		return user.Username
	}
	return "hub-admin"
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

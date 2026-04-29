package handler

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/media"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/storage"
	"gorm.io/gorm"
)

type ResourceHandler struct {
	db    *gorm.DB
	store storage.Storage
}

func NewResourceHandler(db *gorm.DB, store storage.Storage) *ResourceHandler {
	return &ResourceHandler{db: db, store: store}
}

// List returns the current user's resources.
// Query params:
//   - folder_id: filter by folder (0 or "root" = unfiled)
//   - shared: "true" = show resources shared by other users
func (h *ResourceHandler) List(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	if c.Query("shared") == "true" {
		h.listShared(c, user)
		return
	}

	q := h.db.Model(&model.RawResource{}).Where("owner_id = ?", user.ID)

	switch c.Query("folder_id") {
	case "", "all":
		// no filter
	case "root", "0":
		q = q.Where("folder_id IS NULL")
	default:
		q = q.Where("folder_id = ?", c.Query("folder_id"))
	}
	q = applyResourceListFilters(q, c)

	pageMode := c.Query("page") != "" || c.Query("page_size") != ""
	if pageMode {
		h.respondResourcePage(c, q.Preload("Owner"))
		return
	}

	resources := make([]model.RawResource, 0)
	q.Order("created_at desc").Find(&resources)
	for i := range resources {
		resources[i].URL = resourceURL(c, resources[i].ID)
		h.populateDirectURL(c, &resources[i])
	}
	c.JSON(http.StatusOK, resources)
}

// listShared returns resources visible to the user via folder permissions.
// If folder_id is provided, verify the user has at least read permission for that folder
// and return all files in it.
// Otherwise return files individually marked as is_shared.
func (h *ResourceHandler) listShared(c *gin.Context, user *model.User) {
	folderID := c.Query("folder_id")

	if folderID != "" {
		var folder model.ResourceFolder
		if err := h.db.First(&folder, folderID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "folder not found"})
			return
		}
		if folder.OwnerID != user.ID && !folder.IsShared {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		q := applyResourceListFilters(h.db.Model(&model.RawResource{}).Where("folder_id = ?", folder.ID).Preload("Owner"), c)
		if c.Query("page") != "" || c.Query("page_size") != "" {
			h.respondResourcePage(c, q)
			return
		}
		resources := make([]model.RawResource, 0)
		q.Order("created_at desc").Find(&resources)
		for i := range resources {
			resources[i].URL = resourceURL(c, resources[i].ID)
			h.populateDirectURL(c, &resources[i])
		}
		c.JSON(http.StatusOK, resources)
		return
	}

	q := applyResourceListFilters(h.db.Model(&model.RawResource{}).Where("owner_id != ? AND is_shared = true", user.ID).Preload("Owner"), c)
	if c.Query("page") != "" || c.Query("page_size") != "" {
		h.respondResourcePage(c, q)
		return
	}
	resources := make([]model.RawResource, 0)
	q.Order("created_at desc").Find(&resources)
	for i := range resources {
		resources[i].URL = resourceURL(c, resources[i].ID)
		h.populateDirectURL(c, &resources[i])
	}
	c.JSON(http.StatusOK, resources)
}

func (h *ResourceHandler) Upload(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	defer file.Close()

	mimeType := header.Header.Get("Content-Type")
	resType := mimeToType(mimeType, header.Filename)

	var folderID *uint
	if fidStr := c.PostForm("folder_id"); fidStr != "" && fidStr != "0" {
		var folder model.ResourceFolder
		if h.db.First(&folder, fidStr).Error == nil {
			// If uploading into someone else's folder, require write permission.
			if folder.OwnerID != user.ID {
				if !folder.IsShared {
					c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
					return
				}
				var perm model.ResourceFolderPermission
				if h.db.Where("folder_id = ? AND user_id = ? AND permission = ?", folder.ID, user.ID, "write").
					First(&perm).Error != nil {
					c.JSON(http.StatusForbidden, gin.H{"error": "需要写权限才能上传到此文件夹"})
					return
				}
			}
			fid := folder.ID
			folderID = &fid
		}
	}

	r := model.RawResource{
		OwnerID:        user.ID,
		FolderID:       folderID,
		Type:           resType,
		Name:           header.Filename,
		MimeType:       mimeType,
		Size:           header.Size,
		FilePath:       "",
		StorageBackend: h.store.Backend(),
	}
	if err := h.db.Create(&r).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	key := generateStorageKey(r.ID, header.Filename)
	data, err := io.ReadAll(file)
	if err != nil {
		h.db.Delete(&r)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}
	if normalized, normalizedMime, changed, err := media.NormalizeVideoForBrowser(c.Request.Context(), data, mimeType); err != nil {
		fmt.Printf("[resource] video normalization skipped for %q: %v\n", header.Filename, err)
	} else if changed {
		data = normalized
		mimeType = normalizedMime
		r.Type = mimeToType(mimeType, header.Filename)
		r.MimeType = mimeType
		r.Name = media.MP4Name(r.Name)
		r.Size = int64(len(data))
	}

	if err := h.store.Put(c.Request.Context(), key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		h.db.Delete(&r)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store file"})
		return
	}

	h.db.Model(&r).Updates(map[string]any{
		"file_path":       key,
		"storage_key":     key,
		"storage_backend": h.store.Backend(),
		"type":            r.Type,
		"name":            r.Name,
		"mime_type":       r.MimeType,
		"size":            r.Size,
	})
	r.StorageKey = key
	r.StorageBackend = h.store.Backend()
	r.URL = resourceURL(c, r.ID)
	h.populateDirectURL(c, &r)
	c.JSON(http.StatusCreated, r)
}

func (h *ResourceHandler) ServeFile(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var r model.RawResource
	if err := h.db.First(&r, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if r.OwnerID != user.ID {
		allowed := r.IsShared
		if !allowed && r.FolderID != nil {
			// Allow read access if the file lives in a shared folder (is_shared=true).
			var folder model.ResourceFolder
			if h.db.First(&folder, *r.FolderID).Error == nil {
				allowed = folder.IsShared
			}
		}
		if !allowed {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
	}
	if r.StorageKey == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "no storage key"})
		return
	}

	// Parse optional Range header for video seeking support.
	// Format: "bytes=start-end" or "bytes=start-"
	rangeStart, rangeEnd := int64(-1), int64(-1)
	if rh := c.GetHeader("Range"); rh != "" {
		rangeStart, rangeEnd = parseRangeHeader(rh)
	}

	body, totalSize, contentType, err := h.store.GetObject(c.Request.Context(), r.StorageKey, rangeStart, rangeEnd)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to retrieve file"})
		return
	}
	defer body.Close()

	mimeType := r.MimeType
	if mimeType == "" {
		mimeType = contentType
	}

	c.Header("Content-Type", mimeType)
	c.Header("Accept-Ranges", "bytes")

	if rangeStart >= 0 {
		end := rangeEnd
		if end < 0 || end >= totalSize {
			end = totalSize - 1
		}
		contentLength := end - rangeStart + 1
		c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", rangeStart, end, totalSize))
		c.Header("Content-Length", strconv.FormatInt(contentLength, 10))
		c.Status(http.StatusPartialContent)
	} else {
		c.Header("Content-Length", strconv.FormatInt(totalSize, 10))
		c.Status(http.StatusOK)
	}

	io.Copy(c.Writer, body)
}

// parseRangeHeader parses "bytes=start-end" or "bytes=start-" into start/end.
// Returns -1,-1 on parse failure.
func parseRangeHeader(h string) (start, end int64) {
	if !strings.HasPrefix(h, "bytes=") {
		return -1, -1
	}
	spec := h[len("bytes="):]
	idx := strings.IndexByte(spec, '-')
	if idx < 0 {
		return -1, -1
	}
	startStr, endStr := spec[:idx], spec[idx+1:]
	if startStr == "" {
		return -1, -1 // suffix ranges not needed for now
	}
	s, err := strconv.ParseInt(startStr, 10, 64)
	if err != nil {
		return -1, -1
	}
	if endStr == "" {
		return s, -1
	}
	e, err := strconv.ParseInt(endStr, 10, 64)
	if err != nil {
		return -1, -1
	}
	return s, e
}

func (h *ResourceHandler) Delete(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var r model.RawResource
	if err := h.db.First(&r, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if r.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	if r.StorageKey != "" {
		_ = h.store.Delete(c.Request.Context(), r.StorageKey)
	}
	h.db.Where("resource_id = ?", r.ID).Delete(&model.ResourceBinding{})
	h.db.Delete(&r)
	c.Status(http.StatusNoContent)
}

// Update patches is_shared and/or folder_id on a resource.
func (h *ResourceHandler) Update(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var r model.RawResource
	if err := h.db.First(&r, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if r.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body struct {
		IsShared *bool  `json:"is_shared"`
		FolderID *uint  `json:"folder_id"`
		Name     string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]any{}
	if body.IsShared != nil {
		updates["is_shared"] = *body.IsShared
	}
	if body.FolderID != nil {
		if *body.FolderID == 0 {
			updates["folder_id"] = nil
		} else {
			updates["folder_id"] = *body.FolderID
		}
	}
	if body.Name != "" {
		updates["name"] = body.Name
	}
	h.db.Model(&r).Updates(updates)
	h.db.First(&r, r.ID)
	r.URL = resourceURL(c, r.ID)
	h.populateDirectURL(c, &r)
	c.JSON(http.StatusOK, r)
}

// AddToAsset creates an AssetView on the given asset using this resource.
// Body: {"asset_id": 1, "view_type": "front", "label": ""}
func (h *ResourceHandler) AddToAsset(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var r model.RawResource
	if err := h.db.First(&r, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if r.OwnerID != user.ID && !r.IsShared {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body struct {
		AssetID  uint   `json:"asset_id" binding:"required"`
		ViewType string `json:"view_type"`
		Label    string `json:"label"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.ViewType == "" {
		body.ViewType = "custom"
	}

	var asset model.Asset
	if err := h.db.First(&asset, body.AssetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}

	rid := r.ID
	view := model.AssetView{
		AssetID:  asset.ID,
		ViewType: body.ViewType,
		Label:    body.Label,
	}
	if err := h.db.Create(&view).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = NewResourceBindingHandler(h.db).createBinding(model.ResourceBinding{
		ProjectID:   asset.ProjectID,
		ResourceID:  rid,
		OwnerType:   "asset_view",
		OwnerID:     view.ID,
		Role:        "final",
		Slot:        body.ViewType,
		IsPrimary:   true,
		Status:      "selected",
		SourceType:  "manual",
		CreatedByID: &user.ID,
	})
	c.JSON(http.StatusCreated, view)
}

func (h *ResourceHandler) populateDirectURL(_ *gin.Context, _ *model.RawResource) {
	// DirectURL is intentionally not populated: MinIO runs inside Docker and
	// its presigned URLs use the internal hostname (minio:9000) which is
	// unreachable from the browser. The frontend always uses the backend
	// proxy route /api/v1/resources/:id/file instead.
}

func applyResourceListFilters(q *gorm.DB, c *gin.Context) *gorm.DB {
	if typ := strings.TrimSpace(c.Query("type")); typ != "" && typ != "all" {
		parts := strings.Split(typ, ",")
		types := make([]string, 0, len(parts))
		for _, p := range parts {
			if v := strings.TrimSpace(p); v != "" {
				types = append(types, v)
			}
		}
		if len(types) == 1 {
			q = q.Where("type = ?", types[0])
		} else if len(types) > 1 {
			q = q.Where("type IN ?", types)
		}
	}
	if keyword := strings.TrimSpace(c.Query("q")); keyword != "" {
		q = q.Where("LOWER(name) LIKE ?", "%"+strings.ToLower(keyword)+"%")
	}
	return q
}

func (h *ResourceHandler) respondResourcePage(c *gin.Context, q *gorm.DB) {
	page := max(1, parseInt(c.DefaultQuery("page", "1")))
	pageSize := max(1, parseInt(c.DefaultQuery("page_size", "24")))
	if pageSize > 100 {
		pageSize = 100
	}
	offset := (page - 1) * pageSize
	var total int64
	if err := q.Session(&gorm.Session{}).Model(&model.RawResource{}).Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	resources := make([]model.RawResource, 0)
	if err := q.Session(&gorm.Session{}).Model(&model.RawResource{}).Order("created_at desc").Limit(pageSize).Offset(offset).Find(&resources).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for i := range resources {
		resources[i].URL = resourceURL(c, resources[i].ID)
		h.populateDirectURL(c, &resources[i])
	}
	c.JSON(http.StatusOK, gin.H{"total": total, "items": resources, "page": page, "page_size": pageSize})
}

func currentUser(c *gin.Context) *model.User {
	u, ok := c.Get(middleware.ContextUserKey)
	if !ok {
		return nil
	}
	return u.(*model.User)
}

func resourceURL(c *gin.Context, id uint) string {
	return fmt.Sprintf("/api/v1/resources/%d/file", id)
}

func mimeToType(mime, filename string) string {
	switch {
	case strings.HasPrefix(mime, "image/"):
		return "image"
	case strings.HasPrefix(mime, "video/"):
		return "video"
	case strings.HasPrefix(mime, "audio/"):
		return "audio"
	case strings.HasPrefix(mime, "text/"):
		return "text"
	case mime == "application/json", mime == "application/xml", mime == "application/yaml", mime == "application/x-yaml":
		return "text"
	}
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif":
		return "image"
	case ".mp4", ".mov", ".avi", ".webm":
		return "video"
	case ".mp3", ".wav", ".ogg", ".aac", ".flac":
		return "audio"
	case ".txt", ".md", ".json", ".csv", ".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".xml", ".yaml", ".yml", ".log":
		return "text"
	}
	return "file"
}

func sanitizeName(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	return b.String()
}

func generateStorageKey(resourceID uint, filename string) string {
	ext := filepath.Ext(filename)
	base := sanitizeName(strings.TrimSuffix(filename, ext))
	return fmt.Sprintf("%d_%s%s", resourceID, base, ext)
}

// saveUploadedFile is kept for backward compatibility with the asset handler.
func saveUploadedFile(file multipart.File, header *multipart.FileHeader, resourceID uint, _ string) (string, error) {
	return generateStorageKey(resourceID, header.Filename), nil
}

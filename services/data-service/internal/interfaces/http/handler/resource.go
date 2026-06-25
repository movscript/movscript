package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/auth-service/pkg/authidentity"
	appresource "github.com/movscript/movscript/internal/app/resource"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

type ResourceHandler struct {
	store          storage.Storage
	service        *appresource.Service
	maxUploadBytes int64
}

func NewResourceHandler(db *gorm.DB, store storage.Storage, verifier ai.ImageVerificationClient, maxUploadBytes int64, cacheStore ...cache.Cache) *ResourceHandler {
	return NewResourceHandlerWithIdentity(db, store, verifier, maxUploadBytes, nil, cacheStore...)
}

func NewResourceHandlerWithIdentity(db *gorm.DB, store storage.Storage, verifier ai.ImageVerificationClient, maxUploadBytes int64, identity authidentity.OrgDirectory, cacheStore ...cache.Cache) *ResourceHandler {
	return &ResourceHandler{store: store, service: appresource.NewServiceWithIdentity(db, store, verifier, identity, cacheStore...), maxUploadBytes: maxUploadBytes}
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
	resources, page, err := h.service.List(c.Request.Context(), appresource.ListInput{
		UserID:   user.ID,
		OrgID:    currentOrgID(c),
		FolderID: c.Query("folder_id"),
		Scope:    c.Query("scope"),
		Type:     c.Query("type"),
		Query:    c.Query("q"),
		Page:     parseInt(c.DefaultQuery("page", "0")),
		PageSize: parseInt(c.DefaultQuery("page_size", "0")),
	})
	if err != nil {
		h.writeResourceError(c, err)
		return
	}
	h.populateResourceURLs(c, resources)
	if page != nil {
		page.Items = resources
		c.JSON(http.StatusOK, page)
		return
	}
	c.JSON(http.StatusOK, resources)
}

func (h *ResourceHandler) Get(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	r, err := h.service.GetVisible(c.Request.Context(), parseID(c.Param("id")), user.ID, currentOrgID(c))
	if err != nil {
		h.writeResourceError(c, err)
		return
	}
	h.populateResourceURL(c, &r)
	c.JSON(http.StatusOK, r)
}

func (h *ResourceHandler) Usages(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	usages, err := h.service.Usages(c.Request.Context(), parseID(c.Param("id")), user.ID, currentOrgID(c))
	if err != nil {
		h.writeResourceError(c, err)
		return
	}
	c.JSON(http.StatusOK, usages)
}

func (h *ResourceHandler) Upload(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	if h.maxUploadBytes > 0 {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, h.maxUploadBytes)
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		if uploadTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too large"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		if uploadTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too large"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	r, err := h.service.Upload(c.Request.Context(), appresource.UploadInput{
		UserID:     user.ID,
		OrgID:      currentOrgID(c),
		FolderID:   c.PostForm("folder_id"),
		Filename:   header.Filename,
		MimeType:   header.Header.Get("Content-Type"),
		Size:       header.Size,
		Data:       data,
		Derivative: parseUploadDerivative(c.PostForm("derivative")),
	})
	if err != nil {
		h.writeResourceError(c, err)
		return
	}
	h.populateResourceURL(c, &r)
	c.JSON(http.StatusCreated, r)
}

func parseUploadDerivative(value string) *appresource.UploadDerivativeInput {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	var body struct {
		Operation        string          `json:"operation"`
		Tool             string          `json:"tool"`
		InputResourceIDs []uint          `json:"input_resource_ids"`
		Params           json.RawMessage `json:"params"`
	}
	if err := json.Unmarshal([]byte(value), &body); err != nil {
		return &appresource.UploadDerivativeInput{Params: json.RawMessage(`null`)}
	}
	return &appresource.UploadDerivativeInput{
		Operation:        body.Operation,
		Tool:             body.Tool,
		InputResourceIDs: body.InputResourceIDs,
		Params:           body.Params,
	}
}

func uploadTooLarge(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "request body too large")
}

func (h *ResourceHandler) ServeFile(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	r, err := h.service.GetVisible(c.Request.Context(), parseID(c.Param("id")), user.ID, currentOrgID(c))
	if err != nil {
		h.writeResourceError(c, err)
		return
	}
	serveResourceFile(c, h.store, r)
}

func serveResourceFile(c *gin.Context, store storage.Storage, r domainresource.RawResource) {
	if r.StorageKey == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "no storage key"})
		return
	}
	etag := resourceFileETag(r)
	c.Header("Cache-Control", "private, max-age=31536000, immutable")
	c.Header("ETag", etag)
	if resourceETagMatches(c.GetHeader("If-None-Match"), etag) {
		c.Status(http.StatusNotModified)
		return
	}

	rangeStart, rangeEnd := int64(-1), int64(-1)
	if rh := c.GetHeader("Range"); rh != "" {
		rangeStart, rangeEnd = parseRangeHeader(rh)
	}

	body, totalSize, contentType, err := store.GetObject(c.Request.Context(), r.StorageKey, rangeStart, rangeEnd)
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
	_, _ = io.Copy(c.Writer, body)
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
		return -1, -1
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
	if err := h.service.Delete(c.Request.Context(), parseID(c.Param("id")), user.ID, currentOrgID(c)); err != nil {
		h.writeResourceError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *ResourceHandler) AdoptToTeam(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	r, err := h.service.AdoptToTeam(c.Request.Context(), parseID(c.Param("id")), user.ID, currentOrgID(c))
	if err != nil {
		h.writeResourceError(c, err)
		return
	}
	h.populateResourceURL(c, &r)
	c.JSON(http.StatusOK, r)
}

// Update patches editable resource metadata.
func (h *ResourceHandler) Update(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var body struct {
		FolderID *uint  `json:"folder_id"`
		Name     string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	r, err := h.service.Update(c.Request.Context(), appresource.UpdateInput{
		UserID:   user.ID,
		OrgID:    currentOrgID(c),
		ID:       parseID(c.Param("id")),
		FolderID: body.FolderID,
		Name:     body.Name,
	})
	if err != nil {
		h.writeResourceError(c, err)
		return
	}
	h.populateResourceURL(c, &r)
	c.JSON(http.StatusOK, r)
}

func (h *ResourceHandler) VerifyImage(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	r, err := h.service.VerifyImage(c.Request.Context(), appresource.VerifyImageInput{
		UserID: user.ID,
		OrgID:  currentOrgID(c),
		ID:     parseID(c.Param("id")),
	})
	if err != nil {
		h.writeResourceError(c, err)
		return
	}
	h.populateResourceURL(c, &r)
	c.JSON(http.StatusOK, r)
}

func (h *ResourceHandler) populateResourceURLs(c *gin.Context, resources []domainresource.RawResource) {
	for i := range resources {
		h.populateResourceURL(c, &resources[i])
	}
}

func (h *ResourceHandler) populateResourceURL(c *gin.Context, resource *domainresource.RawResource) {
	resource.URL = resourceURL(c, resource.ID)
	h.populateDirectURL(c, resource)
}

func (h *ResourceHandler) populateDirectURL(_ *gin.Context, _ *domainresource.RawResource) {
	// DirectURL is intentionally not populated: MinIO runs inside Docker and
	// its presigned URLs use the internal hostname (minio:9000) which is
	// unreachable from the browser. The frontend always uses the backend
	// proxy route /api/v1/resources/:id/file instead.
}

func (h *ResourceHandler) writeResourceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, appresource.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	case errors.Is(err, appresource.ErrFolderNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "folder not found"})
	case errors.Is(err, appresource.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case errors.Is(err, appresource.ErrDuplicateName):
		c.JSON(http.StatusConflict, gin.H{"code": "RESOURCE_NAME_CONFLICT", "error": "resource filename already exists"})
	case errors.Is(err, appresource.ErrResourceInUse):
		c.JSON(http.StatusConflict, gin.H{"code": "RESOURCE_IN_USE", "error": "resource is still referenced"})
	case errors.Is(err, appresource.ErrInvalidDerivative):
		c.JSON(http.StatusBadRequest, gin.H{"code": "INVALID_RESOURCE_DERIVATIVE", "error": err.Error()})
	case errors.Is(err, ai.ErrImageVerificationRequired):
		c.JSON(http.StatusForbidden, gin.H{"error": "image verification required", "code": "IMAGE_VERIFICATION_REQUIRED"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

func resourceURL(c *gin.Context, id uint) string {
	return fmt.Sprintf("/api/v1/resources/%d/file", id)
}

func resourceFileETag(resource domainresource.RawResource) string {
	raw := fmt.Sprintf("%d:%s:%d:%s", resource.ID, resource.StorageKey, resource.Size, resource.MimeType)
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%q", hex.EncodeToString(sum[:]))
}

func resourceETagMatches(ifNoneMatch string, etag string) bool {
	if strings.TrimSpace(ifNoneMatch) == "" || strings.TrimSpace(etag) == "" {
		return false
	}
	expected := normalizeResourceETag(etag)
	for _, candidate := range strings.Split(ifNoneMatch, ",") {
		normalized := normalizeResourceETag(candidate)
		if normalized == "*" || (normalized != "" && normalized == expected) {
			return true
		}
	}
	return false
}

func normalizeResourceETag(value string) string {
	trimmed := strings.TrimSpace(value)
	if strings.HasPrefix(strings.ToLower(trimmed), "w/") {
		trimmed = strings.TrimSpace(trimmed[2:])
	}
	return trimmed
}

func mimeToType(mime, filename string) string {
	return appresource.MimeToType(mime, filename)
}

func generateStorageKey(resourceID uint, filename string) string {
	return appresource.GenerateStorageKey(resourceID, filename)
}

// saveUploadedFile is kept for backward compatibility with the asset handler.
func saveUploadedFile(file multipart.File, header *multipart.FileHeader, resourceID uint, _ string) (string, error) {
	return generateStorageKey(resourceID, header.Filename), nil
}

package handler

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	appmediastream "github.com/movscript/movscript/internal/app/mediastream"
	"github.com/movscript/movscript/internal/infra/storage"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	"gorm.io/gorm"
)

type MediaStreamHandler struct {
	service        *appmediastream.Service
	maxUploadBytes int64
	db             *gorm.DB
}

func NewMediaStreamHandler(db *gorm.DB, store storage.Storage, maxUploadBytes int64) *MediaStreamHandler {
	return &MediaStreamHandler{service: appmediastream.NewService(db, store), maxUploadBytes: maxUploadBytes, db: db}
}

func (h *MediaStreamHandler) Upload(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	if h.maxUploadBytes > 0 {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, h.maxUploadBytes)
	}
	manifestFile, manifestHeader, err := c.Request.FormFile("manifest")
	if err != nil {
		if uploadTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too large"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "manifest file required"})
		return
	}
	defer manifestFile.Close()
	manifestData, err := io.ReadAll(manifestFile)
	if err != nil {
		if uploadTooLarge(err) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too large"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read manifest"})
		return
	}
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid multipart form"})
		return
	}
	segmentHeaders := form.File["segments"]
	if len(segmentHeaders) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "segments required"})
		return
	}
	segments := make([]appmediastream.SegmentInput, 0, len(segmentHeaders))
	for _, header := range segmentHeaders {
		file, err := header.Open()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to open segment"})
			return
		}
		data, readErr := io.ReadAll(file)
		_ = file.Close()
		if readErr != nil {
			if uploadTooLarge(readErr) {
				c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too large"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read segment"})
			return
		}
		segments = append(segments, appmediastream.SegmentInput{
			Name:     header.Filename,
			MimeType: header.Header.Get("Content-Type"),
			Size:     header.Size,
			Data:     data,
		})
	}

	artifact, descriptors, err := h.service.Upload(c.Request.Context(), appmediastream.UploadInput{
		UserID:             user.ID,
		OrgID:              currentOrgID(c),
		ProjectID:          optionalUintForm(c.PostForm("project_id")),
		SourceResourceID:   optionalUintForm(c.PostForm("source_resource_id")),
		SourceDerivativeID: optionalUintForm(c.PostForm("source_derivative_id")),
		Title:              c.PostForm("title"),
		ManifestName:       manifestHeader.Filename,
		ManifestMimeType:   manifestHeader.Header.Get("Content-Type"),
		ManifestData:       manifestData,
		Segments:           segments,
		DurationMs:         int(parseID(c.PostForm("duration_ms"))),
		Width:              int(parseID(c.PostForm("width"))),
		Height:             int(parseID(c.PostForm("height"))),
		ExpiresAt:          mediaStreamExpiresAt(c.PostForm("expires_at"), c.PostForm("expires_in_seconds")),
	})
	if err != nil {
		h.writeMediaStreamError(c, err)
		return
	}
	artifact.ManifestURL = mediaStreamManifestURL(c, artifact.ID)
	presignedManifestURL := mediaStreamPresignedManifestURL(c, artifact.ID)
	artifact.SegmentBaseURL = mediaStreamSegmentBaseURL(c, artifact.ID)
	c.JSON(http.StatusCreated, gin.H{
		"stream":                 artifact,
		"media_stream":           artifact,
		"stream_id":              artifact.ID,
		"manifest_url":           artifact.ManifestURL,
		"presigned_manifest_url": presignedManifestURL,
		"segment_base_url":       artifact.SegmentBaseURL,
		"segments":               descriptors,
	})
}

func (h *MediaStreamHandler) Get(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	artifact, segments, err := h.service.GetVisible(c.Request.Context(), parseID(c.Param("id")), user.ID, currentOrgID(c))
	if err != nil {
		h.writeMediaStreamError(c, err)
		return
	}
	artifact.ManifestURL = mediaStreamManifestURL(c, artifact.ID)
	presignedManifestURL := mediaStreamPresignedManifestURL(c, artifact.ID)
	artifact.SegmentBaseURL = mediaStreamSegmentBaseURL(c, artifact.ID)
	c.JSON(http.StatusOK, gin.H{
		"stream":                 artifact,
		"media_stream":           artifact,
		"stream_id":              artifact.ID,
		"manifest_url":           artifact.ManifestURL,
		"presigned_manifest_url": presignedManifestURL,
		"segment_base_url":       artifact.SegmentBaseURL,
		"segments":               segments,
	})
}

func (h *MediaStreamHandler) ServeManifest(c *gin.Context) {
	h.serveObject(c, func(userID uint, orgID *uint) (appmediastream.ObjectResult, error) {
		return h.service.OpenManifest(c.Request.Context(), parseID(c.Param("id")), userID, orgID)
	})
}

func (h *MediaStreamHandler) ServePresignedManifest(c *gin.Context) {
	streamID := parseID(c.Param("id"))
	h.serveObject(c, func(userID uint, orgID *uint) (appmediastream.ObjectResult, error) {
		return h.service.OpenPresignedManifest(c.Request.Context(), streamID, userID, orgID, func(segment appmediastream.SegmentDescriptor) string {
			return mediaStreamSegmentBaseURL(c, streamID) + segment.Name
		})
	})
}

func (h *MediaStreamHandler) ServeSegment(c *gin.Context) {
	name := strings.TrimSpace(c.Param("name"))
	h.serveObject(c, func(userID uint, orgID *uint) (appmediastream.ObjectResult, error) {
		return h.service.OpenSegment(c.Request.Context(), parseID(c.Param("id")), name, userID, orgID)
	})
}

func (h *MediaStreamHandler) CleanupExpired(c *gin.Context) {
	result, err := h.service.CleanupExpired(c.Request.Context(), appmediastream.CleanupExpiredInput{
		Now:    time.Now().UTC(),
		Limit:  parsePositiveInt(c.Query("limit"), 100),
		DryRun: strings.EqualFold(c.Query("dry_run"), "true") || c.Query("dry_run") == "1",
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "media_stream.expired_gc",
		TargetType: "media_stream_artifact",
		Metadata: map[string]any{
			"backend":         result.Backend,
			"dry_run":         result.DryRun,
			"candidates":      result.Candidates,
			"deleted":         result.Deleted,
			"objects_deleted": result.ObjectsDeleted,
			"freed_bytes":     result.FreedBytes,
		},
	})
	c.JSON(http.StatusOK, result)
}

func (h *MediaStreamHandler) serveObject(c *gin.Context, open func(uint, *uint) (appmediastream.ObjectResult, error)) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	object, err := open(user.ID, currentOrgID(c))
	if err != nil {
		h.writeMediaStreamError(c, err)
		return
	}
	defer object.Body.Close()
	c.Header("Cache-Control", "private, max-age=300")
	c.Header("Content-Type", object.ContentType)
	c.Header("Content-Length", strconv.FormatInt(object.Size, 10))
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, object.Body)
}

func (h *MediaStreamHandler) writeMediaStreamError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, appmediastream.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "media stream artifact not found"})
	case errors.Is(err, appmediastream.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "media stream artifact access denied"})
	case errors.Is(err, appmediastream.ErrInvalidManifest), errors.Is(err, appmediastream.ErrInvalidSegment), errors.Is(err, appmediastream.ErrInvalidProvenance):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

func mediaStreamManifestURL(c *gin.Context, id uint) string {
	return "/api/v1/media/streams/" + strconv.FormatUint(uint64(id), 10) + "/manifest.m3u8"
}

func mediaStreamPresignedManifestURL(c *gin.Context, id uint) string {
	return "/api/v1/media/streams/" + strconv.FormatUint(uint64(id), 10) + "/presigned.m3u8"
}

func mediaStreamSegmentBaseURL(c *gin.Context, id uint) string {
	return "/api/v1/media/streams/" + strconv.FormatUint(uint64(id), 10) + "/segments/"
}

func optionalUintForm(value string) *uint {
	id := parseID(value)
	if id == 0 {
		return nil
	}
	return &id
}

func mediaStreamExpiresAt(value string, expiresInSeconds string) *time.Time {
	if ts := strings.TrimSpace(value); ts != "" {
		if parsed, err := time.Parse(time.RFC3339, ts); err == nil {
			utc := parsed.UTC()
			return &utc
		}
	}
	seconds := parseID(expiresInSeconds)
	if seconds == 0 {
		return nil
	}
	expiresAt := time.Now().UTC().Add(time.Duration(seconds) * time.Second)
	return &expiresAt
}

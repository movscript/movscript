package handler

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	appresource "github.com/movscript/movscript/internal/app/resource"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/infra/storage"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

type ResourceAccessHandler struct {
	store    storage.Storage
	resource *appresource.Service
	settings *adminsettings.Service
}

func NewResourceAccessHandler(db *gorm.DB, store storage.Storage, encryptionKeyHex string, verifier ai.ImageVerificationClient, cacheStore ...cache.Cache) *ResourceAccessHandler {
	return &ResourceAccessHandler{
		store:    store,
		resource: appresource.NewService(db, store, verifier, cacheStore...),
		settings: adminsettings.NewService(db, encryptionKeyHex),
	}
}

type resourceAccessResolveRequest struct {
	ResourceID        uint   `json:"resource_id" binding:"required"`
	Purpose           string `json:"purpose"`
	RequiredMediaType string `json:"required_media_type"`
	Transport         string `json:"transport"`
	RouteID           uint   `json:"route_id"`
	ProfileID         string `json:"profile_id"`
}

type resourceAccessCheckResult struct {
	ResourceID    uint   `json:"resource_id"`
	MediaType     string `json:"media_type"`
	Transport     string `json:"transport"`
	ProfileID     string `json:"profile_id"`
	URL           string `json:"url"`
	ExpiresAt     string `json:"expires_at"`
	Reachable     bool   `json:"reachable"`
	StatusCode    int    `json:"status_code,omitempty"`
	ContentType   string `json:"content_type,omitempty"`
	ContentLength int64  `json:"content_length,omitempty"`
	Error         string `json:"error,omitempty"`
}

func (h *ResourceAccessHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "resource_access",
	})
}

func (h *ResourceAccessHandler) Resolve(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
		return
	}
	var body resourceAccessResolveRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	transport := strings.TrimSpace(body.Transport)
	if transport == "" {
		transport = "public_url"
	}
	if transport != "public_url" {
		c.JSON(http.StatusBadRequest, api.InvalidInput("only public_url resource access transport is currently supported"))
		return
	}
	resource, err := h.resource.GetVisible(c.Request.Context(), body.ResourceID, user.ID, currentOrgID(c))
	if err != nil {
		writeResourceAccessResourceError(c, err)
		return
	}
	requiredType := strings.TrimSpace(body.RequiredMediaType)
	if requiredType != "" && requiredType != "any" && resource.Type != requiredType {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":          "resource_media_type_mismatch",
			"error":         "resource media type does not satisfy request",
			"resource_id":   resource.ID,
			"media_type":    resource.Type,
			"required_type": requiredType,
		})
		return
	}
	settings, err := h.settings.ResourceAccessSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("读取资源公网访问配置失败"))
		return
	}
	profile, ok := selectResourceAccessProfile(settings, body.ProfileID)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":  "missing_resource_access_profile",
			"error": "resource access profile is required before local resources can be exposed as public URLs",
		})
		return
	}
	accessURL, expiresAt, err := h.signedPublicResourceURL(profile, resource.ID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":  "resource_public_url_unavailable",
			"error": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"resource_id": resource.ID,
		"media_type":  resource.Type,
		"mime_type":   resource.MimeType,
		"transport":   transport,
		"profile_id":  profile.ID,
		"url":         accessURL,
		"expires_at":  expiresAt.Format(time.RFC3339),
	})
}

func (h *ResourceAccessHandler) Check(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
		return
	}
	var body resourceAccessResolveRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	transport := strings.TrimSpace(body.Transport)
	if transport == "" {
		transport = "public_url"
	}
	if transport != "public_url" {
		c.JSON(http.StatusBadRequest, api.InvalidInput("only public_url resource access transport is currently supported"))
		return
	}
	resource, err := h.resource.GetVisible(c.Request.Context(), body.ResourceID, user.ID, currentOrgID(c))
	if err != nil {
		writeResourceAccessResourceError(c, err)
		return
	}
	requiredType := strings.TrimSpace(body.RequiredMediaType)
	if requiredType != "" && requiredType != "any" && resource.Type != requiredType {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":          "resource_media_type_mismatch",
			"error":         "resource media type does not satisfy request",
			"resource_id":   resource.ID,
			"media_type":    resource.Type,
			"required_type": requiredType,
		})
		return
	}
	settings, err := h.settings.ResourceAccessSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("读取资源公网访问配置失败"))
		return
	}
	profile, ok := selectResourceAccessProfile(settings, body.ProfileID)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":  "missing_resource_access_profile",
			"error": "resource access profile is required before local resources can be exposed as public URLs",
		})
		return
	}
	accessURL, expiresAt, err := h.signedPublicResourceURL(profile, resource.ID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":  "resource_public_url_unavailable",
			"error": err.Error(),
		})
		return
	}
	result := h.checkSignedPublicResourceURL(c.Request.Context(), accessURL)
	result.ResourceID = resource.ID
	result.MediaType = resource.Type
	result.Transport = transport
	result.ProfileID = profile.ID
	result.URL = accessURL
	result.ExpiresAt = expiresAt.Format(time.RFC3339)
	c.JSON(http.StatusOK, result)
}

func (h *ResourceAccessHandler) checkSignedPublicResourceURL(ctx context.Context, accessURL string) resourceAccessCheckResult {
	checkCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	result := resourceAccessCheckResult{}
	req, err := http.NewRequestWithContext(checkCtx, http.MethodHead, accessURL, nil)
	if err != nil {
		result.Error = err.Error()
		return result
	}
	resp, err := http.DefaultClient.Do(req)
	if err == nil && resp != nil && (resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusNotImplemented || resp.StatusCode == http.StatusNotFound) {
		_ = resp.Body.Close()
		resp = nil
		req, err = http.NewRequestWithContext(checkCtx, http.MethodGet, accessURL, nil)
		if err == nil {
			req.Header.Set("Range", "bytes=0-0")
			resp, err = http.DefaultClient.Do(req)
		}
	}
	if err != nil {
		result.Error = err.Error()
		return result
	}
	if resp == nil {
		result.Error = "resource access check returned no response"
		return result
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
	result.StatusCode = resp.StatusCode
	result.ContentType = resp.Header.Get("Content-Type")
	result.ContentLength = resp.ContentLength
	if result.ContentLength < 0 {
		if raw := strings.TrimSpace(resp.Header.Get("Content-Length")); raw != "" {
			if parsed, parseErr := strconv.ParseInt(raw, 10, 64); parseErr == nil {
				result.ContentLength = parsed
			}
		}
	}
	result.Reachable = resp.StatusCode >= 200 && resp.StatusCode < 400
	if !result.Reachable {
		result.Error = resp.Status
	}
	return result
}

func (h *ResourceAccessHandler) ServeSignedResourceFile(c *gin.Context) {
	resourceID := parseID(c.Param("id"))
	expires, err := strconv.ParseInt(c.Query("expires"), 10, 64)
	if err != nil || expires <= 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "invalid resource access signature"})
		return
	}
	if time.Now().Unix() > expires {
		c.JSON(http.StatusForbidden, gin.H{"error": "resource access URL expired"})
		return
	}
	settings, err := h.settings.ResourceAccessSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "resource access settings unavailable"})
		return
	}
	profile, ok := selectResourceAccessProfile(settings, c.Query("profile"))
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "resource access profile not found"})
		return
	}
	if !verifyResourceAccessSignature(profile, resourceID, expires, c.Query("signature")) {
		c.JSON(http.StatusForbidden, gin.H{"error": "invalid resource access signature"})
		return
	}
	resource, err := h.resource.GetSignedResource(c.Request.Context(), resourceID)
	if err != nil {
		writeResourceAccessResourceError(c, err)
		return
	}
	serveResourceFile(c, h.store, resource)
}

func (h *ResourceAccessHandler) signedPublicResourceURL(profile adminsettings.ResourceAccessProfile, resourceID uint) (string, time.Time, error) {
	if strings.TrimSpace(profile.PublicBaseURL) == "" {
		return "", time.Time{}, fmt.Errorf("resource access profile public_base_url is required")
	}
	if strings.TrimSpace(profile.SigningSecret) == "" {
		return "", time.Time{}, fmt.Errorf("resource access profile signing_secret is required")
	}
	expiresSeconds := profile.ExpiresSeconds
	if expiresSeconds <= 0 {
		expiresSeconds = 3600
	}
	expiresAt := time.Now().Add(time.Duration(expiresSeconds) * time.Second).UTC()
	expires := expiresAt.Unix()
	signature := signResourceAccessURL(profile, resourceID, expires)
	if signature == "" {
		return "", time.Time{}, fmt.Errorf("resource access signature could not be created")
	}
	resourceURL := fmt.Sprintf("%s/api/v1/resource-access/resources/%d/file?expires=%d&profile=%s&signature=%s",
		strings.TrimRight(profile.PublicBaseURL, "/"),
		resourceID,
		expires,
		url.QueryEscape(profile.ID),
		url.QueryEscape(signature),
	)
	return resourceURL, expiresAt, nil
}

func selectResourceAccessProfile(settings adminsettings.ResourceAccessSettings, profileID string) (adminsettings.ResourceAccessProfile, bool) {
	profileID = strings.TrimSpace(profileID)
	if profileID == "" {
		profileID = settings.DefaultProfileID
	}
	for _, profile := range settings.Profiles {
		if !profile.Enabled {
			continue
		}
		if profileID == "" || profile.ID == profileID {
			if profile.Mode == "public_tunnel" || profile.Mode == "public_backend" || profile.Mode == "object_relay" {
				return profile, true
			}
		}
	}
	return adminsettings.ResourceAccessProfile{}, false
}

func signResourceAccessURL(profile adminsettings.ResourceAccessProfile, resourceID uint, expires int64) string {
	secret := strings.TrimSpace(profile.SigningSecret)
	if secret == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(resourceAccessSignaturePayload(profile.ID, resourceID, expires)))
	return hex.EncodeToString(mac.Sum(nil))
}

func verifyResourceAccessSignature(profile adminsettings.ResourceAccessProfile, resourceID uint, expires int64, signature string) bool {
	expected := signResourceAccessURL(profile, resourceID, expires)
	if expected == "" || signature == "" {
		return false
	}
	return hmac.Equal([]byte(expected), []byte(signature))
}

func resourceAccessSignaturePayload(profileID string, resourceID uint, expires int64) string {
	return fmt.Sprintf("resource_access:%s:%d:%d", profileID, resourceID, expires)
}

func writeResourceAccessResourceError(c *gin.Context, err error) {
	switch {
	case err == nil:
		return
	case errors.Is(err, appresource.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "resource not found"})
	case errors.Is(err, appresource.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "resource access denied"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

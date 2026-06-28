package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestResourceAccessResolveReturnsSignedPublicURLAndServesFile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-resource-access.db", &persistencemodel.AdminSetting{}, &persistencemodel.RawResource{})
	store := &handlerFakeStorage{objects: map[string]string{"resources/hero.png": "hero-bytes"}}
	encryptionKey := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	settingsService := adminsettings.NewService(db, encryptionKey)
	if _, err := settingsService.UpdateResourceAccessSettings(context.Background(), adminsettings.ResourceAccessSettings{
		Profiles: []adminsettings.ResourceAccessProfile{{
			ID:              "local-ngrok",
			Enabled:         true,
			Mode:            "public_tunnel",
			PublicBaseURL:   "https://example.ngrok-free.app",
			SigningEnabled:  true,
			SigningSecret:   "resource-secret",
			ExpiresSeconds:  600,
			HealthCheckPath: "/api/v1/resource-access/health",
		}},
		DefaultProfileID: "local-ngrok",
	}); err != nil {
		t.Fatalf("UpdateResourceAccessSettings() error = %v", err)
	}
	user := newHandlerExternalUser("alice")
	resource := persistencemodel.RawResource{
		OwnerID:        user.ID,
		Type:           "image",
		Name:           "hero.png",
		FilePath:       "stored:resources/hero.png",
		StorageKey:     "resources/hero.png",
		StorageBackend: "local",
		MimeType:       "image/png",
		Size:           10,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	handler := NewResourceAccessHandler(db.Session(&gorm.Session{SkipHooks: true}), store, encryptionKey, nil)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, handlerUserProfile(user))
		c.Next()
	})
	router.POST("/api/v1/resource-access/resolve", handler.Resolve)
	router.GET("/api/v1/resource-access/resources/:id/file", handler.ServeSignedResourceFile)

	resolveReq := httptest.NewRequest(http.MethodPost, "/api/v1/resource-access/resolve", strings.NewReader(`{
		"resource_id": 1,
		"required_media_type": "image",
		"transport": "public_url"
	}`))
	resolveReq.Header.Set("Content-Type", "application/json")
	resolveRes := httptest.NewRecorder()
	router.ServeHTTP(resolveRes, resolveReq)

	if resolveRes.Code != http.StatusOK {
		t.Fatalf("Resolve() status = %d, body = %s", resolveRes.Code, resolveRes.Body.String())
	}
	var body struct {
		ResourceID uint   `json:"resource_id"`
		MediaType  string `json:"media_type"`
		Transport  string `json:"transport"`
		ProfileID  string `json:"profile_id"`
		URL        string `json:"url"`
		ExpiresAt  string `json:"expires_at"`
	}
	if err := json.Unmarshal(resolveRes.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode resolve response: %v", err)
	}
	if body.ResourceID != resource.ID || body.MediaType != "image" || body.Transport != "public_url" || body.ProfileID != "local-ngrok" {
		t.Fatalf("unexpected resolve response: %+v", body)
	}
	if !strings.HasPrefix(body.URL, "https://example.ngrok-free.app/api/v1/resource-access/resources/1/file?") || !strings.Contains(body.URL, "signature=") {
		t.Fatalf("url = %q, want signed public resource access URL", body.URL)
	}
	if body.ExpiresAt == "" {
		t.Fatal("expected expires_at")
	}

	publicPath := strings.TrimPrefix(body.URL, "https://example.ngrok-free.app")
	fileReq := httptest.NewRequest(http.MethodGet, publicPath, nil)
	fileRes := httptest.NewRecorder()
	router.ServeHTTP(fileRes, fileReq)

	if fileRes.Code != http.StatusOK {
		t.Fatalf("ServeSignedResourceFile() status = %d, body = %s", fileRes.Code, fileRes.Body.String())
	}
	if fileRes.Body.String() != "hero-bytes" {
		t.Fatalf("file body = %q, want hero-bytes", fileRes.Body.String())
	}
	if fileRes.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("Content-Type = %q, want image/png", fileRes.Header().Get("Content-Type"))
	}
}

func TestResourceAccessResolveRejectsMediaTypeMismatch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-resource-access-mismatch.db", &persistencemodel.AdminSetting{}, &persistencemodel.RawResource{})
	store := &handlerFakeStorage{}
	encryptionKey := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	settingsService := adminsettings.NewService(db, encryptionKey)
	if _, err := settingsService.UpdateResourceAccessSettings(context.Background(), adminsettings.ResourceAccessSettings{
		Profiles: []adminsettings.ResourceAccessProfile{{
			ID:             "public",
			Enabled:        true,
			Mode:           "public_backend",
			PublicBaseURL:  "https://public.example.com",
			SigningEnabled: true,
			SigningSecret:  "resource-secret",
		}},
		DefaultProfileID: "public",
	}); err != nil {
		t.Fatalf("UpdateResourceAccessSettings() error = %v", err)
	}
	user := newHandlerExternalUser("alice")
	if err := db.Create(&persistencemodel.RawResource{
		OwnerID:        user.ID,
		Type:           "video",
		Name:           "clip.mp4",
		FilePath:       "stored:resources/clip.mp4",
		StorageKey:     "resources/clip.mp4",
		StorageBackend: "local",
		MimeType:       "video/mp4",
		Size:           10,
	}).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	handler := NewResourceAccessHandler(db.Session(&gorm.Session{SkipHooks: true}), store, encryptionKey, nil)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, handlerUserProfile(user))
		c.Next()
	})
	router.POST("/api/v1/resource-access/resolve", handler.Resolve)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/resource-access/resolve", strings.NewReader(`{
		"resource_id": 1,
		"required_media_type": "image",
		"transport": "public_url"
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("Resolve() status = %d, body = %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "resource_media_type_mismatch") {
		t.Fatalf("Resolve() body = %s, want media type mismatch code", res.Body.String())
	}
}

func TestResourceAccessCheckVerifiesPublicURLReachability(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-resource-access-check.db", &persistencemodel.AdminSetting{}, &persistencemodel.RawResource{})
	store := &handlerFakeStorage{objects: map[string]string{"resources/hero.png": "hero-bytes"}}
	encryptionKey := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	user := newHandlerExternalUser("alice")
	resource := persistencemodel.RawResource{
		OwnerID:        user.ID,
		Type:           "image",
		Name:           "hero.png",
		FilePath:       "stored:resources/hero.png",
		StorageKey:     "resources/hero.png",
		StorageBackend: "local",
		MimeType:       "image/png",
		Size:           10,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	handler := NewResourceAccessHandler(db.Session(&gorm.Session{SkipHooks: true}), store, encryptionKey, nil)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, handlerUserProfile(user))
		c.Next()
	})
	router.POST("/api/v1/resource-access/check", handler.Check)
	router.GET("/api/v1/resource-access/resources/:id/file", handler.ServeSignedResourceFile)
	server := httptest.NewServer(router)
	defer server.Close()

	settingsService := adminsettings.NewService(db, encryptionKey)
	if _, err := settingsService.UpdateResourceAccessSettings(context.Background(), adminsettings.ResourceAccessSettings{
		Profiles: []adminsettings.ResourceAccessProfile{{
			ID:              "public-test",
			Enabled:         true,
			Mode:            "public_backend",
			PublicBaseURL:   server.URL,
			SigningEnabled:  true,
			SigningSecret:   "resource-secret",
			ExpiresSeconds:  600,
			HealthCheckPath: "/api/v1/resource-access/health",
		}},
		DefaultProfileID: "public-test",
	}); err != nil {
		t.Fatalf("UpdateResourceAccessSettings() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/resource-access/check", strings.NewReader(`{
		"resource_id": 1,
		"required_media_type": "image",
		"transport": "public_url"
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("Check() status = %d, body = %s", res.Code, res.Body.String())
	}
	var body struct {
		ResourceID    uint   `json:"resource_id"`
		Reachable     bool   `json:"reachable"`
		StatusCode    int    `json:"status_code"`
		ContentType   string `json:"content_type"`
		ContentLength int64  `json:"content_length"`
		URL           string `json:"url"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode check response: %v", err)
	}
	if body.ResourceID != resource.ID || !body.Reachable || (body.StatusCode != http.StatusOK && body.StatusCode != http.StatusPartialContent) {
		t.Fatalf("check response = %+v, want reachable 2xx/206 response", body)
	}
	if body.ContentType != "image/png" || body.ContentLength <= 0 {
		t.Fatalf("check response = %+v, want image/png and positive content length", body)
	}
	if !strings.HasPrefix(body.URL, server.URL+"/api/v1/resource-access/resources/1/file?") {
		t.Fatalf("url = %q, want signed server URL", body.URL)
	}
}

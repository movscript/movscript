package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	appmediastream "github.com/movscript/movscript/internal/app/mediastream"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/storage"
	"github.com/movscript/movscript/internal/testutil"
)

func TestMediaStreamGetReturnsPresignedManifestURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-media-stream-get.db", &persistencemodel.MediaStreamArtifact{})
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	service := appmediastream.NewService(db, store)
	artifact, _, err := service.Upload(context.Background(), appmediastream.UploadInput{
		UserID:       7,
		ManifestName: "preview.m3u8",
		ManifestData: []byte("#EXTM3U\n#EXTINF:1,\nsegment-00000.ts\n"),
		Segments: []appmediastream.SegmentInput{{
			Name: "segment-00000.ts",
			Data: []byte("segment"),
		}},
	})
	if err != nil {
		t.Fatalf("upload stream: %v", err)
	}

	handler := NewMediaStreamHandler(db, store, 10<<20)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		setTestAuthContextUser(c, domainidentity.UserProfile{ID: 7, Username: "owner", Status: domainidentity.UserStatusActive})
		c.Next()
	})
	router.GET("/media/streams/:id", handler.Get)

	req := httptest.NewRequest(http.MethodGet, "/media/streams/1", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected media stream get to return 200, got %d: %s", res.Code, res.Body.String())
	}
	body := res.Body.String()
	if !strings.Contains(body, `"presigned_manifest_url":"/api/v1/media/streams/`+strconv.FormatUint(uint64(artifact.ID), 10)+`/presigned.m3u8"`) {
		t.Fatalf("expected presigned manifest URL in response: %s", body)
	}
}

func TestMediaStreamCleanupExpiredEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-media-stream-cleanup.db", &persistencemodel.MediaStreamArtifact{}, &persistencemodel.AuditLog{})
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	now := time.Now().UTC()
	expiredAt := now.Add(-time.Minute)
	service := appmediastream.NewService(db, store)
	_, _, err = service.Upload(context.Background(), appmediastream.UploadInput{
		UserID:       7,
		ManifestName: "preview.m3u8",
		ManifestData: []byte("#EXTM3U\n#EXTINF:1,\nsegment-00000.ts\n"),
		Segments: []appmediastream.SegmentInput{{
			Name: "segment-00000.ts",
			Data: []byte("segment"),
		}},
		ExpiresAt: &expiredAt,
	})
	if err != nil {
		t.Fatalf("upload stream: %v", err)
	}

	handler := NewMediaStreamHandler(db, store, 10<<20)
	router := gin.New()
	router.POST("/admin/resource-storage/media-streams/gc", handler.CleanupExpired)

	req := httptest.NewRequest(http.MethodPost, "/admin/resource-storage/media-streams/gc?limit=10", nil)
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected media stream GC to return 200, got %d: %s", res.Code, res.Body.String())
	}
	body := res.Body.String()
	if !strings.Contains(body, `"deleted":1`) || !strings.Contains(body, `"objects_deleted":2`) || !strings.Contains(body, `"candidates":1`) {
		t.Fatalf("unexpected media stream GC response: %s", body)
	}
	if countAuditAction(t, db, "media_stream.expired_gc") != 1 {
		t.Fatalf("expected media stream GC audit log")
	}
}

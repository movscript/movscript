package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"github.com/movscript/movscript/internal/testutil"
)

func TestShotReferenceCreateFromResourceReturnsForbiddenForInvisibleResource(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "shot-reference-handler.db",
		&model.User{},
		&model.RawResource{},
		&model.ShotReferenceGroup{},
		&model.ShotReference{},
	)
	owner := model.User{Username: "owner", Status: "active"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	requester := model.User{Username: "requester", Status: "active"}
	if err := db.Create(&requester).Error; err != nil {
		t.Fatalf("create requester: %v", err)
	}
	resource := model.RawResource{
		OwnerID:        owner.ID,
		Type:           "video",
		Name:           "source.mp4",
		FilePath:       "stored:test",
		Size:           1024,
		MimeType:       "video/mp4",
		StorageBackend: "fake",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	handler := NewShotReferenceHandler(db, fakeShotStorage{}, nil, 0, cache.NewNoop())
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserKey, domainauth.UserProfile{ID: requester.ID, Username: requester.Username, Status: domainauth.UserStatusActive})
		c.Next()
	})
	router.POST("/shot-references/from-resource", handler.CreateFromResource)

	body, err := json.Marshal(gin.H{
		"resource_id": resource.ID,
		"shots":       []any{},
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/shot-references/from-resource", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("expected forbidden, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "resource access denied") {
		t.Fatalf("response body = %s, want resource access denied", res.Body.String())
	}
}

func TestShotReferencePatchAcceptsProfessionalAnnotationFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "shot-reference-handler-patch.db",
		&model.User{},
		&model.RawResource{},
		&model.ShotReferenceGroup{},
		&model.ShotReference{},
	)
	user := model.User{Username: "owner", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	resource := model.RawResource{
		OwnerID:        user.ID,
		Type:           "video",
		Name:           "manual_patch.mp4",
		FilePath:       "stored:test",
		Size:           1024,
		MimeType:       "video/mp4",
		StorageBackend: "fake",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	reference := model.ShotReference{
		OwnerID:          user.ID,
		ResourceID:       resource.ID,
		Title:            "manual patch",
		AnalysisStatus:   "ready",
		AnalysisSource:   "manual",
		IntentJSON:       `[]`,
		PatternJSON:      `[]`,
		ShotFunctionJSON: `[]`,
		VisualPrefJSON:   `[]`,
		EmotionalJSON:    `[]`,
		ExecutionJSON:    `{}`,
	}
	if err := db.Create(&reference).Error; err != nil {
		t.Fatalf("create reference: %v", err)
	}

	handler := NewShotReferenceHandler(db, fakeShotStorage{}, nil, 0, cache.NewNoop())
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserKey, domainauth.UserProfile{ID: user.ID, Username: user.Username, Status: domainauth.UserStatusActive})
		c.Next()
	})
	router.PATCH("/shot-references/:id", handler.Patch)

	body, err := json.Marshal(gin.H{
		"title": "manual patch",
		"visual_analysis": gin.H{
			"shot_size": "extreme_close_up",
			"camera_movement": gin.H{
				"type": "locked_off",
			},
		},
		"narrative_function": gin.H{
			"primary": "realization",
		},
		"reusable_pattern": gin.H{
			"principle": "Hold on the face until the decision becomes readable.",
		},
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPatch, "/shot-references/1", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected ok, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "extreme_close_up") || !strings.Contains(res.Body.String(), "realization") {
		t.Fatalf("response body = %s, want professional annotation fields", res.Body.String())
	}
}

type fakeShotStorage struct{}

func (fakeShotStorage) Put(context.Context, string, io.Reader, int64, string) error { return nil }

func (fakeShotStorage) Delete(context.Context, string) error { return nil }

func (fakeShotStorage) DirectURL(context.Context, string) (string, error) { return "", nil }

func (fakeShotStorage) GetObject(context.Context, string, int64, int64) (io.ReadCloser, int64, string, error) {
	return io.NopCloser(strings.NewReader("")), 0, "", nil
}

func (fakeShotStorage) Backend() string { return "fake" }

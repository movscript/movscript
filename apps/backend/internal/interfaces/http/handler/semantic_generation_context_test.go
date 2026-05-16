package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestBuildGenerationContextReturnsDebugPayloadForMissingTarget(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := newSemanticGenerationContextHandlerTestDB(t)
	handler := NewSemanticEntityHandler(db)
	router := gin.New()
	router.POST("/projects/:id/entities/content-units/:contentUnitId/generation-context", handler.BuildGenerationContext)

	req := httptest.NewRequest(http.MethodPost, "/projects/2/entities/content-units/7/generation-context", strings.NewReader(`{"intent":"video"}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body = %s", res.Code, http.StatusNotFound, res.Body.String())
	}
	var body apierr.Response
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Code != apierr.CodeNotFound {
		t.Fatalf("code = %q, want %q", body.Code, apierr.CodeNotFound)
	}
	debug, ok := body.Debug.(map[string]any)
	if !ok {
		t.Fatalf("missing debug payload: %#v", body.Debug)
	}
	if debug["code"] != "GENERATION_CONTEXT_ENTITY_NOT_FOUND" || debug["step"] != "load_target" || debug["entity_type"] != "content_unit" {
		t.Fatalf("unexpected debug payload: %#v", debug)
	}
	if debug["project_id"] != float64(2) || debug["entity_id"] != float64(7) {
		t.Fatalf("unexpected debug IDs: %#v", debug)
	}
}

func newSemanticGenerationContextHandlerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "generation_context_handler.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	},
		&model.Production{},
		&model.Segment{},
		&model.SceneMoment{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.CreativeReference{},
		&model.CreativeReferenceState{},
		&model.CreativeReferenceUsage{},
		&model.AssetSlot{},
		&model.RawResource{},
	)
}

package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestPreviewProductionProposalRejectsLegacyActionPayload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewSemanticEntityHandler(newSemanticProposalHandlerTestDB(t))
	router := gin.New()
	router.POST("/projects/:id/entities/production-proposals/apply-preview", handler.PreviewProductionProposalApply)

	req := httptest.NewRequest(http.MethodPost, "/projects/1/entities/production-proposals/apply-preview", strings.NewReader(`{
		"mode":"snapshot",
		"production_id":1,
		"proposal":{"segments":[{"action":"create","title":"Opening","scene_moments":[]}]}
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body = %s", res.Code, http.StatusBadRequest, res.Body.String())
	}
	var body api.Response
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if !strings.Contains(body.Message, "action fields") {
		t.Fatalf("message = %q, want action fields error", body.Message)
	}
}

func TestPreviewProductionProposalReturnsDebugForMissingCreativeReference(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := newSemanticProposalHandlerTestDB(t)
	production := model.Production{ProjectID: 1, Name: "Demo production", Status: "planning", SourceType: "direct"}
	if err := db.Create(&production).Error; err != nil {
		t.Fatalf("create production: %v", err)
	}
	handler := NewSemanticEntityHandler(db)
	router := gin.New()
	router.POST("/projects/:id/entities/production-proposals/apply-preview", handler.PreviewProductionProposalApply)

	req := httptest.NewRequest(http.MethodPost, "/projects/1/entities/production-proposals/apply-preview", strings.NewReader(`{
		"mode":"snapshot",
		"production_id":1,
		"proposal_scope":"production",
		"proposal":{"segments":[{
			"client_id":"segment_1",
			"title":"Opening",
			"scene_moments":[{
				"client_id":"scene_1",
				"title":"Wake up",
				"creative_references":[{"id":999,"client_id":"ref_999","name":"Missing reference","role":"supporting"}]
			}]
		}]}
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body = %s", res.Code, http.StatusNotFound, res.Body.String())
	}
	var body api.Response
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Code != api.CodeNotFound {
		t.Fatalf("code = %q, want %q", body.Code, api.CodeNotFound)
	}
	debug, ok := body.Debug.(map[string]any)
	if !ok {
		t.Fatalf("missing debug payload: %#v", body.Debug)
	}
	if debug["entity_type"] != "creative_reference" || debug["entity_id"] != float64(999) {
		t.Fatalf("unexpected debug entity: %#v", debug)
	}
	if debug["path"] != "/proposal/segments/0/scene_moments/0/creative_references/0/id" {
		t.Fatalf("debug path = %#v", debug["path"])
	}
	if debug["project_id"] != float64(1) || debug["production_id"] != float64(1) {
		t.Fatalf("unexpected debug ids: %#v", debug)
	}
}

func newSemanticProposalHandlerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "semantic_proposal_handler.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	},
		&model.EntityRelation{},
		&model.Project{},
		&model.Production{},
		&model.Segment{},
		&model.SceneMoment{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.CreativeReference{},
		&model.CreativeReferenceState{},
		&model.CreativeReferenceUsage{},
		&model.AssetSlot{},
	)
}

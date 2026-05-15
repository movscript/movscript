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
	"gorm.io/driver/sqlite"
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
	var body apierr.Response
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if !strings.Contains(body.Message, "action fields") {
		t.Fatalf("message = %q, want action fields error", body.Message)
	}
}

func newSemanticProposalHandlerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dbName := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	db, err := gorm.Open(sqlite.Open("file:"+dbName+"?mode=memory&cache=shared"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.Project{}, &model.Production{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

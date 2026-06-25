package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/ai"
)

func TestJobCreateErrorPreservesNullSuggestedFixForParamRemoval(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	h := &JobHandler{}
	h.writeJobCreateError(c, &ai.ValidationError{
		Code:         "INVALID_PARAMETER_COMBINATION",
		Message:      `parameters "duration" and "frames" cannot be used together`,
		Field:        "duration",
		SuggestedFix: map[string]any{"frames": nil},
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for validation error, got %d: %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	suggestedFix, ok := body["suggested_fix"].(map[string]any)
	if !ok {
		t.Fatalf("expected suggested_fix object, got %#v", body)
	}
	if value, ok := suggestedFix["frames"]; !ok || value != nil {
		t.Fatalf("expected frames suggested fix to be JSON null, got %#v", suggestedFix)
	}
}

func TestJobCreateErrorPreservesStructuredInputCountDetails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	requiredMin := 1
	allowedMax := 4
	actualCount := 5
	h := &JobHandler{}
	h.writeJobCreateError(c, &ai.ValidationError{
		Code:        "INVALID_INPUT_COUNT",
		Message:     "image generation input count is above the model maximum",
		Field:       "image",
		RequiredMin: &requiredMin,
		AllowedMax:  &allowedMax,
		ActualCount: &actualCount,
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for validation error, got %d: %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["code"] != "INVALID_INPUT_COUNT" || body["field"] != "image" {
		t.Fatalf("unexpected structured input count error: %#v", body)
	}
	if body["required_min"] != float64(1) || body["allowed_max"] != float64(4) || body["actual_count"] != float64(5) {
		t.Fatalf("expected input count details at top level, got %#v", body)
	}
	details, ok := body["details"].(map[string]any)
	if !ok {
		t.Fatalf("expected details object, got %#v", body)
	}
	if details["required_min"] != float64(1) || details["allowed_max"] != float64(4) || details["actual_count"] != float64(5) {
		t.Fatalf("expected input count details inside details, got %#v", details)
	}
}

func TestJobCreateErrorPreservesTypedAllowedValues(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	h := &JobHandler{}
	h.writeJobCreateError(c, &ai.ValidationError{
		Code:          "INVALID_PARAMETER_OPTION",
		Message:       `parameter "frames" must match one of the declared schema enum values`,
		Field:         "frames",
		AllowedValues: []any{29, 33, 37},
		SuggestedFix:  map[string]any{"frames": 29},
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for validation error, got %d: %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	allowed, ok := body["allowed_values"].([]any)
	if !ok || len(allowed) != 3 {
		t.Fatalf("expected allowed_values array, got %#v", body)
	}
	if allowed[0] != float64(29) || allowed[1] != float64(33) || allowed[2] != float64(37) {
		t.Fatalf("expected numeric allowed_values, got %#v", allowed)
	}
	suggestedFix, ok := body["suggested_fix"].(map[string]any)
	if !ok || suggestedFix["frames"] != float64(29) {
		t.Fatalf("expected numeric suggested_fix, got %#v", body)
	}
}

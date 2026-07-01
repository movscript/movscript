package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/ai"
)

func TestContentCandidateErrorReturnsModelRouteReason(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	h := &ContentCandidateHandler{}
	h.writeContentCandidateError(c, errors.New(`model "grok-imagine-video" is not available for capability video_generation operation image_to_video`))

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for model route error, got %d: %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["error"] != `model "grok-imagine-video" is not available for capability video_generation operation image_to_video` {
		t.Fatalf("expected concrete route error, got %#v", body)
	}
}

func TestContentCandidateErrorPreservesValidationDetails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	requiredMin := 1
	allowedMax := 2
	actualCount := 3
	h := &ContentCandidateHandler{}
	h.writeContentCandidateError(c, &ai.ValidationError{
		Code:        "INVALID_INPUT_COUNT",
		Message:     `model "Grok Imagine Video 1.5" supports at most 2 image input(s), but 3 were provided`,
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
		t.Fatalf("unexpected validation response: %#v", body)
	}
	if body["required_min"] != float64(1) || body["allowed_max"] != float64(2) || body["actual_count"] != float64(3) {
		t.Fatalf("expected input count details at top level, got %#v", body)
	}
}

func TestContentCandidateErrorIncludesReasonForUnexpectedFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	h := &ContentCandidateHandler{}
	h.writeContentCandidateError(c, errors.New("decision context write failed"))

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 for unexpected error, got %d: %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["error"] != "content candidate generation failed" || body["reason"] != "decision context write failed" {
		t.Fatalf("expected generic error with concrete reason, got %#v", body)
	}
}

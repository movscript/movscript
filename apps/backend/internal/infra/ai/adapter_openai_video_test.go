package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

func TestOpenAIVideoStartSendsInputReferenceArray(t *testing.T) {
	var gotRefFiles int
	var gotPrompt string
	var gotContentType string

	adapter := NewOpenAIAdapter("https://example.test/v1", "test-key")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/videos" {
			t.Fatalf("path = %s, want /v1/videos", r.URL.Path)
		}
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		files := r.MultipartForm.File["input_reference[]"]
		gotRefFiles = len(files)
		if len(files) > 0 {
			gotContentType = files[0].Header.Get("Content-Type")
		}
		gotPrompt = r.FormValue("prompt")

		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{
			"id": "task_1",
		})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:  "grok-imagine-video",
		Prompt: "make a video",
		InputImageDataList: []MediaData{{
			Bytes:    []byte("fake image bytes"),
			MimeType: "image/png",
		}},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if gotRefFiles != 1 {
		t.Fatalf("multipart input_reference[] files = %d, want 1", gotRefFiles)
	}
	if gotContentType != "image/png" {
		t.Fatalf("input_reference[] Content-Type = %q, want image/png", gotContentType)
	}
	if gotPrompt != "make a video" {
		t.Fatalf("prompt = %q, want make a video", gotPrompt)
	}
	if resp.TaskID != "task_1" {
		t.Fatalf("TaskID = %q, want task_1", resp.TaskID)
	}
}

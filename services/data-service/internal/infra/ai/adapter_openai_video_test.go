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

func TestOpenAIVideoStartDoesNotSwitchEndpointByModelName(t *testing.T) {
	adapter := NewOpenAIAdapter("https://example.test/v1", "test-key")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/videos" {
			t.Fatalf("path = %s, want /v1/videos", r.URL.Path)
		}
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{"id": "task_1"})
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
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if resp.TaskID != "task_1" {
		t.Fatalf("TaskID = %q, want task_1", resp.TaskID)
	}
}

func TestOfficialVideoGenerationsStartUsesGenerationsEndpoint(t *testing.T) {
	var gotBody map[string]any
	adapter := NewOfficialVideoGenerationsAdapter("test-key", "https://example.test/v1")
	adapter.openai.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/videos/generations" {
			t.Fatalf("path = %s, want /v1/videos/generations", r.URL.Path)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Fatalf("Content-Type = %q, want application/json", r.Header.Get("Content-Type"))
		}
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{
			"request_id": "video_req_1",
		})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:          "grok-imagine-video",
		Prompt:         "make a cinematic city flyover",
		Duration:       10,
		AspectRatio:    "16:9",
		ResolutionName: "720p",
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if resp.TaskID != "video_req_1" {
		t.Fatalf("TaskID = %q, want video_req_1", resp.TaskID)
	}
	if gotBody["model"] != "grok-imagine-video" || gotBody["prompt"] != "make a cinematic city flyover" ||
		gotBody["duration"] != float64(10) || gotBody["aspect_ratio"] != "16:9" || gotBody["resolution"] != "720p" {
		t.Fatalf("body = %#v", gotBody)
	}
}

func TestOpenAIVideoPollParsesNestedVideoURL(t *testing.T) {
	adapter := NewOpenAIAdapter("https://example.test/v1", "test-key")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/videos/video_req_1" {
			t.Fatalf("path = %s, want /v1/videos/video_req_1", r.URL.Path)
		}
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{
			"status": "done",
			"video": map[string]any{
				"url": "https://cdn.example.test/out.mp4",
			},
		})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.VideoPoll(context.Background(), VideoPollRequest{TaskID: "video_req_1"})
	if err != nil {
		t.Fatalf("VideoPoll() error = %v", err)
	}
	if resp.Status != VideoStatusSucceeded || resp.URL != "https://cdn.example.test/out.mp4" {
		t.Fatalf("resp = %+v", resp)
	}
}

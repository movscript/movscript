package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

func TestDashScopeVideoStartSendsHappyHorseMediaPayload(t *testing.T) {
	var gotPath string
	var gotAsync string
	var gotAuth string
	var gotBody map[string]any

	adapter := NewDashScopeAdapter("dash-key", "https://dashscope.test/api/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		gotPath = r.URL.Path
		gotAsync = r.Header.Get("X-DashScope-Async")
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"output": map[string]any{
				"task_id":     "dash_task_1",
				"task_status": "PENDING",
			},
		}), nil
	})}

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:          "happyhorse-1.0-r2v",
		Prompt:         "make a video",
		Duration:       5,
		ResolutionName: "720P",
		Ratio:          "16:9",
		InputImageDataList: []MediaData{
			{PresignedURL: "https://cdn.test/one.png"},
			{PresignedURL: "https://cdn.test/two.png"},
		},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if gotPath != "/api/v1/services/aigc/video-generation/video-synthesis" {
		t.Fatalf("path = %s", gotPath)
	}
	if gotAsync != "enable" {
		t.Fatalf("X-DashScope-Async = %q, want enable", gotAsync)
	}
	if gotAuth != "Bearer dash-key" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	input := gotBody["input"].(map[string]any)
	media := input["media"].([]any)
	if len(media) != 2 {
		t.Fatalf("media count = %d, want 2", len(media))
	}
	params := gotBody["parameters"].(map[string]any)
	if params["resolution"] != "720P" || params["ratio"] != "16:9" {
		t.Fatalf("parameters = %#v", params)
	}
	if resp.TaskID != "dash_task_1" {
		t.Fatalf("TaskID = %q", resp.TaskID)
	}
}

func TestDashScopeVideoPollReturnsSucceededURL(t *testing.T) {
	adapter := NewDashScopeAdapter("dash-key", "https://dashscope.test/api/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/api/v1/tasks/dash_task_1" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"output": map[string]any{
				"task_status": "SUCCEEDED",
				"video_url":   "https://cdn.test/out.mp4",
			},
		}), nil
	})}

	resp, err := adapter.VideoPoll(context.Background(), VideoPollRequest{TaskID: "dash_task_1"})
	if err != nil {
		t.Fatalf("VideoPoll() error = %v", err)
	}
	if resp.Status != VideoStatusSucceeded || resp.URL != "https://cdn.test/out.mp4" {
		t.Fatalf("resp = %#v", resp)
	}
}

func jsonResponse(r *http.Request, status int, body any) *http.Response {
	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(body)
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(&buf),
		Request:    r,
	}
}

package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

func TestViduVideoStartRoutesSingleImageToImg2Video(t *testing.T) {
	var gotPath string
	var gotAuth string
	var gotBody map[string]any

	adapter := NewViduAdapter("vidu-key", "https://vidu.test/ent/v2")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"task_id": "vidu_task_1",
			"state":   "created",
		}), nil
	})}

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:          "viduq1",
		Prompt:         "make a video",
		Duration:       5,
		AspectRatio:    "16:9",
		ResolutionName: "720p",
		InputImageDataList: []MediaData{{
			PresignedURL: "https://cdn.test/ref.png",
		}},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if gotPath != "/ent/v2/img2video" {
		t.Fatalf("path = %s, want /ent/v2/img2video", gotPath)
	}
	if gotAuth != "Token vidu-key" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	images := gotBody["images"].([]any)
	if len(images) != 1 || images[0] != "https://cdn.test/ref.png" {
		t.Fatalf("images = %#v", images)
	}
	if gotBody["duration"] != float64(5) || gotBody["resolution"] != "720p" {
		t.Fatalf("body = %#v", gotBody)
	}
	if resp.TaskID != "vidu_task_1" {
		t.Fatalf("TaskID = %q", resp.TaskID)
	}
}

func TestViduVideoStartRoutesMultipleImagesToReference2Video(t *testing.T) {
	var gotPath string
	var gotSubjects []any

	adapter := NewViduAdapter("vidu-key", "https://vidu.test/ent/v2")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		gotPath = r.URL.Path
		var body map[string]any
		reqBody, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(reqBody, &body); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		gotSubjects = body["subjects"].([]any)
		return jsonResponse(r, http.StatusOK, map[string]any{"task_id": "vidu_task_2"}), nil
	})}

	_, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:  "viduq1",
		Prompt: "make a reference video",
		InputImageDataList: []MediaData{
			{PresignedURL: "https://cdn.test/a.png"},
			{PresignedURL: "https://cdn.test/b.png"},
		},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if gotPath != "/ent/v2/reference2video" {
		t.Fatalf("path = %s, want /ent/v2/reference2video", gotPath)
	}
	if len(gotSubjects) != 2 {
		t.Fatalf("subjects = %#v", gotSubjects)
	}
}

func TestViduVideoPollReturnsCreationURL(t *testing.T) {
	adapter := NewViduAdapter("vidu-key", "https://vidu.test/ent/v2")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/ent/v2/tasks/vidu_task_1/creations" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"state": "success",
			"creations": []map[string]any{{
				"url": "https://cdn.test/out.mp4",
			}},
		}), nil
	})}

	resp, err := adapter.VideoPoll(context.Background(), VideoPollRequest{TaskID: "vidu_task_1"})
	if err != nil {
		t.Fatalf("VideoPoll() error = %v", err)
	}
	if resp.Status != VideoStatusSucceeded || resp.URL != "https://cdn.test/out.mp4" {
		t.Fatalf("resp = %#v", resp)
	}
}

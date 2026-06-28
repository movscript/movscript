package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

func TestYunwuVideoStartUsesNativeCreateEndpoint(t *testing.T) {
	var gotBody map[string]any
	adapter := NewYunwuUnifiedVideoAdapter("test-key", "https://api3.wlai.vip/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/video/create" {
			t.Fatalf("path = %s, want /v1/video/create", r.URL.Path)
		}
		if r.Header.Get("Content-Type") != "application/json" || r.Header.Get("Accept") != "application/json" {
			t.Fatalf("headers Content-Type=%q Accept=%q", r.Header.Get("Content-Type"), r.Header.Get("Accept"))
		}
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{
			"id":     "grok:task-1",
			"status": "pending",
		})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:          "grok-video-3",
		Prompt:         "小猫在吃鱼",
		AspectRatio:    "3:2",
		ResolutionName: "720p",
		InputImageDataList: []MediaData{{
			Bytes:        []byte("fake image bytes"),
			PresignedURL: "https://cdn.example.test/ref.png",
			MimeType:     "image/png",
		}},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if resp.TaskID != "grok:task-1" || resp.Status != VideoStatusQueued {
		t.Fatalf("resp = %+v", resp)
	}
	images, ok := gotBody["images"].([]any)
	if !ok || len(images) != 1 || images[0] != "https://cdn.example.test/ref.png" {
		t.Fatalf("images = %#v", gotBody["images"])
	}
	if gotBody["model"] != "grok-video-3" || gotBody["prompt"] != "小猫在吃鱼" ||
		gotBody["aspect_ratio"] != "3:2" || gotBody["size"] != "720P" {
		t.Fatalf("body = %#v", gotBody)
	}
}

func TestYunwuVideoPollParsesQueryResponse(t *testing.T) {
	adapter := NewYunwuUnifiedVideoAdapter("test-key", "https://yunwu.ai/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/video/query" || r.URL.Query().Get("id") != "grok:task-1" {
			t.Fatalf("url = %s, want /v1/video/query?id=grok:task-1", r.URL.String())
		}
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{
			"id":     "grok:task-1",
			"status": "success",
			"data": map[string]any{
				"video": map[string]any{"url": "https://cdn.example.test/out.mp4"},
			},
		})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.VideoPoll(context.Background(), VideoPollRequest{TaskID: "grok:task-1", TaskKind: "yunwu_video"})
	if err != nil {
		t.Fatalf("VideoPoll() error = %v", err)
	}
	if resp.Status != VideoStatusSucceeded || resp.URL != "https://cdn.example.test/out.mp4" {
		t.Fatalf("resp = %+v", resp)
	}
}

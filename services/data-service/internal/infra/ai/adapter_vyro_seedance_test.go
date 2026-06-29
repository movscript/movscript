package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestVyroSeedanceVideoStartUsesReferenceImagesField(t *testing.T) {
	var gotFiles int
	var gotModel string
	var gotPrompt string

	adapter := NewVyroSeedanceAdapter("test-key", "https://vyro.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/videos" {
			t.Fatalf("path = %s, want /v1/videos", r.URL.Path)
		}
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		gotFiles = len(r.MultipartForm.File["reference_images"])
		if len(r.MultipartForm.File["input_reference[]"]) != 0 {
			t.Fatalf("unexpected input_reference[] files")
		}
		gotModel = r.FormValue("model")
		gotPrompt = r.FormValue("prompt")
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{"id": "task_1", "status": "created"})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:  "vyro-seedance-2-fast",
		Prompt: "make a video",
		InputImageDataList: []MediaData{{
			Bytes:    []byte("fake image bytes"),
			MimeType: "image/png",
		}},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if gotFiles != 1 {
		t.Fatalf("reference_images files = %d, want 1", gotFiles)
	}
	if gotModel != "vyro-seedance-2-fast" || gotPrompt != "make a video" {
		t.Fatalf("model/prompt = %q/%q", gotModel, gotPrompt)
	}
	if resp.TaskID != "task_1" || resp.Status != VideoStatusQueued {
		t.Fatalf("resp = %+v", resp)
	}
}

func TestVyroSeedanceVideoPollParsesMetadataURL(t *testing.T) {
	adapter := NewVyroSeedanceAdapter("test-key", "https://vyro.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/videos/task_1" {
			t.Fatalf("path = %s, want /v1/videos/task_1", r.URL.Path)
		}
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{
			"id":     "task_1",
			"status": "completed",
			"metadata": map[string]any{
				"url": "https://cdn.test/out.mp4",
			},
		})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.VideoPoll(context.Background(), VideoPollRequest{TaskID: "task_1", TaskKind: "vyro_seedance"})
	if err != nil {
		t.Fatalf("VideoPoll() error = %v", err)
	}
	if resp.Status != VideoStatusSucceeded || resp.URL != "https://cdn.test/out.mp4" {
		t.Fatalf("resp = %+v", resp)
	}
}

func TestVyroSeedanceVideoStartReportsBusinessErrorEnvelope(t *testing.T) {
	adapter := NewVyroSeedanceAdapter("test-key", "https://vyro.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body := bytes.NewBufferString(`{"code":"insufficient_user_quota","message":"用户额度不足, 剩余额度: ¥0.000000","data":null}`)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(body),
			Request:    r,
		}, nil
	})}

	_, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:  "vyro-seedance-2-fast",
		Prompt: "make a video",
	})
	if err == nil {
		t.Fatal("VideoStart() error = nil")
	}
	if !strings.Contains(err.Error(), "insufficient_user_quota") || !strings.Contains(err.Error(), "用户额度不足") {
		t.Fatalf("VideoStart() error = %v", err)
	}
}

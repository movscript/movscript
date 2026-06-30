package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDoubao2APIImageGenerateUsesLocalImagesEndpoint(t *testing.T) {
	var seenAuth string
	var seenBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/generations" {
			t.Fatalf("path = %q, want /v1/images/generations", r.URL.Path)
		}
		seenAuth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&seenBody); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"created": 123,
			"data": []map[string]string{{
				"url": "https://cdn.example/doubao.png",
			}},
		})
	}))
	defer server.Close()

	adapter := NewDoubao2APIAdapter("sk-local", server.URL+"/v1")
	resp, err := adapter.ImageGenerate(context.Background(), ImageRequest{
		Model:       "doubao-image",
		Prompt:      "a quiet frame",
		AspectRatio: "16:9",
		N:           2,
	})
	if err != nil {
		t.Fatalf("ImageGenerate() error = %v", err)
	}
	if seenAuth != "Bearer sk-local" {
		t.Fatalf("Authorization = %q", seenAuth)
	}
	if seenBody["model"] != "doubao-image" || seenBody["prompt"] != "a quiet frame" || seenBody["ratio"] != "16:9" {
		t.Fatalf("request body = %#v", seenBody)
	}
	if got := int(seenBody["n"].(float64)); got != 2 {
		t.Fatalf("n = %d, want 2", got)
	}
	if len(resp.URLs) != 1 || resp.URLs[0] != "https://cdn.example/doubao.png" {
		t.Fatalf("URLs = %#v", resp.URLs)
	}
}

func TestDoubao2APIVideoGenerateParsesVideoURL(t *testing.T) {
	var seenBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/video/generations" {
			t.Fatalf("path = %q, want /v1/video/generations", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&seenBody); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"created": 123,
			"data": []map[string]any{{
				"video_url": "https://cdn.example/doubao.mp4",
				"duration":  5.0,
			}},
		})
	}))
	defer server.Close()

	adapter := NewDoubao2APIAdapter("", server.URL+"/v1")
	resp, err := adapter.VideoGenerate(context.Background(), VideoRequest{
		Model:       "doubao-video",
		Prompt:      "a calm camera move",
		AspectRatio: "1024x1792",
		Duration:    5,
	})
	if err != nil {
		t.Fatalf("VideoGenerate() error = %v", err)
	}
	if seenBody["model"] != "doubao-video" || seenBody["prompt"] != "a calm camera move" || seenBody["ratio"] != "9:16" {
		t.Fatalf("request body = %#v", seenBody)
	}
	if resp.Status != VideoStatusSucceeded || resp.URL != "https://cdn.example/doubao.mp4" || resp.DurationSec != 5 {
		t.Fatalf("response = %#v", resp)
	}
}

func TestDoubao2APIVideoGenerateUploadsReferenceImageKey(t *testing.T) {
	var uploadCount int
	var seenBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/images/upload":
			uploadCount++
			if r.Header.Get("Authorization") != "Bearer sk-local" {
				t.Fatalf("upload Authorization = %q", r.Header.Get("Authorization"))
			}
			if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data;") {
				t.Fatalf("upload Content-Type = %q", r.Header.Get("Content-Type"))
			}
			file, header, err := r.FormFile("file")
			if err != nil {
				t.Fatalf("upload form file: %v", err)
			}
			defer file.Close()
			data, err := io.ReadAll(file)
			if err != nil {
				t.Fatalf("read upload file: %v", err)
			}
			if header.Filename != "reference.png" || string(data) != "fake-png" {
				t.Fatalf("uploaded file filename=%q data=%q", header.Filename, string(data))
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"uri": "tos-cn-i-test/ref.png",
				"url": "https://cdn.example/ref.png",
			})
		case "/v1/video/generations":
			if err := json.NewDecoder(r.Body).Decode(&seenBody); err != nil {
				t.Fatalf("decode request: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": []map[string]any{{
					"video_url": "https://cdn.example/doubao.mp4",
				}},
			})
		default:
			t.Fatalf("unexpected path = %q", r.URL.Path)
		}
	}))
	defer server.Close()

	adapter := NewDoubao2APIAdapter("sk-local", server.URL+"/v1")
	_, err := adapter.VideoGenerate(context.Background(), VideoRequest{
		Model:  "doubao-video",
		Prompt: "animate this frame",
		InputImageDataList: []MediaData{{
			Bytes:    []byte("fake-png"),
			MimeType: "image/png",
		}},
	})
	if err != nil {
		t.Fatalf("VideoGenerate() error = %v", err)
	}
	if uploadCount != 1 {
		t.Fatalf("upload count = %d, want 1", uploadCount)
	}
	if seenBody["ref_image_key"] != "tos-cn-i-test/ref.png" {
		t.Fatalf("ref_image_key = %#v, body = %#v", seenBody["ref_image_key"], seenBody)
	}
}

func TestDoubao2APIVideoGenerateUsesExistingReferenceImageKey(t *testing.T) {
	var seenBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/images/upload" {
			t.Fatal("unexpected image upload for existing doubao image key")
		}
		if r.URL.Path != "/v1/video/generations" {
			t.Fatalf("path = %q, want /v1/video/generations", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&seenBody); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{{
				"video_url": "https://cdn.example/doubao.mp4",
			}},
		})
	}))
	defer server.Close()

	adapter := NewDoubao2APIAdapter("", server.URL+"/v1")
	_, err := adapter.VideoGenerate(context.Background(), VideoRequest{
		Model:  "doubao-video",
		Prompt: "animate this frame",
		Image:  "ocean-cloud-tos/existing.png",
	})
	if err != nil {
		t.Fatalf("VideoGenerate() error = %v", err)
	}
	if seenBody["ref_image_key"] != "ocean-cloud-tos/existing.png" {
		t.Fatalf("ref_image_key = %#v, body = %#v", seenBody["ref_image_key"], seenBody)
	}
}

func TestDoubao2APIVideoGenerateDownloadsReferenceImageURLBeforeUpload(t *testing.T) {
	var uploadCount int
	var seenBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ref.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("downloaded-png"))
		case "/v1/images/upload":
			uploadCount++
			file, _, err := r.FormFile("file")
			if err != nil {
				t.Fatalf("upload form file: %v", err)
			}
			defer file.Close()
			data, err := io.ReadAll(file)
			if err != nil {
				t.Fatalf("read upload file: %v", err)
			}
			if string(data) != "downloaded-png" {
				t.Fatalf("uploaded data = %q", string(data))
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"key": "tos-cn-i-test/downloaded.png"})
		case "/v1/video/generations":
			if err := json.NewDecoder(r.Body).Decode(&seenBody); err != nil {
				t.Fatalf("decode request: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": []map[string]any{{
					"video_url": "https://cdn.example/doubao.mp4",
				}},
			})
		default:
			t.Fatalf("unexpected path = %q", r.URL.Path)
		}
	}))
	defer server.Close()

	adapter := NewDoubao2APIAdapter("", server.URL+"/v1")
	_, err := adapter.VideoGenerate(context.Background(), VideoRequest{
		Model:  "doubao-video",
		Prompt: "animate this frame",
		InputImageDataList: []MediaData{{
			PresignedURL: server.URL + "/ref.png",
		}},
	})
	if err != nil {
		t.Fatalf("VideoGenerate() error = %v", err)
	}
	if uploadCount != 1 {
		t.Fatalf("upload count = %d, want 1", uploadCount)
	}
	if seenBody["ref_image_key"] != "tos-cn-i-test/downloaded.png" {
		t.Fatalf("ref_image_key = %#v, body = %#v", seenBody["ref_image_key"], seenBody)
	}
}

func TestDoubao2APIPingRequiresLoggedInHealth(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			t.Fatalf("path = %q, want /health", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":    "not_ready",
			"logged_in": false,
		})
	}))
	defer server.Close()

	adapter := NewDoubao2APIAdapter("", server.URL+"/v1")
	if err := adapter.Ping(context.Background()); err == nil {
		t.Fatal("Ping() error = nil, want not logged in error")
	}
}

func TestDoubao2APIRatioMapsOpenAISizes(t *testing.T) {
	tests := map[string]string{
		"1024x1024": "1:1",
		"1792x1024": "16:9",
		"1024x1792": "9:16",
		"1024x768":  "4:3",
		"768x1024":  "3:4",
	}
	for input, want := range tests {
		if got := doubao2APIRatio(input); got != want {
			t.Fatalf("doubao2APIRatio(%q) = %q, want %q", input, got, want)
		}
	}
}

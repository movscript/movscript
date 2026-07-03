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

	ctx, _ := WithDebugRecorder(context.Background())
	resp, err := adapter.VideoStart(ctx, VideoRequest{
		Model:          "grok-video-3",
		Prompt:         "小猫在吃鱼",
		AspectRatio:    "3:2",
		ResolutionName: "720p",
		InputImageDataList: []MediaData{{
			Bytes:        []byte("fake image bytes"),
			PresignedURL: "https://cdn.example.test/ref.png",
			MimeType:     "image/png",
			ResourceID:   42,
		}},
		ReferenceAssets: []ReferenceAsset{
			{Role: "first_frame", MediaType: "image", ResourceID: 42},
		},
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
	if _, ok := gotBody["reference_asset_bindings"]; ok {
		t.Fatalf("request body sent debug-only bindings: %#v", gotBody["reference_asset_bindings"])
	}
	debugBody := debugRequestBodyMap(t, resp.Debug)
	bindings := debugBody["reference_asset_bindings"].([]any)
	if len(bindings) != 1 || bindings[0].(map[string]any)["provider_field"] != "images[]" {
		t.Fatalf("debug reference_asset_bindings = %#v", bindings)
	}
}

func TestYunwuVideoStartUsesMultipleReferenceMedia(t *testing.T) {
	var gotBody map[string]any
	adapter := NewYunwuUnifiedVideoAdapter("test-key", "https://api3.wlai.vip/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/video/create" {
			t.Fatalf("path = %s, want /v1/video/create", r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{
			"id":     "seedance:task-1",
			"status": "queued",
		})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	ctx, _ := WithDebugRecorder(context.Background())
	resp, err := adapter.VideoStart(ctx, VideoRequest{
		Model:          "doubao-seedance-2-0",
		Prompt:         "全能参考生视频",
		AspectRatio:    "16:9",
		ResolutionName: "720p",
		InputImages:    []string{"asset://portrait-1", "https://cdn.example.test/ref.png"},
		InputVideos:    []string{"https://cdn.example.test/ref-a.mp4"},
		InputVideoDataList: []MediaData{{
			PresignedURL: "https://cdn.example.test/ref-b.mp4",
			MimeType:     "video/mp4",
			ResourceID:   21,
		}},
		InputAudios: []string{"https://cdn.example.test/ref-audio-a.mp3"},
		InputAudioDataList: []MediaData{{
			PresignedURL: "https://cdn.example.test/ref-audio-b.wav",
			MimeType:     "audio/wav",
			ResourceID:   31,
		}},
		ReferenceAssets: []ReferenceAsset{
			{Role: "reference_image", MediaType: "image", ResourceID: 11},
			{Role: "reference_video", MediaType: "video", ResourceID: 21},
			{Role: "reference_audio", MediaType: "audio", ResourceID: 31},
		},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if resp.TaskID != "seedance:task-1" || resp.Status != VideoStatusQueued {
		t.Fatalf("resp = %+v", resp)
	}
	assertYunwuStringList(t, gotBody["images"], []string{"asset://portrait-1", "https://cdn.example.test/ref.png"})
	assertYunwuStringList(t, gotBody["videos"], []string{"https://cdn.example.test/ref-a.mp4", "https://cdn.example.test/ref-b.mp4"})
	assertYunwuStringList(t, gotBody["audios"], []string{"https://cdn.example.test/ref-audio-a.mp3", "https://cdn.example.test/ref-audio-b.wav"})
	if _, ok := gotBody["reference_asset_bindings"]; ok {
		t.Fatalf("request body sent debug-only bindings: %#v", gotBody["reference_asset_bindings"])
	}
	debugBody := debugRequestBodyMap(t, resp.Debug)
	bindings := debugBody["reference_asset_bindings"].([]any)
	if len(bindings) != 3 {
		t.Fatalf("debug reference_asset_bindings = %#v, want 3", bindings)
	}
	if bindings[0].(map[string]any)["provider_field"] != "images[]" ||
		bindings[1].(map[string]any)["provider_field"] != "videos[]" ||
		bindings[2].(map[string]any)["provider_field"] != "audios[]" {
		t.Fatalf("debug reference_asset_bindings = %#v", bindings)
	}
}

func TestYunwuVideoStartRejectsAudioOnlyReferences(t *testing.T) {
	adapter := NewYunwuUnifiedVideoAdapter("test-key", "https://api3.wlai.vip/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		t.Fatalf("unexpected upstream request to %s", r.URL.String())
		return nil, nil
	})}

	_, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:       "doubao-seedance-2-0",
		Prompt:      "只有音频",
		InputAudios: []string{"https://cdn.example.test/ref-audio.mp3"},
	})
	if err == nil {
		t.Fatal("VideoStart() succeeded, want audio-only reference error")
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

func assertYunwuStringList(t *testing.T, got any, want []string) {
	t.Helper()
	values, ok := got.([]any)
	if !ok {
		t.Fatalf("value = %#v, want JSON array", got)
	}
	if len(values) != len(want) {
		t.Fatalf("value = %#v, want %#v", got, want)
	}
	for i, expected := range want {
		if values[i] != expected {
			t.Fatalf("value[%d] = %#v, want %q (full value %#v)", i, values[i], expected, got)
		}
	}
}

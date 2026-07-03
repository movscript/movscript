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
	var gotMode string
	var gotGenerateAudio string
	var gotSize string
	var gotResolution string

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
		gotMode = r.FormValue("mode")
		gotGenerateAudio = r.FormValue("generate_audio")
		gotSize = r.FormValue("size")
		gotResolution = r.FormValue("resolution")
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{"id": "task_1", "status": "created"})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	generateAudio := true
	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:          "vyro-seedance-2-fast",
		Operation:      VideoOperationImageToVideo,
		Prompt:         "make a video",
		AspectRatio:    "16:9",
		Duration:       10,
		Size:           "1080P",
		ResolutionName: "1080p",
		GenerateAudio:  &generateAudio,
		InputImageDataList: []MediaData{{
			Bytes:    []byte("fake image bytes"),
			MimeType: "image/png",
		}},
		ReferenceAssets: []ReferenceAsset{{
			Role:       "reference_image",
			MediaType:  "image",
			ResourceID: 31,
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
	if gotMode != "reference_to_video" || gotGenerateAudio != "1" {
		t.Fatalf("mode/generate_audio = %q/%q, want reference_to_video/1", gotMode, gotGenerateAudio)
	}
	if gotSize != "" || gotResolution != "" {
		t.Fatalf("unexpected undocumented size/resolution fields = %q/%q", gotSize, gotResolution)
	}
	if resp.TaskID != "task_1" || resp.Status != VideoStatusQueued {
		t.Fatalf("resp = %+v", resp)
	}
}

func TestVyroSeedance20VideoStartUsesJSONForReferenceURLs(t *testing.T) {
	var gotBody map[string]any

	adapter := NewVyroSeedanceAdapter("test-key", "https://vyro.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Fatalf("Content-Type = %q, want application/json", ct)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{"id": "task_json", "status": "created"})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	generateAudio := false
	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:          "Seedance-2.0",
		Operation:      VideoOperationReferenceToVideo,
		Prompt:         "make a video",
		AspectRatio:    "16:9",
		Duration:       10,
		ResolutionName: "1080p",
		GenerateAudio:  &generateAudio,
		InputImageDataList: []MediaData{{
			PresignedURL: "https://cdn.test/ref.png",
		}},
		InputAudio: "https://cdn.test/ref.mp3",
		ReferenceAssets: []ReferenceAsset{
			{Role: "reference_image", MediaType: "image", ResourceID: 31},
			{Role: "reference_audio", MediaType: "audio", ResourceID: 32},
		},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if resp.TaskID != "task_json" || resp.Status != VideoStatusQueued {
		t.Fatalf("resp = %+v", resp)
	}
	if gotBody["model"] != "Seedance-2.0" || gotBody["prompt"] != "make a video" {
		t.Fatalf("model/prompt = %#v/%#v", gotBody["model"], gotBody["prompt"])
	}
	if gotBody["generate_audio"] != false || gotBody["resolution"] != "1080p" {
		t.Fatalf("generate_audio/resolution = %#v/%#v", gotBody["generate_audio"], gotBody["resolution"])
	}
	medias, ok := gotBody["medias"].([]any)
	if !ok || len(medias) != 2 {
		t.Fatalf("medias = %#v, want image+audio refs", gotBody["medias"])
	}
	firstMedia, _ := medias[0].(map[string]any)
	secondMedia, _ := medias[1].(map[string]any)
	if firstMedia["role"] != "image" || firstMedia["type"] != nil ||
		secondMedia["role"] != "audio" || secondMedia["type"] != nil {
		t.Fatalf("medias = %#v, want 83zi role+url objects without type", gotBody["medias"])
	}
}

func TestVyroSeedance20VideoStartUsesMultipartForLocalReferenceBytes(t *testing.T) {
	var gotImageFiles int
	var gotAudioFiles int
	var gotVideoFiles int
	var gotGenerateAudio string
	var gotResolution string
	var gotLegacyFiles int

	adapter := NewVyroSeedanceAdapter("test-key", "https://vyro.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		gotImageFiles = len(r.MultipartForm.File["image"])
		gotAudioFiles = len(r.MultipartForm.File["audio"])
		gotVideoFiles = len(r.MultipartForm.File["video"])
		gotLegacyFiles = len(r.MultipartForm.File["reference_images"])
		gotGenerateAudio = r.FormValue("generate_audio")
		gotResolution = r.FormValue("resolution")
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{"id": "task_multipart", "status": "created"})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:          "seedance2-0",
		Operation:      VideoOperationReferenceToVideo,
		Prompt:         "make a video",
		ResolutionName: "720p",
		InputImageDataList: []MediaData{{
			Bytes:    []byte("fake image bytes"),
			MimeType: "image/png",
		}},
		InputAudioData: &MediaData{Bytes: []byte("fake audio bytes"), MimeType: "audio/mpeg"},
		InputVideoData: &MediaData{Bytes: []byte("fake video bytes"), MimeType: "video/mp4"},
		ReferenceAssets: []ReferenceAsset{
			{Role: "reference_image", MediaType: "image", ResourceID: 31},
			{Role: "reference_audio", MediaType: "audio", ResourceID: 32},
			{Role: "reference_video", MediaType: "video", ResourceID: 33},
		},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if resp.TaskID != "task_multipart" || resp.Status != VideoStatusQueued {
		t.Fatalf("resp = %+v", resp)
	}
	if gotImageFiles != 1 || gotAudioFiles != 1 || gotVideoFiles != 1 || gotLegacyFiles != 0 {
		t.Fatalf("file fields image/audio/video/reference_images = %d/%d/%d/%d", gotImageFiles, gotAudioFiles, gotVideoFiles, gotLegacyFiles)
	}
	if gotGenerateAudio != "true" || gotResolution != "720p" {
		t.Fatalf("generate_audio/resolution = %q/%q, want true/720p", gotGenerateAudio, gotResolution)
	}
}

func TestVyroSeedanceDebugBodyIsMultipartProviderSummary(t *testing.T) {
	var gotFiles int
	adapter := NewVyroSeedanceAdapter("test-key", "https://vyro.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		gotFiles = len(r.MultipartForm.File["reference_images"])
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{"id": "task_1", "status": "created"})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	debugCtx, _ := WithDebugRecorder(context.Background())
	_, err := adapter.VideoStart(debugCtx, VideoRequest{
		Model:     "vyro-seedance-2-fast",
		Prompt:    "make a video",
		Operation: VideoOperationReferenceToVideo,
		InputImageDataList: []MediaData{{
			Bytes:    []byte("fake image bytes"),
			MimeType: "image/png",
		}},
		ReferenceAssets: []ReferenceAsset{{
			Role:       "reference_image",
			MediaType:  "image",
			ResourceID: 31,
		}},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if gotFiles != 1 {
		t.Fatalf("reference_images files = %d, want 1", gotFiles)
	}
	debug := takeDebug(debugCtx)
	if debug == nil {
		t.Fatal("debug = nil")
	}
	if debug.RequestShape != "multipart_form_data_summary" {
		t.Fatalf("request_shape = %q, want multipart_form_data_summary", debug.RequestShape)
	}
	if strings.Contains(debug.RequestBody, "reference_asset_bindings") {
		t.Fatalf("debug request body leaked internal reference bindings: %s", debug.RequestBody)
	}
	for _, want := range []string{"model=vyro-seedance-2-fast", "mode=reference_to_video", "generate_audio=1", "reference_images=1"} {
		if !strings.Contains(debug.RequestBody, want) {
			t.Fatalf("debug request body = %q, missing %q", debug.RequestBody, want)
		}
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

package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/movscript/movscript/internal/domain/media"
)

func TestNewAPIVideoStartUsesDocumentedMultipartFields(t *testing.T) {
	var gotFields map[string]string
	var gotInputReferenceFiles int

	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/videos" {
			t.Fatalf("path = %s, want /v1/videos", r.URL.Path)
		}
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		gotFields = map[string]string{}
		for key, values := range r.MultipartForm.Value {
			if len(values) > 0 {
				gotFields[key] = values[0]
			}
		}
		gotInputReferenceFiles = len(r.MultipartForm.File["input_reference[]"])
		body, _ := json.Marshal(map[string]any{
			"id":      "video_1",
			"status":  "queued",
			"seconds": "8",
		})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewReader(body)),
			Request:    r,
		}, nil
	})}
	seed := int64(42)

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:           "sora-test",
		ProtocolProfile: NewAPIProfileSoraVideoMultipart,
		Prompt:          "make a calm product shot",
		Duration:        8,
		Size:            "1280x720",
		Seed:            &seed,
		InputImageDataList: []MediaData{{
			Bytes:    []byte("fake image bytes"),
			MimeType: "image/png",
		}},
		Payload: `{"fps":24,"n":2,"response_format":"url","metadata":{"negative_prompt":"rain"}}`,
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if resp.TaskID != "video_1" || resp.Status != VideoStatusQueued || resp.DurationSec != 8 {
		t.Fatalf("resp = %+v, want queued video_1 duration 8", resp)
	}
	wantImage := base64.StdEncoding.EncodeToString([]byte("fake image bytes"))
	want := map[string]string{
		"model":           "sora-test",
		"prompt":          "make a calm product shot",
		"duration":        "8",
		"width":           "1280",
		"height":          "720",
		"seed":            "42",
		"fps":             "24",
		"n":               "2",
		"response_format": "url",
		"image":           wantImage,
	}
	for key, wantValue := range want {
		if gotFields[key] != wantValue {
			t.Fatalf("%s = %q, want %q; all fields=%#v", key, gotFields[key], wantValue, gotFields)
		}
	}
	if gotFields["metadata"] != `{"negative_prompt":"rain"}` {
		t.Fatalf("metadata = %q", gotFields["metadata"])
	}
	if _, ok := gotFields["seconds"]; ok {
		t.Fatalf("New API video request must not send seconds: %#v", gotFields)
	}
	if gotInputReferenceFiles != 0 {
		t.Fatalf("input_reference[] files = %d, want 0", gotInputReferenceFiles)
	}
}

func TestNewAPIVideoGenerationsProfileUsesJSONAndAspectRatioDimensions(t *testing.T) {
	var got map[string]any
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/video/generations" {
			t.Fatalf("path = %s, want /v1/video/generations", r.URL.Path)
		}
		if ct := r.Header.Get("Content-Type"); !strings.Contains(ct, "application/json") {
			t.Fatalf("content-type = %q, want application/json", ct)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		body := []byte(`{"id":"video_json_1","status":"queued","seconds":6}`)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewReader(body)),
			Request:    r,
		}, nil
	})}
	generateAudio := true

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:           "seedance-test",
		Prompt:          "vertical video",
		Duration:        6,
		AspectRatio:     "9:16",
		Image:           "https://cdn.example.test/ref.png",
		InputImages:     []string{"https://cdn.example.test/second.png"},
		GenerateAudio:   &generateAudio,
		Payload:         `{"fps":24,"metadata":{"negative_prompt":"rain"},"custom_flag":true,"content":[{"type":"image_url","image_url":{"url":"https://cdn.example.test/style.png"}}],"negativePrompt":"low light","protocol_profile":"jimeng_action_json","adapter_type":"openai","api_key":"sk-secret","model_id":"caller-model","req_key":"caller-req-key","reqKey":"caller-req-key-camel"}`,
		ReferenceAssets: []ReferenceAsset{{Role: "reference_image", MediaType: "image", ResourceID: 12}},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if resp.TaskID != "video_json_1" || resp.TaskKind != "new_api_video_generations" || resp.Status != VideoStatusQueued {
		t.Fatalf("resp = %+v, want queued generic task", resp)
	}
	if got["model"] != "seedance-test" || got["prompt"] != "vertical video" || got["duration"].(float64) != 6 {
		t.Fatalf("request body = %#v", got)
	}
	if got["width"].(float64) != 720 || got["height"].(float64) != 1280 {
		t.Fatalf("width/height = %#v/%#v, want 720/1280", got["width"], got["height"])
	}
	if got["size"] != "720x1280" {
		t.Fatalf("size = %#v, want 720x1280", got["size"])
	}
	if got["image"] != "https://cdn.example.test/ref.png" || got["fps"].(float64) != 24 || got["custom_flag"] != true {
		t.Fatalf("request body = %#v", got)
	}
	images, ok := got["images"].([]any)
	if !ok || len(images) != 2 || images[0] != "https://cdn.example.test/ref.png" || images[1] != "https://cdn.example.test/second.png" {
		t.Fatalf("images = %#v, want two task images", got["images"])
	}
	for _, key := range []string{"protocol_profile", "adapter_type", "api_key", "model_id", "req_key", "reqKey"} {
		if _, ok := got[key]; ok {
			t.Fatalf("reserved payload key %q leaked into request body: %#v", key, got)
		}
	}
	metadata, ok := got["metadata"].(map[string]any)
	if !ok || metadata["negative_prompt"] != "rain" || metadata["ratio"] != "9:16" ||
		metadata["aspectRatio"] != "9:16" || metadata["durationSeconds"] != float64(6) ||
		metadata["generate_audio"] != true || metadata["generateAudio"] != true ||
		metadata["negativePrompt"] != "low light" {
		t.Fatalf("metadata = %#v", got["metadata"])
	}
	content, ok := metadata["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("metadata.content = %#v", metadata["content"])
	}
}

func TestNewAPIKlingProfileUsesRootVideoEndpoints(t *testing.T) {
	var gotText map[string]any
	var gotImage map[string]any
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if ct := r.Header.Get("Content-Type"); !strings.Contains(ct, "application/json") {
			t.Fatalf("content-type = %q, want application/json", ct)
		}
		switch r.URL.Path {
		case "/kling/v1/videos/text2video":
			if err := json.NewDecoder(r.Body).Decode(&gotText); err != nil {
				t.Fatalf("decode text request: %v", err)
			}
			body := []byte(`{"data":{"task_id":"kling_text_1"},"task_status":"submitted"}`)
			return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(bytes.NewReader(body)), Request: r}, nil
		case "/kling/v1/videos/image2video":
			if err := json.NewDecoder(r.Body).Decode(&gotImage); err != nil {
				t.Fatalf("decode image request: %v", err)
			}
			body := []byte(`{"task_id":"kling_image_1","status":"queued"}`)
			return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(bytes.NewReader(body)), Request: r}, nil
		default:
			t.Fatalf("path = %s, want New API root-level /kling path", r.URL.Path)
			return nil, nil
		}
	})}

	textResp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:           "kling-test",
		ProtocolProfile: NewAPIProfileKlingVideo,
		Prompt:          "wide establishing shot",
		Duration:        5,
		AspectRatio:     "16:9",
	})
	if err != nil {
		t.Fatalf("VideoStart(text) error = %v", err)
	}
	if textResp.TaskID != "kling_text_1" || textResp.TaskKind != "new_api_kling_text2video" || textResp.Status != VideoStatusQueued {
		t.Fatalf("text resp = %+v, want queued kling text task", textResp)
	}
	if gotText["model"] != "kling-test" || gotText["prompt"] != "wide establishing shot" ||
		gotText["duration"] != float64(5) || gotText["aspect_ratio"] != "16:9" {
		t.Fatalf("text request body = %#v", gotText)
	}
	if _, ok := gotText["image"]; ok {
		t.Fatalf("text request must not include image: %#v", gotText)
	}

	imageResp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:           "kling-test",
		ProtocolProfile: NewAPIProfileKlingVideo,
		Operation:       VideoOperationImageToVideo,
		Prompt:          "animate the product",
		Payload:         `{"image":"https://cdn.example.test/ref.png","mode":"standard"}`,
	})
	if err != nil {
		t.Fatalf("VideoStart(image) error = %v", err)
	}
	if imageResp.TaskID != "kling_image_1" || imageResp.TaskKind != "new_api_kling_image2video" || imageResp.Status != VideoStatusQueued {
		t.Fatalf("image resp = %+v, want queued kling image task", imageResp)
	}
	if gotImage["image"] != "https://cdn.example.test/ref.png" || gotImage["mode"] != "standard" {
		t.Fatalf("image request body = %#v", gotImage)
	}
}

func TestNewAPIKlingPollInfersProfileFromTaskKind(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/kling/v1/videos/image2video/kling_image_1" {
			t.Fatalf("path = %s, want image2video poll path", r.URL.Path)
		}
		body := []byte(`{
			"data":{
				"task_id":"kling_image_1",
				"task_status":"succeed",
				"task_result":{"videos":[{"url":"https://cdn.example.test/out.mp4"}]},
				"metadata":{"duration":5}
			}
		}`)
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(bytes.NewReader(body)), Request: r}, nil
	})}

	resp, err := adapter.VideoPoll(context.Background(), VideoPollRequest{
		TaskID:   "kling_image_1",
		TaskKind: "new_api_kling_image2video",
	})
	if err != nil {
		t.Fatalf("VideoPoll() error = %v", err)
	}
	if resp.TaskID != "kling_image_1" || resp.TaskKind != "new_api_kling_image2video" ||
		resp.Status != VideoStatusSucceeded || resp.URL != "https://cdn.example.test/out.mp4" || resp.DurationSec != 5 {
		t.Fatalf("resp = %+v, want succeeded inferred kling image task", resp)
	}
}

func TestNewAPIJimengProfileUsesActionEndpoint(t *testing.T) {
	var got map[string]any
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/jimeng/" {
			t.Fatalf("path = %s, want /jimeng/", r.URL.Path)
		}
		if r.URL.Query().Get("Action") != "CVSync2AsyncSubmitTask" || r.URL.Query().Get("Version") != "2022-08-31" {
			t.Fatalf("query = %s, want submit action/version", r.URL.RawQuery)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		body := []byte(`{"code":10000,"data":{"task_id":"jimeng_task_1"},"status":"in_queue"}`)
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(bytes.NewReader(body)), Request: r}, nil
	})}
	seed := int64(42)

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:           "jimeng_v30",
		ProtocolProfile: NewAPIProfileJimengAction,
		Operation:       VideoOperationImageToVideo,
		Prompt:          "animate the product",
		Duration:        10,
		AspectRatio:     "16:9",
		Seed:            &seed,
		InputImages:     []string{"https://cdn.example.test/ref.png"},
		Payload:         `{"custom_flag":true,"req_key":"caller-override","model":"caller-model","protocol_profile":"video_generations_json","Authorization":"Bearer caller-secret"}`,
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if resp.TaskID != "jimeng_task_1" || resp.TaskKind != "new_api_jimeng_action" || resp.Status != VideoStatusQueued {
		t.Fatalf("resp = %+v, want queued jimeng action task", resp)
	}
	if got["req_key"] != "caller-override" || got["model"] != "caller-override" || got["prompt"] != "animate the product" ||
		got["frames"] != float64(241) || got["aspect_ratio"] != "16:9" ||
		got["seed"] != float64(42) || got["custom_flag"] != true {
		t.Fatalf("request body = %#v", got)
	}
	for _, key := range []string{"protocol_profile", "Authorization"} {
		if _, ok := got[key]; ok {
			t.Fatalf("reserved payload key %q leaked into request body: %#v", key, got)
		}
	}
	imageURLs, ok := got["image_urls"].([]any)
	if !ok || len(imageURLs) != 1 || imageURLs[0] != "https://cdn.example.test/ref.png" {
		t.Fatalf("image_urls = %#v, want one URL image", got["image_urls"])
	}
	if _, ok := got["binary_data_base64"]; ok {
		t.Fatalf("URL image request must not include binary_data_base64: %#v", got)
	}
}

func TestNewAPIJimengRequiresReqKeyOrProviderModelID(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		t.Fatalf("unexpected upstream request without req_key/model")
		return nil, nil
	})}

	_, err := adapter.VideoStart(context.Background(), VideoRequest{
		ProtocolProfile: NewAPIProfileJimengAction,
		Operation:       VideoOperationPromptToVideo,
		Prompt:          "make a video",
	})
	if err == nil || !strings.Contains(err.Error(), "req_key/provider_model_id is required") {
		t.Fatalf("VideoStart() error = %v, want req_key/provider_model_id error", err)
	}
}

func TestNewAPIJimengImageToVideoRequiresImage(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		t.Fatalf("unexpected upstream request without image")
		return nil, nil
	})}

	_, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:           "jimeng_v30",
		ProtocolProfile: NewAPIProfileJimengAction,
		Operation:       VideoOperationImageToVideo,
		Prompt:          "animate the product",
	})
	if err == nil || !strings.Contains(err.Error(), "requires image input") {
		t.Fatalf("VideoStart() error = %v, want requires image input", err)
	}
}

func TestNewAPIJimengFirstLastFrameUsesTwoImageInputs(t *testing.T) {
	var got map[string]any
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/jimeng/" {
			t.Fatalf("path = %s, want /jimeng/", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		body := []byte(`{"code":10000,"data":{"task_id":"jimeng_task_first_last"},"status":"in_queue"}`)
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(bytes.NewReader(body)), Request: r}, nil
	})}

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:           "jimeng_v30",
		ProtocolProfile: NewAPIProfileJimengAction,
		Operation:       VideoOperationFirstLastFrameToVideo,
		Prompt:          "interpolate the action",
		InputImageDataList: []MediaData{
			{PresignedURL: "https://cdn.example.test/first.png", ResourceID: 1},
			{PresignedURL: "https://cdn.example.test/last.png", ResourceID: 2},
		},
		ReferenceAssets: []ReferenceAsset{
			{Role: "first_frame", MediaType: "image", ResourceID: 1},
			{Role: "last_frame", MediaType: "image", ResourceID: 2},
		},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if resp.TaskID != "jimeng_task_first_last" || resp.TaskKind != "new_api_jimeng_action" {
		t.Fatalf("resp = %+v, want jimeng first/last task", resp)
	}
	imageURLs, ok := got["image_urls"].([]any)
	if !ok || len(imageURLs) != 2 ||
		imageURLs[0] != "https://cdn.example.test/first.png" ||
		imageURLs[1] != "https://cdn.example.test/last.png" {
		t.Fatalf("image_urls = %#v, want ordered first/last URLs", got["image_urls"])
	}
	if got["req_key"] != "jimeng_v30" {
		t.Fatalf("req_key = %#v, want route model req_key", got["req_key"])
	}
}

func TestNewAPIJimengFirstLastFrameRequiresTwoImages(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		t.Fatalf("unexpected upstream request without two images")
		return nil, nil
	})}

	_, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:           "jimeng_v30",
		ProtocolProfile: NewAPIProfileJimengAction,
		Operation:       VideoOperationFirstLastFrameToVideo,
		Prompt:          "interpolate the action",
		InputImages:     []string{"https://cdn.example.test/first.png"},
	})
	if err == nil || !strings.Contains(err.Error(), "requires two image inputs") {
		t.Fatalf("VideoStart() error = %v, want requires two image inputs", err)
	}
}

func TestNewAPIJimengPollUsesGenericTaskEndpoint(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		if r.URL.Path != "/v1/video/generations/jimeng_task_1" {
			t.Fatalf("path = %s, want /v1/video/generations/jimeng_task_1", r.URL.Path)
		}
		body := []byte(`{"code":"success","data":{"task_id":"jimeng_task_1","status":"succeeded","metadata":{"url":"https://cdn.example.test/out.mp4"}}}`)
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(bytes.NewReader(body)), Request: r}, nil
	})}

	resp, err := adapter.VideoPoll(context.Background(), VideoPollRequest{
		Model:    "jimeng_v30",
		TaskID:   "jimeng_task_1",
		TaskKind: "new_api_jimeng_action",
	})
	if err != nil {
		t.Fatalf("VideoPoll() error = %v", err)
	}
	if resp.TaskID != "jimeng_task_1" || resp.TaskKind != "new_api_jimeng_action" ||
		resp.Status != VideoStatusSucceeded || resp.URL != "https://cdn.example.test/out.mp4" {
		t.Fatalf("resp = %+v, want succeeded jimeng action task", resp)
	}
}

func TestNewAPIGatewayRootURLStripsV1Suffix(t *testing.T) {
	cases := map[string]string{
		"https://newapi.test/v1":  "https://newapi.test",
		"https://newapi.test/v1/": "https://newapi.test",
		"https://newapi.test/api": "https://newapi.test/api",
	}
	for input, want := range cases {
		if got := newAPIGatewayRootURL(input); got != want {
			t.Fatalf("newAPIGatewayRootURL(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestNewAPIRejectsMismatchedProtocolProfileBeforeUpstreamCall(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		t.Fatalf("unexpected upstream request for mismatched protocol profile")
		return nil, nil
	})}

	_, err := adapter.ImageGenerate(context.Background(), ImageRequest{
		Model:           "gpt-image-2",
		ProtocolProfile: NewAPIProfileVideoGenerations,
		Prompt:          "draw",
	})
	if err == nil || !strings.Contains(err.Error(), "requires capability") {
		t.Fatalf("ImageGenerate() error = %v, want capability mismatch", err)
	}

	_, err = adapter.TextGenerate(context.Background(), TextRequest{
		Model:           "gpt-test",
		ProtocolProfile: NewAPIProfileOpenAIResponses,
		Messages:        []Message{{Role: "user", Content: "hello"}},
	})
	if err == nil || !strings.Contains(err.Error(), "does not support operation") {
		t.Fatalf("TextGenerate() error = %v, want operation mismatch", err)
	}

	_, err = adapter.ResponsesGenerate(context.Background(), ResponsesRequest{
		Text: TextRequest{
			Model:           "claude-test",
			ProtocolProfile: NewAPIProfileClaudeMessages,
			Messages:        []Message{{Role: "user", Content: "hello"}},
		},
	})
	if err == nil || !strings.Contains(err.Error(), "does not support operation") {
		t.Fatalf("ResponsesGenerate() error = %v, want operation mismatch", err)
	}
}

func TestNewAPIVideoStartRejectsSensitiveUserAndMetadata(t *testing.T) {
	cases := []struct {
		name    string
		payload string
		want    string
	}{
		{
			name:    "user email",
			payload: `{"user":"owner@example.com"}`,
			want:    "user must not contain",
		},
		{
			name:    "metadata api key",
			payload: `{"metadata":{"api_key":"sk-secret"}}`,
			want:    "sensitive key",
		},
		{
			name:    "metadata protocol profile",
			payload: `{"metadata":{"protocol_profile":"jimeng_action_json"}}`,
			want:    "reserved key",
		},
		{
			name:    "metadata nested email",
			payload: `{"metadata":{"owner":{"email":"owner@example.com"}}}`,
			want:    "sensitive key",
		},
		{
			name:    "metadata token value",
			payload: `{"metadata":{"note":"token=secret"}}`,
			want:    "must not contain",
		},
		{
			name:    "metadata not object",
			payload: `{"metadata":"plain text"}`,
			want:    "must be a JSON object",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var calls int
			adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
			adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				calls++
				t.Fatalf("unexpected upstream request with unsafe payload")
				return nil, nil
			})}

			_, err := adapter.VideoStart(context.Background(), VideoRequest{
				Model:           "sora-test",
				ProtocolProfile: NewAPIProfileSoraVideoMultipart,
				Prompt:          "video",
				Duration:        4,
				Size:            "1280x720",
				Payload:         tc.payload,
			})
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("VideoStart() error = %v, want %q", err, tc.want)
			}
			if calls != 0 {
				t.Fatalf("upstream calls = %d, want 0", calls)
			}
		})
	}
}

func TestNewAPIVideoPollDownloadsContentWhenSucceeded(t *testing.T) {
	var contentCalls int
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/videos/video_1":
			body, _ := json.Marshal(map[string]any{
				"id":       "video_1",
				"status":   "completed",
				"progress": 100,
				"seconds":  "8",
			})
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(bytes.NewReader(body)),
				Request:    r,
			}, nil
		case "/v1/videos/video_1/content":
			contentCalls++
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"video/mp4"}},
				Body:       io.NopCloser(bytes.NewReader([]byte("mp4-bytes"))),
				Request:    r,
			}, nil
		default:
			t.Fatalf("unexpected path = %s", r.URL.Path)
			return nil, nil
		}
	})}

	resp, err := adapter.VideoPoll(context.Background(), VideoPollRequest{ProtocolProfile: NewAPIProfileSoraVideoMultipart, TaskID: "video_1"})
	if err != nil {
		t.Fatalf("VideoPoll() error = %v", err)
	}
	if resp.TaskID != "video_1" || resp.TaskKind != "new_api_video" ||
		resp.Status != VideoStatusSucceeded || string(resp.ContentBytes) != "mp4-bytes" || resp.DurationSec != 8 {
		t.Fatalf("resp = %+v, want succeeded downloaded content", resp)
	}
	if contentCalls != 1 {
		t.Fatalf("content calls = %d, want 1", contentCalls)
	}
}

func TestNewAPIVideoStartDownloadsContentWhenImmediateSuccessHasNoURL(t *testing.T) {
	var contentCalls int
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/videos":
			body := []byte(`{"id":"video_1","status":"succeeded","seconds":6}`)
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(bytes.NewReader(body)),
				Request:    r,
			}, nil
		case "/v1/videos/video_1/content":
			contentCalls++
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"video/mp4"}},
				Body:       io.NopCloser(bytes.NewReader([]byte("start-mp4-bytes"))),
				Request:    r,
			}, nil
		default:
			t.Fatalf("unexpected path = %s", r.URL.Path)
			return nil, nil
		}
	})}

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{Model: "sora-test", ProtocolProfile: NewAPIProfileSoraVideoMultipart, Prompt: "video", Duration: 6})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if resp.TaskID != "video_1" || resp.TaskKind != "new_api_video" ||
		resp.Status != VideoStatusSucceeded || string(resp.ContentBytes) != "start-mp4-bytes" || resp.DurationSec != 6 {
		t.Fatalf("resp = %+v, want immediate success downloaded content with task metadata", resp)
	}
	if contentCalls != 1 {
		t.Fatalf("content calls = %d, want 1", contentCalls)
	}
}

func TestNewAPIVideoStartContentDownloadFailureKeepsTaskID(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/videos":
			body := []byte(`{"id":"video_1","status":"succeeded","seconds":6}`)
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(bytes.NewReader(body)),
				Request:    r,
			}, nil
		case "/v1/videos/video_1/content":
			return &http.Response{
				StatusCode: http.StatusBadGateway,
				Header:     http.Header{"Content-Type": []string{"text/plain"}},
				Body:       io.NopCloser(strings.NewReader("content unavailable")),
				Request:    r,
			}, nil
		default:
			t.Fatalf("unexpected path = %s", r.URL.Path)
			return nil, nil
		}
	})}

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{Model: "sora-test", ProtocolProfile: NewAPIProfileSoraVideoMultipart, Prompt: "video", Duration: 6})
	if err == nil || !strings.Contains(err.Error(), "content unavailable") {
		t.Fatalf("VideoStart() error = %v, want content unavailable", err)
	}
	if resp.TaskID != "video_1" || resp.TaskKind != "new_api_video" || resp.DurationSec != 6 {
		t.Fatalf("resp = %+v, want failed content download to preserve task metadata", resp)
	}
}

func TestNewAPIVideoPollContentDownloadFailureKeepsTaskID(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/videos/video_1":
			body := []byte(`{"id":"video_1","status":"succeeded","seconds":8}`)
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(bytes.NewReader(body)),
				Request:    r,
			}, nil
		case "/v1/videos/video_1/content":
			return &http.Response{
				StatusCode: http.StatusBadGateway,
				Header:     http.Header{"Content-Type": []string{"text/plain"}},
				Body:       io.NopCloser(strings.NewReader("content unavailable")),
				Request:    r,
			}, nil
		default:
			t.Fatalf("unexpected path = %s", r.URL.Path)
			return nil, nil
		}
	})}

	resp, err := adapter.VideoPoll(context.Background(), VideoPollRequest{ProtocolProfile: NewAPIProfileSoraVideoMultipart, TaskID: "video_1"})
	if err == nil || !strings.Contains(err.Error(), "content unavailable") {
		t.Fatalf("VideoPoll() error = %v, want content unavailable", err)
	}
	if resp.TaskID != "video_1" || resp.TaskKind != "new_api_video" || resp.DurationSec != 8 {
		t.Fatalf("resp = %+v, want failed content download to preserve task metadata", resp)
	}
}

func TestNewAPIVideoStartFailedStatusKeepsTaskIDAndMessage(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/videos" {
			t.Fatalf("path = %s, want /v1/videos", r.URL.Path)
		}
		body := []byte(`{"id":"video_failed","status":"failed","error":{"message":"prompt rejected"},"seconds":4}`)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewReader(body)),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:           "sora-test",
		ProtocolProfile: NewAPIProfileSoraVideoMultipart,
		Prompt:          "bad prompt",
		Duration:        4,
		Size:            "1280x720",
	})
	if err == nil || !strings.Contains(err.Error(), "prompt rejected") {
		t.Fatalf("VideoStart() error = %v, want prompt rejected", err)
	}
	if resp.TaskID != "video_failed" || resp.Status != VideoStatusFailed || !strings.Contains(resp.Message, "prompt rejected") {
		t.Fatalf("resp = %+v, want failed task id and message", resp)
	}
}

func TestNewAPIFetchModelsUsesModelsEndpoint(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/models" {
			t.Fatalf("path = %s, want /v1/models", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("Authorization = %q", r.Header.Get("Authorization"))
		}
		body := []byte(`{"object":"list","data":[{"id":"gpt-test"},{"id":"sora-test"}]}`)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewReader(body)),
			Request:    r,
		}, nil
	})}

	ids, err := adapter.FetchModels(context.Background())
	if err != nil {
		t.Fatalf("FetchModels() error = %v", err)
	}
	if len(ids) != 2 || ids[0] != "gpt-test" || ids[1] != "sora-test" {
		t.Fatalf("ids = %#v", ids)
	}
}

func TestNewAPIFetchModelsSurfacesAuthErrorsWithDebugStatus(t *testing.T) {
	for _, tc := range []struct {
		name       string
		statusCode int
		message    string
	}{
		{name: "401", statusCode: http.StatusUnauthorized, message: "bad key"},
		{name: "403", statusCode: http.StatusForbidden, message: "forbidden model listing"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
			adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				if r.URL.Path != "/v1/models" {
					t.Fatalf("path = %s, want /v1/models", r.URL.Path)
				}
				body, _ := json.Marshal(map[string]any{"error": map[string]any{"message": tc.message}})
				return &http.Response{
					StatusCode: tc.statusCode,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body:       io.NopCloser(bytes.NewReader(body)),
					Request:    r,
				}, nil
			})}
			ctx, debug := WithDebugRecorder(context.Background())

			_, err := adapter.FetchModels(ctx)
			statusText := strconv.Itoa(tc.statusCode)
			if err == nil || !strings.Contains(err.Error(), statusText) || !strings.Contains(err.Error(), tc.message) {
				t.Fatalf("FetchModels() error = %v, want %s %s", err, statusText, tc.message)
			}
			if debug.ResponseStatus != tc.statusCode || debug.Endpoint != "https://newapi.test/v1/models" {
				t.Fatalf("debug = %+v, want models %d endpoint", debug, tc.statusCode)
			}
		})
	}
}

func TestNewAPIPingUsesModelsEndpointAndSurfacesAuthErrors(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/models" {
			t.Fatalf("request = %s %s, want GET /v1/models", r.Method, r.URL.Path)
		}
		body, _ := json.Marshal(map[string]any{"error": map[string]any{"message": "forbidden model listing"}})
		return &http.Response{
			StatusCode: http.StatusForbidden,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewReader(body)),
			Request:    r,
		}, nil
	})}
	ctx, debug := WithDebugRecorder(context.Background())

	err := adapter.Ping(ctx)
	if err == nil || !strings.Contains(err.Error(), "403") || !strings.Contains(err.Error(), "forbidden model listing") {
		t.Fatalf("Ping() error = %v, want 403 forbidden model listing", err)
	}
	if debug.Method != http.MethodGet || debug.Endpoint != "https://newapi.test/v1/models" || debug.ResponseStatus != http.StatusForbidden {
		t.Fatalf("debug = %+v, want GET /models 403", debug)
	}
}

func TestNewAPIFetchModelsHonorsHTTPTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer server.Close()
	adapter := NewNewAPIAdapter("test-key", server.URL+"/v1")
	adapter.rawHTTP.Timeout = 10 * time.Millisecond

	_, err := adapter.FetchModels(context.Background())
	if err == nil {
		t.Fatal("FetchModels() error = nil, want timeout")
	}
	if !strings.Contains(err.Error(), "timeout") && !strings.Contains(err.Error(), "deadline") {
		t.Fatalf("FetchModels() error = %v, want timeout/deadline", err)
	}
}

func TestNewAPITextGenerateKeepsReasoningOutOfUserContentAndParsesToolCalls(t *testing.T) {
	var got map[string]any
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("path = %s, want /v1/chat/completions", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		body := []byte(`{
			"id":"chatcmpl-newapi",
			"choices":[{
				"message":{
					"role":"assistant",
					"content":"visible answer",
					"reasoning_content":"hidden rationale",
					"tool_calls":[{"id":"call_1","type":"function","function":{"name":"lookup_scene","arguments":"{\"q\":\"rain\"}"}}]
				},
				"finish_reason":"tool_calls"
			}],
			"usage":{"prompt_tokens":9,"completion_tokens":4,"prompt_tokens_details":{"cached_tokens":2},"completion_tokens_details":{"reasoning_tokens":3}}
		}`)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewReader(body)),
			Request:    r,
		}, nil
	})}
	ctx, debug := WithDebugRecorder(context.Background())

	resp, err := adapter.TextGenerate(ctx, TextRequest{
		Model:    "gpt-test",
		Messages: []Message{{Role: "user", Content: "find rain scene"}},
		Tools:    json.RawMessage(`[{"type":"function","function":{"name":"lookup_scene","parameters":{"type":"object"}}}]`),
	})
	if err != nil {
		t.Fatalf("TextGenerate() error = %v", err)
	}
	if got["model"] != "gpt-test" {
		t.Fatalf("request body = %#v", got)
	}
	if resp.Content != "visible answer" || strings.Contains(resp.Content, "hidden rationale") {
		t.Fatalf("content = %q, want visible answer without reasoning", resp.Content)
	}
	if resp.FinishReason != "tool_calls" || len(resp.ToolCalls) != 1 ||
		resp.ToolCalls[0].ID != "call_1" || resp.ToolCalls[0].Function.Name != "lookup_scene" ||
		resp.ToolCalls[0].Function.Arguments != `{"q":"rain"}` {
		t.Fatalf("tool calls = %#v", resp.ToolCalls)
	}
	if resp.Usage.InputTokens != 9 || resp.Usage.OutputTokens != 4 ||
		resp.Usage.CachedInputTokens != 2 || resp.Usage.ReasoningTokens != 3 {
		t.Fatalf("usage = %#v", resp.Usage)
	}
	if !strings.Contains(debug.ResponseBody, "hidden rationale") {
		t.Fatalf("debug response body = %q, want raw reasoning retained for diagnostics", debug.ResponseBody)
	}
}

func TestNewAPITextStreamParsesReasoningToolCallsAndUsage(t *testing.T) {
	var got map[string]any
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("path = %s, want /v1/chat/completions", r.URL.Path)
		}
		if r.Header.Get("Accept") != "text/event-stream" {
			t.Fatalf("accept = %q, want text/event-stream", r.Header.Get("Accept"))
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		body := strings.Join([]string{
			`data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"think ","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"lookup_scene","arguments":"{\"q\""}}]}}]}`,
			`data: {"choices":[{"delta":{"content":"visible"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"prompt_tokens_details":{"cached_tokens":1},"completion_tokens_details":{"reasoning_tokens":3}}}`,
			`data: [DONE]`,
			``,
		}, "\n")
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
			Body:       io.NopCloser(strings.NewReader(body)),
			Request:    r,
		}, nil
	})}

	stream, err := adapter.TextStream(context.Background(), TextRequest{
		Model:    "gpt-test",
		Messages: []Message{{Role: "user", Content: "stream"}},
	})
	if err != nil {
		t.Fatalf("TextStream() error = %v", err)
	}
	var events []TextStreamEvent
	for event := range stream {
		events = append(events, event)
	}
	if got["stream"] != true {
		t.Fatalf("request body = %#v, want stream true", got)
	}
	if _, ok := got["stream_options"].(map[string]any); !ok {
		t.Fatalf("stream_options = %#v, want include_usage map", got["stream_options"])
	}
	if len(events) != 3 {
		t.Fatalf("events = %#v", events)
	}
	if events[0].Role != "assistant" || events[0].ReasoningDelta != "think " ||
		len(events[0].ToolCallDeltas) != 1 || events[0].ToolCallDeltas[0].ID != "call_1" ||
		events[0].ToolCallDeltas[0].Function.Name != "lookup_scene" {
		t.Fatalf("first event = %#v", events[0])
	}
	if events[1].ContentDelta != "visible" || events[1].FinishReason != "stop" ||
		events[1].Usage.InputTokens != 5 || events[1].Usage.OutputTokens != 2 ||
		events[1].Usage.CachedInputTokens != 1 || events[1].Usage.ReasoningTokens != 3 {
		t.Fatalf("second event = %#v", events[1])
	}
	if !events[2].Done {
		t.Fatalf("final event = %#v, want Done", events[2])
	}
}

func TestNewAPIClaudeMessagesProfileUsesMessagesEndpoint(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" {
			t.Fatalf("path = %q, want /v1/messages", r.URL.Path)
		}
		if r.Header.Get("x-api-key") != "test-key" {
			t.Fatalf("x-api-key = %q, want test-key", r.Header.Get("x-api-key"))
		}
		if r.Header.Get("anthropic-version") == "" {
			t.Fatalf("anthropic-version header is empty")
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id":"msg_1",
			"type":"message",
			"role":"assistant",
			"model":"claude-test",
			"content":[{"type":"text","text":"pong"}],
			"stop_reason":"end_turn",
			"usage":{"input_tokens":5,"output_tokens":2,"cache_read_input_tokens":1}
		}`))
	}))
	defer server.Close()

	adapter := NewNewAPIAdapter("test-key", server.URL+"/v1")
	resp, err := adapter.TextGenerate(context.Background(), TextRequest{
		Model:           "claude-test",
		ProtocolProfile: NewAPIProfileClaudeMessages,
		MaxTokens:       256,
		Messages:        []Message{{Role: "user", Content: "ping"}},
	})
	if err != nil {
		t.Fatalf("TextGenerate() error = %v", err)
	}
	if got["model"] != "claude-test" || got["max_tokens"] != float64(256) {
		t.Fatalf("request body = %#v", got)
	}
	if resp.Content != "pong" || resp.FinishReason != "end_turn" ||
		resp.Usage.InputTokens != 5 || resp.Usage.OutputTokens != 2 || resp.Usage.CachedInputTokens != 1 {
		t.Fatalf("resp = %+v", resp)
	}
}

func TestNewAPIClaudeMessagesProfileStreamsMessagesEndpoint(t *testing.T) {
	var sawStream bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" {
			t.Fatalf("path = %q, want /v1/messages", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		sawStream = strings.Contains(string(body), `"stream":true`)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(`event: message_start
data: {"type":"message_start","message":{"model":"claude-test","id":"msg_1","type":"message","role":"assistant","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":5,"cache_creation_input_tokens":0,"cache_read_input_tokens":1,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"pong"}}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":5,"cache_creation_input_tokens":0,"cache_read_input_tokens":1,"output_tokens":2}}

event: message_stop
data: {"type":"message_stop"}

`))
	}))
	defer server.Close()

	adapter := NewNewAPIAdapter("test-key", server.URL+"/v1")
	stream, err := adapter.TextStream(context.Background(), TextRequest{
		Model:           "claude-test",
		ProtocolProfile: NewAPIProfileClaudeMessages,
		Messages:        []Message{{Role: "user", Content: "ping"}},
	})
	if err != nil {
		t.Fatalf("TextStream() error = %v", err)
	}
	var text string
	var finishReason string
	var done bool
	for event := range stream {
		if event.Error != "" {
			t.Fatalf("unexpected stream error: %s", event.Error)
		}
		text += event.ContentDelta
		if event.FinishReason != "" {
			finishReason = event.FinishReason
		}
		if event.Done {
			done = true
		}
	}
	if !sawStream {
		t.Fatal("stream request did not include stream=true")
	}
	if text != "pong" || finishReason != "end_turn" || !done {
		t.Fatalf("stream text=%q finish=%q done=%v", text, finishReason, done)
	}
}

func TestNewAPIGeminiGenerateContentProfileUsesNativeEndpoint(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/models/gemini-2.5-flash:generateContent" {
			t.Fatalf("path = %q, want /v1beta/models/gemini-2.5-flash:generateContent", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("Authorization = %q, want bearer key", r.Header.Get("Authorization"))
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"candidates":[{
				"content":{"role":"model","parts":[{"text":"pong"}]},
				"finishReason":"STOP"
			}],
			"usageMetadata":{"promptTokenCount":7,"candidatesTokenCount":3,"cachedContentTokenCount":2,"thoughtsTokenCount":1,"totalTokenCount":10}
		}`))
	}))
	defer server.Close()

	adapter := NewNewAPIAdapter("test-key", server.URL+"/v1")
	resp, err := adapter.TextGenerate(context.Background(), TextRequest{
		Model:           "gemini-2.5-flash",
		ProtocolProfile: NewAPIProfileGeminiGenerateContent,
		MaxTokens:       512,
		Temperature:     0.25,
		Messages: []Message{
			{Role: "system", Content: "Be terse."},
			{Role: "user", Content: "ping"},
		},
	})
	if err != nil {
		t.Fatalf("TextGenerate() error = %v", err)
	}
	if _, ok := got["systemInstruction"].(map[string]any); !ok {
		t.Fatalf("systemInstruction = %#v", got["systemInstruction"])
	}
	generationConfig, _ := got["generationConfig"].(map[string]any)
	if generationConfig["maxOutputTokens"] != float64(512) || generationConfig["temperature"] != 0.25 {
		t.Fatalf("generationConfig = %#v", generationConfig)
	}
	if resp.Content != "pong" || resp.FinishReason != "STOP" ||
		resp.Usage.InputTokens != 7 || resp.Usage.OutputTokens != 3 ||
		resp.Usage.CachedInputTokens != 2 || resp.Usage.ReasoningTokens != 1 {
		t.Fatalf("resp = %+v", resp)
	}
}

func TestNewAPIGeminiImageProfileUsesNativeGenerateContentEndpoint(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/models/gemini-3-pro-image-preview:generateContent" {
			t.Fatalf("path = %q, want /v1beta/models/gemini-3-pro-image-preview:generateContent", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("Authorization = %q, want bearer key", r.Header.Get("Authorization"))
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"candidates":[{
				"content":{"role":"model","parts":[
					{"text":"done"},
					{"inlineData":{"mimeType":"image/png","data":"aGVsbG8="}}
				]},
				"finishReason":"STOP"
			}],
			"usageMetadata":{"promptTokenCount":7,"candidatesTokenCount":3}
		}`))
	}))
	defer server.Close()

	adapter := NewNewAPIAdapter("test-key", server.URL+"/v1")
	seed := int64(123)
	resp, err := adapter.ImageGenerate(context.Background(), ImageRequest{
		Model:           "gemini-3-pro-image-preview",
		ProtocolProfile: NewAPIProfileGeminiImages,
		Operation:       ImageOperationEditImage,
		Prompt:          "make the product warmer",
		InputImageBytes: []byte("input-png"),
		InputImageMime:  "image/png",
		N:               2,
		Seed:            &seed,
		ReferenceAssets: []ReferenceAsset{{Role: "reference_image", ResourceID: 7}},
		ExtraParams:     map[string]any{"safety_settings": []map[string]string{{"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}}},
	})
	if err != nil {
		t.Fatalf("ImageGenerate() error = %v", err)
	}
	if len(resp.URLs) != 1 || resp.URLs[0] != "data:image/png;base64,aGVsbG8=" {
		t.Fatalf("URLs = %#v", resp.URLs)
	}
	contents := got["contents"].([]any)
	parts := contents[0].(map[string]any)["parts"].([]any)
	imagePart := parts[0].(map[string]any)["inlineData"].(map[string]any)
	textPart := parts[1].(map[string]any)
	if imagePart["mimeType"] != "image/png" || imagePart["data"] != "aW5wdXQtcG5n" || textPart["text"] != "make the product warmer" {
		t.Fatalf("parts = %#v", parts)
	}
	generationConfig := got["generationConfig"].(map[string]any)
	modalities := generationConfig["responseModalities"].([]any)
	if len(modalities) != 2 || modalities[0] != "IMAGE" || modalities[1] != "TEXT" ||
		generationConfig["candidateCount"] != float64(2) || generationConfig["seed"] != float64(123) {
		t.Fatalf("generationConfig = %#v", generationConfig)
	}
	if _, ok := got["safetySettings"].([]any); !ok {
		t.Fatalf("safetySettings = %#v", got["safetySettings"])
	}
}

func TestNewAPIGeminiAudioProfileUsesNativeGenerateContentEndpoint(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/models/gemini-2.5-flash-preview-tts:generateContent" {
			t.Fatalf("path = %q, want /v1beta/models/gemini-2.5-flash-preview-tts:generateContent", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("Authorization = %q, want bearer key", r.Header.Get("Authorization"))
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"candidates":[{
				"content":{"role":"model","parts":[
					{"inlineData":{"mimeType":"audio/L16;codec=pcm;rate=24000","data":"AQIDBA=="}}
				]},
				"finishReason":"STOP"
			}]
		}`))
	}))
	defer server.Close()

	adapter := NewNewAPIAdapter("test-key", server.URL+"/v1")
	resp, err := adapter.Synthesize(context.Background(), media.TTSRequest{
		Model:           "gemini-2.5-flash-preview-tts",
		ProtocolProfile: NewAPIProfileGeminiAudio,
		Text:            "Say hello",
		Voice:           "Kore",
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if resp.MimeType != "audio/wav" || !bytes.HasPrefix(resp.Audio, []byte("RIFF")) || !bytes.Contains(resp.Audio[:16], []byte("WAVE")) {
		t.Fatalf("resp audio mime=%q prefix=%q", resp.MimeType, resp.Audio[:16])
	}
	if !bytes.HasSuffix(resp.Audio, []byte{1, 2, 3, 4}) {
		t.Fatalf("wav payload suffix = %v", resp.Audio[len(resp.Audio)-4:])
	}
	contents := got["contents"].([]any)
	parts := contents[0].(map[string]any)["parts"].([]any)
	if parts[0].(map[string]any)["text"] != "Say hello" {
		t.Fatalf("parts = %#v", parts)
	}
	generationConfig := got["generationConfig"].(map[string]any)
	modalities := generationConfig["responseModalities"].([]any)
	speechConfig := generationConfig["speechConfig"].(map[string]any)
	voiceConfig := speechConfig["voiceConfig"].(map[string]any)
	prebuilt := voiceConfig["prebuiltVoiceConfig"].(map[string]any)
	if len(modalities) != 1 || modalities[0] != "AUDIO" || prebuilt["voiceName"] != "Kore" {
		t.Fatalf("generationConfig = %#v", generationConfig)
	}
}

func TestNewAPIGeminiAudioProfileRejectsSpeechToText(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		t.Fatalf("unexpected upstream request for unsupported Gemini audio operation")
		return nil, nil
	})}

	_, err := adapter.Transcribe(context.Background(), media.TranscribeRequest{
		Model:           "gemini-2.5-flash-preview-tts",
		ProtocolProfile: NewAPIProfileGeminiAudio,
		Audio:           []byte("wav"),
		MimeType:        "audio/wav",
	})
	if err == nil || !strings.Contains(err.Error(), "does not support operation") {
		t.Fatalf("Transcribe() error = %v, want unsupported operation", err)
	}
}

func TestNewAPIGeminiGenerateContentProfileStreamsNativeEndpoint(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/models/gemini-2.5-flash:streamGenerateContent" || r.URL.Query().Get("alt") != "sse" {
			t.Fatalf("url = %q, want streamGenerateContent?alt=sse", r.URL.String())
		}
		if r.Header.Get("Accept") != "text/event-stream" {
			t.Fatalf("accept = %q, want text/event-stream", r.Header.Get("Accept"))
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(strings.Join([]string{
			`data: {"candidates":[{"content":{"role":"model","parts":[{"text":"pon"}]}}]}`,
			`data: {"candidates":[{"content":{"role":"model","parts":[{"text":"g"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2}}`,
			`data: [DONE]`,
			``,
		}, "\n")))
	}))
	defer server.Close()

	adapter := NewNewAPIAdapter("test-key", server.URL+"/v1")
	stream, err := adapter.TextStream(context.Background(), TextRequest{
		Model:           "gemini-2.5-flash",
		ProtocolProfile: NewAPIProfileGeminiGenerateContent,
		Messages:        []Message{{Role: "user", Content: "ping"}},
	})
	if err != nil {
		t.Fatalf("TextStream() error = %v", err)
	}
	var text string
	var finish string
	var usage TokenUsage
	var done bool
	for event := range stream {
		if event.Error != "" {
			t.Fatalf("unexpected stream error: %s", event.Error)
		}
		text += event.ContentDelta
		if event.FinishReason != "" {
			finish = event.FinishReason
		}
		if event.Usage.InputTokens > 0 {
			usage = event.Usage
		}
		if event.Done {
			done = true
		}
	}
	if got["contents"] == nil {
		t.Fatalf("request body = %#v", got)
	}
	if text != "pong" || finish != "STOP" || usage.InputTokens != 5 || usage.OutputTokens != 2 || !done {
		t.Fatalf("text=%q finish=%q usage=%+v done=%v", text, finish, usage, done)
	}
}

func TestNewAPIHTTPExtensionsSurface4295xxAndNonJSONErrors(t *testing.T) {
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/embeddings":
			return &http.Response{
				StatusCode: http.StatusTooManyRequests,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(`{"error":{"message":"rate limited"}}`)),
				Request:    r,
			}, nil
		case "/v1/rerank":
			return &http.Response{
				StatusCode: http.StatusInternalServerError,
				Header:     http.Header{"Content-Type": []string{"text/plain"}},
				Body:       io.NopCloser(strings.NewReader(`upstream crashed`)),
				Request:    r,
			}, nil
		case "/v1/moderations":
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"text/plain"}},
				Body:       io.NopCloser(strings.NewReader(`not json`)),
				Request:    r,
			}, nil
		default:
			t.Fatalf("unexpected path = %s", r.URL.Path)
			return nil, nil
		}
	})}

	_, err := adapter.CreateEmbeddings(context.Background(), EmbeddingRequest{Model: "embed-test", Inputs: []string{"hello"}})
	if err == nil || !strings.Contains(err.Error(), "429") || !strings.Contains(err.Error(), "rate limited") {
		t.Fatalf("CreateEmbeddings() error = %v, want 429 rate limited", err)
	}
	_, err = adapter.Rerank(context.Background(), RerankRequest{Model: "rerank-test", Query: "q", Documents: []RerankDocument{{Text: "doc"}}})
	if err == nil || !strings.Contains(err.Error(), "500") || !strings.Contains(err.Error(), "upstream crashed") {
		t.Fatalf("Rerank() error = %v, want 500 upstream body", err)
	}
	_, err = adapter.Moderate(context.Background(), ModerationRequest{Model: "mod-test", Inputs: []string{"check"}})
	if err == nil || !strings.Contains(err.Error(), "decode new_api moderations response") {
		t.Fatalf("Moderate() error = %v, want non-JSON decode error", err)
	}
}

func TestNewAPIErrorMessagesRedactSensitiveUpstreamBodies(t *testing.T) {
	sensitiveJSON := `{"error":{"message":"bad api_key=sk-secret-token","authorization":"Bearer raw-token","cookie":"sessionid=abc"}}`
	sensitiveText := `upstream leaked Authorization: Bearer raw-token and cookie: sessionid=abc`
	assertRedacted := func(t *testing.T, err error) {
		t.Helper()
		if err == nil {
			t.Fatal("error = nil, want redacted upstream error")
		}
		text := err.Error()
		for _, secret := range []string{"sk-secret-token", "raw-token", "sessionid=abc"} {
			if strings.Contains(text, secret) {
				t.Fatalf("error %q contains secret %q", text, secret)
			}
		}
		if !strings.Contains(text, "[redacted]") {
			t.Fatalf("error %q does not contain redaction marker", text)
		}
	}

	t.Run("models", func(t *testing.T) {
		adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
		adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusUnauthorized,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(sensitiveJSON)),
				Request:    r,
			}, nil
		})}
		_, err := adapter.FetchModels(context.Background())
		assertRedacted(t, err)
	})

	t.Run("json extension", func(t *testing.T) {
		adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
		adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusTooManyRequests,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(sensitiveJSON)),
				Request:    r,
			}, nil
		})}
		_, err := adapter.CreateEmbeddings(context.Background(), EmbeddingRequest{Model: "embed-test", Inputs: []string{"hello"}})
		assertRedacted(t, err)
	})

	t.Run("delegated chat", func(t *testing.T) {
		adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
		adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusUnauthorized,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(sensitiveJSON)),
				Request:    r,
			}, nil
		})}
		_, err := adapter.TextGenerate(context.Background(), TextRequest{
			Model:    "gpt-test",
			Messages: []Message{{Role: "user", Content: "hello"}},
		})
		assertRedacted(t, err)
	})

	t.Run("delegated chat stream", func(t *testing.T) {
		adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
		adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusUnauthorized,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(sensitiveJSON)),
				Request:    r,
			}, nil
		})}
		_, err := adapter.TextStream(context.Background(), TextRequest{
			Model:    "gpt-test",
			Messages: []Message{{Role: "user", Content: "hello"}},
		})
		assertRedacted(t, err)
	})

	t.Run("delegated audio transcription", func(t *testing.T) {
		adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
		adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusUnauthorized,
				Header:     http.Header{"Content-Type": []string{"text/plain"}},
				Body:       io.NopCloser(strings.NewReader(sensitiveText)),
				Request:    r,
			}, nil
		})}
		_, err := adapter.Transcribe(context.Background(), media.TranscribeRequest{
			Model:    "stt-test",
			Audio:    []byte("wav"),
			MimeType: "audio/wav",
		})
		assertRedacted(t, err)
	})

	t.Run("video start", func(t *testing.T) {
		adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
		adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusForbidden,
				Header:     http.Header{"Content-Type": []string{"text/plain"}},
				Body:       io.NopCloser(strings.NewReader(sensitiveText)),
				Request:    r,
			}, nil
		})}
		_, err := adapter.VideoStart(context.Background(), VideoRequest{Model: "sora-test", ProtocolProfile: NewAPIProfileSoraVideoMultipart, Prompt: "hello"})
		assertRedacted(t, err)
	})

	t.Run("video poll", func(t *testing.T) {
		adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
		adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusBadGateway,
				Header:     http.Header{"Content-Type": []string{"text/plain"}},
				Body:       io.NopCloser(strings.NewReader(sensitiveText)),
				Request:    r,
			}, nil
		})}
		_, err := adapter.VideoPoll(context.Background(), VideoPollRequest{ProtocolProfile: NewAPIProfileSoraVideoMultipart, TaskID: "video_1", TaskKind: "new_api_video"})
		assertRedacted(t, err)
	})

	t.Run("video start non json preview", func(t *testing.T) {
		adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
		adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"text/plain"}},
				Body:       io.NopCloser(strings.NewReader(sensitiveText)),
				Request:    r,
			}, nil
		})}
		_, err := adapter.VideoStart(context.Background(), VideoRequest{Model: "sora-test", ProtocolProfile: NewAPIProfileSoraVideoMultipart, Prompt: "hello"})
		assertRedacted(t, err)
	})
}

func TestNewAPICreateEmbeddingsUsesDocumentedJSON(t *testing.T) {
	var got map[string]any
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/embeddings" {
			t.Fatalf("path = %s, want /v1/embeddings", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("Authorization = %q", r.Header.Get("Authorization"))
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		body := []byte(`{"object":"list","model":"embed-test","data":[{"object":"embedding","index":0,"embedding":[0.25,0.5]}],"usage":{"prompt_tokens":3,"total_tokens":3}}`)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewReader(body)),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.CreateEmbeddings(context.Background(), EmbeddingRequest{
		Model:          "embed-test",
		Inputs:         []string{"hello"},
		EncodingFormat: "float",
		Dimensions:     2,
		ExtraParams: map[string]any{
			"custom_option":    "kept",
			"protocol_profile": NewAPIProfileRerank,
			"api_key":          "sk-secret",
		},
	})
	if err != nil {
		t.Fatalf("CreateEmbeddings() error = %v", err)
	}
	if got["model"] != "embed-test" || got["input"] != "hello" || got["encoding_format"] != "float" ||
		got["dimensions"] != float64(2) || got["custom_option"] != "kept" {
		t.Fatalf("request body = %#v", got)
	}
	for _, key := range []string{"protocol_profile", "api_key"} {
		if _, ok := got[key]; ok {
			t.Fatalf("reserved extra param %q leaked into request body: %#v", key, got)
		}
	}
	if resp.Model != "embed-test" || len(resp.Data) != 1 || resp.Data[0].Index != 0 ||
		len(resp.Data[0].Embedding) != 2 || resp.Data[0].Embedding[0] != float32(0.25) ||
		resp.Usage.InputTokens != 3 {
		t.Fatalf("resp = %+v", resp)
	}
}

func TestNewAPICreateGeminiEngineEmbeddingsUsesEnginePath(t *testing.T) {
	var got map[string]any
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/engines/gemini-embedding-001/embeddings" {
			t.Fatalf("path = %s, want /v1/engines/gemini-embedding-001/embeddings", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		body := []byte(`{"object":"list","model":"gemini-embedding-001","data":[{"object":"embedding","index":0,"embedding":[0.1]}],"usage":{"prompt_tokens":2,"total_tokens":2}}`)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewReader(body)),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.CreateEmbeddings(context.Background(), EmbeddingRequest{
		Model:           "gemini-embedding-001",
		ProtocolProfile: NewAPIProfileGeminiEngineEmbeddings,
		Inputs:          []string{"hello", "world"},
		EncodingFormat:  "float",
		Dimensions:      768,
	})
	if err != nil {
		t.Fatalf("CreateEmbeddings() error = %v", err)
	}
	input, ok := got["input"].([]any)
	if !ok || len(input) != 2 {
		t.Fatalf("input = %#v", got["input"])
	}
	if got["model"] != "gemini-embedding-001" || got["encoding_format"] != "float" || got["dimensions"] != float64(768) {
		t.Fatalf("request body = %#v", got)
	}
	if resp.Model != "gemini-embedding-001" || len(resp.Data) != 1 || resp.Usage.InputTokens != 2 {
		t.Fatalf("resp = %+v", resp)
	}
}

func TestNewAPIRerankUsesDocumentedJSON(t *testing.T) {
	var got map[string]any
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/rerank" {
			t.Fatalf("path = %s, want /v1/rerank", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		body := []byte(`{"id":"rerank-1","results":[{"index":1,"relevance_score":0.91,"document":{"text":"b"}}],"meta":{"billed_units":1}}`)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewReader(body)),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.Rerank(context.Background(), RerankRequest{
		Model: "rerank-test",
		Query: "which is best?",
		Documents: []RerankDocument{
			{Text: "a"},
			{Data: map[string]any{"text": "b", "id": "doc-b"}},
		},
		TopN:            1,
		ReturnDocuments: true,
	})
	if err != nil {
		t.Fatalf("Rerank() error = %v", err)
	}
	documents, ok := got["documents"].([]any)
	if !ok || len(documents) != 2 || documents[0] != "a" {
		t.Fatalf("documents = %#v", got["documents"])
	}
	if got["model"] != "rerank-test" || got["query"] != "which is best?" ||
		got["top_n"] != float64(1) || got["return_documents"] != true {
		t.Fatalf("request body = %#v", got)
	}
	if resp.ID != "rerank-1" || len(resp.Results) != 1 || resp.Results[0].Index != 1 ||
		resp.Results[0].RelevanceScore != 0.91 || resp.Meta["billed_units"] != float64(1) {
		t.Fatalf("resp = %+v", resp)
	}
}

func TestNewAPIModerateUsesDocumentedJSON(t *testing.T) {
	var got map[string]any
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/moderations" {
			t.Fatalf("path = %s, want /v1/moderations", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		body := []byte(`{"id":"mod-1","model":"mod-test","results":[{"flagged":true,"categories":{"violence":true},"category_scores":{"violence":0.82}}]}`)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(bytes.NewReader(body)),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.Moderate(context.Background(), ModerationRequest{
		Model:  "mod-test",
		Inputs: []string{"check this"},
	})
	if err != nil {
		t.Fatalf("Moderate() error = %v", err)
	}
	if got["model"] != "mod-test" || got["input"] != "check this" {
		t.Fatalf("request body = %#v", got)
	}
	if resp.ID != "mod-1" || resp.Model != "mod-test" || len(resp.Results) != 1 ||
		!resp.Results[0].Flagged || !resp.Results[0].Categories["violence"] ||
		resp.Results[0].CategoryScores["violence"] != 0.82 {
		t.Fatalf("resp = %+v", resp)
	}
}

func TestNewAPIRealtimeConnectUsesDocumentedWebSocketEndpoint(t *testing.T) {
	upgrader := websocket.Upgrader{}
	gotEvent := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/realtime" {
			t.Fatalf("path = %s, want /v1/realtime", r.URL.Path)
		}
		if r.URL.Query().Get("model") != "gpt-4o-realtime-preview" {
			t.Fatalf("model query = %q", r.URL.Query().Get("model"))
		}
		if r.URL.Query().Get("intent") != "diagnostic" {
			t.Fatalf("intent query = %q", r.URL.Query().Get("intent"))
		}
		if r.URL.Query().Get("api_key") != "" || r.URL.Query().Get("token") != "" || r.URL.Query().Get("authorization") != "" {
			t.Fatalf("sensitive realtime query leaked: %s", r.URL.RawQuery)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("Authorization = %q", r.Header.Get("Authorization"))
		}
		if r.Header.Get("X-Trace-ID") != "trace-1" {
			t.Fatalf("X-Trace-ID = %q", r.Header.Get("X-Trace-ID"))
		}
		if r.Header.Get("X-Api-Key") != "" || r.Header.Get("Cookie") != "" {
			t.Fatalf("sensitive realtime headers leaked: X-Api-Key=%q Cookie=%q", r.Header.Get("X-Api-Key"), r.Header.Get("Cookie"))
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade: %v", err)
		}
		defer conn.Close()
		var event map[string]any
		if err := conn.ReadJSON(&event); err != nil {
			t.Fatalf("read event: %v", err)
		}
		gotEvent <- event
		_ = conn.WriteJSON(map[string]any{"type": "session.updated", "ok": true})
	}))
	defer server.Close()

	adapter := NewNewAPIAdapter("test-key", server.URL+"/v1")
	session, err := adapter.ConnectRealtime(context.Background(), RealtimeSessionRequest{
		Model: "gpt-4o-realtime-preview",
		Query: map[string]string{
			"model":         "caller-override",
			"intent":        "diagnostic",
			"api_key":       "sk-query-secret",
			"token":         "query-token",
			"authorization": "Bearer query-override",
		},
		Headers: map[string]string{
			"Authorization": "Bearer caller-override",
			"X-Trace-ID":    "trace-1",
			"X-Api-Key":     "sk-caller-secret",
			"Cookie":        "sessionid=abc",
		},
	})
	if err != nil {
		t.Fatalf("ConnectRealtime() error = %v", err)
	}
	defer session.Close()
	if err := session.SendEvent(context.Background(), RealtimeEvent{"type": "session.update"}); err != nil {
		t.Fatalf("SendEvent() error = %v", err)
	}
	event, err := session.ReceiveEvent(context.Background())
	if err != nil {
		t.Fatalf("ReceiveEvent() error = %v", err)
	}
	if event["type"] != "session.updated" || event["ok"] != true {
		t.Fatalf("event = %#v", event)
	}
	sent := <-gotEvent
	if sent["type"] != "session.update" {
		t.Fatalf("sent event = %#v", sent)
	}
}

func TestNewAPIAdapterDoesNotExposeVideoCancel(t *testing.T) {
	if _, ok := any(NewNewAPIAdapter("test-key", "https://newapi.test/v1")).(VideoTaskCancelProvider); ok {
		t.Fatal("new_api must not expose video cancellation until New API documents a stable cancel endpoint")
	}
}

func TestNewAPIQwenImageGenerateUsesJSONInputParameters(t *testing.T) {
	var gotBody map[string]any
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/images/generations" {
			t.Fatalf("path = %s, want /v1/images/generations", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("Authorization = %q", got)
		}
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"created":       1,
			"output_format": "png",
			"data":          []map[string]string{{"b64_json": "aGVsbG8="}},
		}), nil
	})}
	seed := int64(42)
	watermark := false

	resp, err := adapter.ImageGenerate(context.Background(), ImageRequest{
		Model:              "qwen-image-plus",
		ProtocolProfile:    NewAPIProfileQwenImages,
		Operation:          ImageOperationTextToImage,
		Prompt:             "draw a quiet title card",
		AspectRatio:        "16:9",
		Seed:               &seed,
		Watermark:          &watermark,
		OptimizePromptMode: "auto",
		ExtraParams: map[string]any{
			"n":               2,
			"negative_prompt": "low quality",
			"response_format": "b64_json",
		},
	})
	if err != nil {
		t.Fatalf("ImageGenerate() error = %v", err)
	}
	if len(resp.URLs) != 1 || resp.URLs[0] != "data:image/png;base64,aGVsbG8=" {
		t.Fatalf("URLs = %#v", resp.URLs)
	}
	if gotBody["model"] != "qwen-image-plus" || gotBody["prompt"] != "draw a quiet title card" || gotBody["response_format"] != "b64_json" {
		t.Fatalf("body top-level = %#v", gotBody)
	}
	input := gotBody["input"].(map[string]any)
	messages := input["messages"].([]any)
	message := messages[0].(map[string]any)
	content := message["content"].([]any)
	textPart := content[0].(map[string]any)
	if message["role"] != "user" || textPart["text"] != "draw a quiet title card" {
		t.Fatalf("messages = %#v", messages)
	}
	params := gotBody["parameters"].(map[string]any)
	if params["size"] != "1664*928" || params["n"] != float64(2) || params["seed"] != float64(42) ||
		params["watermark"] != false || params["prompt_extend"] != true || params["negative_prompt"] != "low quality" {
		t.Fatalf("parameters = %#v", params)
	}
}

func TestNewAPIQwenImageEditUsesJSONImageContent(t *testing.T) {
	var gotBody map[string]any
	adapter := NewNewAPIAdapter("test-key", "https://newapi.test/v1")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/images/edits" {
			t.Fatalf("path = %s, want /v1/images/edits", r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"data": []map[string]string{{"url": "https://cdn.newapi.test/out.png"}},
		}), nil
	})}

	resp, err := adapter.ImageGenerate(context.Background(), ImageRequest{
		Model:              "qwen-image-edit-plus",
		ProtocolProfile:    NewAPIProfileQwenImages,
		Operation:          ImageOperationEditImage,
		Prompt:             "make the product warmer",
		InputImageBytes:    []byte("png-bytes"),
		InputImageMime:     "image/png",
		OptimizePromptMode: "disabled",
	})
	if err != nil {
		t.Fatalf("ImageGenerate(edit) error = %v", err)
	}
	if len(resp.URLs) != 1 || resp.URLs[0] != "https://cdn.newapi.test/out.png" {
		t.Fatalf("URLs = %#v", resp.URLs)
	}
	input := gotBody["input"].(map[string]any)
	messages := input["messages"].([]any)
	content := messages[0].(map[string]any)["content"].([]any)
	imagePart := content[0].(map[string]any)
	textPart := content[1].(map[string]any)
	if imagePart["image"] != "data:image/png;base64,cG5nLWJ5dGVz" || textPart["text"] != "make the product warmer" {
		t.Fatalf("content = %#v", content)
	}
	params := gotBody["parameters"].(map[string]any)
	if params["prompt_extend"] != false {
		t.Fatalf("parameters = %#v", params)
	}
}

func TestNewAPIDryRunVideoPreviewUsesNewAPIFields(t *testing.T) {
	seed := int64(99)
	provider := newDryRunProvider(AdapterNewAPI, "test-key", "https://newapi.test/v1")
	result := provider.buildVideoRequest(VideoRequest{
		Model:   "sora-test",
		Prompt:  "preview",
		Size:    "720x1280",
		Seed:    &seed,
		Payload: `{"fps":30,"n":1,"seed":12}`,
	})
	if result.Endpoint != "https://newapi.test/v1/videos" {
		t.Fatalf("endpoint = %q", result.Endpoint)
	}
	var body map[string]any
	if err := json.Unmarshal([]byte(result.RequestBody), &body); err != nil {
		t.Fatalf("decode dry-run body: %v\n%s", err, result.RequestBody)
	}
	if body["duration"] != float64(6) || body["width"] != float64(720) || body["height"] != float64(1280) ||
		body["fps"] != float64(30) || body["n"] != float64(1) || body["seed"] != float64(99) {
		t.Fatalf("dry-run body = %#v", body)
	}
	if _, ok := body["seconds"]; ok {
		t.Fatalf("dry-run body must not include seconds: %#v", body)
	}
	if _, ok := body["input_reference[]"]; ok {
		t.Fatalf("dry-run body must not include input_reference[]: %#v", body)
	}
}

func TestProviderDebugNewAPIVideoDryRunCarriesDocumentedParams(t *testing.T) {
	result := ProviderDebugCall(context.Background(), ProviderDebugCallRequest{
		AdapterType: AdapterNewAPI,
		BaseURL:     "https://newapi.test/v1",
		APIKey:      "test-key",
		Capability:  CapabilityFamilyVideoGeneration,
		Model:       "sora-test",
		Prompt:      "preview",
		DryRun:      true,
		Params: map[string]any{
			"duration":        "8",
			"width":           "720",
			"height":          "1280",
			"fps":             "30",
			"n":               2,
			"seed":            11,
			"response_format": "b64_json",
			"user":            "user-1",
			"metadata":        `{"negative_prompt":"rain"}`,
		},
	})
	if result.Error != "" {
		t.Fatalf("ProviderDebugCall() error = %s", result.Error)
	}
	var body map[string]any
	if err := json.Unmarshal([]byte(result.RequestBody), &body); err != nil {
		t.Fatalf("decode body: %v\n%s", err, result.RequestBody)
	}
	if body["duration"] != float64(8) || body["width"] != float64(720) || body["height"] != float64(1280) ||
		body["fps"] != float64(30) || body["n"] != float64(2) || body["seed"] != float64(11) ||
		body["response_format"] != "b64_json" || body["user"] != "user-1" {
		t.Fatalf("body = %#v", body)
	}
	metadata, ok := body["metadata"].(map[string]any)
	if !ok || metadata["negative_prompt"] != "rain" {
		t.Fatalf("metadata = %#v", body["metadata"])
	}
}

func TestProviderDebugNewAPIClaudeMessagesDryRun(t *testing.T) {
	result := ProviderDebugCall(context.Background(), ProviderDebugCallRequest{
		AdapterType: AdapterNewAPI,
		BaseURL:     "https://newapi.test/v1",
		APIKey:      "test-key",
		Capability:  CapabilityFamilyTextGeneration,
		Model:       "claude-test",
		Prompt:      "preview",
		DryRun:      true,
		Params: map[string]any{
			"protocol_profile": NewAPIProfileClaudeMessages,
			"max_tokens":       256,
		},
	})
	if result.Error != "" {
		t.Fatalf("ProviderDebugCall() error = %s", result.Error)
	}
	if result.Endpoint != "https://newapi.test/v1/messages" || result.Method != http.MethodPost {
		t.Fatalf("endpoint=%q method=%q", result.Endpoint, result.Method)
	}
	if result.RequestHeaders["x-api-key"] == "" || result.RequestHeaders["anthropic-version"] == "" {
		t.Fatalf("headers = %#v", result.RequestHeaders)
	}
	var body map[string]any
	if err := json.Unmarshal([]byte(result.RequestBody), &body); err != nil {
		t.Fatalf("decode body: %v\n%s", err, result.RequestBody)
	}
	messages, _ := body["messages"].([]any)
	if body["model"] != "claude-test" || len(messages) != 1 {
		t.Fatalf("body = %#v", body)
	}
}

func TestProviderDebugNewAPIGeminiGenerateContentDryRun(t *testing.T) {
	result := ProviderDebugCall(context.Background(), ProviderDebugCallRequest{
		AdapterType: AdapterNewAPI,
		BaseURL:     "https://newapi.test/v1",
		APIKey:      "test-key",
		Capability:  CapabilityFamilyTextGeneration,
		Model:       "gemini-2.5-flash",
		Prompt:      "preview",
		DryRun:      true,
		Params: map[string]any{
			"protocol_profile": NewAPIProfileGeminiGenerateContent,
			"max_tokens":       128,
		},
	})
	if result.Error != "" {
		t.Fatalf("ProviderDebugCall() error = %s", result.Error)
	}
	if result.Endpoint != "https://newapi.test/v1beta/models/gemini-2.5-flash:generateContent" || result.Method != http.MethodPost {
		t.Fatalf("endpoint=%q method=%q", result.Endpoint, result.Method)
	}
	var body map[string]any
	if err := json.Unmarshal([]byte(result.RequestBody), &body); err != nil {
		t.Fatalf("decode body: %v\n%s", err, result.RequestBody)
	}
	if body["contents"] == nil {
		t.Fatalf("body = %#v", body)
	}
	if strings.Contains(result.RequestBody, "protocol_profile") {
		t.Fatalf("request body leaked protocol_profile: %s", result.RequestBody)
	}
}

func TestProviderDebugNewAPIGeminiImageGenerateContentDryRun(t *testing.T) {
	result := ProviderDebugCall(context.Background(), ProviderDebugCallRequest{
		AdapterType: AdapterNewAPI,
		BaseURL:     "https://newapi.test/v1",
		APIKey:      "test-key",
		Capability:  CapabilityFamilyImageGeneration,
		Model:       "gemini-3-pro-image-preview",
		Prompt:      "preview",
		DryRun:      true,
		Params: map[string]any{
			"protocol_profile": NewAPIProfileGeminiImages,
			"seed":             123,
		},
	})
	if result.Error != "" {
		t.Fatalf("ProviderDebugCall() error = %s", result.Error)
	}
	if result.Endpoint != "https://newapi.test/v1beta/models/gemini-3-pro-image-preview:generateContent" || result.Method != http.MethodPost {
		t.Fatalf("endpoint=%q method=%q", result.Endpoint, result.Method)
	}
	if result.RequestHeaders["Authorization"] != "Bearer "+maskKey("test-key") {
		t.Fatalf("headers = %#v", result.RequestHeaders)
	}
	var body map[string]any
	if err := json.Unmarshal([]byte(result.RequestBody), &body); err != nil {
		t.Fatalf("decode body: %v\n%s", err, result.RequestBody)
	}
	generationConfig := body["generationConfig"].(map[string]any)
	modalities := generationConfig["responseModalities"].([]any)
	if len(modalities) != 2 || modalities[0] != "IMAGE" || modalities[1] != "TEXT" || generationConfig["seed"] != float64(123) {
		t.Fatalf("generationConfig = %#v", generationConfig)
	}
	if strings.Contains(result.RequestBody, "protocol_profile") {
		t.Fatalf("request body leaked protocol_profile: %s", result.RequestBody)
	}
}

func TestProviderDebugNewAPIGeminiAudioGenerateContentDryRun(t *testing.T) {
	result := ProviderDebugCall(context.Background(), ProviderDebugCallRequest{
		AdapterType: AdapterNewAPI,
		BaseURL:     "https://newapi.test/v1",
		APIKey:      "test-key",
		Capability:  CapabilityFamilyAudioGeneration,
		Model:       "gemini-2.5-flash-preview-tts",
		Prompt:      "Joe: hello\nJane: hi",
		DryRun:      true,
		Params: map[string]any{
			"protocol_profile": NewAPIProfileGeminiAudio,
			"speakers":         `[{"speaker":"Joe","voice":"Kore"},{"speaker":"Jane","voice":"Puck"}]`,
		},
	})
	if result.Error != "" {
		t.Fatalf("ProviderDebugCall() error = %s", result.Error)
	}
	if result.Endpoint != "https://newapi.test/v1beta/models/gemini-2.5-flash-preview-tts:generateContent" || result.Method != http.MethodPost {
		t.Fatalf("endpoint=%q method=%q", result.Endpoint, result.Method)
	}
	var body map[string]any
	if err := json.Unmarshal([]byte(result.RequestBody), &body); err != nil {
		t.Fatalf("decode body: %v\n%s", err, result.RequestBody)
	}
	generationConfig := body["generationConfig"].(map[string]any)
	modalities := generationConfig["responseModalities"].([]any)
	speechConfig := generationConfig["speechConfig"].(map[string]any)
	multiSpeaker := speechConfig["multiSpeakerVoiceConfig"].(map[string]any)
	configs := multiSpeaker["speakerVoiceConfigs"].([]any)
	if len(modalities) != 1 || modalities[0] != "AUDIO" || len(configs) != 2 {
		t.Fatalf("generationConfig = %#v", generationConfig)
	}
	if strings.Contains(result.RequestBody, "protocol_profile") {
		t.Fatalf("request body leaked protocol_profile: %s", result.RequestBody)
	}
}

func TestProviderDebugNewAPIExtensionDryRuns(t *testing.T) {
	cases := []struct {
		name       string
		capability string
		wantPath   string
		params     map[string]any
	}{
		{
			name:       "embedding",
			capability: CapabilityFamilyEmbedding,
			wantPath:   "https://newapi.test/v1/embeddings",
			params:     map[string]any{"input": []any{"hello", "world"}, "encoding_format": "float", "dimensions": 2},
		},
		{
			name:       "gemini engine embedding",
			capability: CapabilityFamilyEmbedding,
			wantPath:   "https://newapi.test/v1/engines/model-test/embeddings",
			params: map[string]any{
				"input":            []any{"hello", "world"},
				"protocol_profile": NewAPIProfileGeminiEngineEmbeddings,
			},
		},
		{
			name:       "rerank",
			capability: CapabilityFamilyRerank,
			wantPath:   "https://newapi.test/v1/rerank",
			params:     map[string]any{"documents": []any{"a", map[string]any{"text": "b"}}, "top_n": 1, "return_documents": true},
		},
		{
			name:       "moderation",
			capability: CapabilityFamilyModeration,
			wantPath:   "https://newapi.test/v1/moderations",
			params:     map[string]any{"input": "check me"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := ProviderDebugCall(context.Background(), ProviderDebugCallRequest{
				AdapterType: AdapterNewAPI,
				BaseURL:     "https://newapi.test/v1",
				APIKey:      "test-key",
				Capability:  tc.capability,
				Model:       "model-test",
				Prompt:      "query",
				DryRun:      true,
				Params:      tc.params,
			})
			if result.Error != "" {
				t.Fatalf("ProviderDebugCall() error = %s", result.Error)
			}
			if result.Endpoint != tc.wantPath {
				t.Fatalf("endpoint = %q, want %q", result.Endpoint, tc.wantPath)
			}
			if result.Method != http.MethodPost {
				t.Fatalf("method = %q", result.Method)
			}
			if result.RequestBody == "" {
				t.Fatal("expected request body")
			}
			if strings.Contains(result.RequestBody, "protocol_profile") {
				t.Fatalf("request body leaked protocol_profile: %s", result.RequestBody)
			}
		})
	}
}

func TestProviderDebugNewAPIRealtimeDryRun(t *testing.T) {
	result := ProviderDebugCall(context.Background(), ProviderDebugCallRequest{
		AdapterType: AdapterNewAPI,
		BaseURL:     "https://newapi.test/v1",
		APIKey:      "test-key",
		EndpointURL: "https://newapi.test/v1/realtime",
		Model:       "gpt-4o-realtime-preview",
		DryRun:      true,
		Params: map[string]any{
			"query":   map[string]any{"intent": "diagnostic"},
			"headers": map[string]any{"Authorization": "Bearer caller-override", "X-Trace-ID": "trace-1", "X-Api-Key": "sk-secret", "Cookie": "sessionid=abc"},
		},
	})
	if result.Error != "" {
		t.Fatalf("ProviderDebugCall() error = %s", result.Error)
	}
	if result.Endpoint != "wss://newapi.test/v1/realtime?intent=diagnostic&model=gpt-4o-realtime-preview" {
		t.Fatalf("endpoint = %q", result.Endpoint)
	}
	if result.Method != http.MethodGet {
		t.Fatalf("method = %q", result.Method)
	}
	if result.RequestHeaders["Authorization"] != "Bearer ********" {
		t.Fatalf("Authorization debug header = %q", result.RequestHeaders["Authorization"])
	}
	if result.RequestHeaders["X-Trace-ID"] != "trace-1" {
		t.Fatalf("headers = %#v", result.RequestHeaders)
	}
	if _, ok := result.RequestHeaders["X-Api-Key"]; ok {
		t.Fatalf("X-Api-Key should not be accepted in realtime dry-run headers: %#v", result.RequestHeaders)
	}
	if _, ok := result.RequestHeaders["Cookie"]; ok {
		t.Fatalf("Cookie should not be accepted in realtime dry-run headers: %#v", result.RequestHeaders)
	}
}

package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

func TestBuildVolcenChatRequestClampsMaxTokens(t *testing.T) {
	req := buildVolcenChatRequest(TextRequest{
		Model:     "doubao-test",
		MaxTokens: DefaultTextMaxTokens,
		Messages:  []Message{{Role: "user", Content: "hello"}},
	})
	if req.MaxTokens == nil {
		t.Fatalf("MaxTokens = nil, want %d", volcenTextMaxTokensLimit)
	}
	if *req.MaxTokens != volcenTextMaxTokensLimit {
		t.Fatalf("MaxTokens = %d, want %d", *req.MaxTokens, volcenTextMaxTokensLimit)
	}
}

func TestVolcenFetchModelsUsesArkModelsEndpoint(t *testing.T) {
	var gotPath string
	var gotAuth string
	adapter := &VolcenAdapter{
		baseURL: "https://ark.example.test/api/v3",
		apiKey:  "volcen-test-key",
		rawHTTP: &http.Client{Transport: volcenRoundTripFunc(func(r *http.Request) (*http.Response, error) {
			gotPath = r.URL.Path
			gotAuth = r.Header.Get("Authorization")
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(`{"data":[{"id":"doubao-seed-1-6-251015"},{"id":""},{"id":"deepseek-v4-flash-260425"}],"object":"list"}`)),
				Request:    r,
			}, nil
		})},
	}

	ids, err := adapter.FetchModels(context.Background())
	if err != nil {
		t.Fatalf("FetchModels returned error: %v", err)
	}

	if gotPath != "/api/v3/models" {
		t.Fatalf("path = %q, want /api/v3/models", gotPath)
	}
	if gotAuth != "Bearer volcen-test-key" {
		t.Fatalf("Authorization = %q, want bearer token", gotAuth)
	}
	want := []string{"doubao-seed-1-6-251015", "deepseek-v4-flash-260425"}
	if !reflect.DeepEqual(ids, want) {
		t.Fatalf("ids = %#v, want %#v", ids, want)
	}
}

func TestBuildVolcenVideoTaskRequestUsesReferenceRoles(t *testing.T) {
	generateAudio := true
	req, debugBody, err := buildVolcenVideoTaskRequest(VideoRequest{
		Model:       "doubao-seedance-2-0-260128",
		Prompt:      "first-person fruit tea ad",
		InputImages: []string{"https://example.test/first.jpg"},
		InputImageDataList: []MediaData{{
			PresignedURL: "https://example.test/final.jpg",
			MimeType:     "image/jpeg",
		}},
		InputVideo:    "https://example.test/ref.mp4",
		InputAudio:    "https://example.test/music.mp3",
		GenerateAudio: &generateAudio,
		Ratio:         "16:9",
		Duration:      11,
	})
	if err != nil {
		t.Fatalf("buildVolcenVideoTaskRequest returned error: %v", err)
	}

	raw, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatalf("unmarshal request: %v", err)
	}
	content, ok := body["content"].([]any)
	if !ok {
		t.Fatalf("content = %#v, want array", body["content"])
	}
	if len(content) != 5 {
		t.Fatalf("content len = %d, want text + 2 images + video + audio", len(content))
	}

	assertContentItem(t, content[0], "text", "", "")
	assertContentItem(t, content[1], "image_url", "reference_image", "https://example.test/first.jpg")
	assertContentItem(t, content[2], "image_url", "reference_image", "https://example.test/final.jpg")
	assertContentItem(t, content[3], "video_url", "reference_video", "https://example.test/ref.mp4")
	assertContentItem(t, content[4], "audio_url", "reference_audio", "https://example.test/music.mp3")

	if body["generate_audio"] != true {
		t.Fatalf("generate_audio = %#v, want true", body["generate_audio"])
	}
	if body["ratio"] != "16:9" {
		t.Fatalf("ratio = %#v, want 16:9", body["ratio"])
	}
	if body["duration"] != float64(11) {
		t.Fatalf("duration = %#v, want 11", body["duration"])
	}
	if _, ok := debugBody["content"].([]map[string]any); !ok {
		t.Fatalf("debug content = %#v, want official-shaped content array", debugBody["content"])
	}
}

func TestBuildVolcenVideoTaskRequestRejectsInlineAudioReference(t *testing.T) {
	_, _, err := buildVolcenVideoTaskRequest(VideoRequest{
		Model:  "doubao-seedance-2-0-260128",
		Prompt: "prompt",
		InputAudioData: &MediaData{
			Bytes:    []byte("mp3"),
			MimeType: "audio/mpeg",
		},
	})
	if err == nil || !strings.Contains(err.Error(), "audio reference requires a public URL") {
		t.Fatalf("err = %v, want public URL error", err)
	}
}

func assertContentItem(t *testing.T, item any, typ, role, url string) {
	t.Helper()
	m, ok := item.(map[string]any)
	if !ok {
		t.Fatalf("item = %#v, want object", item)
	}
	if m["type"] != typ {
		t.Fatalf("type = %#v, want %q", m["type"], typ)
	}
	if role == "" {
		if _, ok := m["role"]; ok {
			t.Fatalf("role = %#v, want omitted", m["role"])
		}
		return
	}
	if m["role"] != role {
		t.Fatalf("role = %#v, want %q", m["role"], role)
	}
	urlObject, ok := m[typ].(map[string]any)
	if !ok {
		t.Fatalf("%s = %#v, want object", typ, m[typ])
	}
	if urlObject["url"] != url {
		t.Fatalf("%s.url = %#v, want %q", typ, urlObject["url"], url)
	}
}

type volcenRoundTripFunc func(*http.Request) (*http.Response, error)

func (f volcenRoundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

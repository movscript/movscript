package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
	"github.com/movscript/movscript/internal/infra/newapi"
)

func TestOpenAIAdapterSynthesizeUsesAudioSpeechEndpoint(t *testing.T) {
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/audio/speech" {
			t.Fatalf("path = %q, want /v1/audio/speech", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("authorization = %q, want bearer key", r.Header.Get("Authorization"))
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("mp3-bytes"))
	}))
	defer server.Close()

	adapter := NewOpenAIAdapter(server.URL+"/v1", "test-key")
	resp, err := adapter.Synthesize(context.Background(), media.TTSRequest{
		Model:       "tts-model",
		Text:        "hello",
		Voice:       "voice-a",
		AudioFormat: "mp3",
		Params:      map[string]any{"speed": 1.2},
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if string(resp.Audio) != "mp3-bytes" || resp.MimeType != "audio/mpeg" {
		t.Fatalf("response = %#v, want audio bytes", resp)
	}
	if gotBody["model"] != "tts-model" || gotBody["input"] != "hello" || gotBody["voice"] != "voice-a" || gotBody["response_format"] != "mp3" {
		t.Fatalf("request body = %#v, want OpenAI audio speech shape", gotBody)
	}
	if _, ok := gotBody["format"]; ok {
		t.Fatalf("request body = %#v, should use response_format rather than non-standard format", gotBody)
	}
}

func TestOpenAIAdapterTranscribeUsesAudioTranscriptionsEndpoint(t *testing.T) {
	var gotModel string
	var gotLanguage string
	var gotFileCount int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/audio/transcriptions" {
			t.Fatalf("path = %q, want /v1/audio/transcriptions", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("authorization = %q, want bearer key", r.Header.Get("Authorization"))
		}
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		gotModel = r.FormValue("model")
		gotLanguage = r.FormValue("language")
		gotFileCount = len(r.MultipartForm.File["file"])
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"text":"hello world","language":"en","segments":[{"text":"hello world","start":0,"end":1.5}]}`)
	}))
	defer server.Close()

	adapter := NewOpenAIAdapter(server.URL+"/v1", "test-key")
	resp, err := adapter.Transcribe(context.Background(), media.TranscribeRequest{
		Model:    "whisper-test",
		Language: "en",
		MimeType: "audio/wav",
		Audio:    []byte("wav-bytes"),
	})
	if err != nil {
		t.Fatalf("Transcribe() error = %v", err)
	}
	if gotModel != "whisper-test" || gotLanguage != "en" || gotFileCount != 1 {
		t.Fatalf("multipart fields model=%q language=%q files=%d", gotModel, gotLanguage, gotFileCount)
	}
	if strings.TrimSpace(string(resp.Content)) != "hello world" {
		t.Fatalf("content = %q, want transcript text", string(resp.Content))
	}
	if len(resp.Timing.Segments) != 1 || resp.Timing.Segments[0].EndMs != 1500 {
		t.Fatalf("timing = %#v, want parsed segment timing", resp.Timing)
	}
}

func TestNewAPIForwardAdapterAudioUsesCurrentUserRelayToken(t *testing.T) {
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/audio/speech" {
			t.Fatalf("path = %q, want /v1/audio/speech", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("relay-audio"))
	}))
	defer server.Close()

	adapter := NewNewAPIForwardAdapter(nil, nil, newapi.Config{
		BaseURL:            server.URL,
		RelayTokenFallback: "relay-token",
	}, nil)
	resp, err := adapter.Synthesize(withProviderUserID(context.Background(), 42), media.TTSRequest{
		Model: "tts-model",
		Text:  "hello",
		Voice: "alloy",
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if gotAuth != "Bearer sk-relay-token" {
		t.Fatalf("authorization = %q, want normalized relay token", gotAuth)
	}
	if string(resp.Audio) != "relay-audio" {
		t.Fatalf("audio = %q, want relay audio", string(resp.Audio))
	}
}

func TestOpenAIAdapterVideoCancelUsesOpenAICompatibleEndpoint(t *testing.T) {
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/videos/task_123/cancel" {
			t.Fatalf("path = %q, want /v1/videos/task_123/cancel", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %q, want POST", r.Method)
		}
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"status":"cancelled","message":"stopped"}`)
	}))
	defer server.Close()

	adapter := NewOpenAIAdapter(server.URL+"/v1", "test-key")
	resp, err := adapter.VideoCancel(context.Background(), VideoCancelRequest{TaskID: "task_123"})
	if err != nil {
		t.Fatalf("VideoCancel() error = %v", err)
	}
	if gotAuth != "Bearer test-key" {
		t.Fatalf("authorization = %q, want bearer key", gotAuth)
	}
	if resp.TaskID != "task_123" || resp.Status != VideoStatusCancelled || resp.Message != "stopped" {
		t.Fatalf("response = %#v, want cancelled task", resp)
	}
}

func TestNewAPIForwardAdapterVideoCancelUsesCurrentUserRelayToken(t *testing.T) {
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/videos/task_abc/cancel" {
			t.Fatalf("path = %q, want /v1/videos/task_abc/cancel", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"status":"cancelled"}`)
	}))
	defer server.Close()

	adapter := NewNewAPIForwardAdapter(nil, nil, newapi.Config{
		BaseURL:            server.URL,
		RelayTokenFallback: "relay-token",
	}, nil)
	resp, err := adapter.VideoCancel(withProviderUserID(context.Background(), 42), VideoCancelRequest{TaskID: "task_abc"})
	if err != nil {
		t.Fatalf("VideoCancel() error = %v", err)
	}
	if gotAuth != "Bearer sk-relay-token" {
		t.Fatalf("authorization = %q, want normalized relay token", gotAuth)
	}
	if resp.Status != VideoStatusCancelled {
		t.Fatalf("status = %q, want cancelled", resp.Status)
	}
}

func TestNewAPIForwardAdapterFetchModelsUsesFallbackRelayToken(t *testing.T) {
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			t.Fatalf("path = %q, want /v1/models", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"object":"list","data":[{"id":"gpt-5.2"},{"id":"kling-v2"}]}`)
	}))
	defer server.Close()

	adapter := NewNewAPIForwardAdapter(nil, nil, newapi.Config{
		BaseURL:            server.URL,
		RelayTokenFallback: "relay-token",
	}, nil)
	ids, err := adapter.FetchModels(context.Background())
	if err != nil {
		t.Fatalf("FetchModels() error = %v", err)
	}
	if gotAuth != "Bearer sk-relay-token" {
		t.Fatalf("authorization = %q, want normalized relay token", gotAuth)
	}
	if len(ids) != 2 || ids[0] != "gpt-5.2" || ids[1] != "kling-v2" {
		t.Fatalf("ids = %#v, want model list from new-api", ids)
	}
}

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
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
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

func TestNewAPIForwardAdapterUsesContextGroupForRelayToken(t *testing.T) {
	var createdToken map[string]any
	var gotAuth string
	tokenCreated := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/user/search":
			_, _ = io.WriteString(w, `{"success":true,"data":{"items":[{"id":9,"username":"movscript-42"}]}}`)
		case r.Method == http.MethodPost && r.URL.Path == "/api/user/login":
			_, _ = io.WriteString(w, `{"success":true,"data":{}}`)
		case r.Method == http.MethodGet && r.URL.Path == "/api/token/search":
			if r.URL.Query().Get("keyword") != "movscript-forward-42-premium-video" {
				t.Fatalf("token search keyword = %q, want group-specific token", r.URL.Query().Get("keyword"))
			}
			if tokenCreated {
				_, _ = io.WriteString(w, `{"success":true,"data":{"items":[{"id":17,"name":"movscript-forward-42-premium-video"}]}}`)
				return
			}
			_, _ = io.WriteString(w, `{"success":true,"data":{"items":[]}}`)
		case r.Method == http.MethodPost && r.URL.Path == "/api/token/":
			if err := json.NewDecoder(r.Body).Decode(&createdToken); err != nil {
				t.Fatalf("decode token payload: %v", err)
			}
			tokenCreated = true
			_, _ = io.WriteString(w, `{"success":true,"data":{}}`)
		case r.Method == http.MethodPost && r.URL.Path == "/api/token/17/key":
			_, _ = io.WriteString(w, `{"success":true,"data":{"key":"premium-relay-token"}}`)
		case r.Method == http.MethodPost && r.URL.Path == "/v1/audio/speech":
			gotAuth = r.Header.Get("Authorization")
			w.Header().Set("Content-Type", "audio/mpeg")
			_, _ = w.Write([]byte("relay-audio"))
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}
	}))
	defer server.Close()

	db := testutil.OpenSQLite(t, "newapi-forward-group.db", &persistencemodel.NewAPIIdentity{})
	key := []byte(strings.Repeat("1", 32))
	adapter := NewNewAPIForwardAdapter(db, key, newapi.Config{
		BaseURL:        server.URL,
		AdminToken:     "admin-token",
		AdminUserID:    1,
		UserPrefix:     "movscript-",
		UserPassword:   "password",
		TokenQuota:     100,
		TokenGroup:     "auto",
		HTTPTimeoutSec: 3,
	}, server.Client())

	ctx := WithProviderNewAPIGroup(withProviderUserID(context.Background(), 42), "premium/video")
	if _, err := adapter.Synthesize(ctx, media.TTSRequest{Model: "tts-model", Text: "hello", Voice: "alloy"}); err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if createdToken["group"] != "premium/video" {
		t.Fatalf("created token group = %#v, want provider context group", createdToken["group"])
	}
	if gotAuth != "Bearer sk-premium-relay-token" {
		t.Fatalf("authorization = %q, want group relay token", gotAuth)
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

package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
	"github.com/movscript/movscript/internal/testutil"
)

func TestOpenAIAdapterSynthesizeUsesAudioSpeechEndpoint(t *testing.T) {
	var gotBody map[string]any
	server := testutil.NewHTTPTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	server := testutil.NewHTTPTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

func TestOpenAIAdapterTranslateSpeechUsesAudioTranslationsEndpoint(t *testing.T) {
	var gotModel string
	var gotFileCount int
	server := testutil.NewHTTPTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/audio/translations" {
			t.Fatalf("path = %q, want /v1/audio/translations", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("authorization = %q, want bearer key", r.Header.Get("Authorization"))
		}
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		gotModel = r.FormValue("model")
		gotFileCount = len(r.MultipartForm.File["file"])
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"text":"translated text","segments":[{"text":"translated text","start":0,"end":2}]}`)
	}))
	defer server.Close()

	adapter := NewOpenAIAdapter(server.URL+"/v1", "test-key")
	resp, err := adapter.TranslateSpeech(context.Background(), media.SpeechTranslateRequest{
		Model:          "whisper-test",
		TargetLanguage: "en",
		MimeType:       "audio/wav",
		Audio:          []byte("wav-bytes"),
	})
	if err != nil {
		t.Fatalf("TranslateSpeech() error = %v", err)
	}
	if gotModel != "whisper-test" || gotFileCount != 1 {
		t.Fatalf("multipart fields model=%q files=%d", gotModel, gotFileCount)
	}
	if strings.TrimSpace(string(resp.Content)) != "translated text" {
		t.Fatalf("content = %q, want translated text", string(resp.Content))
	}
	if len(resp.Timing.Segments) != 1 || resp.Timing.Segments[0].EndMs != 2000 {
		t.Fatalf("timing = %#v, want parsed segment timing", resp.Timing)
	}
}

func TestOpenAIAdapterGenerateSpeechToSpeechUsesChatCompletionsAudioShape(t *testing.T) {
	var gotBody map[string]any
	server := testutil.NewHTTPTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("path = %q, want /v1/chat/completions", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("authorization = %q, want bearer key", r.Header.Get("Authorization"))
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		audio := base64.StdEncoding.EncodeToString([]byte("wav-response"))
		_, _ = io.WriteString(w, `{"choices":[{"message":{"content":"text fallback","audio":{"id":"audio_123","data":"`+audio+`","transcript":"spoken reply"}}}]}`)
	}))
	defer server.Close()

	adapter := NewOpenAIAdapter(server.URL+"/v1", "test-key")
	resp, err := adapter.GenerateSpeechToSpeech(context.Background(), media.SpeechToSpeechRequest{
		Model:       "gpt-4o-mini-audio-preview",
		Prompt:      "reply briefly",
		Audio:       []byte("wav-input"),
		MimeType:    "audio/wav",
		Voice:       "alloy",
		AudioFormat: "wav",
		Params:      map[string]any{"temperature": 0.2},
	})
	if err != nil {
		t.Fatalf("GenerateSpeechToSpeech() error = %v", err)
	}
	if string(resp.Audio) != "wav-response" || resp.Text != "spoken reply" || resp.MimeType != "audio/wav" || resp.ProviderRef != "audio_123" {
		t.Fatalf("response = %#v, want decoded speech-to-speech response", resp)
	}
	if gotBody["model"] != "gpt-4o-mini-audio-preview" {
		t.Fatalf("model = %#v", gotBody["model"])
	}
	modalities, ok := gotBody["modalities"].([]any)
	if !ok || len(modalities) != 2 || modalities[0] != "text" || modalities[1] != "audio" {
		t.Fatalf("modalities = %#v, want text+audio", gotBody["modalities"])
	}
	audio, ok := gotBody["audio"].(map[string]any)
	if !ok || audio["voice"] != "alloy" || audio["format"] != "wav" {
		t.Fatalf("audio options = %#v", gotBody["audio"])
	}
	messages, ok := gotBody["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("messages = %#v", gotBody["messages"])
	}
	message, _ := messages[0].(map[string]any)
	content, ok := message["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("message content = %#v", message["content"])
	}
	inputAudio, _ := content[1].(map[string]any)
	inputAudioBody, _ := inputAudio["input_audio"].(map[string]any)
	if inputAudio["type"] != "input_audio" || inputAudioBody["format"] != "wav" {
		t.Fatalf("input audio part = %#v", inputAudio)
	}
	decoded, err := base64.StdEncoding.DecodeString(inputAudioBody["data"].(string))
	if err != nil {
		t.Fatalf("decode input audio: %v", err)
	}
	if string(decoded) != "wav-input" {
		t.Fatalf("input audio = %q, want wav-input", string(decoded))
	}
}

func TestOpenAIAdapterVideoCancelUsesOpenAICompatibleEndpoint(t *testing.T) {
	var gotAuth string
	server := testutil.NewHTTPTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

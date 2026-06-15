package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
)

func TestElevenLabsSynthesizeSendsConfiguredModelAndVoiceSettings(t *testing.T) {
	var gotPath string
	var gotOutputFormat string
	var gotAPIKey string
	var gotAccept string
	var gotBody map[string]any

	adapter := NewElevenLabsAdapter("eleven-key", "https://eleven.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		gotPath = r.URL.Path
		gotOutputFormat = r.URL.Query().Get("output_format")
		gotAPIKey = r.Header.Get("xi-api-key")
		gotAccept = r.Header.Get("Accept")
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"audio/mpeg"},
				"Request-Id":   []string{"tts_req_1"},
			},
			Body:    io.NopCloser(strings.NewReader("mp3-bytes")),
			Request: r,
		}, nil
	})}

	resp, err := adapter.Synthesize(context.Background(), media.TTSRequest{
		Text:        "hello",
		Voice:       "voice_123",
		Model:       "eleven_flash_v2_5",
		AudioFormat: "mp3_44100_128",
		Params: map[string]any{
			"stability":         0.45,
			"similarity_boost":  0.8,
			"use_speaker_boost": true,
		},
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if gotPath != "/v1/text-to-speech/voice_123" {
		t.Fatalf("path = %s, want /v1/text-to-speech/voice_123", gotPath)
	}
	if gotOutputFormat != "mp3_44100_128" {
		t.Fatalf("output_format = %q", gotOutputFormat)
	}
	if gotAPIKey != "eleven-key" {
		t.Fatalf("xi-api-key = %q", gotAPIKey)
	}
	if gotAccept != "audio/mpeg" {
		t.Fatalf("Accept = %q", gotAccept)
	}
	if gotBody["text"] != "hello" || gotBody["model_id"] != "eleven_flash_v2_5" {
		t.Fatalf("body = %#v", gotBody)
	}
	settings := gotBody["voice_settings"].(map[string]any)
	if settings["stability"] != 0.45 || settings["similarity_boost"] != 0.8 || settings["use_speaker_boost"] != true {
		t.Fatalf("voice_settings = %#v", settings)
	}
	if string(resp.Audio) != "mp3-bytes" || resp.MimeType != "audio/mpeg" || resp.ProviderRef != "tts_req_1" {
		t.Fatalf("resp = %#v", resp)
	}
}

func TestElevenLabsTranscribeSendsMultipartModelAndOptions(t *testing.T) {
	var gotPath string
	var gotAPIKey string
	var gotFile string
	var gotFields map[string]string

	adapter := NewElevenLabsAdapter("eleven-key", "https://eleven.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		gotPath = r.URL.Path
		gotAPIKey = r.Header.Get("xi-api-key")
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data;") {
			t.Fatalf("Content-Type = %q", r.Header.Get("Content-Type"))
		}
		if err := r.ParseMultipartForm(1024); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		gotFields = map[string]string{}
		for key, values := range r.MultipartForm.Value {
			if len(values) > 0 {
				gotFields[key] = values[0]
			}
		}
		files := r.MultipartForm.File["file"]
		if len(files) != 1 {
			t.Fatalf("file parts = %d, want 1", len(files))
		}
		gotFile = files[0].Filename
		return jsonResponse(r, http.StatusOK, map[string]any{
			"text": "hello world",
			"words": []map[string]any{
				{"text": "hello", "start": 0.1, "end": 0.4, "confidence": 0.9},
			},
		}), nil
	})}

	resp, err := adapter.Transcribe(context.Background(), media.TranscribeRequest{
		Audio:    []byte("audio-bytes"),
		MimeType: "audio/wav",
		Language: "en",
		Model:    "scribe_v2",
		Params: map[string]any{
			"diarize":          true,
			"tag_audio_events": false,
		},
	})
	if err != nil {
		t.Fatalf("Transcribe() error = %v", err)
	}
	if gotPath != "/v1/speech-to-text" {
		t.Fatalf("path = %s, want /v1/speech-to-text", gotPath)
	}
	if gotAPIKey != "eleven-key" {
		t.Fatalf("xi-api-key = %q", gotAPIKey)
	}
	if gotFile != "audio.wav" {
		t.Fatalf("file name = %q", gotFile)
	}
	if gotFields["model_id"] != "scribe_v2" || gotFields["language_code"] != "en" ||
		gotFields["diarize"] != "true" || gotFields["tag_audio_events"] != "false" {
		t.Fatalf("fields = %#v", gotFields)
	}
	if string(resp.Content) != "hello world" {
		t.Fatalf("content = %q", string(resp.Content))
	}
	if len(resp.Timing.Words) != 1 || resp.Timing.Words[0].StartMs != 100 || resp.Timing.Words[0].EndMs != 400 {
		t.Fatalf("timing = %#v", resp.Timing)
	}
}

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

func TestMurekaTextGenerateUsesLyricsEndpoint(t *testing.T) {
	var gotAuth string
	var gotBody map[string]any
	adapter := NewMurekaAdapter("mureka-key", "https://mureka.test")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://mureka.test/v1/lyrics/generate" {
			t.Fatalf("unexpected URL = %s", r.URL.String())
		}
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"title":  "Embrace of Night",
			"lyrics": "[Verse]\nStars wake up",
		}), nil
	})}

	resp, err := adapter.TextGenerate(context.Background(), TextRequest{
		Model: "lyrics_generation",
		Messages: []Message{
			{Role: "system", Content: "write lyrics"},
			{Role: "user", Content: "dark synth pop"},
		},
	})
	if err != nil {
		t.Fatalf("TextGenerate() error = %v", err)
	}
	if gotAuth != "Bearer mureka-key" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	if gotBody["prompt"] != "dark synth pop" {
		t.Fatalf("body = %#v", gotBody)
	}
	if resp.Content != "Embrace of Night\n\n[Verse]\nStars wake up" {
		t.Fatalf("content = %q", resp.Content)
	}
}

func TestMurekaGenerateAudioSubmitsPollsAndDownloadsSong(t *testing.T) {
	var gotStartPath string
	var gotQueryPath string
	var gotAuth string
	var gotBody map[string]any

	adapter := NewMurekaAdapter("mureka-key", "https://mureka.test")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch {
		case r.URL.Host == "mureka.test" && r.URL.Path == "/v1/song/generate":
			gotStartPath = r.URL.Path
			gotAuth = r.Header.Get("Authorization")
			body, _ := io.ReadAll(r.Body)
			if err := json.Unmarshal(body, &gotBody); err != nil {
				t.Fatalf("request body JSON error = %v", err)
			}
			return jsonResponse(r, http.StatusOK, map[string]any{
				"id":     "song_task_1",
				"status": "preparing",
			}), nil
		case r.URL.Host == "mureka.test" && r.URL.Path == "/v1/song/query/song_task_1":
			gotQueryPath = r.URL.Path
			return jsonResponse(r, http.StatusOK, map[string]any{
				"id":     "song_task_1",
				"status": "succeeded",
				"result": map[string]any{
					"songs": []map[string]any{{
						"audio_url": "https://cdn.test/audio/song.mp3",
					}},
				},
			}), nil
		case r.URL.Host == "cdn.test" && r.URL.Path == "/audio/song.mp3":
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"audio/mpeg"}},
				Body:       io.NopCloser(strings.NewReader("mureka-audio")),
				Request:    r,
			}, nil
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
			return nil, nil
		}
	})}

	resp, err := adapter.GenerateAudio(context.Background(), media.AudioGenerationRequest{
		Kind:        media.AudioGenerationKindMusic,
		Prompt:      "cinematic mandopop chorus",
		Model:       "song_generation",
		DurationSec: 60,
		Params: map[string]any{
			"lyrics":           "[verse]\nhello",
			"output_format":    "mp3",
			"poll_timeout_ms":  1000,
			"poll_interval_ms": 250,
		},
	})
	if err != nil {
		t.Fatalf("GenerateAudio() error = %v", err)
	}
	if gotStartPath != "/v1/song/generate" || gotQueryPath != "/v1/song/query/song_task_1" {
		t.Fatalf("paths start=%q query=%q", gotStartPath, gotQueryPath)
	}
	if gotAuth != "Bearer mureka-key" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	if gotBody["prompt"] != "cinematic mandopop chorus" || gotBody["model"] != "auto" ||
		gotBody["lyrics"] != "[verse]\nhello" || gotBody["duration"] != float64(60) ||
		gotBody["output_format"] != "mp3" {
		t.Fatalf("body = %#v", gotBody)
	}
	if string(resp.Audio) != "mureka-audio" || resp.MimeType != "audio/mpeg" ||
		resp.ProviderRef != "song_task_1" || resp.DurationMs != 60000 {
		t.Fatalf("resp = %#v", resp)
	}
}

func TestMurekaGenerateAudioUsesInstrumentalEndpoint(t *testing.T) {
	var gotStartPath string
	var gotQueryPath string
	var gotBody map[string]any

	adapter := NewMurekaAdapter("mureka-key", "https://mureka.test")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch {
		case r.URL.Path == "/v1/instrumental/generate":
			gotStartPath = r.URL.Path
			body, _ := io.ReadAll(r.Body)
			if err := json.Unmarshal(body, &gotBody); err != nil {
				t.Fatalf("request body JSON error = %v", err)
			}
			return jsonResponse(r, http.StatusOK, map[string]any{"task_id": "inst_task_1"}), nil
		case r.URL.Path == "/v1/instrumental/query/inst_task_1":
			gotQueryPath = r.URL.Path
			return jsonResponse(r, http.StatusOK, map[string]any{
				"status": "finished",
				"data": map[string]any{
					"url": "https://cdn.test/audio/inst.wav",
				},
			}), nil
		case r.URL.Host == "cdn.test":
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"audio/wav"}},
				Body:       io.NopCloser(strings.NewReader("wav-bytes")),
				Request:    r,
			}, nil
		default:
			t.Fatalf("unexpected request: %s", r.URL.String())
			return nil, nil
		}
	})}

	resp, err := adapter.GenerateAudio(context.Background(), media.AudioGenerationRequest{
		Kind:   media.AudioGenerationKindMusic,
		Prompt: "ambient instrumental",
		Model:  "instrumental_generation",
		Params: map[string]any{
			"output_format":    "wav",
			"poll_timeout_ms":  1000,
			"poll_interval_ms": 250,
		},
	})
	if err != nil {
		t.Fatalf("GenerateAudio() error = %v", err)
	}
	if gotStartPath != "/v1/instrumental/generate" || gotQueryPath != "/v1/instrumental/query/inst_task_1" {
		t.Fatalf("paths start=%q query=%q", gotStartPath, gotQueryPath)
	}
	if _, hasLyrics := gotBody["lyrics"]; hasLyrics {
		t.Fatalf("instrumental body should not include lyrics: %#v", gotBody)
	}
	if string(resp.Audio) != "wav-bytes" || resp.MimeType != "audio/wav" || resp.ProviderRef != "inst_task_1" {
		t.Fatalf("resp = %#v", resp)
	}
}

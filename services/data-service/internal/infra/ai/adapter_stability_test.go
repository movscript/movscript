package ai

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
)

func TestStabilityGenerateAudioStableAudio25UsesSyncEndpoint(t *testing.T) {
	var gotPath string
	var gotAuth string
	var gotAccept string
	var gotFields map[string]string

	adapter := NewStabilityAdapter("stable-key", "https://stability.test")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotAccept = r.Header.Get("Accept")
		if err := r.ParseMultipartForm(1024); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		gotFields = firstMultipartValues(r.MultipartForm.Value)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"audio/mpeg"}, "Request-Id": []string{"stable_req_1"}},
			Body:       io.NopCloser(strings.NewReader("stable-audio-2")),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.GenerateAudio(context.Background(), media.AudioGenerationRequest{
		Kind:        media.AudioGenerationKindMusic,
		Prompt:      "cinematic pulse",
		Model:       "stable-audio-2.5",
		DurationSec: 45,
		Params: map[string]any{
			"output_format": "mp3",
			"steps":         8,
			"cfg_scale":     1.25,
			"seed":          42,
		},
	})
	if err != nil {
		t.Fatalf("GenerateAudio() error = %v", err)
	}
	if gotPath != "/v2beta/audio/stable-audio-2/text-to-audio" {
		t.Fatalf("path = %s", gotPath)
	}
	if gotAuth != "Bearer stable-key" || gotAccept != "audio/*" {
		t.Fatalf("headers auth=%q accept=%q", gotAuth, gotAccept)
	}
	if gotFields["prompt"] != "cinematic pulse" || gotFields["model"] != "stable-audio-2.5" ||
		gotFields["duration"] != "45" || gotFields["steps"] != "8" ||
		gotFields["cfg_scale"] != "1.25" || gotFields["seed"] != "42" ||
		gotFields["output_format"] != "mp3" {
		t.Fatalf("fields = %#v", gotFields)
	}
	if string(resp.Audio) != "stable-audio-2" || resp.MimeType != "audio/mpeg" ||
		resp.ProviderRef != "stable_req_1" || resp.DurationMs != 45000 {
		t.Fatalf("resp = %#v", resp)
	}
}

func TestStabilityGenerateAudioStableAudio3PollsResult(t *testing.T) {
	var startPath string
	var pollPath string
	var startFields map[string]string

	adapter := NewStabilityAdapter("stable-key", "https://stability.test")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v2beta/audio/stable-audio/text-to-audio":
			startPath = r.URL.Path
			if r.Header.Get("Accept") != "application/json" {
				t.Fatalf("start Accept = %q", r.Header.Get("Accept"))
			}
			if err := r.ParseMultipartForm(1024); err != nil {
				t.Fatalf("ParseMultipartForm() error = %v", err)
			}
			startFields = firstMultipartValues(r.MultipartForm.Value)
			return jsonResponse(r, http.StatusOK, map[string]any{"id": "generation_123"}), nil
		case "/v2beta/audio/results/generation_123":
			pollPath = r.URL.Path
			if r.Header.Get("Accept") != "audio/*" {
				t.Fatalf("poll Accept = %q", r.Header.Get("Accept"))
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"audio/wav"}},
				Body:       io.NopCloser(strings.NewReader("stable-audio-3")),
				Request:    r,
			}, nil
		default:
			t.Fatalf("unexpected request path = %s", r.URL.Path)
			return nil, nil
		}
	})}

	resp, err := adapter.GenerateAudio(context.Background(), media.AudioGenerationRequest{
		Kind:        media.AudioGenerationKindSoundEffect,
		Prompt:      "soft rain ambience",
		Model:       "stable-audio-3",
		DurationSec: 10,
		Params: map[string]any{
			"output_format":    "wav",
			"steps":            8,
			"seed":             7,
			"poll_timeout_ms":  1000,
			"poll_interval_ms": 1000,
		},
	})
	if err != nil {
		t.Fatalf("GenerateAudio() error = %v", err)
	}
	if startPath != "/v2beta/audio/stable-audio/text-to-audio" || pollPath != "/v2beta/audio/results/generation_123" {
		t.Fatalf("paths start=%q poll=%q", startPath, pollPath)
	}
	if startFields["prompt"] != "soft rain ambience" || startFields["duration"] != "10" ||
		startFields["steps"] != "8" || startFields["seed"] != "7" ||
		startFields["output_format"] != "wav" {
		t.Fatalf("fields = %#v", startFields)
	}
	if _, hasModel := startFields["model"]; hasModel {
		t.Fatalf("stable audio 3 request should not include model: %#v", startFields)
	}
	if string(resp.Audio) != "stable-audio-3" || resp.MimeType != "audio/wav" ||
		resp.ProviderRef != "generation_123" || resp.DurationMs != 10000 {
		t.Fatalf("resp = %#v", resp)
	}
}

func firstMultipartValues(values map[string][]string) map[string]string {
	out := map[string]string{}
	for key, list := range values {
		if len(list) > 0 {
			out[key] = list[0]
		}
	}
	return out
}

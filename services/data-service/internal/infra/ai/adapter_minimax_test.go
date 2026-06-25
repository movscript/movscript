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

func TestMiniMaxSynthesizeSendsOfficialT2ABodyAndDecodesHex(t *testing.T) {
	var gotBody map[string]any
	adapter := NewMiniMaxAdapter("mini-key", "https://minimax.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.URL.String() != "https://minimax.test/v1/t2a_v2" {
			t.Fatalf("url = %s", r.URL.String())
		}
		if got := r.Header.Get("Authorization"); got != "Bearer mini-key" {
			t.Fatalf("Authorization = %q", got)
		}
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		return &http.Response{
			StatusCode: 200,
			Header:     make(http.Header),
			Body: io.NopCloser(strings.NewReader(`{
				"data":{"audio":"68656c6c6f","status":2},
				"extra_info":{"audio_length":1200,"audio_format":"mp3"},
				"trace_id":"trace-123",
				"base_resp":{"status_code":0,"status_msg":"success"}
			}`)),
		}, nil
	})}

	resp, err := adapter.Synthesize(context.Background(), media.TTSRequest{
		Text:        "你好",
		Voice:       "Chinese_Mandarin_Calm_Female",
		Model:       "speech-2.8-hd",
		Language:    "zh-CN",
		AudioFormat: "mp3",
		Params: map[string]any{
			"speed":           1.1,
			"vol":             1.2,
			"pitch":           -1,
			"sample_rate":     "44100",
			"bitrate":         128000,
			"channel":         1,
			"output_format":   "hex",
			"subtitle_enable": true,
			"subtitle_type":   "word",
		},
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if string(resp.Audio) != "hello" {
		t.Fatalf("audio = %q", string(resp.Audio))
	}
	if resp.MimeType != "audio/mpeg" || resp.DurationMs != 1200 || resp.ProviderRef != "trace-123" {
		t.Fatalf("response = %+v", resp)
	}
	if gotBody["model"] != "speech-2.8-hd" || gotBody["text"] != "你好" || gotBody["language_boost"] != "Chinese" {
		t.Fatalf("body = %#v", gotBody)
	}
	voice := gotBody["voice_setting"].(map[string]any)
	if voice["voice_id"] != "Chinese_Mandarin_Calm_Female" || voice["speed"] != 1.1 || voice["vol"] != 1.2 || voice["pitch"] != float64(-1) {
		t.Fatalf("voice_setting = %#v", voice)
	}
	audio := gotBody["audio_setting"].(map[string]any)
	if audio["sample_rate"] != float64(44100) || audio["bitrate"] != float64(128000) || audio["format"] != "mp3" || audio["channel"] != float64(1) {
		t.Fatalf("audio_setting = %#v", audio)
	}
}

func TestMiniMaxSynthesizeDownloadsURLResponse(t *testing.T) {
	adapter := NewMiniMaxAdapter("mini-key", "https://minimax.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.String() {
		case "https://minimax.test/v1/t2a_v2":
			return &http.Response{
				StatusCode: 200,
				Header:     make(http.Header),
				Body: io.NopCloser(strings.NewReader(`{
					"data":{"audio":"https://cdn.minimax.test/audio.wav","status":2},
					"extra_info":{"audio_length":900,"audio_format":"wav"},
					"trace_id":"trace-url",
					"base_resp":{"status_code":0,"status_msg":"success"}
				}`)),
			}, nil
		case "https://cdn.minimax.test/audio.wav":
			return &http.Response{
				StatusCode: 200,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader("wav-bytes")),
			}, nil
		default:
			t.Fatalf("unexpected url = %s", r.URL.String())
			return nil, nil
		}
	})}

	resp, err := adapter.Synthesize(context.Background(), media.TTSRequest{
		Text:        "download me",
		Model:       "speech-2.8-hd",
		AudioFormat: "wav",
		Params: map[string]any{
			"output_format": "url",
		},
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if string(resp.Audio) != "wav-bytes" {
		t.Fatalf("audio = %q", string(resp.Audio))
	}
	if resp.MimeType != "audio/wav" || resp.DurationMs != 900 || resp.ProviderRef != "trace-url" {
		t.Fatalf("response = %+v", resp)
	}
}

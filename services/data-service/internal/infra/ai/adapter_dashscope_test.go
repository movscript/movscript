package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
)

func TestDashScopeVideoStartSendsHappyHorseMediaPayload(t *testing.T) {
	var gotPath string
	var gotAsync string
	var gotAuth string
	var gotBody map[string]any

	adapter := NewDashScopeAdapter("dash-key", "https://dashscope.test/api/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		gotPath = r.URL.Path
		gotAsync = r.Header.Get("X-DashScope-Async")
		gotAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"output": map[string]any{
				"task_id":     "dash_task_1",
				"task_status": "PENDING",
			},
		}), nil
	})}

	resp, err := adapter.VideoStart(context.Background(), VideoRequest{
		Model:          "happyhorse-1.0-r2v",
		Prompt:         "make a video",
		Duration:       5,
		ResolutionName: "720P",
		Ratio:          "16:9",
		InputImageDataList: []MediaData{
			{PresignedURL: "https://cdn.test/one.png"},
			{PresignedURL: "https://cdn.test/two.png"},
		},
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if gotPath != "/api/v1/services/aigc/video-generation/video-synthesis" {
		t.Fatalf("path = %s", gotPath)
	}
	if gotAsync != "enable" {
		t.Fatalf("X-DashScope-Async = %q, want enable", gotAsync)
	}
	if gotAuth != "Bearer dash-key" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	input := gotBody["input"].(map[string]any)
	media := input["media"].([]any)
	if len(media) != 2 {
		t.Fatalf("media count = %d, want 2", len(media))
	}
	params := gotBody["parameters"].(map[string]any)
	if params["resolution"] != "720P" || params["ratio"] != "16:9" {
		t.Fatalf("parameters = %#v", params)
	}
	if resp.TaskID != "dash_task_1" {
		t.Fatalf("TaskID = %q", resp.TaskID)
	}
}

func TestDashScopeVideoPollReturnsSucceededURL(t *testing.T) {
	adapter := NewDashScopeAdapter("dash-key", "https://dashscope.test/api/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/api/v1/tasks/dash_task_1" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"output": map[string]any{
				"task_status": "SUCCEEDED",
				"video_url":   "https://cdn.test/out.mp4",
			},
		}), nil
	})}

	resp, err := adapter.VideoPoll(context.Background(), VideoPollRequest{TaskID: "dash_task_1"})
	if err != nil {
		t.Fatalf("VideoPoll() error = %v", err)
	}
	if resp.Status != VideoStatusSucceeded || resp.URL != "https://cdn.test/out.mp4" {
		t.Fatalf("resp = %#v", resp)
	}
}

func TestDashScopeSynthesizeQwenTTSSendsMultimodalRequestAndDownloadsAudio(t *testing.T) {
	var gotBody map[string]any
	adapter := NewDashScopeAdapter("dash-key", "https://dashscope.test/api/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.String() {
		case "https://dashscope.test/api/v1/services/aigc/multimodal-generation/generation":
			if got := r.Header.Get("X-DashScope-Async"); got != "" {
				t.Fatalf("X-DashScope-Async = %q, want empty", got)
			}
			if got := r.Header.Get("Authorization"); got != "Bearer dash-key" {
				t.Fatalf("Authorization = %q", got)
			}
			raw, _ := io.ReadAll(r.Body)
			if err := json.Unmarshal(raw, &gotBody); err != nil {
				t.Fatalf("request body JSON error = %v", err)
			}
			return jsonResponse(r, http.StatusOK, map[string]any{
				"status_code": 200,
				"request_id":  "req-qwen",
				"output": map[string]any{
					"finish_reason": "stop",
					"audio": map[string]any{
						"url": "https://cdn.dashscope.test/qwen.wav",
						"id":  "audio-qwen",
					},
				},
			}), nil
		case "https://cdn.dashscope.test/qwen.wav":
			return &http.Response{
				StatusCode: 200,
				Header:     http.Header{"Content-Type": []string{"audio/wav"}},
				Body:       io.NopCloser(strings.NewReader("qwen-audio")),
				Request:    r,
			}, nil
		default:
			t.Fatalf("unexpected URL = %s", r.URL.String())
			return nil, nil
		}
	})}

	resp, err := adapter.Synthesize(context.Background(), media.TTSRequest{
		Text:     "hello",
		Voice:    "Cherry",
		Language: "en",
		Model:    "qwen3-tts-flash",
		Params: map[string]any{
			"instructions":          "warm narration",
			"optimize_instructions": true,
		},
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if string(resp.Audio) != "qwen-audio" || resp.MimeType != "audio/wav" || resp.ProviderRef != "audio-qwen" {
		t.Fatalf("resp = %+v", resp)
	}
	if gotBody["model"] != "qwen3-tts-flash" {
		t.Fatalf("model = %#v", gotBody["model"])
	}
	input := gotBody["input"].(map[string]any)
	if input["text"] != "hello" || input["voice"] != "Cherry" || input["language_type"] != "English" ||
		input["instructions"] != "warm narration" || input["optimize_instructions"] != true {
		t.Fatalf("input = %#v", input)
	}
}

func TestDashScopeSynthesizeCosyVoiceSendsSpeechSynthesizerBodyAndDecodesData(t *testing.T) {
	var gotBody map[string]any
	adapter := NewDashScopeAdapter("dash-key", "https://dashscope.test/api/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://dashscope.test/api/v1/services/audio/tts/SpeechSynthesizer" {
			t.Fatalf("unexpected URL = %s", r.URL.String())
		}
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"request_id": "req-cosy",
			"output": map[string]any{
				"finish_reason": "stop",
				"audio": map[string]any{
					"data": base64.StdEncoding.EncodeToString([]byte("cosy-audio")),
					"id":   "audio-cosy",
				},
			},
		}), nil
	})}

	resp, err := adapter.Synthesize(context.Background(), media.TTSRequest{
		Text:        "你好",
		Voice:       "longxiaochun",
		Language:    "zh-CN",
		Model:       "cosyvoice-v3-flash",
		AudioFormat: "wav",
		SSML:        true,
		Params: map[string]any{
			"sample_rate":     "24000",
			"volume":          80,
			"rate":            1.2,
			"pitch":           1.1,
			"bit_rate":        64,
			"seed":            7,
			"enable_aigc_tag": true,
			"instruction":     "温柔讲述",
		},
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if string(resp.Audio) != "cosy-audio" || resp.MimeType != "audio/wav" || resp.ProviderRef != "audio-cosy" {
		t.Fatalf("resp = %+v", resp)
	}
	input := gotBody["input"].(map[string]any)
	if input["text"] != "你好" || input["voice"] != "longxiaochun" || input["format"] != "wav" ||
		input["sample_rate"] != float64(24000) || input["volume"] != float64(80) ||
		input["rate"] != 1.2 || input["pitch"] != 1.1 || input["bit_rate"] != float64(64) ||
		input["seed"] != float64(7) || input["enable_ssml"] != true ||
		input["enable_aigc_tag"] != true || input["instruction"] != "温柔讲述" {
		t.Fatalf("input = %#v", input)
	}
	hints := input["language_hints"].([]any)
	if len(hints) != 1 || hints[0] != "zh" {
		t.Fatalf("language_hints = %#v", hints)
	}
}

func jsonResponse(r *http.Request, status int, body any) *http.Response {
	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(body)
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(&buf),
		Request:    r,
	}
}

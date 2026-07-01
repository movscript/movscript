package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
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

	ctx, _ := WithDebugRecorder(context.Background())
	resp, err := adapter.VideoStart(ctx, VideoRequest{
		Model:          "happyhorse-1.0-r2v",
		Prompt:         "make a video",
		Duration:       5,
		ResolutionName: "720P",
		Ratio:          "16:9",
		InputImageDataList: []MediaData{
			{PresignedURL: "https://cdn.test/one.png", ResourceID: 11},
			{PresignedURL: "https://cdn.test/two.png", ResourceID: 12},
		},
		ReferenceAssets: []ReferenceAsset{
			{Role: "first_frame", MediaType: "image", ResourceID: 11},
			{Role: "last_frame", MediaType: "image", ResourceID: 12},
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
	if _, ok := gotBody["reference_asset_bindings"]; ok {
		t.Fatalf("request body sent debug-only bindings: %#v", gotBody["reference_asset_bindings"])
	}
	debugBody := debugRequestBodyMap(t, resp.Debug)
	bindings := debugBody["reference_asset_bindings"].([]any)
	if len(bindings) != 2 || bindings[0].(map[string]any)["provider_field"] != "input.media[]" {
		t.Fatalf("debug reference_asset_bindings = %#v", bindings)
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

func TestDashScopeImageGenerateUsesQwenImageMultimodalEndpoint(t *testing.T) {
	var gotBody map[string]any
	var gotAsync string
	seed := int64(42)
	watermark := false
	adapter := NewDashScopeAdapter("dash-key", "https://dashscope.test/api/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://dashscope.test/api/v1/services/aigc/multimodal-generation/generation" {
			t.Fatalf("unexpected URL = %s", r.URL.String())
		}
		gotAsync = r.Header.Get("X-DashScope-Async")
		if got := r.Header.Get("Authorization"); got != "Bearer dash-key" {
			t.Fatalf("Authorization = %q", got)
		}
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"request_id": "req-image",
			"output": map[string]any{
				"choices": []map[string]any{{
					"finish_reason": "stop",
					"message": map[string]any{
						"role": "assistant",
						"content": []map[string]any{{
							"image": "https://cdn.dashscope.test/out.png",
						}},
					},
				}},
			},
		}), nil
	})}

	resp, err := adapter.ImageGenerate(context.Background(), ImageRequest{
		Model:              "qwen-image",
		Prompt:             "draw a title card",
		AspectRatio:        "16:9",
		Seed:               &seed,
		Watermark:          &watermark,
		OptimizePromptMode: "auto",
	})
	if err != nil {
		t.Fatalf("ImageGenerate() error = %v", err)
	}
	if gotAsync != "" {
		t.Fatalf("X-DashScope-Async = %q, want empty for synchronous Qwen-Image", gotAsync)
	}
	if len(resp.URLs) != 1 || resp.URLs[0] != "https://cdn.dashscope.test/out.png" {
		t.Fatalf("URLs = %#v", resp.URLs)
	}
	if gotBody["model"] != "qwen-image" {
		t.Fatalf("model = %#v", gotBody["model"])
	}
	input := gotBody["input"].(map[string]any)
	messages := input["messages"].([]any)
	message := messages[0].(map[string]any)
	content := message["content"].([]any)
	textPart := content[0].(map[string]any)
	if message["role"] != "user" || textPart["text"] != "draw a title card" {
		t.Fatalf("messages = %#v", messages)
	}
	params := gotBody["parameters"].(map[string]any)
	if params["size"] != "1664*928" || params["seed"] != float64(42) || params["watermark"] != false || params["prompt_extend"] != true {
		t.Fatalf("parameters = %#v", params)
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

func TestDashScopeSynthesizeQwenRealtimeTTSUsesWebSocketEvents(t *testing.T) {
	var gotAuth string
	var gotModel string
	var gotEvents []map[string]any
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api-ws/v1/realtime" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		gotModel = r.URL.Query().Get("model")
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade websocket: %v", err)
		}
		defer conn.Close()
		if err := conn.WriteJSON(map[string]any{
			"type":    "session.created",
			"session": map[string]any{"id": "sess_1"},
		}); err != nil {
			t.Fatalf("write session.created: %v", err)
		}
		for i := 0; i < 3; i++ {
			var event map[string]any
			if err := conn.ReadJSON(&event); err != nil {
				t.Fatalf("read client event %d: %v", i, err)
			}
			gotEvents = append(gotEvents, event)
		}
		audio := base64.StdEncoding.EncodeToString([]byte("wav-delta"))
		_ = conn.WriteJSON(map[string]any{"type": "response.created", "response": map[string]any{"id": "resp_1"}})
		_ = conn.WriteJSON(map[string]any{"type": "response.audio.delta", "response_id": "resp_1", "delta": audio})
		_ = conn.WriteJSON(map[string]any{"type": "response.done", "response": map[string]any{"id": "resp_1", "status": "completed"}})
		var finish map[string]any
		_ = conn.ReadJSON(&finish)
	}))
	defer server.Close()

	adapter := NewDashScopeAdapter("dash-key", server.URL+"/api/v1")
	resp, err := adapter.Synthesize(context.Background(), media.TTSRequest{
		Model:       "qwen3-tts-flash-realtime",
		Text:        "hello realtime",
		Voice:       "Cherry",
		Language:    "en",
		AudioFormat: "wav",
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if gotAuth != "Bearer dash-key" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	if gotModel != "qwen3-tts-flash-realtime" {
		t.Fatalf("model query = %q", gotModel)
	}
	if string(resp.Audio) != "wav-delta" || resp.MimeType != "audio/wav" || resp.ProviderRef != "resp_1" {
		t.Fatalf("resp = %#v", resp)
	}
	if len(gotEvents) != 3 ||
		gotEvents[0]["type"] != "session.update" ||
		gotEvents[1]["type"] != "input_text_buffer.append" ||
		gotEvents[2]["type"] != "input_text_buffer.commit" {
		t.Fatalf("events = %#v", gotEvents)
	}
	session := gotEvents[0]["session"].(map[string]any)
	if session["voice"] != "Cherry" || session["response_format"] != "wav" || session["language_type"] != "English" {
		t.Fatalf("session = %#v", session)
	}
	if gotEvents[1]["text"] != "hello realtime" {
		t.Fatalf("append event = %#v", gotEvents[1])
	}
}

func TestDashScopeGenerateSpeechToSpeechQwenOmniUsesRealtimeWebSocketEvents(t *testing.T) {
	var gotAuth string
	var gotModel string
	var gotEvents []map[string]any
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api-ws/v1/realtime" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		gotModel = r.URL.Query().Get("model")
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade websocket: %v", err)
		}
		defer conn.Close()
		for i := 0; i < 4; i++ {
			var event map[string]any
			if err := conn.ReadJSON(&event); err != nil {
				t.Fatalf("read client event %d: %v", i, err)
			}
			gotEvents = append(gotEvents, event)
		}
		audio := base64.StdEncoding.EncodeToString([]byte("pcm-delta"))
		_ = conn.WriteJSON(map[string]any{"type": "response.created", "response": map[string]any{"id": "omni_resp_1"}})
		_ = conn.WriteJSON(map[string]any{"type": "response.audio.delta", "response_id": "omni_resp_1", "delta": audio})
		_ = conn.WriteJSON(map[string]any{"type": "response.audio_transcript.done", "transcript": "你好，我听到了。"})
		_ = conn.WriteJSON(map[string]any{"type": "response.done", "response": map[string]any{"id": "omni_resp_1", "status": "completed"}})
	}))
	defer server.Close()

	adapter := NewDashScopeAdapter("dash-key", server.URL+"/api/v1")
	resp, err := adapter.GenerateSpeechToSpeech(context.Background(), media.SpeechToSpeechRequest{
		Model:    "qwen3-omni-flash-realtime",
		Prompt:   "用中文回答",
		Audio:    []byte("pcm-input"),
		MimeType: "audio/L16",
		Voice:    "Tina",
	})
	if err != nil {
		t.Fatalf("GenerateSpeechToSpeech() error = %v", err)
	}
	if gotAuth != "Bearer dash-key" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	if gotModel != "qwen3-omni-flash-realtime" {
		t.Fatalf("model query = %q", gotModel)
	}
	if string(resp.Audio) != "pcm-delta" || resp.Text != "你好，我听到了。" || resp.MimeType != "audio/L16" || resp.ProviderRef != "omni_resp_1" {
		t.Fatalf("resp = %#v", resp)
	}
	if len(gotEvents) != 4 ||
		gotEvents[0]["type"] != "session.update" ||
		gotEvents[1]["type"] != "input_audio_buffer.append" ||
		gotEvents[2]["type"] != "input_audio_buffer.commit" ||
		gotEvents[3]["type"] != "response.create" {
		t.Fatalf("events = %#v", gotEvents)
	}
	session := gotEvents[0]["session"].(map[string]any)
	if session["voice"] != "Tina" || session["input_audio_format"] != "pcm" || session["output_audio_format"] != "pcm" ||
		session["instructions"] != "用中文回答" {
		t.Fatalf("session = %#v", session)
	}
	inputTranscription := session["input_audio_transcription"].(map[string]any)
	if inputTranscription["model"] != "qwen3-asr-flash-realtime" {
		t.Fatalf("input_audio_transcription = %#v", inputTranscription)
	}
	if gotEvents[1]["audio"] != base64.StdEncoding.EncodeToString([]byte("pcm-input")) {
		t.Fatalf("append event = %#v", gotEvents[1])
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

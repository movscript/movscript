package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
	"github.com/movscript/movscript/internal/domain/media"
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
		InputVideo: "https://example.test/ref.mp4",
		InputAudio: "https://example.test/music.mp3",
		ReferenceAssets: []ReferenceAsset{
			{Role: "first_frame", MediaType: "image", ResourceID: 11},
			{Role: "last_frame", MediaType: "image", ResourceID: 12},
			{Role: "reference_video", MediaType: "video", ResourceID: 13},
			{Role: "reference_audio", MediaType: "audio", ResourceID: 14},
		},
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
	bindings, ok := debugBody["reference_asset_bindings"].([]map[string]any)
	if !ok || len(bindings) != 4 {
		t.Fatalf("reference_asset_bindings = %#v, want four structured bindings", debugBody["reference_asset_bindings"])
	}
	if bindings[0]["resource_id"] != uint(11) || bindings[0]["role"] != "first_frame" || bindings[0]["provider_field"] != "content[].image_url" || bindings[0]["provider_role"] != "reference_image" {
		t.Fatalf("first frame binding = %#v", bindings[0])
	}
	if bindings[1]["role"] != "last_frame" || bindings[1]["provider_role"] != "reference_image" {
		t.Fatalf("last frame binding = %#v", bindings[1])
	}
	if bindings[2]["provider_field"] != "content[].video_url" || bindings[2]["provider_role"] != "reference_video" {
		t.Fatalf("video binding = %#v", bindings[2])
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

func TestVolcenSynthesizeSendsSpeechTTSRequestAndDecodesAudio(t *testing.T) {
	var gotAuth string
	var gotBody map[string]any
	adapter := NewVolcenAdapterWithSpeech("https://ark.example.test/api/v3", "ark-key", volcenSpeechCredentials{
		AppID:   "speech-app",
		Token:   "speech-token",
		Cluster: "volcano_tts",
		BaseURL: "https://openspeech.example.test",
	})
	adapter.speechHTTP = &http.Client{Transport: volcenRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://openspeech.example.test/api/v1/tts" {
			t.Fatalf("unexpected URL = %s", r.URL.String())
		}
		gotAuth = r.Header.Get("Authorization")
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"reqid":"req-volcen-1",
				"code":3000,
				"operation":"submit",
				"message":"Success",
				"sequence":-1,
				"data":"` + base64.StdEncoding.EncodeToString([]byte("mp3-audio")) + `"
			}`)),
			Request: r,
		}, nil
	})}

	resp, err := adapter.Synthesize(context.Background(), media.TTSRequest{
		Text:        "你好",
		Voice:       "zh_male_M392_conversation_wvae_bigtts",
		Model:       "seed-tts-1.1",
		AudioFormat: "mp3",
		Language:    "zh",
		Params: map[string]any{
			"uid":         "user-1",
			"sample_rate": 24000,
			"speed_ratio": 1.2,
		},
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if gotAuth != "Bearer; speech-token" {
		t.Fatalf("Authorization = %q, want Volcengine speech token", gotAuth)
	}
	if string(resp.Audio) != "mp3-audio" || resp.MimeType != "audio/mpeg" || resp.ProviderRef != "req-volcen-1" {
		t.Fatalf("resp = %+v", resp)
	}
	app := gotBody["app"].(map[string]any)
	if app["appid"] != "speech-app" || app["token"] != "speech-token" || app["cluster"] != "volcano_tts" {
		t.Fatalf("app = %#v", app)
	}
	audio := gotBody["audio"].(map[string]any)
	if audio["voice_type"] != "zh_male_M392_conversation_wvae_bigtts" || audio["encoding"] != "mp3" || audio["language"] != "zh" {
		t.Fatalf("audio = %#v", audio)
	}
	request := gotBody["request"].(map[string]any)
	if request["text"] != "你好" || request["operation"] != "submit" || request["model"] != "seed-tts-1.1" {
		t.Fatalf("request = %#v", request)
	}
	user := gotBody["user"].(map[string]any)
	if user["uid"] != "user-1" {
		t.Fatalf("user = %#v", user)
	}
}

func TestVolcenSynthesizeSeedTTS20UsesV3UnidirectionalRequest(t *testing.T) {
	var gotHeaders http.Header
	var gotBody map[string]any
	adapter := NewVolcenAdapterWithSpeech("https://ark.example.test/api/v3", "ark-key", volcenSpeechCredentials{
		AppID:   "speech-app",
		Token:   "speech-token",
		BaseURL: "https://openspeech.example.test",
	})
	adapter.speechHTTP = &http.Client{Transport: volcenRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://openspeech.example.test/api/v3/tts/unidirectional" {
			t.Fatalf("unexpected URL = %s", r.URL.String())
		}
		gotHeaders = r.Header.Clone()
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"audio/mpeg"}},
			Body:       io.NopCloser(strings.NewReader("mp3-audio")),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.Synthesize(context.Background(), media.TTSRequest{
		Text:        "你好",
		Voice:       "zh_female_vv_uranus_bigtts",
		Model:       "seed-tts-2.0-expressive",
		AudioFormat: "mp3",
		Language:    "zh-cn",
		Params: map[string]any{
			"uid":           "user-2",
			"request_id":    "tts-v3-req-1",
			"speech_rate":   15,
			"loudness_rate": -5,
			"emotion":       "happy",
			"sample_rate":   24000,
		},
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if string(resp.Audio) != "mp3-audio" || resp.MimeType != "audio/mpeg" || resp.ProviderRef != "tts-v3-req-1" {
		t.Fatalf("resp = %+v", resp)
	}
	if gotHeaders.Get("X-Api-Key") != "speech-token" ||
		gotHeaders.Get("X-Api-Resource-Id") != "seed-tts-2.0" ||
		gotHeaders.Get("X-Api-Request-Id") != "tts-v3-req-1" {
		t.Fatalf("headers = %#v", gotHeaders)
	}
	user := gotBody["user"].(map[string]any)
	if user["uid"] != "user-2" {
		t.Fatalf("user = %#v", user)
	}
	reqParams := gotBody["req_params"].(map[string]any)
	if reqParams["text"] != "你好" || reqParams["speaker"] != "zh_female_vv_uranus_bigtts" || reqParams["model"] != "seed-tts-2.0-expressive" {
		t.Fatalf("req_params = %#v", reqParams)
	}
	audioParams := reqParams["audio_params"].(map[string]any)
	if audioParams["format"] != "mp3" || audioParams["sample_rate"] != float64(24000) ||
		audioParams["speech_rate"] != float64(15) || audioParams["loudness_rate"] != float64(-5) ||
		audioParams["emotion"] != "happy" {
		t.Fatalf("audio_params = %#v", audioParams)
	}
	additions := reqParams["additions"].(map[string]any)
	if additions["explicit_language"] != "zh-cn" {
		t.Fatalf("additions = %#v", additions)
	}
}

func TestVolcenDesignVoiceUsesV3VoiceDesignRequest(t *testing.T) {
	var gotHeaders http.Header
	var gotBody map[string]any
	adapter := NewVolcenAdapterWithSpeech("https://ark.example.test/api/v3", "ark-key", volcenSpeechCredentials{
		Token:   "speech-token",
		BaseURL: "https://openspeech.example.test",
	})
	adapter.speechHTTP = &http.Client{Transport: volcenRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://openspeech.example.test/api/v3/tts/voice_design" {
			t.Fatalf("unexpected URL = %s", r.URL.String())
		}
		gotHeaders = r.Header.Clone()
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
				"speaker_id": "S_design",
				"audio_url": "https://cdn.example.test/preview.wav",
				"status": "success"
			}`)),
			Request: r,
		}, nil
	})}

	resp, err := adapter.DesignVoice(context.Background(), media.VoiceDesignRequest{
		Name:        "Gentle Guide",
		Description: "A warm, gentle narrator voice",
		PreviewText: "欢迎来到故事。",
		Model:       "doubao-seed-voice-design",
		Params: map[string]any{
			"request_id":  "voice-design-req-1",
			"language":    0,
			"sample_rate": 24000,
		},
	})
	if err != nil {
		t.Fatalf("DesignVoice() error = %v", err)
	}
	if resp.VoiceID != "S_design" || resp.GeneratedVoiceID != "S_design" || resp.PreviewURL != "https://cdn.example.test/preview.wav" || resp.ProviderRef != "S_design" {
		t.Fatalf("resp = %+v", resp)
	}
	if gotHeaders.Get("X-Api-Key") != "speech-token" ||
		gotHeaders.Get("X-Api-Resource-Id") != "doubao-seed-voice-design" ||
		gotHeaders.Get("X-Api-Request-Id") != "voice-design-req-1" {
		t.Fatalf("headers = %#v", gotHeaders)
	}
	prompt := gotBody["prompt"].(map[string]any)
	if prompt["text_prompt"] != "A warm, gentle narrator voice" {
		t.Fatalf("prompt = %#v", prompt)
	}
	if gotBody["preview_text"] != "欢迎来到故事。" || gotBody["speaker_name"] != "Gentle Guide" ||
		gotBody["language"] != float64(0) || gotBody["sample_rate"] != float64(24000) {
		t.Fatalf("body = %#v", gotBody)
	}
}

func TestVolcenTranscribeSubmitsPollsAndParsesSeedASR(t *testing.T) {
	var submitBody map[string]any
	var submitHeaders http.Header
	var queryHeaders http.Header
	adapter := NewVolcenAdapterWithSpeech("https://ark.example.test/api/v3", "ark-key", volcenSpeechCredentials{
		AppID:   "speech-app",
		Token:   "speech-token",
		BaseURL: "https://openspeech.example.test",
	})
	adapter.speechHTTP = &http.Client{Transport: volcenRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		switch r.URL.String() {
		case "https://openspeech.example.test/api/v3/auc/bigmodel/submit":
			submitHeaders = r.Header.Clone()
			raw, _ := io.ReadAll(r.Body)
			if err := json.Unmarshal(raw, &submitBody); err != nil {
				t.Fatalf("submit body JSON error = %v", err)
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header: http.Header{
					"X-Api-Status-Code": []string{"20000000"},
					"X-Api-Message":     []string{"Success"},
				},
				Body:    io.NopCloser(strings.NewReader(`{}`)),
				Request: r,
			}, nil
		case "https://openspeech.example.test/api/v3/auc/bigmodel/query":
			queryHeaders = r.Header.Clone()
			return &http.Response{
				StatusCode: http.StatusOK,
				Header: http.Header{
					"X-Api-Status-Code": []string{"20000000"},
					"X-Api-Message":     []string{"Success"},
				},
				Body: io.NopCloser(strings.NewReader(`{
					"result": {
						"text": "你好世界",
						"utterances": [
							{"text": "你好", "start_time": 0, "end_time": 1200, "speaker_id": "spk1"},
							{"text": "世界", "start_time": 1200, "end_time": 2300, "speaker_id": "spk1"}
						]
					}
				}`)),
				Request: r,
			}, nil
		default:
			t.Fatalf("unexpected URL = %s", r.URL.String())
			return nil, nil
		}
	})}

	resp, err := adapter.Transcribe(context.Background(), media.TranscribeRequest{
		Audio:    []byte("audio-bytes"),
		MimeType: "audio/m4a",
		Language: "zh-CN",
		Model:    "volc.seedasr.auc",
		Params: map[string]any{
			"request_id":       "asr-task-1",
			"poll_timeout_ms":  1000,
			"poll_interval_ms": 500,
		},
	})
	if err != nil {
		t.Fatalf("Transcribe() error = %v", err)
	}
	if resp.ProviderRef != "asr-task-1" || string(resp.Content) != "你好世界" {
		t.Fatalf("resp = %+v", resp)
	}
	if len(resp.Timing.Segments) != 2 || resp.Timing.Segments[0].Text != "你好" || resp.Timing.Segments[1].EndMs != 2300 {
		t.Fatalf("segments = %#v", resp.Timing.Segments)
	}
	if submitHeaders.Get("X-Api-App-Key") != "speech-app" || submitHeaders.Get("X-Api-Access-Key") != "speech-token" ||
		submitHeaders.Get("X-Api-Resource-Id") != "volc.seedasr.auc" || submitHeaders.Get("X-Api-Request-Id") != "asr-task-1" {
		t.Fatalf("submit headers = %#v", submitHeaders)
	}
	if queryHeaders.Get("X-Api-Request-Id") != "asr-task-1" || queryHeaders.Get("X-Api-Resource-Id") != "volc.seedasr.auc" {
		t.Fatalf("query headers = %#v", queryHeaders)
	}
	audio := submitBody["audio"].(map[string]any)
	if audio["format"] != "m4a" || audio["data"] != base64.StdEncoding.EncodeToString([]byte("audio-bytes")) || audio["language"] != "zh-CN" {
		t.Fatalf("audio body = %#v", audio)
	}
	request := submitBody["request"].(map[string]any)
	if request["model_name"] != "bigmodel" || request["enable_itn"] != true || request["show_utterances"] != true {
		t.Fatalf("request body = %#v", request)
	}
}

func TestVolcenChatAudioRealtimeDialogueUsesOfficialBinaryFrames(t *testing.T) {
	upgrader := websocket.Upgrader{}
	var gotHeaders http.Header
	var startSession map[string]any
	var gotAudio []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v3/realtime/dialogue" {
			t.Fatalf("unexpected path = %s", r.URL.Path)
		}
		gotHeaders = r.Header.Clone()
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade websocket: %v", err)
		}
		defer conn.Close()

		_, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("read start connection: %v", err)
		}
		frame, err := parseVolcenRealtimeFrame(data)
		if err != nil {
			t.Fatalf("parse start connection: %v", err)
		}
		if frame.MessageType != 0x1 || frame.Event != volcenRealtimeEventStartConnection || string(frame.Payload) != "{}" {
			t.Fatalf("start connection frame = %+v payload=%q", frame, string(frame.Payload))
		}
		if err := conn.WriteMessage(websocket.BinaryMessage, volcenRealtimeFrame(0x9, 0x1, volcenRealtimeEventConnectionStarted, "", []byte(`{}`))); err != nil {
			t.Fatalf("write connection started: %v", err)
		}

		_, data, err = conn.ReadMessage()
		if err != nil {
			t.Fatalf("read start session: %v", err)
		}
		frame, err = parseVolcenRealtimeFrame(data)
		if err != nil {
			t.Fatalf("parse start session: %v", err)
		}
		if frame.MessageType != 0x1 || frame.Event != volcenRealtimeEventStartSession || frame.SessionID != "session-test" {
			t.Fatalf("start session frame = %+v", frame)
		}
		if err := json.Unmarshal(frame.Payload, &startSession); err != nil {
			t.Fatalf("start session payload JSON error = %v", err)
		}
		if err := conn.WriteMessage(websocket.BinaryMessage, volcenRealtimeFrame(0x9, 0x1, volcenRealtimeEventSessionStarted, "session-test", []byte(`{"dialog_id":"dialog-1"}`))); err != nil {
			t.Fatalf("write session started: %v", err)
		}

		_, data, err = conn.ReadMessage()
		if err != nil {
			t.Fatalf("read audio frame: %v", err)
		}
		frame, err = parseVolcenRealtimeFrame(data)
		if err != nil {
			t.Fatalf("parse audio frame: %v", err)
		}
		if frame.MessageType != 0x2 || frame.Event != volcenRealtimeEventTaskRequest || frame.SessionID != "session-test" {
			t.Fatalf("audio frame = %+v", frame)
		}
		gotAudio = append([]byte(nil), frame.Payload...)

		_, data, err = conn.ReadMessage()
		if err != nil {
			t.Fatalf("read end ASR frame: %v", err)
		}
		frame, err = parseVolcenRealtimeFrame(data)
		if err != nil {
			t.Fatalf("parse end ASR frame: %v", err)
		}
		if frame.Event != volcenRealtimeEventEndASR || frame.SessionID != "session-test" {
			t.Fatalf("end ASR frame = %+v", frame)
		}
		_ = conn.WriteMessage(websocket.BinaryMessage, volcenRealtimeFrame(0x9, 0x1, volcenRealtimeEventChatResponse, "session-test", []byte(`{"content":"你好","reply_id":"reply-1"}`)))
		_ = conn.WriteMessage(websocket.BinaryMessage, volcenRealtimeFrame(0xb, 0x0, volcenRealtimeEventTTSResponse, "session-test", []byte("pcm-out")))
		_ = conn.WriteMessage(websocket.BinaryMessage, volcenRealtimeFrame(0x9, 0x1, volcenRealtimeEventTTSEnded, "session-test", []byte(`{}`)))
	}))
	defer server.Close()

	adapter := NewVolcenAdapterWithSpeech("https://ark.example.test/api/v3", "ark-key", volcenSpeechCredentials{
		AppID:   "speech-app",
		Token:   "speech-token",
		BaseURL: server.URL,
	})
	resp, err := adapter.ChatAudio(context.Background(), media.AudioChatRequest{
		Audio:    []byte("pcm-in"),
		MimeType: "audio/L16",
		Model:    "Doubao-RealtimeVoice",
		Voice:    "zh_female_vv_jupiter_bigtts",
		Params: map[string]any{
			"session_id":          "session-test",
			"connect_id":          "connect-test",
			"model_version":       "1.2.1.1",
			"output_audio_format": "pcm_s16le",
		},
	})
	if err != nil {
		t.Fatalf("ChatAudio() error = %v", err)
	}
	if string(resp.Audio) != "pcm-out" || resp.Text != "你好" || resp.ProviderRef != "reply-1" || resp.MimeType != "audio/L16" {
		t.Fatalf("resp = %+v", resp)
	}
	if gotHeaders.Get("X-Api-App-ID") != "speech-app" ||
		gotHeaders.Get("X-Api-Access-Key") != "speech-token" ||
		gotHeaders.Get("X-Api-Resource-Id") != volcenRealtimeDialogueResourceID ||
		gotHeaders.Get("X-Api-App-Key") != volcenRealtimeDialogueAppKey ||
		gotHeaders.Get("X-Api-Connect-Id") != "connect-test" {
		t.Fatalf("headers = %#v", gotHeaders)
	}
	if string(gotAudio) != "pcm-in" {
		t.Fatalf("got audio = %q", string(gotAudio))
	}
	dialog := startSession["dialog"].(map[string]any)
	extra := dialog["extra"].(map[string]any)
	if extra["input_mod"] != "audio_file" || extra["model"] != "1.2.1.1" {
		t.Fatalf("dialog extra = %#v", extra)
	}
	asr := startSession["asr"].(map[string]any)
	audioInfo := asr["audio_info"].(map[string]any)
	if audioInfo["format"] != "pcm" || audioInfo["sample_rate"] != float64(16000) {
		t.Fatalf("asr audio_info = %#v", audioInfo)
	}
	tts := startSession["tts"].(map[string]any)
	audioConfig := tts["audio_config"].(map[string]any)
	if tts["speaker"] != "zh_female_vv_jupiter_bigtts" || audioConfig["format"] != "pcm_s16le" {
		t.Fatalf("tts config = %#v", tts)
	}
}

func TestVolcenGenerateAudioUsesArkContentGenerationTask(t *testing.T) {
	var createBody map[string]any
	audioServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("mp3-audio"))
	}))
	defer audioServer.Close()

	arkServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/v3/contents/generations/tasks":
			if r.Header.Get("Authorization") != "Bearer ark-key" {
				t.Fatalf("Authorization = %q", r.Header.Get("Authorization"))
			}
			raw, _ := io.ReadAll(r.Body)
			if err := json.Unmarshal(raw, &createBody); err != nil {
				t.Fatalf("create body JSON error = %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"audio-task-1"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/v3/contents/generations/tasks/audio-task-1":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{
				"id":"audio-task-1",
				"model":"doubao-seed-audio-1-0",
				"status":"succeeded",
				"content":{"file_url":"` + audioServer.URL + `/out.mp3"},
				"duration":12
			}`))
		default:
			t.Fatalf("unexpected ark request %s %s", r.Method, r.URL.String())
		}
	}))
	defer arkServer.Close()

	adapter := NewVolcenAdapter(arkServer.URL+"/api/v3", "ark-key")
	resp, err := adapter.GenerateAudio(context.Background(), media.AudioGenerationRequest{
		Kind:        media.AudioGenerationKindMusic,
		Prompt:      "two characters talk in a rainy alley with soft jazz ambience",
		Model:       "doubao-seed-audio-1-0",
		DurationSec: 12,
		Params: map[string]any{
			"output_format":    "mp3",
			"negative_prompt":  "distortion",
			"poll_timeout_ms":  1000,
			"poll_interval_ms": 500,
		},
	})
	if err != nil {
		t.Fatalf("GenerateAudio() error = %v", err)
	}
	if string(resp.Audio) != "mp3-audio" || resp.MimeType != "audio/mpeg" || resp.DurationMs != 12000 || resp.ProviderRef != "audio-task-1" {
		t.Fatalf("resp = %+v", resp)
	}
	if createBody["model"] != "doubao-seed-audio-1-0" || createBody["duration"] != float64(12) ||
		createBody["output_format"] != "mp3" || createBody["negative_prompt"] != "distortion" {
		t.Fatalf("create body = %#v", createBody)
	}
	content := createBody["content"].([]any)
	first := content[0].(map[string]any)
	if first["type"] != "text" || first["text"] != "two characters talk in a rainy alley with soft jazz ambience" {
		t.Fatalf("content = %#v", content)
	}
}

func TestVolcenCloneVoiceUploadsSampleAndPollsStatus(t *testing.T) {
	var uploadBody map[string]any
	var uploadHeaders http.Header
	var statusBody map[string]any
	adapter := NewVolcenAdapterWithSpeech("https://ark.example.test/api/v3", "ark-key", volcenSpeechCredentials{
		AppID:   "speech-app",
		Token:   "speech-token",
		BaseURL: "https://openspeech.example.test",
	})
	adapter.speechHTTP = &http.Client{Transport: volcenRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		raw, _ := io.ReadAll(r.Body)
		switch r.URL.String() {
		case "https://openspeech.example.test/api/v1/mega_tts/audio/upload":
			uploadHeaders = r.Header.Clone()
			if err := json.Unmarshal(raw, &uploadBody); err != nil {
				t.Fatalf("upload body JSON error = %v", err)
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body: io.NopCloser(strings.NewReader(`{
					"BaseResp": {"StatusCode": 0, "StatusMessage": "OK"},
					"speaker_id": "S_test",
					"status": 1
				}`)),
				Request: r,
			}, nil
		case "https://openspeech.example.test/api/v1/mega_tts/status":
			if err := json.Unmarshal(raw, &statusBody); err != nil {
				t.Fatalf("status body JSON error = %v", err)
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body: io.NopCloser(strings.NewReader(`{
					"BaseResp": {"StatusCode": 0, "StatusMessage": "OK"},
					"speaker_id": "S_test",
					"icl_speaker_id": "ICL_test",
					"status": 2,
					"demo_audio": "https://cdn.example.test/demo.wav"
				}`)),
				Request: r,
			}, nil
		default:
			t.Fatalf("unexpected URL = %s", r.URL.String())
			return nil, nil
		}
	})}

	resp, err := adapter.CloneVoice(context.Background(), media.VoiceCloneRequest{
		Name:        "Narrator",
		Description: "Warm voice",
		Samples: []media.VoiceCloneSample{{
			Audio:    []byte("wav-audio"),
			MimeType: "audio/wav",
		}},
		Params: map[string]any{
			"speaker_id":       "S_test",
			"wait_for_ready":   true,
			"poll_timeout_ms":  1000,
			"poll_interval_ms": 500,
		},
	})
	if err != nil {
		t.Fatalf("CloneVoice() error = %v", err)
	}
	if resp.VoiceID != "S_test" || resp.GeneratedVoiceID != "ICL_test" || resp.PreviewURL != "https://cdn.example.test/demo.wav" {
		t.Fatalf("resp = %+v", resp)
	}
	if uploadHeaders.Get("Authorization") != "Bearer; speech-token" ||
		uploadHeaders.Get("Resource-Id") != "seed-icl-2.0" ||
		uploadHeaders.Get("Content-Type") != "application/json" {
		t.Fatalf("upload headers = %#v", uploadHeaders)
	}
	if uploadBody["appid"] != "speech-app" || uploadBody["speaker_id"] != "S_test" ||
		uploadBody["speaker_name"] != "Narrator" || uploadBody["description"] != "Warm voice" ||
		uploadBody["model_type"] != float64(4) || uploadBody["source"] != float64(2) || uploadBody["language"] != float64(0) {
		t.Fatalf("upload body = %#v", uploadBody)
	}
	audios := uploadBody["audios"].([]any)
	audio := audios[0].(map[string]any)
	if audio["audio_format"] != "wav" || audio["audio_bytes"] != base64.StdEncoding.EncodeToString([]byte("wav-audio")) {
		t.Fatalf("audio body = %#v", audio)
	}
	if statusBody["appid"] != "speech-app" || statusBody["speaker_id"] != "S_test" {
		t.Fatalf("status body = %#v", statusBody)
	}
}

func TestVolcenCredentialRawSupportsSpeechFieldsAndLegacyKey(t *testing.T) {
	rawLegacy := buildVolcenCredentialRaw(map[string]string{"api_key": "ark-key"})
	if rawLegacy != "ark-key" {
		t.Fatalf("legacy raw = %q, want api key", rawLegacy)
	}
	apiKey, speech := splitVolcenCredential(rawLegacy)
	if apiKey != "ark-key" || speech.Token != "" {
		t.Fatalf("legacy split = %q/%#v", apiKey, speech)
	}

	raw := buildVolcenCredentialRaw(map[string]string{
		"api_key":         "ark-key",
		"speech_app_id":   "speech-app",
		"speech_token":    "speech-token",
		"speech_cluster":  "volcano_tts",
		"speech_base_url": "https://openspeech.example.test",
	})
	apiKey, speech = splitVolcenCredential(raw)
	if apiKey != "ark-key" || speech.AppID != "speech-app" || speech.Token != "speech-token" ||
		speech.Cluster != "volcano_tts" || speech.BaseURL != "https://openspeech.example.test" {
		t.Fatalf("split = %q/%#v", apiKey, speech)
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

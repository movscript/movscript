package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"reflect"
	"strings"
	"testing"

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
		InputVideo:    "https://example.test/ref.mp4",
		InputAudio:    "https://example.test/music.mp3",
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

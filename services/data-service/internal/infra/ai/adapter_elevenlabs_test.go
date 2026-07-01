package ai

import (
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

func TestElevenLabsTranscribeRealtimeUsesWebSocketEvents(t *testing.T) {
	var gotAPIKey string
	var gotModel string
	var gotIncludeTimestamps string
	var gotChunk map[string]any
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/speech-to-text/realtime" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		gotAPIKey = r.Header.Get("xi-api-key")
		gotModel = r.URL.Query().Get("model_id")
		gotIncludeTimestamps = r.URL.Query().Get("include_timestamps")
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade websocket: %v", err)
		}
		defer conn.Close()
		_ = conn.WriteJSON(map[string]any{
			"message_type": "session_started",
			"session_id":   "scribe_session_1",
		})
		if err := conn.ReadJSON(&gotChunk); err != nil {
			t.Fatalf("read input chunk: %v", err)
		}
		_ = conn.WriteJSON(map[string]any{
			"message_type":  "committed_transcript_with_timestamps",
			"text":          "hello realtime",
			"language_code": "en",
			"words": []map[string]any{
				{"text": "hello", "start": 0.1, "end": 0.4, "confidence": 0.9},
			},
		})
	}))
	defer server.Close()

	adapter := NewElevenLabsAdapter("eleven-key", server.URL+"/v1")
	resp, err := adapter.Transcribe(context.Background(), media.TranscribeRequest{
		Audio:    []byte("pcm-bytes"),
		MimeType: "audio/L16",
		Language: "en",
		Model:    "scribe_v2_realtime",
		Params: map[string]any{
			"sample_rate": 16000,
			"keyterms":    "ElevenLabs,MovScript",
		},
	})
	if err != nil {
		t.Fatalf("Transcribe realtime error: %v", err)
	}
	if gotAPIKey != "eleven-key" {
		t.Fatalf("xi-api-key = %q", gotAPIKey)
	}
	if gotModel != "scribe_v2_realtime" || gotIncludeTimestamps != "true" {
		t.Fatalf("query model=%q include_timestamps=%q", gotModel, gotIncludeTimestamps)
	}
	if gotChunk["message_type"] != "input_audio_chunk" || gotChunk["audio_base_64"] != base64.StdEncoding.EncodeToString([]byte("pcm-bytes")) ||
		gotChunk["commit"] != true || gotChunk["sample_rate"].(float64) != 16000 {
		t.Fatalf("chunk = %#v", gotChunk)
	}
	if string(resp.Content) != "hello realtime" || resp.ProviderRef != "scribe_session_1" {
		t.Fatalf("resp = %#v", resp)
	}
	if resp.Timing.Language != "en" || len(resp.Timing.Words) != 1 || resp.Timing.Words[0].Text != "hello" {
		t.Fatalf("timing = %#v", resp.Timing)
	}
}

func TestElevenLabsGenerateMusicSendsPromptModelAndDuration(t *testing.T) {
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
				"Song-Id":      []string{"song_123"},
			},
			Body:    io.NopCloser(strings.NewReader("music-bytes")),
			Request: r,
		}, nil
	})}

	resp, err := adapter.GenerateAudio(context.Background(), media.AudioGenerationRequest{
		Kind:        media.AudioGenerationKindMusic,
		Prompt:      "cinematic ambient score",
		Model:       "music_v2",
		DurationSec: 30,
		Params: map[string]any{
			"output_format":      "mp3_48000_192",
			"force_instrumental": true,
			"seed":               42,
		},
	})
	if err != nil {
		t.Fatalf("GenerateAudio() error = %v", err)
	}
	if gotPath != "/v1/music/stream" {
		t.Fatalf("path = %s, want /v1/music/stream", gotPath)
	}
	if gotOutputFormat != "mp3_48000_192" {
		t.Fatalf("output_format = %q", gotOutputFormat)
	}
	if gotAPIKey != "eleven-key" || gotAccept != "audio/mpeg" {
		t.Fatalf("headers api_key=%q accept=%q", gotAPIKey, gotAccept)
	}
	if gotBody["prompt"] != "cinematic ambient score" || gotBody["model_id"] != "music_v2" ||
		gotBody["music_length_ms"] != float64(30000) || gotBody["force_instrumental"] != true ||
		gotBody["seed"] != float64(42) {
		t.Fatalf("body = %#v", gotBody)
	}
	if string(resp.Audio) != "music-bytes" || resp.MimeType != "audio/mpeg" ||
		resp.ProviderRef != "song_123" || resp.DurationMs != 30000 {
		t.Fatalf("resp = %#v", resp)
	}
}

func TestElevenLabsGenerateSoundEffectSendsTextOptionsAndModel(t *testing.T) {
	var gotPath string
	var gotOutputFormat string
	var gotBody map[string]any

	adapter := NewElevenLabsAdapter("eleven-key", "https://eleven.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		gotPath = r.URL.Path
		gotOutputFormat = r.URL.Query().Get("output_format")
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header: http.Header{
				"Content-Type": []string{"audio/mpeg"},
				"Request-Id":   []string{"sfx_req_1"},
			},
			Body:    io.NopCloser(strings.NewReader("sfx-bytes")),
			Request: r,
		}, nil
	})}

	resp, err := adapter.GenerateAudio(context.Background(), media.AudioGenerationRequest{
		Kind:        media.AudioGenerationKindSoundEffect,
		Prompt:      "heavy door creak",
		Model:       "eleven_text_to_sound_v2",
		DurationSec: 5,
		Params: map[string]any{
			"output_format":    "mp3_44100_128",
			"loop":             true,
			"prompt_influence": 0.7,
		},
	})
	if err != nil {
		t.Fatalf("GenerateAudio() error = %v", err)
	}
	if gotPath != "/v1/sound-generation" {
		t.Fatalf("path = %s, want /v1/sound-generation", gotPath)
	}
	if gotOutputFormat != "mp3_44100_128" {
		t.Fatalf("output_format = %q", gotOutputFormat)
	}
	if gotBody["text"] != "heavy door creak" || gotBody["model_id"] != "eleven_text_to_sound_v2" ||
		gotBody["duration_seconds"] != float64(5) || gotBody["loop"] != true ||
		gotBody["prompt_influence"] != 0.7 {
		t.Fatalf("body = %#v", gotBody)
	}
	if string(resp.Audio) != "sfx-bytes" || resp.MimeType != "audio/mpeg" ||
		resp.ProviderRef != "sfx_req_1" || resp.DurationMs != 5000 {
		t.Fatalf("resp = %#v", resp)
	}
}

func TestElevenLabsCloneVoiceSendsSamplesAndMetadata(t *testing.T) {
	var gotPath string
	var gotFields map[string]string
	var gotFileCount int

	adapter := NewElevenLabsAdapter("eleven-key", "https://eleven.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		gotPath = r.URL.Path
		if r.Header.Get("xi-api-key") != "eleven-key" {
			t.Fatalf("xi-api-key = %q", r.Header.Get("xi-api-key"))
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
		gotFileCount = len(r.MultipartForm.File["files"])
		return jsonResponse(r, http.StatusOK, map[string]any{
			"voice_id": "voice_clone_1",
			"name":     "Narrator",
		}), nil
	})}

	resp, err := adapter.CloneVoice(context.Background(), media.VoiceCloneRequest{
		Name:        "Narrator",
		Description: "Warm documentary voice",
		Samples: []media.VoiceCloneSample{
			{Audio: []byte("wav"), MimeType: "audio/wav"},
		},
		Params: map[string]any{
			"labels":                  `{"role":"narrator"}`,
			"remove_background_noise": true,
		},
	})
	if err != nil {
		t.Fatalf("CloneVoice() error = %v", err)
	}
	if gotPath != "/v1/voices/add" {
		t.Fatalf("path = %s, want /v1/voices/add", gotPath)
	}
	if gotFields["name"] != "Narrator" || gotFields["description"] != "Warm documentary voice" ||
		gotFields["labels"] != `{"role":"narrator"}` || gotFields["remove_background_noise"] != "true" ||
		gotFileCount != 1 {
		t.Fatalf("fields=%#v files=%d", gotFields, gotFileCount)
	}
	if resp.VoiceID != "voice_clone_1" || resp.Name != "Narrator" {
		t.Fatalf("resp = %#v", resp)
	}
}

func TestElevenLabsDesignVoiceCreatesPreviewAndSavesVoice(t *testing.T) {
	var paths []string
	var designBody map[string]any
	var saveBody map[string]any

	adapter := NewElevenLabsAdapter("eleven-key", "https://eleven.test/v1")
	adapter.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		paths = append(paths, r.URL.Path)
		body, _ := io.ReadAll(r.Body)
		switch r.URL.Path {
		case "/v1/text-to-voice/design":
			if err := json.Unmarshal(body, &designBody); err != nil {
				t.Fatalf("design body JSON error = %v", err)
			}
			return jsonResponse(r, http.StatusOK, map[string]any{
				"previews": []map[string]any{
					{"generated_voice_id": "generated_voice_1", "audio_url": "https://cdn.test/preview.mp3"},
				},
			}), nil
		case "/v1/text-to-voice":
			if err := json.Unmarshal(body, &saveBody); err != nil {
				t.Fatalf("save body JSON error = %v", err)
			}
			return jsonResponse(r, http.StatusOK, map[string]any{
				"voice_id": "voice_design_1",
				"name":     "Gentle Guide",
			}), nil
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
			return nil, nil
		}
	})}

	resp, err := adapter.DesignVoice(context.Background(), media.VoiceDesignRequest{
		Name:        "Gentle Guide",
		Description: "A calm, warm guide voice",
		PreviewText: "Welcome to the story.",
		Model:       "eleven_multilingual_ttv_v2",
		Params: map[string]any{
			"seed":           7,
			"guidance_scale": 0.8,
			"loudness":       0.3,
			"should_enhance": true,
		},
	})
	if err != nil {
		t.Fatalf("DesignVoice() error = %v", err)
	}
	if len(paths) != 2 || paths[0] != "/v1/text-to-voice/design" || paths[1] != "/v1/text-to-voice" {
		t.Fatalf("paths = %#v", paths)
	}
	if designBody["voice_description"] != "A calm, warm guide voice" || designBody["model_id"] != "eleven_multilingual_ttv_v2" ||
		designBody["text"] != "Welcome to the story." || designBody["seed"] != float64(7) ||
		designBody["guidance_scale"] != 0.8 || designBody["loudness"] != 0.3 ||
		designBody["should_enhance"] != true {
		t.Fatalf("design body = %#v", designBody)
	}
	if saveBody["voice_name"] != "Gentle Guide" || saveBody["voice_description"] != "A calm, warm guide voice" ||
		saveBody["generated_voice_id"] != "generated_voice_1" {
		t.Fatalf("save body = %#v", saveBody)
	}
	if resp.VoiceID != "voice_design_1" || resp.GeneratedVoiceID != "generated_voice_1" || resp.PreviewURL != "https://cdn.test/preview.mp3" {
		t.Fatalf("resp = %#v", resp)
	}
}

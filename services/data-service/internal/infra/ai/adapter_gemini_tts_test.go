package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
)

func TestGeminiSynthesizeUsesInteractionsAPIAndWrapsPCMAsWAV(t *testing.T) {
	var gotBody map[string]any
	adapter := NewGeminiAdapter("gem-key", "https://gemini.test")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.URL.String() != "https://gemini.test/v1beta/interactions" {
			t.Fatalf("url = %s", r.URL.String())
		}
		if got := r.Header.Get("x-goog-api-key"); got != "gem-key" {
			t.Fatalf("x-goog-api-key = %q", got)
		}
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"id": "interaction-1",
			"output_audio": map[string]any{
				"data": base64.StdEncoding.EncodeToString([]byte{1, 2, 3, 4}),
			},
		}), nil
	})}

	resp, err := adapter.Synthesize(context.Background(), media.TTSRequest{
		Text:  "Say cheerfully: hello",
		Model: "gemini-3.1-flash-tts-preview",
		Voice: "Kore",
		Params: map[string]any{
			"sample_rate": "24000",
			"channels":    "1",
		},
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if resp.MimeType != "audio/wav" || resp.ProviderRef != "interaction-1" {
		t.Fatalf("resp = %+v", resp)
	}
	if !bytes.HasPrefix(resp.Audio, []byte("RIFF")) || !bytes.Contains(resp.Audio[:16], []byte("WAVE")) {
		t.Fatalf("audio is not WAV: %q", resp.Audio[:16])
	}
	if !bytes.HasSuffix(resp.Audio, []byte{1, 2, 3, 4}) {
		t.Fatalf("wav payload suffix = %v", resp.Audio[len(resp.Audio)-4:])
	}
	if gotBody["model"] != "gemini-3.1-flash-tts-preview" || gotBody["input"] != "Say cheerfully: hello" {
		t.Fatalf("body = %#v", gotBody)
	}
	if gotBody["response_format"].(map[string]any)["type"] != "audio" {
		t.Fatalf("response_format = %#v", gotBody["response_format"])
	}
	cfg := gotBody["generation_config"].(map[string]any)
	speech := cfg["speech_config"].([]any)
	if len(speech) != 1 || speech[0].(map[string]any)["voice"] != "Kore" {
		t.Fatalf("speech_config = %#v", speech)
	}
}

func TestGeminiSynthesizeAcceptsSpeakerConfigJSON(t *testing.T) {
	var gotBody map[string]any
	adapter := NewGeminiAdapter("gem-key", "https://gemini.test")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"id": "interaction-2",
			"output_audio": map[string]any{
				"data": base64.StdEncoding.EncodeToString([]byte{5, 6}),
			},
		}), nil
	})}

	_, err := adapter.Synthesize(context.Background(), media.TTSRequest{
		Text:  "Joe: hi\nJane: hello",
		Model: "gemini-3.1-flash-tts-preview",
		Params: map[string]any{
			"speakers": `[{"speaker":"Joe","voice":"Kore"},{"speaker":"Jane","voice":"Puck"}]`,
		},
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	cfg := gotBody["generation_config"].(map[string]any)
	speech := cfg["speech_config"].([]any)
	if len(speech) != 2 ||
		speech[0].(map[string]any)["speaker"] != "Joe" || speech[0].(map[string]any)["voice"] != "Kore" ||
		speech[1].(map[string]any)["speaker"] != "Jane" || speech[1].(map[string]any)["voice"] != "Puck" {
		t.Fatalf("speech_config = %#v", speech)
	}
}

func TestGeminiGenerateAudioUsesLyriaInteractionsAPI(t *testing.T) {
	var gotBody map[string]any
	adapter := NewGeminiAdapter("gem-key", "https://gemini.test")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.URL.String() != "https://gemini.test/v1beta/interactions" {
			t.Fatalf("url = %s", r.URL.String())
		}
		if got := r.Header.Get("x-goog-api-key"); got != "gem-key" {
			t.Fatalf("x-goog-api-key = %q", got)
		}
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"id": "lyria-interaction-1",
			"outputs": []map[string]any{
				{
					"inline_data": map[string]any{
						"data":      base64.StdEncoding.EncodeToString([]byte("mp3-audio")),
						"mime_type": "audio/mpeg",
					},
				},
			},
		}), nil
	})}

	resp, err := adapter.GenerateAudio(context.Background(), media.AudioGenerationRequest{
		Kind:   media.AudioGenerationKindMusic,
		Prompt: "A short instrumental acoustic guitar piece.",
		Model:  "lyria-3-clip-preview",
	})
	if err != nil {
		t.Fatalf("GenerateAudio() error = %v", err)
	}
	if string(resp.Audio) != "mp3-audio" || resp.MimeType != "audio/mpeg" || resp.DurationMs != 30000 || resp.ProviderRef != "lyria-interaction-1" {
		t.Fatalf("resp = %+v", resp)
	}
	if gotBody["model"] != "lyria-3-clip-preview" || gotBody["input"] != "A short instrumental acoustic guitar piece." {
		t.Fatalf("body = %#v", gotBody)
	}
	if gotBody["response_format"].(map[string]any)["type"] != "audio" {
		t.Fatalf("response_format = %#v", gotBody["response_format"])
	}
}

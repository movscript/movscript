package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
)

func TestXiaomiMimoGenerateSpeechToSpeechUsesOfficialDataURIShape(t *testing.T) {
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer mimo-key" {
			t.Fatalf("Authorization = %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id":"chatcmpl-test",
			"choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"收到这段录音了。","audio":null}}],
			"usage":{"prompt_tokens":10,"completion_tokens":6,"total_tokens":16}
		}`))
	}))
	defer server.Close()

	adapter := NewXiaomiMimoAdapter("mimo-key", server.URL+"/v1")
	resp, err := adapter.GenerateSpeechToSpeech(context.Background(), media.SpeechToSpeechRequest{
		Model:    "mimo-v2.5",
		Prompt:   "总结音频",
		Audio:    []byte("wavdata"),
		MimeType: "audio/wav",
		Language: "zh",
		Params: map[string]any{
			"max_completion_tokens": 128,
		},
	})
	if err != nil {
		t.Fatalf("GenerateSpeechToSpeech error: %v", err)
	}
	if resp.Text != "收到这段录音了。" {
		t.Fatalf("text = %q", resp.Text)
	}
	if gotBody["model"] != "mimo-v2.5" {
		t.Fatalf("model = %#v", gotBody["model"])
	}
	messages := gotBody["messages"].([]any)
	content := messages[0].(map[string]any)["content"].([]any)
	textPart := content[0].(map[string]any)
	if textPart["type"] != "text" || textPart["text"] != "总结音频" {
		t.Fatalf("text part = %#v", textPart)
	}
	audioPart := content[1].(map[string]any)
	inputAudio := audioPart["input_audio"].(map[string]any)
	data, _ := inputAudio["data"].(string)
	if audioPart["type"] != "input_audio" || !strings.HasPrefix(data, "data:audio/wav;base64,") {
		t.Fatalf("audio part = %#v", audioPart)
	}
	asrOptions := gotBody["asr_options"].(map[string]any)
	if asrOptions["language"] != "zh" {
		t.Fatalf("asr_options = %#v", asrOptions)
	}
	if gotBody["max_completion_tokens"].(float64) != 128 {
		t.Fatalf("max_completion_tokens = %#v", gotBody["max_completion_tokens"])
	}
}

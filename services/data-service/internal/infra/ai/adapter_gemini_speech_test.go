package ai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
)

func TestGeminiAdapterTranscribeUsesGoogleSpeechV2Recognize(t *testing.T) {
	var gotBody map[string]any
	adapter := NewGeminiAdapter("google-key", "https://speech.test")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v2/projects/proj-1/locations/us/recognizers/_:recognize" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		if got := r.Header.Get("x-goog-api-key"); got != "google-key" {
			t.Fatalf("x-goog-api-key = %q", got)
		}
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Fatalf("request body JSON error = %v", err)
		}
		return jsonResponse(r, http.StatusOK, map[string]any{
			"results": []map[string]any{{
				"resultEndOffset": "1.500s",
				"alternatives": []map[string]any{{
					"transcript": "hello world",
					"confidence": 0.91,
					"words": []map[string]any{{
						"word":        "hello",
						"startOffset": "0s",
						"endOffset":   "0.500s",
					}, {
						"word":        "world",
						"startOffset": "0.500s",
						"endOffset":   "1.500s",
					}},
				}},
			}},
		}), nil
	})}

	resp, err := adapter.Transcribe(context.Background(), media.TranscribeRequest{
		Model:    "chirp_3",
		Language: "en-US",
		Audio:    []byte("wav-bytes"),
		Params: map[string]any{
			"project_id":                   "proj-1",
			"location":                     "us",
			"recognizer":                   "_",
			"enable_automatic_punctuation": true,
		},
	})
	if err != nil {
		t.Fatalf("Transcribe() error = %v", err)
	}
	config := gotBody["config"].(map[string]any)
	if config["model"] != "chirp_3" {
		t.Fatalf("model = %#v", config["model"])
	}
	languages := config["languageCodes"].([]any)
	if len(languages) != 1 || languages[0] != "en-US" {
		t.Fatalf("languageCodes = %#v", languages)
	}
	if gotBody["content"] != base64.StdEncoding.EncodeToString([]byte("wav-bytes")) {
		t.Fatalf("content = %#v", gotBody["content"])
	}
	if string(resp.Content) != "hello world" {
		t.Fatalf("content = %q", string(resp.Content))
	}
	if resp.Timing.Provider != "google_speech" || resp.Timing.DurationMs != 1500 ||
		len(resp.Timing.Segments) != 1 || resp.Timing.Segments[0].EndMs != 1500 ||
		len(resp.Timing.Words) != 2 || resp.Timing.Words[1].StartMs != 500 {
		t.Fatalf("timing = %#v", resp.Timing)
	}
}

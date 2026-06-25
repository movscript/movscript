package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

func TestOpenAIImageEditCustomFieldSendsInputResourceBytes(t *testing.T) {
	var gotImageFiles int
	var gotPrompt string
	var gotModel string

	adapter := NewOpenAIAdapter("https://example.test/v1", "test-key")
	adapter.rawHTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/v1/images/edits" {
			t.Fatalf("path = %s, want /v1/images/edits", r.URL.Path)
		}
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("ParseMultipartForm() error = %v", err)
		}
		gotImageFiles = len(r.MultipartForm.File["image[]"])
		gotPrompt = r.FormValue("prompt")
		gotModel = r.FormValue("model")

		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]any{
			"data": []map[string]string{{
				"b64_json": "aGVsbG8=",
			}},
			"output_format": "png",
		})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(&body),
			Request:    r,
		}, nil
	})}

	resp, err := adapter.ImageGenerate(context.Background(), ImageRequest{
		Model:          "grok-imagine-image-edit",
		Prompt:         "edit this",
		ImageFieldName: "image[]",
		CloudFileID:    "file-should-not-win",
		InputImageDataList: []MediaData{{
			Bytes:    []byte("fake image bytes"),
			MimeType: "image/png",
		}},
	})
	if err != nil {
		t.Fatalf("ImageGenerate() error = %v", err)
	}
	if gotImageFiles != 1 {
		t.Fatalf("multipart image[] files = %d, want 1", gotImageFiles)
	}
	if gotPrompt != "edit this" {
		t.Fatalf("prompt = %q, want edit this", gotPrompt)
	}
	if gotModel != "grok-imagine-image-edit" {
		t.Fatalf("model = %q, want grok-imagine-image-edit", gotModel)
	}
	if len(resp.URLs) != 1 || resp.URLs[0] != "data:image/png;base64,aGVsbG8=" {
		t.Fatalf("URLs = %#v, want data image result", resp.URLs)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

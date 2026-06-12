package ai

import (
	"context"
	"io"
	"net/http"
	"reflect"
	"strings"
	"testing"
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

type volcenRoundTripFunc func(*http.Request) (*http.Response, error)

func (f volcenRoundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

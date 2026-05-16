package debug

import (
	"context"
	"strings"
	"testing"
)

func TestDoRawHTTPBlocksUnsafeURLs(t *testing.T) {
	tests := []string{
		"http://127.0.0.1:8765/health",
		"http://localhost:8765/health",
		"ftp://example.com/file",
	}
	for _, rawURL := range tests {
		t.Run(rawURL, func(t *testing.T) {
			result := doRawHTTP(context.Background(), "GET", rawURL, nil, "")
			if result.Error == "" {
				t.Fatal("expected unsafe URL to be blocked")
			}
			if strings.Contains(result.Error, "unsupported protocol scheme") {
				t.Fatalf("URL was blocked too late by HTTP client: %v", result.Error)
			}
		})
	}
}

func TestProviderCallBlocksUnsafeBaseURL(t *testing.T) {
	svc := NewService(nil)

	result := svc.ProviderCall(context.Background(), ProviderCallInput{
		AdapterType: "openai_compat",
		BaseURL:     "http://127.0.0.1:8765/v1",
		APIKey:      "sk-test",
		Capability:  "text",
		Model:       "debug-model",
		DryRun:      true,
	})

	if result.Error == "" {
		t.Fatal("expected unsafe provider base_url to be blocked")
	}
	if !strings.Contains(result.Error, "provider base_url") {
		t.Fatalf("expected provider base_url validation error, got %q", result.Error)
	}
	if strings.Contains(result.Error, "unsupported protocol scheme") {
		t.Fatalf("URL was blocked too late by HTTP client: %v", result.Error)
	}
}

func TestProviderCallBlocksUnsafeEndpointURL(t *testing.T) {
	svc := NewService(nil)

	result := svc.ProviderCall(context.Background(), ProviderCallInput{
		AdapterType: "openai_compat",
		BaseURL:     "https://93.184.216.34/v1",
		APIKey:      "sk-test",
		EndpointURL: "http://localhost:8765/v1/images/generations",
		Model:       "debug-model",
		DryRun:      true,
	})

	if result.Error == "" {
		t.Fatal("expected unsafe provider endpoint_url to be blocked")
	}
	if !strings.Contains(result.Error, "provider endpoint_url") {
		t.Fatalf("expected provider endpoint_url validation error, got %q", result.Error)
	}
}

package newapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEnsureRelayTokenCreatesGroupSpecificToken(t *testing.T) {
	var created map[string]any
	tokenCreated := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/user/login":
			_, _ = w.Write([]byte(`{"success":true,"data":{}}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/token/search":
			keyword := r.URL.Query().Get("keyword")
			if keyword == "movscript-forward-42-premium-video" {
				if tokenCreated {
					_, _ = w.Write([]byte(`{"success":true,"data":{"items":[{"id":7,"name":"movscript-forward-42-premium-video"}]}}`))
					return
				}
				_, _ = w.Write([]byte(`{"success":true,"data":{"items":[]}}`))
				return
			}
			t.Fatalf("unexpected token search keyword %q", keyword)
		case r.Method == http.MethodPost && r.URL.Path == "/api/token/":
			if err := json.NewDecoder(r.Body).Decode(&created); err != nil {
				t.Fatalf("decode create payload: %v", err)
			}
			tokenCreated = true
			_, _ = w.Write([]byte(`{"success":true,"data":{}}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api/token/7/key":
			_, _ = w.Write([]byte(`{"success":true,"data":{"key":"relay-key"}}`))
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.String())
		}
	}))
	defer server.Close()

	client := NewClient(Config{
		BaseURL:        server.URL,
		UserPassword:   "password",
		TokenQuota:     100,
		TokenGroup:     "auto",
		HTTPTimeoutSec: 3,
	}, server.Client())

	id, key, err := client.EnsureRelayToken(context.Background(), User{ID: 9, Username: "movscript-42"}, 42, "premium/video")
	if err != nil {
		t.Fatalf("EnsureRelayToken() error = %v", err)
	}
	if id != 7 || key != "relay-key" {
		t.Fatalf("token result id=%d key=%q, want created token key", id, key)
	}
	if created["name"] != "movscript-forward-42-premium-video" {
		t.Fatalf("token name = %#v, want group-specific name", created["name"])
	}
	if created["group"] != "premium/video" {
		t.Fatalf("token group = %#v, want requested new-api group", created["group"])
	}
}

func TestRelayTokenNameKeepsLegacyDefaultGroupName(t *testing.T) {
	if got := relayTokenName(42, "auto"); got != "movscript-forward-42" {
		t.Fatalf("default token name = %q, want legacy name", got)
	}
	if got := relayTokenName(42, "Premium Video"); !strings.HasSuffix(got, "premium-video") {
		t.Fatalf("sanitized token name = %q, want group suffix", got)
	}
}

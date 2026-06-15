package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestOpenAIProxyForwardsUnknownFieldsAndRewritesModel(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var upstreamPath string
	var upstreamQuery string
	var upstreamAuth string
	var upstreamBeta string
	var upstreamBody map[string]any
	previousClient := openAIProxyHTTPClient
	openAIProxyHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		upstreamPath = r.URL.Path
		upstreamQuery = r.URL.RawQuery
		upstreamAuth = r.Header.Get("Authorization")
		upstreamBeta = r.Header.Get("OpenAI-Beta")
		if err := json.NewDecoder(r.Body).Decode(&upstreamBody); err != nil {
			t.Fatalf("decode upstream body: %v", err)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"id":"chatcmpl_proxy","object":"chat.completion"}`)),
		}, nil
	})}
	t.Cleanup(func() { openAIProxyHTTPClient = previousClient })

	db := testutil.OpenSQLite(t, "handler-model-gateway-proxy.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	credential := persistencemodel.AICredential{
		AdapterType: ai.AdapterOpenAICompat,
		DisplayName: "OpenAI compatible",
		BaseURL:     "https://upstream.example/v1",
		IsEnabled:   true,
	}
	if err := db.Create(&credential).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	model := persistencemodel.AIModelConfig{
		CredentialID:       credential.ID,
		ModelDefID:         "logical-chat",
		ModelIDOverride:    "provider-chat",
		CustomCapabilities: ai.CapabilityText,
		IsEnabled:          true,
	}
	if err := db.Create(&model).Error; err != nil {
		t.Fatalf("create model: %v", err)
	}

	db = db.Session(&gorm.Session{SkipHooks: true})
	registry := ai.NewRegistry(db, nil)
	handler := NewModelGatewayHandler(db, ai.NewAIService(db, registry))
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserKey, domainauth.UserProfile{ID: 1, Username: "agent", Status: domainauth.UserStatusActive})
		c.Next()
	})
	router.POST("/v1/openai-proxy/*path", handler.OpenAIProxy)

	req := httptest.NewRequest(http.MethodPost, "/v1/openai-proxy/chat/completions?debug=1", strings.NewReader(`{
		"model":"logical-chat",
		"messages":[{"role":"user","content":"hi"}],
		"reasoning_effort":"low",
		"top_p":0.2,
		"project_id":9
	}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer local-gateway-key")
	req.Header.Set("OpenAI-Beta", "assistants=v2")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("proxy status = %d, body=%s", res.Code, res.Body.String())
	}
	if upstreamPath != "/v1/chat/completions" || upstreamQuery != "debug=1" {
		t.Fatalf("upstream target = %s?%s", upstreamPath, upstreamQuery)
	}
	if upstreamAuth != "Bearer " {
		t.Fatalf("upstream authorization = %q, want provider bearer header", upstreamAuth)
	}
	if upstreamBeta != "assistants=v2" {
		t.Fatalf("OpenAI-Beta header was not forwarded: %q", upstreamBeta)
	}
	if upstreamBody["model"] != "provider-chat" {
		t.Fatalf("model was not rewritten: %#v", upstreamBody["model"])
	}
	if upstreamBody["reasoning_effort"] != "low" || upstreamBody["top_p"] != 0.2 {
		t.Fatalf("unknown fields were not preserved: %#v", upstreamBody)
	}
	if _, ok := upstreamBody["project_id"]; ok {
		t.Fatalf("project_id leaked upstream: %#v", upstreamBody)
	}
}

func TestOpenAIProxyUsesCurrentUserNewAPIRelayTarget(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("MOVSCRIPT_NEW_API_BASE_URL", "https://new-api.example")
	t.Setenv("MOVSCRIPT_NEW_API_RELAY_TOKEN", "user-relay-token")

	var upstreamURL string
	var upstreamAuth string
	var upstreamBody map[string]any
	previousClient := openAIProxyHTTPClient
	openAIProxyHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		upstreamURL = r.URL.String()
		upstreamAuth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&upstreamBody); err != nil {
			t.Fatalf("decode upstream body: %v", err)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"id":"chatcmpl_newapi","object":"chat.completion"}`)),
		}, nil
	})}
	t.Cleanup(func() { openAIProxyHTTPClient = previousClient })

	db := testutil.OpenSQLite(t, "handler-model-gateway-proxy-newapi.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
	)
	credential := persistencemodel.AICredential{
		AdapterType:  ai.AdapterOpenAICompat,
		DisplayName:  "new-api routes",
		EncryptedKey: "should-not-be-used",
		BaseURL:      "https://legacy-provider.example/v1",
		IsEnabled:    true,
	}
	if err := db.Create(&credential).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	model := persistencemodel.AIModelConfig{
		CredentialID:       credential.ID,
		ModelDefID:         "logical-chat",
		ModelIDOverride:    "provider-chat",
		CustomCapabilities: ai.CapabilityText,
		IsEnabled:          true,
	}
	if err := db.Create(&model).Error; err != nil {
		t.Fatalf("create model: %v", err)
	}

	db = db.Session(&gorm.Session{SkipHooks: true})
	registry := ai.NewRegistryWithProviderMode(db, nil, "new-api")
	handler := NewModelGatewayHandler(db, ai.NewAIService(db, registry))
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserKey, domainauth.UserProfile{ID: 42, Username: "agent", Status: domainauth.UserStatusActive})
		c.Next()
	})
	router.POST("/v1/openai-proxy/*path", handler.OpenAIProxy)

	req := httptest.NewRequest(http.MethodPost, "/v1/openai-proxy/chat/completions", strings.NewReader(`{
		"model":"logical-chat",
		"messages":[{"role":"user","content":"hi"}]
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("proxy status = %d, body=%s", res.Code, res.Body.String())
	}
	if upstreamURL != "https://new-api.example/v1/chat/completions" {
		t.Fatalf("upstream url = %q, want new-api relay endpoint", upstreamURL)
	}
	if upstreamAuth != "Bearer sk-user-relay-token" {
		t.Fatalf("upstream authorization = %q, want current user relay token", upstreamAuth)
	}
	if upstreamBody["model"] != "provider-chat" {
		t.Fatalf("model was not rewritten for new-api relay: %#v", upstreamBody["model"])
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

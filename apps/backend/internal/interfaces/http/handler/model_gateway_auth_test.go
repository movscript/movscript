package handler

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestGatewayAPIKeyFromHeadersAcceptsBearerAndXAPIKey(t *testing.T) {
	gin.SetMode(gin.TestMode)

	bearerContext, _ := gin.CreateTestContext(httptest.NewRecorder())
	bearerContext.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
	bearerContext.Request.Header.Set("Authorization", "Bearer mgw_bearer")
	if got := gatewayAPIKeyFromHeaders(bearerContext); got != "mgw_bearer" {
		t.Fatalf("bearer token = %q, want mgw_bearer", got)
	}

	xAPIKeyContext, _ := gin.CreateTestContext(httptest.NewRecorder())
	xAPIKeyContext.Request = httptest.NewRequest("POST", "/v1/messages", nil)
	xAPIKeyContext.Request.Header.Set("X-API-Key", "mgw_anthropic")
	if got := gatewayAPIKeyFromHeaders(xAPIKeyContext); got != "mgw_anthropic" {
		t.Fatalf("x-api-key token = %q, want mgw_anthropic", got)
	}
}

package handler

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	tokenauth "github.com/movscript/movscript/internal/infra/auth"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
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

func TestGatewayPrincipalAcceptsSignedTokenFromXAPIKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-model-gateway-auth-signed-x-api-key.db",
		&persistencemodel.User{},
		&persistencemodel.GatewayAPIKey{},
	)
	user := persistencemodel.User{Username: "agent", Status: domainauth.UserStatusActive, SystemRole: domainauth.SystemRoleUser}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	tokens, err := tokenauth.NewManager("0123456789abcdef0123456789abcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	raw, _, err := tokens.Issue(tokenauth.Subject{
		UserID:     user.ID,
		Username:   user.Username,
		SystemRole: user.SystemRole,
	})
	if err != nil {
		t.Fatal(err)
	}

	handler := NewModelGatewayHandler(db, nil, tokens)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/messages", nil)
	c.Request.Header.Set("X-API-Key", raw)

	principal, ok := handler.gatewayPrincipal(c)
	if !ok || principal == nil {
		t.Fatal("expected signed X-API-Key token to resolve a gateway principal")
	}
	if principal.UserID != user.ID {
		t.Fatalf("principal user id = %d, want %d", principal.UserID, user.ID)
	}
	if principal.Key != nil {
		t.Fatalf("principal key = %#v, want nil for signed backend token", principal.Key)
	}
}

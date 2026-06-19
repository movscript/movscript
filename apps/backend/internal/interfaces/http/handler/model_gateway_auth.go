package handler

import (
	"strings"

	"github.com/gin-gonic/gin"
	authapp "github.com/movscript/movscript/internal/app/auth"
	"github.com/movscript/movscript/internal/infra/auth"
)

func (h *ModelGatewayHandler) gatewayPrincipal(c *gin.Context) (*gatewayPrincipal, bool) {
	if user := currentUser(c); user != nil {
		return &gatewayPrincipal{UserID: user.ID}, true
	}

	token := gatewayAPIKeyFromHeaders(c)
	if token == "" {
		return nil, false
	}

	principal, ok, err := h.service.PrincipalForAPIKey(c.Request.Context(), token)
	if err == nil && ok {
		return &gatewayPrincipal{UserID: principal.UserID, Key: principal.Key}, true
	}

	if userID, ok := h.gatewayPrincipalUserIDForSignedToken(c, token); ok {
		return &gatewayPrincipal{UserID: userID}, true
	}

	return nil, false
}

func (h *ModelGatewayHandler) gatewayPrincipalUserIDForSignedToken(c *gin.Context, token string) (uint, bool) {
	if h.tokens == nil || !auth.LooksSigned(token) {
		return 0, false
	}
	claims, err := h.tokens.Verify(token)
	if err != nil {
		return 0, false
	}
	if _, err := authapp.NewService(h.db).CurrentUser(c.Request.Context(), claims.UserID); err != nil {
		return 0, false
	}
	return claims.UserID, true
}

func gatewayAPIKeyFromHeaders(c *gin.Context) string {
	bearer := strings.TrimSpace(c.GetHeader("Authorization"))
	if strings.HasPrefix(strings.ToLower(bearer), "bearer ") {
		if token := strings.TrimSpace(bearer[len("Bearer "):]); token != "" {
			return token
		}
	}
	return strings.TrimSpace(c.GetHeader("X-API-Key"))
}

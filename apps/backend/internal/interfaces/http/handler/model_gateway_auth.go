package handler

import (
	"strings"

	"github.com/gin-gonic/gin"
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
	if err != nil || !ok {
		return nil, false
	}
	return &gatewayPrincipal{UserID: principal.UserID, Key: principal.Key}, true
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

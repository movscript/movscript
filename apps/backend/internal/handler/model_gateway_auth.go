package handler

import (
	"context"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
)

func (h *ModelGatewayHandler) gatewayPrincipal(c *gin.Context) (*gatewayPrincipal, bool) {
	if user := currentUser(c); user != nil {
		return &gatewayPrincipal{User: user}, true
	}

	bearer := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(strings.ToLower(bearer), "bearer ") {
		return nil, false
	}
	token := strings.TrimSpace(bearer[len("Bearer "):])

	principal, ok, err := h.service.PrincipalForAPIKey(c.Request.Context(), token)
	if err != nil || !ok {
		return nil, false
	}
	return &gatewayPrincipal{User: principal.User, Key: principal.Key}, true
}

func (h *ModelGatewayHandler) enforceGatewayKeyLimits(ctx context.Context, key *model.GatewayAPIKey, estimatedCost float64) error {
	return h.service.EnforceKeyLimits(ctx, key, estimatedCost)
}

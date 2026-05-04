package handler

import (
	"context"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	modelgatewayapp "github.com/movscript/movscript/internal/app/modelgateway"
	"github.com/movscript/movscript/internal/model"
)

var errGatewayMonthlyBudgetExceeded = modelgatewayapp.ErrMonthlyBudgetExceeded

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

func gatewayKeyAllowsScope(key *model.GatewayAPIKey, scope string) bool {
	scopes := parseStringArray(key.AllowedScopes)
	if len(scopes) == 0 {
		return scope == "model:chat"
	}
	for _, s := range scopes {
		if s == scope || s == "*" {
			return true
		}
	}
	return false
}

func gatewayKeyAllowsModel(key *model.GatewayAPIKey, modelConfigID uint) bool {
	ids := parseUintArray(key.AllowedModelIDs)
	if len(ids) == 0 {
		return true
	}
	for _, id := range ids {
		if id == modelConfigID {
			return true
		}
	}
	return false
}

func gatewayKeyAllowsProject(key *model.GatewayAPIKey, requestedProjectID *uint) bool {
	if key.ProjectID == nil {
		return true
	}
	if requestedProjectID == nil {
		return false
	}
	return *key.ProjectID == *requestedProjectID
}

func gatewayBillingContext(key *model.GatewayAPIKey, projectID *uint) ai.BillingContext {
	ctx := ai.BillingContext{ProjectID: projectID}
	if key != nil {
		ctx.GatewayAPIKeyID = &key.ID
	}
	return ctx
}

func (h *ModelGatewayHandler) enforceGatewayKeyLimits(ctx context.Context, key *model.GatewayAPIKey, estimatedCost float64) error {
	return h.service.EnforceKeyLimits(ctx, key, estimatedCost)
}

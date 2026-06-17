package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/ai"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

// GenerateRuntimeText is a stateless canvas runtime primitive. The frontend owns
// graph execution and run records; the backend only resolves credentials/models
// and performs the protected provider call.
func (h *CanvasHandler) GenerateRuntimeText(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	if h.aiService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ai service is not configured"})
		return
	}

	var req struct {
		ModelID   string         `json:"model_id"`
		Prompt    string         `json:"prompt"`
		Params    map[string]any `json:"params"`
		ProjectID *uint          `json:"project_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "prompt is required"})
		return
	}

	route, err := h.resolveCanvasRuntimeTextRoute(c, req.ModelID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	textReq := ai.TextRequest{
		PromptName:  "canvas_runtime_text",
		Messages:    []ai.Message{{Role: "user", Content: req.Prompt}},
		MaxTokens:   intParam(req.Params, "max_tokens", 0),
		Temperature: floatParam(req.Params, "temperature", -1),
		JSONMode:    boolParam(req.Params, "json_mode", false),
	}
	resp, err := h.aiService.CallTextWithRouteUsage(c.Request.Context(), user.ID, ai.ModelRoute{
		ModelID:         route.ModelID,
		ModelConfigID:   route.ModelConfigID,
		CatalogEntryID:  route.CatalogEntryID,
		CredentialID:    route.CredentialID,
		SourceType:      route.SourceType,
		RouteGroup:      route.RouteGroup,
		ProviderModelID: route.ProviderModelID,
		SelectionReason: route.SelectionReason,
		EstimatedCost:   route.EstimatedCost,
	}, textReq, ai.UsageContext{
		OrgID:     currentOrgID(c),
		ProjectID: req.ProjectID,
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"type":     "text",
		"text":     resp.Content,
		"model_id": route.ModelID,
		"usage":    resp.Usage,
	})
}

func (h *CanvasHandler) resolveCanvasRuntimeTextRoute(c *gin.Context, modelID string) (providercontract.AIGatewayModelRoute, error) {
	if h.aiRouting == nil {
		return providercontract.AIGatewayModelRoute{}, errors.New("ai routing policy is not configured")
	}
	ctx := c.Request.Context()
	if strings.TrimSpace(modelID) != "" {
		return h.aiRouting.ResolveGatewayTextModelRoute(ctx, modelID)
	}
	return providercontract.AIGatewayModelRoute{}, errors.New("model_id is required")
}

func intParam(params map[string]any, key string, fallback int) int {
	value, ok := params[key]
	if !ok {
		return fallback
	}
	switch typed := value.(type) {
	case float64:
		return int(typed)
	case int:
		return typed
	default:
		return fallback
	}
}

func floatParam(params map[string]any, key string, fallback float32) float32 {
	value, ok := params[key]
	if !ok {
		return fallback
	}
	switch typed := value.(type) {
	case float64:
		return float32(typed)
	case float32:
		return typed
	default:
		return fallback
	}
}

func boolParam(params map[string]any, key string, fallback bool) bool {
	value, ok := params[key]
	if !ok {
		return fallback
	}
	typed, ok := value.(bool)
	if !ok {
		return fallback
	}
	return typed
}

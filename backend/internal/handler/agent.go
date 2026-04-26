package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
)

type AgentHandler struct {
	svc *ai.AIService
}

func NewAgentHandler(svc *ai.AIService) *AgentHandler {
	return &AgentHandler{svc: svc}
}

func (h *AgentHandler) Chat(c *gin.Context) {
	var req struct {
		Messages []ai.Message `json:"messages" binding:"required"`
		ModelID  *uint        `json:"model_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var modelDBID uint
	var err error
	if req.ModelID != nil && *req.ModelID > 0 {
		modelDBID = *req.ModelID
	} else {
		modelDBID, _, err = h.svc.GetForFeature("agent_chat")
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "no AI provider available: " + err.Error()})
			return
		}
	}

	var userID uint
	if u := currentUser(c); u != nil {
		userID = u.ID
	}

	resp, err := h.svc.CallText(c.Request.Context(), userID, modelDBID, ai.TextRequest{
		Messages:  req.Messages,
		MaxTokens: 2000,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"content": resp.Content,
		"usage": gin.H{
			"input_tokens":  resp.Usage.InputTokens,
			"output_tokens": resp.Usage.OutputTokens,
		},
	})
}

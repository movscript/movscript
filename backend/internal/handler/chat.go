package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"gorm.io/gorm"
)

// ChatHandler handles the brainstorm / free-form AI chat endpoint.
type ChatHandler struct {
	db  *gorm.DB
	svc *ai.AIService
}

func NewChatHandler(db *gorm.DB, svc *ai.AIService) *ChatHandler {
	return &ChatHandler{db: db, svc: svc}
}

// Chat sends a multi-turn conversation to a text model and returns the assistant reply.
// POST /api/v1/ai/chat
// Body: { model_config_id: number, messages: [{role, content}] }
func (h *ChatHandler) Chat(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var req struct {
		ModelConfigID uint `json:"model_config_id" binding:"required"`
		Messages      []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages" binding:"required,min=1"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	msgs := make([]ai.Message, len(req.Messages))
	for i, m := range req.Messages {
		msgs[i] = ai.Message{Role: m.Role, Content: m.Content}
	}

	resp, err := h.svc.CallText(c.Request.Context(), user.ID, req.ModelConfigID, ai.TextRequest{
		Messages:    msgs,
		Temperature: -1,
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

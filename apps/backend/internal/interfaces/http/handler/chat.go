package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	chatapp "github.com/movscript/movscript/internal/app/chat"
	"github.com/movscript/movscript/internal/infra/ai"
)

// ChatHandler handles the brainstorm / free-form AI chat endpoint.
type ChatHandler struct {
	service *chatapp.Service
}

func NewChatHandler(svc *ai.AIService) *ChatHandler {
	return &ChatHandler{service: chatapp.NewService(svc)}
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

	msgs := make([]chatapp.Message, len(req.Messages))
	for i, m := range req.Messages {
		msgs[i] = chatapp.Message{Role: m.Role, Content: m.Content}
	}

	resp, err := h.service.Chat(c.Request.Context(), chatapp.Input{
		UserID:        user.ID,
		OrgID:         currentOrgID(c),
		ModelConfigID: req.ModelConfigID,
		Messages:      msgs,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"content": resp.Content,
		"usage":   resp.Usage,
	})
}

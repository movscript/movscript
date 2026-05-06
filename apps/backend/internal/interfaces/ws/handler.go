package ws

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type Handler struct {
	upgrader websocket.Upgrader
}

func NewHandler() *Handler {
	return &Handler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

func (h *Handler) Connect(c *gin.Context) {
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	conn.SetPingHandler(func(appData string) error {
		deadline := time.Now().Add(5 * time.Second)
		return conn.WriteControl(websocket.PongMessage, []byte(appData), deadline)
	})

	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if isPingTextMessage(messageType, payload) {
			if err := conn.WriteMessage(websocket.TextMessage, []byte("pong")); err != nil {
				return
			}
		}
	}
}

func isPingTextMessage(messageType int, payload []byte) bool {
	return messageType == websocket.TextMessage && strings.EqualFold(strings.TrimSpace(string(payload)), "ping")
}

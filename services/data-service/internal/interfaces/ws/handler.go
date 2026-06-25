package ws

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/movscript/movscript/internal/app/systemstream"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
)

type Handler struct {
	upgrader websocket.Upgrader
	hub      *systemstream.Hub
}

func NewHandler(hub ...*systemstream.Hub) *Handler {
	systemHub := systemstream.NewHub()
	if len(hub) > 0 && hub[0] != nil {
		systemHub = hub[0]
	}
	return &Handler{
		hub: systemHub,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

func (h *Handler) SystemMessages(c *gin.Context) {
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	user, _ := middleware.CurrentUserFromContext(c)
	member, _ := middleware.CurrentOrgMemberFromContext(c)
	sub, unsubscribe := h.hub.Subscribe(128)
	defer unsubscribe()

	if err := conn.SetReadDeadline(time.Now().Add(60 * time.Second)); err != nil {
		return
	}
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			messageType, payload, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if isPingTextMessage(messageType, payload) {
				_ = conn.WriteControl(websocket.PongMessage, []byte("pong"), time.Now().Add(5*time.Second))
			}
		}
	}()

	connected := systemstream.NewEvent(systemstream.TopicSystem, systemstream.TypeSystemConnected, systemstream.Scope{Kind: systemstream.ScopeUser, ID: strconv.FormatUint(uint64(user.ID), 10)}, nil, gin.H{
		"event": "connected",
	})
	if err := conn.WriteJSON(connected); err != nil {
		return
	}

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-c.Request.Context().Done():
			return
		case <-ticker.C:
			if err := conn.WriteControl(websocket.PingMessage, []byte("ping"), time.Now().Add(5*time.Second)); err != nil {
				return
			}
		case message, ok := <-sub.Messages():
			if !ok {
				return
			}
			if !canReceiveSystemMessage(message, user.ID, member.OrgID) {
				continue
			}
			if err := conn.WriteJSON(message); err != nil {
				return
			}
		}
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

func canReceiveSystemMessage(message systemstream.Message, userID uint, orgID uint) bool {
	switch strings.ToLower(strings.TrimSpace(message.Scope.Kind)) {
	case "", systemstream.ScopeGlobal, systemstream.ScopeSystem:
		return true
	case systemstream.ScopeUser:
		return message.Scope.ID == strconv.FormatUint(uint64(userID), 10)
	case systemstream.ScopeOrg:
		return orgID != 0 && message.Scope.ID == strconv.FormatUint(uint64(orgID), 10)
	default:
		return false
	}
}

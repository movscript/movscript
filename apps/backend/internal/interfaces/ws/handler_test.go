package ws

import (
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/movscript/movscript/internal/app/systemstream"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"github.com/movscript/movscript/internal/testutil"
)

func TestIsPingTextMessage(t *testing.T) {
	if !isPingTextMessage(websocket.TextMessage, []byte(" ping ")) {
		t.Fatal("expected text ping to match")
	}
	if isPingTextMessage(websocket.TextMessage, []byte("hello")) {
		t.Fatal("expected non-ping text to not match")
	}
	if isPingTextMessage(websocket.BinaryMessage, []byte("ping")) {
		t.Fatal("expected binary ping payload to not match")
	}
}

func TestSystemMessagesPublishesScopedEvents(t *testing.T) {
	gin.SetMode(gin.TestMode)
	hub := systemstream.NewHub()
	handler := NewHandler(hub)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserKey, domainauth.UserProfile{ID: 42, Status: domainauth.UserStatusActive})
		c.Set(middleware.ContextOrgMemberKey, domainorg.OrganizationMember{OrgID: 7, UserID: 42})
		c.Next()
	})
	router.GET("/ws", handler.SystemMessages)

	server := testutil.NewHTTPTestServer(t, router)
	defer server.Close()

	conn, _, err := websocket.DefaultDialer.Dial("ws"+server.URL[len("http"):]+"/ws", nil)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	var connected systemstream.Message
	if err := conn.ReadJSON(&connected); err != nil {
		t.Fatalf("read connected message: %v", err)
	}
	if connected.Topic != systemstream.TopicSystem {
		t.Fatalf("expected connected system topic, got %q", connected.Topic)
	}
	if connected.Type != systemstream.TypeSystemConnected {
		t.Fatalf("expected connected type %q, got %q", systemstream.TypeSystemConnected, connected.Type)
	}

	published := hub.Publish(systemstream.Message{
		Topic:  systemstream.TopicGenerationJob,
		Type:   systemstream.TypeJobStatusChanged,
		Scope:  systemstream.Scope{Kind: systemstream.ScopeUser, ID: "42"},
		Entity: systemstream.EntityRef("job", 99),
		Payload: gin.H{
			"jobId":  "99",
			"status": "running",
		},
	})

	var received systemstream.Message
	if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	if err := conn.ReadJSON(&received); err != nil {
		t.Fatalf("read published message: %v", err)
	}
	if received.ID != published.ID {
		t.Fatalf("expected message %q, got %q", published.ID, received.ID)
	}
	if received.Topic != systemstream.TopicGenerationJob {
		t.Fatalf("expected generation job topic, got %q", received.Topic)
	}
	if received.Type != systemstream.TypeJobStatusChanged {
		t.Fatalf("expected generation job type, got %q", received.Type)
	}
}

func TestCanReceiveSystemMessage(t *testing.T) {
	if !canReceiveSystemMessage(systemstream.Message{Scope: systemstream.Scope{Kind: systemstream.ScopeGlobal}}, 1, 2) {
		t.Fatal("expected global scope to be receivable")
	}
	if !canReceiveSystemMessage(systemstream.Message{Scope: systemstream.Scope{Kind: systemstream.ScopeUser, ID: strconv.Itoa(1)}}, 1, 2) {
		t.Fatal("expected matching user scope to be receivable")
	}
	if canReceiveSystemMessage(systemstream.Message{Scope: systemstream.Scope{Kind: systemstream.ScopeUser, ID: strconv.Itoa(3)}}, 1, 2) {
		t.Fatal("expected non-matching user scope to be filtered")
	}
	if !canReceiveSystemMessage(systemstream.Message{Scope: systemstream.Scope{Kind: systemstream.ScopeOrg, ID: strconv.Itoa(2)}}, 1, 2) {
		t.Fatal("expected matching org scope to be receivable")
	}
	if canReceiveSystemMessage(systemstream.Message{Scope: systemstream.Scope{Kind: "project", ID: "8"}}, 1, 2) {
		t.Fatal("expected unknown scope to be filtered")
	}
}

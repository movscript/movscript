package ws

import (
	"testing"

	"github.com/gorilla/websocket"
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

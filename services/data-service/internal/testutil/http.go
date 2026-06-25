package testutil

import (
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

func NewHTTPTestServer(t testing.TB, handler http.Handler) *httptest.Server {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skipf("skip HTTP server test; listen is unavailable in this environment: %v", err)
	}
	server := httptest.NewUnstartedServer(handler)
	server.Listener = listener
	server.Start()
	return server
}

package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/config"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestAgentRuntimeCreateSessionProxiesRemoteRuntimeAndAudits(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-agent-runtime-proxy.db", &persistencemodel.AuditLog{})
	var upstreamAuth string
	var upstreamPath string
	var upstreamBody string
	h := NewAgentRuntimeHandler(db, &config.Config{
		AgentRuntimeProvider: "remote-runtime",
		AgentRuntimeBaseURL:  "http://runtime.local",
		AgentRuntimeToken:    "runtime-token",
	})
	h.httpClient = &http.Client{Transport: agentRuntimeRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		upstreamAuth = r.Header.Get("Authorization")
		upstreamPath = r.URL.Path
		body, _ := io.ReadAll(r.Body)
		upstreamBody = string(body)
		return &http.Response{
			StatusCode: http.StatusCreated,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"session_id":"session-1"}`)),
			Request:    r,
		}, nil
	})}
	router := gin.New()
	router.POST("/agent-runtime/sessions", h.CreateSession)

	req := httptest.NewRequest(http.MethodPost, "/agent-runtime/sessions", strings.NewReader(`{"workspace_ref":"project:1","agent_id":"writer","model_ref":"gpt"}`))
	req.Header.Set("Authorization", "Bearer user-token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", res.Code, res.Body.String())
	}
	if upstreamPath != "/v1/agent/sessions" {
		t.Fatalf("upstream path = %q", upstreamPath)
	}
	if upstreamAuth != "Bearer runtime-token" {
		t.Fatalf("upstream auth = %q, want runtime token only", upstreamAuth)
	}
	if !strings.Contains(upstreamBody, `"workspace_ref":"project:1"`) {
		t.Fatalf("upstream body = %q", upstreamBody)
	}
	var auditRow persistencemodel.AuditLog
	if err := db.Where("action = ?", "agent_runtime.session.create").First(&auditRow).Error; err != nil {
		t.Fatalf("load audit: %v", err)
	}
	if !strings.Contains(auditRow.Metadata, `"runtime_status":201`) || !strings.Contains(auditRow.Metadata, `"workspace_ref":"project:1"`) {
		t.Fatalf("audit metadata = %s", auditRow.Metadata)
	}
}

func TestAgentRuntimePermissionDecisionRejectsMismatchedRequestID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-agent-runtime-permission-mismatch.db", &persistencemodel.AuditLog{})
	h := NewAgentRuntimeHandler(db, &config.Config{
		AgentRuntimeProvider: "remote-runtime",
		AgentRuntimeBaseURL:  "http://runtime.local",
	})
	router := gin.New()
	router.POST("/agent-runtime/permissions/:requestId/decision", h.PermissionDecision)

	req := httptest.NewRequest(http.MethodPost, "/agent-runtime/permissions/request-1/decision", strings.NewReader(`{"request_id":"request-2","decision":"allow"}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400: %s", res.Code, res.Body.String())
	}
	var count int64
	if err := db.Model(&persistencemodel.AuditLog{}).Count(&count).Error; err != nil {
		t.Fatalf("count audit: %v", err)
	}
	if count != 0 {
		t.Fatalf("audit count = %d, want 0", count)
	}
}

func TestAgentRuntimeCapabilitiesProxyCopiesRuntimeResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenSQLite(t, "handler-agent-runtime-capabilities.db")
	h := NewAgentRuntimeHandler(db, &config.Config{
		AgentRuntimeProvider: "remote-runtime",
		AgentRuntimeBaseURL:  "http://runtime.local",
	})
	h.httpClient = &http.Client{Transport: agentRuntimeRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/capabilities" {
			t.Fatalf("upstream path = %q", r.URL.Path)
		}
		body, _ := json.Marshal(map[string]any{"protocol_version": "movscript.agent-runtime.v1", "capabilities": []string{"agent_session.proxy"}})
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(string(body))),
			Request:    r,
		}, nil
	})}
	router := gin.New()
	router.GET("/agent-runtime/capabilities", h.Capabilities)

	res := httptest.NewRecorder()
	router.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/agent-runtime/capabilities", nil))

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `"agent_session.proxy"`) {
		t.Fatalf("body = %s", res.Body.String())
	}
}

type agentRuntimeRoundTripFunc func(*http.Request) (*http.Response, error)

func (f agentRuntimeRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/config"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

type AgentRuntimeHandler struct {
	db         *gorm.DB
	provider   string
	baseURL    string
	token      string
	httpClient *http.Client
}

func NewAgentRuntimeHandler(db *gorm.DB, cfg *config.Config) *AgentRuntimeHandler {
	if cfg == nil {
		cfg = &config.Config{}
	}
	provider := strings.TrimSpace(cfg.AgentRuntimeProvider)
	if provider == "" {
		provider = providercontract.AdapterDesktopManagedAgent
	}
	return &AgentRuntimeHandler{
		db:         db,
		provider:   provider,
		baseURL:    strings.TrimSpace(cfg.AgentRuntimeBaseURL),
		token:      strings.TrimSpace(cfg.AgentRuntimeToken),
		httpClient: &http.Client{Timeout: 0},
	}
}

func (h *AgentRuntimeHandler) Capabilities(c *gin.Context) {
	if !h.remoteRuntimeConfigured(c) {
		return
	}
	h.proxyRuntime(c, http.MethodGet, providercontract.AgentRuntimeEndpointCapabilities, nil, audit.Event{})
}

func (h *AgentRuntimeHandler) CreateSession(c *gin.Context) {
	if !h.remoteRuntimeConfigured(c) {
		return
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput("invalid runtime session request"))
		return
	}
	var req providercontract.AgentSessionRequest
	_ = json.Unmarshal(body, &req)
	h.proxyRuntime(c, http.MethodPost, providercontract.AgentRuntimeEndpointCreateSession, body, audit.Event{
		Action:     "agent_runtime.session.create",
		TargetType: "agent_runtime_session",
		Metadata: map[string]any{
			"protocol_version": providercontract.AgentRuntimeWireProtocolVersion,
			"workspace_ref":    req.WorkspaceRef,
			"agent_id":         req.AgentID,
			"model_ref":        req.ModelRef,
		},
	})
}

func (h *AgentRuntimeHandler) SessionEvents(c *gin.Context) {
	if !h.remoteRuntimeConfigured(c) {
		return
	}
	h.proxyRuntime(c, http.MethodGet, runtimeSessionEndpoint(providercontract.AgentRuntimeEndpointSessionEvents, c.Param("sessionId")), nil, audit.Event{})
}

func (h *AgentRuntimeHandler) SendMessage(c *gin.Context) {
	if !h.remoteRuntimeConfigured(c) {
		return
	}
	sessionID := strings.TrimSpace(c.Param("sessionId"))
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput("invalid runtime message request"))
		return
	}
	var message providercontract.AgentMessage
	_ = json.Unmarshal(body, &message)
	h.proxyRuntime(c, http.MethodPost, runtimeSessionEndpoint(providercontract.AgentRuntimeEndpointSessionMessages, sessionID), body, audit.Event{
		Action:     "agent_runtime.session.message",
		TargetType: "agent_runtime_session",
		TargetID:   sessionID,
		Metadata: map[string]any{
			"protocol_version": providercontract.AgentRuntimeWireProtocolVersion,
			"role":             message.Role,
			"has_payload":      len(message.Payload) > 0,
		},
	})
}

func (h *AgentRuntimeHandler) ListTools(c *gin.Context) {
	if !h.remoteRuntimeConfigured(c) {
		return
	}
	h.proxyRuntime(c, http.MethodGet, runtimeSessionEndpoint(providercontract.AgentRuntimeEndpointSessionTools, c.Param("sessionId")), nil, audit.Event{})
}

func (h *AgentRuntimeHandler) StopSession(c *gin.Context) {
	if !h.remoteRuntimeConfigured(c) {
		return
	}
	sessionID := strings.TrimSpace(c.Param("sessionId"))
	h.proxyRuntime(c, http.MethodDelete, runtimeSessionEndpoint(providercontract.AgentRuntimeEndpointStopSession, sessionID), nil, audit.Event{
		Action:     "agent_runtime.session.stop",
		TargetType: "agent_runtime_session",
		TargetID:   sessionID,
		Metadata: map[string]any{
			"protocol_version": providercontract.AgentRuntimeWireProtocolVersion,
		},
	})
}

func (h *AgentRuntimeHandler) PermissionDecision(c *gin.Context) {
	if !h.remoteRuntimeConfigured(c) {
		return
	}
	requestID := strings.TrimSpace(c.Param("requestId"))
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput("invalid runtime permission decision"))
		return
	}
	var decision providercontract.AgentPermissionDecision
	_ = json.Unmarshal(body, &decision)
	if strings.TrimSpace(decision.RequestID) != "" && strings.TrimSpace(decision.RequestID) != requestID {
		c.JSON(http.StatusBadRequest, api.InvalidInput("permission decision request_id does not match path"))
		return
	}
	h.proxyRuntime(c, http.MethodPost, runtimePermissionEndpoint(providercontract.AgentRuntimeEndpointPermissionDecisions, requestID), body, audit.Event{
		Action:     "agent_runtime.permission.decision",
		TargetType: "agent_runtime_permission",
		TargetID:   requestID,
		Metadata: map[string]any{
			"protocol_version": providercontract.AgentRuntimeWireProtocolVersion,
			"decision":         decision.Decision,
		},
	})
}

func (h *AgentRuntimeHandler) remoteRuntimeConfigured(c *gin.Context) bool {
	if h == nil || strings.TrimSpace(h.provider) != providercontract.AdapterRemoteAgentRuntime {
		c.JSON(http.StatusConflict, api.Conflict("agent runtime is not configured as remote-runtime"))
		return false
	}
	if strings.TrimSpace(h.baseURL) == "" {
		c.JSON(http.StatusServiceUnavailable, api.Internal("remote agent runtime base URL is not configured"))
		return false
	}
	return true
}

func (h *AgentRuntimeHandler) proxyRuntime(c *gin.Context, method string, endpoint string, body []byte, event audit.Event) {
	targetURL, err := h.runtimeURL(endpoint, c.Request.URL.RawQuery)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("remote agent runtime endpoint is invalid"))
		return
	}
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), method, targetURL, reader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("remote agent runtime request is invalid"))
		return
	}
	copyAgentRuntimeRequestHeaders(req.Header, c.Request.Header)
	if h.token != "" {
		req.Header.Set("Authorization", "Bearer "+h.token)
	} else {
		req.Header.Del("Authorization")
	}
	resp, err := h.runtimeHTTPClient().Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, api.Internal("remote agent runtime request failed"))
		return
	}
	defer resp.Body.Close()

	if event.Action != "" {
		event.Metadata = mergeAuditMetadata(event.Metadata, map[string]any{
			"runtime_status": resp.StatusCode,
			"runtime_path":   endpoint,
		})
		audit.Record(c, h.db, event)
	}

	copyAgentRuntimeResponseHeaders(c.Writer.Header(), resp.Header)
	c.Status(resp.StatusCode)
	_, _ = io.Copy(c.Writer, resp.Body)
}

func (h *AgentRuntimeHandler) runtimeURL(endpoint string, rawQuery string) (string, error) {
	base, err := url.Parse(strings.TrimRight(strings.TrimSpace(h.baseURL), "/"))
	if err != nil {
		return "", err
	}
	if base.Scheme == "" || base.Host == "" {
		return "", errors.New("invalid remote runtime base url")
	}
	path := strings.TrimSpace(endpoint)
	if !strings.HasPrefix(path, "/") || strings.Contains(path, "..") || strings.Contains(path, "\\") {
		return "", errors.New("invalid remote runtime endpoint")
	}
	base.Path = strings.TrimRight(base.Path, "/") + path
	base.RawQuery = rawQuery
	return base.String(), nil
}

func (h *AgentRuntimeHandler) runtimeHTTPClient() *http.Client {
	if h != nil && h.httpClient != nil {
		return h.httpClient
	}
	return http.DefaultClient
}

func runtimeSessionEndpoint(template string, sessionID string) string {
	return strings.ReplaceAll(template, "{session_id}", url.PathEscape(strings.TrimSpace(sessionID)))
}

func runtimePermissionEndpoint(template string, requestID string) string {
	return strings.ReplaceAll(template, "{request_id}", url.PathEscape(strings.TrimSpace(requestID)))
}

func copyAgentRuntimeRequestHeaders(dst http.Header, src http.Header) {
	for _, key := range []string{"Accept", "Accept-Encoding", "Content-Type", "Last-Event-ID", "User-Agent"} {
		for _, value := range src.Values(key) {
			dst.Add(key, value)
		}
	}
}

func copyAgentRuntimeResponseHeaders(dst http.Header, src http.Header) {
	for _, key := range []string{"Cache-Control", "Content-Type", "Expires", "Pragma", "Retry-After"} {
		for _, value := range src.Values(key) {
			dst.Add(key, value)
		}
	}
}

func mergeAuditMetadata(base map[string]any, extra map[string]any) map[string]any {
	if len(base) == 0 {
		base = map[string]any{}
	}
	for key, value := range extra {
		base[key] = value
	}
	return base
}

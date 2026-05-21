package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	modelgatewayapp "github.com/movscript/movscript/internal/app/gateway"
)

const maxOpenAIProxyBodyBytes = 64 << 20

var openAIProxyHTTPClient = http.DefaultClient

// OpenAIProxy forwards OpenAI-compatible requests to the resolved upstream
// provider while preserving the model gateway's auth and model policy boundary.
func (h *ModelGatewayHandler) OpenAIProxy(c *gin.Context) {
	principal, ok := h.gatewayPrincipal(c)
	if !ok {
		writeOpenAIError(c, http.StatusUnauthorized, "authentication required", "authentication_error", "", "authentication_required")
		return
	}

	proxyPath := c.Param("path")
	if !validOpenAIProxyPath(proxyPath) {
		writeOpenAIError(c, http.StatusBadRequest, "proxy path is required", "invalid_request_error", "path", "invalid_proxy_path")
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, maxOpenAIProxyBodyBytes))
	if err != nil {
		writeOpenAIError(c, http.StatusBadRequest, "request body is too large or unreadable", "invalid_request_error", "", "invalid_request_body")
		return
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(body, &payload); err != nil || payload == nil {
		writeOpenAIError(c, http.StatusBadRequest, "request body must be a JSON object", "invalid_request_error", "", "invalid_request_body")
		return
	}

	model := rawString(payload["model"])
	if strings.TrimSpace(model) == "" {
		writeOpenAIError(c, http.StatusBadRequest, "model is required", "invalid_request_error", "model", "missing_model")
		return
	}
	projectID, err := rawUintPtr(payload["project_id"])
	if err != nil {
		writeOpenAIError(c, http.StatusBadRequest, "project_id must be an unsigned integer", "invalid_request_error", "project_id", "invalid_project_id")
		return
	}

	route, err := h.service.PrepareOpenAIProxy(c.Request.Context(), modelgatewayapp.OpenAIProxyInput{
		Principal: modelgatewayapp.Principal{UserID: principal.UserID, Key: principal.Key},
		Model:     model,
		ProjectID: projectID,
	})
	if err != nil {
		writeGatewayChatError(c, err, "")
		return
	}

	payload["model"] = mustRawJSON(route.Target.ProviderModelID)
	delete(payload, "project_id")
	upstreamBody, err := json.Marshal(payload)
	if err != nil {
		writeOpenAIError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", "", "invalid_request_body")
		return
	}

	upstreamURL := strings.TrimRight(route.Target.BaseURL, "/") + proxyPath
	if c.Request.URL.RawQuery != "" {
		upstreamURL += "?" + c.Request.URL.RawQuery
	}
	upstreamReq, err := http.NewRequestWithContext(c.Request.Context(), c.Request.Method, upstreamURL, bytes.NewReader(upstreamBody))
	if err != nil {
		writeOpenAIError(c, http.StatusBadRequest, err.Error(), "invalid_request_error", "path", "invalid_proxy_path")
		return
	}
	copyOpenAIProxyRequestHeaders(upstreamReq.Header, c.Request.Header)
	upstreamReq.Header.Set("Authorization", "Bearer "+route.Target.APIKey)
	if upstreamReq.Header.Get("Content-Type") == "" {
		upstreamReq.Header.Set("Content-Type", "application/json")
	}

	resp, err := openAIProxyHTTPClient.Do(upstreamReq)
	if err != nil {
		writeOpenAIError(c, http.StatusBadGateway, err.Error(), "server_error", "", "provider_error")
		return
	}
	defer resp.Body.Close()

	copyOpenAIProxyResponseHeaders(c.Writer.Header(), resp.Header)
	c.Status(resp.StatusCode)
	copyOpenAIProxyResponseBody(c.Writer, resp.Body)
}

func validOpenAIProxyPath(path string) bool {
	path = strings.TrimSpace(path)
	return strings.HasPrefix(path, "/") && path != "/" && !strings.Contains(path, "://")
}

func rawUintPtr(raw json.RawMessage) (*uint, error) {
	if !rawJSONPresent(raw) {
		return nil, nil
	}
	var n uint64
	if err := json.Unmarshal(raw, &n); err == nil {
		out := uint(n)
		return &out, nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		parsed, parseErr := strconv.ParseUint(strings.TrimSpace(s), 10, 64)
		if parseErr != nil {
			return nil, parseErr
		}
		out := uint(parsed)
		return &out, nil
	}
	return nil, fmt.Errorf("invalid uint")
}

func copyOpenAIProxyRequestHeaders(dst, src http.Header) {
	for key, values := range src {
		if skipOpenAIProxyRequestHeader(key) {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func copyOpenAIProxyResponseHeaders(dst, src http.Header) {
	for key, values := range src {
		if skipOpenAIProxyHopByHopHeader(key) {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func skipOpenAIProxyRequestHeader(key string) bool {
	switch strings.ToLower(key) {
	case "authorization", "x-api-key", "proxy-authorization", "host", "cookie", "content-length":
		return true
	default:
		return skipOpenAIProxyHopByHopHeader(key)
	}
}

func skipOpenAIProxyHopByHopHeader(key string) bool {
	switch strings.ToLower(key) {
	case "connection", "keep-alive", "proxy-authenticate", "te", "trailer", "transfer-encoding", "upgrade":
		return true
	default:
		return false
	}
}

func copyOpenAIProxyResponseBody(w gin.ResponseWriter, body io.Reader) {
	buf := make([]byte, 32*1024)
	for {
		n, readErr := body.Read(buf)
		if n > 0 {
			_, _ = w.Write(buf[:n])
			w.Flush()
		}
		if readErr != nil {
			return
		}
	}
}

package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/crypto"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type DebugHandler struct {
	db            *gorm.DB
	encryptionKey []byte
	registry      *ai.Registry
}

func NewDebugHandler(db *gorm.DB, encryptionKey []byte, registry *ai.Registry) *DebugHandler {
	return &DebugHandler{db: db, encryptionKey: encryptionKey, registry: registry}
}

// RawCall sends an arbitrary HTTP request from the backend and returns full details.
// Optionally uses a stored credential to fill in auth headers.
// POST /admin/debug/raw-call
func (h *DebugHandler) RawCall(c *gin.Context) {
	var req struct {
		CredentialID *uint             `json:"credential_id"` // optional: fill auth from stored cred
		URL          string            `json:"url" binding:"required"`
		Method       string            `json:"method" binding:"required"` // GET|POST|PUT|DELETE
		Headers      map[string]string `json:"headers"`
		Body         string            `json:"body"` // raw string (JSON or otherwise)
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	headers := make(map[string]string)
	for k, v := range req.Headers {
		headers[k] = v
	}

	// If a credential is specified, inject auth headers.
	if req.CredentialID != nil {
		var cred model.AICredential
		if err := h.db.First(&cred, *req.CredentialID).Error; err == nil {
			apiKey := ""
			if cred.EncryptedKey != "" {
				if plain, err := crypto.Decrypt(cred.EncryptedKey, h.encryptionKey); err == nil {
					apiKey = plain
				}
			}
			if apiKey != "" {
				switch cred.AdapterType {
				case ai.AdapterAnthropic:
					headers["x-api-key"] = apiKey
					headers["anthropic-version"] = "2023-06-01"
				default:
					headers["Authorization"] = "Bearer " + apiKey
				}
			}
		}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()

	result := doRawHTTP(ctx, req.Method, req.URL, headers, req.Body)
	c.JSON(http.StatusOK, result)
}

// RawCallResult is the response shape for a raw HTTP call.
type RawCallResult struct {
	URL            string            `json:"url"`
	Method         string            `json:"method"`
	RequestHeaders map[string]string `json:"request_headers"`
	RequestBody    string            `json:"request_body"`
	ResponseStatus int               `json:"response_status"`
	ResponseBody   string            `json:"response_body"`
	LatencyMs      int64             `json:"latency_ms"`
	Error          string            `json:"error,omitempty"`
}

func doRawHTTP(ctx context.Context, method, url string, headers map[string]string, body string) RawCallResult {
	var bodyReader io.Reader
	if body != "" {
		bodyReader = bytes.NewBufferString(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return RawCallResult{URL: url, Method: method, Error: err.Error()}
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if body != "" && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	// Capture request headers (mask auth).
	reqHeaders := make(map[string]string)
	for k := range req.Header {
		v := req.Header.Get(k)
		if k == "Authorization" || k == "X-Api-Key" {
			v = maskHeader(v)
		}
		reqHeaders[k] = v
	}

	start := time.Now()
	resp, err := http.DefaultClient.Do(req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return RawCallResult{URL: url, Method: method, RequestHeaders: reqHeaders,
			RequestBody: body, LatencyMs: latency, Error: err.Error()}
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	errMsg := ""
	if resp.StatusCode >= 400 {
		errMsg = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return RawCallResult{
		URL: url, Method: method,
		RequestHeaders: reqHeaders, RequestBody: body,
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody),
		LatencyMs: latency, Error: errMsg,
	}
}

func maskHeader(v string) string {
	if len(v) > 12 {
		return v[:7] + "..." + v[len(v)-4:]
	}
	return "***"
}

// ListJobs returns Jobs with full debug info for the job monitor.
// GET /admin/debug/jobs?status=&limit=&offset=
func (h *DebugHandler) ListJobs(c *gin.Context) {
	status := c.Query("status") // optional filter
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	q := h.db.Model(&model.Job{}).
		Preload("OutputResource")
	if status != "" {
		q = q.Where("status = ?", status)
	}

	var total int64
	q.Count(&total)

	var jobs []model.Job
	q.Order("id DESC").Limit(limit).Offset(offset).Find(&jobs)

	type jobDetail struct {
		model.Job
		DebugDetail *ai.DebugCallResult `json:"debug_detail,omitempty"`
	}

	out := make([]jobDetail, 0, len(jobs))
	for _, j := range jobs {
		d := jobDetail{Job: j}
		if j.DebugInfo != "" {
			var dr ai.DebugCallResult
			if err := json.Unmarshal([]byte(j.DebugInfo), &dr); err == nil {
				d.DebugDetail = &dr
			}
		}
		out = append(out, d)
	}
	c.Header("X-Total-Count", strconv.FormatInt(total, 10))
	c.JSON(http.StatusOK, out)
}

// ProviderCall builds a temporary provider from caller-supplied credentials and
// calls the given capability. The backend never stores these credentials.
// POST /admin/debug/provider-call
func (h *DebugHandler) ProviderCall(c *gin.Context) {
	var req struct {
		AdapterType string         `json:"adapter_type" binding:"required"`
		BaseURL     string         `json:"base_url"`
		APIKey      string         `json:"api_key"`      // plain-text; never persisted
		EndpointURL string         `json:"endpoint_url"` // full URL; capability inferred from path
		Capability  string         `json:"capability"`   // text|image|video; ignored when endpoint_url is set
		Model       string         `json:"model"`
		Prompt      string         `json:"prompt"`
		Params      map[string]any `json:"params"`  // capability-specific extra params
		DryRun      bool           `json:"dry_run"` // if true, build request but do not send
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	result := ai.ProviderDebugCall(ctx, ai.ProviderDebugCallRequest{
		AdapterType: req.AdapterType,
		BaseURL:     req.BaseURL,
		APIKey:      req.APIKey,
		EndpointURL: req.EndpointURL,
		Capability:  req.Capability,
		Model:       req.Model,
		Prompt:      req.Prompt,
		Params:      req.Params,
		DryRun:      req.DryRun,
	})
	c.JSON(http.StatusOK, result)
}

// GetJob returns a single Job with full debug info.
// GET /admin/debug/jobs/:id
func (h *DebugHandler) GetJob(c *gin.Context) {
	id := c.Param("id")
	var job model.Job
	if err := h.db.Preload("OutputResource").First(&job, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
		return
	}

	type jobDetail struct {
		model.Job
		DebugDetail *ai.DebugCallResult `json:"debug_detail,omitempty"`
	}
	d := jobDetail{Job: job}
	if job.DebugInfo != "" {
		var dr ai.DebugCallResult
		if err := json.Unmarshal([]byte(job.DebugInfo), &dr); err == nil {
			d.DebugDetail = &dr
		}
	}
	c.JSON(http.StatusOK, d)
}

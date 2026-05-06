package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	debugapp "github.com/movscript/movscript/internal/app/debug"
	"gorm.io/gorm"
)

type DebugHandler struct {
	service *debugapp.Service
}

func NewDebugHandler(db *gorm.DB, encryptionKey []byte) *DebugHandler {
	return &DebugHandler{service: debugapp.NewService(db, encryptionKey)}
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

	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()

	result := h.service.RawCall(ctx, debugapp.RawCallInput{
		CredentialID: req.CredentialID,
		URL:          req.URL,
		Method:       req.Method,
		Headers:      req.Headers,
		Body:         req.Body,
	})
	c.JSON(http.StatusOK, result)
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

	items, total, err := h.service.ListJobDetails(c.Request.Context(), status, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("X-Total-Count", strconv.FormatInt(total, 10))
	c.JSON(http.StatusOK, items)
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

	result := h.service.ProviderCall(ctx, debugapp.ProviderCallInput{
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
	detail, err := h.service.GetJobDetail(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
		return
	}

	c.JSON(http.StatusOK, detail)
}

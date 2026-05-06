package handler

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	aiadminapp "github.com/movscript/movscript/internal/app/aiadmin"
	"github.com/movscript/movscript/internal/infra/ai"
)

func (h *AIHandler) ListCredentials(c *gin.Context) {
	creds, err := h.service.ListCredentials(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, creds)
}

func (h *AIHandler) CreateCredential(c *gin.Context) {
	var req struct {
		AdapterType     string            `json:"adapter_type" binding:"required"`
		DisplayName     string            `json:"display_name" binding:"required"`
		Credentials     map[string]string `json:"credentials"`
		FilesAPIEnabled bool              `json:"files_api_enabled"`
		FilesAPIBaseURL string            `json:"files_api_base_url"`
		FilesAPIKey     string            `json:"files_api_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	def := ai.GetAdapterDef(req.AdapterType)
	if def == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown adapter type: " + req.AdapterType})
		return
	}
	for _, field := range def.CredFields {
		if field.Required && req.Credentials[field.Key] == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing required credential: " + field.Key})
			return
		}
	}

	cred, err := h.service.CreateCredential(c.Request.Context(), aiadminapp.CreateCredentialInput{
		AdapterType:     req.AdapterType,
		DisplayName:     req.DisplayName,
		Credentials:     req.Credentials,
		FilesAPIEnabled: req.FilesAPIEnabled,
		FilesAPIBaseURL: req.FilesAPIBaseURL,
		FilesAPIKey:     req.FilesAPIKey,
	})
	if err != nil {
		writeCredentialError(c, err)
		return
	}

	c.JSON(http.StatusCreated, cred)
}

func (h *AIHandler) UpdateCredential(c *gin.Context) {
	var req struct {
		DisplayName     string            `json:"display_name"`
		BaseURL         *string           `json:"base_url"`
		APIKey          string            `json:"api_key"`
		IsEnabled       *bool             `json:"is_enabled"`
		FilesAPIEnabled *bool             `json:"files_api_enabled"`
		FilesAPIBaseURL *string           `json:"files_api_base_url"`
		FilesAPIKey     string            `json:"files_api_key"`
		Credentials     map[string]string `json:"credentials"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cred, err := h.service.UpdateCredential(c.Request.Context(), aiadminapp.UpdateCredentialInput{
		ID:              c.Param("id"),
		DisplayName:     req.DisplayName,
		BaseURL:         req.BaseURL,
		APIKey:          req.APIKey,
		IsEnabled:       req.IsEnabled,
		FilesAPIEnabled: req.FilesAPIEnabled,
		FilesAPIBaseURL: req.FilesAPIBaseURL,
		FilesAPIKey:     req.FilesAPIKey,
		Credentials:     req.Credentials,
	})
	if err != nil {
		writeCredentialError(c, err)
		return
	}
	c.JSON(http.StatusOK, cred)
}

func (h *AIHandler) DeleteCredential(c *gin.Context) {
	_ = h.service.DeleteCredential(c.Request.Context(), c.Param("id"))
	c.Status(http.StatusNoContent)
}

// ListRemoteModels calls the provider's /models endpoint and returns available model IDs.
// Only supported for OpenAI-compatible providers (including custom).
func (h *AIHandler) ListRemoteModels(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	ids, err := h.service.ListRemoteModels(ctx, c.Param("id"))
	if err != nil {
		switch {
		case errors.Is(err, aiadminapp.ErrNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		case err.Error() == "this provider does not support model listing":
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"models": ids})
}

// TestCredential tests connectivity for a credential (provider-level ping).
func (h *AIHandler) TestCredential(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	result, err := h.service.TestCredential(ctx, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, result)
}

func writeCredentialError(c *gin.Context, err error) {
	if errors.Is(err, aiadminapp.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if errors.Is(err, aiadminapp.ErrEncryptFilesAPIKey) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt files api key"})
		return
	}
	if errors.Is(err, aiadminapp.ErrEncryptCredentials) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt credentials"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}

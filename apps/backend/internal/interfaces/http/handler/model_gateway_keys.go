package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	modelgatewayapp "github.com/movscript/movscript/internal/app/modelgateway"
)

func (h *ModelGatewayHandler) ListAPIKeys(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	keys, err := h.service.ListAPIKeys(c.Request.Context(), user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": keys})
}

func (h *ModelGatewayHandler) CreateAPIKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var req createGatewayAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.service.CreateAPIKey(c.Request.Context(), modelgatewayapp.CreateAPIKeyInput{
		OwnerUserID:     user.ID,
		Name:            req.Name,
		ProjectID:       req.ProjectID,
		AllowedModelIDs: req.AllowedModelIDs,
		AllowedScopes:   req.AllowedScopes,
		RateLimitRPM:    req.RateLimitRPM,
		MonthlyBudget:   req.MonthlyBudget,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gatewayAPIKeyCreateResponse{GatewayAPIKey: result.Key, Key: result.RawKey})
}

func (h *ModelGatewayHandler) UpdateAPIKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var req updateGatewayAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	key, err := h.service.UpdateAPIKey(c.Request.Context(), modelgatewayapp.UpdateAPIKeyInput{
		ID:              parseID(c.Param("id")),
		OwnerUserID:     user.ID,
		Name:            req.Name,
		AllowedModelIDs: req.AllowedModelIDs,
		AllowedScopes:   req.AllowedScopes,
		RateLimitRPM:    req.RateLimitRPM,
		MonthlyBudget:   req.MonthlyBudget,
		IsEnabled:       req.IsEnabled,
	})
	if err != nil {
		writeGatewayAPIKeyError(c, err)
		return
	}
	c.JSON(http.StatusOK, key)
}

func (h *ModelGatewayHandler) DeleteAPIKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	if err := h.service.DeleteAPIKey(c.Request.Context(), parseID(c.Param("id")), user.ID); err != nil {
		writeGatewayAPIKeyError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func writeGatewayAPIKeyError(c *gin.Context, err error) {
	if errors.Is(err, modelgatewayapp.ErrAPIKeyNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "api key not found"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}

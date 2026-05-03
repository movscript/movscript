package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
)

func (h *ModelGatewayHandler) ListAPIKeys(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var keys []model.GatewayAPIKey
	if err := h.db.Where("owner_user_id = ?", user.ID).Order("created_at desc").Find(&keys).Error; err != nil {
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
	scopes := req.AllowedScopes
	if len(scopes) == 0 {
		scopes = []string{"model:chat"}
	}
	rawKey := generateGatewayAPIKey()
	key := model.GatewayAPIKey{
		Name:            strings.TrimSpace(req.Name),
		KeyPrefix:       gatewayKeyPrefix(rawKey),
		KeyHash:         hashGatewayAPIKey(rawKey),
		OwnerUserID:     user.ID,
		ProjectID:       req.ProjectID,
		AllowedModelIDs: mustJSONString(req.AllowedModelIDs),
		AllowedScopes:   mustJSONString(scopes),
		RateLimitRPM:    req.RateLimitRPM,
		MonthlyBudget:   req.MonthlyBudget,
		IsEnabled:       true,
	}
	if err := h.db.Create(&key).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gatewayAPIKeyCreateResponse{GatewayAPIKey: key, Key: rawKey})
}

func (h *ModelGatewayHandler) UpdateAPIKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var key model.GatewayAPIKey
	if err := h.db.Where("id = ? AND owner_user_id = ?", c.Param("id"), user.ID).First(&key).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "api key not found"})
		return
	}
	var req updateGatewayAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]any{}
	if req.Name != nil {
		updates["name"] = strings.TrimSpace(*req.Name)
	}
	if req.AllowedModelIDs != nil {
		updates["allowed_model_ids"] = mustJSONString(req.AllowedModelIDs)
	}
	if req.AllowedScopes != nil {
		updates["allowed_scopes"] = mustJSONString(req.AllowedScopes)
	}
	if req.RateLimitRPM != nil {
		updates["rate_limit_rpm"] = *req.RateLimitRPM
	}
	if req.MonthlyBudget != nil {
		updates["monthly_budget"] = *req.MonthlyBudget
	}
	if req.IsEnabled != nil {
		updates["is_enabled"] = *req.IsEnabled
	}
	if len(updates) > 0 {
		if err := h.db.Model(&key).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	h.db.First(&key, key.ID)
	c.JSON(http.StatusOK, key)
}

func (h *ModelGatewayHandler) DeleteAPIKey(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var key model.GatewayAPIKey
	if err := h.db.Where("id = ? AND owner_user_id = ?", c.Param("id"), user.ID).First(&key).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "api key not found"})
		return
	}
	if err := h.db.Delete(&key).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

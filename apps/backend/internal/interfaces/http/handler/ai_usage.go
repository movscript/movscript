package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	aiadminapp "github.com/movscript/movscript/internal/app/aiadmin"
)

func (h *AIHandler) ListUsersWithQuota(c *gin.Context) {
	result, err := h.service.ListUsersWithQuota(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AIHandler) SetUserQuota(c *gin.Context) {
	userID := parseUint(c.Param("id"))
	var req struct {
		Balance float64 `json:"balance" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	quota, err := h.service.SetUserQuota(c.Request.Context(), userID, req.Balance)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, quota)
}

func (h *AIHandler) ListUsageLogs(c *gin.Context) {
	page := max(1, parseInt(c.DefaultQuery("page", "1")))
	pageSize := max(1, parseInt(c.DefaultQuery("page_size", "50")))
	if pageSize > 200 {
		pageSize = 200
	}
	pageResult, err := h.service.ListUsageLogs(c.Request.Context(), aiadminapp.UsageLogFilter{
		UserID:        c.Query("user_id"),
		ModelConfigID: c.Query("model_config_id"),
		ProviderID:    c.Query("provider_id"),
		Start:         c.Query("start"),
		End:           c.Query("end"),
		Page:          page,
		PageSize:      pageSize,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"total": pageResult.Total, "items": pageResult.Items, "page": pageResult.Page, "page_size": pageResult.PageSize})
}

func (h *AIHandler) GetMyQuota(c *gin.Context) {
	u := currentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	summary, err := h.service.GetMyQuota(c.Request.Context(), u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"balance":                 summary.Balance,
		"total_cost_this_month":   summary.TotalCostThisMonth,
		"total_tokens_this_month": summary.TotalTokensThisMonth,
	})
}

func (h *AIHandler) GetMyUsageLogs(c *gin.Context) {
	u := currentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	page := max(1, parseInt(c.DefaultQuery("page", "1")))
	pageSize := max(1, parseInt(c.DefaultQuery("page_size", "20")))
	pageResult, err := h.service.GetMyUsageLogs(c.Request.Context(), u.ID, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"total": pageResult.Total, "items": pageResult.Items})
}

package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type AuditHandler struct {
	db *gorm.DB
}

func NewAuditHandler(db *gorm.DB) *AuditHandler {
	return &AuditHandler{db: db}
}

func (h *AuditHandler) List(c *gin.Context) {
	var logs []model.AuditLog
	q := h.db.Model(&model.AuditLog{}).Order("id desc")
	if v := c.Query("actor_id"); v != "" {
		q = q.Where("actor_id = ?", v)
	}
	if v := c.Query("action"); v != "" {
		q = q.Where("action = ?", v)
	}
	if v := c.Query("target_type"); v != "" {
		q = q.Where("target_type = ?", v)
	}
	if v := c.Query("target_id"); v != "" {
		q = q.Where("target_id = ?", v)
	}
	if v := c.Query("project_id"); v != "" {
		q = q.Where("project_id = ?", v)
	}
	if v := c.Query("since"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("since must be RFC3339"))
			return
		}
		q = q.Where("created_at >= ?", t)
	}
	if v := c.Query("until"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("until must be RFC3339"))
			return
		}
		q = q.Where("created_at <= ?", t)
	}

	page := parsePositiveInt(c.Query("page"), 1)
	pageSize := parsePositiveInt(c.Query("page_size"), 50)
	if pageSize > 200 {
		pageSize = 200
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询审计日志失败"))
		return
	}
	if err := q.Offset((page - 1) * pageSize).Limit(pageSize).Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询审计日志失败"))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items":     logs,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func parsePositiveInt(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

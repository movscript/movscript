package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	cloud "github.com/movscript/movscript/internal/app/cloud"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	"gorm.io/gorm"
)

type CloudFileConfigHandler struct {
	db      *gorm.DB
	service *cloud.Service
}

func NewCloudFileConfigHandler(db *gorm.DB, encryptionKeyHex string) *CloudFileConfigHandler {
	return &CloudFileConfigHandler{db: db, service: cloud.NewService(db, encryptionKeyHex)}
}

func (h *CloudFileConfigHandler) List(c *gin.Context) {
	cfgs, err := h.service.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfgs)
}

func (h *CloudFileConfigHandler) Create(c *gin.Context) {
	var req struct {
		Name       string         `json:"name" binding:"required"`
		ConfigType string         `json:"config_type" binding:"required"`
		Config     map[string]any `json:"config" binding:"required"`
		Priority   int            `json:"priority"`
		IsEnabled  bool           `json:"is_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfg, err := h.service.Create(c.Request.Context(), cloud.CreateInput{
		Name:       req.Name,
		ConfigType: req.ConfigType,
		Config:     req.Config,
		Priority:   req.Priority,
		IsEnabled:  req.IsEnabled,
	})
	if err != nil {
		respondCloudFileConfigError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "cloud_file_config.admin_created",
		TargetType: "cloud_file_config",
		TargetID:   audit.TargetID(cfg.ID),
		Metadata: map[string]any{
			"name":        cfg.Name,
			"config_type": cfg.ConfigType,
			"priority":    cfg.Priority,
			"is_enabled":  cfg.IsEnabled,
		},
	})
	c.JSON(http.StatusCreated, cfg)
}

func (h *CloudFileConfigHandler) Update(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Name      *string        `json:"name"`
		Config    map[string]any `json:"config"`
		Priority  *int           `json:"priority"`
		IsEnabled *bool          `json:"is_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfg, err := h.service.Update(c.Request.Context(), cloud.UpdateInput{
		ID:        uint(id),
		Name:      req.Name,
		Config:    req.Config,
		Priority:  req.Priority,
		IsEnabled: req.IsEnabled,
	})
	if err != nil {
		respondCloudFileConfigError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "cloud_file_config.admin_updated",
		TargetType: "cloud_file_config",
		TargetID:   audit.TargetID(cfg.ID),
		Metadata: map[string]any{
			"name":        cfg.Name,
			"config_type": cfg.ConfigType,
			"priority":    cfg.Priority,
			"is_enabled":  cfg.IsEnabled,
		},
	})
	c.JSON(http.StatusOK, cfg)
}

func (h *CloudFileConfigHandler) Delete(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := h.service.Delete(c.Request.Context(), uint(id)); err != nil {
		respondCloudFileConfigError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "cloud_file_config.admin_deleted",
		TargetType: "cloud_file_config",
		TargetID:   audit.TargetID(uint(id)),
	})
	c.Status(http.StatusNoContent)
}

func (h *CloudFileConfigHandler) Test(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	result, err := h.service.Test(c.Request.Context(), uint(id))
	if err != nil {
		respondCloudFileConfigError(c, err)
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "cloud_file_config.admin_tested",
		TargetType: "cloud_file_config",
		TargetID:   audit.TargetID(uint(id)),
		Metadata: map[string]any{
			"success":    result.Success,
			"latency_ms": result.LatencyMS,
			"config_id":  result.ConfigID,
		},
	})
	c.JSON(http.StatusOK, result)
}

func respondCloudFileConfigError(c *gin.Context, err error) {
	if errors.Is(err, cloud.ErrInvalidName) {
		c.JSON(http.StatusBadRequest, api.InvalidInput("名称不能为空"))
		return
	}
	if errors.Is(err, cloud.ErrInvalidConfig) {
		c.JSON(http.StatusBadRequest, api.InvalidInput("config_type 必须是 s3、oss 或 tos"))
		return
	}
	if errors.Is(err, cloud.ErrNotFound) {
		c.JSON(http.StatusNotFound, api.NotFound("云端文件配置不存在"))
		return
	}
	c.JSON(http.StatusInternalServerError, api.Internal("保存云端文件配置失败"))
}

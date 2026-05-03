package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	cloudfileconfig "github.com/movscript/movscript/internal/app/cloudfileconfig"
	"gorm.io/gorm"
)

type CloudFileConfigHandler struct {
	service *cloudfileconfig.Service
}

func NewCloudFileConfigHandler(db *gorm.DB, encryptionKeyHex string) *CloudFileConfigHandler {
	return &CloudFileConfigHandler{service: cloudfileconfig.NewService(db, encryptionKeyHex)}
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
	cfg, err := h.service.Create(c.Request.Context(), cloudfileconfig.CreateInput{
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
	cfg, err := h.service.Update(c.Request.Context(), cloudfileconfig.UpdateInput{
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
	c.JSON(http.StatusOK, cfg)
}

func (h *CloudFileConfigHandler) Delete(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := h.service.Delete(c.Request.Context(), uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func respondCloudFileConfigError(c *gin.Context, err error) {
	if errors.Is(err, cloudfileconfig.ErrInvalidConfig) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid config_type: must be s3, oss, or tos"})
		return
	}
	if errors.Is(err, cloudfileconfig.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}

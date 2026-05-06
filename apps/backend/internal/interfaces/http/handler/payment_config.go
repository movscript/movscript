package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	paymentconfig "github.com/movscript/movscript/internal/app/paymentconfig"
	"gorm.io/gorm"
)

type PaymentConfigHandler struct {
	service *paymentconfig.Service
}

func NewPaymentConfigHandler(db *gorm.DB, encryptionKeyHex string) *PaymentConfigHandler {
	return &PaymentConfigHandler{service: paymentconfig.NewService(db, encryptionKeyHex)}
}

func (h *PaymentConfigHandler) List(c *gin.Context) {
	cfgs, err := h.service.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfgs)
}

func (h *PaymentConfigHandler) Create(c *gin.Context) {
	var req struct {
		Name       string         `json:"name" binding:"required"`
		ConfigType string         `json:"config_type" binding:"required"`
		Mode       string         `json:"mode"`
		Currency   string         `json:"currency"`
		Config     map[string]any `json:"config" binding:"required"`
		Priority   int            `json:"priority"`
		IsEnabled  bool           `json:"is_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfg, err := h.service.Create(c.Request.Context(), paymentconfig.CreateInput{
		Name:       req.Name,
		ConfigType: req.ConfigType,
		Mode:       req.Mode,
		Currency:   req.Currency,
		Config:     req.Config,
		Priority:   req.Priority,
		IsEnabled:  req.IsEnabled,
	})
	if err != nil {
		respondPaymentConfigError(c, err)
		return
	}
	c.JSON(http.StatusCreated, cfg)
}

func (h *PaymentConfigHandler) Update(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Name      *string        `json:"name"`
		Mode      *string        `json:"mode"`
		Currency  *string        `json:"currency"`
		Config    map[string]any `json:"config"`
		Priority  *int           `json:"priority"`
		IsEnabled *bool          `json:"is_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfg, err := h.service.Update(c.Request.Context(), paymentconfig.UpdateInput{
		ID:        uint(id),
		Name:      req.Name,
		Mode:      req.Mode,
		Currency:  req.Currency,
		Config:    req.Config,
		Priority:  req.Priority,
		IsEnabled: req.IsEnabled,
	})
	if err != nil {
		respondPaymentConfigError(c, err)
		return
	}
	c.JSON(http.StatusOK, cfg)
}

func (h *PaymentConfigHandler) Delete(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := h.service.Delete(c.Request.Context(), uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func respondPaymentConfigError(c *gin.Context, err error) {
	if errors.Is(err, paymentconfig.ErrInvalidConfig) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payment config: type must be alipay, wechat_pay, or stripe; mode must be sandbox or live"})
		return
	}
	if errors.Is(err, paymentconfig.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}

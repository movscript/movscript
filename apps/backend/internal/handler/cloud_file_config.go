package handler

import (
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/crypto"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type CloudFileConfigHandler struct {
	db            *gorm.DB
	encryptionKey []byte
}

func NewCloudFileConfigHandler(db *gorm.DB, encryptionKeyHex string) *CloudFileConfigHandler {
	key, _ := hex.DecodeString(encryptionKeyHex)
	return &CloudFileConfigHandler{db: db, encryptionKey: key}
}

func (h *CloudFileConfigHandler) List(c *gin.Context) {
	var cfgs []model.CloudFileConfig
	h.db.Order("priority asc, id asc").Find(&cfgs)
	for i := range cfgs {
		cfgs[i].MaskedConfig = h.maskConfig(cfgs[i].ConfigType, cfgs[i].ConfigJSON)
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
	if !validConfigType(req.ConfigType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid config_type: must be s3, oss, or tos"})
		return
	}
	encJSON, err := h.encryptConfig(req.Config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "encrypt config: " + err.Error()})
		return
	}
	cfg := model.CloudFileConfig{
		Name:       req.Name,
		ConfigType: req.ConfigType,
		ConfigJSON: encJSON,
		Priority:   req.Priority,
		IsEnabled:  req.IsEnabled,
	}
	if err := h.db.Create(&cfg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	cfg.MaskedConfig = h.maskConfig(cfg.ConfigType, cfg.ConfigJSON)
	c.JSON(http.StatusCreated, cfg)
}

func (h *CloudFileConfigHandler) Update(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var cfg model.CloudFileConfig
	if err := h.db.First(&cfg, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
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
	if req.Name != nil {
		cfg.Name = *req.Name
	}
	if req.Config != nil {
		merged := h.mergeConfigUpdate(cfg.ConfigJSON, req.Config)
		encJSON, err := h.encryptConfig(merged)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "encrypt config: " + err.Error()})
			return
		}
		cfg.ConfigJSON = encJSON
	}
	if req.Priority != nil {
		cfg.Priority = *req.Priority
	}
	if req.IsEnabled != nil {
		cfg.IsEnabled = *req.IsEnabled
	}
	h.db.Save(&cfg)
	cfg.MaskedConfig = h.maskConfig(cfg.ConfigType, cfg.ConfigJSON)
	c.JSON(http.StatusOK, cfg)
}

func (h *CloudFileConfigHandler) Delete(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	h.db.Delete(&model.CloudFileConfig{}, id)
	c.Status(http.StatusNoContent)
}

// encryptConfig marshals the config map to JSON and encrypts it.
func (h *CloudFileConfigHandler) encryptConfig(cfg map[string]any) (string, error) {
	raw, err := json.Marshal(cfg)
	if err != nil {
		return "", err
	}
	if len(h.encryptionKey) == 0 {
		return string(raw), nil
	}
	return crypto.Encrypt(string(raw), h.encryptionKey)
}

func (h *CloudFileConfigHandler) mergeConfigUpdate(existingEncJSON string, incoming map[string]any) map[string]any {
	existing := h.decryptConfig(existingEncJSON)
	for k, v := range incoming {
		if isSensitiveConfigKey(k) {
			if s, ok := v.(string); ok && (s == "" || isMaskedSecret(s)) {
				if old, exists := existing[k]; exists {
					incoming[k] = old
				}
			}
		}
	}
	return incoming
}

func (h *CloudFileConfigHandler) decryptConfig(encJSON string) map[string]any {
	if encJSON == "" {
		return map[string]any{}
	}
	raw := encJSON
	if len(h.encryptionKey) > 0 {
		if plain, err := crypto.Decrypt(encJSON, h.encryptionKey); err == nil {
			raw = plain
		}
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return map[string]any{}
	}
	return m
}

// maskConfig decrypts and redacts sensitive fields for display.
func (h *CloudFileConfigHandler) maskConfig(configType, encJSON string) string {
	if encJSON == "" {
		return "{}"
	}
	var raw string
	if len(h.encryptionKey) > 0 {
		plain, err := crypto.Decrypt(encJSON, h.encryptionKey)
		if err != nil {
			// Might be stored as plain JSON (no encryption key set).
			raw = encJSON
		} else {
			raw = plain
		}
	} else {
		raw = encJSON
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return "{}"
	}
	for k, v := range m {
		if isSensitiveConfigKey(k) {
			if s, ok := v.(string); ok && len(s) > 4 {
				m[k] = s[:4] + "****"
			} else {
				m[k] = "****"
			}
		}
	}
	b, _ := json.Marshal(m)
	return string(b)
}

func isSensitiveConfigKey(k string) bool {
	switch k {
	case "api_key", "secret_key", "access_key", "access_key_id", "access_key_secret":
		return true
	}
	return false
}

func isMaskedSecret(s string) bool {
	return s == "****" || (len(s) >= 4 && s[len(s)-4:] == "****")
}

func validConfigType(t string) bool {
	switch t {
	case "s3", "oss", "tos":
		return true
	}
	return false
}

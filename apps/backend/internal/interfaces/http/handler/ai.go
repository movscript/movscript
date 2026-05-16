package handler

import (
	"encoding/hex"
	"net/http"

	"github.com/gin-gonic/gin"
	adminai "github.com/movscript/movscript/internal/app/admin/ai"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

type AIHandler struct {
	db      *gorm.DB
	service *adminai.Service
}

func NewAIHandler(db *gorm.DB, encryptionKeyHex string, registry *ai.Registry) *AIHandler {
	key, _ := hex.DecodeString(encryptionKeyHex)
	return &AIHandler{db: db, service: adminai.NewService(db, key, registry)}
}

// ── Adapter & Model Presets ───────────────────────────────────────────────────

func (h *AIHandler) ListAdapters(c *gin.Context) {
	c.JSON(http.StatusOK, ai.AdapterDefs)
}

// ListModelPresets returns read-only templates for the admin add-model form.
// Presets never participate in runtime routing or generation parameter control.
func (h *AIHandler) ListModelPresets(c *gin.Context) {
	c.JSON(http.StatusOK, ai.ModelPresets())
}

// ── helpers ───────────────────────────────────────────────────────────────────

func parseUint(s string) uint {
	var v uint
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		v = v*10 + uint(c-'0')
	}
	return v
}

func parseInt(s string) int {
	v := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return v
		}
		v = v*10 + int(c-'0')
	}
	return v
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

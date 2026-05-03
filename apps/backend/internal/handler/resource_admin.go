package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	resourceadmin "github.com/movscript/movscript/internal/app/resourceadmin"
	"github.com/movscript/movscript/internal/storage"
	"gorm.io/gorm"
)

type ResourceAdminHandler struct {
	service *resourceadmin.Service
	store   storage.Storage
}

func NewResourceAdminHandler(db *gorm.DB, store storage.Storage) *ResourceAdminHandler {
	return &ResourceAdminHandler{service: resourceadmin.NewService(db), store: store}
}

// StorageBackends returns the configured storage backend.
func (h *ResourceAdminHandler) StorageBackends(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"default": h.store.Backend(),
		"backends": []gin.H{
			{"name": h.store.Backend(), "available": true},
		},
	})
}

// StorageStats returns per-user resource counts and total size.
func (h *ResourceAdminHandler) StorageStats(c *gin.Context) {
	result, err := h.service.StorageStats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	adminresource "github.com/movscript/movscript/internal/app/admin/resource"
	"github.com/movscript/movscript/internal/infra/storage"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	"gorm.io/gorm"
)

type ResourceAdminHandler struct {
	service *adminresource.Service
	store   storage.Storage
	db      *gorm.DB
}

func NewResourceAdminHandler(db *gorm.DB, store storage.Storage) *ResourceAdminHandler {
	return &ResourceAdminHandler{service: adminresource.NewService(db), store: store, db: db}
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

func (h *ResourceAdminHandler) ListResources(c *gin.Context) {
	result, err := h.service.ListResources(c.Request.Context(), adminresource.ResourceListFilter{
		Query:          c.Query("q"),
		Type:           c.Query("type"),
		StorageBackend: c.Query("storage_backend"),
		UserID:         c.Query("user_id"),
		OrgID:          c.Query("org_id"),
		Page:           parsePositiveInt(c.Query("page"), 1),
		PageSize:       parsePositiveInt(c.Query("page_size"), 50),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询资源失败"))
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *ResourceAdminHandler) ResourceDetail(c *gin.Context) {
	detail, err := h.service.ResourceDetail(c.Request.Context(), parseID(c.Param("id")))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("资源不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("查询资源详情失败"))
		return
	}
	c.JSON(http.StatusOK, detail)
}

func (h *ResourceAdminHandler) DeleteResource(c *gin.Context) {
	deleted, err := h.service.DeleteResource(c.Request.Context(), parseID(c.Param("id")), h.store)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("资源不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("删除资源失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "resource.admin_deleted",
		TargetType: "resource",
		TargetID:   audit.TargetID(deleted.ID),
		OrgID:      deleted.OrgID,
		Metadata: map[string]any{
			"owner_id":        deleted.OwnerID,
			"org_id":          deleted.OrgID,
			"name":            deleted.Name,
			"type":            deleted.Type,
			"storage_backend": deleted.StorageBackend,
			"size":            deleted.Size,
		},
	})
	c.Status(http.StatusNoContent)
}

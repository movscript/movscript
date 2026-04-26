package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/storage"
	"gorm.io/gorm"
)

type ResourceAdminHandler struct {
	db    *gorm.DB
	store storage.Storage
}

func NewResourceAdminHandler(db *gorm.DB, store storage.Storage) *ResourceAdminHandler {
	return &ResourceAdminHandler{db: db, store: store}
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
	type row struct {
		UserID         uint   `json:"user_id"`
		StorageBackend string `json:"storage_backend"`
		Count          int64  `json:"count"`
		TotalSize      int64  `json:"total_size"`
	}
	var rows []row
	h.db.Model(&model.RawResource{}).
		Select("owner_id as user_id, storage_backend, count(*) as count, sum(size) as total_size").
		Group("owner_id, storage_backend").
		Scan(&rows)

	type enriched struct {
		row
		Username string `json:"username"`
	}
	userIDs := make(map[uint]bool)
	for _, r := range rows {
		userIDs[r.UserID] = true
	}
	userMap := map[uint]string{}
	if len(userIDs) > 0 {
		ids := make([]uint, 0, len(userIDs))
		for id := range userIDs {
			ids = append(ids, id)
		}
		var users []model.User
		h.db.Where("id IN ?", ids).Find(&users)
		for _, u := range users {
			userMap[u.ID] = u.Username
		}
	}

	result := make([]enriched, 0, len(rows))
	for _, r := range rows {
		result = append(result, enriched{
			row:      r,
			Username: userMap[r.UserID],
		})
	}
	c.JSON(http.StatusOK, result)
}

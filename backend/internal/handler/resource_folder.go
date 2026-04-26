package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type ResourceFolderHandler struct {
	db *gorm.DB
}

func NewResourceFolderHandler(db *gorm.DB) *ResourceFolderHandler {
	return &ResourceFolderHandler{db: db}
}

// List returns the caller's own folders, or (with ?shared=true) folders from
// other users for which the caller has an explicit permission entry.
func (h *ResourceFolderHandler) List(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	if c.Query("shared") == "true" {
		// Return all folders marked is_shared=true by other users.
		// Explicit ResourceFolderPermission grants only affect write access.
		folders := make([]model.ResourceFolder, 0)
		h.db.Preload("Owner").
			Where("is_shared = true AND owner_id != ?", user.ID).
			Order("created_at asc").
			Find(&folders)
		populateFolderCounts(h.db, folders)
		c.JSON(http.StatusOK, folders)
		return
	}

	folders := make([]model.ResourceFolder, 0)
	h.db.Where("owner_id = ?", user.ID).Order("created_at asc").Find(&folders)
	populateFolderCounts(h.db, folders)
	c.JSON(http.StatusOK, folders)
}

func (h *ResourceFolderHandler) Create(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var body struct {
		Name           string `json:"name" binding:"required"`
		ParentID       *uint  `json:"parent_id"`
		StorageBackend string `json:"storage_backend"`
		IsShared       bool   `json:"is_shared"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	folder := model.ResourceFolder{
		OwnerID:        user.ID,
		Name:           body.Name,
		ParentID:       body.ParentID,
		StorageBackend: body.StorageBackend,
		IsShared:       body.IsShared,
	}
	if err := h.db.Create(&folder).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, folder)
}

func (h *ResourceFolderHandler) Update(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var folder model.ResourceFolder
	if err := h.db.First(&folder, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if folder.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var body struct {
		Name           string `json:"name"`
		StorageBackend string `json:"storage_backend"`
		IsShared       *bool  `json:"is_shared"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]any{}
	if body.Name != "" {
		updates["name"] = body.Name
	}
	if body.StorageBackend != "" {
		updates["storage_backend"] = body.StorageBackend
	}
	if body.IsShared != nil {
		updates["is_shared"] = *body.IsShared
	}
	h.db.Model(&folder).Updates(updates)
	c.JSON(http.StatusOK, folder)
}

func (h *ResourceFolderHandler) Delete(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var folder model.ResourceFolder
	if err := h.db.First(&folder, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if folder.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	// Move files in this folder to root (null folder_id).
	h.db.Model(&model.RawResource{}).
		Where("folder_id = ?", folder.ID).
		Update("folder_id", nil)

	// Remove all permissions.
	h.db.Where("folder_id = ?", folder.ID).Delete(&model.ResourceFolderPermission{})

	h.db.Delete(&folder)
	c.Status(http.StatusNoContent)
}

// ─── Permission endpoints ─────────────────────────────────────────────────────

// ListPermissions returns all permission entries for a folder (owner only).
func (h *ResourceFolderHandler) ListPermissions(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	folder, ok := h.requireOwner(c, user)
	if !ok {
		return
	}
	var perms []model.ResourceFolderPermission
	h.db.Preload("User").Where("folder_id = ?", folder.ID).Find(&perms)
	c.JSON(http.StatusOK, perms)
}

// GrantPermission grants or updates a user's access to a folder (owner only).
// Body: { user_id, permission: "read"|"write" }
func (h *ResourceFolderHandler) GrantPermission(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	folder, ok := h.requireOwner(c, user)
	if !ok {
		return
	}

	var body struct {
		UserID     uint   `json:"user_id" binding:"required"`
		Permission string `json:"permission"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Permission == "" {
		body.Permission = "read"
	}
	if body.Permission != "read" && body.Permission != "write" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "permission must be read or write"})
		return
	}
	if body.UserID == user.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot grant permission to yourself"})
		return
	}

	var perm model.ResourceFolderPermission
	if h.db.Where("folder_id = ? AND user_id = ?", folder.ID, body.UserID).First(&perm).Error != nil {
		perm = model.ResourceFolderPermission{FolderID: folder.ID, UserID: body.UserID, Permission: body.Permission}
		h.db.Create(&perm)
	} else {
		h.db.Model(&perm).Update("permission", body.Permission)
	}
	h.db.Preload("User").First(&perm, perm.ID)
	c.JSON(http.StatusOK, perm)
}

// RevokePermission removes a user's access to a folder (owner only).
func (h *ResourceFolderHandler) RevokePermission(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	folder, ok := h.requireOwner(c, user)
	if !ok {
		return
	}
	targetUserID, err := strconv.ParseUint(c.Param("userId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	h.db.Where("folder_id = ? AND user_id = ?", folder.ID, targetUserID).
		Delete(&model.ResourceFolderPermission{})
	c.Status(http.StatusNoContent)
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func (h *ResourceFolderHandler) requireOwner(c *gin.Context, user *model.User) (model.ResourceFolder, bool) {
	var folder model.ResourceFolder
	if err := h.db.First(&folder, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return folder, false
	}
	if folder.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return folder, false
	}
	return folder, true
}

func populateFolderCounts(db *gorm.DB, folders []model.ResourceFolder) {
	for i := range folders {
		var count int64
		db.Model(&model.RawResource{}).
			Where("folder_id = ? AND deleted_at IS NULL", folders[i].ID).
			Count(&count)
		folders[i].ResourceCount = int(count)
	}
}

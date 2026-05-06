package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	appresourcefolder "github.com/movscript/movscript/internal/app/resourcefolder"
	"gorm.io/gorm"
)

type ResourceFolderHandler struct {
	service *appresourcefolder.Service
}

func NewResourceFolderHandler(db *gorm.DB) *ResourceFolderHandler {
	return &ResourceFolderHandler{service: appresourcefolder.NewService(db)}
}

func (h *ResourceFolderHandler) List(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	folders, err := h.service.List(c.Request.Context(), user.ID, currentOrgID(c), c.Query("shared") == "true")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
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
	folder, err := h.service.Create(c.Request.Context(), user.ID, appresourcefolder.CreateInput{OrgID: currentOrgID(c), Name: body.Name, ParentID: body.ParentID, StorageBackend: body.StorageBackend, IsShared: body.IsShared})
	if err != nil {
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
	var body struct {
		Name           string `json:"name"`
		StorageBackend string `json:"storage_backend"`
		IsShared       *bool  `json:"is_shared"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	folder, err := h.service.Update(c.Request.Context(), user.ID, currentOrgID(c), parseID(c.Param("id")), appresourcefolder.UpdateInput{Name: body.Name, StorageBackend: body.StorageBackend, IsShared: body.IsShared})
	if err != nil {
		switch err {
		case appresourcefolder.ErrNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		case appresourcefolder.ErrForbidden:
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, folder)
}

func (h *ResourceFolderHandler) Delete(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	if err := h.service.Delete(c.Request.Context(), user.ID, currentOrgID(c), parseID(c.Param("id"))); err != nil {
		switch err {
		case appresourcefolder.ErrNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		case appresourcefolder.ErrForbidden:
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *ResourceFolderHandler) ListPermissions(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	perms, err := h.service.ListPermissions(c.Request.Context(), user.ID, currentOrgID(c), parseID(c.Param("id")))
	if err != nil {
		switch err {
		case appresourcefolder.ErrNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		case appresourcefolder.ErrForbidden:
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, perms)
}

func (h *ResourceFolderHandler) GrantPermission(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
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
	perm, err := h.service.GrantPermission(c.Request.Context(), user.ID, currentOrgID(c), parseID(c.Param("id")), appresourcefolder.PermissionInput{UserID: body.UserID, Permission: body.Permission})
	if err != nil {
		switch err {
		case appresourcefolder.ErrNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		case appresourcefolder.ErrForbidden:
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		case appresourcefolder.ErrConflict:
			c.JSON(http.StatusBadRequest, gin.H{"error": "permission must be read or write"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, perm)
}

func (h *ResourceFolderHandler) RevokePermission(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	targetUserID, err := appresourcefolder.ParsePermissionID(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	if err := h.service.RevokePermission(c.Request.Context(), user.ID, currentOrgID(c), parseID(c.Param("id")), targetUserID); err != nil {
		switch err {
		case appresourcefolder.ErrNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		case appresourcefolder.ErrForbidden:
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.Status(http.StatusNoContent)
}

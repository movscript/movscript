package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	appresourcefolder "github.com/movscript/movscript/internal/app/resource/folder"
	"github.com/movscript/movscript/internal/infra/cache"
	"gorm.io/gorm"
)

type ResourceFolderHandler struct {
	service *appresourcefolder.Service
}

func NewResourceFolderHandler(db *gorm.DB, cacheStore ...cache.Cache) *ResourceFolderHandler {
	return &ResourceFolderHandler{service: appresourcefolder.NewService(db, cacheStore...)}
}

func (h *ResourceFolderHandler) List(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	folders, err := h.service.List(c.Request.Context(), user.ID, currentOrgID(c))
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
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	folder, err := h.service.Create(c.Request.Context(), user.ID, appresourcefolder.CreateInput{OrgID: currentOrgID(c), Name: body.Name, ParentID: body.ParentID, StorageBackend: body.StorageBackend})
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
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	folder, err := h.service.Update(c.Request.Context(), user.ID, currentOrgID(c), parseID(c.Param("id")), appresourcefolder.UpdateInput{Name: body.Name, StorageBackend: body.StorageBackend})
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

package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/app/dto"
	scriptapp "github.com/movscript/movscript/internal/app/script"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

type ScriptHandler struct {
	service *scriptapp.Service
}

func NewScriptHandler(db *gorm.DB, cacheStore ...cache.Cache) *ScriptHandler {
	return &ScriptHandler{service: scriptapp.NewService(db, cacheStore...)}
}

func (h *ScriptHandler) List(c *gin.Context) {
	scripts, err := h.service.List(c.Request.Context(), scriptapp.ListFilter{
		ProjectID:  parseID(c.Param("id")),
		Type:       c.Query("type"),
		AssigneeID: c.Query("assignee_id"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, scripts)
}

func (h *ScriptHandler) Create(c *gin.Context) {
	var req dto.ScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	var authorID uint
	if user := currentUser(c); user != nil {
		authorID = user.ID
	}
	item, err := h.service.Create(c.Request.Context(), scriptapp.CreateInput{
		ProjectID:   parseID(c.Param("id")),
		AuthorID:    authorID,
		CreatedByID: currentUserID(c),
		Script:      req,
	})
	if err != nil {
		if errors.Is(err, scriptapp.ErrVersionSync) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "剧本版本初始化失败: " + err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *ScriptHandler) Get(c *gin.Context) {
	item, err := h.service.Get(c.Request.Context(), parseID(c.Param("scriptId")))
	if err != nil {
		c.JSON(http.StatusNotFound, api.NotFound("剧本不存在"))
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *ScriptHandler) Update(c *gin.Context) {
	var req dto.ScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.service.Update(c.Request.Context(), scriptapp.UpdateInput{
		ID:          parseID(c.Param("scriptId")),
		UpdatedByID: currentUserID(c),
		Script:      req,
	})
	if err != nil {
		if errors.Is(err, scriptapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("剧本不存在"))
			return
		}
		if errors.Is(err, scriptapp.ErrVersionSync) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "剧本版本同步失败: " + err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *ScriptHandler) Delete(c *gin.Context) {
	if err := h.service.Delete(c.Request.Context(), parseID(c.Param("scriptId"))); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// Patch applies a partial update to a script.
func (h *ScriptHandler) Patch(c *gin.Context) {
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.service.Patch(c.Request.Context(), scriptapp.PatchInput{
		ID:          parseID(c.Param("id")),
		UpdatedByID: currentUserID(c),
		Body:        body,
	})
	if err != nil {
		if errors.Is(err, scriptapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("剧本不存在"))
			return
		}
		if errors.Is(err, scriptapp.ErrVersionSync) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "剧本版本同步失败: " + err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
}

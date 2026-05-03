package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	appsetting "github.com/movscript/movscript/internal/app/setting"
	"github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

type SettingHandler struct {
	service *appsetting.Service
}

func NewSettingHandler(db *gorm.DB) *SettingHandler {
	return &SettingHandler{service: appsetting.NewService(db)}
}

func (h *SettingHandler) List(c *gin.Context) {
	items, err := h.service.List(c.Request.Context(), appsetting.ListFilter{
		ProjectID: parseID(c.Param("id")),
		Type:      c.Query("type"),
		ScriptID:  c.Query("script_id"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SettingHandler) ListRefs(c *gin.Context) {
	items, err := h.service.ListRefs(c.Request.Context(), appsetting.RefFilter{
		ProjectID: parseID(c.Param("id")),
		ScriptID:  c.Query("script_id"),
		SettingID: c.Query("setting_id"),
		Scope:     c.Query("scope"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SettingHandler) CreateRef(c *gin.Context) {
	var req service.ScriptSettingRefInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	ref, err := h.service.CreateRef(c.Request.Context(), parseID(c.Param("id")), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, ref)
}

func (h *SettingHandler) UpdateRef(c *gin.Context) {
	var req service.ScriptSettingRefInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	ref, err := h.service.UpdateRef(c.Request.Context(), parseID(c.Param("id")), req)
	if err != nil {
		if errors.Is(err, appsetting.ErrNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("设定引用不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, ref)
}

func (h *SettingHandler) DeleteRef(c *gin.Context) {
	if err := h.service.DeleteRef(c.Request.Context(), parseID(c.Param("id"))); err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *SettingHandler) ListRelationships(c *gin.Context) {
	items, err := h.service.ListRelationships(c.Request.Context(), appsetting.RelationshipFilter{
		ProjectID:     parseID(c.Param("id")),
		Category:      c.Query("category"),
		ScopeScriptID: c.Query("scope_script_id"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SettingHandler) CreateRelationship(c *gin.Context) {
	var req service.SettingRelationshipInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.service.CreateRelationship(c.Request.Context(), parseID(c.Param("id")), req)
	if err != nil {
		h.writeSettingError(c, err, "设定关系已存在")
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SettingHandler) UpdateRelationship(c *gin.Context) {
	var req service.SettingRelationshipInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.service.UpdateRelationship(c.Request.Context(), parseID(c.Param("id")), req)
	if err != nil {
		if errors.Is(err, appsetting.ErrNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("设定关系不存在"))
			return
		}
		h.writeSettingError(c, err, "设定关系已存在")
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SettingHandler) DeleteRelationship(c *gin.Context) {
	if err := h.service.DeleteRelationship(c.Request.Context(), parseID(c.Param("id"))); err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *SettingHandler) Create(c *gin.Context) {
	var req service.SettingInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.service.Create(c.Request.Context(), parseID(c.Param("id")), req)
	if err != nil {
		h.writeSettingError(c, err, "设定名称已存在")
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SettingHandler) Update(c *gin.Context) {
	var req service.SettingInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.service.Update(c.Request.Context(), parseID(c.Param("id")), req)
	if err != nil {
		if errors.Is(err, appsetting.ErrNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("设定不存在"))
			return
		}
		h.writeSettingError(c, err, "设定名称已存在")
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SettingHandler) Delete(c *gin.Context) {
	if err := h.service.Delete(c.Request.Context(), parseID(c.Param("id"))); err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *SettingHandler) writeSettingError(c *gin.Context, err error, conflictMessage string) {
	switch {
	case errors.Is(err, appsetting.ErrConflict):
		c.JSON(http.StatusConflict, apierr.InvalidInput(conflictMessage))
	case errors.Is(err, appsetting.ErrInvalidInput):
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
	default:
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
	}
}

package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
)

func (h *SemanticEntityHandler) ListScriptVersions(c *gin.Context) {
	items, err := h.semantic.ListScriptVersions(c.Request.Context(), semanticapp.ScriptVersionFilter{
		ProjectID: parseID(c.Param("id")),
		ScriptID:  parseID(c.Query("script_id")),
		Status:    c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateScriptVersion(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreateScriptVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateScriptVersion(c.Request.Context(), projectID, req, currentUserID(c))
	if err != nil {
		if errors.Is(err, semanticapp.ErrScriptNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("剧本不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchScriptVersion(c *gin.Context) {
	var req semanticapp.PatchScriptVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchScriptVersion(c.Request.Context(), parseID(c.Param("id")), c.Param("versionId"), req)
	if err != nil {
		if errors.Is(err, semanticapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("对象不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, item)
}

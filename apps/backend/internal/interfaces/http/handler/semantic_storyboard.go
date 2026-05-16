package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/interfaces/http/api"
)

func (h *SemanticEntityHandler) ListStoryboardScripts(c *gin.Context) {
	items, err := h.semantic.ListStoryboardScripts(c.Request.Context(), semanticapp.StoryboardScriptFilter{
		ProjectID:       parseID(c.Param("id")),
		ScriptVersionID: parseID(c.Query("script_version_id")),
		Status:          c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateStoryboardScript(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.StoryboardScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateStoryboardScript(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchStoryboardScript(c *gin.Context) {
	var req semanticapp.StoryboardScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchStoryboardScript(c.Request.Context(), parseID(c.Param("id")), c.Param("storyboardScriptId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListStoryboardVersions(c *gin.Context) {
	items, err := h.semantic.ListStoryboardVersions(c.Request.Context(), semanticapp.StoryboardVersionFilter{
		ProjectID:          parseID(c.Param("id")),
		StoryboardScriptID: parseID(c.Query("storyboard_script_id")),
		Status:             c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateStoryboardVersion(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.StoryboardVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateStoryboardVersion(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchStoryboardVersion(c *gin.Context) {
	item, err := h.semantic.PatchStoryboardVersion(c.Request.Context(), parseID(c.Param("id")), c.Param("storyboardVersionId"))
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

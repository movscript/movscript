package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
)

func (h *SemanticEntityHandler) ListStoryboardScripts(c *gin.Context) {
	items, err := h.semantic.ListStoryboardScripts(c.Request.Context(), semanticapp.StoryboardScriptFilter{
		ProjectID:       parseID(c.Param("id")),
		ScriptVersionID: parseID(c.Query("script_version_id")),
		Status:          c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateStoryboardScript(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.StoryboardScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateStoryboardVersion(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.StoryboardVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
	var req semanticapp.StoryboardVersionPatchInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchStoryboardVersion(c.Request.Context(), parseID(c.Param("id")), c.Param("storyboardVersionId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListStoryboardLines(c *gin.Context) {
	items, err := h.semantic.ListStoryboardLines(c.Request.Context(), semanticapp.StoryboardLineFilter{
		ProjectID:           parseID(c.Param("id")),
		StoryboardScriptID:  parseID(c.Query("storyboard_script_id")),
		StoryboardVersionID: parseID(c.Query("storyboard_version_id")),
		Status:              c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateStoryboardLine(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.StoryboardLineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateStoryboardLine(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchStoryboardLine(c *gin.Context) {
	var req semanticapp.StoryboardLineInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchStoryboardLine(c.Request.Context(), parseID(c.Param("id")), c.Param("storyboardLineId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

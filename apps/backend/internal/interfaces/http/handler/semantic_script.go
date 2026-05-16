package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/interfaces/http/api"
)

func (h *SemanticEntityHandler) ListScriptVersions(c *gin.Context) {
	items, err := h.semantic.ListScriptVersions(c.Request.Context(), semanticapp.ScriptVersionFilter{
		ProjectID: parseID(c.Param("id")),
		ScriptID:  parseID(c.Query("script_id")),
		Status:    c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateScriptVersion(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreateScriptVersionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateScriptVersion(c.Request.Context(), projectID, req, currentUserID(c))
	if err != nil {
		if errors.Is(err, semanticapp.ErrScriptNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("剧本不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) ListScriptVersionLines(c *gin.Context) {
	items, err := h.semantic.ListScriptVersionLines(c.Request.Context(), parseID(c.Param("id")), c.Param("versionId"))
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) ListScriptBlocks(c *gin.Context) {
	items, err := h.semantic.ListScriptBlocks(c.Request.Context(), semanticapp.ScriptBlockFilter{
		ProjectID:       parseID(c.Param("id")),
		ScriptID:        parseID(c.Query("script_id")),
		ScriptVersionID: parseID(c.Query("script_version_id")),
		ParentBlockID:   parseID(c.Query("parent_block_id")),
		Kind:            c.Query("kind"),
		Status:          c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateScriptBlock(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreateScriptBlockInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateScriptBlock(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchScriptBlock(c *gin.Context) {
	var req semanticapp.PatchScriptBlockInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchScriptBlock(c.Request.Context(), parseID(c.Param("id")), c.Param("blockId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListScriptBlockUsages(c *gin.Context) {
	items, err := h.semantic.ListScriptBlockUsages(c.Request.Context(), parseID(c.Param("id")), c.Param("blockId"))
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) ListScriptBlockUsageMap(c *gin.Context) {
	items, err := h.semantic.ListScriptBlockUsageMap(c.Request.Context(), parseID(c.Param("id")), parseID(c.Query("script_version_id")))
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
)

func (h *SemanticEntityHandler) ListCreativeReferences(c *gin.Context) {
	items, err := h.semantic.ListCreativeReferences(c.Request.Context(), semanticapp.CreativeReferenceFilter{
		ProjectID: parseID(c.Param("id")),
		Kind:      c.Query("kind"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCreativeReference(c *gin.Context) {
	var req semanticapp.CreativeReferenceInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateCreativeReference(c.Request.Context(), parseID(c.Param("id")), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchCreativeReference(c *gin.Context) {
	var req semanticapp.CreativeReferenceInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchCreativeReference(c.Request.Context(), parseID(c.Param("id")), c.Param("referenceId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListCreativeReferenceStates(c *gin.Context) {
	items, err := h.semantic.ListCreativeReferenceStates(c.Request.Context(), semanticapp.CreativeReferenceStateFilter{
		ProjectID:           parseID(c.Param("id")),
		CreativeReferenceID: parseID(c.Query("creative_reference_id")),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCreativeReferenceState(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreativeReferenceStateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateCreativeReferenceState(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchCreativeReferenceState(c *gin.Context) {
	var req semanticapp.CreativeReferenceStateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchCreativeReferenceState(c.Request.Context(), parseID(c.Param("id")), c.Param("stateId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListCreativeReferenceUsages(c *gin.Context) {
	items, err := h.semantic.ListCreativeReferenceUsages(c.Request.Context(), semanticapp.CreativeReferenceUsageFilter{
		ProjectID:           parseID(c.Param("id")),
		OwnerType:           c.Query("owner_type"),
		OwnerID:             parseID(c.Query("owner_id")),
		CreativeReferenceID: parseID(c.Query("creative_reference_id")),
		Status:              c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCreativeReferenceUsage(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreativeReferenceUsageInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateCreativeReferenceUsage(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchCreativeReferenceUsage(c *gin.Context) {
	var req semanticapp.CreativeReferenceUsageInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchCreativeReferenceUsage(c.Request.Context(), parseID(c.Param("id")), c.Param("usageId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListCreativeRelationships(c *gin.Context) {
	items, err := h.semantic.ListCreativeRelationships(c.Request.Context(), semanticapp.CreativeRelationshipFilter{
		ProjectID:           parseID(c.Param("id")),
		CreativeReferenceID: parseID(c.Query("creative_reference_id")),
		ScopeType:           c.Query("scope_type"),
		Status:              c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCreativeRelationship(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CreativeRelationshipInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateCreativeRelationship(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchCreativeRelationship(c *gin.Context) {
	var req semanticapp.CreativeRelationshipInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchCreativeRelationship(c.Request.Context(), parseID(c.Param("id")), c.Param("relationshipId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

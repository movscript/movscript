package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
)

func (h *SemanticEntityHandler) ListWorkItems(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	if _, _, ok := h.projectRole(c, projectID); !ok {
		return
	}
	items, err := h.semantic.ListWorkItems(c.Request.Context(), semanticapp.WorkItemFilter{
		ProjectID:    projectID,
		ProductionID: parseID(c.Query("production_id")),
		TargetType:   c.Query("target_type"),
		Status:       c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateWorkItem(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	var req semanticapp.WorkItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateWorkItem(c.Request.Context(), projectID, semanticapp.WorkAuth{Role: role}, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchWorkItem(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, userID, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	var req semanticapp.WorkItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchWorkItem(c.Request.Context(), projectID, c.Param("workItemId"), semanticapp.WorkAuth{Role: role, UserID: userID}, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) DeleteWorkItem(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	if err := h.semantic.DeleteWorkItem(c.Request.Context(), projectID, c.Param("workItemId"), semanticapp.WorkAuth{Role: role}); err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *SemanticEntityHandler) ListWorkReviews(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	if _, _, ok := h.projectRole(c, projectID); !ok {
		return
	}
	items, err := h.semantic.ListWorkReviews(c.Request.Context(), semanticapp.WorkReviewFilter{
		ProjectID:  projectID,
		WorkItemID: parseID(c.Query("work_item_id")),
		Status:     c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateWorkReview(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, userID, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	var req semanticapp.WorkReviewInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateWorkReview(c.Request.Context(), projectID, semanticapp.WorkAuth{Role: role, UserID: userID}, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchWorkReview(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	var req semanticapp.WorkReviewInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchWorkReview(c.Request.Context(), projectID, c.Param("reviewId"), semanticapp.WorkAuth{Role: role}, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) DeleteWorkReview(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	if err := h.semantic.DeleteWorkReview(c.Request.Context(), projectID, c.Param("reviewId"), semanticapp.WorkAuth{Role: role}); err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *SemanticEntityHandler) ListWorkDependencies(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	if _, _, ok := h.projectRole(c, projectID); !ok {
		return
	}
	items, err := h.semantic.ListWorkDependencies(c.Request.Context(), semanticapp.WorkDependencyFilter{
		ProjectID:  projectID,
		WorkItemID: parseID(c.Query("work_item_id")),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateWorkDependency(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	var req semanticapp.WorkDependencyInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateWorkDependency(c.Request.Context(), projectID, semanticapp.WorkAuth{Role: role}, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchWorkDependency(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	var req semanticapp.WorkDependencyInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchWorkDependency(c.Request.Context(), projectID, c.Param("dependencyId"), semanticapp.WorkAuth{Role: role}, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) DeleteWorkDependency(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	role, _, ok := h.projectRole(c, projectID)
	if !ok {
		return
	}
	if err := h.semantic.DeleteWorkDependency(c.Request.Context(), projectID, c.Param("dependencyId"), semanticapp.WorkAuth{Role: role}); err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

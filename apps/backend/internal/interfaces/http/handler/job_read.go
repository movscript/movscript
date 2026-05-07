package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	jobapp "github.com/movscript/movscript/internal/app/job"
	domainjob "github.com/movscript/movscript/internal/domain/job"
)

// List returns the current user's generation jobs (newest first).
func (h *JobHandler) List(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	pageMode := c.Query("page") != "" || c.Query("page_size") != ""
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", strconv.Itoa(pageSize)))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	if pageMode {
		limit = pageSize
		offset = (page - 1) * pageSize
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	var projectID *uint
	if rawProjectID := c.Query("project_id"); rawProjectID != "" {
		id, err := strconv.ParseUint(rawProjectID, 10, 64)
		if err != nil || id == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project_id"})
			return
		}
		parsed := uint(id)
		projectID = &parsed
	}

	result, err := h.service.List(c.Request.Context(), jobapp.ListFilter{
		UserID:     user.ID,
		OrgID:      currentOrgID(c),
		ProjectID:  projectID,
		Status:     c.Query("status"),
		FeatureKey: c.Query("feature"),
		JobType:    c.Query("type"),
		ExactType:  c.Query("exact_type") == "1",
		Limit:      limit,
		Offset:     offset,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	resp := h.buildJobResponses(c, result.Items)
	c.Header("X-Total-Count", strconv.FormatInt(result.Total, 10))
	if pageMode {
		c.JSON(http.StatusOK, gin.H{"total": result.Total, "items": resp, "page": page, "page_size": pageSize})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// Get returns a single job by ID with its output resource.
func (h *JobHandler) Get(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	job, err := h.service.Get(c.Request.Context(), parseID(c.Param("id")), user.ID, currentOrgID(c))
	if err != nil {
		if errors.Is(err, jobapp.ErrForbidden) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		if errors.Is(err, jobapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, h.buildJobResponses(c, []domainjob.Job{job})[0])
}

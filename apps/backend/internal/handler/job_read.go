package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
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

	q := h.db.Model(&model.Job{}).Where("user_id = ?", user.ID)
	if projectID := c.Query("project_id"); projectID != "" {
		id, err := strconv.ParseUint(projectID, 10, 64)
		if err != nil || id == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project_id"})
			return
		}
		q = q.Where("project_id = ?", uint(id))
	}
	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if featureKey := c.Query("feature"); featureKey != "" {
		q = q.Where("feature_key = ?", featureKey)
	}
	if jobType := c.Query("type"); jobType != "" {
		// "image" also includes "image_edit" jobs since they're the same from the user's perspective.
		// Callers that need exact category tabs can pass exact_type=1.
		if jobType == "image" && c.Query("exact_type") != "1" {
			q = q.Where("job_type IN ?", []string{"image", "image_edit"})
		} else {
			q = q.Where("job_type = ?", jobType)
		}
	}

	var total int64
	q.Count(&total)

	var jobs []model.Job
	q.Preload("OutputResource").Order("id desc").Limit(limit).Offset(offset).Find(&jobs)
	resp := h.buildJobResponses(c, jobs)
	c.Header("X-Total-Count", strconv.FormatInt(total, 10))
	if pageMode {
		c.JSON(http.StatusOK, gin.H{"total": total, "items": resp, "page": page, "page_size": pageSize})
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

	var job model.Job
	if err := h.db.Preload("OutputResource").First(&job, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if job.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	c.JSON(http.StatusOK, h.buildJobResponses(c, []model.Job{job})[0])
}

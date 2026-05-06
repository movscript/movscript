package handler

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	jobapp "github.com/movscript/movscript/internal/app/job"
)

// Retry requeues a failed generation job for manual retry.
func (h *JobHandler) Retry(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	job, err := h.service.Retry(c.Request.Context(), parseID(c.Param("id")), user.ID)
	if err != nil {
		h.writeJobActionError(c, err)
		return
	}
	c.JSON(http.StatusOK, job)
}

// Cancel requests cancellation for a video generation job.
// Provider-side cancellation is currently supported for Volcengine async video tasks.
func (h *JobHandler) Cancel(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	id := parseID(c.Param("id"))
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()
	job, err := h.service.Cancel(ctx, id, user.ID)
	if err != nil {
		h.writeJobActionError(c, err)
		return
	}
	c.JSON(http.StatusOK, job)
}

// Delete cancels a pending job or removes a finished job record.
func (h *JobHandler) Delete(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	if err := h.service.DeleteAndRelease(c.Request.Context(), parseID(c.Param("id")), user.ID); err != nil {
		h.writeJobActionError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *JobHandler) writeJobActionError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, jobapp.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	case errors.Is(err, jobapp.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case errors.Is(err, jobapp.ErrSucceededJobCannotRetry):
		c.JSON(http.StatusConflict, gin.H{"error": "succeeded jobs cannot be retried"})
	case errors.Is(err, jobapp.ErrRunningJobCannotRetry):
		c.JSON(http.StatusConflict, gin.H{"error": "running jobs cannot be retried until they fail or time out"})
	case errors.Is(err, jobapp.ErrOnlyVideoJobsCanCancel):
		c.JSON(http.StatusConflict, gin.H{"error": "only video generation jobs can be cancelled"})
	case errors.Is(err, jobapp.ErrFinishedJobCannotCancel):
		c.JSON(http.StatusConflict, gin.H{"error": "finished jobs cannot be cancelled"})
	case errors.Is(err, jobapp.ErrInvalidCancelStatus):
		c.JSON(http.StatusConflict, gin.H{"error": "job cannot be cancelled from current status"})
	case errors.Is(err, jobapp.ErrRunningJobMustCancelDelete):
		c.JSON(http.StatusConflict, gin.H{"error": "running jobs must be cancelled before deletion"})
	case errors.Is(err, jobapp.ErrUnsupportedProviderCancel):
		c.JSON(http.StatusConflict, gin.H{"error": "this provider does not support video task cancellation"})
	case errors.Is(err, jobapp.ErrProviderCancellationFailed):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

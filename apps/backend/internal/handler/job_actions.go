package handler

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	jobapp "github.com/movscript/movscript/internal/app/job"
	jobrunner "github.com/movscript/movscript/internal/job"
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
	job, err := h.service.ValidateCancellation(c.Request.Context(), id, user.ID)
	if err != nil {
		h.writeJobActionError(c, err)
		return
	}
	if job.Status == jobrunner.StatusCancelled {
		c.JSON(http.StatusOK, job)
		return
	}
	if !h.aiService.SupportsVideoTaskCancellation(job.ModelConfigID) {
		c.JSON(http.StatusConflict, gin.H{"error": "this provider does not support video task cancellation"})
		return
	}

	providerStatus := ai.VideoStatusCancelled
	message := "cancelled by user"
	if job.ProviderTaskID != "" {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
		defer cancel()
		resp, err := h.aiService.CallVideoCancel(ctx, job.ModelConfigID, job.ProviderTaskID, job.ProviderTaskKind)
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"error": "provider cancellation failed: " + err.Error()})
			return
		}
		providerStatus = firstNonEmptyHandler(resp.Status, ai.VideoStatusCancelled)
		message = firstNonEmptyHandler(resp.Message, message)
	}

	job, err = h.service.MarkCancelled(c.Request.Context(), id, user.ID, providerStatus, message)
	if err != nil {
		h.writeJobActionError(c, err)
		return
	}
	if job.UsageReservationID != nil {
		_ = h.aiService.ReleaseReservation(c.Request.Context(), *job.UsageReservationID, "cancelled by user")
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

	job, releaseReservation, err := h.service.Delete(c.Request.Context(), parseID(c.Param("id")), user.ID)
	if err != nil {
		h.writeJobActionError(c, err)
		return
	}
	if releaseReservation && job.UsageReservationID != nil {
		_ = h.aiService.ReleaseReservation(c.Request.Context(), *job.UsageReservationID, "cancelled by user")
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
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

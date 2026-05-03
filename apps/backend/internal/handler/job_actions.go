package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	jobrunner "github.com/movscript/movscript/internal/job"
	"github.com/movscript/movscript/internal/model"
)

// Retry requeues a failed generation job for manual retry.
func (h *JobHandler) Retry(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var job model.Job
	if err := h.db.First(&job, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if job.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	if job.Status == jobrunner.StatusSucceeded {
		c.JSON(http.StatusConflict, gin.H{"error": "succeeded jobs cannot be retried"})
		return
	}
	if job.Status == jobrunner.StatusRunning {
		c.JSON(http.StatusConflict, gin.H{"error": "running jobs cannot be retried until they fail or time out"})
		return
	}

	now := time.Now()
	maxAttempts := job.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = jobrunner.DefaultMaxAttempts
	}
	if err := h.db.Model(&job).Updates(map[string]any{
		"status":                jobrunner.StatusPending,
		"attempt_count":         0,
		"max_attempts":          maxAttempts,
		"error_msg":             "",
		"next_run_at":           &now,
		"finished_at":           nil,
		"last_heartbeat_at":     nil,
		"output_resource_id":    nil,
		"provider_task_id":      "",
		"provider_task_kind":    "",
		"provider_task_status":  "",
		"provider_task_history": "",
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	jobrunner.MarkRetryScheduled(h.db, &job, "manual retry requested")

	if err := h.db.Preload("OutputResource").First(&job, job.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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

	var job model.Job
	if err := h.db.First(&job, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if job.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	if !isVideoJob(job.JobType) {
		c.JSON(http.StatusConflict, gin.H{"error": "only video generation jobs can be cancelled"})
		return
	}
	switch job.Status {
	case jobrunner.StatusCancelled:
		c.JSON(http.StatusOK, job)
		return
	case jobrunner.StatusSucceeded, jobrunner.StatusFailed:
		c.JSON(http.StatusConflict, gin.H{"error": "finished jobs cannot be cancelled"})
		return
	case jobrunner.StatusPending, jobrunner.StatusRunning:
	default:
		c.JSON(http.StatusConflict, gin.H{"error": "job cannot be cancelled from status " + job.Status})
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

	now := time.Now()
	if err := h.db.Model(&job).Updates(map[string]any{
		"status":               jobrunner.StatusCancelled,
		"provider_task_status": providerStatus,
		"error_msg":            message,
		"next_run_at":          nil,
		"finished_at":          &now,
		"last_heartbeat_at":    &now,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if job.UsageReservationID != nil {
		_ = h.aiService.ReleaseReservation(c.Request.Context(), *job.UsageReservationID, "cancelled by user")
	}
	if err := h.db.Preload("OutputResource").First(&job, job.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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

	var job model.Job
	if err := h.db.First(&job, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if job.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	if job.Status == jobrunner.StatusPending {
		now := time.Now()
		h.db.Model(&job).Updates(map[string]any{
			"status":            jobrunner.StatusCancelled,
			"error_msg":         "cancelled by user",
			"finished_at":       &now,
			"next_run_at":       nil,
			"last_heartbeat_at": &now,
		})
		if job.UsageReservationID != nil {
			_ = h.aiService.ReleaseReservation(c.Request.Context(), *job.UsageReservationID, "cancelled by user")
		}
	} else if job.Status == jobrunner.StatusRunning {
		c.JSON(http.StatusConflict, gin.H{"error": "running jobs must be cancelled before deletion"})
		return
	} else {
		h.db.Delete(&job)
	}
	c.Status(http.StatusNoContent)
}

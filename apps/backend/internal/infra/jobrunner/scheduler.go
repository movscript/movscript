package jobrunner

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
)

// Start launches n worker goroutines. Cancel ctx to stop them gracefully.
func (w *Worker) Start(ctx context.Context, n int) {
	for i := 0; i < n; i++ {
		go w.loop(ctx)
	}
}

func (w *Worker) loop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
			w.processOne(ctx)
		}
	}
}

// processOne atomically claims one pending job and executes it.
func (w *Worker) processOne(ctx context.Context) {
	w.requeueStaleRunningJobs(ctx)

	var job model.Job
	// Atomically claim a pending job using PostgreSQL FOR UPDATE SKIP LOCKED.
	result := w.db.Raw(`
		UPDATE jobs
		SET status='running',
			started_at=NOW(),
			finished_at=NULL,
			next_run_at=NULL,
			attempt_count=attempt_count + CASE WHEN COALESCE(provider_task_id, '') = '' THEN 1 ELSE 0 END,
			last_heartbeat_at=NOW(),
			error_msg='',
			updated_at=NOW()
		WHERE id = (
			SELECT id FROM jobs
			WHERE status='pending'
				AND deleted_at IS NULL
				AND (next_run_at IS NULL OR next_run_at <= NOW())
				AND ((max_attempts <= 0 OR attempt_count < max_attempts) OR COALESCE(provider_task_id, '') <> '')
			ORDER BY COALESCE(next_run_at, created_at), created_at
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		RETURNING *
	`).Scan(&job)

	if result.Error != nil || job.ID == 0 {
		return
	}

	maxAttempts := effectiveMaxAttempts(&job)
	newJobStateMachine(w, &job).enter(StateClaimed, fmt.Sprintf("worker claimed job (attempt %d/%d)", job.AttemptCount, maxAttempts))
	log.Printf("[job] picked job #%d type=%s user=%d attempt=%d/%d", job.ID, job.JobType, job.UserID, job.AttemptCount, maxAttempts)

	if err := w.execute(ctx, &job); err != nil {
		w.completeFailure(&job, err)
	}
}

func (w *Worker) completeFailure(job *model.Job, err error) {
	if err == nil {
		return
	}
	if errors.Is(err, errJobCancelled) || w.isJobCancelled(job.ID) {
		return
	}
	now := time.Now()
	maxAttempts := effectiveMaxAttempts(job)
	if job.AttemptCount < maxAttempts {
		nextRun := now.Add(retryDelay(job.AttemptCount))
		w.db.Model(job).Updates(map[string]any{
			"status":            StatusPending,
			"error_msg":         err.Error(),
			"next_run_at":       &nextRun,
			"last_heartbeat_at": &now,
			"finished_at":       nil,
		})
		newJobStateMachine(w, job).finish(StateRetryScheduled, fmt.Sprintf("retry scheduled at %s", nextRun.Format(time.RFC3339)))
		log.Printf("[job] job #%d failed attempt %d/%d, retry at %s: %v", job.ID, job.AttemptCount, maxAttempts, nextRun.Format(time.RFC3339), err)
		return
	}

	w.db.Model(job).Updates(map[string]any{
		"status":            StatusFailed,
		"error_msg":         err.Error(),
		"finished_at":       &now,
		"next_run_at":       nil,
		"last_heartbeat_at": &now,
	})
	if job.UsageReservationID != nil {
		_ = w.aiService.ReleaseReservation(context.Background(), *job.UsageReservationID, err.Error())
	}
	log.Printf("[job] job #%d failed after %d/%d attempts: %v", job.ID, job.AttemptCount, maxAttempts, err)
}

func (w *Worker) isJobCancelled(jobID uint) bool {
	var status string
	if err := w.db.Model(&model.Job{}).
		Select("status").
		Where("id = ?", jobID).
		Scan(&status).Error; err != nil {
		return false
	}
	return status == StatusCancelled
}

func (w *Worker) abortIfCancelled(ctx context.Context, job *model.Job, sm *jobStateMachine) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if !w.isJobCancelled(job.ID) {
		return nil
	}
	job.Status = StatusCancelled
	sm.cancel("job cancelled")
	return errJobCancelled
}

func (w *Worker) requeueStaleRunningJobs(ctx context.Context) {
	if ctx.Err() != nil {
		return
	}
	threshold := time.Now().Add(-staleRunningTimeout)
	var jobs []model.Job
	if err := w.db.Where(`
		status = ?
		AND deleted_at IS NULL
		AND (last_heartbeat_at IS NULL OR last_heartbeat_at < ?)
	`, StatusRunning, threshold).
		Order("updated_at asc").
		Limit(10).
		Find(&jobs).Error; err != nil {
		log.Printf("[job] stale running scan failed: %v", err)
		return
	}
	if len(jobs) == 0 {
		return
	}

	now := time.Now()
	for i := range jobs {
		job := &jobs[i]
		if job.ProviderTaskID != "" {
			nextRun := now.Add(videoPollInterval)
			msg := fmt.Sprintf("worker heartbeat stale for %s; provider task will be polled again", staleRunningTimeout)
			if err := w.db.Model(job).Updates(map[string]any{
				"status":      StatusPending,
				"error_msg":   msg,
				"next_run_at": &nextRun,
				"finished_at": nil,
			}).Error; err != nil {
				log.Printf("[job] stale provider task job #%d requeue failed: %v", job.ID, err)
				continue
			}
			newJobStateMachine(w, job).finish(StateWaitingProviderTask, msg)
			log.Printf("[job] stale provider task job #%d scheduled for polling", job.ID)
			continue
		}

		maxAttempts := effectiveMaxAttempts(job)
		if job.AttemptCount < maxAttempts {
			msg := fmt.Sprintf("worker heartbeat stale for %s; requeued", staleRunningTimeout)
			if err := w.db.Model(job).Updates(map[string]any{
				"status":      StatusPending,
				"error_msg":   msg,
				"next_run_at": &now,
				"finished_at": nil,
			}).Error; err != nil {
				log.Printf("[job] stale job #%d requeue failed: %v", job.ID, err)
				continue
			}
			newJobStateMachine(w, job).finish(StateRetryScheduled, msg)
			log.Printf("[job] stale running job #%d requeued", job.ID)
			continue
		}

		msg := fmt.Sprintf("worker heartbeat stale for %s; max attempts exhausted", staleRunningTimeout)
		if err := w.db.Model(job).Updates(map[string]any{
			"status":      StatusFailed,
			"error_msg":   msg,
			"finished_at": &now,
			"next_run_at": nil,
		}).Error; err != nil {
			log.Printf("[job] stale job #%d fail update failed: %v", job.ID, err)
			continue
		}
		newJobStateMachine(w, job).fail(fmt.Errorf("%s", msg))
		log.Printf("[job] stale running job #%d marked failed", job.ID)
	}
}

func (w *Worker) heartbeat(ctx context.Context, jobID uint) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now()
			w.db.Model(&model.Job{}).Where("id = ? AND status = ?", jobID, StatusRunning).Update("last_heartbeat_at", &now)
		}
	}
}

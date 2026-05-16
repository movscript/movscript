package runner

import (
	"context"
	"errors"
	"fmt"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"log"
	"time"
)

// Start launches n worker goroutines. Cancel ctx to stop them gracefully.
func (w *Worker) Start(ctx context.Context, n int) {
	go w.reaperLoop(ctx)
	for i := 0; i < n; i++ {
		go w.loop(ctx)
	}
}

func (w *Worker) loop(ctx context.Context) {
	timer := time.NewTimer(0)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			w.processOne(ctx)
			timer.Reset(2 * time.Second)
		}
	}
}

func (w *Worker) reaperLoop(ctx context.Context) {
	timer := time.NewTimer(0)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			w.requeueStaleRunningJobs(ctx)
			timer.Reset(staleReaperInterval)
		}
	}
}

// processOne atomically claims one pending job and executes it.
func (w *Worker) processOne(ctx context.Context) {
	var job persistencemodel.Job
	var err error
	if w.db.Dialector.Name() == "postgres" {
		err = w.claimPostgresJob(&job).Error
	} else {
		err = w.claimLocalJob(&job)
	}

	if err != nil || job.ID == 0 {
		return
	}

	maxAttempts := effectiveMaxAttempts(&job)
	newJobStateMachine(w, &job).enter(StateClaimed, fmt.Sprintf("worker claimed job (attempt %d/%d)", job.AttemptCount, maxAttempts))
	log.Printf("[job] picked job #%d type=%s user=%d attempt=%d/%d", job.ID, job.JobType, job.UserID, job.AttemptCount, maxAttempts)

	if err := w.execute(ctx, &job); err != nil {
		w.completeFailure(&job, err)
	}
}

func (w *Worker) claimPostgresJob(job *persistencemodel.Job) *gorm.DB {
	return w.db.Raw(`
		UPDATE jobs
		SET status='running',
			started_at=NOW(),
			finished_at=NULL,
			next_run_at=NULL,
			attempt_count=attempt_count + CASE WHEN COALESCE(provider_task_id, '') = '' THEN 1 ELSE 0 END,
			locked_by=?,
			lease_until=NOW() + (? * INTERVAL '1 second'),
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
	`, w.workerID, int(leaseDuration.Seconds())).Scan(job)
}

func (w *Worker) claimLocalJob(job *persistencemodel.Job) error {
	now := time.Now()
	return w.db.Transaction(func(tx *gorm.DB) error {
		var candidate persistencemodel.Job
		if err := tx.
			Session(&gorm.Session{Logger: ignoreRecordNotFoundLogger{Interface: tx.Logger}}).
			Where("status = ?", StatusPending).
			Where("deleted_at IS NULL").
			Where("(next_run_at IS NULL OR next_run_at <= ?)", now).
			Where("((max_attempts <= 0 OR attempt_count < max_attempts) OR COALESCE(provider_task_id, '') <> '')").
			Order("COALESCE(next_run_at, created_at), created_at").
			First(&candidate).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}

		updates := map[string]any{
			"status":            StatusRunning,
			"started_at":        &now,
			"finished_at":       nil,
			"next_run_at":       nil,
			"locked_by":         w.workerID,
			"lease_until":       now.Add(leaseDuration),
			"last_heartbeat_at": &now,
			"error_msg":         "",
			"updated_at":        now,
		}
		if candidate.ProviderTaskID == "" {
			updates["attempt_count"] = gorm.Expr("attempt_count + 1")
		}
		result := tx.Model(&persistencemodel.Job{}).
			Where("id = ? AND status = ?", candidate.ID, StatusPending).
			Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return nil
		}
		return tx.First(job, candidate.ID).Error
	})
}

type ignoreRecordNotFoundLogger struct {
	logger.Interface
}

func (l ignoreRecordNotFoundLogger) Trace(ctx context.Context, begin time.Time, fc func() (string, int64), err error) {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return
	}
	l.Interface.Trace(ctx, begin, fc, err)
}

func (w *Worker) completeFailure(job *persistencemodel.Job, err error) {
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
			"locked_by":         "",
			"lease_until":       nil,
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
		"locked_by":         "",
		"lease_until":       nil,
		"last_heartbeat_at": &now,
	})
	if job.UsageReservationID != nil {
		_ = w.aiService.ReleaseReservation(context.Background(), *job.UsageReservationID, err.Error())
	}
	log.Printf("[job] job #%d failed after %d/%d attempts: %v", job.ID, job.AttemptCount, maxAttempts, err)
}

func (w *Worker) isJobCancelled(jobID uint) bool {
	var status string
	if err := w.db.Model(&persistencemodel.Job{}).
		Select("status").
		Where("id = ?", jobID).
		Scan(&status).Error; err != nil {
		return false
	}
	return status == StatusCancelled
}

func (w *Worker) abortIfCancelled(ctx context.Context, job *persistencemodel.Job, sm *jobStateMachine) error {
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
	now := time.Now()
	threshold := now.Add(-staleRunningTimeout)
	var jobs []persistencemodel.Job
	if err := w.db.Where(`
		status = ?
		AND deleted_at IS NULL
		AND (
			lease_until < ?
			OR (lease_until IS NULL AND (last_heartbeat_at IS NULL OR last_heartbeat_at < ?))
		)
	`, StatusRunning, now, threshold).
		Order("updated_at asc").
		Limit(10).
		Find(&jobs).Error; err != nil {
		log.Printf("[job] stale running scan failed: %v", err)
		return
	}
	if len(jobs) == 0 {
		return
	}

	for i := range jobs {
		job := &jobs[i]
		if job.ProviderTaskID != "" {
			nextRun := now.Add(videoPollInterval)
			msg := fmt.Sprintf("worker heartbeat stale for %s; provider task will be polled again", staleRunningTimeout)
			result := w.staleJobUpdate(job, now, threshold, map[string]any{
				"status":      StatusPending,
				"error_msg":   msg,
				"next_run_at": &nextRun,
				"locked_by":   "",
				"lease_until": nil,
				"finished_at": nil,
			})
			if result.Error != nil {
				log.Printf("[job] stale provider task job #%d requeue failed: %v", job.ID, result.Error)
				continue
			}
			if result.RowsAffected == 0 {
				continue
			}
			newJobStateMachine(w, job).finish(StateWaitingProviderTask, msg)
			log.Printf("[job] stale provider task job #%d scheduled for polling", job.ID)
			continue
		}

		maxAttempts := effectiveMaxAttempts(job)
		if job.AttemptCount < maxAttempts {
			msg := fmt.Sprintf("worker heartbeat stale for %s; requeued", staleRunningTimeout)
			result := w.staleJobUpdate(job, now, threshold, map[string]any{
				"status":      StatusPending,
				"error_msg":   msg,
				"next_run_at": &now,
				"locked_by":   "",
				"lease_until": nil,
				"finished_at": nil,
			})
			if result.Error != nil {
				log.Printf("[job] stale job #%d requeue failed: %v", job.ID, result.Error)
				continue
			}
			if result.RowsAffected == 0 {
				continue
			}
			newJobStateMachine(w, job).finish(StateRetryScheduled, msg)
			log.Printf("[job] stale running job #%d requeued", job.ID)
			continue
		}

		msg := fmt.Sprintf("worker heartbeat stale for %s; max attempts exhausted", staleRunningTimeout)
		result := w.staleJobUpdate(job, now, threshold, map[string]any{
			"status":      StatusFailed,
			"error_msg":   msg,
			"finished_at": &now,
			"next_run_at": nil,
			"locked_by":   "",
			"lease_until": nil,
		})
		if result.Error != nil {
			log.Printf("[job] stale job #%d fail update failed: %v", job.ID, result.Error)
			continue
		}
		if result.RowsAffected == 0 {
			continue
		}
		newJobStateMachine(w, job).fail(fmt.Errorf("%s", msg))
		log.Printf("[job] stale running job #%d marked failed", job.ID)
	}
}

func (w *Worker) staleJobUpdate(job *persistencemodel.Job, now time.Time, threshold time.Time, updates map[string]any) *gorm.DB {
	return w.db.Model(job).
		Where(`
			status = ?
			AND (
				lease_until < ?
				OR (lease_until IS NULL AND (last_heartbeat_at IS NULL OR last_heartbeat_at < ?))
			)
		`, StatusRunning, now, threshold).
		Updates(updates)
}

func (w *Worker) heartbeat(ctx context.Context, jobID uint) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_, _ = w.renewLease(jobID)
		}
	}
}

func (w *Worker) renewLease(jobID uint) (int64, error) {
	now := time.Now()
	leaseUntil := now.Add(leaseDuration)
	result := w.db.Model(&persistencemodel.Job{}).
		Where("id = ? AND status = ? AND locked_by = ?", jobID, StatusRunning, w.workerID).
		Updates(map[string]any{
			"last_heartbeat_at": &now,
			"lease_until":       &leaseUntil,
		})
	return result.RowsAffected, result.Error
}

package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"log"
	"strings"
	"time"
)

func (w *Worker) usageContext(job *persistencemodel.Job) ai.UsageContext {
	return ai.UsageContext{
		OrgID:         job.OrgID,
		ProjectID:     job.ProjectID,
		JobID:         &job.ID,
		ReservationID: job.UsageReservationID,
	}
}

type providerTaskEvent struct {
	Action    string    `json:"action"`
	TaskID    string    `json:"task_id,omitempty"`
	TaskKind  string    `json:"task_kind,omitempty"`
	Status    string    `json:"status,omitempty"`
	Message   string    `json:"message,omitempty"`
	ResultURL string    `json:"result_url,omitempty"`
	Error     string    `json:"error,omitempty"`
	At        time.Time `json:"at"`
}

func (w *Worker) appendProviderTaskEvent(job *persistencemodel.Job, action string, resp ai.VideoResponse, err error) {
	var history []providerTaskEvent
	if job.ProviderTaskHistory != "" {
		_ = json.Unmarshal([]byte(job.ProviderTaskHistory), &history)
	}
	event := providerTaskEvent{
		Action:    action,
		TaskID:    firstNonEmpty(resp.TaskID, job.ProviderTaskID),
		TaskKind:  firstNonEmpty(resp.TaskKind, job.ProviderTaskKind),
		Status:    resp.Status,
		Message:   resp.Message,
		ResultURL: resp.URL,
		At:        time.Now(),
	}
	if err != nil {
		event.Error = err.Error()
	}
	history = append(history, event)
	if len(history) > 200 {
		history = history[len(history)-200:]
	}
	if b, marshalErr := json.Marshal(history); marshalErr == nil {
		job.ProviderTaskHistory = string(b)
		updates := map[string]any{
			"provider_task_history": job.ProviderTaskHistory,
		}
		if event.TaskID != "" {
			job.ProviderTaskID = event.TaskID
			updates["provider_task_id"] = event.TaskID
		}
		if event.TaskKind != "" {
			job.ProviderTaskKind = event.TaskKind
			updates["provider_task_kind"] = event.TaskKind
		}
		if event.Status != "" {
			job.ProviderTaskStatus = event.Status
			updates["provider_task_status"] = event.Status
		}
		w.db.Model(job).Updates(updates)
	}
}

func (w *Worker) scheduleSubmittedProviderTask(job *persistencemodel.Job, resp ai.VideoResponse, sm *jobStateMachine) {
	nextRun := time.Now().Add(videoPollInterval)
	status := firstNonEmpty(resp.Status, ai.VideoStatusSubmitted)
	updates := map[string]any{
		"status":               StatusPending,
		"provider_task_id":     resp.TaskID,
		"provider_task_kind":   resp.TaskKind,
		"provider_task_status": status,
		"next_run_at":          &nextRun,
		"locked_by":            "",
		"lease_until":          nil,
		"finished_at":          nil,
		"error_msg":            "",
	}
	result := w.db.Model(job).Where("status <> ?", StatusCancelled).Updates(updates)
	if result.RowsAffected == 0 && w.isJobCancelled(job.ID) {
		sm.cancel("job cancelled")
		return
	}
	job.ProviderTaskID = resp.TaskID
	job.ProviderTaskKind = resp.TaskKind
	job.ProviderTaskStatus = status
	sm.finish(StateWaitingProviderTask, fmt.Sprintf("provider task %s accepted; next poll at %s", resp.TaskID, nextRun.Format(time.RFC3339)))
	log.Printf("[job] job #%d submitted provider task %s; poll at %s", job.ID, resp.TaskID, nextRun.Format(time.RFC3339))
}

func (w *Worker) scheduleProviderPoll(job *persistencemodel.Job, message string, sm *jobStateMachine) {
	nextRun := time.Now().Add(videoPollInterval)
	updates := map[string]any{
		"status":      StatusPending,
		"error_msg":   message,
		"next_run_at": &nextRun,
		"locked_by":   "",
		"lease_until": nil,
		"finished_at": nil,
	}
	result := w.db.Model(job).Where("status <> ?", StatusCancelled).Updates(updates)
	if result.RowsAffected == 0 && w.isJobCancelled(job.ID) {
		sm.cancel("job cancelled")
		return
	}
	sm.finish(StateWaitingProviderTask, fmt.Sprintf("%s; next poll at %s", firstNonEmpty(message, "provider task still running"), nextRun.Format(time.RFC3339)))
	log.Printf("[job] job #%d provider task %s pending; next poll at %s", job.ID, job.ProviderTaskID, nextRun.Format(time.RFC3339))
}

func (w *Worker) markProviderTaskFailed(job *persistencemodel.Job, resp ai.VideoResponse, err error) {
	now := time.Now()
	msg := firstNonEmpty(resp.Message)
	if msg == "" && err != nil {
		msg = err.Error()
	}
	if msg == "" {
		msg = "video generation failed"
	}
	w.db.Model(job).Updates(map[string]any{
		"status":               StatusFailed,
		"provider_task_status": ai.VideoStatusFailed,
		"error_msg":            msg,
		"finished_at":          &now,
		"next_run_at":          nil,
		"locked_by":            "",
		"lease_until":          nil,
		"last_heartbeat_at":    &now,
	})
	if job.UsageReservationID != nil {
		_ = w.aiService.ReleaseReservation(context.Background(), *job.UsageReservationID, msg)
	}
	log.Printf("[job] job #%d provider task %s failed: %s", job.ID, job.ProviderTaskID, msg)
}

func (w *Worker) markProviderTaskCancelled(job *persistencemodel.Job, resp ai.VideoResponse, message string) {
	now := time.Now()
	msg := firstNonEmpty(message, resp.Message, "video generation cancelled")
	w.db.Model(job).Updates(map[string]any{
		"status":               StatusCancelled,
		"provider_task_status": ai.VideoStatusCancelled,
		"error_msg":            msg,
		"finished_at":          &now,
		"next_run_at":          nil,
		"locked_by":            "",
		"lease_until":          nil,
		"last_heartbeat_at":    &now,
	})
	if job.UsageReservationID != nil {
		_ = w.aiService.ReleaseReservation(context.Background(), *job.UsageReservationID, msg)
	}
	log.Printf("[job] job #%d provider task %s cancelled: %s", job.ID, job.ProviderTaskID, msg)
}

func (w *Worker) cancelProviderTask(ctx context.Context, job *persistencemodel.Job, taskID, taskKind string) (ai.VideoResponse, error) {
	if taskID == "" {
		return ai.VideoResponse{}, nil
	}
	if !w.aiService.SupportsVideoTaskCancellation(job.ModelConfigID) {
		return ai.VideoResponse{TaskID: taskID, TaskKind: taskKind}, fmt.Errorf("provider does not support video task cancellation")
	}
	cancelCtx, cancel := context.WithTimeout(ctx, providerPollTimeout)
	defer cancel()
	resp, err := w.aiService.CallVideoCancel(cancelCtx, job.ModelConfigID, taskID, taskKind)
	if err != nil {
		return resp, err
	}
	return resp, nil
}

func (w *Worker) completeVideoSuccess(ctx context.Context, job *persistencemodel.Job, resp ai.VideoResponse, sm *jobStateMachine, debugResult *ai.DebugCallResult) error {
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
		return err
	}
	var resourceID uint
	var err error
	if len(resp.ContentBytes) > 0 {
		sm.enter(StateSavingResult, "store provider bytes")
		resourceID, err = w.saveBytes(ctx, job, resp.ContentBytes, "video/mp4")
	} else {
		resultURL := strings.TrimSpace(resp.URL)
		if resultURL == "" {
			return fmt.Errorf("no video URL returned by provider")
		}
		sm.enter(StateValidatingProviderData, "validate provider result URL")
		if err := validateProviderResultURL(resultURL); err != nil {
			return err
		}
		sm.succeed("provider returned downloadable result")
		sm.enter(StateSavingResult, "download and store provider result")
		resourceID, err = w.saveResult(ctx, job, resultURL, "video/mp4")
	}
	if err != nil {
		return fmt.Errorf("save result: %w", err)
	}
	sm.succeed(fmt.Sprintf("stored resource #%d", resourceID))

	sm.enter(StatePersistingSuccess, "mark job succeeded")
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
		return err
	}
	now := time.Now()
	updates := map[string]any{
		"status":               StatusSucceeded,
		"provider_task_status": firstNonEmpty(resp.Status, ai.VideoStatusSucceeded),
		"output_resource_id":   resourceID,
		"finished_at":          &now,
		"next_run_at":          nil,
		"locked_by":            "",
		"lease_until":          nil,
	}
	if resp.TaskID != "" {
		updates["provider_task_id"] = resp.TaskID
	}
	if resp.TaskKind != "" {
		updates["provider_task_kind"] = resp.TaskKind
	}
	if debugResult != nil {
		if b, err := json.Marshal(debugResult); err == nil {
			updates["debug_info"] = string(b)
		}
	}
	result := w.db.Model(job).Where("status <> ?", StatusCancelled).Updates(updates)
	if result.RowsAffected == 0 && w.isJobCancelled(job.ID) {
		sm.cancel("job cancelled")
		return errJobCancelled
	}
	sm.succeed("job marked succeeded")
	sm.finish(StateSucceeded, fmt.Sprintf("resource #%d", resourceID))
	log.Printf("[job] job #%d succeeded → resource #%d", job.ID, resourceID)
	return nil
}

func (w *Worker) completeProviderResult(ctx context.Context, job *persistencemodel.Job, result providerResult, sm *jobStateMachine, debugResult *ai.DebugCallResult) error {
	sm.enter(StateValidatingProviderData, "validate provider result URL")
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
		return err
	}
	result.URL = strings.TrimSpace(result.URL)
	if err := validateProviderResultURL(result.URL); err != nil {
		return err
	}
	sm.succeed("provider returned downloadable result")

	sm.enter(StateSavingResult, "download and store provider result")
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
		return err
	}
	resourceID, err := w.saveResult(ctx, job, result.URL, result.MimeType)
	if err != nil {
		return fmt.Errorf("save result: %w", err)
	}
	sm.succeed(fmt.Sprintf("stored resource #%d", resourceID))

	sm.enter(StatePersistingSuccess, "mark job succeeded")
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
		return err
	}
	now := time.Now()
	updates := map[string]any{
		"status":             StatusSucceeded,
		"output_resource_id": resourceID,
		"finished_at":        &now,
		"locked_by":          "",
		"lease_until":        nil,
	}
	if debugResult != nil {
		if b, err := json.Marshal(debugResult); err == nil {
			updates["debug_info"] = string(b)
		}
	}
	dbResult := w.db.Model(job).Where("status <> ?", StatusCancelled).Updates(updates)
	if dbResult.RowsAffected == 0 && w.isJobCancelled(job.ID) {
		sm.cancel("job cancelled")
		return errJobCancelled
	}
	sm.succeed("job marked succeeded")
	sm.finish(StateSucceeded, fmt.Sprintf("resource #%d", resourceID))
	log.Printf("[job] job #%d succeeded → resource #%d", job.ID, resourceID)
	return nil
}

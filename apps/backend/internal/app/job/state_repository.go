package job

import (
	"encoding/json"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

func MarkRetryScheduled(db *gorm.DB, job *model.Job, message string) {
	if db == nil || job == nil {
		return
	}
	var trace []StateTraceEntry
	if job.StateTrace != "" {
		_ = json.Unmarshal([]byte(job.StateTrace), &trace)
	}
	now := time.Now()
	trace = append(trace, StateTraceEntry{
		State:      StateRetryScheduled,
		Status:     StatusSucceeded,
		Message:    message,
		StartedAt:  now,
		FinishedAt: &now,
	})
	b, err := json.Marshal(trace)
	if err != nil {
		return
	}
	job.ExecutionState = string(StateRetryScheduled)
	job.StateTrace = string(b)
	job.LastHeartbeatAt = &now
	db.Model(job).Updates(map[string]any{
		"execution_state":   string(StateRetryScheduled),
		"state_trace":       string(b),
		"last_heartbeat_at": &now,
	})
}

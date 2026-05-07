package job

import "github.com/movscript/movscript/internal/domain/model"

func JobFromModel(job model.Job) Job {
	return Job{
		ID:                 job.ID,
		UserID:             job.UserID,
		OrgID:              job.OrgID,
		ModelConfigID:      job.ModelConfigID,
		JobType:            job.JobType,
		FeatureKey:         job.FeatureKey,
		Status:             job.Status,
		AttemptCount:       job.AttemptCount,
		MaxAttempts:        job.MaxAttempts,
		NextRunAt:          job.NextRunAt,
		Prompt:             job.Prompt,
		ExtraParams:        job.ExtraParams,
		AspectRatio:        job.AspectRatio,
		Duration:           job.Duration,
		RequestContext:     job.RequestContext,
		InputResourceID:    job.InputResourceID,
		InputResourceIDs:   job.InputResourceIDs,
		OutputResourceID:   job.OutputResourceID,
		UsageReservationID: job.UsageReservationID,
		ProviderTaskID:     job.ProviderTaskID,
		ProviderTaskKind:   job.ProviderTaskKind,
		ProviderTaskStatus: job.ProviderTaskStatus,
		ErrorMsg:           job.ErrorMsg,
		DebugInfo:          job.DebugInfo,
		ExecutionState:     job.ExecutionState,
		LockedBy:           job.LockedBy,
		LeaseUntil:         job.LeaseUntil,
		LastHeartbeatAt:    job.LastHeartbeatAt,
		StartedAt:          job.StartedAt,
		FinishedAt:         job.FinishedAt,
		ProjectID:          job.ProjectID,
	}
}

func (job Job) ToModel() model.Job {
	var target model.Job
	job.ApplyToModel(&target)
	return target
}

func (job Job) ApplyToModel(target *model.Job) {
	target.Model.ID = job.ID
	target.UserID = job.UserID
	target.OrgID = job.OrgID
	target.ModelConfigID = job.ModelConfigID
	target.JobType = job.JobType
	target.FeatureKey = job.FeatureKey
	target.Status = job.Status
	target.AttemptCount = job.AttemptCount
	target.MaxAttempts = job.MaxAttempts
	target.NextRunAt = job.NextRunAt
	target.Prompt = job.Prompt
	target.ExtraParams = job.ExtraParams
	target.AspectRatio = job.AspectRatio
	target.Duration = job.Duration
	target.RequestContext = job.RequestContext
	target.InputResourceID = job.InputResourceID
	target.InputResourceIDs = job.InputResourceIDs
	target.OutputResourceID = job.OutputResourceID
	target.UsageReservationID = job.UsageReservationID
	target.ProviderTaskID = job.ProviderTaskID
	target.ProviderTaskKind = job.ProviderTaskKind
	target.ProviderTaskStatus = job.ProviderTaskStatus
	target.ErrorMsg = job.ErrorMsg
	target.DebugInfo = job.DebugInfo
	target.ExecutionState = job.ExecutionState
	target.LockedBy = job.LockedBy
	target.LeaseUntil = job.LeaseUntil
	target.LastHeartbeatAt = job.LastHeartbeatAt
	target.StartedAt = job.StartedAt
	target.FinishedAt = job.FinishedAt
	target.ProjectID = job.ProjectID
}

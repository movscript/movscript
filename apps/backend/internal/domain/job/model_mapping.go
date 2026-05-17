package job

import (
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func JobFromModel(job persistencemodel.Job) Job {
	domainJob := Job{
		ID:                  job.ID,
		UserID:              job.UserID,
		OrgID:               job.OrgID,
		ModelConfigID:       job.ModelConfigID,
		JobType:             job.JobType,
		FeatureKey:          job.FeatureKey,
		Title:               job.Title,
		Status:              job.Status,
		AttemptCount:        job.AttemptCount,
		MaxAttempts:         job.MaxAttempts,
		NextRunAt:           job.NextRunAt,
		Prompt:              job.Prompt,
		ExtraParams:         job.ExtraParams,
		AspectRatio:         job.AspectRatio,
		Duration:            job.Duration,
		RequestContext:      job.RequestContext,
		InputResourceID:     job.InputResourceID,
		InputResourceIDs:    job.InputResourceIDs,
		OutputResourceID:    job.OutputResourceID,
		UsageReservationID:  job.UsageReservationID,
		ProviderTaskID:      job.ProviderTaskID,
		ProviderTaskKind:    job.ProviderTaskKind,
		ProviderTaskStatus:  job.ProviderTaskStatus,
		ErrorMsg:            job.ErrorMsg,
		DebugInfo:           job.DebugInfo,
		ExecutionState:      job.ExecutionState,
		LockedBy:            job.LockedBy,
		LeaseUntil:          job.LeaseUntil,
		LastHeartbeatAt:     job.LastHeartbeatAt,
		StartedAt:           job.StartedAt,
		FinishedAt:          job.FinishedAt,
		ProjectID:           job.ProjectID,
		ProviderTaskHistory: job.ProviderTaskHistory,
		StateTrace:          job.StateTrace,
		CreatedAt:           job.CreatedAt,
		UpdatedAt:           job.UpdatedAt,
	}
	if job.DeletedAt.Valid {
		deletedAt := job.DeletedAt.Time
		domainJob.DeletedAt = &deletedAt
	}
	if job.OutputResource != nil {
		resource := RawResourceFromModel(*job.OutputResource)
		domainJob.OutputResource = &resource
	}
	return domainJob
}

func (job Job) ToModel() persistencemodel.Job {
	var target persistencemodel.Job
	job.ApplyToModel(&target)
	return target
}

func (job Job) ApplyToModel(target *persistencemodel.Job) {
	target.Model.ID = job.ID
	target.UserID = job.UserID
	target.OrgID = job.OrgID
	target.ModelConfigID = job.ModelConfigID
	target.JobType = job.JobType
	target.FeatureKey = job.FeatureKey
	target.Title = job.Title
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
	target.ProviderTaskHistory = job.ProviderTaskHistory
	target.StateTrace = job.StateTrace
	target.CreatedAt = job.CreatedAt
	target.UpdatedAt = job.UpdatedAt
	if job.DeletedAt != nil {
		target.DeletedAt.Time = *job.DeletedAt
		target.DeletedAt.Valid = true
	}
	if job.OutputResource != nil {
		resource := job.OutputResource.ToModel()
		target.OutputResource = &resource
	}
}

func JobsFromModels(jobs []persistencemodel.Job) []Job {
	out := make([]Job, 0, len(jobs))
	for _, job := range jobs {
		out = append(out, JobFromModel(job))
	}
	return out
}

func RawResourceFromModel(resource persistencemodel.RawResource) RawResource {
	domainResource := RawResource{
		ID:                   resource.ID,
		OwnerID:              resource.OwnerID,
		OrgID:                resource.OrgID,
		FolderID:             resource.FolderID,
		Type:                 resource.Type,
		Name:                 resource.Name,
		URL:                  resource.URL,
		Size:                 resource.Size,
		MimeType:             resource.MimeType,
		StorageBackend:       resource.StorageBackend,
		StorageKey:           resource.StorageKey,
		IsShared:             resource.IsShared,
		DirectURL:            resource.DirectURL,
		VerificationStatus:   resource.VerificationStatus,
		VerificationRef:      resource.VerificationRef,
		VerifiedAt:           resource.VerifiedAt,
		VerificationProvider: resource.VerificationProvider,
		VerificationError:    resource.VerificationError,
		CreatedAt:            resource.CreatedAt,
		UpdatedAt:            resource.UpdatedAt,
	}
	if resource.DeletedAt.Valid {
		deletedAt := resource.DeletedAt.Time
		domainResource.DeletedAt = &deletedAt
	}
	return domainResource
}

func (resource RawResource) ToModel() persistencemodel.RawResource {
	var target persistencemodel.RawResource
	resource.ApplyToModel(&target)
	return target
}

func (resource RawResource) ApplyToModel(target *persistencemodel.RawResource) {
	target.Model.ID = resource.ID
	target.OwnerID = resource.OwnerID
	target.OrgID = resource.OrgID
	target.FolderID = resource.FolderID
	target.Type = resource.Type
	target.Name = resource.Name
	target.URL = resource.URL
	target.Size = resource.Size
	target.MimeType = resource.MimeType
	target.StorageBackend = resource.StorageBackend
	target.StorageKey = resource.StorageKey
	target.IsShared = resource.IsShared
	target.DirectURL = resource.DirectURL
	target.VerificationStatus = resource.VerificationStatus
	target.VerificationRef = resource.VerificationRef
	target.VerifiedAt = resource.VerifiedAt
	target.VerificationProvider = resource.VerificationProvider
	target.VerificationError = resource.VerificationError
	target.CreatedAt = resource.CreatedAt
	target.UpdatedAt = resource.UpdatedAt
	if resource.DeletedAt != nil {
		target.DeletedAt.Time = *resource.DeletedAt
		target.DeletedAt.Valid = true
	}
}

func RawResourcesFromModels(resources []persistencemodel.RawResource) []RawResource {
	out := make([]RawResource, 0, len(resources))
	for _, resource := range resources {
		out = append(out, RawResourceFromModel(resource))
	}
	return out
}

func InputResourcesFromRawResources(resources []RawResource) []InputResource {
	out := make([]InputResource, 0, len(resources))
	for _, resource := range resources {
		out = append(out, InputResource{
			ID:                   resource.ID,
			Name:                 resource.Name,
			Type:                 resource.Type,
			MimeType:             resource.MimeType,
			Size:                 resource.Size,
			VerificationStatus:   resource.VerificationStatus,
			VerificationRef:      resource.VerificationRef,
			VerifiedAt:           resource.VerifiedAt,
			VerificationProvider: resource.VerificationProvider,
			VerificationError:    resource.VerificationError,
		})
	}
	return out
}

func AICredentialFromModel(credential persistencemodel.AICredential) AICredential {
	domainCredential := AICredential{
		ID:                credential.ID,
		AdapterType:       credential.AdapterType,
		DisplayName:       credential.DisplayName,
		BaseURL:           credential.BaseURL,
		MaskedKey:         credential.MaskedKey,
		IsEnabled:         credential.IsEnabled,
		OrgID:             credential.OrgID,
		FilesAPIEnabled:   credential.FilesAPIEnabled,
		FilesAPIBaseURL:   credential.FilesAPIBaseURL,
		FilesAPIMaskedKey: credential.FilesAPIMaskedKey,
		CreatedAt:         credential.CreatedAt,
		UpdatedAt:         credential.UpdatedAt,
	}
	if credential.DeletedAt.Valid {
		deletedAt := credential.DeletedAt.Time
		domainCredential.DeletedAt = &deletedAt
	}
	return domainCredential
}

func AIModelConfigFromModel(config persistencemodel.AIModelConfig) AIModelConfig {
	domainConfig := AIModelConfig{
		ID:                    config.ID,
		CredentialID:          config.CredentialID,
		ModelDefID:            config.ModelDefID,
		ModelIDOverride:       config.ModelIDOverride,
		IsEnabled:             config.IsEnabled,
		Priority:              config.Priority,
		CapacityWeight:        config.CapacityWeight,
		MaxConcurrency:        config.MaxConcurrency,
		CreditsInputPer1M:     config.CreditsInputPer1M,
		CreditsOutputPer1M:    config.CreditsOutputPer1M,
		CreditsPerImage:       config.CreditsPerImage,
		CreditsPerSecond:      config.CreditsPerSecond,
		CreditsPerCall:        config.CreditsPerCall,
		CustomDisplayName:     config.CustomDisplayName,
		ShortName:             config.ShortName,
		CustomCapabilities:    config.CustomCapabilities,
		CustomPricingMode:     config.CustomPricingMode,
		CustomAcceptsImage:    config.CustomAcceptsImage,
		CustomMaxInputImages:  config.CustomMaxInputImages,
		CustomMaxInputVideos:  config.CustomMaxInputVideos,
		CustomImageEditField:  config.CustomImageEditField,
		CustomSupportedParams: config.CustomSupportedParams,
		CreatedAt:             config.CreatedAt,
		UpdatedAt:             config.UpdatedAt,
	}
	if config.DeletedAt.Valid {
		deletedAt := config.DeletedAt.Time
		domainConfig.DeletedAt = &deletedAt
	}
	return domainConfig
}

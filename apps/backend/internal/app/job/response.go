package job

import (
	"context"
	"strings"
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
)

type Response struct {
	ID                  uint                    `json:"ID"`
	UserID              uint                    `json:"user_id"`
	OrgID               *uint                   `json:"org_id,omitempty"`
	ModelID             string                  `json:"model_id,omitempty"`
	ProviderName        string                  `json:"provider_name,omitempty"`
	ModelDisplay        string                  `json:"model_display,omitempty"`
	ModelIdentifier     string                  `json:"model_identifier,omitempty"`
	RouteGroup          string                  `json:"route_group,omitempty"`
	JobType             string                  `json:"job_type"`
	FeatureKey          string                  `json:"feature_key,omitempty"`
	Title               string                  `json:"title,omitempty"`
	Status              string                  `json:"status"`
	AttemptCount        int                     `json:"attempt_count"`
	MaxAttempts         int                     `json:"max_attempts"`
	NextRunAt           *time.Time              `json:"next_run_at,omitempty"`
	Prompt              string                  `json:"prompt"`
	ExtraParams         string                  `json:"extra_params,omitempty"`
	AspectRatio         string                  `json:"aspect_ratio,omitempty"`
	Duration            int                     `json:"duration,omitempty"`
	RequestContext      string                  `json:"request_context,omitempty"`
	InputResourceID     *uint                   `json:"input_resource_id,omitempty"`
	InputResourceIDs    string                  `json:"input_resource_ids,omitempty"`
	InputResources      []domainjob.RawResource `json:"input_resources,omitempty"`
	OutputResourceID    *uint                   `json:"output_resource_id,omitempty"`
	UsageReservationID  *uint                   `json:"usage_reservation_id,omitempty"`
	ProviderTaskID      string                  `json:"provider_task_id,omitempty"`
	ProviderTaskKind    string                  `json:"provider_task_kind,omitempty"`
	ProviderTaskStatus  string                  `json:"provider_task_status,omitempty"`
	ProviderTaskHistory string                  `json:"provider_task_history,omitempty"`
	ErrorMsg            string                  `json:"error_msg,omitempty"`
	DebugInfo           string                  `json:"debug_info,omitempty"`
	ExecutionState      string                  `json:"execution_state,omitempty"`
	StateTrace          string                  `json:"state_trace,omitempty"`
	StartedAt           *time.Time              `json:"started_at,omitempty"`
	FinishedAt          *time.Time              `json:"finished_at,omitempty"`
	ProjectID           *uint                   `json:"project_id,omitempty"`
	OutputResource      *domainjob.RawResource  `json:"output_resource,omitempty"`
	CreatedAt           time.Time               `json:"CreatedAt"`
	UpdatedAt           time.Time               `json:"UpdatedAt"`
}

type ResourceURLFunc func(uint) string

func (s *Service) BuildResponses(ctx context.Context, jobs []domainjob.Job, resourceURL ResourceURLFunc) []Response {
	if len(jobs) == 0 {
		return []Response{}
	}

	resourceIDSet := make(map[uint]bool)
	modelConfigIDSet := make(map[uint]bool)
	catalogEntryIDSet := make(map[uint]bool)
	for i := range jobs {
		if jobs[i].OutputResource != nil && resourceURL != nil {
			jobs[i].OutputResource.URL = resourceURL(jobs[i].OutputResource.ID)
		}
		modelConfigIDSet[jobs[i].ModelConfigID] = true
		if jobs[i].AIModelCatalogEntryID != nil && *jobs[i].AIModelCatalogEntryID != 0 {
			catalogEntryIDSet[*jobs[i].AIModelCatalogEntryID] = true
		}
		for _, id := range ParseInputIDs(jobs[i]) {
			resourceIDSet[id] = true
		}
	}

	resourceIDs := make([]uint, 0, len(resourceIDSet))
	for id := range resourceIDSet {
		resourceIDs = append(resourceIDs, id)
	}

	modelConfigIDs := make([]uint, 0, len(modelConfigIDSet))
	for id := range modelConfigIDSet {
		modelConfigIDs = append(modelConfigIDs, id)
	}
	for id := range catalogEntryIDSet {
		modelConfigIDs = append(modelConfigIDs, id)
	}

	lookups, err := s.ResponseLookups(ctx, resourceIDs, modelConfigIDs)
	if err != nil {
		return []Response{}
	}
	if resourceURL != nil {
		for id, resource := range lookups.ResourcesByID {
			resource.URL = resourceURL(resource.ID)
			lookups.ResourcesByID[id] = resource
		}
	}

	resp := make([]Response, 0, len(jobs))
	for _, job := range jobs {
		item := responseFromJob(job)
		inputIDs := ParseInputIDs(job)
		item.InputResources = make([]domainjob.RawResource, 0, len(inputIDs))
		seenResources := make(map[uint]bool, len(inputIDs))
		for _, id := range inputIDs {
			if seenResources[id] {
				continue
			}
			seenResources[id] = true
			if r, ok := lookups.ResourcesByID[id]; ok {
				item.InputResources = append(item.InputResources, r)
			}
		}
		if catalogID := jobCatalogEntryID(job); catalogID != 0 {
			if entry, ok := lookups.CatalogEntriesByID[catalogID]; ok {
				item.ModelDisplay = catalogEntryDisplay(entry)
				item.ModelIdentifier = catalogEntryIdentifier(entry)
				item.ModelID = catalogEntryIdentifier(entry)
			}
		}
		if item.ModelDisplay != "" {
			resp = append(resp, item)
			continue
		}
		if cfg, ok := lookups.ConfigsByID[job.ModelConfigID]; ok {
			item.ModelDisplay = ModelDisplay(cfg)
			item.ModelIdentifier = ModelIdentifier(cfg)
			item.ModelID = ModelIdentifier(cfg)
			if cred, ok := lookups.CredentialsByID[cfg.CredentialID]; ok {
				item.ProviderName = cred.DisplayName
			}
		} else if entry, ok := lookups.CatalogEntriesByID[job.ModelConfigID]; ok {
			item.ModelDisplay = catalogEntryDisplay(entry)
			item.ModelIdentifier = catalogEntryIdentifier(entry)
			item.ModelID = catalogEntryIdentifier(entry)
		}
		resp = append(resp, item)
	}
	return resp
}

func responseFromJob(job domainjob.Job) Response {
	return Response{
		ID:                  job.ID,
		UserID:              job.UserID,
		OrgID:               job.OrgID,
		RouteGroup:          job.RouteGroup,
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
		ProviderTaskHistory: job.ProviderTaskHistory,
		ErrorMsg:            job.ErrorMsg,
		DebugInfo:           job.DebugInfo,
		ExecutionState:      job.ExecutionState,
		StateTrace:          job.StateTrace,
		StartedAt:           job.StartedAt,
		FinishedAt:          job.FinishedAt,
		ProjectID:           job.ProjectID,
		OutputResource:      job.OutputResource,
		CreatedAt:           job.CreatedAt,
		UpdatedAt:           job.UpdatedAt,
	}
}

func jobCatalogEntryID(job domainjob.Job) uint {
	if job.AIModelCatalogEntryID != nil {
		return *job.AIModelCatalogEntryID
	}
	return 0
}

func catalogEntryDisplay(entry ModelCatalogEntryLookup) string {
	for _, value := range []string{entry.DisplayName, entry.ShortName, entry.PublicModelID, entry.ProviderModelID} {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return "model"
}

func catalogEntryIdentifier(entry ModelCatalogEntryLookup) string {
	for _, value := range []string{entry.PublicModelID, entry.ProviderModelID} {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return catalogEntryDisplay(entry)
}

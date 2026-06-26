package job

import (
	"encoding/json"
	"errors"
	"strconv"
	"time"
)

const (
	CapabilityImage          = "image"
	CapabilityImageEdit      = "image_edit"
	CapabilityVideo          = "video"
	CapabilityVideoI2V       = "video_i2v"
	CapabilityVideoV2V       = "video_v2v"
	CapabilityAudioTTS       = "audio_tts"
	CapabilityAudioSTT       = "audio_transcribe"
	CapabilityAudioMusic     = "audio_music"
	CapabilityAudioSFX       = "audio_sfx"
	CapabilityAudioChat      = "audio_chat"
	CapabilityVoiceClone     = "voice_clone"
	CapabilityVoiceDesign    = "voice_design"
	CapabilityAudioTranslate = "audio_translate"
	CapabilitySubAlign       = "subtitle_align"
	CapabilitySubTranslate   = "subtitle_translate"
)

type RuntimeModelSnapshotInput struct {
	ID                uint
	CustomDisplayName string
	ModelIDOverride   string
	ModelDefID        string
	CredentialID      uint
}

type RouteSnapshotInput struct {
	ModelID         string
	CatalogEntryID  uint
	RouteBindingID  uint
	ProviderID      string
	ProviderKind    string
	AdapterKey      string
	ProviderModelID string
	SourceType      string
	RouteGroup      string
	APIKind         string
	SelectionReason string
}

type CredentialInput struct {
	DisplayName string
}

type AICredential struct {
	ID                uint       `json:"ID"`
	AdapterType       string     `json:"adapter_type"`
	DisplayName       string     `json:"display_name"`
	BaseURL           string     `json:"base_url"`
	MaskedKey         string     `json:"masked_key"`
	IsEnabled         bool       `json:"is_enabled"`
	OrgID             *uint      `json:"org_id,omitempty"`
	FilesAPIEnabled   bool       `json:"files_api_enabled"`
	FilesAPIBaseURL   string     `json:"files_api_base_url"`
	FilesAPIMaskedKey string     `json:"files_api_masked_key"`
	CreatedAt         time.Time  `json:"CreatedAt"`
	UpdatedAt         time.Time  `json:"UpdatedAt"`
	DeletedAt         *time.Time `json:"DeletedAt"`
}

type RawResource struct {
	ID                        uint           `json:"ID"`
	OwnerID                   uint           `json:"owner_id"`
	OrgID                     *uint          `json:"org_id,omitempty"`
	FolderID                  *uint          `json:"folder_id,omitempty"`
	Type                      string         `json:"type"`
	Name                      string         `json:"name"`
	URL                       string         `json:"url"`
	Size                      int64          `json:"size"`
	MimeType                  string         `json:"mime_type"`
	StorageBackend            string         `json:"storage_backend"`
	StorageKey                string         `json:"storage_key"`
	DirectURL                 string         `json:"direct_url,omitempty"`
	VerificationStatus        string         `json:"verification_status,omitempty"`
	VerificationRef           string         `json:"verification_ref,omitempty"`
	VerifiedAt                *time.Time     `json:"verified_at,omitempty"`
	VerificationProvider      string         `json:"verification_provider,omitempty"`
	VerificationError         string         `json:"verification_error,omitempty"`
	ProviderGeneratedArtifact map[string]any `json:"provider_generated_artifact,omitempty"`
	CreatedAt                 time.Time      `json:"CreatedAt"`
	UpdatedAt                 time.Time      `json:"UpdatedAt"`
	DeletedAt                 *time.Time     `json:"DeletedAt"`
}

type InputResource struct {
	ID                   uint
	Name                 string
	Type                 string
	MimeType             string
	Size                 int64
	VerificationStatus   string
	VerificationRef      string
	VerifiedAt           *time.Time
	VerificationProvider string
	VerificationError    string
}

type ContextSnapshotInput struct {
	Model                RuntimeModelSnapshotInput
	Route                RouteSnapshotInput
	Credential           CredentialInput
	Prompt               string
	ExtraParams          string
	AspectRatio          string
	Duration             int
	JobType              string
	FeatureKey           string
	InputResources       []InputResource
	CreatedAt            time.Time
	Project              *ProjectScopeBinding         `json:"project,omitempty"`
	ContentUnitCandidate *ContentUnitCandidateBinding `json:"content_unit_candidate,omitempty"`
}

type ProjectScopeBinding struct {
	UID   string `json:"uid,omitempty"`
	Title string `json:"title,omitempty"`
	Dir   string `json:"dir,omitempty"`
}

type ContentUnitCandidateBinding struct {
	ProjectID      uint            `json:"project_id,omitempty"`
	ProjectUID     string          `json:"project_uid,omitempty"`
	ProjectTitle   string          `json:"project_title,omitempty"`
	ScopeKind      string          `json:"scope_kind,omitempty"`
	ScopeID        string          `json:"scope_id,omitempty"`
	ContentUnitID  string          `json:"content_unit_id,omitempty"`
	TargetKind     string          `json:"target_kind,omitempty"`
	TargetRef      string          `json:"target_ref,omitempty"`
	CandidateID    string          `json:"candidate_id,omitempty"`
	OutputKind     string          `json:"output_kind,omitempty"`
	PromptSnapshot json.RawMessage `json:"prompt_snapshot,omitempty"`
}

type ListFilter struct {
	UserID     uint
	OrgID      *uint
	ProjectID  *uint
	Status     string
	FeatureKey string
	JobType    string
	ExactType  bool
	Limit      int
	Offset     int
}

type ListSpec struct {
	JobTypes []string
	Limit    int
	Offset   int
}

type InputResourcesResult struct {
	Resources  []InputResource
	ImageCount int
	VideoCount int
}

type CostRequestKind string

const (
	CostRequestImage CostRequestKind = "image"
	CostRequestVideo CostRequestKind = "video"
)

type ImageCostRequest struct {
	Count       int
	AspectRatio string
}

type VideoCostRequest struct {
	Duration    int
	AspectRatio string
}

type NewQueuedJobSpec struct {
	UserID                uint
	OrgID                 *uint
	RuntimeModelID        uint
	AIModelCatalogEntryID *uint
	RouteBindingID        *uint
	RouteGroup            string
	JobType               string
	FeatureKey            string
	Title                 string
	Prompt                string
	ExtraParams           string
	AspectRatio           string
	Duration              int
	RequestContext        string
	InputResourceID       *uint
	InputResourceIDs      string
	UsageReservationID    *uint
	ProjectID             *uint
}

type Job struct {
	ID                    uint         `json:"ID"`
	UserID                uint         `json:"user_id"`
	OrgID                 *uint        `json:"org_id,omitempty"`
	RuntimeModelID        uint         `json:"-"`
	AIModelCatalogEntryID *uint        `json:"ai_model_catalog_entry_id,omitempty"`
	RouteBindingID        *uint        `json:"route_binding_id,omitempty"`
	ModelID               string       `json:"model_id,omitempty"`
	RouteGroup            string       `json:"route_group,omitempty"`
	JobType               string       `json:"job_type"`
	FeatureKey            string       `json:"feature_key,omitempty"`
	Title                 string       `json:"title,omitempty"`
	Status                string       `json:"status"`
	AttemptCount          int          `json:"attempt_count"`
	MaxAttempts           int          `json:"max_attempts"`
	NextRunAt             *time.Time   `json:"next_run_at,omitempty"`
	Prompt                string       `json:"prompt"`
	ExtraParams           string       `json:"extra_params,omitempty"`
	AspectRatio           string       `json:"aspect_ratio,omitempty"`
	Duration              int          `json:"duration,omitempty"`
	RequestContext        string       `json:"request_context,omitempty"`
	InputResourceID       *uint        `json:"input_resource_id,omitempty"`
	InputResourceIDs      string       `json:"input_resource_ids,omitempty"`
	OutputResourceID      *uint        `json:"output_resource_id,omitempty"`
	UsageReservationID    *uint        `json:"usage_reservation_id,omitempty"`
	ProviderTaskID        string       `json:"provider_task_id,omitempty"`
	ProviderTaskKind      string       `json:"provider_task_kind,omitempty"`
	ProviderTaskStatus    string       `json:"provider_task_status,omitempty"`
	ProviderTaskHistory   string       `json:"provider_task_history,omitempty"`
	ErrorMsg              string       `json:"error_msg,omitempty"`
	DebugInfo             string       `json:"debug_info,omitempty"`
	ExecutionState        string       `json:"execution_state,omitempty"`
	StateTrace            string       `json:"state_trace,omitempty"`
	LockedBy              string       `json:"locked_by,omitempty"`
	LeaseUntil            *time.Time   `json:"lease_until,omitempty"`
	LastHeartbeatAt       *time.Time   `json:"last_heartbeat_at,omitempty"`
	StartedAt             *time.Time   `json:"started_at,omitempty"`
	FinishedAt            *time.Time   `json:"finished_at,omitempty"`
	ProjectID             *uint        `json:"project_id,omitempty"`
	OutputResource        *RawResource `json:"output_resource,omitempty"`
	CreatedAt             time.Time    `json:"CreatedAt"`
	UpdatedAt             time.Time    `json:"UpdatedAt"`
	DeletedAt             *time.Time   `json:"DeletedAt"`
}

// Job status constants match the jobs.status DB column values.
const (
	StatusPending   = "pending"
	StatusRunning   = "running"
	StatusSucceeded = "succeeded"
	StatusFailed    = "failed"
	StatusCancelled = "cancelled"
)

const DefaultMaxAttempts = 3

type contextSnapshot struct {
	Model                modelSnapshot                `json:"model"`
	Route                *routeSnapshot               `json:"route,omitempty"`
	JobType              string                       `json:"job_type"`
	FeatureKey           string                       `json:"feature_key,omitempty"`
	Prompt               string                       `json:"prompt"`
	Params               paramsSnapshot               `json:"params"`
	InputResources       []resourceSnapshot           `json:"input_resources,omitempty"`
	CreatedAt            time.Time                    `json:"created_at"`
	Project              *ProjectScopeBinding         `json:"project,omitempty"`
	ContentUnitCandidate *ContentUnitCandidateBinding `json:"content_unit_candidate,omitempty"`
}

type modelSnapshot struct {
	ConfigID     uint   `json:"config_id"`
	DisplayName  string `json:"display_name"`
	Identifier   string `json:"identifier"`
	ModelDefID   string `json:"model_def_id"`
	ProviderName string `json:"provider_name"`
	CredentialID uint   `json:"credential_id"`
}

type routeSnapshot struct {
	ModelID         string `json:"model_id,omitempty"`
	CatalogEntryID  uint   `json:"catalog_entry_id,omitempty"`
	RouteBindingID  uint   `json:"route_binding_id,omitempty"`
	ProviderID      string `json:"provider_id,omitempty"`
	ProviderKind    string `json:"provider_kind,omitempty"`
	AdapterKey      string `json:"adapter_key,omitempty"`
	ProviderModelID string `json:"provider_model_id,omitempty"`
	SourceType      string `json:"source_type,omitempty"`
	RouteGroup      string `json:"route_group,omitempty"`
	APIKind         string `json:"api_kind,omitempty"`
	SelectionReason string `json:"selection_reason,omitempty"`
}

type paramsSnapshot struct {
	AspectRatio string         `json:"aspect_ratio,omitempty"`
	Duration    int            `json:"duration,omitempty"`
	ExtraParams map[string]any `json:"extra_params,omitempty"`
}

type resourceSnapshot struct {
	ID       uint   `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	MimeType string `json:"mime_type,omitempty"`
	Size     int64  `json:"size,omitempty"`
}

func BuildListSpec(filter ListFilter) ListSpec {
	spec := ListSpec{
		Limit:  filter.Limit,
		Offset: filter.Offset,
	}
	if filter.JobType == "image" && !filter.ExactType {
		spec.JobTypes = []string{"image", "image_edit"}
	} else if filter.JobType != "" {
		spec.JobTypes = []string{filter.JobType}
	} else {
		spec.JobTypes = []string{}
	}
	return spec
}

func NewQueuedJob(spec NewQueuedJobSpec) Job {
	return Job{
		UserID:                spec.UserID,
		OrgID:                 spec.OrgID,
		RuntimeModelID:        spec.RuntimeModelID,
		AIModelCatalogEntryID: spec.AIModelCatalogEntryID,
		RouteBindingID:        spec.RouteBindingID,
		RouteGroup:            spec.RouteGroup,
		JobType:               spec.JobType,
		FeatureKey:            spec.FeatureKey,
		Title:                 spec.Title,
		Status:                StatusPending,
		MaxAttempts:           DefaultMaxAttempts,
		Prompt:                spec.Prompt,
		ExtraParams:           spec.ExtraParams,
		AspectRatio:           spec.AspectRatio,
		Duration:              spec.Duration,
		RequestContext:        spec.RequestContext,
		InputResourceID:       spec.InputResourceID,
		InputResourceIDs:      spec.InputResourceIDs,
		UsageReservationID:    spec.UsageReservationID,
		ProjectID:             spec.ProjectID,
	}
}

func CountInputResources(resources []InputResource) InputResourcesResult {
	result := InputResourcesResult{Resources: resources}
	for _, r := range resources {
		switch r.Type {
		case "image":
			result.ImageCount++
		case "video":
			result.VideoCount++
		}
	}
	return result
}

func IDOrNil(id *uint) []uint {
	if id == nil {
		return nil
	}
	return []uint{*id}
}

func MergeIDs(arr []uint, single *uint) []uint {
	seen := make(map[uint]bool)
	result := make([]uint, 0, len(arr)+1)
	for _, id := range arr {
		if !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	if single != nil && !seen[*single] {
		result = append(result, *single)
	}
	return result
}

func ParseInputIDs(job Job) []uint {
	var ids []uint
	if job.InputResourceIDs != "" {
		_ = json.Unmarshal([]byte(job.InputResourceIDs), &ids)
	}
	if job.InputResourceID != nil {
		ids = MergeIDs(ids, job.InputResourceID)
	}
	return ids
}

func OrderedResources(resources []InputResource, ids []uint) []InputResource {
	byID := make(map[uint]InputResource, len(resources))
	for _, r := range resources {
		byID[r.ID] = r
	}
	ordered := make([]InputResource, 0, len(ids))
	seen := make(map[uint]bool, len(ids))
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		if r, ok := byID[id]; ok {
			ordered = append(ordered, r)
		}
	}
	return ordered
}

func BuildContextSnapshot(input ContextSnapshotInput) string {
	params := paramsSnapshot{
		AspectRatio: input.AspectRatio,
		Duration:    input.Duration,
	}
	if input.ExtraParams != "" {
		var parsed map[string]any
		if err := json.Unmarshal([]byte(input.ExtraParams), &parsed); err == nil {
			params.ExtraParams = parsed
		}
	}
	resources := make([]resourceSnapshot, 0, len(input.InputResources))
	for _, r := range input.InputResources {
		resources = append(resources, resourceSnapshot{
			ID:       r.ID,
			Name:     r.Name,
			Type:     r.Type,
			MimeType: r.MimeType,
			Size:     r.Size,
		})
	}
	snapshot := contextSnapshot{
		Model: modelSnapshot{
			ConfigID:     input.Model.ID,
			DisplayName:  ModelDisplay(input.Model),
			Identifier:   ModelIdentifier(input.Model),
			ModelDefID:   input.Model.ModelDefID,
			ProviderName: input.Credential.DisplayName,
			CredentialID: input.Model.CredentialID,
		},
		Route:                routeSnapshotFromInput(input.Route),
		JobType:              input.JobType,
		FeatureKey:           input.FeatureKey,
		Prompt:               input.Prompt,
		Params:               params,
		InputResources:       resources,
		CreatedAt:            input.CreatedAt,
		Project:              input.Project,
		ContentUnitCandidate: input.ContentUnitCandidate,
	}
	b, err := json.Marshal(snapshot)
	if err != nil {
		return ""
	}
	return string(b)
}

func routeSnapshotFromInput(input RouteSnapshotInput) *routeSnapshot {
	if input.ModelID == "" &&
		input.CatalogEntryID == 0 &&
		input.RouteBindingID == 0 &&
		input.ProviderID == "" &&
		input.ProviderKind == "" &&
		input.AdapterKey == "" &&
		input.ProviderModelID == "" &&
		input.SourceType == "" &&
		input.RouteGroup == "" &&
		input.APIKind == "" &&
		input.SelectionReason == "" {
		return nil
	}
	return &routeSnapshot{
		ModelID:         input.ModelID,
		CatalogEntryID:  input.CatalogEntryID,
		RouteBindingID:  input.RouteBindingID,
		ProviderID:      input.ProviderID,
		ProviderKind:    input.ProviderKind,
		AdapterKey:      input.AdapterKey,
		ProviderModelID: input.ProviderModelID,
		SourceType:      input.SourceType,
		RouteGroup:      input.RouteGroup,
		APIKind:         input.APIKind,
		SelectionReason: input.SelectionReason,
	}
}

func CostRequest(runtimeModelID uint, jobType string, duration int, extraParams, aspectRatio string) (CostRequestKind, ImageCostRequest, VideoCostRequest, error) {
	_ = runtimeModelID
	extra := map[string]any{}
	if extraParams != "" {
		_ = json.Unmarshal([]byte(extraParams), &extra)
	}
	extra = normalizeGenerationParams(extra)
	getString := func(key string) string {
		if v, ok := extra[key].(string); ok {
			return v
		}
		return ""
	}
	getInt := func(key string) int {
		if v, ok := extra[key]; ok {
			switch n := v.(type) {
			case float64:
				return int(n)
			case int:
				return n
			case string:
				i, err := strconv.Atoi(n)
				if err == nil {
					return i
				}
			}
		}
		return 0
	}

	switch jobType {
	case CapabilityImage, CapabilityImageEdit:
		return CostRequestImage, ImageCostRequest{
			Count:       1,
			AspectRatio: FirstNonEmpty(aspectRatio, getString("aspect_ratio")),
		}, VideoCostRequest{}, nil
	case CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V:
		dur := duration
		if dur <= 0 {
			dur = getInt("duration")
		}
		return CostRequestVideo, ImageCostRequest{}, VideoCostRequest{
			Duration:    dur,
			AspectRatio: FirstNonEmpty(aspectRatio, getString("aspect_ratio"), getString("ratio")),
		}, nil
	default:
		return "", ImageCostRequest{}, VideoCostRequest{}, errors.New("unsupported generation job type")
	}
}

func ModelDisplay(mcfg RuntimeModelSnapshotInput) string {
	return FirstNonEmpty(mcfg.CustomDisplayName, mcfg.ModelDefID, "Model")
}

func ModelIdentifier(mcfg RuntimeModelSnapshotInput) string {
	return FirstNonEmpty(mcfg.ModelIDOverride, mcfg.ModelDefID)
}

func IsVideoJob(jobType string) bool {
	return jobType == CapabilityVideo || jobType == CapabilityVideoI2V || jobType == CapabilityVideoV2V
}

func FirstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func normalizeGenerationParams(params map[string]any) map[string]any {
	if params == nil {
		return map[string]any{}
	}
	if ratio, ok := params["ratio"]; ok {
		if _, exists := params["aspect_ratio"]; !exists {
			params["aspect_ratio"] = ratio
		}
	}
	return params
}

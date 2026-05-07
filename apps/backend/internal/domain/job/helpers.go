package job

import (
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
)

type ContextSnapshotInput struct {
	Model          model.AIModelConfig
	Credential     model.AICredential
	Prompt         string
	ExtraParams    string
	AspectRatio    string
	Duration       int
	JobType        string
	FeatureKey     string
	InputResources []model.RawResource
	CreatedAt      time.Time
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
	Resources  []model.RawResource
	ImageCount int
	VideoCount int
}

type NewQueuedJobSpec struct {
	UserID             uint
	OrgID              *uint
	ModelConfigID      uint
	JobType            string
	FeatureKey         string
	Prompt             string
	ExtraParams        string
	AspectRatio        string
	Duration           int
	RequestContext     string
	InputResourceID    *uint
	InputResourceIDs   string
	UsageReservationID *uint
	ProjectID          *uint
}

type Job struct {
	ID                 uint
	UserID             uint
	OrgID              *uint
	ModelConfigID      uint
	JobType            string
	FeatureKey         string
	Status             string
	AttemptCount       int
	MaxAttempts        int
	NextRunAt          *time.Time
	Prompt             string
	ExtraParams        string
	AspectRatio        string
	Duration           int
	RequestContext     string
	InputResourceID    *uint
	InputResourceIDs   string
	OutputResourceID   *uint
	UsageReservationID *uint
	ProviderTaskID     string
	ProviderTaskKind   string
	ProviderTaskStatus string
	ErrorMsg           string
	DebugInfo          string
	ExecutionState     string
	LockedBy           string
	LeaseUntil         *time.Time
	LastHeartbeatAt    *time.Time
	StartedAt          *time.Time
	FinishedAt         *time.Time
	ProjectID          *uint
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
	Model          modelSnapshot      `json:"model"`
	JobType        string             `json:"job_type"`
	FeatureKey     string             `json:"feature_key,omitempty"`
	Prompt         string             `json:"prompt"`
	Params         paramsSnapshot     `json:"params"`
	InputResources []resourceSnapshot `json:"input_resources,omitempty"`
	CreatedAt      time.Time          `json:"created_at"`
}

type modelSnapshot struct {
	ConfigID     uint   `json:"config_id"`
	DisplayName  string `json:"display_name"`
	Identifier   string `json:"identifier"`
	ModelDefID   string `json:"model_def_id"`
	ProviderName string `json:"provider_name"`
	CredentialID uint   `json:"credential_id"`
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
		UserID:             spec.UserID,
		OrgID:              spec.OrgID,
		ModelConfigID:      spec.ModelConfigID,
		JobType:            spec.JobType,
		FeatureKey:         spec.FeatureKey,
		Status:             StatusPending,
		MaxAttempts:        DefaultMaxAttempts,
		Prompt:             spec.Prompt,
		ExtraParams:        spec.ExtraParams,
		AspectRatio:        spec.AspectRatio,
		Duration:           spec.Duration,
		RequestContext:     spec.RequestContext,
		InputResourceID:    spec.InputResourceID,
		InputResourceIDs:   spec.InputResourceIDs,
		UsageReservationID: spec.UsageReservationID,
		ProjectID:          spec.ProjectID,
	}
}

func CountInputResources(resources []model.RawResource) InputResourcesResult {
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

func ParseInputIDs(job model.Job) []uint {
	var ids []uint
	if job.InputResourceIDs != "" {
		_ = json.Unmarshal([]byte(job.InputResourceIDs), &ids)
	}
	if job.InputResourceID != nil {
		ids = MergeIDs(ids, job.InputResourceID)
	}
	return ids
}

func OrderedResources(resources []model.RawResource, ids []uint) []model.RawResource {
	byID := make(map[uint]model.RawResource, len(resources))
	for _, r := range resources {
		byID[r.ID] = r
	}
	ordered := make([]model.RawResource, 0, len(ids))
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
		JobType:        input.JobType,
		FeatureKey:     input.FeatureKey,
		Prompt:         input.Prompt,
		Params:         params,
		InputResources: resources,
		CreatedAt:      input.CreatedAt,
	}
	b, err := json.Marshal(snapshot)
	if err != nil {
		return ""
	}
	return string(b)
}

func CostRequest(modelConfigID uint, jobType string, duration int, extraParams, aspectRatio string) (string, ai.ImageRequest, ai.VideoRequest, error) {
	extra := map[string]any{}
	if extraParams != "" {
		_ = json.Unmarshal([]byte(extraParams), &extra)
	}
	extra = ai.NormalizeGenerationParams(extra)
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
	case ai.CapabilityImage, ai.CapabilityImageEdit:
		return "image", ai.ImageRequest{
			N:           1,
			AspectRatio: FirstNonEmpty(aspectRatio, getString("aspect_ratio")),
		}, ai.VideoRequest{}, nil
	case ai.CapabilityVideo, ai.CapabilityVideoI2V, ai.CapabilityVideoV2V:
		dur := duration
		if dur <= 0 {
			dur = getInt("duration")
		}
		return "video", ai.ImageRequest{}, ai.VideoRequest{
			Duration:    dur,
			AspectRatio: FirstNonEmpty(aspectRatio, getString("aspect_ratio"), getString("ratio")),
		}, nil
	default:
		return "", ai.ImageRequest{}, ai.VideoRequest{}, errors.New("unsupported generation job type")
	}
}

func ModelDisplay(mcfg model.AIModelConfig) string {
	return FirstNonEmpty(mcfg.CustomDisplayName, mcfg.ModelDefID, "Model")
}

func ModelIdentifier(mcfg model.AIModelConfig) string {
	return FirstNonEmpty(mcfg.ModelIDOverride, mcfg.ModelDefID)
}

func IsVideoJob(jobType string) bool {
	return jobType == ai.CapabilityVideo || jobType == ai.CapabilityVideoI2V || jobType == ai.CapabilityVideoV2V
}

func FirstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

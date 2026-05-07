package job

import (
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
)

type ContextSnapshotInput struct {
	Model          domainjob.AIModelConfig
	Credential     domainjob.AICredential
	Prompt         string
	ExtraParams    string
	AspectRatio    string
	Duration       int
	JobType        string
	FeatureKey     string
	InputResources []domainjob.InputResource
	CreatedAt      time.Time
}

func IDOrNil(id *uint) []uint {
	return domainjob.IDOrNil(id)
}

func MergeIDs(arr []uint, single *uint) []uint {
	return domainjob.MergeIDs(arr, single)
}

func ParseInputIDs(job domainjob.Job) []uint {
	return domainjob.ParseInputIDs(job)
}

func OrderedResources(resources []domainjob.InputResource, ids []uint) []domainjob.InputResource {
	return domainjob.OrderedResources(resources, ids)
}

func BuildContextSnapshot(input ContextSnapshotInput) string {
	return domainjob.BuildContextSnapshot(domainjob.ContextSnapshotInput{
		Model: domainjob.ModelConfigInput{
			ID:                input.Model.ID,
			CustomDisplayName: input.Model.CustomDisplayName,
			ModelIDOverride:   input.Model.ModelIDOverride,
			ModelDefID:        input.Model.ModelDefID,
			CredentialID:      input.Model.CredentialID,
		},
		Credential:     domainjob.CredentialInput{DisplayName: input.Credential.DisplayName},
		Prompt:         input.Prompt,
		ExtraParams:    input.ExtraParams,
		AspectRatio:    input.AspectRatio,
		Duration:       input.Duration,
		JobType:        input.JobType,
		FeatureKey:     input.FeatureKey,
		InputResources: input.InputResources,
		CreatedAt:      input.CreatedAt,
	})
}

func CostRequest(modelConfigID uint, jobType string, duration int, extraParams, aspectRatio string) (string, ai.ImageRequest, ai.VideoRequest, error) {
	return domainjob.CostRequest(modelConfigID, jobType, duration, extraParams, aspectRatio)
}

func ModelDisplay(mcfg domainjob.AIModelConfig) string {
	return domainjob.ModelDisplay(domainjob.ModelConfigInput{
		CustomDisplayName: mcfg.CustomDisplayName,
		ModelDefID:        mcfg.ModelDefID,
	})
}

func ModelIdentifier(mcfg domainjob.AIModelConfig) string {
	return domainjob.ModelIdentifier(domainjob.ModelConfigInput{
		ModelIDOverride: mcfg.ModelIDOverride,
		ModelDefID:      mcfg.ModelDefID,
	})
}

func IsVideoJob(jobType string) bool {
	return domainjob.IsVideoJob(jobType)
}

func FirstNonEmpty(values ...string) string {
	return domainjob.FirstNonEmpty(values...)
}

func CountInputResources(resources []domainjob.InputResource) InputResourcesResult {
	result := domainjob.CountInputResources(resources)
	return InputResourcesResult{
		Resources:  result.Resources,
		ImageCount: result.ImageCount,
		VideoCount: result.VideoCount,
	}
}

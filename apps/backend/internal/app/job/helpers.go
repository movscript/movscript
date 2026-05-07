package job

import (
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
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

func IDOrNil(id *uint) []uint {
	return domainjob.IDOrNil(id)
}

func MergeIDs(arr []uint, single *uint) []uint {
	return domainjob.MergeIDs(arr, single)
}

func ParseInputIDs(job model.Job) []uint {
	return domainjob.ParseInputIDs(domainjob.JobFromModel(job))
}

func OrderedResources(resources []model.RawResource, ids []uint) []model.RawResource {
	domainResources := inputResourcesFromModel(resources)
	ordered := domainjob.OrderedResources(domainResources, ids)
	return inputResourcesToModel(ordered)
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
		InputResources: inputResourcesFromModel(input.InputResources),
		CreatedAt:      input.CreatedAt,
	})
}

func CostRequest(modelConfigID uint, jobType string, duration int, extraParams, aspectRatio string) (string, ai.ImageRequest, ai.VideoRequest, error) {
	return domainjob.CostRequest(modelConfigID, jobType, duration, extraParams, aspectRatio)
}

func ModelDisplay(mcfg model.AIModelConfig) string {
	return domainjob.ModelDisplay(domainjob.ModelConfigInput{
		CustomDisplayName: mcfg.CustomDisplayName,
		ModelDefID:        mcfg.ModelDefID,
	})
}

func ModelIdentifier(mcfg model.AIModelConfig) string {
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

func CountInputResources(resources []model.RawResource) InputResourcesResult {
	result := domainjob.CountInputResources(inputResourcesFromModel(resources))
	return InputResourcesResult{
		Resources:  resources,
		ImageCount: result.ImageCount,
		VideoCount: result.VideoCount,
	}
}

func inputResourcesFromModel(resources []model.RawResource) []domainjob.InputResource {
	out := make([]domainjob.InputResource, 0, len(resources))
	for _, resource := range resources {
		out = append(out, domainjob.InputResource{
			ID:       resource.ID,
			Name:     resource.Name,
			Type:     resource.Type,
			MimeType: resource.MimeType,
			Size:     resource.Size,
		})
	}
	return out
}

func inputResourcesToModel(resources []domainjob.InputResource) []model.RawResource {
	out := make([]model.RawResource, 0, len(resources))
	for _, resource := range resources {
		out = append(out, model.RawResource{
			Name:     resource.Name,
			Type:     resource.Type,
			MimeType: resource.MimeType,
			Size:     resource.Size,
		})
		out[len(out)-1].ID = resource.ID
	}
	return out
}

package job

import (
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
)

type ContextSnapshotInput struct {
	Model                domainjob.RuntimeModelSnapshotInput
	Route                domainjob.RouteSnapshotInput
	Credential           domainjob.AICredential
	Intent               *domainjob.GenerationIntentSnapshot
	Prompt               string
	ExtraParams          string
	AspectRatio          string
	Duration             int
	JobType              string
	FeatureKey           string
	InputResources       []domainjob.InputResource
	CreatedAt            time.Time
	Project              *domainjob.ProjectScopeBinding
	ContentUnitCandidate *domainjob.ContentUnitCandidateBinding
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
		Model: domainjob.RuntimeModelSnapshotInput{
			ID:                input.Model.ID,
			CustomDisplayName: input.Model.CustomDisplayName,
			ModelIDOverride:   input.Model.ModelIDOverride,
			ModelDefID:        input.Model.ModelDefID,
			CredentialID:      input.Model.CredentialID,
		},
		Route:                input.Route,
		Credential:           domainjob.CredentialInput{DisplayName: input.Credential.DisplayName},
		Intent:               input.Intent,
		Prompt:               input.Prompt,
		ExtraParams:          input.ExtraParams,
		AspectRatio:          input.AspectRatio,
		Duration:             input.Duration,
		JobType:              input.JobType,
		FeatureKey:           input.FeatureKey,
		InputResources:       input.InputResources,
		CreatedAt:            input.CreatedAt,
		Project:              input.Project,
		ContentUnitCandidate: input.ContentUnitCandidate,
	})
}

func CostRequest(runtimeModelID uint, jobType string, duration int, extraParams, aspectRatio string) (domainjob.CostRequestKind, ai.ImageRequest, ai.VideoRequest, error) {
	kind, imageReq, videoReq, err := domainjob.CostRequest(runtimeModelID, jobType, duration, extraParams, aspectRatio)
	if err != nil {
		return kind, ai.ImageRequest{}, ai.VideoRequest{}, err
	}
	switch kind {
	case domainjob.CostRequestImage:
		return kind, ai.ImageRequest{N: imageReq.Count, AspectRatio: imageReq.AspectRatio}, ai.VideoRequest{}, nil
	case domainjob.CostRequestVideo:
		return kind, ai.ImageRequest{}, ai.VideoRequest{Duration: videoReq.Duration, AspectRatio: videoReq.AspectRatio}, nil
	default:
		return kind, ai.ImageRequest{}, ai.VideoRequest{}, nil
	}
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

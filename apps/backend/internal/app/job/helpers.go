package job

import (
	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
)

type ContextSnapshotInput = domainjob.ContextSnapshotInput

func IDOrNil(id *uint) []uint {
	return domainjob.IDOrNil(id)
}

func MergeIDs(arr []uint, single *uint) []uint {
	return domainjob.MergeIDs(arr, single)
}

func ParseInputIDs(job model.Job) []uint {
	return domainjob.ParseInputIDs(job)
}

func OrderedResources(resources []model.RawResource, ids []uint) []model.RawResource {
	return domainjob.OrderedResources(resources, ids)
}

func BuildContextSnapshot(input ContextSnapshotInput) string {
	return domainjob.BuildContextSnapshot(input)
}

func CostRequest(modelConfigID uint, jobType string, duration int, extraParams, aspectRatio string) (string, ai.ImageRequest, ai.VideoRequest, error) {
	return domainjob.CostRequest(modelConfigID, jobType, duration, extraParams, aspectRatio)
}

func ModelDisplay(mcfg model.AIModelConfig) string {
	return domainjob.ModelDisplay(mcfg)
}

func ModelIdentifier(mcfg model.AIModelConfig) string {
	return domainjob.ModelIdentifier(mcfg)
}

func IsVideoJob(jobType string) bool {
	return domainjob.IsVideoJob(jobType)
}

func FirstNonEmpty(values ...string) string {
	return domainjob.FirstNonEmpty(values...)
}

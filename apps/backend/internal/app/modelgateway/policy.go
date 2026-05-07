package modelgateway

import (
	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
	"github.com/movscript/movscript/internal/infra/ai"
)

const DefaultChatModel = domainmodelgateway.DefaultChatModel

func KeyAllowsScope(key *domainmodelgateway.APIKey, scope string) bool {
	if key == nil {
		return false
	}
	return domainmodelgateway.KeyAllowsScope(key, scope)
}

func KeyAllowsModel(key *domainmodelgateway.APIKey, modelConfigID uint) bool {
	if key == nil {
		return false
	}
	return domainmodelgateway.KeyAllowsModel(key, modelConfigID)
}

func KeyAllowsProject(key *domainmodelgateway.APIKey, requestedProjectID *uint) bool {
	if key == nil {
		return false
	}
	return domainmodelgateway.KeyAllowsProject(key, requestedProjectID)
}

func UsageContext(key *domainmodelgateway.APIKey, projectID *uint) ai.UsageContext {
	return domainmodelgateway.UsageContext(key, projectID)
}

func ResolveTextModel(models []ai.PublicModel, requestedModel string, defaultID uint, defaultErr error) (uint, string, error) {
	return domainmodelgateway.ResolveTextModel(models, requestedModel, defaultID, defaultErr)
}

func ModelID(m ai.PublicModel) string {
	return domainmodelgateway.ModelID(m)
}

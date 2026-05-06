package modelgateway

import (
	"github.com/movscript/movscript/internal/domain/model"
	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
	"github.com/movscript/movscript/internal/infra/ai"
)

const DefaultChatModel = domainmodelgateway.DefaultChatModel

func KeyAllowsScope(key *model.GatewayAPIKey, scope string) bool {
	return domainmodelgateway.KeyAllowsScope(key, scope)
}

func KeyAllowsModel(key *model.GatewayAPIKey, modelConfigID uint) bool {
	return domainmodelgateway.KeyAllowsModel(key, modelConfigID)
}

func KeyAllowsProject(key *model.GatewayAPIKey, requestedProjectID *uint) bool {
	return domainmodelgateway.KeyAllowsProject(key, requestedProjectID)
}

func BillingContext(key *model.GatewayAPIKey, projectID *uint) ai.BillingContext {
	return domainmodelgateway.BillingContext(key, projectID)
}

func ResolveTextModel(models []ai.PublicModel, requestedModel string, defaultID uint, defaultErr error) (uint, string, error) {
	return domainmodelgateway.ResolveTextModel(models, requestedModel, defaultID, defaultErr)
}

func ModelID(m ai.PublicModel) string {
	return domainmodelgateway.ModelID(m)
}

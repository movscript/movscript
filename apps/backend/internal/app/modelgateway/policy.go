package modelgateway

import (
	"github.com/movscript/movscript/internal/domain/model"
	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
	"github.com/movscript/movscript/internal/infra/ai"
)

const DefaultChatModel = domainmodelgateway.DefaultChatModel

func KeyAllowsScope(key *model.GatewayAPIKey, scope string) bool {
	if key == nil {
		return false
	}
	domainKey := domainmodelgateway.APIKeyFromModel(*key)
	return domainmodelgateway.KeyAllowsScope(&domainKey, scope)
}

func KeyAllowsModel(key *model.GatewayAPIKey, modelConfigID uint) bool {
	if key == nil {
		return false
	}
	domainKey := domainmodelgateway.APIKeyFromModel(*key)
	return domainmodelgateway.KeyAllowsModel(&domainKey, modelConfigID)
}

func KeyAllowsProject(key *model.GatewayAPIKey, requestedProjectID *uint) bool {
	if key == nil {
		return false
	}
	domainKey := domainmodelgateway.APIKeyFromModel(*key)
	return domainmodelgateway.KeyAllowsProject(&domainKey, requestedProjectID)
}

func BillingContext(key *model.GatewayAPIKey, projectID *uint) ai.BillingContext {
	if key == nil {
		return domainmodelgateway.BillingContext(nil, projectID)
	}
	domainKey := domainmodelgateway.APIKeyFromModel(*key)
	return domainmodelgateway.BillingContext(&domainKey, projectID)
}

func ResolveTextModel(models []ai.PublicModel, requestedModel string, defaultID uint, defaultErr error) (uint, string, error) {
	return domainmodelgateway.ResolveTextModel(models, requestedModel, defaultID, defaultErr)
}

func ModelID(m ai.PublicModel) string {
	return domainmodelgateway.ModelID(m)
}

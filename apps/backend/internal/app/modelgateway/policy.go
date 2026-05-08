package modelgateway

import (
	"fmt"
	"strconv"
	"strings"

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
	ctx := ai.UsageContext{ProjectID: projectID}
	if key != nil {
		ctx.OrgID = key.OrgID
		ctx.GatewayAPIKeyID = &key.ID
	}
	return ctx
}

func ResolveTextModel(models []ai.PublicModel, requestedModel string, defaultID uint, defaultErr error) (uint, string, error) {
	requested := strings.TrimSpace(requestedModel)
	if requested == "" || requested == DefaultChatModel {
		return defaultID, DefaultChatModel, defaultErr
	}

	if strings.HasPrefix(requested, "model_config:") {
		rawID := strings.TrimPrefix(requested, "model_config:")
		id, err := strconv.ParseUint(rawID, 10, 64)
		if err != nil || id == 0 {
			return 0, requested, fmt.Errorf("model %q not found", requested)
		}
		for _, m := range models {
			if m.ID == uint(id) {
				return uint(id), requested, nil
			}
		}
		return 0, requested, fmt.Errorf("model %q not found", requested)
	}

	for _, m := range models {
		if requested == ModelID(m) || requested == m.ModelDefID || requested == m.ModelIDOverride || requested == m.LogicalModelID {
			return m.ID, requested, nil
		}
	}
	return 0, requested, fmt.Errorf("model %q not found", requested)
}

func ModelID(m ai.PublicModel) string {
	if m.ModelIDOverride != "" {
		return m.ModelIDOverride
	}
	if m.LogicalModelID != "" {
		return m.LogicalModelID
	}
	if m.ModelDefID != "" {
		return m.ModelDefID
	}
	if m.ID > 0 {
		return fmt.Sprintf("model_config:%d", m.ID)
	}
	return ""
}

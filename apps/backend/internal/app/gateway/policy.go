package gateway

import (
	"fmt"
	"strconv"
	"strings"

	domaingateway "github.com/movscript/movscript/internal/domain/gateway"
	"github.com/movscript/movscript/internal/infra/ai"
)

const DefaultChatModel = domaingateway.DefaultChatModel

func KeyAllowsScope(key *domaingateway.APIKey, scope string) bool {
	if key == nil {
		return false
	}
	return domaingateway.KeyAllowsScope(key, scope)
}

func KeyAllowsModel(key *domaingateway.APIKey, modelConfigID uint) bool {
	if key == nil {
		return false
	}
	return domaingateway.KeyAllowsModel(key, modelConfigID)
}

func KeyAllowsProject(key *domaingateway.APIKey, requestedProjectID *uint) bool {
	if key == nil {
		return false
	}
	return domaingateway.KeyAllowsProject(key, requestedProjectID)
}

func UsageContext(key *domaingateway.APIKey, projectID *uint) ai.UsageContext {
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
	if m.ModelID != "" {
		return m.ModelID
	}
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

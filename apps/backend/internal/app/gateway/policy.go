package gateway

import (
	"fmt"
	"strings"

	domaingateway "github.com/movscript/movscript/internal/domain/gateway"
	"github.com/movscript/movscript/internal/infra/ai"
)

const DefaultChatModel = domaingateway.DefaultChatModel

type ChatModel struct {
	ID              uint
	CatalogEntryID  uint
	ModelID         string
	ModelDefID      string
	ModelIDOverride string
	LogicalModelID  string
}

func KeyAllowsScope(key *domaingateway.APIKey, scope string) bool {
	if key == nil {
		return false
	}
	return domaingateway.KeyAllowsScope(key, scope)
}

func KeyAllowsCatalogEntry(key *domaingateway.APIKey, catalogEntryID uint) bool {
	if key == nil {
		return false
	}
	return domaingateway.KeyAllowsCatalogEntry(key, catalogEntryID)
}

func KeyAllowsAnyCatalogEntry(key *domaingateway.APIKey, catalogEntryIDs ...uint) bool {
	if key == nil {
		return false
	}
	return domaingateway.KeyAllowsAnyCatalogEntry(key, catalogEntryIDs...)
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

func ResolveTextModel(models []ChatModel, requestedModel string, defaultID uint, defaultErr error) (uint, string, error) {
	requested := strings.TrimSpace(requestedModel)
	if requested == "" || requested == DefaultChatModel {
		return defaultID, DefaultChatModel, defaultErr
	}

	for _, m := range models {
		if requested == ModelID(m) || requested == m.LogicalModelID {
			return m.ID, requested, nil
		}
	}
	return 0, requested, fmt.Errorf("model %q not found", requested)
}

func ModelID(m ChatModel) string {
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
	return ""
}

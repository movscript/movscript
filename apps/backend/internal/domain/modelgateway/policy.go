package modelgateway

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/infra/ai"
)

const (
	DefaultChatModel    = "movscript-default-chat"
	DefaultAPIScopeChat = "model:chat"
)

type NewAPIKeySpec struct {
	Name            string
	KeyPrefix       string
	KeyHash         string
	OwnerUserID     uint
	OrgID           *uint
	ProjectID       *uint
	AllowedModelIDs []uint
	AllowedScopes   []string
}

type APIKey struct {
	ID              uint
	Name            string
	KeyPrefix       string
	KeyHash         string
	OwnerUserID     uint
	OrgID           *uint
	ProjectID       *uint
	AllowedModelIDs string
	AllowedScopes   string
	RateLimitRPM    int
	MonthlyBudget   float64
	IsEnabled       bool
	LastUsedAt      *time.Time
}

func NewAPIKey(spec NewAPIKeySpec) APIKey {
	scopes := spec.AllowedScopes
	if len(scopes) == 0 {
		scopes = []string{DefaultAPIScopeChat}
	}
	return APIKey{
		Name:            strings.TrimSpace(spec.Name),
		KeyPrefix:       spec.KeyPrefix,
		KeyHash:         spec.KeyHash,
		OwnerUserID:     spec.OwnerUserID,
		OrgID:           spec.OrgID,
		ProjectID:       spec.ProjectID,
		AllowedModelIDs: mustJSONString(spec.AllowedModelIDs),
		AllowedScopes:   mustJSONString(scopes),
		IsEnabled:       true,
	}
}

func KeyAllowsScope(key *APIKey, scope string) bool {
	scopes := parseStringArray(key.AllowedScopes)
	if len(scopes) == 0 {
		return scope == DefaultAPIScopeChat
	}
	for _, s := range scopes {
		if s == scope || s == "*" {
			return true
		}
	}
	return false
}

func KeyAllowsModel(key *APIKey, modelConfigID uint) bool {
	ids := parseUintArray(key.AllowedModelIDs)
	if len(ids) == 0 {
		return true
	}
	for _, id := range ids {
		if id == modelConfigID {
			return true
		}
	}
	return false
}

func KeyAllowsProject(key *APIKey, requestedProjectID *uint) bool {
	if key.ProjectID == nil {
		return true
	}
	if requestedProjectID == nil {
		return false
	}
	return *key.ProjectID == *requestedProjectID
}

func BillingContext(key *APIKey, projectID *uint) ai.BillingContext {
	ctx := ai.BillingContext{ProjectID: projectID}
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
		if requested == ModelID(m) || requested == m.ModelDefID || requested == m.ModelIDOverride {
			return m.ID, requested, nil
		}
	}
	return 0, requested, fmt.Errorf("model %q not found", requested)
}

func ModelID(m ai.PublicModel) string {
	if m.ModelIDOverride != "" {
		return m.ModelIDOverride
	}
	if m.ModelDefID != "" {
		return m.ModelDefID
	}
	if m.ID > 0 {
		return fmt.Sprintf("model_config:%d", m.ID)
	}
	return ""
}

func parseStringArray(raw string) []string {
	var values []string
	if strings.TrimSpace(raw) == "" {
		return values
	}
	_ = json.Unmarshal([]byte(raw), &values)
	return values
}

func parseUintArray(raw string) []uint {
	var values []uint
	if strings.TrimSpace(raw) == "" {
		return values
	}
	_ = json.Unmarshal([]byte(raw), &values)
	return values
}

func mustJSONString(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return "[]"
	}
	return string(data)
}

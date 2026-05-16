package gateway

import (
	"encoding/json"
	"strings"
	"time"
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

type APIKeyUpdateSpec struct {
	Name            *string
	ProjectID       *uint
	ProjectIDSet    bool
	AllowedModelIDs []uint
	AllowedScopes   []string
	IsEnabled       *bool
}

type APIKey struct {
	ID              uint       `json:"ID"`
	Name            string     `json:"name"`
	KeyPrefix       string     `json:"key_prefix"`
	KeyHash         string     `json:"-"`
	OwnerUserID     uint       `json:"owner_user_id"`
	OrgID           *uint      `json:"org_id,omitempty"`
	ProjectID       *uint      `json:"project_id,omitempty"`
	AllowedModelIDs string     `json:"allowed_model_ids"`
	AllowedScopes   string     `json:"allowed_scopes"`
	IsEnabled       bool       `json:"is_enabled"`
	LastUsedAt      *time.Time `json:"last_used_at,omitempty"`
	CreatedAt       time.Time  `json:"CreatedAt"`
	UpdatedAt       time.Time  `json:"UpdatedAt"`

	APIKeyRuntimeFields
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

func (key *APIKey) ApplyUpdate(spec APIKeyUpdateSpec) {
	if spec.Name != nil {
		key.Name = strings.TrimSpace(*spec.Name)
	}
	if spec.ProjectIDSet {
		key.ProjectID = spec.ProjectID
	}
	if spec.AllowedModelIDs != nil {
		key.AllowedModelIDs = mustJSONString(spec.AllowedModelIDs)
	}
	if spec.AllowedScopes != nil {
		key.AllowedScopes = mustJSONString(spec.AllowedScopes)
	}
	if spec.IsEnabled != nil {
		key.IsEnabled = *spec.IsEnabled
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

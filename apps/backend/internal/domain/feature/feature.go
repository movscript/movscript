package feature

import (
	"encoding/json"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
)

type InputSlot struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Accept      string `json:"accept"`
	Required    bool   `json:"required"`
	MaxCount    int    `json:"max_count"`
	RequiresCap string `json:"requires_cap"`
}

type Definition struct {
	IsInternal    bool
	IsToolFeature bool
	InputSlots    []InputSlot
	SystemPrompt  string
	OutputSchema  string
	MaxTokens     int
}

type Response struct {
	ID                   uint        `json:"ID"`
	FeatureKey           string      `json:"feature_key"`
	DisplayName          string      `json:"display_name"`
	Description          string      `json:"description"`
	Capability           string      `json:"capability"`
	IsEnabled            bool        `json:"is_enabled"`
	IsInternal           bool        `json:"is_internal"`
	IsToolFeature        bool        `json:"is_tool_feature"`
	InputSlots           []InputSlot `json:"input_slots"`
	AllowedModelIDs      []uint      `json:"allowed_model_ids"`
	DefaultModelID       *uint       `json:"default_model_id"`
	AllowedRoles         []string    `json:"allowed_roles"`
	DefaultSystemPrompt  string      `json:"default_system_prompt"`
	SystemPromptOverride string      `json:"system_prompt_override"`
	OutputSchema         string      `json:"output_schema"`
	MaxTokens            int         `json:"max_tokens"`
	MaxTokensOverride    int         `json:"max_tokens_override"`
	CreatedAt            time.Time   `json:"CreatedAt"`
	UpdatedAt            time.Time   `json:"UpdatedAt"`
}

func EncodeUintIDs(ids []uint) string {
	raw, _ := json.Marshal(ids)
	return string(raw)
}

func EncodeRoles(roles []string) string {
	raw, _ := json.Marshal(roles)
	return string(raw)
}

func NormalizeDefaultModelID(id *uint) *uint {
	if id == nil || *id == 0 {
		return nil
	}
	return id
}

func DecodeUintIDs(raw string) []uint {
	if raw == "" || raw == "[]" {
		return []uint{}
	}
	var ids []uint
	if err := json.Unmarshal([]byte(raw), &ids); err != nil {
		return []uint{}
	}
	if ids == nil {
		return []uint{}
	}
	return ids
}

func DecodeRoles(raw string) []string {
	if raw == "" || raw == "[]" {
		return []string{}
	}
	var roles []string
	if err := json.Unmarshal([]byte(raw), &roles); err != nil {
		return []string{}
	}
	if roles == nil {
		return []string{}
	}
	return roles
}

func BuildResponse(f model.FeatureConfig, allowedModelIDs []uint, def *Definition) Response {
	defaultPrompt, outputSchema := "", ""
	maxTokens := f.MaxTokensOverride
	isInternal, isToolFeature := false, false
	var inputSlots []InputSlot
	if def != nil {
		defaultPrompt = def.SystemPrompt
		outputSchema = def.OutputSchema
		isInternal = def.IsInternal
		isToolFeature = def.IsToolFeature
		inputSlots = def.InputSlots
		if maxTokens == 0 {
			maxTokens = def.MaxTokens
		}
	}
	if inputSlots == nil {
		inputSlots = []InputSlot{}
	}
	if allowedModelIDs == nil {
		allowedModelIDs = []uint{}
	}

	return Response{
		ID:                   f.ID,
		FeatureKey:           f.FeatureKey,
		DisplayName:          f.DisplayName,
		Description:          f.Description,
		Capability:           f.Capability,
		IsEnabled:            f.IsEnabled,
		IsInternal:           isInternal,
		IsToolFeature:        isToolFeature,
		InputSlots:           inputSlots,
		AllowedModelIDs:      allowedModelIDs,
		DefaultModelID:       f.DefaultModelID,
		AllowedRoles:         DecodeRoles(f.AllowedRoles),
		DefaultSystemPrompt:  defaultPrompt,
		SystemPromptOverride: f.SystemPromptOverride,
		OutputSchema:         outputSchema,
		MaxTokens:            maxTokens,
		MaxTokensOverride:    f.MaxTokensOverride,
		CreatedAt:            f.CreatedAt,
		UpdatedAt:            f.UpdatedAt,
	}
}

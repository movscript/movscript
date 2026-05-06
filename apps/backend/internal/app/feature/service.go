package feature

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("feature not found")

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type Response struct {
	ID                   uint           `json:"ID"`
	FeatureKey           string         `json:"feature_key"`
	DisplayName          string         `json:"display_name"`
	Description          string         `json:"description"`
	Capability           string         `json:"capability"`
	IsEnabled            bool           `json:"is_enabled"`
	IsInternal           bool           `json:"is_internal"`
	IsToolFeature        bool           `json:"is_tool_feature"`
	InputSlots           []ai.InputSlot `json:"input_slots"`
	AllowedModelIDs      []uint         `json:"allowed_model_ids"`
	DefaultModelID       *uint          `json:"default_model_id"`
	AllowedRoles         []string       `json:"allowed_roles"`
	DefaultSystemPrompt  string         `json:"default_system_prompt"`
	SystemPromptOverride string         `json:"system_prompt_override"`
	OutputSchema         string         `json:"output_schema"`
	MaxTokens            int            `json:"max_tokens"`
	MaxTokensOverride    int            `json:"max_tokens_override"`
	CreatedAt            time.Time      `json:"CreatedAt"`
	UpdatedAt            time.Time      `json:"UpdatedAt"`
}

type UpdateInput struct {
	IsEnabled       *bool
	AllowedModelIDs []uint
	DefaultModelID  *uint
	AllowedRoles    []string
}

type PromptInput struct {
	SystemPromptOverride *string
	MaxTokensOverride    *int
}

func (s *Service) List(ctx context.Context) ([]Response, error) {
	features := make([]model.FeatureConfig, 0)
	if err := s.db.WithContext(ctx).Order("id").Find(&features).Error; err != nil {
		return nil, err
	}
	out := make([]Response, len(features))
	for i, f := range features {
		out[i] = s.toResp(ctx, f)
	}
	return out, nil
}

func (s *Service) ListDefs(_ context.Context) []ai.FeatureDef {
	return ai.FeatureCatalog
}

func (s *Service) Update(ctx context.Context, key string, input UpdateInput) (Response, error) {
	f, err := s.find(ctx, key)
	if err != nil {
		return Response{}, err
	}
	if input.IsEnabled != nil {
		f.IsEnabled = *input.IsEnabled
	}
	if input.AllowedModelIDs != nil {
		b, _ := json.Marshal(input.AllowedModelIDs)
		f.AllowedModelIDs = string(b)
	}
	if input.DefaultModelID != nil {
		if *input.DefaultModelID == 0 {
			f.DefaultModelID = nil
		} else {
			f.DefaultModelID = input.DefaultModelID
		}
	}
	if input.AllowedRoles != nil {
		b, _ := json.Marshal(input.AllowedRoles)
		f.AllowedRoles = string(b)
	}
	if err := s.db.WithContext(ctx).Save(&f).Error; err != nil {
		return Response{}, err
	}
	return s.toResp(ctx, f), nil
}

func (s *Service) UpdatePrompt(ctx context.Context, key string, input PromptInput) (Response, error) {
	f, err := s.find(ctx, key)
	if err != nil {
		return Response{}, err
	}
	if input.SystemPromptOverride != nil {
		f.SystemPromptOverride = *input.SystemPromptOverride
	}
	if input.MaxTokensOverride != nil {
		f.MaxTokensOverride = *input.MaxTokensOverride
	}
	if err := s.db.WithContext(ctx).Save(&f).Error; err != nil {
		return Response{}, err
	}
	return s.toResp(ctx, f), nil
}

func (s *Service) GetPublic(ctx context.Context, key string) (Response, error) {
	f, err := s.find(ctx, key)
	if err != nil {
		return Response{}, err
	}
	return s.toResp(ctx, f), nil
}

func (s *Service) find(ctx context.Context, key string) (model.FeatureConfig, error) {
	var f model.FeatureConfig
	if err := s.db.WithContext(ctx).Where("feature_key = ?", ai.NormalizeFeatureKey(key)).First(&f).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return f, ErrNotFound
		}
		return f, err
	}
	return f, nil
}

func (s *Service) toResp(ctx context.Context, f model.FeatureConfig) Response {
	var rawIDs []uint
	if f.AllowedModelIDs != "" && f.AllowedModelIDs != "[]" {
		_ = json.Unmarshal([]byte(f.AllowedModelIDs), &rawIDs)
	}
	ids := s.filterExistingModelIDs(ctx, rawIDs)

	var allowedRoles []string
	if f.AllowedRoles != "" && f.AllowedRoles != "[]" {
		_ = json.Unmarshal([]byte(f.AllowedRoles), &allowedRoles)
	}
	if allowedRoles == nil {
		allowedRoles = []string{}
	}

	def := ai.GetFeatureDef(f.FeatureKey)
	defaultPrompt, outputSchema := "", ""
	maxTokens := f.MaxTokensOverride
	isInternal, isToolFeature := false, false
	var inputSlots []ai.InputSlot
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
		inputSlots = []ai.InputSlot{}
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
		AllowedModelIDs:      ids,
		DefaultModelID:       f.DefaultModelID,
		AllowedRoles:         allowedRoles,
		DefaultSystemPrompt:  defaultPrompt,
		SystemPromptOverride: f.SystemPromptOverride,
		OutputSchema:         outputSchema,
		MaxTokens:            maxTokens,
		MaxTokensOverride:    f.MaxTokensOverride,
		CreatedAt:            f.CreatedAt,
		UpdatedAt:            f.UpdatedAt,
	}
}

func (s *Service) filterExistingModelIDs(ctx context.Context, ids []uint) []uint {
	if len(ids) == 0 {
		return []uint{}
	}
	var existing []uint
	s.db.WithContext(ctx).Model(&model.AIModelConfig{}).
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.id IN ? AND ai_model_configs.deleted_at IS NULL AND ai_credentials.deleted_at IS NULL", ids).
		Pluck("ai_model_configs.id", &existing)
	if existing == nil {
		return []uint{}
	}
	return existing
}

package feature

import (
	"context"
	"errors"

	domainfeature "github.com/movscript/movscript/internal/domain/feature"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("feature not found")

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type Response = domainfeature.Response

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
	features, err := s.repo.ListFeatures(ctx)
	if err != nil {
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
	f, err := s.repo.GetFeature(ctx, key)
	if err != nil {
		return Response{}, err
	}
	if input.IsEnabled != nil {
		f.IsEnabled = *input.IsEnabled
	}
	if input.AllowedModelIDs != nil {
		f.AllowedModelIDs = domainfeature.EncodeUintIDs(input.AllowedModelIDs)
	}
	if input.DefaultModelID != nil {
		f.DefaultModelID = domainfeature.NormalizeDefaultModelID(input.DefaultModelID)
	}
	if input.AllowedRoles != nil {
		f.AllowedRoles = domainfeature.EncodeRoles(input.AllowedRoles)
	}
	if err := s.repo.SaveFeature(ctx, &f); err != nil {
		return Response{}, err
	}
	return s.toResp(ctx, f), nil
}

func (s *Service) UpdatePrompt(ctx context.Context, key string, input PromptInput) (Response, error) {
	f, err := s.repo.GetFeature(ctx, key)
	if err != nil {
		return Response{}, err
	}
	if input.SystemPromptOverride != nil {
		f.SystemPromptOverride = *input.SystemPromptOverride
	}
	if input.MaxTokensOverride != nil {
		f.MaxTokensOverride = *input.MaxTokensOverride
	}
	if err := s.repo.SaveFeature(ctx, &f); err != nil {
		return Response{}, err
	}
	return s.toResp(ctx, f), nil
}

func (s *Service) GetPublic(ctx context.Context, key string) (Response, error) {
	f, err := s.repo.GetFeature(ctx, key)
	if err != nil {
		return Response{}, err
	}
	return s.toResp(ctx, f), nil
}

func (s *Service) toResp(ctx context.Context, f model.FeatureConfig) Response {
	rawIDs := domainfeature.DecodeUintIDs(f.AllowedModelIDs)
	ids := s.repo.FilterExistingModelIDs(ctx, rawIDs)
	return domainfeature.BuildResponse(f, ids, featureDef(ai.GetFeatureDef(f.FeatureKey)))
}

func featureDef(def *ai.FeatureDef) *domainfeature.Definition {
	if def == nil {
		return nil
	}
	slots := make([]domainfeature.InputSlot, 0, len(def.InputSlots))
	for _, slot := range def.InputSlots {
		slots = append(slots, domainfeature.InputSlot{
			Key:         slot.Key,
			Label:       slot.Label,
			Accept:      slot.Accept,
			Required:    slot.Required,
			MaxCount:    slot.MaxCount,
			RequiresCap: slot.RequiresCap,
		})
	}
	return &domainfeature.Definition{
		IsInternal:    def.IsInternal,
		IsToolFeature: def.IsToolFeature,
		InputSlots:    slots,
		SystemPrompt:  def.SystemPrompt,
		OutputSchema:  def.OutputSchema,
		MaxTokens:     def.MaxTokens,
	}
}

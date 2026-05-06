package semantic

import (
	"context"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

type CreativeReferenceFilter struct {
	ProjectID uint
	Kind      string
}

type CreativeReferenceInput struct {
	SourceScriptID   *uint  `json:"source_script_id"`
	SourceAnalysisID *uint  `json:"source_analysis_id"`
	LegacySettingID  *uint  `json:"legacy_setting_id"`
	Kind             string `json:"kind" binding:"required"`
	Name             string `json:"name" binding:"required"`
	Alias            string `json:"alias"`
	Description      string `json:"description"`
	Content          string `json:"content"`
	Importance       string `json:"importance"`
	Status           string `json:"status"`
	ProfileJSON      string `json:"profile_json"`
	TagsJSON         string `json:"tags_json"`
}

type CreativeReferenceStateFilter struct {
	ProjectID           uint
	CreativeReferenceID uint
}

type CreativeReferenceStateInput struct {
	CreativeReferenceID uint   `json:"creative_reference_id" binding:"required"`
	ScopeType           string `json:"scope_type" binding:"required"`
	ScopeID             *uint  `json:"scope_id"`
	Name                string `json:"name" binding:"required"`
	Description         string `json:"description"`
	VisualNotes         string `json:"visual_notes"`
	Emotion             string `json:"emotion"`
	Costume             string `json:"costume"`
	Props               string `json:"props"`
	Status              string `json:"status"`
	TagsJSON            string `json:"tags_json"`
	MetadataJSON        string `json:"metadata_json"`
}

type CreativeReferenceUsageFilter struct {
	ProjectID           uint
	OwnerType           string
	OwnerID             uint
	CreativeReferenceID uint
	Status              string
}

type CreativeReferenceUsageInput struct {
	OwnerType                string `json:"owner_type" binding:"required"`
	OwnerID                  uint   `json:"owner_id" binding:"required"`
	CreativeReferenceID      uint   `json:"creative_reference_id" binding:"required"`
	CreativeReferenceStateID *uint  `json:"creative_reference_state_id"`
	Role                     string `json:"role"`
	Order                    int    `json:"order"`
	Evidence                 string `json:"evidence"`
	Source                   string `json:"source"`
	Status                   string `json:"status"`
	MetadataJSON             string `json:"metadata_json"`
}

type CreativeRelationshipFilter struct {
	ProjectID           uint
	CreativeReferenceID uint
	ScopeType           string
	Status              string
}

type CreativeRelationshipInput struct {
	SourceCreativeReferenceID uint   `json:"source_creative_reference_id" binding:"required"`
	TargetCreativeReferenceID uint   `json:"target_creative_reference_id" binding:"required"`
	ScopeType                 string `json:"scope_type"`
	ScopeID                   *uint  `json:"scope_id"`
	Category                  string `json:"category"`
	Type                      string `json:"type"`
	Label                     string `json:"label"`
	Description               string `json:"description"`
	Source                    string `json:"source"`
	Status                    string `json:"status"`
	Evidence                  string `json:"evidence"`
	MetadataJSON              string `json:"metadata_json"`
}

func (s *Service) ListCreativeReferences(ctx context.Context, filter CreativeReferenceFilter) ([]model.CreativeReference, error) {
	return s.repo.ListCreativeReferences(ctx, filter)
}

func (s *Service) CreateCreativeReference(ctx context.Context, projectID uint, input CreativeReferenceInput) (model.CreativeReference, error) {
	item := domainsemantic.NewCreativeReference(domainsemantic.CreativeReferenceSpec{
		ProjectID:        projectID,
		SourceScriptID:   input.SourceScriptID,
		SourceAnalysisID: input.SourceAnalysisID,
		LegacySettingID:  input.LegacySettingID,
		Kind:             input.Kind,
		Name:             input.Name,
		Alias:            input.Alias,
		Description:      input.Description,
		Content:          input.Content,
		Importance:       input.Importance,
		Status:           input.Status,
		ProfileJSON:      input.ProfileJSON,
		TagsJSON:         input.TagsJSON,
	})
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchCreativeReference(ctx context.Context, projectID uint, id string, input CreativeReferenceInput) (model.CreativeReference, error) {
	var item model.CreativeReference
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"source_script_id":   input.SourceScriptID,
		"source_analysis_id": input.SourceAnalysisID,
		"legacy_setting_id":  input.LegacySettingID,
		"kind":               input.Kind,
		"name":               input.Name,
		"alias":              input.Alias,
		"description":        input.Description,
		"content":            input.Content,
		"importance":         input.Importance,
		"status":             input.Status,
		"profile_json":       input.ProfileJSON,
		"tags_json":          input.TagsJSON,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListCreativeReferenceStates(ctx context.Context, filter CreativeReferenceStateFilter) ([]model.CreativeReferenceState, error) {
	return s.repo.ListCreativeReferenceStates(ctx, filter)
}

func (s *Service) CreateCreativeReferenceState(ctx context.Context, projectID uint, input CreativeReferenceStateInput) (model.CreativeReferenceState, error) {
	if err := s.ensureCreativeReferenceInProject(ctx, projectID, input.CreativeReferenceID); err != nil {
		return model.CreativeReferenceState{}, err
	}
	item := domainsemantic.NewCreativeReferenceState(domainsemantic.CreativeReferenceStateSpec{
		ProjectID:           projectID,
		CreativeReferenceID: input.CreativeReferenceID,
		ScopeType:           input.ScopeType,
		ScopeID:             input.ScopeID,
		Name:                input.Name,
		Description:         input.Description,
		VisualNotes:         input.VisualNotes,
		Emotion:             input.Emotion,
		Costume:             input.Costume,
		Props:               input.Props,
		Status:              input.Status,
		TagsJSON:            input.TagsJSON,
		MetadataJSON:        input.MetadataJSON,
	})
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchCreativeReferenceState(ctx context.Context, projectID uint, id string, input CreativeReferenceStateInput) (model.CreativeReferenceState, error) {
	var item model.CreativeReferenceState
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.ensureCreativeReferenceInProject(ctx, projectID, input.CreativeReferenceID); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"creative_reference_id": input.CreativeReferenceID,
		"scope_type":            input.ScopeType,
		"scope_id":              input.ScopeID,
		"name":                  input.Name,
		"description":           input.Description,
		"visual_notes":          input.VisualNotes,
		"emotion":               input.Emotion,
		"costume":               input.Costume,
		"props":                 input.Props,
		"status":                input.Status,
		"tags_json":             input.TagsJSON,
		"metadata_json":         input.MetadataJSON,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListCreativeReferenceUsages(ctx context.Context, filter CreativeReferenceUsageFilter) ([]model.CreativeReferenceUsage, error) {
	return s.repo.ListCreativeReferenceUsages(ctx, filter)
}

func (s *Service) CreateCreativeReferenceUsage(ctx context.Context, projectID uint, input CreativeReferenceUsageInput) (model.CreativeReferenceUsage, error) {
	if err := s.validateCreativeReferenceUsageOwners(ctx, projectID, input); err != nil {
		return model.CreativeReferenceUsage{}, err
	}
	item := domainsemantic.NewCreativeReferenceUsage(domainsemantic.CreativeReferenceUsageSpec{
		ProjectID:                projectID,
		OwnerType:                input.OwnerType,
		OwnerID:                  input.OwnerID,
		CreativeReferenceID:      input.CreativeReferenceID,
		CreativeReferenceStateID: input.CreativeReferenceStateID,
		Role:                     input.Role,
		Order:                    input.Order,
		Evidence:                 input.Evidence,
		Source:                   input.Source,
		Status:                   input.Status,
		MetadataJSON:             input.MetadataJSON,
	})
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchCreativeReferenceUsage(ctx context.Context, projectID uint, id string, input CreativeReferenceUsageInput) (model.CreativeReferenceUsage, error) {
	var item model.CreativeReferenceUsage
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateCreativeReferenceUsageOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"owner_type":                  input.OwnerType,
		"owner_id":                    input.OwnerID,
		"creative_reference_id":       input.CreativeReferenceID,
		"creative_reference_state_id": input.CreativeReferenceStateID,
		"role":                        input.Role,
		"order":                       input.Order,
		"evidence":                    input.Evidence,
		"source":                      input.Source,
		"status":                      input.Status,
		"metadata_json":               input.MetadataJSON,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListCreativeRelationships(ctx context.Context, filter CreativeRelationshipFilter) ([]model.CreativeRelationship, error) {
	return s.repo.ListCreativeRelationships(ctx, filter)
}

func (s *Service) CreateCreativeRelationship(ctx context.Context, projectID uint, input CreativeRelationshipInput) (model.CreativeRelationship, error) {
	if err := s.validateCreativeRelationshipOwners(ctx, projectID, input); err != nil {
		return model.CreativeRelationship{}, err
	}
	item := domainsemantic.NewCreativeRelationship(domainsemantic.CreativeRelationshipSpec{
		ProjectID:                 projectID,
		SourceCreativeReferenceID: input.SourceCreativeReferenceID,
		TargetCreativeReferenceID: input.TargetCreativeReferenceID,
		ScopeType:                 input.ScopeType,
		ScopeID:                   input.ScopeID,
		Category:                  input.Category,
		Type:                      input.Type,
		Label:                     input.Label,
		Description:               input.Description,
		Source:                    input.Source,
		Status:                    input.Status,
		Evidence:                  input.Evidence,
		MetadataJSON:              input.MetadataJSON,
	})
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchCreativeRelationship(ctx context.Context, projectID uint, id string, input CreativeRelationshipInput) (model.CreativeRelationship, error) {
	var item model.CreativeRelationship
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateCreativeRelationshipOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"source_creative_reference_id": input.SourceCreativeReferenceID,
		"target_creative_reference_id": input.TargetCreativeReferenceID,
		"scope_type":                   input.ScopeType,
		"scope_id":                     input.ScopeID,
		"category":                     input.Category,
		"type":                         input.Type,
		"label":                        input.Label,
		"description":                  input.Description,
		"source":                       input.Source,
		"status":                       input.Status,
		"evidence":                     input.Evidence,
		"metadata_json":                input.MetadataJSON,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) validateCreativeReferenceUsageOwners(ctx context.Context, projectID uint, input CreativeReferenceUsageInput) error {
	if err := s.ensureOwnerInProject(ctx, projectID, input.OwnerType, input.OwnerID); err != nil {
		return err
	}
	if err := s.ensureCreativeReferenceInProject(ctx, projectID, input.CreativeReferenceID); err != nil {
		return err
	}
	if input.CreativeReferenceStateID != nil {
		if err := s.ensureCreativeReferenceStateInProject(ctx, projectID, *input.CreativeReferenceStateID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateCreativeRelationshipOwners(ctx context.Context, projectID uint, input CreativeRelationshipInput) error {
	if err := s.ensureCreativeReferenceInProject(ctx, projectID, input.SourceCreativeReferenceID); err != nil {
		return err
	}
	if err := s.ensureCreativeReferenceInProject(ctx, projectID, input.TargetCreativeReferenceID); err != nil {
		return err
	}
	if strings.TrimSpace(input.ScopeType) != "" && input.ScopeID != nil {
		if err := s.ensureOwnerInProject(ctx, projectID, input.ScopeType, *input.ScopeID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) ensureCreativeReferenceInProject(ctx context.Context, projectID uint, referenceID uint) error {
	return s.repo.EnsureCreativeReferenceInProject(ctx, projectID, referenceID)
}

func (s *Service) ensureCreativeReferenceStateInProject(ctx context.Context, projectID uint, stateID uint) error {
	return s.repo.EnsureCreativeReferenceStateInProject(ctx, projectID, stateID)
}

func (s *Service) ensureOwnerInProject(ctx context.Context, projectID uint, ownerType string, ownerID uint) error {
	return s.repo.EnsureOwnerInProject(ctx, projectID, ownerType, ownerID)
}

func (s *Service) ensureCanvasInProject(ctx context.Context, projectID uint, canvasID uint) error {
	return s.repo.EnsureCanvasInProject(ctx, projectID, canvasID)
}

func (s *Service) ensureCanvasRunInProject(ctx context.Context, projectID uint, runID uint) error {
	return s.repo.EnsureCanvasRunInProject(ctx, projectID, runID)
}

func (s *Service) ensureProjectScopedModelInProject(ctx context.Context, projectID uint, id uint, item any) error {
	return s.repo.EnsureProjectScopedModelInProject(ctx, projectID, id, item)
}

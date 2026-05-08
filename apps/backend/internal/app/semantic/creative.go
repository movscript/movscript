package semantic

import (
	"context"
	"strings"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

type CreativeReferenceFilter struct {
	ProjectID uint
	Kind      string
}

type CreativeReferenceInput struct {
	SourceScriptID   *uint  `json:"source_script_id"`
	SourceAnalysisID *uint  `json:"source_analysis_id"`
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

func (s *Service) ListCreativeReferences(ctx context.Context, filter CreativeReferenceFilter) ([]domainsemantic.CreativeReference, error) {
	return s.repo.ListCreativeReferences(ctx, filter)
}

func (s *Service) CreateCreativeReference(ctx context.Context, projectID uint, input CreativeReferenceInput) (domainsemantic.CreativeReference, error) {
	item := domainsemantic.NewCreativeReference(domainsemantic.CreativeReferenceSpec{
		ProjectID:        projectID,
		SourceScriptID:   input.SourceScriptID,
		SourceAnalysisID: input.SourceAnalysisID,
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
	return s.repo.CreateCreativeReference(ctx, item)
}

func (s *Service) PatchCreativeReference(ctx context.Context, projectID uint, id string, input CreativeReferenceInput) (domainsemantic.CreativeReference, error) {
	item, err := s.repo.LoadCreativeReference(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	patch := domainsemantic.CreativeReferencePatch{
		SourceScriptID:   input.SourceScriptID,
		SourceAnalysisID: input.SourceAnalysisID,
		Kind:             input.Kind,
		Name:             input.Name,
		Alias:            input.Alias,
		Description:      input.Description,
		Content:          input.Content,
		Importance:       input.Importance,
		Status:           input.Status,
		ProfileJSON:      input.ProfileJSON,
		TagsJSON:         input.TagsJSON,
	}
	return s.repo.PatchCreativeReference(ctx, item, patch)
}

func (s *Service) ListCreativeReferenceStates(ctx context.Context, filter CreativeReferenceStateFilter) ([]domainsemantic.CreativeReferenceState, error) {
	return s.repo.ListCreativeReferenceStates(ctx, filter)
}

func (s *Service) CreateCreativeReferenceState(ctx context.Context, projectID uint, input CreativeReferenceStateInput) (domainsemantic.CreativeReferenceState, error) {
	if err := s.ensureCreativeReferenceInProject(ctx, projectID, input.CreativeReferenceID); err != nil {
		return domainsemantic.CreativeReferenceState{}, err
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
	return s.repo.CreateCreativeReferenceState(ctx, item)
}

func (s *Service) PatchCreativeReferenceState(ctx context.Context, projectID uint, id string, input CreativeReferenceStateInput) (domainsemantic.CreativeReferenceState, error) {
	item, err := s.repo.LoadCreativeReferenceState(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.ensureCreativeReferenceInProject(ctx, projectID, input.CreativeReferenceID); err != nil {
		return item, err
	}
	patch := domainsemantic.CreativeReferenceStatePatch{
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
	}
	return s.repo.PatchCreativeReferenceState(ctx, item, patch)
}

func (s *Service) ListCreativeReferenceUsages(ctx context.Context, filter CreativeReferenceUsageFilter) ([]domainsemantic.CreativeReferenceUsage, error) {
	return s.repo.ListCreativeReferenceUsages(ctx, filter)
}

func (s *Service) CreateCreativeReferenceUsage(ctx context.Context, projectID uint, input CreativeReferenceUsageInput) (domainsemantic.CreativeReferenceUsage, error) {
	if err := s.validateCreativeReferenceUsageOwners(ctx, projectID, input); err != nil {
		return domainsemantic.CreativeReferenceUsage{}, err
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
	return s.repo.CreateCreativeReferenceUsage(ctx, item)
}

func (s *Service) PatchCreativeReferenceUsage(ctx context.Context, projectID uint, id string, input CreativeReferenceUsageInput) (domainsemantic.CreativeReferenceUsage, error) {
	item, err := s.repo.LoadCreativeReferenceUsage(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateCreativeReferenceUsageOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	patch := domainsemantic.CreativeReferenceUsagePatch{
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
	}
	return s.repo.PatchCreativeReferenceUsage(ctx, item, patch)
}

func (s *Service) ListCreativeRelationships(ctx context.Context, filter CreativeRelationshipFilter) ([]domainsemantic.CreativeRelationship, error) {
	return s.repo.ListCreativeRelationships(ctx, filter)
}

func (s *Service) CreateCreativeRelationship(ctx context.Context, projectID uint, input CreativeRelationshipInput) (domainsemantic.CreativeRelationship, error) {
	if err := s.validateCreativeRelationshipOwners(ctx, projectID, input); err != nil {
		return domainsemantic.CreativeRelationship{}, err
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
	return s.repo.CreateCreativeRelationship(ctx, item)
}

func (s *Service) PatchCreativeRelationship(ctx context.Context, projectID uint, id string, input CreativeRelationshipInput) (domainsemantic.CreativeRelationship, error) {
	item, err := s.repo.LoadCreativeRelationship(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateCreativeRelationshipOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	patch := domainsemantic.CreativeRelationshipPatch{
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
	}
	return s.repo.PatchCreativeRelationship(ctx, item, patch)
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

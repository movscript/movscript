package semantic

import (
	"context"
	"strings"

	"github.com/movscript/movscript/internal/app/workflowio"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

type AssetSlotFilter struct {
	ProjectID       uint
	ProductionID    uint
	Status          string
	OwnerType       string
	IncludeInternal string
}

type AssetSlotInput struct {
	ProductionID             *uint  `json:"production_id"`
	CreativeReferenceID      *uint  `json:"creative_reference_id"`
	CreativeReferenceStateID *uint  `json:"creative_reference_state_id"`
	OwnerType                string `json:"owner_type"`
	OwnerID                  *uint  `json:"owner_id"`
	Kind                     string `json:"kind"`
	Name                     string `json:"name" binding:"required"`
	Description              string `json:"description"`
	SlotKey                  string `json:"slot_key"`
	PromptHint               string `json:"prompt_hint"`
	Status                   string `json:"status"`
	Priority                 string `json:"priority"`
	ResourceID               *uint  `json:"resource_id"`
	LockedAssetSlotID        *uint  `json:"locked_asset_slot_id"`
	MetadataJSON             string `json:"metadata_json"`
}

type PatchAssetSlotInput struct {
	ProductionID             *uint  `json:"production_id"`
	CreativeReferenceID      *uint  `json:"creative_reference_id"`
	CreativeReferenceStateID *uint  `json:"creative_reference_state_id"`
	OwnerType                string `json:"owner_type"`
	OwnerID                  *uint  `json:"owner_id"`
	Kind                     string `json:"kind"`
	Name                     string `json:"name"`
	Description              string `json:"description"`
	SlotKey                  string `json:"slot_key"`
	PromptHint               string `json:"prompt_hint"`
	Status                   string `json:"status"`
	Priority                 string `json:"priority"`
	ResourceID               *uint  `json:"resource_id"`
	LockedAssetSlotID        *uint  `json:"locked_asset_slot_id"`
	MetadataJSON             string `json:"metadata_json"`
}

type AssetSlotCandidateFilter struct {
	ProjectID   uint
	AssetSlotID uint
	Status      string
}

type AssetSlotCandidateInput struct {
	AssetSlotID          uint    `json:"asset_slot_id" binding:"required"`
	CandidateAssetSlotID uint    `json:"candidate_asset_slot_id"`
	ResourceID           *uint   `json:"resource_id"`
	SourceType           string  `json:"source_type"`
	SourceID             *uint   `json:"source_id"`
	Score                float64 `json:"score"`
	Status               string  `json:"status"`
	Note                 string  `json:"note"`
}

type CandidateDecisionFilter struct {
	ProjectID         uint
	CandidateType     string
	CandidateID       uint
	CandidateClientID string
	Decision          string
	Status            string
}

type CandidateDecisionInput struct {
	CandidateType     string `json:"candidate_type" binding:"required"`
	CandidateID       *uint  `json:"candidate_id"`
	CandidateClientID string `json:"candidate_client_id"`
	TargetType        string `json:"target_type"`
	TargetID          *uint  `json:"target_id"`
	Decision          string `json:"decision" binding:"required"`
	Status            string `json:"status"`
	Reason            string `json:"reason"`
	Note              string `json:"note"`
	Source            string `json:"source"`
	DecidedByID       *uint  `json:"decided_by_id"`
	AppliedAt         string `json:"applied_at"`
	MetadataJSON      string `json:"metadata_json"`
}

type ReviewEventFilter struct {
	ProjectID       uint
	SubjectType     string
	SubjectID       uint
	SubjectClientID string
	EventType       string
}

type ReviewEventInput struct {
	SubjectType     string `json:"subject_type" binding:"required"`
	SubjectID       *uint  `json:"subject_id"`
	SubjectClientID string `json:"subject_client_id"`
	EventType       string `json:"event_type" binding:"required"`
	FromStatus      string `json:"from_status"`
	ToStatus        string `json:"to_status"`
	Comment         string `json:"comment"`
	Reason          string `json:"reason"`
	Source          string `json:"source"`
	ActorID         *uint  `json:"actor_id"`
	MetadataJSON    string `json:"metadata_json"`
}

func (s *Service) ListAssetSlots(ctx context.Context, filter AssetSlotFilter) ([]domainsemantic.AssetSlot, error) {
	return s.repo.ListAssetSlots(ctx, filter)
}

func (s *Service) CreateAssetSlot(ctx context.Context, projectID uint, input AssetSlotInput) (domainsemantic.AssetSlot, error) {
	if err := s.validateAssetSlotOwners(ctx, projectID, input.ProductionID, input.LockedAssetSlotID); err != nil {
		return domainsemantic.AssetSlot{}, err
	}
	item := domainsemantic.NewAssetSlot(domainsemantic.AssetSlotSpec{
		ProjectID:                projectID,
		ProductionID:             input.ProductionID,
		CreativeReferenceID:      input.CreativeReferenceID,
		CreativeReferenceStateID: input.CreativeReferenceStateID,
		OwnerType:                input.OwnerType,
		OwnerID:                  input.OwnerID,
		Kind:                     input.Kind,
		Name:                     input.Name,
		Description:              input.Description,
		SlotKey:                  input.SlotKey,
		PromptHint:               input.PromptHint,
		Status:                   input.Status,
		Priority:                 input.Priority,
		ResourceID:               input.ResourceID,
		LockedAssetSlotID:        input.LockedAssetSlotID,
		MetadataJSON:             input.MetadataJSON,
	})
	return s.repo.CreateAssetSlot(ctx, item)
}

func (s *Service) PatchAssetSlot(ctx context.Context, projectID uint, id string, input PatchAssetSlotInput) (domainsemantic.AssetSlot, error) {
	item, err := s.repo.LoadAssetSlot(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateAssetSlotOwners(ctx, projectID, input.ProductionID, input.LockedAssetSlotID); err != nil {
		return item, err
	}
	return s.repo.PatchAssetSlot(ctx, item, compactUpdates(map[string]any{
		"production_id":               input.ProductionID,
		"creative_reference_id":       input.CreativeReferenceID,
		"creative_reference_state_id": input.CreativeReferenceStateID,
		"owner_type":                  input.OwnerType,
		"owner_id":                    input.OwnerID,
		"kind":                        input.Kind,
		"name":                        input.Name,
		"description":                 input.Description,
		"slot_key":                    input.SlotKey,
		"prompt_hint":                 input.PromptHint,
		"status":                      input.Status,
		"priority":                    input.Priority,
		"resource_id":                 input.ResourceID,
		"locked_asset_slot_id":        input.LockedAssetSlotID,
		"metadata_json":               input.MetadataJSON,
	}))
}

func (s *Service) ListAssetSlotCandidates(ctx context.Context, filter AssetSlotCandidateFilter) ([]domainsemantic.AssetSlotCandidate, error) {
	return s.repo.ListAssetSlotCandidates(ctx, filter)
}

func (s *Service) CreateAssetSlotCandidate(ctx context.Context, projectID uint, input AssetSlotCandidateInput, userID uint) (domainsemantic.AssetSlotCandidate, error) {
	if err := s.ensureAssetSlotInProject(ctx, projectID, input.AssetSlotID); err != nil {
		return domainsemantic.AssetSlotCandidate{}, err
	}
	if input.ResourceID != nil && *input.ResourceID > 0 {
		result, err := s.repo.AttachAssetSlotCandidate(ctx, workflowio.AttachAssetSlotCandidateInput{
			ProjectID:   projectID,
			AssetSlotID: input.AssetSlotID,
			ResourceID:  *input.ResourceID,
			SourceType:  input.SourceType,
			SourceID:    input.SourceID,
			UserID:      userID,
			Score:       input.Score,
			Note:        input.Note,
			Slot:        "candidate",
		})
		if err != nil {
			return domainsemantic.AssetSlotCandidate{}, ErrInvalidInput{Err: err}
		}
		item := result.Candidate
		return s.repo.ReloadAssetSlotCandidate(ctx, &item)
	}
	if err := s.ensureAssetSlotInProject(ctx, projectID, input.CandidateAssetSlotID); err != nil {
		return domainsemantic.AssetSlotCandidate{}, err
	}
	item := domainsemantic.NewAssetSlotCandidate(domainsemantic.AssetSlotCandidateSpec{
		ProjectID:            projectID,
		AssetSlotID:          input.AssetSlotID,
		CandidateAssetSlotID: input.CandidateAssetSlotID,
		SourceType:           input.SourceType,
		SourceID:             input.SourceID,
		Score:                input.Score,
		Status:               input.Status,
		Note:                 input.Note,
	})
	return s.repo.CreateAssetSlotCandidate(ctx, item)
}

func (s *Service) PatchAssetSlotCandidate(ctx context.Context, projectID uint, id string, input AssetSlotCandidateInput) (domainsemantic.AssetSlotCandidate, error) {
	item, err := s.repo.LoadAssetSlotCandidate(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.ensureAssetSlotInProject(ctx, projectID, input.AssetSlotID); err != nil {
		return item, err
	}
	if err := s.ensureAssetSlotInProject(ctx, projectID, input.CandidateAssetSlotID); err != nil {
		return item, err
	}
	return s.repo.PatchAssetSlotCandidate(ctx, item, compactUpdates(map[string]any{
		"asset_slot_id":           input.AssetSlotID,
		"candidate_asset_slot_id": input.CandidateAssetSlotID,
		"source_type":             input.SourceType,
		"source_id":               input.SourceID,
		"score":                   input.Score,
		"status":                  input.Status,
		"note":                    input.Note,
	}))
}

func (s *Service) ListCandidateDecisions(ctx context.Context, filter CandidateDecisionFilter) ([]domainsemantic.CandidateDecision, error) {
	return s.repo.ListCandidateDecisions(ctx, filter)
}

func (s *Service) CreateCandidateDecision(ctx context.Context, projectID uint, input CandidateDecisionInput) (domainsemantic.CandidateDecision, error) {
	if err := s.validateCandidateDecisionOwners(ctx, projectID, input); err != nil {
		return domainsemantic.CandidateDecision{}, err
	}
	item := domainsemantic.NewCandidateDecision(domainsemantic.CandidateDecisionSpec{
		ProjectID:         projectID,
		CandidateType:     input.CandidateType,
		CandidateID:       input.CandidateID,
		CandidateClientID: input.CandidateClientID,
		TargetType:        input.TargetType,
		TargetID:          input.TargetID,
		Decision:          input.Decision,
		Status:            input.Status,
		Reason:            input.Reason,
		Note:              input.Note,
		Source:            input.Source,
		DecidedByID:       input.DecidedByID,
		AppliedAt:         input.AppliedAt,
		MetadataJSON:      input.MetadataJSON,
	})
	return s.repo.CreateCandidateDecision(ctx, item)
}

func (s *Service) PatchCandidateDecision(ctx context.Context, projectID uint, id string, input CandidateDecisionInput) (domainsemantic.CandidateDecision, error) {
	item, err := s.repo.LoadCandidateDecision(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateCandidateDecisionOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	return s.repo.PatchCandidateDecision(ctx, item, compactUpdates(map[string]any{
		"candidate_type":      input.CandidateType,
		"candidate_id":        input.CandidateID,
		"candidate_client_id": input.CandidateClientID,
		"target_type":         input.TargetType,
		"target_id":           input.TargetID,
		"decision":            input.Decision,
		"status":              input.Status,
		"reason":              input.Reason,
		"note":                input.Note,
		"source":              input.Source,
		"decided_by_id":       input.DecidedByID,
		"applied_at":          input.AppliedAt,
		"metadata_json":       input.MetadataJSON,
	}))
}

func (s *Service) ListReviewEvents(ctx context.Context, filter ReviewEventFilter) ([]domainsemantic.ReviewEvent, error) {
	return s.repo.ListReviewEvents(ctx, filter)
}

func (s *Service) CreateReviewEvent(ctx context.Context, projectID uint, input ReviewEventInput) (domainsemantic.ReviewEvent, error) {
	if err := s.validateScopedOwner(ctx, projectID, input.SubjectType, input.SubjectID); err != nil {
		return domainsemantic.ReviewEvent{}, err
	}
	item := domainsemantic.NewReviewEvent(domainsemantic.ReviewEventSpec{
		ProjectID:       projectID,
		SubjectType:     input.SubjectType,
		SubjectID:       input.SubjectID,
		SubjectClientID: input.SubjectClientID,
		EventType:       input.EventType,
		FromStatus:      input.FromStatus,
		ToStatus:        input.ToStatus,
		Comment:         input.Comment,
		Reason:          input.Reason,
		Source:          input.Source,
		ActorID:         input.ActorID,
		MetadataJSON:    input.MetadataJSON,
	})
	return s.repo.CreateReviewEvent(ctx, item)
}

func (s *Service) PatchReviewEvent(ctx context.Context, projectID uint, id string, input ReviewEventInput) (domainsemantic.ReviewEvent, error) {
	item, err := s.repo.LoadReviewEvent(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateScopedOwner(ctx, projectID, input.SubjectType, input.SubjectID); err != nil {
		return item, err
	}
	return s.repo.PatchReviewEvent(ctx, item, compactUpdates(map[string]any{
		"subject_type":      input.SubjectType,
		"subject_id":        input.SubjectID,
		"subject_client_id": input.SubjectClientID,
		"event_type":        input.EventType,
		"from_status":       input.FromStatus,
		"to_status":         input.ToStatus,
		"comment":           input.Comment,
		"reason":            input.Reason,
		"source":            input.Source,
		"actor_id":          input.ActorID,
		"metadata_json":     input.MetadataJSON,
	}))
}

func (s *Service) validateAssetSlotOwners(ctx context.Context, projectID uint, productionID *uint, lockedAssetSlotID *uint) error {
	if productionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *productionID); err != nil {
			return err
		}
	}
	if lockedAssetSlotID != nil {
		if err := s.ensureAssetSlotInProject(ctx, projectID, *lockedAssetSlotID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateCandidateDecisionOwners(ctx context.Context, projectID uint, input CandidateDecisionInput) error {
	if err := s.validateScopedOwner(ctx, projectID, input.CandidateType, input.CandidateID); err != nil {
		return err
	}
	if err := s.validateScopedOwner(ctx, projectID, input.TargetType, input.TargetID); err != nil {
		return err
	}
	return nil
}

func (s *Service) validateScopedOwner(ctx context.Context, projectID uint, ownerType string, ownerID *uint) error {
	if strings.TrimSpace(ownerType) == "" || ownerID == nil {
		return nil
	}
	return s.ensureOwnerInProject(ctx, projectID, ownerType, *ownerID)
}

func (s *Service) ensureAssetSlotInProject(ctx context.Context, projectID uint, assetSlotID uint) error {
	return s.repo.EnsureAssetSlotInProject(ctx, projectID, assetSlotID)
}

func truthyFilter(value string) bool {
	return domainsemantic.TruthyFilter(value)
}

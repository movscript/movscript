package semantic

import (
	"context"
	"strings"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	"github.com/movscript/movscript/internal/app/workflow"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

type AssetSlotFilter struct {
	ProjectID       uint
	ProductionID    uint
	Status          string
	OwnerType       string
	OwnerID         uint
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
	if assetSlotFilterUsesRelations(filter) {
		return s.listAssetSlotsFromRelations(ctx, filter)
	}
	return s.repo.ListAssetSlots(ctx, filter)
}

func assetSlotFilterUsesRelations(filter AssetSlotFilter) bool {
	return filter.ProductionID > 0 || (strings.TrimSpace(filter.OwnerType) != "" && filter.OwnerID > 0)
}

func (s *Service) listAssetSlotsFromRelations(ctx context.Context, filter AssetSlotFilter) ([]domainsemantic.AssetSlot, error) {
	selection := relationIDSelection{}
	if filter.ProductionID > 0 {
		ids, err := s.relatedTargetIDsOfTypes(ctx,
			assetSourceFilter(filter.ProjectID, "production", filter.ProductionID),
			"asset_slot",
			domainrelation.TypeNeedsAsset,
			domainrelation.TypeUsesAsset,
		)
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if ownerType := strings.TrimSpace(filter.OwnerType); ownerType != "" && filter.OwnerID > 0 {
		ids, err := s.relatedTargetIDsOfTypes(ctx,
			assetSourceFilter(filter.ProjectID, ownerType, filter.OwnerID),
			"asset_slot",
			domainrelation.TypeNeedsAsset,
			domainrelation.TypeUsesAsset,
			domainrelation.TypeHasAsset,
		)
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	slots := make([]domainsemantic.AssetSlot, 0, len(selection.ordered))
	for _, id := range selection.ordered {
		slot, err := s.repo.LoadAssetSlot(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(filter.Status) != "" && slot.Status != strings.TrimSpace(filter.Status) {
			continue
		}
		if !truthyFilter(filter.IncludeInternal) && strings.TrimSpace(slot.OwnerType) == "asset_slot" {
			continue
		}
		slots = append(slots, slot)
	}
	return slots, nil
}

func (s *Service) CreateAssetSlot(ctx context.Context, projectID uint, input AssetSlotInput) (domainsemantic.AssetSlot, error) {
	if err := s.validateAssetSlotOwners(ctx, projectID, input.ProductionID, input.CreativeReferenceID, input.CreativeReferenceStateID, input.OwnerType, input.OwnerID, input.LockedAssetSlotID); err != nil {
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
	var created domainsemantic.AssetSlot
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateAssetSlot(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertAssetSlotRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchAssetSlot(ctx context.Context, projectID uint, id string, input PatchAssetSlotInput) (domainsemantic.AssetSlot, error) {
	item, err := s.repo.LoadAssetSlot(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateAssetSlotOwners(ctx, projectID, input.ProductionID, input.CreativeReferenceID, input.CreativeReferenceStateID, input.OwnerType, input.OwnerID, input.LockedAssetSlotID); err != nil {
		return item, err
	}
	patch := domainsemantic.AssetSlotPatch{
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
	}
	var patched domainsemantic.AssetSlot
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchAssetSlot(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertAssetSlotRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertAssetSlotRelations(ctx context.Context, item domainsemantic.AssetSlot) error {
	for _, edgeType := range []string{domainrelation.TypeHasAsset, domainrelation.TypeNeedsAsset, domainrelation.TypeUsesAsset} {
		if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
			ProjectID: item.ProjectID,
			Category:  domainrelation.CategoryAsset,
			Type:      edgeType,
			Target:    domainrelation.NewEntityRef("asset_slot", item.ID),
		}); err != nil {
			return err
		}
	}
	for _, edgeType := range []string{domainrelation.TypeUsesResource, domainrelation.TypeLocks} {
		if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
			ProjectID: item.ProjectID,
			Category:  domainrelation.CategoryAsset,
			Type:      edgeType,
			Source:    domainrelation.NewEntityRef("asset_slot", item.ID),
		}); err != nil {
			return err
		}
	}
	if item.ProductionID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("production", *item.ProductionID),
			Target:    domainrelation.NewEntityRef("asset_slot", item.ID),
			Category:  domainrelation.CategoryAsset,
			Type:      domainrelation.TypeNeedsAsset,
			Label:     item.SlotKey,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.CreativeReferenceID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("creative_reference", *item.CreativeReferenceID),
			Target:    domainrelation.NewEntityRef("asset_slot", item.ID),
			Category:  domainrelation.CategoryAsset,
			Type:      domainrelation.TypeHasAsset,
			Label:     item.SlotKey,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.CreativeReferenceStateID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("creative_reference_state", *item.CreativeReferenceStateID),
			Target:    domainrelation.NewEntityRef("asset_slot", item.ID),
			Category:  domainrelation.CategoryAsset,
			Type:      domainrelation.TypeHasAsset,
			Label:     item.SlotKey,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.OwnerID != nil && strings.TrimSpace(item.OwnerType) != "" {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef(item.OwnerType, *item.OwnerID),
			Target:    domainrelation.NewEntityRef("asset_slot", item.ID),
			Category:  domainrelation.CategoryAsset,
			Type:      assetSlotOwnerRelationType(item),
			Label:     item.SlotKey,
			Status:    semanticRelationStatus(item.Status),
			Metadata: semanticRelationMetadata(map[string]any{
				"asset_slot_id": item.ID,
				"status":        item.Status,
				"kind":          item.Kind,
			}),
		}); err != nil {
			return err
		}
	}
	if item.ResourceID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("asset_slot", item.ID),
			Target:    domainrelation.NewEntityRef("raw_resource", *item.ResourceID),
			Category:  domainrelation.CategoryAsset,
			Type:      domainrelation.TypeUsesResource,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.LockedAssetSlotID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("asset_slot", item.ID),
			Target:    domainrelation.NewEntityRef("asset_slot", *item.LockedAssetSlotID),
			Category:  domainrelation.CategoryAsset,
			Type:      domainrelation.TypeLocks,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) upsertRelationEdge(ctx context.Context, input relationapp.EdgeInput) error {
	_, err := s.relations.UpsertEdge(ctx, input)
	return err
}

func assetSlotOwnerRelationType(slot domainsemantic.AssetSlot) string {
	switch strings.TrimSpace(slot.Status) {
	case "locked", "selected", "approved", "final":
		return domainrelation.TypeUsesAsset
	default:
		if slot.ResourceID != nil || slot.LockedAssetSlotID != nil {
			return domainrelation.TypeUsesAsset
		}
		return domainrelation.TypeNeedsAsset
	}
}

func (s *Service) ListAssetSlotCandidates(ctx context.Context, filter AssetSlotCandidateFilter) ([]domainsemantic.AssetSlotCandidate, error) {
	if filter.AssetSlotID > 0 {
		return s.listAssetSlotCandidatesFromRelations(ctx, filter)
	}
	return s.repo.ListAssetSlotCandidates(ctx, filter)
}

func (s *Service) listAssetSlotCandidatesFromRelations(ctx context.Context, filter AssetSlotCandidateFilter) ([]domainsemantic.AssetSlotCandidate, error) {
	edges, err := s.relations.ListEdges(ctx, assetCandidateForTargetFilter(filter.ProjectID, filter.AssetSlotID))
	if err != nil {
		return nil, err
	}
	selection := relationIDSelection{}
	for _, edge := range edges {
		if edge.Source.Type != "asset_slot" || edge.Target.Type != "asset_slot" || edge.Type != domainrelation.TypeCandidateFor {
			continue
		}
		id := relationMetadataUint(edge.Metadata, "asset_slot_candidate_id")
		if id == 0 {
			continue
		}
		if selection.seen == nil {
			selection.seen = make(map[uint]struct{})
		}
		if _, ok := selection.seen[id]; ok {
			continue
		}
		selection.seen[id] = struct{}{}
		selection.ordered = append(selection.ordered, id)
	}
	candidates := make([]domainsemantic.AssetSlotCandidate, 0, len(selection.ordered))
	for _, id := range selection.ordered {
		candidate, err := s.repo.LoadAssetSlotCandidate(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(filter.Status) != "" && candidate.Status != strings.TrimSpace(filter.Status) {
			continue
		}
		candidates = append(candidates, candidate)
	}
	return candidates, nil
}

func (s *Service) CreateAssetSlotCandidate(ctx context.Context, projectID uint, input AssetSlotCandidateInput, userID uint) (domainsemantic.AssetSlotCandidate, error) {
	if err := s.ensureAssetSlotInProject(ctx, projectID, input.AssetSlotID); err != nil {
		return domainsemantic.AssetSlotCandidate{}, err
	}
	if input.ResourceID != nil && *input.ResourceID > 0 {
		result, err := s.repo.AttachAssetSlotCandidate(ctx, workflow.AttachAssetSlotCandidateInput{
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
		return s.repo.ReloadAssetSlotCandidate(ctx, result.Candidate)
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
	var created domainsemantic.AssetSlotCandidate
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateAssetSlotCandidate(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertAssetSlotCandidateRelation(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
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
	patch := domainsemantic.AssetSlotCandidatePatch{
		AssetSlotID:          input.AssetSlotID,
		CandidateAssetSlotID: input.CandidateAssetSlotID,
		SourceType:           input.SourceType,
		SourceID:             input.SourceID,
		Score:                input.Score,
		Status:               input.Status,
		Note:                 input.Note,
	}
	var patched domainsemantic.AssetSlotCandidate
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchAssetSlotCandidate(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertAssetSlotCandidateRelation(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertAssetSlotCandidateRelation(ctx context.Context, item domainsemantic.AssetSlotCandidate) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID:        item.ProjectID,
		Category:         domainrelation.CategoryAsset,
		MetadataContains: semanticRelationMetadataMarker("asset_slot_candidate_id", item.ID),
	}); err != nil {
		return err
	}
	_, err := s.relations.UpsertEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("asset_slot", item.CandidateAssetSlotID),
		Target:    domainrelation.NewEntityRef("asset_slot", item.AssetSlotID),
		Category:  domainrelation.CategoryAsset,
		Type:      domainrelation.TypeCandidateFor,
		Weight:    item.Score,
		Status:    semanticRelationStatus(item.Status),
		Origin:    semanticRelationOrigin(item.SourceType),
		Evidence:  item.Note,
		Metadata: semanticRelationMetadata(map[string]any{
			"asset_slot_candidate_id": item.ID,
			"source_id":               item.SourceID,
		}),
	})
	return err
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
	var created domainsemantic.CandidateDecision
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateCandidateDecision(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertCandidateDecisionRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchCandidateDecision(ctx context.Context, projectID uint, id string, input CandidateDecisionInput) (domainsemantic.CandidateDecision, error) {
	item, err := s.repo.LoadCandidateDecision(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateCandidateDecisionOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	patch := domainsemantic.CandidateDecisionPatch{
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
	}
	var patched domainsemantic.CandidateDecision
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchCandidateDecision(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertCandidateDecisionRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertCandidateDecisionRelations(ctx context.Context, item domainsemantic.CandidateDecision) error {
	for _, edgeType := range []string{domainrelation.TypeDecides, domainrelation.TypeAppliesTo} {
		if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
			ProjectID: item.ProjectID,
			Category:  domainrelation.CategoryWorkflow,
			Type:      edgeType,
			Source:    domainrelation.NewEntityRef("candidate_decision", item.ID),
		}); err != nil {
			return err
		}
	}
	if item.CandidateID != nil && strings.TrimSpace(item.CandidateType) != "" {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("candidate_decision", item.ID),
			Target:    domainrelation.NewEntityRef(item.CandidateType, *item.CandidateID),
			Category:  domainrelation.CategoryWorkflow,
			Type:      domainrelation.TypeDecides,
			Label:     item.Decision,
			Status:    semanticRelationStatus(item.Status),
			Origin:    semanticRelationOrigin(item.Source),
			Evidence:  item.Reason,
		}); err != nil {
			return err
		}
	}
	if item.TargetID != nil && strings.TrimSpace(item.TargetType) != "" {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("candidate_decision", item.ID),
			Target:    domainrelation.NewEntityRef(item.TargetType, *item.TargetID),
			Category:  domainrelation.CategoryWorkflow,
			Type:      domainrelation.TypeAppliesTo,
			Label:     item.Decision,
			Status:    semanticRelationStatus(item.Status),
			Origin:    semanticRelationOrigin(item.Source),
			Evidence:  item.Note,
		}); err != nil {
			return err
		}
	}
	return nil
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
	var created domainsemantic.ReviewEvent
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateReviewEvent(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertReviewEventRelation(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchReviewEvent(ctx context.Context, projectID uint, id string, input ReviewEventInput) (domainsemantic.ReviewEvent, error) {
	item, err := s.repo.LoadReviewEvent(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateScopedOwner(ctx, projectID, input.SubjectType, input.SubjectID); err != nil {
		return item, err
	}
	patch := domainsemantic.ReviewEventPatch{
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
	}
	var patched domainsemantic.ReviewEvent
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchReviewEvent(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertReviewEventRelation(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertReviewEventRelation(ctx context.Context, item domainsemantic.ReviewEvent) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeReviews,
		Source:    domainrelation.NewEntityRef("review_event", item.ID),
	}); err != nil {
		return err
	}
	if item.SubjectID == nil || strings.TrimSpace(item.SubjectType) == "" {
		return nil
	}
	return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("review_event", item.ID),
		Target:    domainrelation.NewEntityRef(item.SubjectType, *item.SubjectID),
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeReviews,
		Label:     item.EventType,
		Status:    semanticRelationStatus(item.ToStatus),
		Origin:    semanticRelationOrigin(item.Source),
		Evidence:  item.Comment,
		Metadata: semanticRelationMetadata(map[string]any{
			"from_status": item.FromStatus,
			"to_status":   item.ToStatus,
			"reason":      item.Reason,
		}),
	})
}

func (s *Service) validateAssetSlotOwners(ctx context.Context, projectID uint, productionID *uint, creativeReferenceID *uint, creativeReferenceStateID *uint, ownerType string, ownerID *uint, lockedAssetSlotID *uint) error {
	if productionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *productionID); err != nil {
			return err
		}
	}
	if creativeReferenceID != nil {
		if err := s.ensureCreativeReferenceInProject(ctx, projectID, *creativeReferenceID); err != nil {
			return err
		}
	}
	if creativeReferenceStateID != nil {
		if err := s.ensureCreativeReferenceStateInProject(ctx, projectID, *creativeReferenceStateID); err != nil {
			return err
		}
	}
	if strings.TrimSpace(ownerType) != "" && ownerID != nil {
		if err := s.ensureOwnerInProject(ctx, projectID, ownerType, *ownerID); err != nil {
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

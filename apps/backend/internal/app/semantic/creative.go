package semantic

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

type CreativeReferenceFilter struct {
	ProjectID uint
	Kind      string
}

type CreativeReferenceInput struct {
	ProposalClientID string `json:"proposal_client_id"`
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
		ProposalClientID: input.ProposalClientID,
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
	var created domainsemantic.CreativeReference
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateCreativeReference(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertCreativeReferenceRelation(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchCreativeReference(ctx context.Context, projectID uint, id string, input CreativeReferenceInput) (domainsemantic.CreativeReference, error) {
	item, err := s.repo.LoadCreativeReference(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	patch := domainsemantic.CreativeReferencePatch{
		ProposalClientID: input.ProposalClientID,
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
	var patched domainsemantic.CreativeReference
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchCreativeReference(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertCreativeReferenceRelation(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) ListCreativeReferenceStates(ctx context.Context, filter CreativeReferenceStateFilter) ([]domainsemantic.CreativeReferenceState, error) {
	if filter.CreativeReferenceID > 0 {
		return s.listCreativeReferenceStatesFromRelations(ctx, filter)
	}
	return s.repo.ListCreativeReferenceStates(ctx, filter)
}

func (s *Service) listCreativeReferenceStatesFromRelations(ctx context.Context, filter CreativeReferenceStateFilter) ([]domainsemantic.CreativeReferenceState, error) {
	ids, err := s.relatedTargetIDs(ctx, creativeHasStateFilter(filter.ProjectID, filter.CreativeReferenceID), "creative_reference_state")
	if err != nil {
		return nil, err
	}
	states := make([]domainsemantic.CreativeReferenceState, 0, len(ids))
	for _, id := range ids {
		state, err := s.repo.LoadCreativeReferenceState(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		states = append(states, state)
	}
	return states, nil
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
	var created domainsemantic.CreativeReferenceState
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateCreativeReferenceState(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertCreativeReferenceStateRelation(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
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
	var patched domainsemantic.CreativeReferenceState
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchCreativeReferenceState(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertCreativeReferenceStateRelation(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) ListCreativeReferenceUsages(ctx context.Context, filter CreativeReferenceUsageFilter) ([]domainsemantic.CreativeReferenceUsage, error) {
	return s.listCreativeReferenceUsagesFromRelations(ctx, filter)
}

func (s *Service) listCreativeReferenceUsagesFromRelations(ctx context.Context, filter CreativeReferenceUsageFilter) ([]domainsemantic.CreativeReferenceUsage, error) {
	selectionIDs, err := s.creativeReferenceUsageIDsFromEdges(ctx, relationapp.EdgeFilter{
		ProjectID: filter.ProjectID,
		Category:  domainrelation.CategoryCreative,
		Type:      domainrelation.TypeUses,
	})
	if err != nil {
		return nil, err
	}
	selection := newRelationIDSelection(selectionIDs)
	if filter.CreativeReferenceID > 0 {
		ids, err := s.creativeReferenceUsageIDsFromEdges(ctx, creativeUsesTargetFilter(filter.ProjectID, filter.CreativeReferenceID))
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	if ownerType := strings.TrimSpace(filter.OwnerType); ownerType != "" {
		ids, err := s.creativeReferenceUsageIDsFromEdges(ctx, creativeUsesSourceFilter(filter.ProjectID, ownerType, filter.OwnerID))
		if err != nil {
			return nil, err
		}
		selection = selection.intersect(ids)
	}
	usages := make([]domainsemantic.CreativeReferenceUsage, 0, len(selection.ordered))
	for _, id := range selection.ordered {
		usage, err := s.repo.LoadCreativeReferenceUsage(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(filter.Status) != "" && usage.Status != strings.TrimSpace(filter.Status) {
			continue
		}
		usages = append(usages, usage)
	}
	return usages, nil
}

func (s *Service) creativeReferenceUsageIDsFromEdges(ctx context.Context, filter relationapp.EdgeFilter) ([]uint, error) {
	edges, err := s.relations.ListEdges(ctx, filter)
	if err != nil {
		return nil, err
	}
	ids := make([]uint, 0, len(edges))
	seen := make(map[uint]struct{}, len(edges))
	for _, edge := range edges {
		if edge.Type != domainrelation.TypeUses || edge.Target.Type != "creative_reference" {
			continue
		}
		id := relationMetadataUint(edge.Metadata, "creative_reference_usage_id")
		if id == 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids, nil
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
	var created domainsemantic.CreativeReferenceUsage
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateCreativeReferenceUsage(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertCreativeReferenceUsageRelation(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
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
	var patched domainsemantic.CreativeReferenceUsage
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchCreativeReferenceUsage(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertCreativeReferenceUsageRelation(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) ListCreativeRelationships(ctx context.Context, filter CreativeRelationshipFilter) ([]domainsemantic.CreativeRelationship, error) {
	return s.listCreativeRelationshipsFromRelations(ctx, filter)
}

func (s *Service) listCreativeRelationshipsFromRelations(ctx context.Context, filter CreativeRelationshipFilter) ([]domainsemantic.CreativeRelationship, error) {
	baseFilter := relationapp.EdgeFilter{
		ProjectID: filter.ProjectID,
		Category:  domainrelation.CategoryCreative,
	}
	if strings.TrimSpace(filter.Status) != "" {
		baseFilter.Status = strings.TrimSpace(filter.Status)
	}
	ids, err := s.creativeRelationshipIDsFromEdges(ctx, baseFilter, 0)
	if err != nil {
		return nil, err
	}
	selection := newRelationIDSelection(ids)
	if filter.CreativeReferenceID > 0 {
		outgoing, err := s.creativeRelationshipIDsFromEdges(ctx, creativeReferenceEdgeFilter(filter.ProjectID, filter.CreativeReferenceID), filter.CreativeReferenceID)
		if err != nil {
			return nil, err
		}
		incoming, err := s.creativeRelationshipIDsFromEdges(ctx, relationapp.EdgeFilter{
			ProjectID: filter.ProjectID,
			Category:  domainrelation.CategoryCreative,
			Target:    domainrelation.NewEntityRef("creative_reference", filter.CreativeReferenceID),
		}, filter.CreativeReferenceID)
		if err != nil {
			return nil, err
		}
		referenceSelection := newRelationIDSelection(outgoing)
		for _, id := range incoming {
			if _, ok := referenceSelection.seen[id]; ok {
				continue
			}
			referenceSelection.seen[id] = struct{}{}
			referenceSelection.ordered = append(referenceSelection.ordered, id)
		}
		selection = selection.intersect(referenceSelection.ordered)
	}
	relationships := make([]domainsemantic.CreativeRelationship, 0, len(selection.ordered))
	for _, id := range selection.ordered {
		relationship, err := s.repo.LoadCreativeRelationship(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(filter.ScopeType) != "" && relationship.ScopeType != strings.TrimSpace(filter.ScopeType) {
			continue
		}
		if strings.TrimSpace(filter.Status) != "" && relationship.Status != strings.TrimSpace(filter.Status) {
			continue
		}
		relationships = append(relationships, relationship)
	}
	return relationships, nil
}

func (s *Service) creativeRelationshipIDsFromEdges(ctx context.Context, filter relationapp.EdgeFilter, referenceID uint) ([]uint, error) {
	edges, err := s.relations.ListEdges(ctx, filter)
	if err != nil {
		return nil, err
	}
	ids := make([]uint, 0, len(edges))
	seen := make(map[uint]struct{}, len(edges))
	for _, edge := range edges {
		if edge.Source.Type != "creative_reference" || edge.Target.Type != "creative_reference" {
			continue
		}
		if referenceID > 0 && edge.Source.ID != referenceID && edge.Target.ID != referenceID {
			continue
		}
		id := relationMetadataUint(edge.Metadata, "creative_relationship_id")
		if id == 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids, nil
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
	var created domainsemantic.CreativeRelationship
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateCreativeRelationship(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertCreativeRelationshipRelation(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
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
	var patched domainsemantic.CreativeRelationship
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchCreativeRelationship(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertCreativeRelationshipRelation(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertCreativeReferenceRelation(ctx context.Context, item domainsemantic.CreativeReference) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryCreative,
		Type:      domainrelation.TypeOwns,
		Target:    domainrelation.NewEntityRef("creative_reference", item.ID),
	}); err != nil {
		return err
	}
	_, err := s.relations.UpsertEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("project", item.ProjectID),
		Target:    domainrelation.NewEntityRef("creative_reference", item.ID),
		Category:  domainrelation.CategoryCreative,
		Type:      domainrelation.TypeOwns,
		Status:    semanticRelationStatus(item.Status),
	})
	return err
}

func (s *Service) upsertCreativeReferenceStateRelation(ctx context.Context, item domainsemantic.CreativeReferenceState) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryCreative,
		Type:      domainrelation.TypeHasState,
		Target:    domainrelation.NewEntityRef("creative_reference_state", item.ID),
	}); err != nil {
		return err
	}
	_, err := s.relations.UpsertEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("creative_reference", item.CreativeReferenceID),
		Target:    domainrelation.NewEntityRef("creative_reference_state", item.ID),
		Category:  domainrelation.CategoryCreative,
		Type:      domainrelation.TypeHasState,
		Scope:     semanticRelationScope(item.ScopeType, item.ScopeID),
		Status:    semanticRelationStatus(item.Status),
	})
	return err
}

func (s *Service) upsertCreativeReferenceUsageRelation(ctx context.Context, item domainsemantic.CreativeReferenceUsage) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID:        item.ProjectID,
		Category:         domainrelation.CategoryCreative,
		MetadataContains: semanticRelationMetadataMarker("creative_reference_usage_id", item.ID),
	}); err != nil {
		return err
	}
	_, err := s.relations.UpsertEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef(item.OwnerType, item.OwnerID),
		Target:    domainrelation.NewEntityRef("creative_reference", item.CreativeReferenceID),
		Category:  domainrelation.CategoryCreative,
		Type:      domainrelation.TypeUses,
		Label:     item.Role,
		Order:     item.Order,
		Status:    semanticRelationStatus(item.Status),
		Origin:    semanticRelationOrigin(item.Source),
		Evidence:  item.Evidence,
		Metadata: semanticRelationMetadata(map[string]any{
			"creative_reference_usage_id": item.ID,
			"role":                        item.Role,
			"creative_reference_state_id": item.CreativeReferenceStateID,
		}),
	})
	return err
}

func (s *Service) upsertCreativeRelationshipRelation(ctx context.Context, item domainsemantic.CreativeRelationship) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID:        item.ProjectID,
		Category:         domainrelation.CategoryCreative,
		MetadataContains: semanticRelationMetadataMarker("creative_relationship_id", item.ID),
	}); err != nil {
		return err
	}
	category := strings.TrimSpace(item.Category)
	if category == "" || category == "relationship" {
		category = domainrelation.CategoryCreative
	}
	relationType := strings.TrimSpace(item.Type)
	if relationType == "" {
		relationType = domainrelation.TypeRelatedTo
	}
	_, err := s.relations.UpsertEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("creative_reference", item.SourceCreativeReferenceID),
		Target:    domainrelation.NewEntityRef("creative_reference", item.TargetCreativeReferenceID),
		Category:  category,
		Type:      relationType,
		Label:     item.Label,
		Scope:     semanticRelationScope(item.ScopeType, item.ScopeID),
		Status:    semanticRelationStatus(item.Status),
		Origin:    semanticRelationOrigin(item.Source),
		Evidence:  item.Evidence,
		Metadata: semanticRelationMetadata(map[string]any{
			"creative_relationship_id": item.ID,
			"description":              item.Description,
		}),
	})
	return err
}

func semanticRelationScope(scopeType string, scopeID *uint) domainrelation.EntityRef {
	scope := domainrelation.EntityRef{Type: strings.TrimSpace(scopeType)}
	if scopeID != nil {
		scope.ID = *scopeID
	}
	return scope
}

func semanticRelationOrigin(origin string) string {
	origin = strings.TrimSpace(origin)
	if origin == "" {
		return domainrelation.OriginSystem
	}
	return origin
}

func semanticRelationStatus(status string) string {
	status = strings.TrimSpace(status)
	switch status {
	case "", "active", "locked", "selected", "approved", domainrelation.StatusConfirmed:
		return domainrelation.StatusConfirmed
	case "ignored", "rejected", "archived":
		return status
	default:
		return status
	}
}

func semanticRelationMetadata(values map[string]any) string {
	if len(values) == 0 {
		return ""
	}
	raw, err := json.Marshal(values)
	if err != nil {
		return ""
	}
	return string(raw)
}

func semanticRelationMetadataMarker(key string, id uint) string {
	if key == "" || id == 0 {
		return ""
	}
	return `"` + key + `":` + strconv.FormatUint(uint64(id), 10)
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

package semantic

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

var errProjectProposalPreviewRollback = errors.New("project proposal apply preview rollback")

type ApplyProjectProposalRequest struct {
	Scope    string               `json:"scope"`
	Mode     string               `json:"mode"`
	Summary  string               `json:"summary"`
	Proposal *ProjectProposalTree `json:"proposal"`
}

type ProjectProposalTree struct {
	ProjectStyle       *ProjectStylePatch                      `json:"project_style"`
	CreativeReferences []ProjectProposalCreativeReferencePatch `json:"creative_references"`
	AssetSlots         []ProjectProposalAssetSlotPatch         `json:"asset_slots"`
}

type ProjectStylePatch struct {
	AspectRatio    *string  `json:"aspect_ratio"`
	ShotSizeSystem []string `json:"shot_size_system"`
	CameraLanguage *string  `json:"camera_language"`
	VisualStyle    *string  `json:"visual_style"`
	LightingStyle  *string  `json:"lighting_style"`
	ColorPalette   *string  `json:"color_palette"`
	PacingRules    *string  `json:"pacing_rules"`
	NegativeRules  []string `json:"negative_rules"`
}

type ProjectProposalCreativeReferencePatch struct {
	ClientID        string                          `json:"client_id"`
	ID              *uint                           `json:"id"`
	Fields          map[string]any                  `json:"fields"`
	MergeCandidates []ProjectProposalMergeCandidate `json:"merge_candidates"`
}

type ProjectProposalAssetSlotPatch struct {
	ClientID string                   `json:"client_id"`
	ID       *uint                    `json:"id"`
	Owner    *ProjectProposalOwnerRef `json:"owner"`
	Fields   map[string]any           `json:"fields"`
}

type ProjectProposalOwnerRef struct {
	Type     string `json:"type"`
	ID       *uint  `json:"id"`
	ClientID string `json:"client_id"`
}

type ProjectProposalMergeCandidate struct {
	SourceID *uint  `json:"source_id"`
	Reason   string `json:"reason"`
}

type projectProposalApplyState struct {
	creativeReferenceIDByClientID map[string]uint
}

type ApplyProjectProposalResponse struct {
	ProjectID uint                       `json:"project_id"`
	Counts    ProjectProposalApplyCounts `json:"counts"`
}

type ProjectProposalApplyCounts struct {
	CreativeReferencesCreated int `json:"creative_references_created"`
	CreativeReferencesUpdated int `json:"creative_references_updated"`
	CreativeReferencesMerged  int `json:"creative_references_merged"`
	CreativeReferencesDeleted int `json:"creative_references_deleted"`
	AssetSlotsCreated         int `json:"asset_slots_created"`
	AssetSlotsUpdated         int `json:"asset_slots_updated"`
	AssetSlotsDeleted         int `json:"asset_slots_deleted"`
	AssetSlotsReassigned      int `json:"asset_slots_reassigned"`
	CreativeReferenceUsages   int `json:"creative_reference_usages"`
	CreativeRelationships     int `json:"creative_relationships"`
	ProjectStyleUpdated       int `json:"project_style_updated"`
}

func (s *Service) ApplyProjectProposal(ctx context.Context, projectID uint, req ApplyProjectProposalRequest) (*ApplyProjectProposalResponse, error) {
	if projectID == 0 {
		return nil, ErrInvalidInput{Err: errors.New("project id is required")}
	}
	if req.Proposal == nil {
		return nil, ErrInvalidInput{Err: errors.New("proposal is required")}
	}

	resp, err := s.applyProjectProposalInTx(ctx, projectID, req)
	if err != nil {
		return nil, err
	}

	s.bumpProgressVersion(ctx, projectID)
	return resp, nil
}

func (s *Service) PreviewProjectProposalApply(ctx context.Context, projectID uint, req ApplyProjectProposalRequest) (*ApplyProjectProposalResponse, error) {
	if projectID == 0 {
		return nil, ErrInvalidInput{Err: errors.New("project id is required")}
	}
	if req.Proposal == nil {
		return nil, ErrInvalidInput{Err: errors.New("proposal is required")}
	}

	var resp *ApplyProjectProposalResponse
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := &Service{repo: txRepo, cache: s.cache}
		var err error
		resp, err = txSvc.applyProjectProposalInTx(ctx, projectID, req)
		if err != nil {
			return err
		}
		return errProjectProposalPreviewRollback
	})
	if errors.Is(err, errProjectProposalPreviewRollback) {
		return resp, nil
	}
	if err != nil {
		return nil, err
	}
	return resp, nil
}

func (s *Service) applyProjectProposalInTx(ctx context.Context, projectID uint, req ApplyProjectProposalRequest) (*ApplyProjectProposalResponse, error) {
	resp := &ApplyProjectProposalResponse{ProjectID: projectID}
	state := projectProposalApplyState{
		creativeReferenceIDByClientID: make(map[string]uint),
	}

	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := &Service{repo: txRepo, cache: s.cache}
		if req.Proposal.ProjectStyle != nil && req.Proposal.ProjectStyle.hasChanges() {
			if _, err := txRepo.PatchProjectStyle(ctx, projectID, *req.Proposal.ProjectStyle); err != nil {
				return err
			}
			resp.Counts.ProjectStyleUpdated = 1
		}
		for _, patch := range req.Proposal.CreativeReferences {
			if err := txSvc.applyProjectCreativeReferencePatch(ctx, projectID, patch, resp, &state); err != nil {
				return err
			}
		}
		for _, patch := range req.Proposal.AssetSlots {
			if err := txSvc.applyProjectAssetSlotPatch(ctx, projectID, patch, resp, &state); err != nil {
				return err
			}
		}
		if normalizeProjectProposalMode(req.Mode) == "snapshot" {
			if err := txSvc.applyProjectProposalSnapshotOmissions(ctx, projectID, req.Proposal, resp); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return resp, nil
}

func (s *Service) applyProjectProposalSnapshotOmissions(ctx context.Context, projectID uint, proposal *ProjectProposalTree, resp *ApplyProjectProposalResponse) error {
	if proposal == nil {
		return nil
	}
	keptReferenceIDs := make(map[uint]bool)
	for _, patch := range proposal.CreativeReferences {
		if patch.ID != nil && *patch.ID > 0 {
			keptReferenceIDs[*patch.ID] = true
		}
	}
	references, err := s.repo.ListCreativeReferences(ctx, CreativeReferenceFilter{ProjectID: projectID})
	if err != nil {
		return err
	}
	for _, reference := range references {
		if keptReferenceIDs[reference.ID] || !projectProposalReferenceActive(reference) {
			continue
		}
		if _, err := s.PatchCreativeReference(ctx, projectID, fmt.Sprint(reference.ID), CreativeReferenceInput{
			Name:        reference.Name,
			Kind:        reference.Kind,
			Description: reference.Description,
			Status:      "ignored",
		}); err != nil {
			return err
		}
		resp.Counts.CreativeReferencesDeleted++
	}

	keptAssetSlotIDs := make(map[uint]bool)
	for _, patch := range proposal.AssetSlots {
		if patch.ID != nil && *patch.ID > 0 {
			keptAssetSlotIDs[*patch.ID] = true
		}
	}
	slots, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, IncludeInternal: "true"})
	if err != nil {
		return err
	}
	for _, slot := range slots {
		if keptAssetSlotIDs[slot.ID] || !projectProposalAssetSlotActive(slot) {
			continue
		}
		if _, err := s.PatchAssetSlot(ctx, projectID, fmt.Sprint(slot.ID), PatchAssetSlotInput{
			ProductionID:             slot.ProductionID,
			CreativeReferenceID:      slot.CreativeReferenceID,
			CreativeReferenceStateID: slot.CreativeReferenceStateID,
			OwnerType:                slot.OwnerType,
			OwnerID:                  slot.OwnerID,
			Kind:                     slot.Kind,
			Name:                     slot.Name,
			Description:              slot.Description,
			SlotKey:                  slot.SlotKey,
			PromptHint:               slot.PromptHint,
			Status:                   "waived",
			Priority:                 slot.Priority,
			ResourceID:               slot.ResourceID,
			LockedAssetSlotID:        slot.LockedAssetSlotID,
			MetadataJSON:             slot.MetadataJSON,
		}); err != nil {
			return err
		}
		resp.Counts.AssetSlotsDeleted++
	}
	return nil
}

func (patch ProjectStylePatch) hasChanges() bool {
	return patch.AspectRatio != nil ||
		len(patch.ShotSizeSystem) > 0 ||
		patch.CameraLanguage != nil ||
		patch.VisualStyle != nil ||
		patch.LightingStyle != nil ||
		patch.ColorPalette != nil ||
		patch.PacingRules != nil ||
		len(patch.NegativeRules) > 0
}

func (patch ProjectStylePatch) normalizedMap() map[string]any {
	out := make(map[string]any)
	if patch.AspectRatio != nil {
		out["aspect_ratio"] = strings.TrimSpace(*patch.AspectRatio)
	}
	if len(patch.ShotSizeSystem) > 0 {
		out["shot_size_system"] = normalizedStringSlice(patch.ShotSizeSystem)
	}
	if patch.CameraLanguage != nil {
		out["camera_language"] = strings.TrimSpace(*patch.CameraLanguage)
	}
	if patch.VisualStyle != nil {
		out["visual_style"] = strings.TrimSpace(*patch.VisualStyle)
	}
	if patch.LightingStyle != nil {
		out["lighting_style"] = strings.TrimSpace(*patch.LightingStyle)
	}
	if patch.ColorPalette != nil {
		out["color_palette"] = strings.TrimSpace(*patch.ColorPalette)
	}
	if patch.PacingRules != nil {
		out["pacing_rules"] = strings.TrimSpace(*patch.PacingRules)
	}
	if len(patch.NegativeRules) > 0 {
		out["negative_rules"] = normalizedStringSlice(patch.NegativeRules)
	}
	return out
}

func normalizedStringSlice(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func mergeProjectStyleJSON(current string, patch ProjectStylePatch) (string, error) {
	merged := make(map[string]any)
	if strings.TrimSpace(current) != "" {
		if err := json.Unmarshal([]byte(current), &merged); err != nil {
			return "", fmt.Errorf("parse existing project style: %w", err)
		}
	}
	for key, value := range patch.normalizedMap() {
		merged[key] = value
	}
	raw, err := json.Marshal(merged)
	if err != nil {
		return "", fmt.Errorf("marshal project style: %w", err)
	}
	return string(raw), nil
}

func normalizeProjectProposalMode(mode string) string {
	if strings.TrimSpace(mode) == "snapshot" {
		return "snapshot"
	}
	return "patch"
}

func projectProposalReferenceActive(reference domainsemantic.CreativeReference) bool {
	status := strings.TrimSpace(reference.Status)
	return status != "ignored" && status != "merged"
}

func projectProposalAssetSlotActive(slot domainsemantic.AssetSlot) bool {
	status := strings.TrimSpace(slot.Status)
	return status != "ignored" && status != "waived" && status != "merged"
}

func (s *Service) applyProjectCreativeReferencePatch(ctx context.Context, projectID uint, patch ProjectProposalCreativeReferencePatch, resp *ApplyProjectProposalResponse, state *projectProposalApplyState) error {
	fields := patch.fields()
	if patch.ID == nil {
		input, err := creativeReferenceInputFromProposalFields(fields)
		if err != nil {
			return err
		}
		if strings.TrimSpace(input.Name) == "" {
			return ErrInvalidInput{Err: errors.New("creative reference patch requires fields.name for new references")}
		}
		if strings.TrimSpace(input.Kind) == "" {
			input.Kind = "character"
		}
		if strings.TrimSpace(input.Status) == "" {
			input.Status = domainsemantic.ProposalDraftStatusValue
		}
		created, err := s.CreateCreativeReference(ctx, projectID, input)
		if err != nil {
			return err
		}
		rememberProjectProposalCreativeReferenceID(state, patch.ClientID, fields, created.ID)
		resp.Counts.CreativeReferencesCreated++
		return nil
	}
	if len(fields) > 0 {
		input, err := creativeReferenceInputFromProposalFields(fields)
		if err != nil {
			return err
		}
		if _, err := s.PatchCreativeReference(ctx, projectID, fmt.Sprint(*patch.ID), input); err != nil {
			return err
		}
		if isProjectProposalSoftDeleteStatus(input.Status) {
			resp.Counts.CreativeReferencesDeleted++
		} else {
			resp.Counts.CreativeReferencesUpdated++
		}
	} else if _, err := s.repo.LoadCreativeReference(ctx, projectID, fmt.Sprint(*patch.ID)); err != nil {
		return err
	}
	rememberProjectProposalCreativeReferenceID(state, patch.ClientID, fields, *patch.ID)
	for _, candidate := range patch.MergeCandidates {
		if candidate.SourceID == nil || *candidate.SourceID == 0 {
			return ErrInvalidInput{Err: errors.New("creative reference merge candidate requires source_id")}
		}
		if err := s.applyProjectCreativeReferenceMerge(ctx, projectID, *patch.ID, []uint{*candidate.SourceID}, resp); err != nil {
			return err
		}
		resp.Counts.CreativeReferencesMerged++
	}
	return nil
}

func (s *Service) applyProjectCreativeReferenceMerge(ctx context.Context, projectID uint, targetID uint, sourceIDs []uint, resp *ApplyProjectProposalResponse) error {
	if len(sourceIDs) == 0 {
		return ErrInvalidInput{Err: errors.New("creative reference merge candidate requires source_id")}
	}

	targetSlots, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, IncludeInternal: "true"})
	if err != nil {
		return err
	}
	targetSlotSet := make(map[string]uint)
	for _, slot := range targetSlots {
		if slot.CreativeReferenceID != nil && *slot.CreativeReferenceID == targetID {
			targetSlotSet[assetSlotMergeKey(slot)] = slot.ID
		}
	}

	for _, sourceID := range sourceIDs {
		if sourceID == 0 || sourceID == targetID {
			continue
		}

		usages, err := s.repo.ListCreativeReferenceUsages(ctx, CreativeReferenceUsageFilter{ProjectID: projectID, CreativeReferenceID: sourceID})
		if err != nil {
			return err
		}
		for _, usage := range usages {
			input := CreativeReferenceUsageInput{
				OwnerType:                usage.OwnerType,
				OwnerID:                  usage.OwnerID,
				CreativeReferenceID:      targetID,
				CreativeReferenceStateID: usage.CreativeReferenceStateID,
				Role:                     usage.Role,
				Order:                    usage.Order,
				Evidence:                 usage.Evidence,
				Source:                   usage.Source,
				Status:                   usage.Status,
				MetadataJSON:             usage.MetadataJSON,
			}
			if _, err := s.PatchCreativeReferenceUsage(ctx, projectID, fmt.Sprint(usage.ID), input); err != nil {
				return err
			}
			resp.Counts.CreativeReferenceUsages++
		}

		relationships, err := s.repo.ListCreativeRelationships(ctx, CreativeRelationshipFilter{ProjectID: projectID, CreativeReferenceID: sourceID})
		if err != nil {
			return err
		}
		for _, relation := range relationships {
			sourceRefID := relation.SourceCreativeReferenceID
			targetRefID := relation.TargetCreativeReferenceID
			if sourceRefID == sourceID {
				sourceRefID = targetID
			}
			if targetRefID == sourceID {
				targetRefID = targetID
			}
			input := CreativeRelationshipInput{
				SourceCreativeReferenceID: sourceRefID,
				TargetCreativeReferenceID: targetRefID,
				ScopeType:                 relation.ScopeType,
				ScopeID:                   relation.ScopeID,
				Category:                  relation.Category,
				Type:                      relation.Type,
				Label:                     relation.Label,
				Description:               relation.Description,
				Source:                    relation.Source,
				Status:                    relation.Status,
				Evidence:                  relation.Evidence,
				MetadataJSON:              relation.MetadataJSON,
			}
			if sourceRefID == targetRefID {
				input.Status = "ignored"
			}
			if _, err := s.PatchCreativeRelationship(ctx, projectID, fmt.Sprint(relation.ID), input); err != nil {
				return err
			}
			resp.Counts.CreativeRelationships++
		}

		slots, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, IncludeInternal: "true"})
		if err != nil {
			return err
		}
		for _, slot := range slots {
			if slot.CreativeReferenceID == nil || *slot.CreativeReferenceID != sourceID {
				continue
			}
			key := assetSlotMergeKey(slot)
			if duplicateID, ok := targetSlotSet[key]; ok {
				if _, err := s.PatchAssetSlot(ctx, projectID, fmt.Sprint(slot.ID), PatchAssetSlotInput{
					CreativeReferenceID:      &targetID,
					Status:                   "waived",
					LockedAssetSlotID:        &duplicateID,
					OwnerType:                slot.OwnerType,
					OwnerID:                  slot.OwnerID,
					CreativeReferenceStateID: slot.CreativeReferenceStateID,
					ProductionID:             slot.ProductionID,
					Kind:                     slot.Kind,
					Name:                     slot.Name,
					Description:              slot.Description,
					SlotKey:                  slot.SlotKey,
					PromptHint:               slot.PromptHint,
					Priority:                 slot.Priority,
					ResourceID:               slot.ResourceID,
					MetadataJSON:             slot.MetadataJSON,
				}); err != nil {
					return err
				}
			} else {
				if _, err := s.PatchAssetSlot(ctx, projectID, fmt.Sprint(slot.ID), PatchAssetSlotInput{
					CreativeReferenceID:      &targetID,
					OwnerType:                slot.OwnerType,
					OwnerID:                  slot.OwnerID,
					CreativeReferenceStateID: slot.CreativeReferenceStateID,
					ProductionID:             slot.ProductionID,
					Kind:                     slot.Kind,
					Name:                     slot.Name,
					Description:              slot.Description,
					SlotKey:                  slot.SlotKey,
					PromptHint:               slot.PromptHint,
					Status:                   slot.Status,
					Priority:                 slot.Priority,
					ResourceID:               slot.ResourceID,
					LockedAssetSlotID:        slot.LockedAssetSlotID,
					MetadataJSON:             slot.MetadataJSON,
				}); err != nil {
					return err
				}
				targetSlotSet[key] = slot.ID
			}
			resp.Counts.AssetSlotsReassigned++
		}

		source, err := s.repo.LoadCreativeReference(ctx, projectID, fmt.Sprint(sourceID))
		if err != nil {
			return err
		}
		if _, err := s.repo.PatchCreativeReference(ctx, source, domainsemantic.CreativeReferencePatch{Status: "merged"}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) applyProjectAssetSlotPatch(ctx context.Context, projectID uint, patch ProjectProposalAssetSlotPatch, resp *ApplyProjectProposalResponse, state *projectProposalApplyState) error {
	fields := resolveProjectProposalAssetSlotFields(patch.fields(), patch.Owner, state)
	if patch.ID == nil {
		input, err := assetSlotInputFromProposalFields(fields)
		if err != nil {
			return err
		}
		if strings.TrimSpace(input.Name) == "" {
			return ErrInvalidInput{Err: errors.New("asset slot patch requires fields.name for new asset slots")}
		}
		if strings.TrimSpace(input.Kind) == "" {
			input.Kind = "image"
		}
		if strings.TrimSpace(input.Status) == "" {
			input.Status = domainsemantic.AssetSlotStatusMissing
		}
		if _, err := s.CreateAssetSlot(ctx, projectID, input); err != nil {
			return err
		}
		resp.Counts.AssetSlotsCreated++
		return nil
	}
	input, err := assetSlotPatchInputFromProposalFields(fields)
	if err != nil {
		return err
	}
	if _, err := s.PatchAssetSlot(ctx, projectID, fmt.Sprint(*patch.ID), input); err != nil {
		return err
	}
	if isProjectProposalSoftDeleteStatus(input.Status) {
		resp.Counts.AssetSlotsDeleted++
	} else {
		resp.Counts.AssetSlotsUpdated++
	}
	return nil
}

func isProjectProposalSoftDeleteStatus(status string) bool {
	switch strings.TrimSpace(status) {
	case "ignored", "waived":
		return true
	default:
		return false
	}
}

func rememberProjectProposalCreativeReferenceID(state *projectProposalApplyState, clientID string, fields map[string]any, id uint) {
	if state == nil || id == 0 {
		return
	}
	for _, key := range []string{
		clientID,
		fieldString(fields, "client_id"),
		fieldString(fields, "owner_client_id"),
	} {
		normalized := strings.TrimSpace(key)
		if normalized != "" {
			state.creativeReferenceIDByClientID[normalized] = id
		}
	}
}

func resolveProjectProposalAssetSlotFields(fields map[string]any, owner *ProjectProposalOwnerRef, state *projectProposalApplyState) map[string]any {
	next := make(map[string]any, len(fields)+3)
	for key, value := range fields {
		next[key] = value
	}
	if owner != nil {
		if strings.TrimSpace(owner.Type) != "" {
			next["owner_type"] = normalizeProjectProposalOwnerType(owner.Type)
		}
		if owner.ID != nil && *owner.ID > 0 {
			next["owner_id"] = *owner.ID
			if normalizeProjectProposalOwnerType(owner.Type) == "creative_reference" {
				next["creative_reference_id"] = *owner.ID
			}
		}
		if strings.TrimSpace(owner.ClientID) != "" {
			next["owner_client_id"] = owner.ClientID
		}
	}
	clientID := firstFieldString(next, "owner_client_id", "creative_reference_client_id", "reference_client_id")
	if clientID == "" {
		return next
	}
	if state == nil || len(state.creativeReferenceIDByClientID) == 0 {
		return next
	}
	resolvedID, ok := state.creativeReferenceIDByClientID[clientID]
	if !ok || resolvedID == 0 {
		return next
	}
	next["creative_reference_id"] = resolvedID
	next["owner_type"] = "creative_reference"
	next["owner_id"] = resolvedID
	return next
}

func normalizeProjectProposalOwnerType(value string) string {
	switch strings.TrimSpace(value) {
	default:
		return strings.TrimSpace(value)
	}
}

func (patch ProjectProposalCreativeReferencePatch) fields() map[string]any {
	if len(patch.Fields) > 0 {
		return patch.Fields
	}
	return map[string]any{}
}

func (patch ProjectProposalAssetSlotPatch) fields() map[string]any {
	if len(patch.Fields) > 0 {
		return patch.Fields
	}
	return map[string]any{}
}

func creativeReferenceInputFromProposalFields(fields map[string]any) (CreativeReferenceInput, error) {
	return CreativeReferenceInput{
		SourceScriptID:   fieldUint(fields, "source_script_id"),
		SourceAnalysisID: fieldUint(fields, "source_analysis_id"),
		Kind:             fieldString(fields, "kind"),
		Name:             fieldString(fields, "name"),
		Alias:            fieldString(fields, "alias"),
		Description:      fieldString(fields, "description"),
		Content:          fieldString(fields, "content"),
		Importance:       fieldString(fields, "importance"),
		Status:           fieldString(fields, "status"),
		ProfileJSON:      fieldString(fields, "profile_json"),
		TagsJSON:         fieldString(fields, "tags_json"),
	}, nil
}

func assetSlotInputFromProposalFields(fields map[string]any) (AssetSlotInput, error) {
	return AssetSlotInput{
		ProductionID:             fieldUint(fields, "production_id"),
		CreativeReferenceID:      fieldUint(fields, "creative_reference_id"),
		CreativeReferenceStateID: fieldUint(fields, "creative_reference_state_id"),
		OwnerType:                normalizeProjectProposalOwnerType(fieldString(fields, "owner_type")),
		OwnerID:                  fieldUint(fields, "owner_id"),
		Kind:                     fieldString(fields, "kind"),
		Name:                     fieldString(fields, "name"),
		Description:              fieldString(fields, "description"),
		SlotKey:                  fieldString(fields, "slot_key"),
		PromptHint:               fieldString(fields, "prompt_hint"),
		Status:                   fieldString(fields, "status"),
		Priority:                 fieldString(fields, "priority"),
		ResourceID:               fieldUint(fields, "resource_id"),
		LockedAssetSlotID:        fieldUint(fields, "locked_asset_slot_id"),
		MetadataJSON:             fieldString(fields, "metadata_json"),
	}, nil
}

func assetSlotPatchInputFromProposalFields(fields map[string]any) (PatchAssetSlotInput, error) {
	return PatchAssetSlotInput{
		ProductionID:             fieldUint(fields, "production_id"),
		CreativeReferenceID:      fieldUint(fields, "creative_reference_id"),
		CreativeReferenceStateID: fieldUint(fields, "creative_reference_state_id"),
		OwnerType:                normalizeProjectProposalOwnerType(fieldString(fields, "owner_type")),
		OwnerID:                  fieldUint(fields, "owner_id"),
		Kind:                     fieldString(fields, "kind"),
		Name:                     fieldString(fields, "name"),
		Description:              fieldString(fields, "description"),
		SlotKey:                  fieldString(fields, "slot_key"),
		PromptHint:               fieldString(fields, "prompt_hint"),
		Status:                   fieldString(fields, "status"),
		Priority:                 fieldString(fields, "priority"),
		ResourceID:               fieldUint(fields, "resource_id"),
		LockedAssetSlotID:        fieldUint(fields, "locked_asset_slot_id"),
		MetadataJSON:             fieldString(fields, "metadata_json"),
	}, nil
}

func fieldString(fields map[string]any, key string) string {
	value, ok := fields[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 64)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case uint:
		return strconv.FormatUint(uint64(typed), 10)
	default:
		return fmt.Sprint(value)
	}
}

func firstFieldString(fields map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(fieldString(fields, key)); value != "" {
			return value
		}
	}
	return ""
}

func fieldUint(fields map[string]any, key string) *uint {
	value, ok := fields[key]
	if !ok || value == nil {
		return nil
	}
	switch typed := value.(type) {
	case float64:
		if typed <= 0 {
			return nil
		}
		u := uint(typed)
		return &u
	case float32:
		if typed <= 0 {
			return nil
		}
		u := uint(typed)
		return &u
	case int:
		if typed <= 0 {
			return nil
		}
		u := uint(typed)
		return &u
	case int64:
		if typed <= 0 {
			return nil
		}
		u := uint(typed)
		return &u
	case uint:
		if typed == 0 {
			return nil
		}
		u := typed
		return &u
	case uint64:
		if typed == 0 {
			return nil
		}
		u := uint(typed)
		return &u
	case string:
		parsed, err := strconv.ParseUint(strings.TrimSpace(typed), 10, 64)
		if err != nil || parsed == 0 {
			return nil
		}
		u := uint(parsed)
		return &u
	default:
		return nil
	}
}

func assetSlotMergeKey(slot domainsemantic.AssetSlot) string {
	ownerID := ""
	if slot.OwnerID != nil {
		ownerID = fmt.Sprint(*slot.OwnerID)
	}
	return strings.Join([]string{
		strings.ToLower(strings.TrimSpace(slot.Kind)),
		strings.ToLower(strings.TrimSpace(slot.Name)),
		strings.ToLower(strings.TrimSpace(slot.OwnerType)),
		ownerID,
	}, ":")
}

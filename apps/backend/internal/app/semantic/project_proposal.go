package semantic

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	domainworkflow "github.com/movscript/movscript/internal/domain/workflow"
)

type ApplyProjectProposalRequest struct {
	Scope      string                     `json:"scope"`
	Summary    string                     `json:"summary"`
	Proposal   *ProjectProposalTree       `json:"proposal"`
	Operations []ProjectProposalOperation `json:"operations"`
}

type ProjectProposalTree struct {
	CreativeReferences []ProjectProposalOperation `json:"creative_references"`
	AssetSlots         []ProjectProposalOperation `json:"asset_slots"`
}

type ProjectProposalOperation struct {
	Action    string         `json:"action"`
	Entity    string         `json:"entity"`
	ID        *uint          `json:"id"`
	TargetID  *uint          `json:"target_id"`
	SourceIDs []uint         `json:"source_ids"`
	Payload   map[string]any `json:"payload"`
}

type ApplyProjectProposalResponse struct {
	ProjectID uint                       `json:"project_id"`
	Counts    ProjectProposalApplyCounts `json:"counts"`
}

type ProjectProposalApplyCounts struct {
	CreativeReferencesCreated int `json:"creative_references_created"`
	CreativeReferencesUpdated int `json:"creative_references_updated"`
	CreativeReferencesDeleted int `json:"creative_references_deleted"`
	CreativeReferencesMerged  int `json:"creative_references_merged"`
	AssetSlotsCreated         int `json:"asset_slots_created"`
	AssetSlotsUpdated         int `json:"asset_slots_updated"`
	AssetSlotsDeleted         int `json:"asset_slots_deleted"`
	AssetSlotsLocked          int `json:"asset_slots_locked"`
	AssetSlotsReassigned      int `json:"asset_slots_reassigned"`
	CreativeReferenceUsages   int `json:"creative_reference_usages"`
	CreativeRelationships     int `json:"creative_relationships"`
}

func (s *Service) ApplyProjectProposal(ctx context.Context, projectID uint, req ApplyProjectProposalRequest) (*ApplyProjectProposalResponse, error) {
	if projectID == 0 {
		return nil, ErrInvalidInput{Err: errors.New("project id is required")}
	}
	if req.Proposal == nil && len(req.Operations) == 0 {
		return nil, ErrInvalidInput{Err: errors.New("proposal is required")}
	}

	resp := &ApplyProjectProposalResponse{ProjectID: projectID}
	operations := collectProjectProposalOperations(req)

	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := &Service{repo: txRepo, cache: s.cache}
		for _, op := range operations {
			entityKind, err := normalizeProjectProposalEntityKind(op.Entity)
			if err != nil {
				return err
			}
			switch entityKind {
			case "creativeReferences":
				if err := txSvc.applyProjectCreativeReferenceProposal(ctx, projectID, op, resp); err != nil {
					return err
				}
			case "assetSlots":
				if err := txSvc.applyProjectAssetSlotProposal(ctx, projectID, op, resp); err != nil {
					return err
				}
			default:
				return ErrInvalidInput{Err: fmt.Errorf("unsupported project proposal entity %q", op.Entity)}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	s.bumpProgressVersion(ctx, projectID)
	return resp, nil
}

func collectProjectProposalOperations(req ApplyProjectProposalRequest) []ProjectProposalOperation {
	operations := make([]ProjectProposalOperation, 0, len(req.Operations))
	operations = append(operations, req.Operations...)
	if req.Proposal != nil {
		for _, op := range req.Proposal.CreativeReferences {
			if strings.TrimSpace(op.Entity) == "" {
				op.Entity = "creativeReferences"
			}
			operations = append(operations, op)
		}
		for _, op := range req.Proposal.AssetSlots {
			if strings.TrimSpace(op.Entity) == "" {
				op.Entity = "assetSlots"
			}
			operations = append(operations, op)
		}
	}
	return operations
}

func normalizeProjectProposalEntityKind(value string) (string, error) {
	normalized := strings.TrimSpace(value)
	switch normalized {
	case "creativeReferences", "creative_reference", "creative-reference", "reference":
		return "creativeReferences", nil
	case "assetSlots", "asset_slot", "asset-slot", "asset":
		return "assetSlots", nil
	default:
		return "", ErrInvalidInput{Err: fmt.Errorf("unsupported project proposal entity %q", value)}
	}
}

func normalizeProjectProposalAction(action string) string {
	normalized := strings.ToLower(strings.TrimSpace(action))
	if normalized == "" {
		return "create"
	}
	return normalized
}

func (s *Service) applyProjectCreativeReferenceProposal(ctx context.Context, projectID uint, op ProjectProposalOperation, resp *ApplyProjectProposalResponse) error {
	payload := op.payload()
	action := normalizeProjectProposalAction(op.Action)
	targetID := firstProjectProposalID(op.TargetID, op.ID)

	switch action {
	case "reuse":
		return nil
	case "create":
		input, err := creativeReferenceInputFromProposalPayload(payload)
		if err != nil {
			return err
		}
		if strings.TrimSpace(input.Name) == "" {
			return ErrInvalidInput{Err: errors.New("creative reference proposal requires name")}
		}
		if strings.TrimSpace(input.Kind) == "" {
			input.Kind = "character"
		}
		if strings.TrimSpace(input.Status) == "" {
			input.Status = domainsemantic.ProposalDraftStatusValue
		}
		if _, err := s.CreateCreativeReference(ctx, projectID, input); err != nil {
			return err
		}
		resp.Counts.CreativeReferencesCreated++
		return nil
	case "update":
		if targetID == nil {
			return missingProjectProposalID("creative_reference", op)
		}
		input, err := creativeReferenceInputFromProposalPayload(payload)
		if err != nil {
			return err
		}
		if _, err := s.PatchCreativeReference(ctx, projectID, fmt.Sprint(*targetID), input); err != nil {
			return err
		}
		resp.Counts.CreativeReferencesUpdated++
		return nil
	case "delete":
		if targetID == nil {
			return missingProjectProposalID("creative_reference", op)
		}
		if _, err := s.repo.DeleteProjectItemByKind(ctx, projectID, domainworkflow.EntityKindCreativeReference, fmt.Sprint(*targetID)); err != nil {
			return err
		}
		resp.Counts.CreativeReferencesDeleted++
		return nil
	case "merge":
		if targetID == nil {
			return missingProjectProposalID("creative_reference", op)
		}
		if err := s.applyProjectCreativeReferenceMerge(ctx, projectID, *targetID, op.SourceIDs, payload, resp); err != nil {
			return err
		}
		resp.Counts.CreativeReferencesMerged++
		return nil
	default:
		return ErrInvalidInput{Err: fmt.Errorf("creative reference proposal %q has unsupported action %q", op.Entity, op.Action)}
	}
}

func (s *Service) applyProjectCreativeReferenceMerge(ctx context.Context, projectID uint, targetID uint, sourceIDs []uint, payload map[string]any, resp *ApplyProjectProposalResponse) error {
	if len(sourceIDs) == 0 {
		return ErrInvalidInput{Err: errors.New("creative reference merge requires source_ids")}
	}
	if len(payload) > 0 {
		input, err := creativeReferenceInputFromProposalPayload(payload)
		if err != nil {
			return err
		}
		if _, err := s.PatchCreativeReference(ctx, projectID, fmt.Sprint(targetID), input); err != nil {
			return err
		}
		resp.Counts.CreativeReferencesUpdated++
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

func (s *Service) applyProjectAssetSlotProposal(ctx context.Context, projectID uint, op ProjectProposalOperation, resp *ApplyProjectProposalResponse) error {
	payload := op.payload()
	action := normalizeProjectProposalAction(op.Action)
	targetID := firstProjectProposalID(op.TargetID, op.ID)

	switch action {
	case "reuse":
		return nil
	case "create":
		input, err := assetSlotInputFromProposalPayload(payload)
		if err != nil {
			return err
		}
		if strings.TrimSpace(input.Name) == "" {
			return ErrInvalidInput{Err: errors.New("asset slot proposal requires name")}
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
	case "update":
		if targetID == nil {
			return missingProjectProposalID("asset_slot", op)
		}
		input, err := assetSlotPatchInputFromProposalPayload(payload)
		if err != nil {
			return err
		}
		if _, err := s.PatchAssetSlot(ctx, projectID, fmt.Sprint(*targetID), input); err != nil {
			return err
		}
		resp.Counts.AssetSlotsUpdated++
		return nil
	case "delete":
		if targetID == nil {
			return missingProjectProposalID("asset_slot", op)
		}
		if _, err := s.repo.DeleteProjectItemByKind(ctx, projectID, domainworkflow.EntityKindAssetSlot, fmt.Sprint(*targetID)); err != nil {
			return err
		}
		resp.Counts.AssetSlotsDeleted++
		return nil
	case "lock_asset":
		if targetID == nil {
			return missingProjectProposalID("asset_slot", op)
		}
		input, err := assetSlotPatchInputFromProposalPayload(payload)
		if err != nil {
			return err
		}
		input.Status = domainsemantic.AssetSlotStatusLocked
		if _, err := s.PatchAssetSlot(ctx, projectID, fmt.Sprint(*targetID), input); err != nil {
			return err
		}
		resp.Counts.AssetSlotsLocked++
		return nil
	default:
		return ErrInvalidInput{Err: fmt.Errorf("asset slot proposal %q has unsupported action %q", op.Entity, op.Action)}
	}
}

func (op ProjectProposalOperation) payload() map[string]any {
	if len(op.Payload) > 0 {
		return op.Payload
	}
	return map[string]any{}
}

func creativeReferenceInputFromProposalPayload(payload map[string]any) (CreativeReferenceInput, error) {
	return CreativeReferenceInput{
		SourceScriptID:   payloadUint(payload, "source_script_id"),
		SourceAnalysisID: payloadUint(payload, "source_analysis_id"),
		Kind:             payloadString(payload, "kind"),
		Name:             payloadString(payload, "name"),
		Alias:            payloadString(payload, "alias"),
		Description:      payloadString(payload, "description"),
		Content:          payloadString(payload, "content"),
		Importance:       payloadString(payload, "importance"),
		Status:           payloadString(payload, "status"),
		ProfileJSON:      payloadString(payload, "profile_json"),
		TagsJSON:         payloadString(payload, "tags_json"),
	}, nil
}

func assetSlotInputFromProposalPayload(payload map[string]any) (AssetSlotInput, error) {
	return AssetSlotInput{
		ProductionID:             payloadUint(payload, "production_id"),
		CreativeReferenceID:      payloadUint(payload, "creative_reference_id"),
		CreativeReferenceStateID: payloadUint(payload, "creative_reference_state_id"),
		OwnerType:                payloadString(payload, "owner_type"),
		OwnerID:                  payloadUint(payload, "owner_id"),
		Kind:                     payloadString(payload, "kind"),
		Name:                     payloadString(payload, "name"),
		Description:              payloadString(payload, "description"),
		SlotKey:                  payloadString(payload, "slot_key"),
		PromptHint:               payloadString(payload, "prompt_hint"),
		Status:                   payloadString(payload, "status"),
		Priority:                 payloadString(payload, "priority"),
		ResourceID:               payloadUint(payload, "resource_id"),
		LockedAssetSlotID:        payloadUint(payload, "locked_asset_slot_id"),
		MetadataJSON:             payloadString(payload, "metadata_json"),
	}, nil
}

func assetSlotPatchInputFromProposalPayload(payload map[string]any) (PatchAssetSlotInput, error) {
	return PatchAssetSlotInput{
		ProductionID:             payloadUint(payload, "production_id"),
		CreativeReferenceID:      payloadUint(payload, "creative_reference_id"),
		CreativeReferenceStateID: payloadUint(payload, "creative_reference_state_id"),
		OwnerType:                payloadString(payload, "owner_type"),
		OwnerID:                  payloadUint(payload, "owner_id"),
		Kind:                     payloadString(payload, "kind"),
		Name:                     payloadString(payload, "name"),
		Description:              payloadString(payload, "description"),
		SlotKey:                  payloadString(payload, "slot_key"),
		PromptHint:               payloadString(payload, "prompt_hint"),
		Status:                   payloadString(payload, "status"),
		Priority:                 payloadString(payload, "priority"),
		ResourceID:               payloadUint(payload, "resource_id"),
		LockedAssetSlotID:        payloadUint(payload, "locked_asset_slot_id"),
		MetadataJSON:             payloadString(payload, "metadata_json"),
	}, nil
}

func payloadString(payload map[string]any, key string) string {
	value, ok := payload[key]
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

func payloadUint(payload map[string]any, key string) *uint {
	value, ok := payload[key]
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

func payloadUintSlice(payload map[string]any, key string) []uint {
	value, ok := payload[key]
	if !ok || value == nil {
		return nil
	}
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]uint, 0, len(items))
	for _, item := range items {
		wrapper := map[string]any{"value": item}
		if parsed := payloadUint(wrapper, "value"); parsed != nil {
			result = append(result, *parsed)
		}
	}
	return result
}

func firstProjectProposalID(values ...*uint) *uint {
	for _, value := range values {
		if value != nil && *value > 0 {
			return value
		}
	}
	return nil
}

func missingProjectProposalID(kind string, op ProjectProposalOperation) error {
	return ErrInvalidInput{Err: fmt.Errorf("%s proposal %q requires id for action %q", kind, op.Entity, op.Action)}
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

func (op *ProjectProposalOperation) UnmarshalJSON(data []byte) error {
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	targetID := payloadUint(raw, "target_id")
	if targetID == nil {
		targetID = payloadUint(raw, "targetId")
	}
	sourceIDs := payloadUintSlice(raw, "source_ids")
	if len(sourceIDs) == 0 {
		sourceIDs = payloadUintSlice(raw, "sourceIds")
	}
	*op = ProjectProposalOperation{
		Action:    payloadString(raw, "action"),
		Entity:    payloadString(raw, "entity"),
		ID:        payloadUint(raw, "id"),
		TargetID:  targetID,
		SourceIDs: sourceIDs,
	}
	if payload, ok := raw["payload"].(map[string]any); ok {
		op.Payload = payload
	}
	if len(op.Payload) > 0 {
		return nil
	}
	for _, key := range []string{"action", "entity", "id", "target_id", "targetId", "source_ids", "sourceIds", "payload"} {
		delete(raw, key)
	}
	if len(raw) > 0 {
		op.Payload = raw
	}
	return nil
}

func (op ProjectProposalOperation) MarshalJSON() ([]byte, error) {
	type alias struct {
		Action    string         `json:"action"`
		Entity    string         `json:"entity"`
		ID        *uint          `json:"id,omitempty"`
		TargetID  *uint          `json:"target_id,omitempty"`
		SourceIDs []uint         `json:"source_ids,omitempty"`
		Payload   map[string]any `json:"payload,omitempty"`
	}
	return json.Marshal(alias{
		Action:    op.Action,
		Entity:    op.Entity,
		ID:        op.ID,
		TargetID:  op.TargetID,
		SourceIDs: op.SourceIDs,
		Payload:   op.Payload,
	})
}

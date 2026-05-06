package workflowio

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type AttachAssetSlotCandidateInput struct {
	ProjectID   uint
	AssetSlotID uint
	ResourceID  uint
	SourceType  string
	SourceID    *uint
	CanvasID    uint
	RunID       uint
	NodeID      string
	UserID      uint
	Score       float64
	Note        string
	Slot        string
}

type AttachAssetSlotCandidateResult struct {
	AssetSlot       model.AssetSlot          `json:"asset_slot"`
	CandidateSlot   model.AssetSlot          `json:"candidate_asset_slot"`
	Candidate       model.AssetSlotCandidate `json:"candidate"`
	ResourceBinding model.ResourceBinding    `json:"resource_binding"`
}

func (s *EntityIOService) AttachAssetSlotCandidate(ctx context.Context, input AttachAssetSlotCandidateInput) (AttachAssetSlotCandidateResult, error) {
	var result AttachAssetSlotCandidateResult
	if input.ProjectID == 0 {
		return result, fmt.Errorf("project_id is required")
	}
	if input.AssetSlotID == 0 {
		return result, fmt.Errorf("asset_slot_id is required")
	}
	if input.ResourceID == 0 {
		return result, fmt.Errorf("resource_id is required")
	}
	sourceType := strings.TrimSpace(input.SourceType)
	if sourceType == "" {
		sourceType = "canvas"
	}
	slot := strings.TrimSpace(input.Slot)
	if slot == "" {
		slot = "candidate"
	}

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txSvc := &EntityIOService{db: tx.Session(&gorm.Session{SkipHooks: true})}
		var sourceSlot model.AssetSlot
		if err := tx.WithContext(ctx).First(&sourceSlot, input.AssetSlotID).Error; err != nil {
			return fmt.Errorf("asset slot not found")
		}
		if sourceSlot.ProjectID != input.ProjectID {
			return fmt.Errorf("asset slot does not belong to project")
		}
		var resource model.RawResource
		if err := tx.WithContext(ctx).Select("id", "type", "name").First(&resource, input.ResourceID).Error; err != nil {
			return fmt.Errorf("resource not found")
		}

		candidateSlot, err := txSvc.findOrCreateCandidateAssetSlot(ctx, sourceSlot, resource, input)
		if err != nil {
			return err
		}
		binding, err := txSvc.findOrCreateCandidateResourceBinding(ctx, candidateSlot, input, sourceType, slot)
		if err != nil {
			return err
		}
		candidate, err := txSvc.findOrCreateAssetSlotCandidate(ctx, sourceSlot, candidateSlot, input, sourceType)
		if err != nil {
			return err
		}
		if sourceSlot.Status == "" || sourceSlot.Status == "missing" || sourceSlot.Status == "draft" {
			if err := txSvc.db.WithContext(ctx).Model(&sourceSlot).Update("status", "candidate").Error; err != nil {
				return err
			}
			if err := entityrelation.SyncCoreEntityRelations(txSvc.db.WithContext(ctx), &sourceSlot); err != nil {
				return err
			}
			sourceSlot.Status = "candidate"
		}
		if err := txSvc.createAssetSlotOperationAudit(ctx, sourceSlot.ID, "attach_candidate", map[string]any{
			"resource_id":             input.ResourceID,
			"candidate_asset_slot_id": candidateSlot.ID,
			"asset_slot_candidate_id": candidate.ID,
			"resource_binding_id":     binding.ID,
			"source_type":             sourceType,
			"source_id":               input.SourceID,
		}, input); err != nil {
			return err
		}

		result.AssetSlot = sourceSlot
		result.CandidateSlot = candidateSlot
		result.Candidate = candidate
		result.ResourceBinding = binding
		return nil
	})
	return result, err
}

func (s *EntityIOService) findOrCreateCandidateAssetSlot(ctx context.Context, sourceSlot model.AssetSlot, resource model.RawResource, input AttachAssetSlotCandidateInput) (model.AssetSlot, error) {
	var candidateSlot model.AssetSlot
	err := s.db.WithContext(ctx).
		Where("project_id = ? AND owner_type = ? AND owner_id = ? AND resource_id = ?", input.ProjectID, "asset_slot", sourceSlot.ID, input.ResourceID).
		Order("id asc").
		First(&candidateSlot).Error
	if err == nil {
		return candidateSlot, nil
	}
	if err != gorm.ErrRecordNotFound {
		return candidateSlot, err
	}
	ownerID := sourceSlot.ID
	name := strings.TrimSpace(sourceSlot.Name)
	if name == "" {
		name = fmt.Sprintf("素材位 #%d", sourceSlot.ID)
	}
	resourceType := firstNonEmpty(resource.Type, sourceSlot.Kind, "image")
	candidateSlot = model.AssetSlot{
		ProjectID:                input.ProjectID,
		ProductionID:             sourceSlot.ProductionID,
		CreativeReferenceID:      sourceSlot.CreativeReferenceID,
		CreativeReferenceStateID: sourceSlot.CreativeReferenceStateID,
		OwnerType:                "asset_slot",
		OwnerID:                  &ownerID,
		Kind:                     resourceType,
		Name:                     name + " · 生成候选",
		Description:              firstNonEmpty(sourceSlot.Description, sourceSlot.PromptHint, resource.Name),
		SlotKey:                  sourceSlot.SlotKey,
		PromptHint:               sourceSlot.PromptHint,
		Status:                   "candidate",
		Priority:                 firstNonEmpty(sourceSlot.Priority, "normal"),
		ResourceID:               &input.ResourceID,
		MetadataJSON:             operationMetadataJSON(input, "attach_candidate"),
	}
	if err := s.db.WithContext(ctx).Create(&candidateSlot).Error; err != nil {
		return candidateSlot, err
	}
	if err := entityrelation.SyncCoreEntityRelations(s.db.WithContext(ctx), &candidateSlot); err != nil {
		return candidateSlot, err
	}
	return candidateSlot, nil
}

func (s *EntityIOService) findOrCreateCandidateResourceBinding(ctx context.Context, candidateSlot model.AssetSlot, input AttachAssetSlotCandidateInput, sourceType string, slot string) (model.ResourceBinding, error) {
	var binding model.ResourceBinding
	err := s.db.WithContext(ctx).Where(
		"project_id = ? AND resource_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND version = ?",
		input.ProjectID, input.ResourceID, "asset_slot", candidateSlot.ID, "output", slot, 1,
	).First(&binding).Error
	if err == nil {
		return binding, nil
	}
	if err != gorm.ErrRecordNotFound {
		return binding, err
	}
	binding = model.ResourceBinding{
		ProjectID:    input.ProjectID,
		ResourceID:   input.ResourceID,
		OwnerType:    "asset_slot",
		OwnerID:      candidateSlot.ID,
		Role:         "output",
		Slot:         slot,
		Version:      1,
		IsPrimary:    true,
		Status:       "selected",
		SourceType:   sourceType,
		SourceID:     input.SourceID,
		MetadataJSON: operationMetadataJSON(input, "attach_candidate"),
		CreatedByID:  uintPtrOrNil(input.UserID),
	}
	if err := s.createEntityResourceBinding(ctx, &binding); err != nil {
		return binding, err
	}
	return binding, nil
}

func (s *EntityIOService) findOrCreateAssetSlotCandidate(ctx context.Context, sourceSlot model.AssetSlot, candidateSlot model.AssetSlot, input AttachAssetSlotCandidateInput, sourceType string) (model.AssetSlotCandidate, error) {
	var candidate model.AssetSlotCandidate
	err := s.db.WithContext(ctx).
		Where("project_id = ? AND asset_slot_id = ? AND candidate_asset_slot_id = ?", input.ProjectID, sourceSlot.ID, candidateSlot.ID).
		First(&candidate).Error
	if err == nil {
		updates := map[string]any{"source_type": sourceType}
		if input.SourceID != nil {
			updates["source_id"] = input.SourceID
		}
		if input.Score != 0 {
			updates["score"] = input.Score
		}
		if strings.TrimSpace(input.Note) != "" {
			updates["note"] = input.Note
		}
		if candidate.Status == "" || candidate.Status == "pending" {
			updates["status"] = "candidate"
		}
		if err := s.db.WithContext(ctx).Model(&candidate).Updates(updates).Error; err != nil {
			return candidate, err
		}
		_ = s.db.WithContext(ctx).First(&candidate, candidate.ID).Error
		if err := entityrelation.SyncCoreEntityRelations(s.db.WithContext(ctx), &candidate); err != nil {
			return candidate, err
		}
		return candidate, nil
	}
	if err != gorm.ErrRecordNotFound {
		return candidate, err
	}
	note := strings.TrimSpace(input.Note)
	if note == "" {
		note = "由实体操作写入候选"
	}
	candidate = model.AssetSlotCandidate{
		ProjectID:            input.ProjectID,
		AssetSlotID:          sourceSlot.ID,
		CandidateAssetSlotID: candidateSlot.ID,
		SourceType:           sourceType,
		SourceID:             input.SourceID,
		Score:                input.Score,
		Status:               "candidate",
		Note:                 note,
	}
	if err := s.db.WithContext(ctx).Create(&candidate).Error; err != nil {
		return candidate, err
	}
	if err := entityrelation.SyncCoreEntityRelations(s.db.WithContext(ctx), &candidate); err != nil {
		return candidate, err
	}
	return candidate, nil
}

func (s *EntityIOService) createAssetSlotOperationAudit(ctx context.Context, assetSlotID uint, portID string, payload map[string]any, input AttachAssetSlotCandidateInput) error {
	raw, _ := json.Marshal(payload)
	audit := model.CanvasEntityWriteAudit{
		CanvasID:     input.CanvasID,
		CanvasRunID:  input.RunID,
		CanvasNodeID: input.NodeID,
		PortID:       portID,
		EntityKind:   "asset_slot",
		EntityID:     assetSlotID,
		UserID:       input.UserID,
		NewValueJSON: string(raw),
	}
	return s.db.WithContext(ctx).Create(&audit).Error
}

func operationMetadataJSON(input AttachAssetSlotCandidateInput, operation string) string {
	payload := map[string]any{
		"operation":      operation,
		"canvas_id":      input.CanvasID,
		"canvas_run_id":  input.RunID,
		"canvas_node_id": input.NodeID,
	}
	b, _ := json.Marshal(payload)
	return string(b)
}

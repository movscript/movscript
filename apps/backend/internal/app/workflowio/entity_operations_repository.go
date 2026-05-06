package workflowio

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/model"
	domainresourcebinding "github.com/movscript/movscript/internal/domain/resourcebinding"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	"gorm.io/gorm"
)

type repository interface {
	AttachAssetSlotCandidate(ctx context.Context, input AttachAssetSlotCandidateInput) (AttachAssetSlotCandidateResult, error)
	WriteEntityPorts(ctx context.Context, kind string, id uint, values map[string]EntityPortValue, projectID uint, sourceType string, meta EntityWriteMeta) (EntityWriteResult, error)
	FirstBindingBySlot(ctx context.Context, ownerType string, ownerID uint, slot string) (model.ResourceBinding, bool, error)
	FirstBindingByRole(ctx context.Context, ownerType string, ownerID uint, role string) (model.ResourceBinding, bool, error)
	LoadEntityRow(ctx context.Context, table string, columns []string, id uint) (map[string]any, error)
	LoadScriptComputedFields(ctx context.Context, id uint) (model.Script, error)
	ListAssetSlotCandidates(ctx context.Context, assetSlotID uint) ([]model.AssetSlotCandidate, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) AttachAssetSlotCandidate(ctx context.Context, input AttachAssetSlotCandidateInput) (AttachAssetSlotCandidateResult, error) {
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
		sourceType = domainresourcebinding.SourceTypeCanvas
	}
	slot := strings.TrimSpace(input.Slot)
	if slot == "" {
		slot = "candidate"
	}

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		txRepo := &gormRepository{db: tx}
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

		candidateSlot, err := txRepo.findOrCreateCandidateAssetSlot(ctx, sourceSlot, resource, input)
		if err != nil {
			return err
		}
		binding, err := txRepo.findOrCreateCandidateResourceBinding(ctx, candidateSlot, input, sourceType, slot)
		if err != nil {
			return err
		}
		candidate, err := txRepo.findOrCreateAssetSlotCandidate(ctx, sourceSlot, candidateSlot, input, sourceType)
		if err != nil {
			return err
		}
		beforeStatus := sourceSlot.Status
		domainsemantic.MarkAssetSlotCandidate(&sourceSlot)
		if sourceSlot.Status != beforeStatus {
			if err := txRepo.db.WithContext(ctx).Model(&sourceSlot).Update("status", sourceSlot.Status).Error; err != nil {
				return err
			}
			if err := entityrelation.SyncCoreEntityRelations(txRepo.db.WithContext(ctx), &sourceSlot); err != nil {
				return err
			}
		}
		if err := txRepo.createAssetSlotOperationAudit(ctx, sourceSlot.ID, "attach_candidate", map[string]any{
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

func (r *gormRepository) findOrCreateCandidateAssetSlot(ctx context.Context, sourceSlot model.AssetSlot, resource model.RawResource, input AttachAssetSlotCandidateInput) (model.AssetSlot, error) {
	var candidateSlot model.AssetSlot
	err := r.db.WithContext(ctx).
		Where("project_id = ? AND owner_type = ? AND owner_id = ? AND resource_id = ?", input.ProjectID, domainresourcebinding.OwnerTypeAssetSlot, sourceSlot.ID, input.ResourceID).
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
		OwnerType:                domainresourcebinding.OwnerTypeAssetSlot,
		OwnerID:                  &ownerID,
		Kind:                     resourceType,
		Name:                     name + " · 生成候选",
		Description:              firstNonEmpty(sourceSlot.Description, sourceSlot.PromptHint, resource.Name),
		SlotKey:                  sourceSlot.SlotKey,
		PromptHint:               sourceSlot.PromptHint,
		Status:                   domainsemantic.AssetSlotStatusCandidate,
		Priority:                 firstNonEmpty(sourceSlot.Priority, "normal"),
		ResourceID:               &input.ResourceID,
		MetadataJSON:             operationMetadataJSON(input, "attach_candidate"),
	}
	if err := r.db.WithContext(ctx).Create(&candidateSlot).Error; err != nil {
		return candidateSlot, err
	}
	if err := entityrelation.SyncCoreEntityRelations(r.db.WithContext(ctx), &candidateSlot); err != nil {
		return candidateSlot, err
	}
	return candidateSlot, nil
}

func (r *gormRepository) findOrCreateCandidateResourceBinding(ctx context.Context, candidateSlot model.AssetSlot, input AttachAssetSlotCandidateInput, sourceType string, slot string) (model.ResourceBinding, error) {
	var binding model.ResourceBinding
	err := r.db.WithContext(ctx).Where(
		"project_id = ? AND resource_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND version = ?",
		input.ProjectID, input.ResourceID, domainresourcebinding.OwnerTypeAssetSlot, candidateSlot.ID, domainresourcebinding.RoleOutput, slot, 1,
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
		OwnerType:    domainresourcebinding.OwnerTypeAssetSlot,
		OwnerID:      candidateSlot.ID,
		Role:         domainresourcebinding.RoleOutput,
		Slot:         slot,
		Version:      1,
		IsPrimary:    true,
		Status:       domainresourcebinding.StatusSelected,
		SourceType:   sourceType,
		SourceID:     input.SourceID,
		MetadataJSON: operationMetadataJSON(input, "attach_candidate"),
		CreatedByID:  uintPtrOrNil(input.UserID),
	}
	if err := r.createEntityResourceBinding(ctx, &binding); err != nil {
		return binding, err
	}
	return binding, nil
}

func (r *gormRepository) findOrCreateAssetSlotCandidate(ctx context.Context, sourceSlot model.AssetSlot, candidateSlot model.AssetSlot, input AttachAssetSlotCandidateInput, sourceType string) (model.AssetSlotCandidate, error) {
	var candidate model.AssetSlotCandidate
	err := r.db.WithContext(ctx).
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
		beforeStatus := candidate.Status
		domainsemantic.NormalizeAssetSlotCandidate(&candidate)
		if candidate.Status != beforeStatus {
			updates["status"] = candidate.Status
		}
		if err := r.db.WithContext(ctx).Model(&candidate).Updates(updates).Error; err != nil {
			return candidate, err
		}
		_ = r.db.WithContext(ctx).First(&candidate, candidate.ID).Error
		if err := entityrelation.SyncCoreEntityRelations(r.db.WithContext(ctx), &candidate); err != nil {
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
		Status:               domainsemantic.AssetSlotCandidateStatusCandidate,
		Note:                 note,
	}
	if err := r.db.WithContext(ctx).Create(&candidate).Error; err != nil {
		return candidate, err
	}
	if err := entityrelation.SyncCoreEntityRelations(r.db.WithContext(ctx), &candidate); err != nil {
		return candidate, err
	}
	return candidate, nil
}

func (r *gormRepository) createEntityResourceBinding(ctx context.Context, binding *model.ResourceBinding) error {
	db := r.db.WithContext(ctx)
	if err := db.Create(binding).Error; err != nil {
		return err
	}
	if err := entityrelation.SyncCoreEntityRelations(db, binding); err != nil {
		return err
	}
	if binding.IsPrimary {
		if err := db.Model(&model.ResourceBinding{}).
			Where("project_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND id <> ?",
				binding.ProjectID, binding.OwnerType, binding.OwnerID, binding.Role, binding.Slot, binding.ID).
			Update("is_primary", false).Error; err != nil {
			return err
		}
	}
	if binding.OwnerType == domainresourcebinding.OwnerTypeAssetSlot && binding.ResourceID != 0 && binding.Role != domainresourcebinding.RoleCandidate {
		update := db.Model(&model.AssetSlot{}).
			Where("id = ? AND resource_id IS NULL", binding.OwnerID).
			Update("resource_id", binding.ResourceID)
		if update.Error != nil {
			return update.Error
		}
		if update.RowsAffected > 0 {
			slot := model.AssetSlot{}
			slot.ID = binding.OwnerID
			if err := entityrelation.SyncCoreEntityRelations(db, &slot); err != nil {
				return err
			}
		}
	}
	return nil
}

func (r *gormRepository) createAssetSlotOperationAudit(ctx context.Context, assetSlotID uint, portID string, payload map[string]any, input AttachAssetSlotCandidateInput) error {
	raw, _ := json.Marshal(payload)
	audit := model.CanvasEntityWriteAudit{
		CanvasID:     input.CanvasID,
		CanvasRunID:  input.RunID,
		CanvasNodeID: input.NodeID,
		PortID:       portID,
		EntityKind:   domainresourcebinding.OwnerTypeAssetSlot,
		EntityID:     assetSlotID,
		UserID:       input.UserID,
		NewValueJSON: string(raw),
	}
	return r.db.WithContext(ctx).Create(&audit).Error
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

package workflowio

import (
	"context"
	"fmt"
	"time"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/model"
	domainresourcebinding "github.com/movscript/movscript/internal/domain/resourcebinding"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	"gorm.io/gorm"
)

func (r *gormRepository) WriteEntityPorts(ctx context.Context, kind string, id uint, values map[string]EntityPortValue, projectID uint, sourceType string, meta EntityWriteMeta) (EntityWriteResult, error) {
	result := EntityWriteResult{ProjectID: projectID}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txDB := tx.Session(&gorm.Session{SkipHooks: true})
		txRepo := &gormRepository{db: txDB}
		txSvc := &EntityIOService{repo: txRepo}
		oldValues, _ := txSvc.ReadPorts(ctx, kind, id)
		if err := txRepo.writeEntityFields(ctx, kind, id, values); err != nil {
			return err
		}
		if err := txRepo.syncEntityRelationsForKind(ctx, kind, id); err != nil {
			return err
		}
		if kind == "asset_slot" {
			bindingIDs, err := txRepo.writeAssetSlotCandidates(ctx, id, values["candidates"], projectID, sourceType, meta)
			if err != nil {
				return err
			}
			if len(bindingIDs) > 0 {
				result.BindingIDs = append(result.BindingIDs, bindingIDs...)
			}
		}

		bindingIDsByPort := map[string][]uint{}
		for portID, value := range values {
			if kind == "asset_slot" && portID == "candidates" {
				continue
			}
			field, ok := EntityFieldForPort(kind, portID)
			if !ok || field.Binding == nil {
				continue
			}
			for _, resourceID := range value.ResourceIDs {
				if resourceID == 0 {
					continue
				}
				if result.PrimaryResourceID == nil {
					rid := resourceID
					result.PrimaryResourceID = &rid
				}
				binding := model.ResourceBinding{
					ProjectID:    projectID,
					ResourceID:   resourceID,
					OwnerType:    kind,
					OwnerID:      id,
					Role:         field.Binding.Role,
					Slot:         field.Binding.Slot,
					IsPrimary:    field.Binding.IsPrimary,
					Status:       domainresourcebinding.StatusSelected,
					SourceType:   sourceType,
					CreatedByID:  uintPtrOrNil(meta.UserID),
					MetadataJSON: fmt.Sprintf(`{"canvas_node_id":%q,"canvas_run_id":%d}`, meta.NodeID, meta.RunID),
				}
				if meta.CanvasID != 0 {
					binding.SourceID = &meta.CanvasID
				}
				if err := txRepo.createEntityResourceBinding(ctx, &binding); err != nil {
					return err
				}
				result.BindingIDs = append(result.BindingIDs, binding.ID)
				bindingIDsByPort[portID] = append(bindingIDsByPort[portID], binding.ID)
			}
		}
		return txRepo.createEntityWriteAudits(ctx, kind, id, values, oldValues, bindingIDsByPort, meta)
	})
	if err != nil {
		return result, err
	}
	return result, nil
}

func (r *gormRepository) writeEntityFields(ctx context.Context, kind string, id uint, values map[string]EntityPortValue) error {
	updates := entityFieldUpdates(kind, values)
	if len(updates) == 0 {
		return nil
	}
	table, ok := entityTableName(kind)
	if !ok {
		return fmt.Errorf("unsupported entity type %q", kind)
	}
	updates["updated_at"] = time.Now()
	return r.db.WithContext(ctx).Table(table).Where("id = ?", id).Updates(updates).Error
}

func (r *gormRepository) writeAssetSlotCandidates(ctx context.Context, slotID uint, value EntityPortValue, projectID uint, sourceType string, meta EntityWriteMeta) ([]uint, error) {
	if len(value.ResourceIDs) == 0 {
		return nil, nil
	}
	var slot model.AssetSlot
	if err := r.db.WithContext(ctx).First(&slot, slotID).Error; err != nil {
		return nil, fmt.Errorf("asset_slot not found")
	}
	bindingIDs := []uint{}
	for _, resourceID := range value.ResourceIDs {
		if resourceID == 0 {
			continue
		}
		var existingCandidate model.AssetSlotCandidate
		err := r.db.WithContext(ctx).
			Joins("JOIN asset_slots candidate_slots ON candidate_slots.id = asset_slot_candidates.candidate_asset_slot_id").
			Where("asset_slot_candidates.asset_slot_id = ? AND candidate_slots.resource_id = ?", slotID, resourceID).
			First(&existingCandidate).Error
		if err == nil {
			continue
		}
		if err != nil && err != gorm.ErrRecordNotFound {
			return bindingIDs, err
		}
		candidateSlot := model.AssetSlot{
			ProjectID:                projectID,
			ProductionID:             slot.ProductionID,
			CreativeReferenceID:      slot.CreativeReferenceID,
			CreativeReferenceStateID: slot.CreativeReferenceStateID,
			OwnerType:                domainresourcebinding.OwnerTypeAssetSlot,
			OwnerID:                  &slotID,
			Kind:                     slot.Kind,
			Name:                     candidateSlotName(slot, resourceID),
			Description:              slot.Description,
			SlotKey:                  slot.SlotKey,
			PromptHint:               slot.PromptHint,
			Status:                   domainsemantic.AssetSlotStatusCandidate,
			Priority:                 slot.Priority,
			ResourceID:               &resourceID,
			MetadataJSON:             fmt.Sprintf(`{"source":"asset_slot_candidates","candidate_for_slot_id":%d}`, slotID),
		}
		if err := r.db.WithContext(ctx).Create(&candidateSlot).Error; err != nil {
			return bindingIDs, err
		}
		if err := entityrelation.SyncCoreEntityRelations(r.db.WithContext(ctx), &candidateSlot); err != nil {
			return bindingIDs, err
		}
		candidate := model.AssetSlotCandidate{
			ProjectID:            projectID,
			AssetSlotID:          slotID,
			CandidateAssetSlotID: candidateSlot.ID,
			SourceType:           sourceType,
			Status:               domainsemantic.AssetSlotCandidateStatusCandidate,
			Note:                 "由素材槽候选集输入创建",
		}
		if meta.CanvasID != 0 {
			candidate.SourceID = &meta.CanvasID
		}
		if err := r.db.WithContext(ctx).Create(&candidate).Error; err != nil {
			return bindingIDs, err
		}
		if err := entityrelation.SyncCoreEntityRelations(r.db.WithContext(ctx), &candidate); err != nil {
			return bindingIDs, err
		}
		binding := model.ResourceBinding{
			ProjectID:    projectID,
			ResourceID:   resourceID,
			OwnerType:    domainresourcebinding.OwnerTypeAssetSlot,
			OwnerID:      candidateSlot.ID,
			Role:         domainresourcebinding.RoleCandidate,
			Slot:         "candidates",
			IsPrimary:    true,
			Status:       domainresourcebinding.StatusSelected,
			SourceType:   sourceType,
			CreatedByID:  uintPtrOrNil(meta.UserID),
			MetadataJSON: fmt.Sprintf(`{"canvas_node_id":%q,"canvas_run_id":%d,"asset_slot_id":%d}`, meta.NodeID, meta.RunID, slotID),
		}
		if meta.CanvasID != 0 {
			binding.SourceID = &meta.CanvasID
		}
		if err := r.createEntityResourceBinding(ctx, &binding); err != nil {
			return bindingIDs, err
		}
		bindingIDs = append(bindingIDs, binding.ID)
	}
	return bindingIDs, nil
}

func (r *gormRepository) syncEntityRelationsForKind(ctx context.Context, kind string, id uint) error {
	db := r.db.WithContext(ctx)
	switch kind {
	case "segment":
		item := model.Segment{}
		item.ID = id
		return entityrelation.SyncCoreEntityRelations(db, &item)
	case "scene_moment":
		item := model.SceneMoment{}
		item.ID = id
		return entityrelation.SyncCoreEntityRelations(db, &item)
	case "creative_reference":
		item := model.CreativeReference{}
		item.ID = id
		return entityrelation.SyncCoreEntityRelations(db, &item)
	case "asset_slot":
		item := model.AssetSlot{}
		item.ID = id
		return entityrelation.SyncCoreEntityRelations(db, &item)
	case "content_unit":
		item := model.ContentUnit{}
		item.ID = id
		return entityrelation.SyncCoreEntityRelations(db, &item)
	default:
		return nil
	}
}

func (r *gormRepository) createEntityWriteAudits(
	ctx context.Context,
	kind string,
	id uint,
	values map[string]EntityPortValue,
	oldValues map[string]EntityPortValue,
	bindingIDsByPort map[string][]uint,
	meta EntityWriteMeta,
) error {
	audits := buildEntityWriteAudits(kind, id, values, oldValues, bindingIDsByPort, meta)
	if len(audits) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Create(&audits).Error
}

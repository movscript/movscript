package workflowio

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
)

func (r *gormRepository) FirstBindingBySlot(ctx context.Context, ownerType string, ownerID uint, slot string) (model.ResourceBinding, bool, error) {
	var binding model.ResourceBinding
	err := r.db.WithContext(ctx).
		Where("owner_type = ? AND owner_id = ?", ownerType, ownerID).
		Where("slot = ?", slot).
		Order("is_primary desc, updated_at desc").
		First(&binding).Error
	if err != nil {
		return binding, false, err
	}
	return binding, binding.ResourceID != 0, nil
}

func (r *gormRepository) FirstBindingByRole(ctx context.Context, ownerType string, ownerID uint, role string) (model.ResourceBinding, bool, error) {
	var binding model.ResourceBinding
	err := r.db.WithContext(ctx).
		Where("owner_type = ? AND owner_id = ?", ownerType, ownerID).
		Where("role = ?", role).
		Order("is_primary desc, updated_at desc").
		First(&binding).Error
	if err != nil {
		return binding, false, err
	}
	return binding, binding.ResourceID != 0, nil
}

func (r *gormRepository) LoadEntityRow(ctx context.Context, table string, columns []string, id uint) (map[string]any, error) {
	row := map[string]any{}
	if err := r.db.WithContext(ctx).Table(table).Select(columns).Where("id = ?", id).Take(&row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func (r *gormRepository) LoadScriptComputedFields(ctx context.Context, id uint) (model.Script, error) {
	var item model.Script
	if err := r.db.WithContext(ctx).Select("characters", "character_profiles").First(&item, id).Error; err != nil {
		return item, err
	}
	return item, nil
}

func (r *gormRepository) ListAssetSlotCandidates(ctx context.Context, assetSlotID uint) ([]model.AssetSlotCandidate, error) {
	candidates := make([]model.AssetSlotCandidate, 0)
	if err := r.db.WithContext(ctx).
		Preload("CandidateAssetSlot.Resource").
		Where("asset_slot_id = ?", assetSlotID).
		Order("status desc, score desc, id desc").
		Find(&candidates).Error; err != nil {
		return nil, err
	}
	return candidates, nil
}

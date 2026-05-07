package workflowio

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
)

type resourceBindingProjection struct {
	ResourceID uint
}

type scriptComputedProjection struct {
	Characters        string
	CharacterProfiles string
}

type rawResourceProjection struct {
	ID       uint
	Type     string
	Name     string
	MimeType string
}

type assetSlotProjection struct {
	ID          uint
	Kind        string
	Name        string
	Description string
	Status      string
	ResourceID  *uint
	Resource    *rawResourceProjection
}

type assetSlotCandidateProjection struct {
	ID                   uint
	CandidateAssetSlotID uint
	SourceType           string
	Score                float64
	Status               string
	Note                 string
	CandidateAssetSlot   *assetSlotProjection
}

func (r *gormRepository) FirstBindingBySlot(ctx context.Context, ownerType string, ownerID uint, slot string) (resourceBindingProjection, bool, error) {
	var binding model.ResourceBinding
	err := r.db.WithContext(ctx).
		Where("owner_type = ? AND owner_id = ?", ownerType, ownerID).
		Where("slot = ?", slot).
		Order("is_primary desc, updated_at desc").
		First(&binding).Error
	if err != nil {
		return resourceBindingProjection{}, false, err
	}
	return resourceBindingProjection{ResourceID: binding.ResourceID}, binding.ResourceID != 0, nil
}

func (r *gormRepository) FirstBindingByRole(ctx context.Context, ownerType string, ownerID uint, role string) (resourceBindingProjection, bool, error) {
	var binding model.ResourceBinding
	err := r.db.WithContext(ctx).
		Where("owner_type = ? AND owner_id = ?", ownerType, ownerID).
		Where("role = ?", role).
		Order("is_primary desc, updated_at desc").
		First(&binding).Error
	if err != nil {
		return resourceBindingProjection{}, false, err
	}
	return resourceBindingProjection{ResourceID: binding.ResourceID}, binding.ResourceID != 0, nil
}

func (r *gormRepository) LoadEntityRow(ctx context.Context, table string, columns []string, id uint) (map[string]any, error) {
	row := map[string]any{}
	if err := r.db.WithContext(ctx).Table(table).Select(columns).Where("id = ?", id).Take(&row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func (r *gormRepository) LoadScriptComputedFields(ctx context.Context, id uint) (scriptComputedProjection, error) {
	var item model.Script
	if err := r.db.WithContext(ctx).Select("characters", "character_profiles").First(&item, id).Error; err != nil {
		return scriptComputedProjection{}, err
	}
	return scriptComputedProjection{Characters: item.Characters, CharacterProfiles: item.CharacterProfiles}, nil
}

func (r *gormRepository) ListAssetSlotCandidates(ctx context.Context, assetSlotID uint) ([]assetSlotCandidateProjection, error) {
	candidates := make([]model.AssetSlotCandidate, 0)
	if err := r.db.WithContext(ctx).
		Preload("CandidateAssetSlot.Resource").
		Where("asset_slot_id = ?", assetSlotID).
		Order("status desc, score desc, id desc").
		Find(&candidates).Error; err != nil {
		return nil, err
	}
	return assetSlotCandidatesFromModels(candidates), nil
}

func assetSlotCandidatesFromModels(candidates []model.AssetSlotCandidate) []assetSlotCandidateProjection {
	items := make([]assetSlotCandidateProjection, 0, len(candidates))
	for _, candidate := range candidates {
		items = append(items, assetSlotCandidateProjection{
			ID:                   candidate.ID,
			CandidateAssetSlotID: candidate.CandidateAssetSlotID,
			SourceType:           candidate.SourceType,
			Score:                candidate.Score,
			Status:               candidate.Status,
			Note:                 candidate.Note,
			CandidateAssetSlot:   assetSlotFromModelPointer(candidate.CandidateAssetSlot),
		})
	}
	return items
}

func assetSlotFromModelPointer(slot *model.AssetSlot) *assetSlotProjection {
	if slot == nil {
		return nil
	}
	return &assetSlotProjection{
		ID:          slot.ID,
		Kind:        slot.Kind,
		Name:        slot.Name,
		Description: slot.Description,
		Status:      slot.Status,
		ResourceID:  slot.ResourceID,
		Resource:    rawResourceFromModelPointer(slot.Resource),
	}
}

func rawResourceFromModelPointer(resource *model.RawResource) *rawResourceProjection {
	if resource == nil {
		return nil
	}
	return &rawResourceProjection{
		ID:       resource.ID,
		Type:     resource.Type,
		Name:     resource.Name,
		MimeType: resource.MimeType,
	}
}

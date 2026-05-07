package workflowio

import (
	"context"
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
	var binding resourceBindingProjection
	err := r.db.WithContext(ctx).
		Table("resource_bindings").
		Select("resource_id").
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
	var binding resourceBindingProjection
	err := r.db.WithContext(ctx).
		Table("resource_bindings").
		Select("resource_id").
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
	var item scriptComputedProjection
	if err := r.db.WithContext(ctx).
		Table("scripts").
		Select("characters", "character_profiles").
		Where("id = ?", id).
		First(&item).Error; err != nil {
		return scriptComputedProjection{}, err
	}
	return scriptComputedProjection{Characters: item.Characters, CharacterProfiles: item.CharacterProfiles}, nil
}

func (r *gormRepository) ListAssetSlotCandidates(ctx context.Context, assetSlotID uint) ([]assetSlotCandidateProjection, error) {
	type candidateRow struct {
		ID                   uint
		CandidateAssetSlotID uint
		SourceType           string
		Score                float64
		Status               string
		Note                 string
		SlotID               *uint `gorm:"column:slot_id"`
		SlotKind             string
		SlotName             string
		SlotDescription      string
		SlotStatus           string
		SlotResourceID       *uint
		ResourceID           *uint
		ResourceType         string
		ResourceName         string
		ResourceMimeType     string
	}
	rows := make([]candidateRow, 0)
	if err := r.db.WithContext(ctx).
		Table("asset_slot_candidates AS c").
		Select(`
			c.id,
			c.candidate_asset_slot_id,
			c.source_type,
			c.score,
			c.status,
			c.note,
			s.id AS slot_id,
			s.kind AS slot_kind,
			s.name AS slot_name,
			s.description AS slot_description,
			s.status AS slot_status,
			s.resource_id AS slot_resource_id,
			r.id AS resource_id,
			r.type AS resource_type,
			r.name AS resource_name,
			r.mime_type AS resource_mime_type
		`).
		Joins("LEFT JOIN asset_slots AS s ON s.id = c.candidate_asset_slot_id").
		Joins("LEFT JOIN raw_resources AS r ON r.id = s.resource_id").
		Where("c.asset_slot_id = ?", assetSlotID).
		Order("c.status desc, c.score desc, c.id desc").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]assetSlotCandidateProjection, 0, len(rows))
	for _, row := range rows {
		var slot *assetSlotProjection
		if row.SlotID != nil {
			slot = &assetSlotProjection{
				ID:          *row.SlotID,
				Kind:        row.SlotKind,
				Name:        row.SlotName,
				Description: row.SlotDescription,
				Status:      row.SlotStatus,
				ResourceID:  row.SlotResourceID,
			}
			if row.ResourceID != nil {
				slot.Resource = &rawResourceProjection{
					ID:       *row.ResourceID,
					Type:     row.ResourceType,
					Name:     row.ResourceName,
					MimeType: row.ResourceMimeType,
				}
			}
		}
		items = append(items, assetSlotCandidateProjection{
			ID:                   row.ID,
			CandidateAssetSlotID: row.CandidateAssetSlotID,
			SourceType:           row.SourceType,
			Score:                row.Score,
			Status:               row.Status,
			Note:                 row.Note,
			CandidateAssetSlot:   slot,
		})
	}
	return items, nil
}

package workflow

import (
	"context"
	"fmt"
	"strings"
)

type resourceBindingProjection struct {
	ResourceID uint
}

type resourceBindingDetailProjection struct {
	ID           uint
	ResourceID   uint
	ResourceType string
	ResourceName string
	ResourceMime string
	OwnerType    string
	OwnerID      uint
	Role         string
	Slot         string
	Status       string
	SourceType   string
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

type EntityRow struct {
	values map[string]any
}

func newEntityRow(values map[string]any) EntityRow {
	if values == nil {
		values = map[string]any{}
	}
	return EntityRow{values: values}
}

func (row EntityRow) Text(column string) string {
	return storedColumnText(row.values[column])
}

func (row EntityRow) Uint(column string) (uint, error) {
	return storedColumnUint(row.values[column])
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

func (r *gormRepository) ListBindingsBySlot(ctx context.Context, ownerType string, ownerID uint, slot string) ([]resourceBindingDetailProjection, error) {
	rows := make([]resourceBindingDetailProjection, 0)
	err := r.db.WithContext(ctx).
		Table("resource_bindings AS b").
		Select(`
			b.id,
			b.resource_id,
			b.owner_type,
			b.owner_id,
			b.role,
			b.slot,
			b.status,
			b.source_type,
			r.type AS resource_type,
			r.name AS resource_name,
			r.mime_type AS resource_mime
		`).
		Joins("LEFT JOIN raw_resources AS r ON r.id = b.resource_id").
		Where("b.owner_type = ? AND b.owner_id = ?", ownerType, ownerID).
		Where("b.slot = ?", slot).
		Order("b.is_primary desc, b.updated_at desc, b.id desc").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	items := make([]resourceBindingDetailProjection, 0, len(rows))
	for _, row := range rows {
		item := resourceBindingDetailProjection{
			ID:           row.ID,
			ResourceID:   row.ResourceID,
			ResourceType: row.ResourceType,
			ResourceName: row.ResourceName,
			ResourceMime: row.ResourceMime,
			OwnerType:    row.OwnerType,
			OwnerID:      row.OwnerID,
			Role:         row.Role,
			Slot:         row.Slot,
			Status:       row.Status,
			SourceType:   row.SourceType,
		}
		items = append(items, item)
	}
	return items, nil
}

func (r *gormRepository) LoadEntityRow(ctx context.Context, table string, columns []string, id uint) (EntityRow, error) {
	row := map[string]any{}
	selectColumns := make([]string, 0, len(columns))
	for _, column := range columns {
		if strings.TrimSpace(column) == "" {
			continue
		}
		selectColumns = append(selectColumns, fmt.Sprintf("`%s`", column))
	}
	if err := r.db.WithContext(ctx).Table(table).Select(selectColumns).Where("id = ?", id).Take(&row).Error; err != nil {
		return EntityRow{}, err
	}
	return newEntityRow(row), nil
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

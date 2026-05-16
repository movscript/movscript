package workflow

import (
	"context"
	"fmt"
	"strings"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
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

func (r *gormRepository) LoadRawResources(ctx context.Context, ids []uint) ([]rawResourceProjection, error) {
	if len(ids) == 0 {
		return []rawResourceProjection{}, nil
	}
	resources := make([]persistencemodel.RawResource, 0, len(ids))
	if err := r.db.WithContext(ctx).Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return nil, err
	}
	items := make([]rawResourceProjection, 0, len(resources))
	for _, resource := range resources {
		items = append(items, rawResourceProjection{
			ID:       resource.ID,
			Type:     resource.Type,
			Name:     resource.Name,
			MimeType: resource.MimeType,
		})
	}
	return items, nil
}

func (r *gormRepository) LoadAssetSlots(ctx context.Context, ids []uint) ([]assetSlotProjection, error) {
	if len(ids) == 0 {
		return []assetSlotProjection{}, nil
	}
	type slotRow struct {
		ID            uint
		Kind          string
		Name          string
		Description   string
		Status        string
		ResourceID    *uint
		ResourceType  string
		ResourceName  string
		ResourceMime  string
		RawResourceID *uint `gorm:"column:raw_resource_id"`
	}
	rows := make([]slotRow, 0, len(ids))
	if err := r.db.WithContext(ctx).
		Table("asset_slots AS s").
		Select(`
			s.id,
			s.kind,
			s.name,
			s.description,
			s.status,
			s.resource_id,
			r.id AS raw_resource_id,
			r.type AS resource_type,
			r.name AS resource_name,
			r.mime_type AS resource_mime
		`).
		Joins("LEFT JOIN raw_resources AS r ON r.id = s.resource_id").
		Where("s.id IN ?", ids).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]assetSlotProjection, 0, len(rows))
	for _, row := range rows {
		item := assetSlotProjection{
			ID:          row.ID,
			Kind:        row.Kind,
			Name:        row.Name,
			Description: row.Description,
			Status:      row.Status,
			ResourceID:  row.ResourceID,
		}
		if row.RawResourceID != nil {
			item.Resource = &rawResourceProjection{
				ID:       *row.RawResourceID,
				Type:     row.ResourceType,
				Name:     row.ResourceName,
				MimeType: row.ResourceMime,
			}
		}
		items = append(items, item)
	}
	return items, nil
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

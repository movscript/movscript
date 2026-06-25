package externalresource

import (
	"context"
	"errors"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	ListSources(ctx context.Context, userID uint, orgID *uint) ([]Source, error)
	CreateSource(ctx context.Context, source *Source) error
	GetOwnedSource(ctx context.Context, id uint, userID uint, orgID *uint) (Source, error)
	SaveSource(ctx context.Context, source *Source) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListSources(ctx context.Context, userID uint, orgID *uint) ([]Source, error) {
	var rows []persistencemodel.ExternalResourceSource
	q := r.db.WithContext(ctx).Where("owner_id = ?", userID)
	if orgID == nil {
		q = q.Where("org_id IS NULL")
	} else {
		q = q.Where("org_id = ?", *orgID)
	}
	if err := q.Order("priority asc, id asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	sources := make([]Source, 0, len(rows))
	for _, row := range rows {
		sources = append(sources, sourceFromModel(row))
	}
	return sources, nil
}

func (r *gormRepository) CreateSource(ctx context.Context, source *Source) error {
	row := source.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return err
	}
	*source = sourceFromModel(row)
	return nil
}

func (r *gormRepository) GetOwnedSource(ctx context.Context, id uint, userID uint, orgID *uint) (Source, error) {
	var row persistencemodel.ExternalResourceSource
	q := r.db.WithContext(ctx).Where("id = ? AND owner_id = ?", id, userID)
	if orgID == nil {
		q = q.Where("org_id IS NULL")
	} else {
		q = q.Where("org_id = ?", *orgID)
	}
	if err := q.First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Source{}, ErrNotFound
		}
		return Source{}, err
	}
	return sourceFromModel(row), nil
}

func (r *gormRepository) SaveSource(ctx context.Context, source *Source) error {
	row := source.ToModel()
	if err := r.db.WithContext(ctx).Save(&row).Error; err != nil {
		return err
	}
	*source = sourceFromModel(row)
	return nil
}

func sourceFromModel(row persistencemodel.ExternalResourceSource) Source {
	return Source{
		ID:          row.ID,
		OwnerID:     row.OwnerID,
		OrgID:       row.OrgID,
		Name:        row.Name,
		ProviderKey: row.ProviderKey,
		configJSON:  row.ConfigJSON,
		Priority:    row.Priority,
		IsEnabled:   row.IsEnabled,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
	}
}

func (source Source) ToModel() persistencemodel.ExternalResourceSource {
	return persistencemodel.ExternalResourceSource{
		Model: gorm.Model{
			ID:        source.ID,
			CreatedAt: source.CreatedAt,
			UpdatedAt: source.UpdatedAt,
		},
		OwnerID:     source.OwnerID,
		OrgID:       source.OrgID,
		Name:        source.Name,
		ProviderKey: source.ProviderKey,
		ConfigJSON:  source.configJSON,
		Priority:    source.Priority,
		IsEnabled:   source.IsEnabled,
	}
}

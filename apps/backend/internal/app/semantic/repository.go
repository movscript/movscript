package semantic

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"gorm.io/gorm"
)

type repository interface {
	LoadProjectItem(ctx context.Context, projectID uint, item any, id string) error
	CreateItem(ctx context.Context, item any) error
	PatchItem(ctx context.Context, item any, updates map[string]any) error
	ReloadItem(ctx context.Context, item any) error
	DeleteItem(ctx context.Context, item any) error
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) LoadProjectItem(ctx context.Context, projectID uint, item any, id string) error {
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).First(item, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (r *gormRepository) CreateItem(ctx context.Context, item any) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		return entityrelation.SyncCoreEntityRelations(tx, item)
	})
}

func (r *gormRepository) PatchItem(ctx context.Context, item any, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Model(item).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.First(item).Error; err != nil {
			return err
		}
		if err := tx.Save(item).Error; err != nil {
			return err
		}
		return entityrelation.SyncCoreEntityRelations(tx, item)
	})
}

func (r *gormRepository) ReloadItem(ctx context.Context, item any) error {
	return r.db.WithContext(ctx).First(item).Error
}

func (r *gormRepository) DeleteItem(ctx context.Context, item any) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Delete(item).Error; err != nil {
			return err
		}
		return entityrelation.DeleteCoreEntityRelations(tx, item)
	})
}

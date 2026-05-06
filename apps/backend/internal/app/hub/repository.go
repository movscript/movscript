package hub

import (
	"context"
	"errors"
	"strings"

	domainhub "github.com/movscript/movscript/internal/domain/hub"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	Seed(ctx context.Context) error
	List(ctx context.Context, admin bool) ([]model.HubPackage, error)
	Find(ctx context.Context, id string, admin bool) (model.HubPackage, error)
	IncrementDownloads(ctx context.Context, id uint) error
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) Seed(ctx context.Context) error {
	var count int64
	if err := r.db.WithContext(ctx).Model(&model.HubPackage{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	for _, item := range domainhub.SeedPackages() {
		row := domainhub.NewSeedPackageRow(item)
		if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

func (r *gormRepository) List(ctx context.Context, admin bool) ([]model.HubPackage, error) {
	rows := make([]model.HubPackage, 0)
	q := r.db.WithContext(ctx).Order("updated_at desc")
	if !admin {
		q = q.Where("status = ?", StatusPublished)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (r *gormRepository) Find(ctx context.Context, id string, admin bool) (model.HubPackage, error) {
	var row model.HubPackage
	q := r.db.WithContext(ctx).Where("package_id = ?", strings.TrimSpace(id))
	if !admin {
		q = q.Where("status = ?", StatusPublished)
	}
	if err := q.First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.HubPackage{}, ErrNotFound
		}
		return model.HubPackage{}, err
	}
	return row, nil
}

func (r *gormRepository) IncrementDownloads(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Model(&model.HubPackage{}).
		Where("id = ?", id).
		UpdateColumn("downloads", gorm.Expr("downloads + 1")).
		Error
}

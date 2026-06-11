package shotreference

import (
	"context"
	"errors"

	domainshotreference "github.com/movscript/movscript/internal/domain/shotreference"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	CreateGroup(ctx context.Context, group *domainshotreference.ShotReferenceGroup) error
	GetGroup(ctx context.Context, id uint, input domainshotreference.ListInput) (domainshotreference.ShotReferenceGroup, error)
	NextGroupOrder(ctx context.Context, groupID uint, input domainshotreference.ListInput) (int, error)
	Upsert(ctx context.Context, reference *domainshotreference.ShotReference) error
	Get(ctx context.Context, id uint, input domainshotreference.ListInput) (domainshotreference.ShotReference, error)
	Update(ctx context.Context, reference *domainshotreference.ShotReference) error
	List(ctx context.Context, input domainshotreference.ListInput) ([]domainshotreference.ShotReference, error)
	ListAll(ctx context.Context) ([]domainshotreference.ShotReference, error)
	Delete(ctx context.Context, id uint, input domainshotreference.ListInput) (bool, error)
}

type gormRepository struct {
	db *gorm.DB
}

const shotReferenceMaxGroupOrderSQL = `coalesce(max("order"), 0)`

func (r *gormRepository) CreateGroup(ctx context.Context, group *domainshotreference.ShotReferenceGroup) error {
	model := group.ToModel()
	if err := r.db.WithContext(ctx).Create(&model).Error; err != nil {
		return err
	}
	if err := r.db.WithContext(ctx).Preload("SourceResource").First(&model, model.ID).Error; err != nil {
		return err
	}
	*group = domainshotreference.GroupFromModel(model)
	return nil
}

func (r *gormRepository) GetGroup(ctx context.Context, id uint, input domainshotreference.ListInput) (domainshotreference.ShotReferenceGroup, error) {
	q := r.db.WithContext(ctx).Model(&persistencemodel.ShotReferenceGroup{}).Preload("SourceResource").Where("id = ?", id)
	q = applyScopeToGroup(q, input)
	var row persistencemodel.ShotReferenceGroup
	if err := q.First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainshotreference.ShotReferenceGroup{}, ErrNotFound
		}
		return domainshotreference.ShotReferenceGroup{}, err
	}
	return domainshotreference.GroupFromModel(row), nil
}

func (r *gormRepository) NextGroupOrder(ctx context.Context, groupID uint, input domainshotreference.ListInput) (int, error) {
	var maxOrder int
	q := r.db.WithContext(ctx).Model(&persistencemodel.ShotReference{}).Select(shotReferenceMaxGroupOrderSQL).Where("group_id = ?", groupID)
	q = applyScope(q, input)
	if err := q.Scan(&maxOrder).Error; err != nil {
		return 0, err
	}
	return maxOrder + 1, nil
}

func (r *gormRepository) Upsert(ctx context.Context, reference *domainshotreference.ShotReference) error {
	model := reference.ToModel()
	if err := r.db.WithContext(ctx).Save(&model).Error; err != nil {
		return err
	}
	if err := r.db.WithContext(ctx).Preload("Resource").Preload("Group").Preload("Group.SourceResource").First(&model, model.ID).Error; err != nil {
		return err
	}
	*reference = domainshotreference.FromModel(model)
	return nil
}

func (r *gormRepository) Get(ctx context.Context, id uint, input domainshotreference.ListInput) (domainshotreference.ShotReference, error) {
	q := r.db.WithContext(ctx).Model(&persistencemodel.ShotReference{}).Preload("Resource").Preload("Group").Preload("Group.SourceResource").Where("id = ?", id)
	q = applyScope(q, input)
	var row persistencemodel.ShotReference
	if err := q.First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainshotreference.ShotReference{}, ErrNotFound
		}
		return domainshotreference.ShotReference{}, err
	}
	return domainshotreference.FromModel(row), nil
}

func (r *gormRepository) Update(ctx context.Context, reference *domainshotreference.ShotReference) error {
	model := reference.ToModel()
	if err := r.db.WithContext(ctx).Save(&model).Error; err != nil {
		return err
	}
	if err := r.db.WithContext(ctx).Preload("Resource").Preload("Group").Preload("Group.SourceResource").First(&model, model.ID).Error; err != nil {
		return err
	}
	*reference = domainshotreference.FromModel(model)
	return nil
}

func (r *gormRepository) List(ctx context.Context, input domainshotreference.ListInput) ([]domainshotreference.ShotReference, error) {
	q := r.db.WithContext(ctx).Model(&persistencemodel.ShotReference{}).Preload("Resource").Preload("Group").Preload("Group.SourceResource")
	q = applyScope(q, input)
	if input.GroupID != nil {
		q = q.Order(`"order" asc`).Order("id asc")
	} else {
		q = q.Order("updated_at desc")
	}
	var rows []persistencemodel.ShotReference
	if err := q.Find(&rows).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return []domainshotreference.ShotReference{}, nil
		}
		return nil, err
	}
	result := make([]domainshotreference.ShotReference, 0, len(rows))
	for _, row := range rows {
		result = append(result, domainshotreference.FromModel(row))
	}
	return result, nil
}

func (r *gormRepository) ListAll(ctx context.Context) ([]domainshotreference.ShotReference, error) {
	var rows []persistencemodel.ShotReference
	if err := r.db.WithContext(ctx).Model(&persistencemodel.ShotReference{}).Preload("Resource").Preload("Group").Preload("Group.SourceResource").Order("updated_at desc").Find(&rows).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return []domainshotreference.ShotReference{}, nil
		}
		return nil, err
	}
	result := make([]domainshotreference.ShotReference, 0, len(rows))
	for _, row := range rows {
		result = append(result, domainshotreference.FromModel(row))
	}
	return result, nil
}

func (r *gormRepository) Delete(ctx context.Context, id uint, input domainshotreference.ListInput) (bool, error) {
	q := r.db.WithContext(ctx).Model(&persistencemodel.ShotReference{}).Where("id = ?", id)
	q = applyScope(q, input)
	result := q.Delete(&persistencemodel.ShotReference{})
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

func applyScope(q *gorm.DB, input domainshotreference.ListInput) *gorm.DB {
	if input.GroupID != nil {
		q = q.Where("group_id = ?", *input.GroupID)
	}
	if input.OrgID != nil {
		return q.Where("org_id = ? OR (org_id IS NULL AND owner_id = ?)", *input.OrgID, input.UserID)
	}
	return q.Where("org_id IS NULL AND owner_id = ?", input.UserID)
}

func applyScopeToGroup(q *gorm.DB, input domainshotreference.ListInput) *gorm.DB {
	if input.OrgID != nil {
		return q.Where("org_id = ? OR (org_id IS NULL AND owner_id = ?)", *input.OrgID, input.UserID)
	}
	return q.Where("org_id IS NULL AND owner_id = ?", input.UserID)
}

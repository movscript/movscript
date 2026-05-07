package audit

import (
	"context"

	domainaudit "github.com/movscript/movscript/internal/domain/audit"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	ListLogs(ctx context.Context, filter ListFilter) (Page, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListLogs(ctx context.Context, filter ListFilter) (Page, error) {
	page := filter.Page
	if page <= 0 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = 50
	}
	if pageSize > 200 {
		pageSize = 200
	}

	q := r.db.WithContext(ctx).Model(&persistencemodel.AuditLog{}).Order("id desc")
	if filter.ActorID != "" {
		q = q.Where("actor_id = ?", filter.ActorID)
	}
	if filter.Action != "" {
		q = q.Where("action = ?", filter.Action)
	}
	if filter.TargetType != "" {
		q = q.Where("target_type = ?", filter.TargetType)
	}
	if filter.TargetID != "" {
		q = q.Where("target_id = ?", filter.TargetID)
	}
	if filter.ProjectID != "" {
		q = q.Where("project_id = ?", filter.ProjectID)
	}
	if filter.Since != nil {
		q = q.Where("created_at >= ?", *filter.Since)
	}
	if filter.Until != nil {
		q = q.Where("created_at <= ?", *filter.Until)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return Page{}, err
	}
	logs := make([]persistencemodel.AuditLog, 0)
	if err := q.Offset((page - 1) * pageSize).Limit(pageSize).Find(&logs).Error; err != nil {
		return Page{}, err
	}
	return Page{Items: domainaudit.LogsFromModels(logs), Total: total, Page: page, PageSize: pageSize}, nil
}

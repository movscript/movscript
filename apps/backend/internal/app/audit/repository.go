package audit

import (
	"context"

	domainaudit "github.com/movscript/movscript/internal/domain/audit"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	ListLogs(ctx context.Context, filter ListFilter) (Page, error)
	ExportLogs(ctx context.Context, filter ListFilter, limit int) ([]domainaudit.Log, error)
	Summary(ctx context.Context, filter ListFilter) (Summary, error)
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

	q := r.filteredQuery(ctx, filter).Order("id desc")

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

func (r *gormRepository) ExportLogs(ctx context.Context, filter ListFilter, limit int) ([]domainaudit.Log, error) {
	if limit <= 0 {
		limit = 1000
	}
	logs := make([]persistencemodel.AuditLog, 0)
	if err := r.filteredQuery(ctx, filter).
		Order("id desc").
		Limit(limit).
		Find(&logs).Error; err != nil {
		return nil, err
	}
	return domainaudit.LogsFromModels(logs), nil
}

func (r *gormRepository) Summary(ctx context.Context, filter ListFilter) (Summary, error) {
	var totals SummaryTotals
	if err := r.filteredQuery(ctx, filter).
		Select("COUNT(*) as records, COUNT(DISTINCT actor_id) as unique_actors").
		Scan(&totals).Error; err != nil {
		return Summary{}, err
	}

	topActions := make([]ActionSummary, 0)
	if err := r.filteredQuery(ctx, filter).
		Select("action, COUNT(*) as count").
		Group("action").
		Order("count desc").
		Limit(10).
		Scan(&topActions).Error; err != nil {
		return Summary{}, err
	}

	topTargets := make([]TargetSummary, 0)
	if err := r.filteredQuery(ctx, filter).
		Select("target_type, COUNT(*) as count").
		Group("target_type").
		Order("count desc").
		Limit(10).
		Scan(&topTargets).Error; err != nil {
		return Summary{}, err
	}

	topActors := make([]ActorSummary, 0)
	if err := r.filteredQuery(ctx, filter).
		Where("actor_id IS NOT NULL").
		Select("actor_id, COUNT(*) as count").
		Group("actor_id").
		Order("count desc").
		Limit(10).
		Scan(&topActors).Error; err != nil {
		return Summary{}, err
	}

	return Summary{Totals: totals, TopActions: topActions, TopTargets: topTargets, TopActors: topActors}, nil
}

func (r *gormRepository) filteredQuery(ctx context.Context, filter ListFilter) *gorm.DB {
	q := r.db.WithContext(ctx).Model(&persistencemodel.AuditLog{})
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
	if filter.OrgID != "" {
		q = q.Where("org_id = ?", filter.OrgID)
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
	return q
}

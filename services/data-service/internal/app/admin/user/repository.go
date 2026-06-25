package user

import (
	"context"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	Detail(ctx context.Context, id uint) (Detail, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) Detail(ctx context.Context, id uint) (Detail, error) {
	projects := make([]ProjectMembership, 0)
	if err := r.db.WithContext(ctx).
		Table("project_members pm").
		Select("p.id, p.name, p.org_id, p.owner_id, pm.role, pm.created_at AS joined_at").
		Joins("JOIN projects p ON p.id = pm.project_id AND p.deleted_at IS NULL").
		Where("pm.user_id = ? AND pm.deleted_at IS NULL", id).
		Order("p.updated_at DESC, p.id DESC").
		Limit(50).
		Scan(&projects).Error; err != nil {
		return Detail{}, err
	}

	var usage UsageSummary
	if err := r.db.WithContext(ctx).
		Model(&persistencemodel.UsageLog{}).
		Select(`
			COUNT(*) AS calls,
			COALESCE(SUM(cost), 0) AS cost,
			COALESCE(SUM(input_tokens), 0) AS input_tokens,
			COALESCE(SUM(output_tokens), 0) AS output_tokens,
			COALESCE(SUM(CASE WHEN operation_type = ? THEN image_count ELSE 0 END), 0) AS images,
			COALESCE(SUM(duration_sec), 0) AS duration_sec
		`, "image").
		Where("user_id = ?", id).
		Scan(&usage).Error; err != nil {
		return Detail{}, err
	}

	audit := AuditSummary{}
	if err := r.db.WithContext(ctx).
		Model(&persistencemodel.AuditLog{}).
		Where("actor_id = ?", id).
		Count(&audit.Records).Error; err != nil {
		return Detail{}, err
	}
	if audit.Records > 0 {
		var last persistencemodel.AuditLog
		if err := r.db.WithContext(ctx).
			Where("actor_id = ?", id).
			Order("created_at DESC, id DESC").
			First(&last).Error; err != nil {
			return Detail{}, err
		}
		audit.LastAction = last.Action
		audit.LastAt = &last.CreatedAt
	}

	return Detail{
		Projects: projects,
		Usage:    usage,
		Audit:    audit,
	}, nil
}

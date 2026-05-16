package debug

import (
	"context"
	"errors"

	domainai "github.com/movscript/movscript/internal/domain/ai"
	domainjob "github.com/movscript/movscript/internal/domain/job"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	GetCredential(ctx context.Context, id uint) (domainai.Credential, error)
	ListJobs(ctx context.Context, filters JobFilters, limit, offset int) (JobPage, error)
	JobStats(ctx context.Context, recentLimit int) (JobStats, error)
	GetJob(ctx context.Context, id string) (domainjob.Job, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) GetCredential(ctx context.Context, id uint) (domainai.Credential, error) {
	var cred persistencemodel.AICredential
	if err := r.db.WithContext(ctx).First(&cred, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainai.Credential{}, ErrNotFound
		}
		return domainai.Credential{}, err
	}
	return domainai.CredentialFromModel(cred), nil
}

func (r *gormRepository) ListJobs(ctx context.Context, filters JobFilters, limit, offset int) (JobPage, error) {
	q := r.db.WithContext(ctx).Model(&persistencemodel.Job{}).Preload("OutputResource")
	q = applyJobFilters(q, filters)

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return JobPage{}, err
	}

	items := make([]persistencemodel.Job, 0)
	if err := q.Order("id DESC").Limit(limit).Offset(offset).Find(&items).Error; err != nil {
		return JobPage{}, err
	}
	return JobPage{Items: domainjob.JobsFromModels(items), Total: total}, nil
}

func applyJobFilters(q *gorm.DB, filters JobFilters) *gorm.DB {
	if filters.JobID != nil {
		q = q.Where("id = ?", *filters.JobID)
	}
	if filters.Status != "" {
		q = q.Where("status = ?", filters.Status)
	}
	if filters.JobType != "" {
		q = q.Where("job_type = ?", filters.JobType)
	}
	if filters.FeatureKey != "" {
		q = q.Where("feature_key = ?", filters.FeatureKey)
	}
	if filters.UserID != nil {
		q = q.Where("user_id = ?", *filters.UserID)
	}
	if filters.OrgID != nil {
		q = q.Where("org_id = ?", *filters.OrgID)
	}
	if filters.ProjectID != nil {
		q = q.Where("project_id = ?", *filters.ProjectID)
	}
	if filters.ModelConfigID != nil {
		q = q.Where("model_config_id = ?", *filters.ModelConfigID)
	}
	return q
}

func (r *gormRepository) JobStats(ctx context.Context, recentLimit int) (JobStats, error) {
	var rows []JobStatusCount
	if err := r.db.WithContext(ctx).Model(&persistencemodel.Job{}).
		Select("status, count(*) as count").
		Group("status").
		Order("status").
		Scan(&rows).Error; err != nil {
		return JobStats{}, err
	}
	var total int64
	for _, row := range rows {
		total += row.Count
	}
	recent := make([]persistencemodel.Job, 0)
	if err := r.db.WithContext(ctx).Model(&persistencemodel.Job{}).
		Preload("OutputResource").
		Where("status = ?", domainjob.StatusFailed).
		Order("id DESC").
		Limit(recentLimit).
		Find(&recent).Error; err != nil {
		return JobStats{}, err
	}
	return JobStats{Total: total, ByStatus: rows, RecentFailed: jobDetailsFromJobs(domainjob.JobsFromModels(recent))}, nil
}

func (r *gormRepository) GetJob(ctx context.Context, id string) (domainjob.Job, error) {
	var job persistencemodel.Job
	if err := r.db.WithContext(ctx).Preload("OutputResource").First(&job, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainjob.Job{}, ErrNotFound
		}
		return domainjob.Job{}, err
	}
	return domainjob.JobFromModel(job), nil
}

package debug

import (
	"context"
	"errors"

	domainaiadmin "github.com/movscript/movscript/internal/domain/aiadmin"
	domainjob "github.com/movscript/movscript/internal/domain/job"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	GetCredential(ctx context.Context, id uint) (domainaiadmin.Credential, error)
	ListJobs(ctx context.Context, status string, limit, offset int) (JobPage, error)
	JobStats(ctx context.Context, recentLimit int) (JobStats, error)
	GetJob(ctx context.Context, id string) (domainjob.Job, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) GetCredential(ctx context.Context, id uint) (domainaiadmin.Credential, error) {
	var cred persistencemodel.AICredential
	if err := r.db.WithContext(ctx).First(&cred, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainaiadmin.Credential{}, ErrNotFound
		}
		return domainaiadmin.Credential{}, err
	}
	return domainaiadmin.CredentialFromModel(cred), nil
}

func (r *gormRepository) ListJobs(ctx context.Context, status string, limit, offset int) (JobPage, error) {
	q := r.db.WithContext(ctx).Model(&persistencemodel.Job{}).Preload("OutputResource")
	if status != "" {
		q = q.Where("status = ?", status)
	}

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

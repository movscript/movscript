package debug

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("debug item not found")

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type JobPage struct {
	Items []model.Job
	Total int64
}

func (s *Service) GetCredential(ctx context.Context, id uint) (model.AICredential, error) {
	var cred model.AICredential
	if err := s.db.WithContext(ctx).First(&cred, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return cred, ErrNotFound
		}
		return cred, err
	}
	return cred, nil
}

func (s *Service) ListJobs(ctx context.Context, status string, limit, offset int) (JobPage, error) {
	q := s.db.WithContext(ctx).Model(&model.Job{}).Preload("OutputResource")
	if status != "" {
		q = q.Where("status = ?", status)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return JobPage{}, err
	}

	items := make([]model.Job, 0)
	if err := q.Order("id DESC").Limit(limit).Offset(offset).Find(&items).Error; err != nil {
		return JobPage{}, err
	}
	return JobPage{Items: items, Total: total}, nil
}

func (s *Service) GetJob(ctx context.Context, id string) (model.Job, error) {
	var job model.Job
	if err := s.db.WithContext(ctx).Preload("OutputResource").First(&job, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return job, ErrNotFound
		}
		return job, err
	}
	return job, nil
}

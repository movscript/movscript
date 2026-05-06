package resourceadmin

import (
	"context"

	"gorm.io/gorm"
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type StorageStat struct {
	UserID         uint   `json:"user_id"`
	StorageBackend string `json:"storage_backend"`
	Count          int64  `json:"count"`
	TotalSize      int64  `json:"total_size"`
	Username       string `json:"username"`
}

func (s *Service) StorageStats(ctx context.Context) ([]StorageStat, error) {
	return s.repo.StorageStats(ctx)
}

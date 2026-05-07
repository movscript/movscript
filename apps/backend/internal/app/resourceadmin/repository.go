package resourceadmin

import (
	"context"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	StorageStats(ctx context.Context) ([]StorageStat, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (s *gormRepository) StorageStats(ctx context.Context) ([]StorageStat, error) {
	type row struct {
		UserID         uint
		StorageBackend string
		Count          int64
		TotalSize      int64
	}
	rows := make([]row, 0)
	if err := s.db.WithContext(ctx).Model(&persistencemodel.RawResource{}).
		Select("owner_id as user_id, storage_backend, count(*) as count, sum(size) as total_size").
		Group("owner_id, storage_backend").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	userIDs := make(map[uint]bool)
	for _, r := range rows {
		userIDs[r.UserID] = true
	}
	userMap, err := s.usernames(ctx, userIDs)
	if err != nil {
		return nil, err
	}

	result := make([]StorageStat, 0, len(rows))
	for _, r := range rows {
		result = append(result, StorageStat{
			UserID:         r.UserID,
			StorageBackend: r.StorageBackend,
			Count:          r.Count,
			TotalSize:      r.TotalSize,
			Username:       userMap[r.UserID],
		})
	}
	return result, nil
}

func (s *gormRepository) usernames(ctx context.Context, ids map[uint]bool) (map[uint]string, error) {
	userMap := map[uint]string{}
	if len(ids) == 0 {
		return userMap, nil
	}
	values := make([]uint, 0, len(ids))
	for id := range ids {
		values = append(values, id)
	}
	users := make([]persistencemodel.User, 0)
	if err := s.db.WithContext(ctx).Where("id IN ?", values).Find(&users).Error; err != nil {
		return nil, err
	}
	for _, u := range users {
		userMap[u.ID] = u.Username
	}
	return userMap, nil
}

package aiadmin

import (
	"context"
	"errors"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type UserWithQuota struct {
	model.User
	Balance float64 `json:"balance"`
}

type UsageLogFilter struct {
	UserID        string
	ModelConfigID string
	ProviderID    string
	Start         string
	End           string
	Page          int
	PageSize      int
}

type UsageLogPage struct {
	Total    int64
	Items    []model.UsageLog
	Page     int
	PageSize int
}

type MyQuotaSummary struct {
	Balance              float64
	TotalCostThisMonth   float64
	TotalTokensThisMonth int64
}

type MyUsageLogPage struct {
	Total int64
	Items []model.UsageLog
}

func (s *Service) ListUsersWithQuota(ctx context.Context) ([]UserWithQuota, error) {
	users := make([]model.User, 0)
	if err := s.db.WithContext(ctx).Find(&users).Error; err != nil {
		return nil, err
	}
	result := make([]UserWithQuota, len(users))
	for i, u := range users {
		var quota model.UserQuota
		if err := s.db.WithContext(ctx).Where("user_id = ?", u.ID).First(&quota).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		result[i] = UserWithQuota{User: u, Balance: quota.Balance}
	}
	return result, nil
}

func (s *Service) SetUserQuota(ctx context.Context, userID uint, balance float64) (model.UserQuota, error) {
	var quota model.UserQuota
	result := s.db.WithContext(ctx).Where("user_id = ?", userID).First(&quota)
	if result.Error != nil {
		if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return quota, result.Error
		}
		quota = model.UserQuota{UserID: userID, Balance: balance}
		if err := s.db.WithContext(ctx).Create(&quota).Error; err != nil {
			return quota, err
		}
		return quota, nil
	}
	quota.Balance = balance
	if err := s.db.WithContext(ctx).Save(&quota).Error; err != nil {
		return quota, err
	}
	return quota, nil
}

func (s *Service) ListUsageLogs(ctx context.Context, filter UsageLogFilter) (UsageLogPage, error) {
	q := s.db.WithContext(ctx).Model(&model.UsageLog{}).Preload("User").Preload("AIModelConfig")
	if filter.UserID != "" {
		q = q.Where("user_id = ?", filter.UserID)
	}
	if filter.ModelConfigID != "" {
		q = q.Where("ai_model_config_id = ?", filter.ModelConfigID)
	}
	if filter.ProviderID != "" {
		q = q.Joins("JOIN ai_model_configs ON ai_model_configs.id = usage_logs.ai_model_config_id").
			Where("ai_model_configs.credential_id = ?", filter.ProviderID)
	}
	if filter.Start != "" {
		q = q.Where("usage_logs.created_at >= ?", filter.Start)
	}
	if filter.End != "" {
		q = q.Where("usage_logs.created_at <= ?", filter.End)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return UsageLogPage{}, err
	}

	logs := make([]model.UsageLog, 0)
	offset := (filter.Page - 1) * filter.PageSize
	if err := q.Order("usage_logs.created_at DESC").Limit(filter.PageSize).Offset(offset).Find(&logs).Error; err != nil {
		return UsageLogPage{}, err
	}
	return UsageLogPage{Total: total, Items: logs, Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (s *Service) GetMyQuota(ctx context.Context, userID uint) (MyQuotaSummary, error) {
	var quota model.UserQuota
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).First(&quota).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return MyQuotaSummary{}, err
	}

	monthStart := time.Now().Local()
	monthStart = time.Date(monthStart.Year(), monthStart.Month(), 1, 0, 0, 0, 0, monthStart.Location())

	var totalCost float64
	if err := s.db.WithContext(ctx).Model(&model.UsageLog{}).
		Where("user_id = ? AND created_at >= ?", userID, monthStart).
		Select("COALESCE(SUM(cost), 0)").Scan(&totalCost).Error; err != nil {
		return MyQuotaSummary{}, err
	}

	var totalTokens int64
	if err := s.db.WithContext(ctx).Model(&model.UsageLog{}).
		Where("user_id = ? AND created_at >= ?", userID, monthStart).
		Select("COALESCE(SUM(input_tokens + output_tokens), 0)").Scan(&totalTokens).Error; err != nil {
		return MyQuotaSummary{}, err
	}

	return MyQuotaSummary{
		Balance:              quota.Balance,
		TotalCostThisMonth:   totalCost,
		TotalTokensThisMonth: totalTokens,
	}, nil
}

func (s *Service) GetMyUsageLogs(ctx context.Context, userID uint, page, pageSize int) (MyUsageLogPage, error) {
	var total int64
	if err := s.db.WithContext(ctx).Model(&model.UsageLog{}).Where("user_id = ?", userID).Count(&total).Error; err != nil {
		return MyUsageLogPage{}, err
	}

	logs := make([]model.UsageLog, 0)
	offset := (page - 1) * pageSize
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).
		Preload("AIModelConfig").
		Order("created_at DESC").
		Limit(pageSize).Offset(offset).
		Find(&logs).Error; err != nil {
		return MyUsageLogPage{}, err
	}
	return MyUsageLogPage{Total: total, Items: logs}, nil
}

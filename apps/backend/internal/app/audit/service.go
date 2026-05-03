package audit

import (
	"context"
	"time"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type ListFilter struct {
	ActorID    string
	Action     string
	TargetType string
	TargetID   string
	ProjectID  string
	Since      *time.Time
	Until      *time.Time
	Page       int
	PageSize   int
}

type Page struct {
	Items    []model.AuditLog `json:"items"`
	Total    int64            `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"page_size"`
}

func (s *Service) List(ctx context.Context, filter ListFilter) (Page, error) {
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

	q := s.db.WithContext(ctx).Model(&model.AuditLog{}).Order("id desc")
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
	logs := make([]model.AuditLog, 0)
	if err := q.Offset((page - 1) * pageSize).Limit(pageSize).Find(&logs).Error; err != nil {
		return Page{}, err
	}
	return Page{Items: logs, Total: total, Page: page, PageSize: pageSize}, nil
}

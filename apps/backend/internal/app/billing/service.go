package billing

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/domain/model"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("billing subject not found")

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type QuotaInput struct {
	MonthlyBudget float64
	Plan          *string
	Status        *string
}

func (s *Service) GetQuota(ctx context.Context, orgID uint) (model.OrgQuota, error) {
	var org model.Organization
	if err := s.db.WithContext(ctx).Select("id").First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.OrgQuota{}, ErrNotFound
		}
		return model.OrgQuota{}, err
	}
	var quota model.OrgQuota
	if err := s.db.WithContext(ctx).Where("org_id = ?", orgID).First(&quota).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.OrgQuota{OrgID: orgID, MonthlyBudget: 0}, nil
		}
		return model.OrgQuota{}, err
	}
	return quota, nil
}

func (s *Service) SetQuota(ctx context.Context, orgID uint, input QuotaInput) (model.OrgQuota, error) {
	if input.MonthlyBudget < 0 {
		input.MonthlyBudget = 0
	}
	var org model.Organization
	if err := s.db.WithContext(ctx).Select("id").First(&org, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.OrgQuota{}, ErrNotFound
		}
		return model.OrgQuota{}, err
	}
	orgUpdates := map[string]any{}
	if input.Plan != nil {
		orgUpdates["plan"] = normalizeOrgPlan(*input.Plan)
	}
	if input.Status != nil {
		orgUpdates["status"] = normalizeOrgStatus(*input.Status)
	}
	if len(orgUpdates) > 0 {
		if err := s.db.WithContext(ctx).Model(&org).Updates(orgUpdates).Error; err != nil {
			return model.OrgQuota{}, err
		}
	}
	var quota model.OrgQuota
	err := s.db.WithContext(ctx).Where("org_id = ?", orgID).First(&quota).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return model.OrgQuota{}, err
		}
		quota = model.OrgQuota{OrgID: orgID, MonthlyBudget: input.MonthlyBudget}
		if err := s.db.WithContext(ctx).Create(&quota).Error; err != nil {
			return model.OrgQuota{}, err
		}
		return quota, nil
	}
	quota.MonthlyBudget = input.MonthlyBudget
	if err := s.db.WithContext(ctx).Save(&quota).Error; err != nil {
		return model.OrgQuota{}, err
	}
	return quota, nil
}

func normalizeOrgPlan(value string) string {
	return domainorg.NormalizePlan(value)
}

func normalizeOrgStatus(value string) string {
	return domainorg.NormalizeStatus(value)
}

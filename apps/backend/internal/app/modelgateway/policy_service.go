package modelgateway

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type PolicyService struct {
	db *gorm.DB
}

func NewPolicyService(db *gorm.DB) *PolicyService {
	return &PolicyService{db: db}
}

func (p *PolicyService) CanListChatModels(principal Principal) error {
	return p.ensureChatScope(principal, "list")
}

func (p *PolicyService) CanCallChat(ctx context.Context, principal Principal, modelConfigID uint, projectID *uint, estimatedCost float64) error {
	if err := p.ensureChatScope(principal, "call"); err != nil {
		return err
	}
	if principal.Key != nil && !KeyAllowsModel(principal.Key, modelConfigID) {
		return ErrModelNotAllowed
	}
	if principal.Key != nil && !KeyAllowsProject(principal.Key, projectID) {
		return ErrProjectNotAllowed
	}
	if principal.Key != nil {
		return p.EnforceKeyLimits(ctx, principal.Key, estimatedCost)
	}
	return nil
}

func (p *PolicyService) EnforceKeyLimits(ctx context.Context, key *model.GatewayAPIKey, estimatedCost float64) error {
	if key == nil || p.db == nil {
		return nil
	}
	if key.RateLimitRPM > 0 {
		if err := p.consumeRateLimit(ctx, key.ID, key.RateLimitRPM); err != nil {
			return err
		}
	}
	if key.MonthlyBudget > 0 {
		spent, err := p.keyMonthlySpend(ctx, key.ID)
		if err != nil {
			return err
		}
		if spent+estimatedCost > key.MonthlyBudget {
			return fmt.Errorf("%w: spent %.4f plus estimated %.4f exceeds %.4f credits", ErrMonthlyBudgetExceeded, spent, estimatedCost, key.MonthlyBudget)
		}
	}
	return nil
}

func (p *PolicyService) FindOwnedAPIKey(ctx context.Context, id uint, ownerUserID uint, orgID *uint) (model.GatewayAPIKey, error) {
	var key model.GatewayAPIKey
	q := p.db.WithContext(ctx).Where("id = ? AND owner_user_id = ?", id, ownerUserID)
	q = p.applyAPIKeyOrgScope(ctx, q, orgID, ownerUserID)
	if err := q.First(&key).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return key, ErrAPIKeyNotFound
		}
		return key, err
	}
	return key, nil
}

func (p *PolicyService) ApplyAPIKeyOrgScope(ctx context.Context, q *gorm.DB, orgID *uint, ownerUserID uint) *gorm.DB {
	return p.applyAPIKeyOrgScope(ctx, q, orgID, ownerUserID)
}

func (p *PolicyService) EnsureProjectInOrg(ctx context.Context, projectID *uint, orgID *uint) error {
	if projectID == nil || p.db == nil {
		return nil
	}
	var project model.Project
	if err := p.db.WithContext(ctx).Select("id, org_id").First(&project, *projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrProjectNotFound
		}
		return err
	}
	if !sameOrg(project.OrgID, orgID) {
		return ErrProjectOutsideOrg
	}
	return nil
}

func (p *PolicyService) ensureChatScope(principal Principal, action string) error {
	if principal.Key == nil || KeyAllowsScope(principal.Key, "model:chat") {
		return nil
	}
	if action == "list" {
		return fmt.Errorf("%w: list chat models", ErrInsufficientScope)
	}
	return fmt.Errorf("%w: call chat models", ErrInsufficientScope)
}

func (p *PolicyService) consumeRateLimit(ctx context.Context, keyID uint, limit int) error {
	now := time.Now().UTC()
	window := now.Truncate(time.Minute)
	return p.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var counter model.GatewayRateLimitCounter
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("gateway_api_key_id = ? AND window_start = ?", keyID, window).
			First(&counter).Error
		if err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			counter = model.GatewayRateLimitCounter{
				GatewayAPIKeyID: keyID,
				WindowStart:     window,
				RequestCount:    1,
			}
			return tx.Create(&counter).Error
		}
		if counter.RequestCount >= limit {
			return fmt.Errorf("%w: %d requests per minute", ErrRateLimitExceeded, limit)
		}
		return tx.Model(&counter).UpdateColumn("request_count", gorm.Expr("request_count + 1")).Error
	})
}

func (p *PolicyService) keyMonthlySpend(ctx context.Context, keyID uint) (float64, error) {
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var total float64
	err := p.db.WithContext(ctx).Model(&model.UsageLog{}).
		Where("gateway_api_key_id = ? AND created_at >= ?", keyID, monthStart).
		Select("COALESCE(SUM(cost), 0)").Scan(&total).Error
	return total, err
}

func (p *PolicyService) applyAPIKeyOrgScope(ctx context.Context, q *gorm.DB, orgID *uint, ownerUserID uint) *gorm.DB {
	if orgID == nil {
		return q.Where("org_id IS NULL")
	}
	if p.isPersonalOrg(ctx, *orgID) {
		return q.Where("org_id = ? OR (org_id IS NULL AND owner_user_id = ?)", *orgID, ownerUserID)
	}
	return q.Where("org_id = ?", *orgID)
}

func (p *PolicyService) isPersonalOrg(ctx context.Context, orgID uint) bool {
	if p.db == nil {
		return false
	}
	var org model.Organization
	if err := p.db.WithContext(ctx).Select("is_personal").First(&org, orgID).Error; err != nil {
		return false
	}
	return org.IsPersonal
}

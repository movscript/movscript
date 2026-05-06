package modelgateway

import (
	"context"
	"errors"
	"fmt"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
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
	return p.enforceKeyCommercialLimits(ctx, key, estimatedCost)
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

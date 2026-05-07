package modelgateway

import (
	"context"
	"fmt"

	domainmodelgateway "github.com/movscript/movscript/internal/domain/modelgateway"
	"gorm.io/gorm"
)

type PolicyService struct {
	db   *gorm.DB
	repo repository
}

func NewPolicyService(db *gorm.DB) *PolicyService {
	return &PolicyService{db: db, repo: &gormRepository{db: db}}
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

func (p *PolicyService) EnforceKeyLimits(ctx context.Context, key *domainmodelgateway.APIKey, estimatedCost float64) error {
	return p.enforceKeyEditionLimits(ctx, key, estimatedCost)
}

func (p *PolicyService) FindOwnedAPIKey(ctx context.Context, id uint, ownerUserID uint, orgID *uint) (domainmodelgateway.APIKey, error) {
	includeLegacy := orgID != nil && p.repo.IsPersonalOrg(ctx, *orgID)
	return p.repo.FindOwnedAPIKey(ctx, id, ownerUserID, orgID, includeLegacy)
}

func (p *PolicyService) IsPersonalOrg(ctx context.Context, orgID uint) bool {
	return p.isPersonalOrg(ctx, orgID)
}

func (p *PolicyService) EnsureProjectInOrg(ctx context.Context, projectID *uint, orgID *uint) error {
	if projectID == nil {
		return nil
	}
	projectOrgID, err := p.repo.FindProjectOrgID(ctx, *projectID)
	if err != nil {
		return err
	}
	if !sameOrg(projectOrgID, orgID) {
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

func (p *PolicyService) isPersonalOrg(ctx context.Context, orgID uint) bool {
	return p.repo.IsPersonalOrg(ctx, orgID)
}

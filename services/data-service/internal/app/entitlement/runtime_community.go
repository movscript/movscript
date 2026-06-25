//go:build !runtime_overlay

package entitlement

import (
	"context"
	"errors"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainentitlement "github.com/movscript/movscript/internal/domain/entitlement"
	"github.com/movscript/movscript/internal/infra/config"
	"gorm.io/gorm"
)

type communityService struct {
	identity       orgReader
	deploymentMode domainentitlement.DeploymentMode
}

type orgReader interface {
	ListOrgs(ctx context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error)
}

func newRuntimeService(db *gorm.DB, cfg *config.Config) domainentitlement.EntitlementService {
	return newRuntimeServiceWithIdentity(db, cfg, nil)
}

func newRuntimeServiceWithIdentity(_ *gorm.DB, cfg *config.Config, identity orgReader) domainentitlement.EntitlementService {
	mode := domainentitlement.DeploymentSelfHostedTeam
	if cfg != nil {
		mode = domainentitlement.DeploymentMode(cfg.DeploymentMode)
	}
	return &communityService{identity: identity, deploymentMode: mode}
}

func (s *communityService) Resolve(ctx context.Context, subject domainentitlement.SubjectRef) (domainentitlement.EntitlementSnapshot, error) {
	snapshot := domainentitlement.EntitlementSnapshot{
		Subject:        subject,
		Plan:           domainentitlement.PlanFree,
		Status:         domainentitlement.StatusActive,
		DeploymentMode: s.deploymentMode,
		EnabledCapabilities: []domainentitlement.Capability{
			domainentitlement.CapabilityLocalWorkspace,
			domainentitlement.CapabilitySelfHostedWorkspace,
			domainentitlement.CapabilityBasicCollaboration,
			domainentitlement.CapabilityBasicGateway,
			domainentitlement.CapabilityGatewayAPIKeys,
			domainentitlement.CapabilityBasicAudit,
			domainentitlement.CapabilityUsageLogging,
		},
		Limits: domainentitlement.LimitSnapshot{},
		RuntimeFlags: map[string]bool{
			"community":    true,
			"organization": true,
		},
	}

	if subject.OrgID == nil || s.identity == nil {
		return snapshot, nil
	}

	page, err := s.identity.ListOrgs(ctx, authidentity.ListOrgsFilter{OrgID: subject.OrgID, Page: 1, PageSize: 1})
	if err != nil {
		if errors.Is(err, authidentity.ErrOrgNotFound) {
			return snapshot, nil
		}
		return snapshot, err
	}
	if len(page.Items) == 0 {
		return snapshot, nil
	}
	org := page.Items[0]
	if org.IsPersonal {
		snapshot.Plan = domainentitlement.PlanPersonal
	}
	if org.Status != "" {
		snapshot.Status = domainentitlement.Status(org.Status)
	}

	return snapshot, nil
}

func (s *communityService) CanUse(ctx context.Context, subject domainentitlement.SubjectRef, capability domainentitlement.Capability) (domainentitlement.Decision, error) {
	snapshot, err := s.Resolve(ctx, subject)
	if err != nil {
		return domainentitlement.Decision{}, err
	}
	for _, enabled := range snapshot.EnabledCapabilities {
		if enabled == capability {
			return domainentitlement.Decision{Allowed: true}, nil
		}
	}
	return domainentitlement.Decision{
		Allowed: false,
		Code:    "CAPABILITY_NOT_INCLUDED",
		Reason:  "capability is not included in the current runtime",
	}, nil
}

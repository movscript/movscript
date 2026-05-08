//go:build !runtime_overlay

package entitlement

import (
	"context"
	"errors"

	domainentitlement "github.com/movscript/movscript/internal/domain/entitlement"
	"github.com/movscript/movscript/internal/infra/config"
	"gorm.io/gorm"
)

type communityService struct {
	repo           repository
	deploymentMode domainentitlement.DeploymentMode
}

func newRuntimeService(db *gorm.DB, cfg *config.Config) domainentitlement.EntitlementService {
	mode := domainentitlement.DeploymentSelfHostedTeam
	if cfg != nil {
		mode = domainentitlement.DeploymentMode(cfg.DeploymentMode)
	}
	return &communityService{repo: newRepository(db), deploymentMode: mode}
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

	if subject.OrgID == nil || s.repo == nil {
		return snapshot, nil
	}

	org, err := s.repo.FindOrganization(ctx, *subject.OrgID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return snapshot, nil
		}
		return snapshot, err
	}
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

func (s *communityService) CanAccessFeature(ctx context.Context, subject domainentitlement.SubjectRef, featureKey string) (domainentitlement.Decision, error) {
	_, err := s.Resolve(ctx, subject)
	if err != nil {
		return domainentitlement.Decision{}, err
	}
	return domainentitlement.Decision{Allowed: true}, nil
}

//go:build !enterprise

package entitlement

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/domain/commercial"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/config"
	"gorm.io/gorm"
)

type communityService struct {
	db             *gorm.DB
	deploymentMode commercial.DeploymentMode
}

func newEditionService(db *gorm.DB, cfg *config.Config) commercial.EntitlementService {
	mode := commercial.DeploymentSelfHostedTeam
	if cfg != nil {
		mode = commercial.DeploymentMode(cfg.DeploymentMode)
	}
	return &communityService{db: db, deploymentMode: mode}
}

func (s *communityService) Resolve(ctx context.Context, subject commercial.SubjectRef) (commercial.EntitlementSnapshot, error) {
	snapshot := commercial.EntitlementSnapshot{
		Subject:        subject,
		Plan:           commercial.PlanFree,
		Status:         commercial.StatusActive,
		DeploymentMode: s.deploymentMode,
		EnabledCapabilities: []commercial.Capability{
			commercial.CapabilityLocalWorkspace,
			commercial.CapabilitySelfHostedWorkspace,
			commercial.CapabilityBasicCollaboration,
			commercial.CapabilityBasicGateway,
			commercial.CapabilityGatewayAPIKeys,
			commercial.CapabilityBasicAudit,
			commercial.CapabilityUsageLogging,
		},
		Limits: commercial.LimitSnapshot{},
		CommercialFlags: map[string]bool{
			"community":              true,
			"organization":           true,
			"enterprise":             false,
			"hosted_cloud":           false,
			"remote_metering":        false,
			"platform_key_available": false,
		},
	}

	if subject.OrgID == nil || s.db == nil {
		return snapshot, nil
	}

	var org model.Organization
	if err := s.db.WithContext(ctx).Select("id, is_personal, plan, status").First(&org, *subject.OrgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return snapshot, nil
		}
		return snapshot, err
	}
	if org.IsPersonal {
		snapshot.Plan = commercial.PlanPersonal
	}
	if org.Status != "" {
		snapshot.Status = commercial.Status(org.Status)
	}

	return snapshot, nil
}

func (s *communityService) CanUse(ctx context.Context, subject commercial.SubjectRef, capability commercial.Capability) (commercial.Decision, error) {
	snapshot, err := s.Resolve(ctx, subject)
	if err != nil {
		return commercial.Decision{}, err
	}
	for _, enabled := range snapshot.EnabledCapabilities {
		if enabled == capability {
			return commercial.Decision{Allowed: true}, nil
		}
	}
	return commercial.Decision{
		Allowed: false,
		Code:    "CAPABILITY_NOT_INCLUDED",
		Reason:  "capability is not included in the community edition",
	}, nil
}

func (s *communityService) CanAccessFeature(ctx context.Context, subject commercial.SubjectRef, featureKey string) (commercial.Decision, error) {
	_, err := s.Resolve(ctx, subject)
	if err != nil {
		return commercial.Decision{}, err
	}
	return commercial.Decision{Allowed: true}, nil
}

//go:build enterprise

package entitlement

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/domain/commercial"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/config"
	"gorm.io/gorm"
)

type enterpriseService struct {
	db             *gorm.DB
	deploymentMode commercial.DeploymentMode
}

func newEditionService(db *gorm.DB, cfg *config.Config) commercial.EntitlementService {
	mode := commercial.DeploymentEnterprisePrivate
	if cfg != nil && cfg.DeploymentMode != "" {
		mode = commercial.DeploymentMode(cfg.DeploymentMode)
	}
	return &enterpriseService{db: db, deploymentMode: mode}
}

func (s *enterpriseService) Resolve(ctx context.Context, subject commercial.SubjectRef) (commercial.EntitlementSnapshot, error) {
	snapshot := commercial.EntitlementSnapshot{
		Subject:        subject,
		Plan:           commercial.PlanEnterprise,
		Status:         commercial.StatusActive,
		DeploymentMode: s.deploymentMode,
		EnabledCapabilities: []commercial.Capability{
			commercial.CapabilityLocalWorkspace,
			commercial.CapabilitySelfHostedWorkspace,
			commercial.CapabilityBasicCollaboration,
			commercial.CapabilityBasicGateway,
			commercial.CapabilityGatewayAPIKeys,
			commercial.CapabilityOrgBudget,
			commercial.CapabilityUsageLogging,
			commercial.CapabilityBasicAudit,
			commercial.CapabilityAuditExport,
			commercial.CapabilityEnterpriseLicense,
			commercial.CapabilitySSO,
			commercial.CapabilitySCIM,
			commercial.CapabilityCommercialMarketplace,
		},
		Limits: commercial.LimitSnapshot{},
		CommercialFlags: map[string]bool{
			"community":              false,
			"enterprise":             true,
			"hosted_cloud":           s.deploymentMode == commercial.DeploymentHostedCloud,
			"remote_metering":        true,
			"platform_key_available": true,
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
	} else if org.Plan != "" {
		snapshot.Plan = commercial.Plan(org.Plan)
	}
	if org.Status != "" {
		snapshot.Status = commercial.Status(org.Status)
	}

	var quota model.OrgQuota
	if err := s.db.WithContext(ctx).Where("org_id = ?", org.ID).First(&quota).Error; err == nil {
		snapshot.Limits.MonthlyBudget = quota.MonthlyBudget
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return snapshot, err
	}

	return snapshot, nil
}

func (s *enterpriseService) CanUse(ctx context.Context, subject commercial.SubjectRef, capability commercial.Capability) (commercial.Decision, error) {
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
		Reason:  "capability is not included in this enterprise entitlement",
	}, nil
}

func (s *enterpriseService) CanAccessFeature(ctx context.Context, subject commercial.SubjectRef, featureKey string) (commercial.Decision, error) {
	_, err := s.Resolve(ctx, subject)
	if err != nil {
		return commercial.Decision{}, err
	}
	return commercial.Decision{Allowed: true}, nil
}

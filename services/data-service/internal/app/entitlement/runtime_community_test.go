//go:build !runtime_overlay

package entitlement

import (
	"context"
	"testing"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainentitlement "github.com/movscript/movscript/internal/domain/entitlement"
	"github.com/movscript/movscript/internal/infra/config"
)

func TestCommunityResolvePersonalOrg(t *testing.T) {
	orgID := uint(11)
	service := newRuntimeServiceWithIdentity(nil, &config.Config{DeploymentMode: string(domainentitlement.DeploymentPersonalLocal)}, fakeEntitlementIdentity{
		orgs: map[uint]authidentity.Organization{
			orgID: {ID: orgID, Name: "Personal", Slug: "personal", IsPersonal: true, Plan: "personal", Status: "active", CreatedBy: 1},
		},
	})

	snapshot, err := service.Resolve(context.Background(), domainentitlement.SubjectRef{UserID: 1, OrgID: &orgID})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if snapshot.Plan != domainentitlement.PlanPersonal {
		t.Fatalf("Plan = %q, want %q", snapshot.Plan, domainentitlement.PlanPersonal)
	}
	if snapshot.DeploymentMode != domainentitlement.DeploymentPersonalLocal {
		t.Fatalf("DeploymentMode = %q, want %q", snapshot.DeploymentMode, domainentitlement.DeploymentPersonalLocal)
	}
	if !hasCapability(snapshot, domainentitlement.CapabilityBasicGateway) {
		t.Fatalf("community personal snapshot missing %q", domainentitlement.CapabilityBasicGateway)
	}
	if !hasCapability(snapshot, domainentitlement.CapabilityUsageLogging) {
		t.Fatalf("community personal snapshot missing %q", domainentitlement.CapabilityUsageLogging)
	}
	if !snapshot.RuntimeFlags["organization"] {
		t.Fatal("community snapshot should mark organization=true")
	}
}

func TestCommunityResolveOrgWithoutRuntimeUsageLimits(t *testing.T) {
	orgID := uint(22)
	service := newRuntimeServiceWithIdentity(nil, &config.Config{DeploymentMode: string(domainentitlement.DeploymentSelfHostedTeam)}, fakeEntitlementIdentity{
		orgs: map[uint]authidentity.Organization{
			orgID: {ID: orgID, Name: "Team", Slug: "team", IsPersonal: false, Plan: "team", Status: "active", CreatedBy: 1},
		},
	})

	snapshot, err := service.Resolve(context.Background(), domainentitlement.SubjectRef{UserID: 1, OrgID: &orgID})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if snapshot.Plan != domainentitlement.PlanFree {
		t.Fatalf("Plan = %q, want %q", snapshot.Plan, domainentitlement.PlanFree)
	}
	if snapshot.Status != domainentitlement.StatusActive {
		t.Fatalf("Status = %q, want %q", snapshot.Status, domainentitlement.StatusActive)
	}
	if snapshot.Limits.UsageCreditLimit != 0 {
		t.Fatalf("UsageCreditLimit = %v, want 0", snapshot.Limits.UsageCreditLimit)
	}
	if !hasCapability(snapshot, domainentitlement.CapabilityUsageLogging) {
		t.Fatalf("community snapshot missing %q", domainentitlement.CapabilityUsageLogging)
	}
}

func TestCommunityCanUseRejectsUnknownCapability(t *testing.T) {
	service := NewService(nil, &config.Config{DeploymentMode: string(domainentitlement.DeploymentSelfHostedTeam)})

	decision, err := service.CanUse(context.Background(), domainentitlement.SubjectRef{UserID: 1}, domainentitlement.Capability("identity.sso"))
	if err != nil {
		t.Fatalf("CanUse() error = %v", err)
	}
	if decision.Allowed {
		t.Fatal("CanUse(unknown capability).Allowed = true, want false")
	}
}

func hasCapability(snapshot domainentitlement.EntitlementSnapshot, capability domainentitlement.Capability) bool {
	for _, candidate := range snapshot.EnabledCapabilities {
		if candidate == capability {
			return true
		}
	}
	return false
}

type fakeEntitlementIdentity struct {
	orgs map[uint]authidentity.Organization
}

func (f fakeEntitlementIdentity) ListOrgs(_ context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error) {
	items := make([]authidentity.Organization, 0)
	for _, org := range f.orgs {
		if filter.OrgID != nil && org.ID != *filter.OrgID {
			continue
		}
		items = append(items, org)
	}
	return authidentity.OrgPage{Items: items, Total: int64(len(items)), Page: filter.Page, PageSize: filter.PageSize}, nil
}

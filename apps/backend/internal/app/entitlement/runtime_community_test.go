//go:build !runtime_overlay

package entitlement

import (
	"context"
	"testing"

	domainentitlement "github.com/movscript/movscript/internal/domain/entitlement"
	"github.com/movscript/movscript/internal/infra/config"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCommunityResolvePersonalOrg(t *testing.T) {
	db := openEntitlementTestDB(t)
	orgID := createEntitlementTestOrg(t, db, model.Organization{
		Name:       "Personal",
		Slug:       "personal",
		IsPersonal: true,
		Plan:       "personal",
		Status:     "active",
		CreatedBy:  1,
	})
	service := NewService(db, &config.Config{DeploymentMode: string(domainentitlement.DeploymentPersonalLocal)})

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
	db := openEntitlementTestDB(t)
	orgID := createEntitlementTestOrg(t, db, model.Organization{
		Name:       "Team",
		Slug:       "team",
		IsPersonal: false,
		Plan:       "team",
		Status:     "active",
		CreatedBy:  1,
	})
	service := NewService(db, &config.Config{DeploymentMode: string(domainentitlement.DeploymentSelfHostedTeam)})

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

func openEntitlementTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.Organization{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func createEntitlementTestOrg(t *testing.T, db *gorm.DB, org model.Organization) uint {
	t.Helper()
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	return org.ID
}

func hasCapability(snapshot domainentitlement.EntitlementSnapshot, capability domainentitlement.Capability) bool {
	for _, candidate := range snapshot.EnabledCapabilities {
		if candidate == capability {
			return true
		}
	}
	return false
}

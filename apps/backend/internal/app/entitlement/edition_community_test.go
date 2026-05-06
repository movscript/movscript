//go:build !enterprise

package entitlement

import (
	"context"
	"testing"

	"github.com/movscript/movscript/internal/domain/commercial"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/config"
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
	service := NewService(db, &config.Config{DeploymentMode: string(commercial.DeploymentPersonalLocal)})

	snapshot, err := service.Resolve(context.Background(), commercial.SubjectRef{UserID: 1, OrgID: &orgID})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if snapshot.Plan != commercial.PlanPersonal {
		t.Fatalf("Plan = %q, want %q", snapshot.Plan, commercial.PlanPersonal)
	}
	if snapshot.DeploymentMode != commercial.DeploymentPersonalLocal {
		t.Fatalf("DeploymentMode = %q, want %q", snapshot.DeploymentMode, commercial.DeploymentPersonalLocal)
	}
	if !hasCapability(snapshot, commercial.CapabilityBasicGateway) {
		t.Fatalf("community personal snapshot missing %q", commercial.CapabilityBasicGateway)
	}
	if snapshot.CommercialFlags["enterprise"] {
		t.Fatal("community snapshot should not mark enterprise=true")
	}
}

func TestCommunityResolveTeamOrgWithoutCommercialBudget(t *testing.T) {
	db := openEntitlementTestDB(t)
	orgID := createEntitlementTestOrg(t, db, model.Organization{
		Name:       "Team",
		Slug:       "team",
		IsPersonal: false,
		Plan:       "team",
		Status:     "trialing",
		CreatedBy:  1,
	})
	if err := db.Create(&model.OrgQuota{OrgID: orgID, MonthlyBudget: 120}).Error; err != nil {
		t.Fatalf("create quota: %v", err)
	}
	service := NewService(db, &config.Config{DeploymentMode: string(commercial.DeploymentSelfHostedTeam)})

	snapshot, err := service.Resolve(context.Background(), commercial.SubjectRef{UserID: 1, OrgID: &orgID})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if snapshot.Plan != commercial.PlanTeam {
		t.Fatalf("Plan = %q, want %q", snapshot.Plan, commercial.PlanTeam)
	}
	if snapshot.Status != commercial.StatusTrialing {
		t.Fatalf("Status = %q, want %q", snapshot.Status, commercial.StatusTrialing)
	}
	if snapshot.Limits.MonthlyBudget != 0 {
		t.Fatalf("MonthlyBudget = %v, want 0", snapshot.Limits.MonthlyBudget)
	}
	if hasCapability(snapshot, commercial.CapabilityOrgBudget) {
		t.Fatalf("community snapshot should not include %q", commercial.CapabilityOrgBudget)
	}
	if hasCapability(snapshot, commercial.CapabilityUsageLogging) {
		t.Fatalf("community snapshot should not include %q", commercial.CapabilityUsageLogging)
	}
}

func TestCommunityCanUseRejectsEnterpriseCapability(t *testing.T) {
	service := NewService(nil, &config.Config{DeploymentMode: string(commercial.DeploymentSelfHostedTeam)})

	decision, err := service.CanUse(context.Background(), commercial.SubjectRef{UserID: 1}, commercial.CapabilitySSO)
	if err != nil {
		t.Fatalf("CanUse() error = %v", err)
	}
	if decision.Allowed {
		t.Fatal("CanUse(CapabilitySSO).Allowed = true, want false")
	}
}

func openEntitlementTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.Organization{}, &model.OrgQuota{}); err != nil {
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

func hasCapability(snapshot commercial.EntitlementSnapshot, capability commercial.Capability) bool {
	for _, candidate := range snapshot.EnabledCapabilities {
		if candidate == capability {
			return true
		}
	}
	return false
}

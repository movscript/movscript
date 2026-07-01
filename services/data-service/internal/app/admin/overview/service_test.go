//go:build !runtime_overlay

package overview

import (
	"context"
	"testing"
	"time"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestSummaryAggregatesAdminOverview(t *testing.T) {
	db := testutil.OpenSQLite(t, "admin-overview.db",
		&persistencemodel.Project{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.Job{},
		&persistencemodel.UsageLog{},
		&persistencemodel.RawResource{},
		&persistencemodel.AuditLog{},
	)
	now := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)
	seedOverviewData(t, db, now)

	service := NewService(db, fakeOverviewIdentity{
		userTotals: map[string]int64{"": 2, domainidentity.UserStatusActive: 1},
		orgTotals:  map[string]int64{"": 2, "suspended": 1},
	})
	service.now = func() time.Time { return now }
	summary, err := service.Summary(context.Background())
	if err != nil {
		t.Fatalf("Summary returned error: %v", err)
	}
	if summary.Users.Total != 2 || summary.Users.Active != 1 || summary.Users.Disabled != 1 {
		t.Fatalf("unexpected users: %+v", summary.Users)
	}
	if summary.Orgs.Total != 2 || summary.Orgs.Suspended != 1 {
		t.Fatalf("unexpected orgs: %+v", summary.Orgs)
	}
	if summary.Projects.Total != 1 {
		t.Fatalf("projects total = %d, want 1", summary.Projects.Total)
	}
	if summary.Models.Credentials != 2 || summary.Models.EnabledCredentials != 1 || summary.Models.EnabledCatalogEntries != 1 || summary.Models.EnabledRouteBindings != 1 {
		t.Fatalf("unexpected models: %+v", summary.Models)
	}
	if summary.Jobs.Total != 3 || summary.Jobs.Pending != 1 || summary.Jobs.Running != 1 || summary.Jobs.Failed != 1 {
		t.Fatalf("unexpected jobs: %+v", summary.Jobs)
	}
	if summary.Usage.Records != 3 || summary.Usage.Cost7D != 1 || summary.Usage.Cost30D != 10 {
		t.Fatalf("unexpected usage: %+v", summary.Usage)
	}
	if summary.Resources.Total != 2 || summary.Resources.Bytes != 300 {
		t.Fatalf("unexpected resources: %+v", summary.Resources)
	}
	if summary.Audits.Total != 1 || summary.GeneratedAt == "" {
		t.Fatalf("unexpected audits/generated_at: audits=%+v generated_at=%q", summary.Audits, summary.GeneratedAt)
	}
}

func seedOverviewData(t *testing.T, db *gorm.DB, now time.Time) {
	t.Helper()
	ownerID := uint(1)
	project := persistencemodel.Project{Name: "Film", OwnerID: ownerID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	credentials := []persistencemodel.AICredential{
		{AdapterType: "openai_compat", DisplayName: "OpenAI", IsEnabled: true},
		{AdapterType: "gemini", DisplayName: "Gemini", IsEnabled: false},
	}
	for i := range credentials {
		if err := db.Create(&credentials[i]).Error; err != nil {
			t.Fatalf("create credential: %v", err)
		}
	}
	if err := db.Model(&credentials[1]).Update("is_enabled", false).Error; err != nil {
		t.Fatalf("disable credential: %v", err)
	}
	catalogEntries := []persistencemodel.AIModelCatalogEntry{
		{PublicModelID: "video-fast", DisplayName: "Video Fast", IsEnabled: true, Capabilities: "video_generation"},
		{PublicModelID: "image-fast", DisplayName: "Image Fast", IsEnabled: true, Capabilities: "image_generation"},
	}
	for i := range catalogEntries {
		if err := db.Create(&catalogEntries[i]).Error; err != nil {
			t.Fatalf("create catalog entry: %v", err)
		}
	}
	if err := db.Model(&catalogEntries[1]).Update("is_enabled", false).Error; err != nil {
		t.Fatalf("disable catalog entry: %v", err)
	}
	routeBindings := []persistencemodel.AIModelRouteBinding{
		{CatalogEntryID: catalogEntries[0].ID, SourceType: persistencemodel.ModelRouteSourceLocalProvider, ProviderModelID: "provider-video-fast", CredentialID: &credentials[0].ID, IsEnabled: true, CapacityWeight: 1},
		{CatalogEntryID: catalogEntries[1].ID, SourceType: persistencemodel.ModelRouteSourceLocalProvider, ProviderModelID: "provider-image-fast", CredentialID: &credentials[1].ID, IsEnabled: false, CapacityWeight: 1},
	}
	for i := range routeBindings {
		if err := db.Create(&routeBindings[i]).Error; err != nil {
			t.Fatalf("create route binding: %v", err)
		}
	}
	if err := db.Model(&routeBindings[1]).Update("is_enabled", false).Error; err != nil {
		t.Fatalf("disable route binding: %v", err)
	}
	jobs := []persistencemodel.Job{
		{UserID: ownerID, AIModelCatalogEntryID: &catalogEntries[0].ID, JobType: "image", Status: "pending"},
		{UserID: ownerID, AIModelCatalogEntryID: &catalogEntries[0].ID, JobType: "image", Status: "running"},
		{UserID: ownerID, AIModelCatalogEntryID: &catalogEntries[0].ID, JobType: "image", Status: "failed"},
	}
	for i := range jobs {
		if err := db.Create(&jobs[i]).Error; err != nil {
			t.Fatalf("create job: %v", err)
		}
	}
	logs := []persistencemodel.UsageLog{
		{UserID: ownerID, AIModelCatalogEntryID: &catalogEntries[0].ID, RouteBindingID: &routeBindings[0].ID, OperationType: "image", Cost: 1},
		{UserID: ownerID, AIModelCatalogEntryID: &catalogEntries[0].ID, RouteBindingID: &routeBindings[0].ID, OperationType: "video", Cost: 2},
		{UserID: ownerID, AIModelCatalogEntryID: &catalogEntries[0].ID, RouteBindingID: &routeBindings[0].ID, OperationType: "text", Cost: 7},
	}
	for i := range logs {
		if err := db.Create(&logs[i]).Error; err != nil {
			t.Fatalf("create usage log: %v", err)
		}
		createdAt := now.AddDate(0, 0, -i*10)
		if err := db.Model(&logs[i]).Updates(map[string]any{"created_at": createdAt, "updated_at": createdAt}).Error; err != nil {
			t.Fatalf("set usage timestamp: %v", err)
		}
	}
	resources := []persistencemodel.RawResource{
		{OwnerID: ownerID, Type: "image", Name: "a", FilePath: "a.png", Size: 100},
		{OwnerID: ownerID, Type: "video", Name: "b", FilePath: "b.mp4", Size: 200},
	}
	for i := range resources {
		if err := db.Create(&resources[i]).Error; err != nil {
			t.Fatalf("create resource: %v", err)
		}
	}
	audit := persistencemodel.AuditLog{Action: "project.admin_deleted", TargetType: "project", TargetID: "1"}
	if err := db.Create(&audit).Error; err != nil {
		t.Fatalf("create audit log: %v", err)
	}
}

type fakeOverviewIdentity struct {
	userTotals map[string]int64
	orgTotals  map[string]int64
}

func (f fakeOverviewIdentity) UserProfile(_ context.Context, userID uint) (domainidentity.UserProfile, error) {
	return domainidentity.UserProfile{}, authidentity.ErrUserNotFound
}

func (f fakeOverviewIdentity) OrgMemberships(_ context.Context, _ uint) ([]authidentity.OrgMembership, error) {
	return nil, nil
}

func (f fakeOverviewIdentity) ListUsers(_ context.Context, filter authidentity.ListUsersFilter) (authidentity.UserPage, error) {
	return authidentity.UserPage{Total: f.userTotals[filter.Status], Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (f fakeOverviewIdentity) CreateUser(_ context.Context, input authidentity.CreateUserInput) (domainidentity.UserProfile, error) {
	return domainidentity.UserProfile{}, authidentity.ErrBadRequest
}

func (f fakeOverviewIdentity) UpdateUser(_ context.Context, userID uint, input authidentity.UpdateUserInput) (domainidentity.UserProfile, error) {
	return domainidentity.UserProfile{}, authidentity.ErrBadRequest
}

func (f fakeOverviewIdentity) SetUserPasswordHash(_ context.Context, userID uint, passwordHash string) (domainidentity.UserProfile, error) {
	return domainidentity.UserProfile{}, authidentity.ErrBadRequest
}

func (f fakeOverviewIdentity) ListOrgs(_ context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error) {
	return authidentity.OrgPage{Total: f.orgTotals[filter.Status], Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (f fakeOverviewIdentity) CreateOrg(_ context.Context, input authidentity.CreateOrgInput) (authidentity.Organization, error) {
	return authidentity.Organization{}, authidentity.ErrBadRequest
}

func (f fakeOverviewIdentity) UpdateOrg(_ context.Context, orgID uint, input authidentity.UpdateOrgInput) (authidentity.Organization, error) {
	return authidentity.Organization{}, authidentity.ErrBadRequest
}

func (f fakeOverviewIdentity) ListOrgMembers(_ context.Context, orgID uint) ([]authidentity.OrganizationMember, error) {
	return nil, nil
}

func (f fakeOverviewIdentity) AddOrgMember(_ context.Context, orgID uint, input authidentity.OrgMemberInput) (authidentity.OrganizationMember, error) {
	return authidentity.OrganizationMember{}, authidentity.ErrBadRequest
}

func (f fakeOverviewIdentity) UpdateOrgMember(_ context.Context, orgID uint, userID uint, input authidentity.OrgMemberInput) (authidentity.OrganizationMember, error) {
	return authidentity.OrganizationMember{}, authidentity.ErrBadRequest
}

func (f fakeOverviewIdentity) RemoveOrgMember(_ context.Context, orgID uint, userID uint) (bool, error) {
	return false, authidentity.ErrBadRequest
}

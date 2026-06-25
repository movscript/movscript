package projectrepo

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestEnsureProjectRepositoryCreatesStableBinding(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-binding.db",
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := createProjectRepoUser("owner")
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	adapter := &fakeGitRepositoryAdapter{result: EnsureRepositoryResult{ProviderRepoID: "42", HeadCommit: "abc123"}}
	service := newProjectRepoTestService(t, db, Config{RepoPrefix: "project-", DefaultBranch: "main"}, adapter)

	binding, err := service.EnsureProjectRepository(context.Background(), project.ID, nil)
	if err != nil {
		t.Fatalf("EnsureProjectRepository returned error: %v", err)
	}
	if binding.ProjectID != project.ID || binding.Owner != "owner" || binding.Repo != "project-1" || binding.Status != StatusActive {
		t.Fatalf("unexpected binding: %+v", binding)
	}
	if binding.ProviderRepoID != "42" || binding.HeadCommit != "abc123" {
		t.Fatalf("adapter result not persisted: %+v", binding)
	}
	if adapter.calls != 1 {
		t.Fatalf("adapter calls = %d, want 1", adapter.calls)
	}

	if err := db.Model(&persistencemodel.Project{}).Where("id = ?", project.ID).Update("name", "Renamed").Error; err != nil {
		t.Fatalf("rename project: %v", err)
	}
	again, err := service.EnsureProjectRepository(context.Background(), project.ID, nil)
	if err != nil {
		t.Fatalf("second EnsureProjectRepository returned error: %v", err)
	}
	if again.Repo != binding.Repo || again.ProviderRepoID != binding.ProviderRepoID {
		t.Fatalf("binding changed after project rename: before=%+v after=%+v", binding, again)
	}
	if adapter.calls != 2 {
		t.Fatalf("adapter calls = %d, want 2", adapter.calls)
	}
}

func TestLocalGitAdapterCreatesBareRepository(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skipf("git binary not available: %v", err)
	}
	root := t.TempDir()
	adapter := NewLocalGitAdapter(root, "git")

	result, err := adapter.EnsureRepository(context.Background(), EnsureRepositoryInput{
		Owner:         "alice",
		Repo:          "project-1",
		DefaultBranch: "main",
	})
	if err != nil {
		t.Fatalf("EnsureRepository returned error: %v", err)
	}
	if result.ProviderRepoID != "alice/project-1.git" {
		t.Fatalf("ProviderRepoID = %q, want alice/project-1.git", result.ProviderRepoID)
	}
	if _, err := os.Stat(filepath.Join(root, "alice", "project-1.git", "HEAD")); err != nil {
		t.Fatalf("bare repository HEAD not created: %v", err)
	}
	head, err := os.ReadFile(filepath.Join(root, "alice", "project-1.git", "HEAD"))
	if err != nil {
		t.Fatalf("read HEAD: %v", err)
	}
	if string(head) != "ref: refs/heads/main\n" {
		t.Fatalf("HEAD = %q, want main symbolic ref", string(head))
	}
}

func TestLocalGitAdapterCloneURLStrategies(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skipf("git binary not available: %v", err)
	}
	root := t.TempDir()
	adapter := NewLocalGitAdapter(root, "git")
	if _, err := adapter.EnsureRepository(context.Background(), EnsureRepositoryInput{
		Owner:         "alice",
		Repo:          "project-1",
		DefaultBranch: "main",
	}); err != nil {
		t.Fatalf("EnsureRepository returned error: %v", err)
	}

	proxy, err := adapter.GetCloneURL(context.Background(), providercontract.RepositoryCloneURLRequest{
		Ref:       providercontract.RepositoryRef{Owner: "alice", Repo: "project-1"},
		PublicURL: "/api/v1/projects/1/git/project-1.git",
	})
	if err != nil {
		t.Fatalf("GetCloneURL proxy returned error: %v", err)
	}
	if proxy.Strategy != providercontract.RepositoryCloneURLStrategyProxy || proxy.URL != "/api/v1/projects/1/git/project-1.git" {
		t.Fatalf("proxy clone = %+v, want proxy public URL", proxy)
	}
	direct, err := adapter.GetCloneURL(context.Background(), providercontract.RepositoryCloneURLRequest{
		Ref:               providercontract.RepositoryRef{Owner: "alice", Repo: "project-1"},
		PreferredStrategy: providercontract.RepositoryCloneURLStrategyDirect,
	})
	if err != nil {
		t.Fatalf("GetCloneURL direct returned error: %v", err)
	}
	if direct.Strategy != providercontract.RepositoryCloneURLStrategyDirect || !strings.HasPrefix(direct.URL, "file://") {
		t.Fatalf("direct clone = %+v, want file direct URL", direct)
	}
}

func TestEnsureProjectRepositoryRepairsExistingBindingWhenRemoteRepoMissing(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-existing-binding-repair.db",
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := createProjectRepoUser("owner")
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&persistencemodel.ProjectRepository{
		ProjectID:     project.ID,
		Provider:      ProviderGitea,
		Owner:         "movscript",
		Repo:          "project-1",
		DefaultBranch: "main",
		Status:        StatusActive,
	}).Error; err != nil {
		t.Fatalf("create binding: %v", err)
	}
	adapter := &fakeGitRepositoryAdapter{result: EnsureRepositoryResult{ProviderRepoID: "remote-1", HeadCommit: "head-1"}}
	service := newProjectRepoTestService(t, db, Config{RepoPrefix: "project-", DefaultBranch: "main"}, adapter)

	binding, err := service.EnsureProjectRepository(context.Background(), project.ID, nil)
	if err != nil {
		t.Fatalf("EnsureProjectRepository returned error: %v", err)
	}
	if adapter.calls != 1 {
		t.Fatalf("adapter calls = %d, want 1", adapter.calls)
	}
	if binding.Status != StatusActive || binding.ProviderRepoID != "remote-1" || binding.HeadCommit != "head-1" {
		t.Fatalf("binding was not repaired: %+v", binding)
	}
}

func TestEnsureProjectRepositoryReconcilesExistingBindingOwner(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-owner-reconcile.db",
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := createProjectRepoUser("alice")
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&persistencemodel.ProjectRepository{
		ProjectID:      project.ID,
		Provider:       ProviderGitea,
		Owner:          "movscript",
		Repo:           "project-1",
		DefaultBranch:  "main",
		Status:         StatusActive,
		ProviderRepoID: "old-remote",
		HeadCommit:     "old-head",
	}).Error; err != nil {
		t.Fatalf("create binding: %v", err)
	}
	adapter := &fakeGitRepositoryAdapter{result: EnsureRepositoryResult{ProviderRepoID: "alice-remote", HeadCommit: "alice-head"}}
	service := newProjectRepoTestService(t, db, Config{RepoPrefix: "project-", DefaultBranch: "main"}, adapter)

	binding, err := service.EnsureProjectRepository(context.Background(), project.ID, nil)
	if err != nil {
		t.Fatalf("EnsureProjectRepository returned error: %v", err)
	}
	if binding.Owner != "alice" {
		t.Fatalf("owner = %q, want alice", binding.Owner)
	}
	if binding.Status != StatusActive || binding.ProviderRepoID != "alice-remote" || binding.HeadCommit != "alice-head" {
		t.Fatalf("binding was not reprovisioned under reconciled owner: %+v", binding)
	}
	if adapter.input.Owner != "alice" {
		t.Fatalf("adapter owner = %q, want alice", adapter.input.Owner)
	}
}

func TestEnsureProjectRepositoryRetriesErrorBinding(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-error-binding-retry.db",
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := createProjectRepoUser("owner")
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&persistencemodel.ProjectRepository{
		ProjectID:      project.ID,
		Provider:       ProviderGitea,
		Owner:          "movscript",
		Repo:           "project-1",
		DefaultBranch:  "main",
		Status:         StatusError,
		LastSyncError:  "previous failure",
		ProviderRepoID: "",
	}).Error; err != nil {
		t.Fatalf("create binding: %v", err)
	}
	adapter := &fakeGitRepositoryAdapter{result: EnsureRepositoryResult{ProviderRepoID: "remote-1", HeadCommit: "head-1"}}
	service := newProjectRepoTestService(t, db, Config{RepoPrefix: "project-", DefaultBranch: "main"}, adapter)

	binding, err := service.EnsureProjectRepository(context.Background(), project.ID, nil)
	if err != nil {
		t.Fatalf("EnsureProjectRepository returned error: %v", err)
	}
	if binding.Status != StatusActive || binding.LastSyncError != "" {
		t.Fatalf("error binding was not recovered: %+v", binding)
	}
}

func TestEnsureProjectRepositoryKeepsProvisioningWithoutAdapter(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-no-adapter.db",
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := createProjectRepoUser("owner")
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	service := newProjectRepoTestService(t, db, Config{RepoPrefix: "project-"}, nil)

	binding, err := service.EnsureProjectRepository(context.Background(), project.ID, nil)
	if err != nil {
		t.Fatalf("EnsureProjectRepository returned error: %v", err)
	}
	if binding.Status != StatusProvisioning {
		t.Fatalf("status = %q, want provisioning", binding.Status)
	}
	if binding.Repo != "project-1" {
		t.Fatalf("repo = %q, want project-1", binding.Repo)
	}
}

func TestEnsureProjectRepositoryRecordsAdapterFailure(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-error.db",
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := createProjectRepoUser("owner")
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	service := newProjectRepoTestService(t, db, Config{RepoPrefix: "project-"}, &fakeGitRepositoryAdapter{err: errors.New("boom")})

	binding, err := service.EnsureProjectRepository(context.Background(), project.ID, nil)
	if err != nil {
		t.Fatalf("EnsureProjectRepository returned error: %v", err)
	}
	if binding.Status != StatusError || binding.LastSyncError != "boom" {
		t.Fatalf("adapter failure not recorded: %+v", binding)
	}
}

func TestEnsureProjectRepositoryHonorsOrgBoundary(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-org.db",
		&persistencemodel.Organization{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	orgID := uint(7)
	otherOrgID := uint(8)
	owner := createProjectRepoUser("owner")
	org := persistencemodel.Organization{Model: gorm.Model{ID: orgID}, Name: "Team", Slug: "team", Status: "active", Plan: "team", CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID, OrgID: &orgID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	service := newProjectRepoTestService(t, db, Config{RepoPrefix: "project-"}, nil)

	if _, err := service.EnsureProjectRepository(context.Background(), project.ID, &otherOrgID); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("err = %v, want ErrProjectNotFound", err)
	}
	if _, err := service.EnsureProjectRepository(context.Background(), project.ID, &orgID); err != nil {
		t.Fatalf("EnsureProjectRepository with matching org returned error: %v", err)
	}
}

func TestEnsureProjectRepositoryUsesPersonalGiteaOwner(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-personal-owner.db",
		&persistencemodel.Organization{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := createProjectRepoUser("alice")
	org := persistencemodel.Organization{Name: "alice", Slug: "alice", IsPersonal: true, Plan: domainorg.PlanPersonal, Status: domainorg.StatusActive, CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := persistencemodel.Project{Name: "Personal Pilot", OwnerID: owner.ID, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	adapter := &fakeGitRepositoryAdapter{result: EnsureRepositoryResult{ProviderRepoID: "personal-remote"}}
	service := newProjectRepoTestService(t, db, Config{RepoPrefix: "project-"}, adapter)

	binding, err := service.EnsureProjectRepository(context.Background(), project.ID, &org.ID)
	if err != nil {
		t.Fatalf("EnsureProjectRepository returned error: %v", err)
	}
	if binding.Owner != "alice" {
		t.Fatalf("owner = %q, want alice", binding.Owner)
	}
	if adapter.input.OwnerType != OwnerTypeUser || adapter.input.OwnerName != "alice" {
		t.Fatalf("adapter owner metadata = type %q name %q", adapter.input.OwnerType, adapter.input.OwnerName)
	}
}

func TestEnsureProjectRepositoryUsesOrganizationGiteaOwner(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-team-owner.db",
		&persistencemodel.Organization{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := createProjectRepoUser("owner")
	org := persistencemodel.Organization{Name: "Acme Studio", Slug: "acme", IsPersonal: false, Plan: domainorg.PlanTeam, Status: domainorg.StatusActive, CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := persistencemodel.Project{Name: "Team Pilot", OwnerID: owner.ID, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	adapter := &fakeGitRepositoryAdapter{result: EnsureRepositoryResult{ProviderRepoID: "team-remote"}}
	service := newProjectRepoTestService(t, db, Config{RepoPrefix: "project-", OrgPrefix: "ms-org-"}, adapter)

	binding, err := service.EnsureProjectRepository(context.Background(), project.ID, &org.ID)
	if err != nil {
		t.Fatalf("EnsureProjectRepository returned error: %v", err)
	}
	if binding.Owner != "ms-org-acme" {
		t.Fatalf("owner = %q, want ms-org-acme", binding.Owner)
	}
	if adapter.input.OwnerType != OwnerTypeOrganization || adapter.input.OwnerName != "Acme Studio" {
		t.Fatalf("adapter owner metadata = type %q name %q", adapter.input.OwnerType, adapter.input.OwnerName)
	}
}

func TestWorkspaceMetadataPassesActorToCloneURLStrategy(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-workspace-actor.db",
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := createProjectRepoUser("alice")
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	adapter := &fakeGitRepositoryAdapter{result: EnsureRepositoryResult{ProviderRepoID: "remote-1"}}
	service := newProjectRepoTestService(t, db, Config{RepoPrefix: "project-", DefaultBranch: "main"}, adapter)

	metadata, err := service.WorkspaceMetadata(context.Background(), project.ID, nil, RepositoryActor{UserID: 9, Username: "viewer"})
	if err != nil {
		t.Fatalf("WorkspaceMetadata returned error: %v", err)
	}
	if metadata.GitRemoteURL == "" {
		t.Fatalf("metadata git remote URL is empty: %+v", metadata)
	}
	if adapter.cloneRequest.Actor.UserID != 9 || adapter.cloneRequest.Actor.Username != "viewer" {
		t.Fatalf("clone actor = %+v, want current user actor", adapter.cloneRequest.Actor)
	}
}

func TestWorkspaceMetadataPassesConfiguredCloneURLStrategy(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-workspace-clone-strategy.db",
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := createProjectRepoUser("alice")
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	adapter := &fakeGitRepositoryAdapter{
		result:        EnsureRepositoryResult{ProviderRepoID: "remote-1"},
		cloneStrategy: providercontract.RepositoryCloneURLStrategyDirect,
	}
	service := newProjectRepoTestService(t, db, Config{
		RepoPrefix:       "project-",
		DefaultBranch:    "main",
		CloneURLStrategy: providercontract.RepositoryCloneURLStrategyDirect,
	}, adapter)

	metadata, err := service.WorkspaceMetadata(context.Background(), project.ID, nil, RepositoryActor{UserID: 9, Username: "viewer"})
	if err != nil {
		t.Fatalf("WorkspaceMetadata returned error: %v", err)
	}
	if adapter.cloneRequest.PreferredStrategy != providercontract.RepositoryCloneURLStrategyDirect {
		t.Fatalf("clone strategy = %q, want direct", adapter.cloneRequest.PreferredStrategy)
	}
	if metadata.GitRemoteStrategy != providercontract.RepositoryCloneURLStrategyDirect {
		t.Fatalf("metadata clone strategy = %q, want direct", metadata.GitRemoteStrategy)
	}
}

func TestWorkspaceMetadataUsesProxyURLForTemporaryCloneStrategy(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-workspace-clone-strategy-error.db",
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := createProjectRepoUser("alice")
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	adapter := &fakeGitRepositoryAdapter{
		result: EnsureRepositoryResult{ProviderRepoID: "remote-1"},
	}
	service := newProjectRepoTestService(t, db, Config{
		RepoPrefix:       "project-",
		DefaultBranch:    "main",
		CloneURLStrategy: providercontract.RepositoryCloneURLStrategyTemporary,
	}, adapter)

	metadata, err := service.WorkspaceMetadata(context.Background(), project.ID, nil, RepositoryActor{UserID: 9, Username: "viewer"})

	if err != nil {
		t.Fatalf("WorkspaceMetadata returned error: %v", err)
	}
	if metadata.GitRemoteStrategy != providercontract.RepositoryCloneURLStrategyTemporary {
		t.Fatalf("metadata clone strategy = %q, want temporary", metadata.GitRemoteStrategy)
	}
	if metadata.GitRemoteURL != "/api/v1/projects/1/git/project-1.git" {
		t.Fatalf("metadata clone URL = %q", metadata.GitRemoteURL)
	}
	if adapter.cloneRequest.PreferredStrategy != "" {
		t.Fatalf("adapter clone request = %+v, want no provider clone URL call", adapter.cloneRequest)
	}
}

type fakeGitRepositoryAdapter struct {
	calls         int
	result        EnsureRepositoryResult
	err           error
	input         EnsureRepositoryInput
	cloneRequest  providercontract.RepositoryCloneURLRequest
	cloneStrategy string
	cloneErr      error
}

var (
	nextProjectRepoUserID uint = 100
	projectRepoTestUsers       = map[uint]testutil.ExternalUser{}
)

func createProjectRepoUser(username string) testutil.ExternalUser {
	nextProjectRepoUserID++
	user := testutil.NewExternalUser(nextProjectRepoUserID, username)
	projectRepoTestUsers[user.ID] = user
	return user
}

func newProjectRepoTestService(t *testing.T, db *gorm.DB, cfg Config, adapter GitRepositoryAdapter) *Service {
	t.Helper()
	profiles := map[uint]domainidentity.UserProfile{}
	for _, user := range projectRepoTestUsers {
		profiles[user.ID] = domainidentity.UserProfile{ID: user.ID, Username: user.Username, Status: domainidentity.UserStatusActive}
	}
	orgs := map[uint]authidentity.Organization{}
	if db.Migrator().HasTable(&persistencemodel.Organization{}) {
		var rows []persistencemodel.Organization
		if err := db.Find(&rows).Error; err == nil {
			for _, org := range rows {
				orgs[org.ID] = authidentity.Organization{
					ID:         org.ID,
					Name:       org.Name,
					Slug:       org.Slug,
					Plan:       org.Plan,
					Status:     org.Status,
					IsPersonal: org.IsPersonal,
					CreatedBy:  org.CreatedBy,
				}
			}
		}
	}
	return NewServiceWithIdentity(db, cfg, adapter, fakeProjectRepoIdentity{profiles: profiles, orgs: orgs})
}

type fakeProjectRepoIdentity struct {
	profiles map[uint]domainidentity.UserProfile
	orgs     map[uint]authidentity.Organization
}

func (f fakeProjectRepoIdentity) UserProfile(_ context.Context, userID uint) (domainidentity.UserProfile, error) {
	if profile, ok := f.profiles[userID]; ok {
		return profile, nil
	}
	return domainidentity.UserProfile{}, authidentity.ErrUserNotFound
}

func (f fakeProjectRepoIdentity) OrgMemberships(context.Context, uint) ([]authidentity.OrgMembership, error) {
	return nil, nil
}

func (f fakeProjectRepoIdentity) ListOrgs(_ context.Context, filter authidentity.ListOrgsFilter) (authidentity.OrgPage, error) {
	items := make([]authidentity.Organization, 0)
	for _, org := range f.orgs {
		if filter.OrgID != nil && org.ID != *filter.OrgID {
			continue
		}
		items = append(items, org)
	}
	return authidentity.OrgPage{Items: items, Total: int64(len(items)), Page: filter.Page, PageSize: filter.PageSize}, nil
}

func (a *fakeGitRepositoryAdapter) EnsureRepository(_ context.Context, input EnsureRepositoryInput) (EnsureRepositoryResult, error) {
	a.calls++
	a.input = input
	return a.result, a.err
}

func (a *fakeGitRepositoryAdapter) GetCloneURL(_ context.Context, request providercontract.RepositoryCloneURLRequest) (providercontract.RepositoryCloneURLResult, error) {
	a.cloneRequest = request
	if a.cloneErr != nil {
		return providercontract.RepositoryCloneURLResult{}, a.cloneErr
	}
	strategy := a.cloneStrategy
	if strategy == "" {
		strategy = providercontract.RepositoryCloneURLStrategyProxy
	}
	return providercontract.RepositoryCloneURLResult{URL: request.PublicURL, Strategy: strategy}, nil
}

func (a *fakeGitRepositoryAdapter) GetGitHTTPProxyTarget(_ context.Context, request providercontract.GitHTTPProxyTargetRequest) (providercontract.GitHTTPProxyTarget, error) {
	return providercontract.GitHTTPProxyTarget{
		Provider:      ProviderGitea,
		Owner:         request.Ref.Owner,
		Repo:          request.Ref.Repo,
		DefaultBranch: request.Ref.DefaultBranch,
		BaseURL:       "http://gitea.local",
	}, nil
}

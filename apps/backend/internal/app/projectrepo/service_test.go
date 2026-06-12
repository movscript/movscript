package projectrepo

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

func TestEnsureProjectRepositoryCreatesStableBinding(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-binding.db",
		&persistencemodel.User{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := persistencemodel.User{Username: "owner"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	adapter := &fakeGitRepositoryAdapter{result: EnsureRepositoryResult{ProviderRepoID: "42", HeadCommit: "abc123"}}
	service := NewService(db, Config{RepoPrefix: "project-", DefaultBranch: "main"}, adapter)

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

func TestEnsureProjectRepositoryRepairsExistingBindingWhenRemoteRepoMissing(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-existing-binding-repair.db",
		&persistencemodel.User{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := persistencemodel.User{Username: "owner"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
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
	service := NewService(db, Config{RepoPrefix: "project-", DefaultBranch: "main"}, adapter)

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
		&persistencemodel.User{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := persistencemodel.User{Username: "alice"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
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
	service := NewService(db, Config{RepoPrefix: "project-", DefaultBranch: "main"}, adapter)

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
		&persistencemodel.User{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := persistencemodel.User{Username: "owner"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
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
	service := NewService(db, Config{RepoPrefix: "project-", DefaultBranch: "main"}, adapter)

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
		&persistencemodel.User{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := persistencemodel.User{Username: "owner"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	service := NewService(db, Config{RepoPrefix: "project-"}, nil)

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
		&persistencemodel.User{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := persistencemodel.User{Username: "owner"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	service := NewService(db, Config{RepoPrefix: "project-"}, &fakeGitRepositoryAdapter{err: errors.New("boom")})

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
		&persistencemodel.User{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	orgID := uint(7)
	otherOrgID := uint(8)
	owner := persistencemodel.User{Username: "owner"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	project := persistencemodel.Project{Name: "Pilot", OwnerID: owner.ID, OrgID: &orgID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	service := NewService(db, Config{RepoPrefix: "project-"}, nil)

	if _, err := service.EnsureProjectRepository(context.Background(), project.ID, &otherOrgID); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("err = %v, want ErrProjectNotFound", err)
	}
	if _, err := service.EnsureProjectRepository(context.Background(), project.ID, &orgID); err != nil {
		t.Fatalf("EnsureProjectRepository with matching org returned error: %v", err)
	}
}

func TestEnsureProjectRepositoryUsesPersonalGiteaOwner(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-personal-owner.db",
		&persistencemodel.User{},
		&persistencemodel.Organization{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := persistencemodel.User{Username: "alice"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	org := persistencemodel.Organization{Name: "alice", Slug: "alice", IsPersonal: true, Plan: domainorg.PlanPersonal, Status: domainorg.StatusActive, CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := persistencemodel.Project{Name: "Personal Pilot", OwnerID: owner.ID, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	adapter := &fakeGitRepositoryAdapter{result: EnsureRepositoryResult{ProviderRepoID: "personal-remote"}}
	service := NewService(db, Config{RepoPrefix: "project-"}, adapter)

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
		&persistencemodel.User{},
		&persistencemodel.Organization{},
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	owner := persistencemodel.User{Username: "owner"}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	org := persistencemodel.Organization{Name: "Acme Studio", Slug: "acme", IsPersonal: false, Plan: domainorg.PlanTeam, Status: domainorg.StatusActive, CreatedBy: owner.ID}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := persistencemodel.Project{Name: "Team Pilot", OwnerID: owner.ID, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	adapter := &fakeGitRepositoryAdapter{result: EnsureRepositoryResult{ProviderRepoID: "team-remote"}}
	service := NewService(db, Config{RepoPrefix: "project-", OrgPrefix: "ms-org-"}, adapter)

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

type fakeGitRepositoryAdapter struct {
	calls  int
	result EnsureRepositoryResult
	err    error
	input  EnsureRepositoryInput
}

func (a *fakeGitRepositoryAdapter) EnsureRepository(_ context.Context, input EnsureRepositoryInput) (EnsureRepositoryResult, error) {
	a.calls++
	a.input = input
	return a.result, a.err
}

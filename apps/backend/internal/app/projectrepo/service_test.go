package projectrepo

import (
	"context"
	"errors"
	"testing"

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
	service := NewService(db, Config{Owner: "movscript", RepoPrefix: "project-", DefaultBranch: "main"}, adapter)

	binding, err := service.EnsureProjectRepository(context.Background(), project.ID, nil)
	if err != nil {
		t.Fatalf("EnsureProjectRepository returned error: %v", err)
	}
	if binding.ProjectID != project.ID || binding.Owner != "movscript" || binding.Repo != "project-1" || binding.Status != StatusActive {
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
	if adapter.calls != 1 {
		t.Fatalf("adapter called for existing binding: %d", adapter.calls)
	}
}

func TestEnsureProjectRepositoryKeepsProvisioningWithoutAdapter(t *testing.T) {
	db := testutil.OpenSQLite(t, "project-repository-no-adapter.db",
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	project := persistencemodel.Project{Name: "Pilot"}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	service := NewService(db, Config{Owner: "movscript", RepoPrefix: "project-"}, nil)

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
	project := persistencemodel.Project{Name: "Pilot"}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	service := NewService(db, Config{Owner: "movscript", RepoPrefix: "project-"}, &fakeGitRepositoryAdapter{err: errors.New("boom")})

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
		&persistencemodel.Project{},
		&persistencemodel.ProjectRepository{},
	)
	orgID := uint(7)
	otherOrgID := uint(8)
	project := persistencemodel.Project{Name: "Pilot", OrgID: &orgID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	service := NewService(db, Config{Owner: "movscript", RepoPrefix: "project-"}, nil)

	if _, err := service.EnsureProjectRepository(context.Background(), project.ID, &otherOrgID); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("err = %v, want ErrProjectNotFound", err)
	}
	if _, err := service.EnsureProjectRepository(context.Background(), project.ID, &orgID); err != nil {
		t.Fatalf("EnsureProjectRepository with matching org returned error: %v", err)
	}
}

type fakeGitRepositoryAdapter struct {
	calls  int
	result EnsureRepositoryResult
	err    error
}

func (a *fakeGitRepositoryAdapter) EnsureRepository(context.Context, EnsureRepositoryInput) (EnsureRepositoryResult, error) {
	a.calls++
	return a.result, a.err
}

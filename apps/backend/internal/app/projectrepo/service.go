package projectrepo

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

const (
	ProviderGitea = "gitea"

	StatusProvisioning = "provisioning"
	StatusActive       = "active"
	StatusError        = "error"
	StatusArchived     = "archived"
)

var (
	ErrProjectNotFound          = errors.New("project not found")
	ErrInvalidRepositoryConfig  = errors.New("invalid project repository config")
	ErrRepositoryBindingMissing = errors.New("project repository binding missing")
	ErrRepositoryNotReady       = errors.New("project repository is not ready")
)

type Service struct {
	repo    repository
	adapter GitRepositoryAdapter
	config  Config
}

type Config struct {
	Provider      string
	Owner         string
	Repo          string
	RepoPrefix    string
	DefaultBranch string
	CreatedBy     *uint
}

type GitRepositoryAdapter interface {
	EnsureRepository(ctx context.Context, input EnsureRepositoryInput) (EnsureRepositoryResult, error)
}

type EnsureRepositoryInput struct {
	Owner         string
	Repo          string
	DefaultBranch string
	Description   string
	Private       bool
}

type EnsureRepositoryResult struct {
	ProviderRepoID string
	HeadCommit     string
}

type Binding struct {
	ID             uint   `json:"-"`
	ProjectID      uint   `json:"projectId"`
	Provider       string `json:"provider"`
	ProviderRepoID string `json:"providerRepoId,omitempty"`
	Owner          string `json:"owner"`
	Repo           string `json:"repo"`
	DefaultBranch  string `json:"defaultBranch"`
	HeadCommit     string `json:"headCommit,omitempty"`
	Status         string `json:"status"`
	LastSyncError  string `json:"lastSyncError,omitempty"`
}

type WorkspaceMetadata struct {
	ProjectID     uint   `json:"projectId"`
	RepoID        string `json:"repoId,omitempty"`
	Provider      string `json:"provider"`
	Owner         string `json:"owner"`
	Repo          string `json:"repo"`
	DefaultBranch string `json:"defaultBranch"`
	HeadCommit    string `json:"headCommit,omitempty"`
	GitRemoteURL  string `json:"gitRemoteUrl,omitempty"`
	Status        string `json:"status"`
	LastSyncError string `json:"lastSyncError,omitempty"`
}

func NewService(db *gorm.DB, cfg Config, adapter GitRepositoryAdapter) *Service {
	return NewServiceWithRepository(&gormRepository{db: db}, cfg, adapter)
}

func NewServiceWithRepository(repo repository, cfg Config, adapter GitRepositoryAdapter) *Service {
	return &Service{repo: repo, config: normalizeConfig(cfg), adapter: adapter}
}

func (s *Service) EnsureProjectRepository(ctx context.Context, projectID uint, orgID *uint) (Binding, error) {
	if projectID == 0 {
		return Binding{}, ErrProjectNotFound
	}
	project, err := s.repo.GetProject(ctx, projectID, orgID)
	if err != nil {
		return Binding{}, err
	}
	existing, err := s.repo.GetBinding(ctx, projectID)
	if err == nil {
		return bindingFromModel(existing), nil
	}
	if !errors.Is(err, ErrRepositoryBindingMissing) {
		return Binding{}, err
	}

	spec, err := s.bindingSpec(project)
	if err != nil {
		return Binding{}, err
	}
	binding, err := s.repo.CreateBinding(ctx, persistencemodel.ProjectRepository{
		ProjectID:     project.ID,
		Provider:      spec.Provider,
		Owner:         spec.Owner,
		Repo:          spec.Repo,
		DefaultBranch: spec.DefaultBranch,
		Status:        StatusProvisioning,
		CreatedBy:     s.config.CreatedBy,
	})
	if err != nil {
		return Binding{}, err
	}
	binding = s.provisionRepository(ctx, project, binding)
	return bindingFromModel(binding), nil
}

func (s *Service) WorkspaceMetadata(ctx context.Context, projectID uint, orgID *uint) (WorkspaceMetadata, error) {
	binding, err := s.EnsureProjectRepository(ctx, projectID, orgID)
	if err != nil {
		return WorkspaceMetadata{}, err
	}
	return WorkspaceMetadata{
		ProjectID:     binding.ProjectID,
		RepoID:        binding.ProviderRepoID,
		Provider:      binding.Provider,
		Owner:         binding.Owner,
		Repo:          binding.Repo,
		DefaultBranch: binding.DefaultBranch,
		HeadCommit:    binding.HeadCommit,
		GitRemoteURL:  fmt.Sprintf("/api/v1/projects/%d/git/%s.git", binding.ProjectID, binding.Repo),
		Status:        binding.Status,
		LastSyncError: binding.LastSyncError,
	}, nil
}

func (s *Service) GitProxyTarget(ctx context.Context, projectID uint, orgID *uint) (GitProxyTarget, error) {
	if projectID == 0 {
		return GitProxyTarget{}, ErrProjectNotFound
	}
	binding, err := s.EnsureProjectRepository(ctx, projectID, orgID)
	if err != nil {
		return GitProxyTarget{}, err
	}
	if binding.Status != StatusActive {
		return GitProxyTarget{}, fmt.Errorf("%w: status is %s", ErrRepositoryNotReady, binding.Status)
	}
	target := GitProxyTarget{
		ProjectID:     binding.ProjectID,
		Provider:      binding.Provider,
		Owner:         binding.Owner,
		Repo:          binding.Repo,
		DefaultBranch: binding.DefaultBranch,
	}
	return target, nil
}

func (s *Service) provisionRepository(ctx context.Context, project persistencemodel.Project, binding persistencemodel.ProjectRepository) persistencemodel.ProjectRepository {
	if s.adapter == nil {
		return binding
	}
	result, err := s.adapter.EnsureRepository(ctx, EnsureRepositoryInput{
		Owner:         binding.Owner,
		Repo:          binding.Repo,
		DefaultBranch: binding.DefaultBranch,
		Description:   project.Description,
		Private:       true,
	})
	if err != nil {
		updated, updateErr := s.repo.UpdateProvisioning(ctx, binding.ID, StatusError, result.ProviderRepoID, result.HeadCommit, err.Error())
		if updateErr == nil {
			return updated
		}
		binding.Status = StatusError
		binding.LastSyncError = err.Error()
		return binding
	}
	updated, updateErr := s.repo.UpdateProvisioning(ctx, binding.ID, StatusActive, result.ProviderRepoID, result.HeadCommit, "")
	if updateErr != nil {
		binding.Status = StatusActive
		binding.ProviderRepoID = result.ProviderRepoID
		binding.HeadCommit = result.HeadCommit
		return binding
	}
	return updated
}

func (s *Service) bindingSpec(project persistencemodel.Project) (persistencemodel.ProjectRepository, error) {
	owner := strings.TrimSpace(s.config.Owner)
	if owner == "" {
		return persistencemodel.ProjectRepository{}, fmt.Errorf("%w: repository owner is required", ErrInvalidRepositoryConfig)
	}
	repo := strings.TrimSpace(s.config.Repo)
	if repo == "" {
		repo = fmt.Sprintf("%s%d", s.config.RepoPrefix, project.ID)
	}
	if err := validateRepoSegment(owner); err != nil {
		return persistencemodel.ProjectRepository{}, err
	}
	if err := validateRepoSegment(repo); err != nil {
		return persistencemodel.ProjectRepository{}, err
	}
	return persistencemodel.ProjectRepository{
		ProjectID:     project.ID,
		Provider:      s.config.Provider,
		Owner:         owner,
		Repo:          repo,
		DefaultBranch: s.config.DefaultBranch,
	}, nil
}

func normalizeConfig(cfg Config) Config {
	cfg.Provider = strings.TrimSpace(cfg.Provider)
	if cfg.Provider == "" {
		cfg.Provider = ProviderGitea
	}
	cfg.Owner = strings.TrimSpace(cfg.Owner)
	if cfg.Owner == "" {
		cfg.Owner = "movscript"
	}
	cfg.Repo = strings.TrimSpace(cfg.Repo)
	cfg.RepoPrefix = strings.TrimSpace(cfg.RepoPrefix)
	if cfg.RepoPrefix == "" {
		cfg.RepoPrefix = "movscript-project-"
	}
	cfg.DefaultBranch = strings.TrimSpace(cfg.DefaultBranch)
	if cfg.DefaultBranch == "" {
		cfg.DefaultBranch = "main"
	}
	return cfg
}

func bindingFromModel(model persistencemodel.ProjectRepository) Binding {
	return Binding{
		ID:             model.ID,
		ProjectID:      model.ProjectID,
		Provider:       model.Provider,
		ProviderRepoID: model.ProviderRepoID,
		Owner:          model.Owner,
		Repo:           model.Repo,
		DefaultBranch:  model.DefaultBranch,
		HeadCommit:     model.HeadCommit,
		Status:         model.Status,
		LastSyncError:  model.LastSyncError,
	}
}

var repoSegmentPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)

func validateRepoSegment(value string) error {
	if !repoSegmentPattern.MatchString(value) || value == "." || value == ".." || strings.Contains(value, "/") || strings.Contains(value, "\\") {
		return fmt.Errorf("%w: invalid repository segment %q", ErrInvalidRepositoryConfig, value)
	}
	return nil
}

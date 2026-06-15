package projectrepo

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

const (
	ProviderGitea            = "gitea"
	ProviderGitHTTP          = "http"
	ProviderGitHubEnterprise = "github-enterprise"
	ProviderGitLab           = "gitlab"

	StatusProvisioning = "provisioning"
	StatusActive       = "active"
	StatusError        = "error"
	StatusArchived     = "archived"
)

var (
	ErrProjectNotFound             = errors.New("project not found")
	ErrInvalidRepositoryConfig     = errors.New("invalid project repository config")
	ErrRepositoryBindingMissing    = errors.New("project repository binding missing")
	ErrRepositoryNotReady          = errors.New("project repository is not ready")
	ErrCloneURLStrategyUnsupported = errors.New("repository clone URL strategy is not supported by provider")
)

type Service struct {
	repo    repository
	adapter GitRepositoryAdapter
	config  Config
}

type Config struct {
	Provider         string
	Repo             string
	RepoPrefix       string
	DefaultBranch    string
	CreatedBy        *uint
	OrgPrefix        string
	CloneURLStrategy string
}

type GitRepositoryAdapter = providercontract.WorkspaceRepository

type EnsureRepositoryInput = providercontract.EnsureRepositoryInput

type EnsureRepositoryResult = providercontract.EnsureRepositoryResult

type EnsureUserInput = providercontract.EnsureUserInput

type EnsureUserResult = providercontract.EnsureUserResult

type RepositoryAccessRequest = providercontract.RepositoryAccessRequest

type RepositoryAccessResult = providercontract.RepositoryAccessResult

type RepositoryRef = providercontract.RepositoryRef

type RepositoryActor = providercontract.RepositoryActor

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
	ProjectID          uint   `json:"projectId"`
	RepoID             string `json:"repoId,omitempty"`
	Provider           string `json:"provider"`
	Owner              string `json:"owner"`
	Repo               string `json:"repo"`
	DefaultBranch      string `json:"defaultBranch"`
	HeadCommit         string `json:"headCommit,omitempty"`
	GitRemoteURL       string `json:"gitRemoteUrl,omitempty"`
	GitRemoteStrategy  string `json:"gitRemoteStrategy,omitempty"`
	GitRemoteExpiresAt int64  `json:"gitRemoteExpiresAt,omitempty"`
	Status             string `json:"status"`
	LastSyncError      string `json:"lastSyncError,omitempty"`
}

type OwnerType = providercontract.OwnerType

const (
	OwnerTypeUser         = providercontract.OwnerTypeUser
	OwnerTypeOrganization = providercontract.OwnerTypeOrganization
)

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
		if s.adapter != nil && existing.Status != StatusArchived {
			existing, err = s.reconcileBindingOwner(ctx, project, existing)
			if err != nil {
				return Binding{}, err
			}
			existing = s.provisionRepository(ctx, project, existing)
		}
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

func (s *Service) WorkspaceMetadata(ctx context.Context, projectID uint, orgID *uint, actor RepositoryActor) (WorkspaceMetadata, error) {
	binding, err := s.EnsureProjectRepository(ctx, projectID, orgID)
	if err != nil {
		return WorkspaceMetadata{}, err
	}
	gitRemoteURL := fmt.Sprintf("/api/v1/projects/%d/git/%s.git", binding.ProjectID, binding.Repo)
	gitRemoteStrategy := providercontract.RepositoryCloneURLStrategyProxy
	if s.config.CloneURLStrategy == providercontract.RepositoryCloneURLStrategyTemporary {
		return WorkspaceMetadata{
			ProjectID:         binding.ProjectID,
			RepoID:            binding.ProviderRepoID,
			Provider:          binding.Provider,
			Owner:             binding.Owner,
			Repo:              binding.Repo,
			DefaultBranch:     binding.DefaultBranch,
			HeadCommit:        binding.HeadCommit,
			GitRemoteURL:      gitRemoteURL,
			GitRemoteStrategy: providercontract.RepositoryCloneURLStrategyTemporary,
			Status:            binding.Status,
			LastSyncError:     binding.LastSyncError,
		}, nil
	}
	if s.adapter != nil {
		clone, err := s.adapter.GetCloneURL(ctx, providercontract.RepositoryCloneURLRequest{
			Ref:               repositoryRefFromBinding(binding),
			PublicURL:         gitRemoteURL,
			Actor:             actor,
			PreferredStrategy: s.config.CloneURLStrategy,
		})
		if err != nil && strings.TrimSpace(s.config.CloneURLStrategy) != "" {
			return WorkspaceMetadata{}, fmt.Errorf("%w: %s", ErrCloneURLStrategyUnsupported, err.Error())
		}
		if err == nil && strings.TrimSpace(clone.URL) != "" {
			gitRemoteURL = strings.TrimSpace(clone.URL)
			gitRemoteStrategy = firstNonEmpty(clone.Strategy, s.config.CloneURLStrategy, gitRemoteStrategy)
		}
	}
	return WorkspaceMetadata{
		ProjectID:         binding.ProjectID,
		RepoID:            binding.ProviderRepoID,
		Provider:          binding.Provider,
		Owner:             binding.Owner,
		Repo:              binding.Repo,
		DefaultBranch:     binding.DefaultBranch,
		HeadCommit:        binding.HeadCommit,
		GitRemoteURL:      gitRemoteURL,
		GitRemoteStrategy: gitRemoteStrategy,
		Status:            binding.Status,
		LastSyncError:     binding.LastSyncError,
	}, nil
}

func (s *Service) GitProxyTarget(ctx context.Context, projectID uint, orgID *uint) (GitProxyTarget, error) {
	if projectID == 0 {
		return GitProxyTarget{}, ErrProjectNotFound
	}
	project, err := s.repo.GetProject(ctx, projectID, orgID)
	if err != nil {
		return GitProxyTarget{}, err
	}
	binding, err := s.EnsureProjectRepository(ctx, projectID, orgID)
	if err != nil {
		return GitProxyTarget{}, err
	}
	if binding.Status != StatusActive {
		return GitProxyTarget{}, fmt.Errorf("%w: status is %s", ErrRepositoryNotReady, binding.Status)
	}
	proxyTarget := providercontract.GitHTTPProxyTarget{}
	if s.adapter != nil {
		var err error
		proxyTarget, err = s.adapter.GetGitHTTPProxyTarget(ctx, providercontract.GitHTTPProxyTargetRequest{Ref: repositoryRefFromBinding(binding)})
		if err != nil {
			return GitProxyTarget{}, err
		}
	}
	fallbackOwner := binding.Owner
	if s.adapter == nil {
		if spec, err := s.bindingSpec(project); err == nil && strings.TrimSpace(spec.Owner) != "" {
			fallbackOwner = spec.Owner
		}
	}
	target := GitProxyTarget{
		ProjectID:     binding.ProjectID,
		Provider:      firstNonEmpty(proxyTarget.Provider, binding.Provider),
		Owner:         firstNonEmpty(proxyTarget.Owner, fallbackOwner),
		Repo:          firstNonEmpty(proxyTarget.Repo, binding.Repo),
		DefaultBranch: firstNonEmpty(proxyTarget.DefaultBranch, binding.DefaultBranch),
		BaseURL:       strings.TrimSpace(proxyTarget.BaseURL),
		LocalRoot:     strings.TrimSpace(proxyTarget.LocalRoot),
		GitBinary:     strings.TrimSpace(proxyTarget.GitBinary),
		AuthUsername:  strings.TrimSpace(proxyTarget.AuthUsername),
		AuthSecret:    strings.TrimSpace(proxyTarget.AuthSecret),
	}
	return target, nil
}

func repositoryRefFromBinding(binding Binding) providercontract.RepositoryRef {
	return providercontract.RepositoryRef{
		Provider:       binding.Provider,
		ProviderRepoID: binding.ProviderRepoID,
		Owner:          binding.Owner,
		Repo:           binding.Repo,
		DefaultBranch:  binding.DefaultBranch,
	}
}

func (s *Service) reconcileBindingOwner(ctx context.Context, project persistencemodel.Project, binding persistencemodel.ProjectRepository) (persistencemodel.ProjectRepository, error) {
	spec, err := s.bindingSpec(project)
	if err != nil {
		return persistencemodel.ProjectRepository{}, err
	}
	if binding.Owner == spec.Owner {
		return binding, nil
	}
	return s.repo.UpdateBindingOwner(ctx, binding.ID, spec.Owner)
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
		OwnerType:     ownerType(project),
		OwnerName:     ownerName(project),
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
	owner := s.projectOwner(project)
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

func (s *Service) projectOwner(project persistencemodel.Project) string {
	if project.OrgID == nil || project.Organization.IsPersonal {
		return project.Owner.Username
	}
	return strings.TrimSpace(s.config.OrgPrefix) + project.Organization.Slug
}

func ownerType(project persistencemodel.Project) OwnerType {
	if project.OrgID == nil || project.Organization.IsPersonal {
		return OwnerTypeUser
	}
	return OwnerTypeOrganization
}

func ownerName(project persistencemodel.Project) string {
	if project.OrgID == nil || project.Organization.IsPersonal {
		return project.Owner.Username
	}
	return project.Organization.Name
}

func normalizeConfig(cfg Config) Config {
	cfg.Provider = NormalizeProvider(cfg.Provider)
	if cfg.Provider == "" {
		cfg.Provider = ProviderGitea
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
	cfg.OrgPrefix = strings.TrimSpace(cfg.OrgPrefix)
	if cfg.OrgPrefix == "" {
		cfg.OrgPrefix = "movscript-org-"
	}
	cfg.CloneURLStrategy = normalizeCloneURLStrategy(cfg.CloneURLStrategy)
	return cfg
}

func normalizeCloneURLStrategy(strategy string) string {
	switch strings.TrimSpace(strategy) {
	case "", providercontract.RepositoryCloneURLStrategyProxy, providercontract.RepositoryCloneURLStrategyDirect, providercontract.RepositoryCloneURLStrategyTemporary:
		return strings.TrimSpace(strategy)
	default:
		return strings.TrimSpace(strategy)
	}
}

func NormalizeProvider(provider string) string {
	switch strings.TrimSpace(provider) {
	case "git-http", "git-http-backend":
		return ProviderGitHTTP
	case "github", "github-enterprise-server", "ghe":
		return ProviderGitHubEnterprise
	case "gitlab-enterprise", "gitlab-self-hosted":
		return ProviderGitLab
	default:
		return strings.TrimSpace(provider)
	}
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

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

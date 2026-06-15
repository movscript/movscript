package assembly

import (
	"context"
	"net/http"
	"strings"

	externalresourceapp "github.com/movscript/movscript/internal/app/externalresource"
	gitidentityapp "github.com/movscript/movscript/internal/app/gitidentity"
	projectrepoapp "github.com/movscript/movscript/internal/app/projectrepo"
	shotreferenceapp "github.com/movscript/movscript/internal/app/shotreference"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/cache"
	"github.com/movscript/movscript/internal/infra/config"
	"github.com/movscript/movscript/internal/infra/storage"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

type RuntimeProviders struct {
	Store       storage.Storage
	Cache       cache.Cache
	VectorIndex providercontract.VectorIndexProvider
	Registry    *ai.Registry
	AIService   *ai.AIService
}

type WorkspaceRepositoryProvider struct {
	Provider           string
	Config             projectrepoapp.Config
	Adapter            projectrepoapp.GitRepositoryAdapter
	GiteaAdapter       *projectrepoapp.GiteaAdapter
	GitHubAdapter      *projectrepoapp.GitHubEnterpriseAdapter
	GitLabAdapter      *projectrepoapp.GitLabAdapter
	GitIdentityConfig  gitidentityapp.Config
	GiteaBaseURL       string
	GiteaToken         string
	GiteaAdminUsername string
	GiteaAdminPassword string
	GitHubBaseURL      string
	GitHubToken        string
	GitLabBaseURL      string
	GitLabToken        string
	GitHTTPRoot        string
	GitBinary          string
}

func BuildRuntimeProviders(ctx context.Context, db *gorm.DB, cfg *config.Config, encryptionKey []byte) (RuntimeProviders, error) {
	store, err := BuildBlobStorage(cfg)
	if err != nil {
		return RuntimeProviders{}, err
	}
	cacheStore, err := BuildCache(cfg)
	if err != nil {
		return RuntimeProviders{}, err
	}
	vectorIndex := BuildVectorIndexProvider(db, cfg)
	registry, err := BuildAIRegistry(ctx, db, cfg, encryptionKey)
	if err != nil {
		return RuntimeProviders{}, err
	}
	return RuntimeProviders{
		Store:       store,
		Cache:       cacheStore,
		VectorIndex: vectorIndex,
		Registry:    registry,
		AIService:   ai.NewAIService(db, registry),
	}, nil
}

func BuildProviderHealthSnapshot(cfg *config.Config) []providercontract.ProviderHealth {
	if cfg == nil {
		cfg = &config.Config{}
	}
	assembly := cfg.EffectiveProviderAssembly()
	items := make([]providercontract.ProviderHealth, 0, len(assembly.Providers))
	for _, provider := range assembly.Providers {
		status := providercontract.HealthStatusOK
		message := "startup configuration ready"
		if !provider.Configured {
			status = providercontract.HealthStatusMissingConfig
			message = "startup configuration is missing required settings"
		}
		items = append(items, providercontract.ProviderHealth{
			Type:         provider.Type,
			Adapter:      provider.Adapter,
			Assembly:     provider.Assembly,
			Status:       status,
			Message:      message,
			Capabilities: provider.Capabilities,
		})
	}
	return items
}

func BuildBlobStorage(cfg *config.Config) (storage.Storage, error) {
	return storage.New(cfg)
}

func BuildCache(cfg *config.Config) (cache.Cache, error) {
	return cache.New(cfg)
}

func BuildVectorIndexProvider(db *gorm.DB, cfg ...*config.Config) providercontract.VectorIndexProvider {
	var effectiveConfig *config.Config
	if len(cfg) > 0 {
		effectiveConfig = cfg[0]
	}
	if effectiveConfig != nil && strings.TrimSpace(effectiveConfig.VectorIndexProvider) == providercontract.AdapterQdrant {
		return shotreferenceapp.NewQdrantVectorIndexProvider(effectiveConfig.QdrantBaseURL, effectiveConfig.QdrantToken, effectiveConfig.QdrantCollection)
	}
	if effectiveConfig != nil && strings.TrimSpace(effectiveConfig.VectorIndexProvider) == providercontract.AdapterPgVector {
		return shotreferenceapp.NewPgVectorIndexProvider(db)
	}
	return shotreferenceapp.NewLocalVectorIndexProvider(db)
}

func BuildExternalResourceProvider(providerKey string, providerConfig map[string]string, httpClient *http.Client) (providercontract.ExternalResourceProvider, bool) {
	return externalresourceapp.NewProviderAdapter(providerKey, providerConfig, httpClient)
}

func BuildAIRegistry(ctx context.Context, db *gorm.DB, cfg *config.Config, encryptionKey []byte) (*ai.Registry, error) {
	if cfg == nil {
		cfg = &config.Config{}
	}
	if err := ai.ConfigureLocalGatewayDefaults(ctx, db, cfg.AIGatewayProvider == providercontract.AdapterLocal); err != nil {
		return nil, err
	}
	return ai.NewRegistryWithProviderMode(db, encryptionKey, cfg.AIGatewayProvider), nil
}

func BuildWorkspaceRepositoryProvider(cfg *config.Config) WorkspaceRepositoryProvider {
	if cfg == nil {
		cfg = &config.Config{}
	}
	workspaceStorageBackend := projectrepoapp.NormalizeProvider(cfg.WorkspaceStorageBackend)
	if workspaceStorageBackend == "" {
		workspaceStorageBackend = projectrepoapp.ProviderGitea
	}

	var adapter projectrepoapp.GitRepositoryAdapter
	var giteaAdapter *projectrepoapp.GiteaAdapter
	var githubAdapter *projectrepoapp.GitHubEnterpriseAdapter
	var gitlabAdapter *projectrepoapp.GitLabAdapter
	if workspaceStorageBackend == projectrepoapp.ProviderGitea {
		giteaAdapter = projectrepoapp.NewGiteaAdapterWithAdminAuth(cfg.GiteaBaseURL, cfg.GiteaToken, cfg.GiteaAdminUsername, cfg.GiteaAdminPassword)
		if giteaAdapter != nil {
			adapter = giteaAdapter
		}
	} else if workspaceStorageBackend == projectrepoapp.ProviderGitHTTP {
		adapter = projectrepoapp.NewLocalGitAdapter(cfg.GitHTTPRoot, cfg.GitBinary)
	} else if workspaceStorageBackend == projectrepoapp.ProviderGitHubEnterprise {
		githubAdapter = projectrepoapp.NewGitHubEnterpriseAdapter(cfg.GitHubEnterpriseBaseURL, cfg.GitHubEnterpriseToken)
		if githubAdapter != nil {
			adapter = githubAdapter
		}
	} else if workspaceStorageBackend == projectrepoapp.ProviderGitLab {
		gitlabAdapter = projectrepoapp.NewGitLabAdapter(cfg.GitLabBaseURL, cfg.GitLabToken)
		if gitlabAdapter != nil {
			adapter = gitlabAdapter
		}
	}
	repoConfig := workspaceRepositoryConfig(cfg, workspaceStorageBackend)

	return WorkspaceRepositoryProvider{
		Provider:      workspaceStorageBackend,
		Config:        repoConfig,
		Adapter:       adapter,
		GiteaAdapter:  giteaAdapter,
		GitHubAdapter: githubAdapter,
		GitLabAdapter: gitlabAdapter,
		GitIdentityConfig: gitidentityapp.Config{
			UserEmailDomain: cfg.GiteaUserEmailDomain,
			UserTokenName:   cfg.GiteaUserTokenName,
		},
		GiteaBaseURL:       configuredGiteaValue(giteaAdapter, cfg.GiteaBaseURL),
		GiteaToken:         configuredGiteaValue(giteaAdapter, cfg.GiteaToken),
		GiteaAdminUsername: configuredGiteaValue(giteaAdapter, cfg.GiteaAdminUsername),
		GiteaAdminPassword: configuredGiteaValue(giteaAdapter, cfg.GiteaAdminPassword),
		GitHubBaseURL:      configuredGitHubEnterpriseValue(githubAdapter, cfg.GitHubEnterpriseBaseURL),
		GitHubToken:        configuredGitHubEnterpriseValue(githubAdapter, cfg.GitHubEnterpriseToken),
		GitLabBaseURL:      configuredGitLabValue(gitlabAdapter, cfg.GitLabBaseURL),
		GitLabToken:        configuredGitLabValue(gitlabAdapter, cfg.GitLabToken),
		GitHTTPRoot:        strings.TrimSpace(cfg.GitHTTPRoot),
		GitBinary:          strings.TrimSpace(cfg.GitBinary),
	}
}

func workspaceRepositoryConfig(cfg *config.Config, provider string) projectrepoapp.Config {
	repoConfig := projectrepoapp.Config{Provider: provider}
	switch provider {
	case projectrepoapp.ProviderGitHubEnterprise:
		repoConfig.Repo = cfg.GitHubEnterpriseRepo
		repoConfig.RepoPrefix = cfg.GitHubEnterpriseRepoPrefix
		repoConfig.DefaultBranch = cfg.GitHubEnterpriseBranch
		repoConfig.OrgPrefix = cfg.GitHubEnterpriseOrgPrefix
	case projectrepoapp.ProviderGitLab:
		repoConfig.Repo = cfg.GitLabRepo
		repoConfig.RepoPrefix = cfg.GitLabRepoPrefix
		repoConfig.DefaultBranch = cfg.GitLabBranch
		repoConfig.OrgPrefix = cfg.GitLabOrgPrefix
	default:
		repoConfig.Repo = cfg.GiteaRepo
		repoConfig.RepoPrefix = cfg.GiteaRepoPrefix
		repoConfig.DefaultBranch = cfg.GiteaBranch
		repoConfig.OrgPrefix = cfg.GiteaOrgPrefix
	}
	repoConfig.CloneURLStrategy = cfg.WorkspaceCloneURLStrategy
	return repoConfig
}

func configuredGiteaValue(adapter *projectrepoapp.GiteaAdapter, value string) string {
	if adapter == nil {
		return ""
	}
	return strings.TrimSpace(value)
}

func configuredGitHubEnterpriseValue(adapter *projectrepoapp.GitHubEnterpriseAdapter, value string) string {
	if adapter == nil {
		return ""
	}
	return strings.TrimSpace(value)
}

func configuredGitLabValue(adapter *projectrepoapp.GitLabAdapter, value string) string {
	if adapter == nil {
		return ""
	}
	return strings.TrimSpace(value)
}

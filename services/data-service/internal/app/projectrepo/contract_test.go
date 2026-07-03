package projectrepo

import providercontract "github.com/movscript/movscript/internal/providers/contract"

var (
	_ providercontract.WorkspaceRepository         = (*GiteaAdapter)(nil)
	_ providercontract.WorkspaceRepository         = (*LocalGitAdapter)(nil)
	_ providercontract.WorkspaceRepository         = (*GitHubSelfHostedAdapter)(nil)
	_ providercontract.WorkspaceRepository         = (*GitLabAdapter)(nil)
	_ providercontract.WorkspaceRepositoryIdentity = (*GiteaAdapter)(nil)
	_ providercontract.WorkspaceRepositoryIdentity = (*GitHubSelfHostedAdapter)(nil)
	_ providercontract.WorkspaceRepositoryIdentity = (*GitLabAdapter)(nil)
	_ providercontract.HealthChecker               = (*GitHubSelfHostedAdapter)(nil)
	_ providercontract.HealthChecker               = (*GitLabAdapter)(nil)
)

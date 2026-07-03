package projectrepo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type GitHubSelfHostedAdapter struct {
	baseURL    string
	apiBaseURL string
	token      string
	httpClient *http.Client
}

func NewGitHubSelfHostedAdapter(baseURL string, token string) *GitHubSelfHostedAdapter {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	token = strings.TrimSpace(token)
	if baseURL == "" || token == "" {
		return nil
	}
	return &GitHubSelfHostedAdapter{
		baseURL:    githubSelfHostedWebBaseURL(baseURL),
		apiBaseURL: githubSelfHostedAPIBaseURL(baseURL),
		token:      token,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (a *GitHubSelfHostedAdapter) EnsureRepository(ctx context.Context, input EnsureRepositoryInput) (EnsureRepositoryResult, error) {
	if a == nil {
		return EnsureRepositoryResult{}, fmt.Errorf("github self-hosted adapter is not configured")
	}
	if repo, err := a.getRepo(ctx, input.Owner, input.Repo); err == nil {
		head, _ := a.branchHead(ctx, input.Owner, input.Repo, input.DefaultBranch)
		return EnsureRepositoryResult{ProviderRepoID: repo.IDString(), HeadCommit: head}, nil
	} else if !githubSelfHostedIsNotFound(err) {
		return EnsureRepositoryResult{}, err
	}

	repo, err := a.createRepo(ctx, input)
	if err != nil {
		return EnsureRepositoryResult{}, err
	}
	head, _ := a.branchHead(ctx, repo.Owner.Login, repo.Name, input.DefaultBranch)
	return EnsureRepositoryResult{ProviderRepoID: repo.IDString(), HeadCommit: head}, nil
}

func (a *GitHubSelfHostedAdapter) GetCloneURL(_ context.Context, request providercontract.RepositoryCloneURLRequest) (providercontract.RepositoryCloneURLResult, error) {
	switch strings.TrimSpace(request.PreferredStrategy) {
	case "", providercontract.RepositoryCloneURLStrategyDirect:
	case providercontract.RepositoryCloneURLStrategyProxy:
		if strings.TrimSpace(request.PublicURL) != "" {
			return providercontract.RepositoryCloneURLResult{URL: strings.TrimSpace(request.PublicURL), Strategy: providercontract.RepositoryCloneURLStrategyProxy}, nil
		}
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("github self-hosted proxy clone URL requires public URL")
	case providercontract.RepositoryCloneURLStrategyTemporary:
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("github self-hosted temporary clone URL is not supported")
	default:
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("github self-hosted clone URL strategy %q is not supported", request.PreferredStrategy)
	}
	if a == nil || strings.TrimSpace(a.baseURL) == "" {
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("github self-hosted adapter is not configured")
	}
	return providercontract.RepositoryCloneURLResult{
		URL:      strings.TrimRight(a.baseURL, "/") + "/" + url.PathEscape(request.Ref.Owner) + "/" + url.PathEscape(request.Ref.Repo) + ".git",
		Strategy: providercontract.RepositoryCloneURLStrategyDirect,
	}, nil
}

func (a *GitHubSelfHostedAdapter) GetGitHTTPProxyTarget(_ context.Context, request providercontract.GitHTTPProxyTargetRequest) (providercontract.GitHTTPProxyTarget, error) {
	if a == nil || strings.TrimSpace(a.baseURL) == "" || strings.TrimSpace(a.token) == "" {
		return providercontract.GitHTTPProxyTarget{}, fmt.Errorf("github self-hosted adapter is not configured")
	}
	return providercontract.GitHTTPProxyTarget{
		Provider:      ProviderGitHubSelfHosted,
		Owner:         request.Ref.Owner,
		Repo:          request.Ref.Repo,
		DefaultBranch: request.Ref.DefaultBranch,
		BaseURL:       a.baseURL,
		AuthUsername:  "x-access-token",
		AuthSecret:    a.token,
	}, nil
}

func (a *GitHubSelfHostedAdapter) Health(ctx context.Context) providercontract.ProviderHealth {
	health := providercontract.ProviderHealth{
		Type:         providercontract.TypeWorkspaceRepository,
		Adapter:      providercontract.AdapterGitHubSelfHosted,
		Assembly:     providercontract.AssemblyStartup,
		Status:       providercontract.HealthStatusOK,
		Message:      "github self-hosted authentication succeeded",
		Capabilities: []string{"repository.ensure", "repository.collaborator.ensure", "repository.access.probe", "repository.clone_url", "git.http_proxy", "health.probe"},
	}
	if a == nil || strings.TrimSpace(a.apiBaseURL) == "" || strings.TrimSpace(a.token) == "" {
		health.Status = providercontract.HealthStatusMissingConfig
		health.Message = "github self-hosted base url and token are required"
		return health
	}
	user, err := a.currentUser(ctx)
	if err != nil {
		health.Status = providercontract.HealthStatusError
		health.Message = err.Error()
		return health
	}
	if strings.TrimSpace(user.Login) != "" {
		health.Message = "github self-hosted authentication succeeded as " + user.Login
	}
	return health
}

func (a *GitHubSelfHostedAdapter) EnsureUser(context.Context, EnsureUserInput) (EnsureUserResult, error) {
	return EnsureUserResult{}, fmt.Errorf("github self-hosted user lifecycle is managed by GitHub Self-hosted")
}

func (a *GitHubSelfHostedAdapter) EnsureRepoCollaborator(ctx context.Context, owner string, repo string, username string, permission string) error {
	if a == nil {
		return fmt.Errorf("github self-hosted adapter is not configured")
	}
	username = strings.TrimSpace(username)
	if username == "" {
		return fmt.Errorf("github self-hosted collaborator username is required")
	}
	payload := map[string]any{"permission": githubSelfHostedCollaboratorPermission(permission)}
	return a.doJSON(ctx, http.MethodPut, "/repos/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/collaborators/"+url.PathEscape(username), payload, nil)
}

func (a *GitHubSelfHostedAdapter) CheckRepoAccess(ctx context.Context, request RepositoryAccessRequest) (RepositoryAccessResult, error) {
	if a == nil {
		return RepositoryAccessResult{}, fmt.Errorf("github self-hosted adapter is not configured")
	}
	var out githubSelfHostedCollaboratorPermissionResponse
	err := a.doJSON(ctx, http.MethodGet, "/repos/"+url.PathEscape(request.Owner)+"/"+url.PathEscape(request.Repo)+"/collaborators/"+url.PathEscape(request.Username)+"/permission", nil, &out)
	if err != nil {
		if githubSelfHostedIsNotFound(err) {
			return RepositoryAccessResult{Allowed: false}, nil
		}
		return RepositoryAccessResult{}, err
	}
	permission := githubSelfHostedContractPermission(out.Permission)
	return RepositoryAccessResult{
		Allowed:    permissionSatisfies(permission, request.Permission),
		Permission: permission,
	}, nil
}

func (a *GitHubSelfHostedAdapter) currentUser(ctx context.Context) (githubSelfHostedUser, error) {
	var out githubSelfHostedUser
	if err := a.doJSON(ctx, http.MethodGet, "/user", nil, &out); err != nil {
		return githubSelfHostedUser{}, err
	}
	return out, nil
}

func (a *GitHubSelfHostedAdapter) getRepo(ctx context.Context, owner string, repo string) (githubSelfHostedRepo, error) {
	var out githubSelfHostedRepo
	if err := a.doJSON(ctx, http.MethodGet, "/repos/"+url.PathEscape(owner)+"/"+url.PathEscape(repo), nil, &out); err != nil {
		return githubSelfHostedRepo{}, err
	}
	return out, nil
}

func (a *GitHubSelfHostedAdapter) createRepo(ctx context.Context, input EnsureRepositoryInput) (githubSelfHostedRepo, error) {
	payload := map[string]any{
		"name":      input.Repo,
		"private":   input.Private,
		"auto_init": true,
	}
	if strings.TrimSpace(input.Description) != "" {
		payload["description"] = input.Description
	}
	switch input.OwnerType {
	case OwnerTypeOrganization:
		var out githubSelfHostedRepo
		if err := a.doJSON(ctx, http.MethodPost, "/orgs/"+url.PathEscape(input.Owner)+"/repos", payload, &out); err != nil {
			return githubSelfHostedRepo{}, err
		}
		return out, nil
	case OwnerTypeUser:
		user, err := a.currentUser(ctx)
		if err != nil {
			return githubSelfHostedRepo{}, err
		}
		if strings.TrimSpace(user.Login) != input.Owner {
			return githubSelfHostedRepo{}, fmt.Errorf("github self-hosted owner %q does not match token user %q", input.Owner, user.Login)
		}
		var out githubSelfHostedRepo
		if err := a.doJSON(ctx, http.MethodPost, "/user/repos", payload, &out); err != nil {
			return githubSelfHostedRepo{}, err
		}
		return out, nil
	default:
		return githubSelfHostedRepo{}, fmt.Errorf("github self-hosted owner type is required")
	}
}

func (a *GitHubSelfHostedAdapter) branchHead(ctx context.Context, owner string, repo string, branch string) (string, error) {
	branch = strings.TrimSpace(branch)
	if branch == "" {
		return "", nil
	}
	var out struct {
		Commit struct {
			SHA string `json:"sha"`
		} `json:"commit"`
	}
	if err := a.doJSON(ctx, http.MethodGet, "/repos/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/branches/"+url.PathEscape(branch), nil, &out); err != nil {
		return "", err
	}
	return out.Commit.SHA, nil
}

func (a *GitHubSelfHostedAdapter) doJSON(ctx context.Context, method string, path string, payload any, out any) error {
	if a == nil {
		return fmt.Errorf("github self-hosted adapter is not configured")
	}
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(a.apiBaseURL, "/")+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+a.token)

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return githubSelfHostedHTTPError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(responseBody))}
	}
	if out == nil || len(responseBody) == 0 {
		return nil
	}
	if err := json.Unmarshal(responseBody, out); err != nil {
		return fmt.Errorf("decode github self-hosted response: %w", err)
	}
	return nil
}

func githubSelfHostedAPIBaseURL(baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(baseURL, "/api/v3") {
		return baseURL
	}
	return baseURL + "/api/v3"
}

func githubSelfHostedWebBaseURL(baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return strings.TrimSuffix(baseURL, "/api/v3")
}

type githubSelfHostedRepo struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Owner struct {
		Login string `json:"login"`
	} `json:"owner"`
}

func (r githubSelfHostedRepo) IDString() string {
	if r.ID == 0 {
		return ""
	}
	return strconv.FormatInt(r.ID, 10)
}

type githubSelfHostedUser struct {
	ID    int64  `json:"id"`
	Login string `json:"login"`
}

type githubSelfHostedCollaboratorPermissionResponse struct {
	Permission string `json:"permission"`
}

func githubSelfHostedCollaboratorPermission(permission string) string {
	switch strings.ToLower(strings.TrimSpace(permission)) {
	case "admin", "maintain", "pull", "push", "triage":
		return strings.ToLower(strings.TrimSpace(permission))
	case "read":
		return "pull"
	case "write":
		return "push"
	default:
		return "push"
	}
}

func githubSelfHostedContractPermission(permission string) string {
	switch strings.ToLower(strings.TrimSpace(permission)) {
	case "admin":
		return "admin"
	case "maintain", "push", "write":
		return "write"
	case "pull", "triage", "read":
		return "read"
	default:
		return permission
	}
}

type githubSelfHostedHTTPError struct {
	StatusCode int
	Body       string
}

func (e githubSelfHostedHTTPError) Error() string {
	if e.Body == "" {
		return fmt.Sprintf("github self-hosted request failed with status %d", e.StatusCode)
	}
	return fmt.Sprintf("github self-hosted request failed with status %d: %s", e.StatusCode, e.Body)
}

func githubSelfHostedIsNotFound(err error) bool {
	httpErr, ok := err.(githubSelfHostedHTTPError)
	return ok && httpErr.StatusCode == http.StatusNotFound
}

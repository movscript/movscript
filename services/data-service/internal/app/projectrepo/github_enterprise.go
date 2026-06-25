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

type GitHubEnterpriseAdapter struct {
	baseURL    string
	apiBaseURL string
	token      string
	httpClient *http.Client
}

func NewGitHubEnterpriseAdapter(baseURL string, token string) *GitHubEnterpriseAdapter {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	token = strings.TrimSpace(token)
	if baseURL == "" || token == "" {
		return nil
	}
	return &GitHubEnterpriseAdapter{
		baseURL:    githubEnterpriseWebBaseURL(baseURL),
		apiBaseURL: githubEnterpriseAPIBaseURL(baseURL),
		token:      token,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (a *GitHubEnterpriseAdapter) EnsureRepository(ctx context.Context, input EnsureRepositoryInput) (EnsureRepositoryResult, error) {
	if a == nil {
		return EnsureRepositoryResult{}, fmt.Errorf("github enterprise adapter is not configured")
	}
	if repo, err := a.getRepo(ctx, input.Owner, input.Repo); err == nil {
		head, _ := a.branchHead(ctx, input.Owner, input.Repo, input.DefaultBranch)
		return EnsureRepositoryResult{ProviderRepoID: repo.IDString(), HeadCommit: head}, nil
	} else if !githubEnterpriseIsNotFound(err) {
		return EnsureRepositoryResult{}, err
	}

	repo, err := a.createRepo(ctx, input)
	if err != nil {
		return EnsureRepositoryResult{}, err
	}
	head, _ := a.branchHead(ctx, repo.Owner.Login, repo.Name, input.DefaultBranch)
	return EnsureRepositoryResult{ProviderRepoID: repo.IDString(), HeadCommit: head}, nil
}

func (a *GitHubEnterpriseAdapter) GetCloneURL(_ context.Context, request providercontract.RepositoryCloneURLRequest) (providercontract.RepositoryCloneURLResult, error) {
	switch strings.TrimSpace(request.PreferredStrategy) {
	case "", providercontract.RepositoryCloneURLStrategyDirect:
	case providercontract.RepositoryCloneURLStrategyProxy:
		if strings.TrimSpace(request.PublicURL) != "" {
			return providercontract.RepositoryCloneURLResult{URL: strings.TrimSpace(request.PublicURL), Strategy: providercontract.RepositoryCloneURLStrategyProxy}, nil
		}
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("github enterprise proxy clone URL requires public URL")
	case providercontract.RepositoryCloneURLStrategyTemporary:
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("github enterprise temporary clone URL is not supported")
	default:
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("github enterprise clone URL strategy %q is not supported", request.PreferredStrategy)
	}
	if a == nil || strings.TrimSpace(a.baseURL) == "" {
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("github enterprise adapter is not configured")
	}
	return providercontract.RepositoryCloneURLResult{
		URL:      strings.TrimRight(a.baseURL, "/") + "/" + url.PathEscape(request.Ref.Owner) + "/" + url.PathEscape(request.Ref.Repo) + ".git",
		Strategy: providercontract.RepositoryCloneURLStrategyDirect,
	}, nil
}

func (a *GitHubEnterpriseAdapter) GetGitHTTPProxyTarget(_ context.Context, request providercontract.GitHTTPProxyTargetRequest) (providercontract.GitHTTPProxyTarget, error) {
	if a == nil || strings.TrimSpace(a.baseURL) == "" || strings.TrimSpace(a.token) == "" {
		return providercontract.GitHTTPProxyTarget{}, fmt.Errorf("github enterprise adapter is not configured")
	}
	return providercontract.GitHTTPProxyTarget{
		Provider:      ProviderGitHubEnterprise,
		Owner:         request.Ref.Owner,
		Repo:          request.Ref.Repo,
		DefaultBranch: request.Ref.DefaultBranch,
		BaseURL:       a.baseURL,
		AuthUsername:  "x-access-token",
		AuthSecret:    a.token,
	}, nil
}

func (a *GitHubEnterpriseAdapter) Health(ctx context.Context) providercontract.ProviderHealth {
	health := providercontract.ProviderHealth{
		Type:         providercontract.TypeWorkspaceRepository,
		Adapter:      providercontract.AdapterGitHubEnterprise,
		Assembly:     providercontract.AssemblyStartup,
		Status:       providercontract.HealthStatusOK,
		Message:      "github enterprise authentication succeeded",
		Capabilities: []string{"repository.ensure", "repository.collaborator.ensure", "repository.access.probe", "repository.clone_url", "git.http_proxy", "health.probe"},
	}
	if a == nil || strings.TrimSpace(a.apiBaseURL) == "" || strings.TrimSpace(a.token) == "" {
		health.Status = providercontract.HealthStatusMissingConfig
		health.Message = "github enterprise base url and token are required"
		return health
	}
	user, err := a.currentUser(ctx)
	if err != nil {
		health.Status = providercontract.HealthStatusError
		health.Message = err.Error()
		return health
	}
	if strings.TrimSpace(user.Login) != "" {
		health.Message = "github enterprise authentication succeeded as " + user.Login
	}
	return health
}

func (a *GitHubEnterpriseAdapter) EnsureUser(context.Context, EnsureUserInput) (EnsureUserResult, error) {
	return EnsureUserResult{}, fmt.Errorf("github enterprise user lifecycle is managed by GitHub Enterprise")
}

func (a *GitHubEnterpriseAdapter) EnsureRepoCollaborator(ctx context.Context, owner string, repo string, username string, permission string) error {
	if a == nil {
		return fmt.Errorf("github enterprise adapter is not configured")
	}
	username = strings.TrimSpace(username)
	if username == "" {
		return fmt.Errorf("github enterprise collaborator username is required")
	}
	payload := map[string]any{"permission": githubEnterpriseCollaboratorPermission(permission)}
	return a.doJSON(ctx, http.MethodPut, "/repos/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/collaborators/"+url.PathEscape(username), payload, nil)
}

func (a *GitHubEnterpriseAdapter) CheckRepoAccess(ctx context.Context, request RepositoryAccessRequest) (RepositoryAccessResult, error) {
	if a == nil {
		return RepositoryAccessResult{}, fmt.Errorf("github enterprise adapter is not configured")
	}
	var out githubEnterpriseCollaboratorPermissionResponse
	err := a.doJSON(ctx, http.MethodGet, "/repos/"+url.PathEscape(request.Owner)+"/"+url.PathEscape(request.Repo)+"/collaborators/"+url.PathEscape(request.Username)+"/permission", nil, &out)
	if err != nil {
		if githubEnterpriseIsNotFound(err) {
			return RepositoryAccessResult{Allowed: false}, nil
		}
		return RepositoryAccessResult{}, err
	}
	permission := githubEnterpriseContractPermission(out.Permission)
	return RepositoryAccessResult{
		Allowed:    permissionSatisfies(permission, request.Permission),
		Permission: permission,
	}, nil
}

func (a *GitHubEnterpriseAdapter) currentUser(ctx context.Context) (githubEnterpriseUser, error) {
	var out githubEnterpriseUser
	if err := a.doJSON(ctx, http.MethodGet, "/user", nil, &out); err != nil {
		return githubEnterpriseUser{}, err
	}
	return out, nil
}

func (a *GitHubEnterpriseAdapter) getRepo(ctx context.Context, owner string, repo string) (githubEnterpriseRepo, error) {
	var out githubEnterpriseRepo
	if err := a.doJSON(ctx, http.MethodGet, "/repos/"+url.PathEscape(owner)+"/"+url.PathEscape(repo), nil, &out); err != nil {
		return githubEnterpriseRepo{}, err
	}
	return out, nil
}

func (a *GitHubEnterpriseAdapter) createRepo(ctx context.Context, input EnsureRepositoryInput) (githubEnterpriseRepo, error) {
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
		var out githubEnterpriseRepo
		if err := a.doJSON(ctx, http.MethodPost, "/orgs/"+url.PathEscape(input.Owner)+"/repos", payload, &out); err != nil {
			return githubEnterpriseRepo{}, err
		}
		return out, nil
	case OwnerTypeUser:
		user, err := a.currentUser(ctx)
		if err != nil {
			return githubEnterpriseRepo{}, err
		}
		if strings.TrimSpace(user.Login) != input.Owner {
			return githubEnterpriseRepo{}, fmt.Errorf("github enterprise owner %q does not match token user %q", input.Owner, user.Login)
		}
		var out githubEnterpriseRepo
		if err := a.doJSON(ctx, http.MethodPost, "/user/repos", payload, &out); err != nil {
			return githubEnterpriseRepo{}, err
		}
		return out, nil
	default:
		return githubEnterpriseRepo{}, fmt.Errorf("github enterprise owner type is required")
	}
}

func (a *GitHubEnterpriseAdapter) branchHead(ctx context.Context, owner string, repo string, branch string) (string, error) {
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

func (a *GitHubEnterpriseAdapter) doJSON(ctx context.Context, method string, path string, payload any, out any) error {
	if a == nil {
		return fmt.Errorf("github enterprise adapter is not configured")
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
		return githubEnterpriseHTTPError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(responseBody))}
	}
	if out == nil || len(responseBody) == 0 {
		return nil
	}
	if err := json.Unmarshal(responseBody, out); err != nil {
		return fmt.Errorf("decode github enterprise response: %w", err)
	}
	return nil
}

func githubEnterpriseAPIBaseURL(baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(baseURL, "/api/v3") {
		return baseURL
	}
	return baseURL + "/api/v3"
}

func githubEnterpriseWebBaseURL(baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return strings.TrimSuffix(baseURL, "/api/v3")
}

type githubEnterpriseRepo struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Owner struct {
		Login string `json:"login"`
	} `json:"owner"`
}

func (r githubEnterpriseRepo) IDString() string {
	if r.ID == 0 {
		return ""
	}
	return strconv.FormatInt(r.ID, 10)
}

type githubEnterpriseUser struct {
	ID    int64  `json:"id"`
	Login string `json:"login"`
}

type githubEnterpriseCollaboratorPermissionResponse struct {
	Permission string `json:"permission"`
}

func githubEnterpriseCollaboratorPermission(permission string) string {
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

func githubEnterpriseContractPermission(permission string) string {
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

type githubEnterpriseHTTPError struct {
	StatusCode int
	Body       string
}

func (e githubEnterpriseHTTPError) Error() string {
	if e.Body == "" {
		return fmt.Sprintf("github enterprise request failed with status %d", e.StatusCode)
	}
	return fmt.Sprintf("github enterprise request failed with status %d: %s", e.StatusCode, e.Body)
}

func githubEnterpriseIsNotFound(err error) bool {
	httpErr, ok := err.(githubEnterpriseHTTPError)
	return ok && httpErr.StatusCode == http.StatusNotFound
}

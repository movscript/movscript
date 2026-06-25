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

type GitLabAdapter struct {
	baseURL    string
	apiBaseURL string
	token      string
	httpClient *http.Client
}

func NewGitLabAdapter(baseURL string, token string) *GitLabAdapter {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	token = strings.TrimSpace(token)
	if baseURL == "" || token == "" {
		return nil
	}
	return &GitLabAdapter{
		baseURL:    gitLabWebBaseURL(baseURL),
		apiBaseURL: gitLabAPIBaseURL(baseURL),
		token:      token,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (a *GitLabAdapter) EnsureRepository(ctx context.Context, input EnsureRepositoryInput) (EnsureRepositoryResult, error) {
	if a == nil {
		return EnsureRepositoryResult{}, fmt.Errorf("gitlab adapter is not configured")
	}
	if project, err := a.getProject(ctx, input.Owner, input.Repo); err == nil {
		head, _ := a.branchHead(ctx, input.Owner, input.Repo, input.DefaultBranch)
		return EnsureRepositoryResult{ProviderRepoID: project.IDString(), HeadCommit: head}, nil
	} else if !gitLabIsNotFound(err) {
		return EnsureRepositoryResult{}, err
	}

	project, err := a.createProject(ctx, input)
	if err != nil {
		return EnsureRepositoryResult{}, err
	}
	head, _ := a.branchHead(ctx, input.Owner, input.Repo, input.DefaultBranch)
	return EnsureRepositoryResult{ProviderRepoID: project.IDString(), HeadCommit: head}, nil
}

func (a *GitLabAdapter) GetCloneURL(_ context.Context, request providercontract.RepositoryCloneURLRequest) (providercontract.RepositoryCloneURLResult, error) {
	switch strings.TrimSpace(request.PreferredStrategy) {
	case "", providercontract.RepositoryCloneURLStrategyDirect:
	case providercontract.RepositoryCloneURLStrategyProxy:
		if strings.TrimSpace(request.PublicURL) != "" {
			return providercontract.RepositoryCloneURLResult{URL: strings.TrimSpace(request.PublicURL), Strategy: providercontract.RepositoryCloneURLStrategyProxy}, nil
		}
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("gitlab proxy clone URL requires public URL")
	case providercontract.RepositoryCloneURLStrategyTemporary:
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("gitlab temporary clone URL is not supported")
	default:
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("gitlab clone URL strategy %q is not supported", request.PreferredStrategy)
	}
	if a == nil || strings.TrimSpace(a.baseURL) == "" {
		return providercontract.RepositoryCloneURLResult{}, fmt.Errorf("gitlab adapter is not configured")
	}
	return providercontract.RepositoryCloneURLResult{
		URL:      strings.TrimRight(a.baseURL, "/") + "/" + url.PathEscape(request.Ref.Owner) + "/" + url.PathEscape(request.Ref.Repo) + ".git",
		Strategy: providercontract.RepositoryCloneURLStrategyDirect,
	}, nil
}

func (a *GitLabAdapter) GetGitHTTPProxyTarget(_ context.Context, request providercontract.GitHTTPProxyTargetRequest) (providercontract.GitHTTPProxyTarget, error) {
	if a == nil || strings.TrimSpace(a.baseURL) == "" || strings.TrimSpace(a.token) == "" {
		return providercontract.GitHTTPProxyTarget{}, fmt.Errorf("gitlab adapter is not configured")
	}
	return providercontract.GitHTTPProxyTarget{
		Provider:      ProviderGitLab,
		Owner:         request.Ref.Owner,
		Repo:          request.Ref.Repo,
		DefaultBranch: request.Ref.DefaultBranch,
		BaseURL:       a.baseURL,
		AuthUsername:  "oauth2",
		AuthSecret:    a.token,
	}, nil
}

func (a *GitLabAdapter) Health(ctx context.Context) providercontract.ProviderHealth {
	health := providercontract.ProviderHealth{
		Type:         providercontract.TypeWorkspaceRepository,
		Adapter:      providercontract.AdapterGitLab,
		Assembly:     providercontract.AssemblyStartup,
		Status:       providercontract.HealthStatusOK,
		Message:      "gitlab authentication succeeded",
		Capabilities: []string{"repository.ensure", "repository.collaborator.ensure", "repository.access.probe", "repository.clone_url", "git.http_proxy", "health.probe"},
	}
	if a == nil || strings.TrimSpace(a.apiBaseURL) == "" || strings.TrimSpace(a.token) == "" {
		health.Status = providercontract.HealthStatusMissingConfig
		health.Message = "gitlab base url and token are required"
		return health
	}
	user, err := a.currentUser(ctx)
	if err != nil {
		health.Status = providercontract.HealthStatusError
		health.Message = err.Error()
		return health
	}
	if strings.TrimSpace(user.Username) != "" {
		health.Message = "gitlab authentication succeeded as " + user.Username
	}
	return health
}

func (a *GitLabAdapter) EnsureUser(context.Context, EnsureUserInput) (EnsureUserResult, error) {
	return EnsureUserResult{}, fmt.Errorf("gitlab user lifecycle is managed by GitLab")
}

func (a *GitLabAdapter) EnsureRepoCollaborator(ctx context.Context, owner string, repo string, username string, permission string) error {
	if a == nil {
		return fmt.Errorf("gitlab adapter is not configured")
	}
	user, err := a.findUserByUsername(ctx, username)
	if err != nil {
		return err
	}
	projectPath := url.PathEscape(owner + "/" + repo)
	accessLevel := gitLabAccessLevel(permission)
	payload := map[string]any{"access_level": accessLevel}
	err = a.doJSON(ctx, http.MethodPut, "/projects/"+projectPath+"/members/"+strconv.FormatInt(user.ID, 10), payload, nil)
	if err == nil {
		return nil
	}
	if !gitLabIsNotFound(err) {
		return err
	}
	payload["user_id"] = user.ID
	err = a.doJSON(ctx, http.MethodPost, "/projects/"+projectPath+"/members", payload, nil)
	if gitLabIsConflict(err) {
		delete(payload, "user_id")
		return a.doJSON(ctx, http.MethodPut, "/projects/"+projectPath+"/members/"+strconv.FormatInt(user.ID, 10), payload, nil)
	}
	return err
}

func (a *GitLabAdapter) CheckRepoAccess(ctx context.Context, request RepositoryAccessRequest) (RepositoryAccessResult, error) {
	if a == nil {
		return RepositoryAccessResult{}, fmt.Errorf("gitlab adapter is not configured")
	}
	user, err := a.findUserByUsername(ctx, request.Username)
	if err != nil {
		if gitLabIsNotFound(err) {
			return RepositoryAccessResult{Allowed: false}, nil
		}
		return RepositoryAccessResult{}, err
	}
	var out gitLabMember
	err = a.doJSON(ctx, http.MethodGet, "/projects/"+url.PathEscape(request.Owner+"/"+request.Repo)+"/members/all/"+strconv.FormatInt(user.ID, 10), nil, &out)
	if err != nil {
		if gitLabIsNotFound(err) {
			return RepositoryAccessResult{Allowed: false}, nil
		}
		return RepositoryAccessResult{}, err
	}
	permission := gitLabContractPermission(out.AccessLevel)
	return RepositoryAccessResult{
		Allowed:    permissionSatisfies(permission, request.Permission),
		Permission: permission,
	}, nil
}

func (a *GitLabAdapter) currentUser(ctx context.Context) (gitLabUser, error) {
	var out gitLabUser
	if err := a.doJSON(ctx, http.MethodGet, "/user", nil, &out); err != nil {
		return gitLabUser{}, err
	}
	return out, nil
}

func (a *GitLabAdapter) findUserByUsername(ctx context.Context, username string) (gitLabUser, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return gitLabUser{}, fmt.Errorf("gitlab username is required")
	}
	var out []gitLabUser
	if err := a.doJSON(ctx, http.MethodGet, "/users?username="+url.QueryEscape(username), nil, &out); err != nil {
		return gitLabUser{}, err
	}
	for _, user := range out {
		if strings.EqualFold(strings.TrimSpace(user.Username), username) {
			return user, nil
		}
	}
	return gitLabUser{}, gitLabHTTPError{StatusCode: http.StatusNotFound, Body: "gitlab user not found"}
}

func (a *GitLabAdapter) getProject(ctx context.Context, owner string, repo string) (gitLabProject, error) {
	var out gitLabProject
	if err := a.doJSON(ctx, http.MethodGet, "/projects/"+url.PathEscape(owner+"/"+repo), nil, &out); err != nil {
		return gitLabProject{}, err
	}
	return out, nil
}

func (a *GitLabAdapter) getGroup(ctx context.Context, path string) (gitLabGroup, error) {
	var out gitLabGroup
	if err := a.doJSON(ctx, http.MethodGet, "/groups/"+url.PathEscape(path), nil, &out); err != nil {
		return gitLabGroup{}, err
	}
	return out, nil
}

func (a *GitLabAdapter) createProject(ctx context.Context, input EnsureRepositoryInput) (gitLabProject, error) {
	payload := map[string]any{
		"name":                   input.Repo,
		"path":                   input.Repo,
		"initialize_with_readme": true,
	}
	if input.Private {
		payload["visibility"] = "private"
	} else {
		payload["visibility"] = "public"
	}
	if strings.TrimSpace(input.Description) != "" {
		payload["description"] = input.Description
	}
	if strings.TrimSpace(input.DefaultBranch) != "" {
		payload["default_branch"] = strings.TrimSpace(input.DefaultBranch)
	}
	switch input.OwnerType {
	case OwnerTypeOrganization:
		group, err := a.getGroup(ctx, input.Owner)
		if err != nil {
			return gitLabProject{}, err
		}
		payload["namespace_id"] = group.ID
	case OwnerTypeUser:
		user, err := a.currentUser(ctx)
		if err != nil {
			return gitLabProject{}, err
		}
		if strings.TrimSpace(user.Username) != input.Owner {
			return gitLabProject{}, fmt.Errorf("gitlab owner %q does not match token user %q", input.Owner, user.Username)
		}
	default:
		return gitLabProject{}, fmt.Errorf("gitlab owner type is required")
	}
	var out gitLabProject
	if err := a.doJSON(ctx, http.MethodPost, "/projects", payload, &out); err != nil {
		return gitLabProject{}, err
	}
	return out, nil
}

func (a *GitLabAdapter) branchHead(ctx context.Context, owner string, repo string, branch string) (string, error) {
	branch = strings.TrimSpace(branch)
	if branch == "" {
		return "", nil
	}
	var out struct {
		Commit struct {
			ID string `json:"id"`
		} `json:"commit"`
	}
	if err := a.doJSON(ctx, http.MethodGet, "/projects/"+url.PathEscape(owner+"/"+repo)+"/repository/branches/"+url.PathEscape(branch), nil, &out); err != nil {
		return "", err
	}
	return out.Commit.ID, nil
}

func (a *GitLabAdapter) doJSON(ctx context.Context, method string, path string, payload any, out any) error {
	if a == nil {
		return fmt.Errorf("gitlab adapter is not configured")
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
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("PRIVATE-TOKEN", a.token)

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return gitLabHTTPError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(responseBody))}
	}
	if out == nil || len(responseBody) == 0 {
		return nil
	}
	if err := json.Unmarshal(responseBody, out); err != nil {
		return fmt.Errorf("decode gitlab response: %w", err)
	}
	return nil
}

func gitLabAPIBaseURL(baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(baseURL, "/api/v4") {
		return baseURL
	}
	return baseURL + "/api/v4"
}

func gitLabWebBaseURL(baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return strings.TrimSuffix(baseURL, "/api/v4")
}

type gitLabProject struct {
	ID int64 `json:"id"`
}

func (p gitLabProject) IDString() string {
	if p.ID == 0 {
		return ""
	}
	return strconv.FormatInt(p.ID, 10)
}

type gitLabGroup struct {
	ID int64 `json:"id"`
}

type gitLabUser struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
}

type gitLabMember struct {
	AccessLevel int `json:"access_level"`
}

func gitLabAccessLevel(permission string) int {
	switch strings.ToLower(strings.TrimSpace(permission)) {
	case "read", "guest", "reporter":
		return 20
	case "admin", "maintainer", "owner":
		return 40
	case "write", "developer":
		return 30
	default:
		return 30
	}
}

func gitLabContractPermission(accessLevel int) string {
	switch {
	case accessLevel >= 40:
		return "admin"
	case accessLevel >= 30:
		return "write"
	case accessLevel >= 20:
		return "read"
	default:
		return ""
	}
}

type gitLabHTTPError struct {
	StatusCode int
	Body       string
}

func (e gitLabHTTPError) Error() string {
	if e.Body == "" {
		return fmt.Sprintf("gitlab request failed with status %d", e.StatusCode)
	}
	return fmt.Sprintf("gitlab request failed with status %d: %s", e.StatusCode, e.Body)
}

func gitLabIsNotFound(err error) bool {
	httpErr, ok := err.(gitLabHTTPError)
	return ok && httpErr.StatusCode == http.StatusNotFound
}

func gitLabIsConflict(err error) bool {
	httpErr, ok := err.(gitLabHTTPError)
	return ok && httpErr.StatusCode == http.StatusConflict
}

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
)

type GiteaAdapter struct {
	baseURL    string
	token      string
	httpClient *http.Client
}

func NewGiteaAdapter(baseURL string, token string) *GiteaAdapter {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	token = strings.TrimSpace(token)
	if baseURL == "" || token == "" {
		return nil
	}
	return &GiteaAdapter{
		baseURL: baseURL,
		token:   token,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (a *GiteaAdapter) EnsureRepository(ctx context.Context, input EnsureRepositoryInput) (EnsureRepositoryResult, error) {
	if a == nil {
		return EnsureRepositoryResult{}, nil
	}
	if repo, err := a.getRepo(ctx, input.Owner, input.Repo); err == nil {
		head, _ := a.branchHead(ctx, input.Owner, input.Repo, input.DefaultBranch)
		return EnsureRepositoryResult{ProviderRepoID: repo.IDString(), HeadCommit: head}, nil
	} else if !errorsIsNotFound(err) {
		return EnsureRepositoryResult{}, err
	}

	repo, err := a.createOrgRepo(ctx, input)
	if err != nil {
		return EnsureRepositoryResult{}, err
	}
	head, _ := a.branchHead(ctx, input.Owner, input.Repo, input.DefaultBranch)
	return EnsureRepositoryResult{ProviderRepoID: repo.IDString(), HeadCommit: head}, nil
}

func (a *GiteaAdapter) getRepo(ctx context.Context, owner string, repo string) (giteaRepo, error) {
	var out giteaRepo
	if err := a.doJSON(ctx, http.MethodGet, "/api/v1/repos/"+url.PathEscape(owner)+"/"+url.PathEscape(repo), nil, &out); err != nil {
		return giteaRepo{}, err
	}
	return out, nil
}

func (a *GiteaAdapter) createOrgRepo(ctx context.Context, input EnsureRepositoryInput) (giteaRepo, error) {
	payload := map[string]any{
		"name":           input.Repo,
		"private":        input.Private,
		"auto_init":      true,
		"default_branch": input.DefaultBranch,
	}
	if strings.TrimSpace(input.Description) != "" {
		payload["description"] = input.Description
	}
	var out giteaRepo
	if err := a.doJSON(ctx, http.MethodPost, "/api/v1/orgs/"+url.PathEscape(input.Owner)+"/repos", payload, &out); err == nil {
		return out, nil
	} else if !errorsIsNotFound(err) {
		return giteaRepo{}, err
	}

	user, err := a.currentUser(ctx)
	if err != nil {
		return giteaRepo{}, err
	}
	if user.UserName != input.Owner {
		return giteaRepo{}, fmt.Errorf("gitea owner %q is not an organization and does not match token user %q", input.Owner, user.UserName)
	}
	if err := a.doJSON(ctx, http.MethodPost, "/api/v1/user/repos", payload, &out); err != nil {
		return giteaRepo{}, err
	}
	return out, nil
}

func (a *GiteaAdapter) currentUser(ctx context.Context) (giteaUser, error) {
	var out giteaUser
	if err := a.doJSON(ctx, http.MethodGet, "/api/v1/user", nil, &out); err != nil {
		return giteaUser{}, err
	}
	return out, nil
}

func (a *GiteaAdapter) branchHead(ctx context.Context, owner string, repo string, branch string) (string, error) {
	if branch == "" {
		return "", nil
	}
	var out struct {
		Commit struct {
			ID string `json:"id"`
		} `json:"commit"`
	}
	if err := a.doJSON(ctx, http.MethodGet, "/api/v1/repos/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/branches/"+url.PathEscape(branch), nil, &out); err != nil {
		return "", err
	}
	return out.Commit.ID, nil
}

func (a *GiteaAdapter) doJSON(ctx context.Context, method string, path string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, a.baseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "token "+a.token)

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return giteaHTTPError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(responseBody))}
	}
	if out == nil || len(responseBody) == 0 {
		return nil
	}
	if err := json.Unmarshal(responseBody, out); err != nil {
		return fmt.Errorf("decode gitea response: %w", err)
	}
	return nil
}

type giteaRepo struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	FullName      string `json:"full_name"`
	DefaultBranch string `json:"default_branch"`
}

type giteaUser struct {
	ID       int64  `json:"id"`
	UserName string `json:"username"`
}

func (r giteaRepo) IDString() string {
	if r.ID == 0 {
		return ""
	}
	return strconv.FormatInt(r.ID, 10)
}

type giteaHTTPError struct {
	StatusCode int
	Body       string
}

func (e giteaHTTPError) Error() string {
	if e.Body == "" {
		return fmt.Sprintf("gitea request failed with status %d", e.StatusCode)
	}
	return fmt.Sprintf("gitea request failed with status %d: %s", e.StatusCode, e.Body)
}

func errorsIsNotFound(err error) bool {
	httpErr, ok := err.(giteaHTTPError)
	return ok && httpErr.StatusCode == http.StatusNotFound
}

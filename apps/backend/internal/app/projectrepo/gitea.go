package projectrepo

import (
	"bytes"
	"context"
	crand "crypto/rand"
	"encoding/base64"
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
	baseURL       string
	token         string
	adminUsername string
	adminPassword string
	httpClient    *http.Client
}

type EnsureUserInput struct {
	Username  string
	Email     string
	Password  string
	TokenName string
}

type EnsureUserResult struct {
	ProviderUserID string
	Username       string
	Token          string
}

func NewGiteaAdapter(baseURL string, token string) *GiteaAdapter {
	return NewGiteaAdapterWithAdminAuth(baseURL, token, "", "")
}

func NewGiteaAdapterWithAdminAuth(baseURL string, token string, adminUsername string, adminPassword string) *GiteaAdapter {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	token = strings.TrimSpace(token)
	adminUsername = strings.TrimSpace(adminUsername)
	adminPassword = strings.TrimSpace(adminPassword)
	if baseURL == "" || (token == "" && (adminUsername == "" || adminPassword == "")) {
		return nil
	}
	return &GiteaAdapter{
		baseURL:       baseURL,
		token:         token,
		adminUsername: adminUsername,
		adminPassword: adminPassword,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (a *GiteaAdapter) EnsureRepository(ctx context.Context, input EnsureRepositoryInput) (EnsureRepositoryResult, error) {
	if a == nil {
		return EnsureRepositoryResult{}, nil
	}
	if err := a.ensureOwner(ctx, input); err != nil {
		return EnsureRepositoryResult{}, err
	}
	if repo, err := a.getRepo(ctx, input.Owner, input.Repo); err == nil {
		head, _ := a.branchHead(ctx, input.Owner, input.Repo, input.DefaultBranch)
		return EnsureRepositoryResult{ProviderRepoID: repo.IDString(), HeadCommit: head}, nil
	} else if !errorsIsNotFound(err) {
		return EnsureRepositoryResult{}, err
	}

	repo, err := a.createRepo(ctx, input)
	if err != nil {
		return EnsureRepositoryResult{}, err
	}
	head, _ := a.branchHead(ctx, input.Owner, input.Repo, input.DefaultBranch)
	return EnsureRepositoryResult{ProviderRepoID: repo.IDString(), HeadCommit: head}, nil
}

func (a *GiteaAdapter) EnsureUser(ctx context.Context, input EnsureUserInput) (EnsureUserResult, error) {
	if a == nil {
		return EnsureUserResult{}, fmt.Errorf("gitea adapter is not configured")
	}
	username := strings.TrimSpace(input.Username)
	if username == "" {
		return EnsureUserResult{}, fmt.Errorf("gitea username is required")
	}
	user, err := a.getUser(ctx, username)
	created := false
	if err != nil {
		if !errorsIsNotFound(err) {
			return EnsureUserResult{}, err
		}
		user, err = a.createUser(ctx, input)
		if err != nil {
			return EnsureUserResult{}, err
		}
		created = true
	}
	if !created {
		if err := a.resetUserPassword(ctx, username, input.Password); err != nil {
			return EnsureUserResult{}, err
		}
	}
	token, err := a.createUserToken(ctx, username, input.Password, input.TokenName)
	if err != nil {
		return EnsureUserResult{}, err
	}
	return EnsureUserResult{ProviderUserID: user.IDString(), Username: user.UserName, Token: token}, nil
}

func (a *GiteaAdapter) EnsureRepoCollaborator(ctx context.Context, owner string, repo string, username string, permission string) error {
	if a == nil {
		return fmt.Errorf("gitea adapter is not configured")
	}
	payload := map[string]any{"permission": permission}
	return a.doJSON(ctx, http.MethodPut, "/api/v1/repos/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/collaborators/"+url.PathEscape(username), payload, nil)
}

func (a *GiteaAdapter) ensureOwner(ctx context.Context, input EnsureRepositoryInput) error {
	switch input.OwnerType {
	case OwnerTypeUser:
		if _, err := a.getUser(ctx, input.Owner); err == nil {
			return nil
		} else if !errorsIsNotFound(err) {
			return err
		}
		password, err := randomGiteaOwnerSecret()
		if err != nil {
			return err
		}
		_, err = a.createUser(ctx, EnsureUserInput{
			Username: input.Owner,
			Email:    input.Owner + "@users.movscript.local",
			Password: password,
		})
		return err
	case OwnerTypeOrganization:
		if _, err := a.getOrg(ctx, input.Owner); err == nil {
			return nil
		} else if !errorsIsNotFound(err) {
			return err
		}
		_, err := a.createOrg(ctx, input.Owner, input.OwnerName)
		return err
	default:
		return nil
	}
}

func (a *GiteaAdapter) getRepo(ctx context.Context, owner string, repo string) (giteaRepo, error) {
	var out giteaRepo
	if err := a.doJSON(ctx, http.MethodGet, "/api/v1/repos/"+url.PathEscape(owner)+"/"+url.PathEscape(repo), nil, &out); err != nil {
		return giteaRepo{}, err
	}
	return out, nil
}

func (a *GiteaAdapter) getUser(ctx context.Context, username string) (giteaUser, error) {
	var out giteaUser
	if err := a.doJSON(ctx, http.MethodGet, "/api/v1/users/"+url.PathEscape(username), nil, &out); err != nil {
		return giteaUser{}, err
	}
	return out, nil
}

func (a *GiteaAdapter) getOrg(ctx context.Context, username string) (giteaOrg, error) {
	var out giteaOrg
	if err := a.doJSON(ctx, http.MethodGet, "/api/v1/orgs/"+url.PathEscape(username), nil, &out); err != nil {
		return giteaOrg{}, err
	}
	return out, nil
}

func (a *GiteaAdapter) createUser(ctx context.Context, input EnsureUserInput) (giteaUser, error) {
	payload := map[string]any{
		"username":             strings.TrimSpace(input.Username),
		"email":                strings.TrimSpace(input.Email),
		"password":             input.Password,
		"must_change_password": false,
		"restricted":           false,
		"visibility":           "private",
	}
	var out giteaUser
	if err := a.doJSON(ctx, http.MethodPost, "/api/v1/admin/users", payload, &out); err != nil {
		return giteaUser{}, err
	}
	return out, nil
}

func (a *GiteaAdapter) createOrg(ctx context.Context, username string, fullName string) (giteaOrg, error) {
	username = strings.TrimSpace(username)
	payload := map[string]any{
		"username": username,
	}
	fullName = strings.TrimSpace(fullName)
	if fullName == "" {
		fullName = username
	}
	payload["full_name"] = fullName
	var out giteaOrg
	if err := a.doJSON(ctx, http.MethodPost, "/api/v1/orgs", payload, &out); err != nil {
		return giteaOrg{}, err
	}
	return out, nil
}

func (a *GiteaAdapter) resetUserPassword(ctx context.Context, username string, password string) error {
	payload := map[string]any{
		"login_name":           username,
		"password":             password,
		"must_change_password": false,
	}
	return a.doJSON(ctx, http.MethodPatch, "/api/v1/admin/users/"+url.PathEscape(username), payload, nil)
}

func (a *GiteaAdapter) createUserToken(ctx context.Context, username string, password string, tokenName string) (string, error) {
	tokenName = strings.TrimSpace(tokenName)
	if tokenName == "" {
		tokenName = "movscript"
	}
	var out giteaAccessToken
	if err := a.doJSONWithBasicAuth(ctx, http.MethodPost, "/api/v1/users/"+url.PathEscape(username)+"/tokens", map[string]any{
		"name":   tokenName,
		"scopes": []string{"write:repository"},
	}, &out, username, password); err != nil {
		return "", err
	}
	token := strings.TrimSpace(out.Token)
	if token == "" {
		token = strings.TrimSpace(out.SHA1)
	}
	if token == "" {
		return "", fmt.Errorf("gitea token response did not include token material")
	}
	return token, nil
}

func (a *GiteaAdapter) createRepo(ctx context.Context, input EnsureRepositoryInput) (giteaRepo, error) {
	payload := map[string]any{
		"name":           input.Repo,
		"private":        input.Private,
		"auto_init":      false,
		"default_branch": input.DefaultBranch,
	}
	if strings.TrimSpace(input.Description) != "" {
		payload["description"] = input.Description
	}
	switch input.OwnerType {
	case OwnerTypeUser:
		return a.createUserRepo(ctx, input.Owner, payload)
	case OwnerTypeOrganization:
		return a.createOrgRepo(ctx, input.Owner, payload)
	default:
		return a.createOrgRepoWithUserFallback(ctx, input, payload)
	}
}

func (a *GiteaAdapter) createUserRepo(ctx context.Context, owner string, payload map[string]any) (giteaRepo, error) {
	var out giteaRepo
	if err := a.doJSON(ctx, http.MethodPost, "/api/v1/admin/users/"+url.PathEscape(owner)+"/repos", payload, &out); err != nil {
		return giteaRepo{}, err
	}
	return out, nil
}

func (a *GiteaAdapter) createOrgRepo(ctx context.Context, owner string, payload map[string]any) (giteaRepo, error) {
	var out giteaRepo
	if err := a.doJSON(ctx, http.MethodPost, "/api/v1/orgs/"+url.PathEscape(owner)+"/repos", payload, &out); err != nil {
		return giteaRepo{}, err
	}
	return out, nil
}

func (a *GiteaAdapter) createOrgRepoWithUserFallback(ctx context.Context, input EnsureRepositoryInput, payload map[string]any) (giteaRepo, error) {
	if repo, err := a.createOrgRepo(ctx, input.Owner, payload); err == nil {
		return repo, nil
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
	var out giteaRepo
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
	return a.doJSONWithAuth(ctx, method, path, payload, out, func(req *http.Request) {
		if a.token != "" {
			req.Header.Set("Authorization", "token "+a.token)
			return
		}
		req.SetBasicAuth(a.adminUsername, a.adminPassword)
	})
}

func (a *GiteaAdapter) doJSONWithBasicAuth(ctx context.Context, method string, path string, payload any, out any, username string, password string) error {
	return a.doJSONWithAuth(ctx, method, path, payload, out, func(req *http.Request) {
		req.SetBasicAuth(username, password)
	})
}

func (a *GiteaAdapter) doJSONWithAuth(ctx context.Context, method string, path string, payload any, out any, authorize func(*http.Request)) error {
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
	if authorize != nil {
		authorize(req)
	}

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

type giteaOrg struct {
	ID       int64  `json:"id"`
	UserName string `json:"username"`
	FullName string `json:"full_name"`
}

type giteaAccessToken struct {
	Name  string `json:"name"`
	SHA1  string `json:"sha1"`
	Token string `json:"token"`
}

func (r giteaRepo) IDString() string {
	if r.ID == 0 {
		return ""
	}
	return strconv.FormatInt(r.ID, 10)
}

func (u giteaUser) IDString() string {
	if u.ID == 0 {
		return ""
	}
	return strconv.FormatInt(u.ID, 10)
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

func randomGiteaOwnerSecret() (string, error) {
	raw := make([]byte, 32)
	if _, err := crand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

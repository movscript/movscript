package newapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	cfg        Config
	httpClient *http.Client
}

type Envelope struct {
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
}

type Token struct {
	ID             int    `json:"id"`
	Name           string `json:"name"`
	Key            string `json:"key"`
	RemainQuota    int    `json:"remain_quota"`
	UnlimitedQuota bool   `json:"unlimited_quota"`
}

func NewClient(cfg Config, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Client{cfg: cfg, httpClient: httpClient}
}

func (c *Client) EnsureUser(ctx context.Context, movscriptUserID uint) (User, error) {
	if err := c.cfg.ValidateAdmin(); err != nil {
		return User{}, err
	}
	username := c.cfg.UserPrefix + strconv.FormatUint(uint64(movscriptUserID), 10)
	if user, ok, err := c.FindUser(ctx, username); err != nil {
		return User{}, err
	} else if ok {
		return user, nil
	}
	payload := map[string]any{
		"username":     username,
		"password":     c.cfg.UserPassword,
		"display_name": username,
		"role":         1,
	}
	if err := c.adminRequest(ctx, http.MethodPost, "/api/user/", payload, nil); err != nil {
		lower := strings.ToLower(err.Error())
		if !strings.Contains(lower, "duplicate") && !strings.Contains(lower, "already") && !strings.Contains(err.Error(), "已存在") {
			return User{}, err
		}
	}
	user, ok, err := c.FindUser(ctx, username)
	if err != nil {
		return User{}, err
	}
	if !ok {
		return User{}, fmt.Errorf("new-api user %q was not found after provisioning", username)
	}
	return user, nil
}

func (c *Client) FindUser(ctx context.Context, username string) (User, bool, error) {
	path := "/api/user/search?keyword=" + url.QueryEscape(username)
	var env Envelope
	if err := c.adminRequest(ctx, http.MethodGet, path, nil, &env); err != nil {
		return User{}, false, err
	}
	var page struct {
		Items []User `json:"items"`
	}
	if len(env.Data) > 0 {
		_ = json.Unmarshal(env.Data, &page)
	}
	if len(page.Items) == 0 && len(env.Data) > 0 {
		var direct []User
		_ = json.Unmarshal(env.Data, &direct)
		page.Items = direct
	}
	for _, user := range page.Items {
		if user.Username == username {
			return user, true, nil
		}
	}
	return User{}, false, nil
}

func (c *Client) EnsureRelayToken(ctx context.Context, user User, movscriptUserID uint) (int, string, error) {
	client, err := c.loginClient(ctx, user.Username)
	if err != nil {
		return 0, "", err
	}
	tokenName := "movscript-forward-" + strconv.FormatUint(uint64(movscriptUserID), 10)
	if token, ok, err := c.findToken(ctx, client, user.ID, tokenName); err != nil {
		return 0, "", err
	} else if ok {
		key, err := c.getTokenKey(ctx, client, user.ID, token.ID)
		return token.ID, key, err
	}
	payload := map[string]any{
		"name":            tokenName,
		"expired_time":    -1,
		"remain_quota":    c.cfg.TokenQuota,
		"unlimited_quota": false,
		"group":           c.cfg.TokenGroup,
	}
	if err := c.userRequest(ctx, client, user.ID, http.MethodPost, "/api/token/", payload, nil); err != nil {
		return 0, "", err
	}
	token, ok, err := c.findToken(ctx, client, user.ID, tokenName)
	if err != nil {
		return 0, "", err
	}
	if !ok {
		return 0, "", fmt.Errorf("new-api relay token %q was not found after creation", tokenName)
	}
	key, err := c.getTokenKey(ctx, client, user.ID, token.ID)
	return token.ID, key, err
}

func (c *Client) loginClient(ctx context.Context, username string) (*http.Client, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	client := *c.httpClient
	client.Jar = jar
	payload := map[string]any{"username": username, "password": c.cfg.UserPassword}
	var env Envelope
	if err := c.doRequest(ctx, &client, http.MethodPost, "/api/user/login", payload, nil, &env); err != nil {
		return nil, err
	}
	return &client, nil
}

func (c *Client) findToken(ctx context.Context, client *http.Client, userID int, name string) (Token, bool, error) {
	path := "/api/token/search?keyword=" + url.QueryEscape(name) + "&p=1&size=50"
	var env Envelope
	if err := c.userRequest(ctx, client, userID, http.MethodGet, path, nil, &env); err != nil {
		return Token{}, false, err
	}
	var page struct {
		Items []Token `json:"items"`
	}
	if len(env.Data) > 0 {
		_ = json.Unmarshal(env.Data, &page)
	}
	for _, token := range page.Items {
		if token.Name == name {
			return token, true, nil
		}
	}
	return Token{}, false, nil
}

func (c *Client) getTokenKey(ctx context.Context, client *http.Client, userID int, tokenID int) (string, error) {
	var env Envelope
	path := fmt.Sprintf("/api/token/%d/key", tokenID)
	if err := c.userRequest(ctx, client, userID, http.MethodPost, path, nil, &env); err != nil {
		return "", err
	}
	var data struct {
		Key string `json:"key"`
	}
	if len(env.Data) > 0 {
		_ = json.Unmarshal(env.Data, &data)
	}
	if strings.TrimSpace(data.Key) == "" {
		return "", fmt.Errorf("new-api token %d returned an empty key", tokenID)
	}
	return data.Key, nil
}

func (c *Client) adminRequest(ctx context.Context, method string, path string, payload any, out *Envelope) error {
	headers := http.Header{}
	headers.Set("Authorization", c.cfg.AdminToken)
	headers.Set("New-Api-User", strconv.Itoa(c.cfg.AdminUserID))
	return c.doRequest(ctx, c.httpClient, method, path, payload, headers, out)
}

func (c *Client) userRequest(ctx context.Context, client *http.Client, userID int, method string, path string, payload any, out *Envelope) error {
	headers := http.Header{}
	headers.Set("New-Api-User", strconv.Itoa(userID))
	return c.doRequest(ctx, client, method, path, payload, headers, out)
}

func (c *Client) doRequest(ctx context.Context, client *http.Client, method string, path string, payload any, headers http.Header, out *Envelope) error {
	timeout := time.Duration(c.cfg.HTTPTimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	var body *bytes.Reader
	if payload == nil {
		body = bytes.NewReader(nil)
	} else {
		raw, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.cfg.BaseURL+path, body)
	if err != nil {
		return err
	}
	for key, values := range headers {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var env Envelope
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || !env.Success {
		if env.Message == "" {
			env.Message = resp.Status
		}
		return fmt.Errorf("new-api request %s %s failed: %s", method, path, env.Message)
	}
	if out != nil {
		*out = env
	}
	return nil
}

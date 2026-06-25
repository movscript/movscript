package authidentity

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
)

var (
	ErrInvalidConfig = errors.New("auth identity client invalid config")
	ErrUserNotFound  = errors.New("auth identity user not found")
	ErrOrgNotFound   = errors.New("auth identity org not found")
	ErrUnauthorized  = errors.New("auth identity request unauthorized")
	ErrConflict      = errors.New("auth identity request conflict")
	ErrBadRequest    = errors.New("auth identity request invalid")
)

type Reader interface {
	UserProfile(ctx context.Context, userID uint) (domainidentity.UserProfile, error)
	OrgMemberships(ctx context.Context, userID uint) ([]OrgMembership, error)
}

type UserDirectory interface {
	ListUsers(ctx context.Context, filter ListUsersFilter) (UserPage, error)
}

type UserWriter interface {
	CreateUser(ctx context.Context, input CreateUserInput) (domainidentity.UserProfile, error)
	UpdateUser(ctx context.Context, userID uint, input UpdateUserInput) (domainidentity.UserProfile, error)
}

type UserCredentialWriter interface {
	SetUserPasswordHash(ctx context.Context, userID uint, passwordHash string) (domainidentity.UserProfile, error)
}

type UserWithPasswordCreator interface {
	CreateUserWithPassword(ctx context.Context, input CreateUserInput, password string) (domainidentity.UserProfile, error)
}

type OrgDirectory interface {
	ListOrgs(ctx context.Context, filter ListOrgsFilter) (OrgPage, error)
}

type OrgWriter interface {
	CreateOrg(ctx context.Context, input CreateOrgInput) (Organization, error)
	UpdateOrg(ctx context.Context, orgID uint, input UpdateOrgInput) (Organization, error)
}

type OrgMemberDirectory interface {
	ListOrgMembers(ctx context.Context, orgID uint) ([]OrganizationMember, error)
}

type OrgMemberWriter interface {
	AddOrgMember(ctx context.Context, orgID uint, input OrgMemberInput) (OrganizationMember, error)
	UpdateOrgMember(ctx context.Context, orgID uint, userID uint, input OrgMemberInput) (OrganizationMember, error)
	RemoveOrgMember(ctx context.Context, orgID uint, userID uint) (bool, error)
}

type Manager interface {
	Reader
	UserDirectory
	UserWriter
	UserCredentialWriter
	UserWithPasswordCreator
	OrgDirectory
	OrgWriter
	OrgMemberDirectory
	OrgMemberWriter
}

type Client struct {
	baseURL         string
	managementToken string
	client          *http.Client
}

type OrgMembership struct {
	OrgID      uint   `json:"org_id"`
	OrgName    string `json:"org_name"`
	OrgSlug    string `json:"org_slug"`
	IsPersonal bool   `json:"is_personal"`
	Plan       string `json:"plan"`
	Status     string `json:"status"`
	Role       string `json:"role"`
}

type ListUsersFilter struct {
	Query      string
	UserID     *uint
	SystemRole string
	Status     string
	Page       int
	PageSize   int
}

type UserPage struct {
	Items    []domainidentity.UserProfile `json:"items"`
	Total    int64                        `json:"total"`
	Page     int                          `json:"page"`
	PageSize int                          `json:"page_size"`
}

type CreateUserInput struct {
	Username    string  `json:"username"`
	Email       *string `json:"email,omitempty"`
	DisplayName *string `json:"display_name,omitempty"`
	SystemRole  *string `json:"system_role,omitempty"`
	Status      *string `json:"status,omitempty"`
}

type UpdateUserInput struct {
	SystemRole  *string `json:"system_role,omitempty"`
	Status      *string `json:"status,omitempty"`
	DisplayName *string `json:"display_name,omitempty"`
	Email       *string `json:"email,omitempty"`
}

type SetUserPasswordHashInput struct {
	PasswordHash string `json:"password_hash"`
}

type CreateUserWithPasswordInput struct {
	CreateUserInput
	Password string `json:"password"`
}

type Organization struct {
	ID         uint   `json:"id"`
	Name       string `json:"name"`
	Slug       string `json:"slug"`
	IsPersonal bool   `json:"is_personal"`
	Plan       string `json:"plan"`
	Status     string `json:"status"`
	CreatedBy  uint   `json:"created_by"`
}

type OrganizationMember struct {
	ID     uint                        `json:"id"`
	OrgID  uint                        `json:"org_id"`
	UserID uint                        `json:"user_id"`
	Role   string                      `json:"role"`
	User   *domainidentity.UserProfile `json:"user,omitempty"`
}

type ListOrgsFilter struct {
	Query      string
	OrgID      *uint
	UserID     *uint
	Status     string
	Plan       string
	IsPersonal *bool
	Page       int
	PageSize   int
}

type OrgPage struct {
	Items    []Organization `json:"items"`
	Total    int64          `json:"total"`
	Page     int            `json:"page"`
	PageSize int            `json:"page_size"`
}

type CreateOrgInput struct {
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	CreatedBy uint   `json:"created_by"`
	Plan      string `json:"plan,omitempty"`
	Status    string `json:"status,omitempty"`
}

type UpdateOrgInput struct {
	Name   *string `json:"name,omitempty"`
	Slug   *string `json:"slug,omitempty"`
	Plan   *string `json:"plan,omitempty"`
	Status *string `json:"status,omitempty"`
}

type OrgMemberInput struct {
	UserID uint   `json:"user_id,omitempty"`
	Role   string `json:"role,omitempty"`
}

type wireUserProfile struct {
	ID              uint    `json:"id"`
	Username        string  `json:"username"`
	SystemRole      string  `json:"system_role"`
	PrimaryEmail    *string `json:"primary_email,omitempty"`
	PrimaryPhone    *string `json:"primary_phone,omitempty"`
	DisplayName     string  `json:"display_name,omitempty"`
	AvatarURL       string  `json:"avatar_url,omitempty"`
	Locale          string  `json:"locale,omitempty"`
	Status          string  `json:"status"`
	EmailVerifiedAt *int64  `json:"email_verified_at,omitempty"`
}

type wireOrgMembershipList struct {
	Items []OrgMembership `json:"items"`
}

type wireUserPage struct {
	Items    []wireUserProfile `json:"items"`
	Total    int64             `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
}

type wireOrgMemberList struct {
	Items []OrganizationMember `json:"items"`
}

type removedResponse struct {
	Removed bool `json:"removed"`
}

func NewClient(baseURL string, managementToken string, client *http.Client) (*Client, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("%w: auth service base url is required", ErrInvalidConfig)
	}
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &Client{
		baseURL:         baseURL,
		managementToken: strings.TrimSpace(managementToken),
		client:          client,
	}, nil
}

func (c *Client) UserProfile(ctx context.Context, userID uint) (domainidentity.UserProfile, error) {
	var out wireUserProfile
	if err := c.get(ctx, fmt.Sprintf("/v1/auth/users/%d", userID), &out); err != nil {
		return domainidentity.UserProfile{}, err
	}
	return domainidentity.UserProfile{
		ID:              out.ID,
		Username:        out.Username,
		SystemRole:      out.SystemRole,
		PrimaryEmail:    out.PrimaryEmail,
		PrimaryPhone:    out.PrimaryPhone,
		DisplayName:     out.DisplayName,
		AvatarURL:       out.AvatarURL,
		Locale:          out.Locale,
		Status:          out.Status,
		EmailVerifiedAt: out.EmailVerifiedAt,
	}, nil
}

func (c *Client) ListUsers(ctx context.Context, filter ListUsersFilter) (UserPage, error) {
	var out wireUserPage
	if err := c.get(ctx, "/v1/auth/users"+userFilterQuery(filter), &out); err != nil {
		return UserPage{}, err
	}
	items := make([]domainidentity.UserProfile, 0, len(out.Items))
	for _, item := range out.Items {
		items = append(items, userProfileFromWire(item))
	}
	return UserPage{Items: items, Total: out.Total, Page: out.Page, PageSize: out.PageSize}, nil
}

func (c *Client) CreateUser(ctx context.Context, input CreateUserInput) (domainidentity.UserProfile, error) {
	var out wireUserProfile
	if err := c.post(ctx, "/v1/auth/users", input, &out); err != nil {
		return domainidentity.UserProfile{}, err
	}
	return userProfileFromWire(out), nil
}

func (c *Client) CreateUserWithPassword(ctx context.Context, input CreateUserInput, password string) (domainidentity.UserProfile, error) {
	var out wireUserProfile
	if err := c.post(ctx, "/v1/auth/users/with-password", CreateUserWithPasswordInput{
		CreateUserInput: input,
		Password:        password,
	}, &out); err != nil {
		return domainidentity.UserProfile{}, err
	}
	return userProfileFromWire(out), nil
}

func (c *Client) UpdateUser(ctx context.Context, userID uint, input UpdateUserInput) (domainidentity.UserProfile, error) {
	var out wireUserProfile
	if err := c.patch(ctx, fmt.Sprintf("/v1/auth/users/%d", userID), input, &out); err != nil {
		return domainidentity.UserProfile{}, err
	}
	return userProfileFromWire(out), nil
}

func (c *Client) SetUserPasswordHash(ctx context.Context, userID uint, passwordHash string) (domainidentity.UserProfile, error) {
	var out wireUserProfile
	if err := c.put(ctx, fmt.Sprintf("/v1/auth/users/%d/password", userID), SetUserPasswordHashInput{PasswordHash: passwordHash}, &out); err != nil {
		return domainidentity.UserProfile{}, err
	}
	return userProfileFromWire(out), nil
}

func (c *Client) OrgMemberships(ctx context.Context, userID uint) ([]OrgMembership, error) {
	var out wireOrgMembershipList
	if err := c.get(ctx, fmt.Sprintf("/v1/auth/users/%d/org-memberships", userID), &out); err != nil {
		return nil, err
	}
	if out.Items == nil {
		return []OrgMembership{}, nil
	}
	return out.Items, nil
}

func (c *Client) ListOrgs(ctx context.Context, filter ListOrgsFilter) (OrgPage, error) {
	var out OrgPage
	if err := c.get(ctx, "/v1/auth/orgs"+orgFilterQuery(filter), &out); err != nil {
		return OrgPage{}, err
	}
	if out.Items == nil {
		out.Items = []Organization{}
	}
	return out, nil
}

func (c *Client) CreateOrg(ctx context.Context, input CreateOrgInput) (Organization, error) {
	var out Organization
	if err := c.post(ctx, "/v1/auth/orgs", input, &out); err != nil {
		return Organization{}, err
	}
	return out, nil
}

func (c *Client) UpdateOrg(ctx context.Context, orgID uint, input UpdateOrgInput) (Organization, error) {
	var out Organization
	if err := c.patch(ctx, fmt.Sprintf("/v1/auth/orgs/%d", orgID), input, &out); err != nil {
		return Organization{}, err
	}
	return out, nil
}

func (c *Client) ListOrgMembers(ctx context.Context, orgID uint) ([]OrganizationMember, error) {
	var out wireOrgMemberList
	if err := c.get(ctx, fmt.Sprintf("/v1/auth/orgs/%d/members", orgID), &out); err != nil {
		return nil, err
	}
	if out.Items == nil {
		return []OrganizationMember{}, nil
	}
	return out.Items, nil
}

func (c *Client) AddOrgMember(ctx context.Context, orgID uint, input OrgMemberInput) (OrganizationMember, error) {
	var out OrganizationMember
	if err := c.post(ctx, fmt.Sprintf("/v1/auth/orgs/%d/members", orgID), input, &out); err != nil {
		return OrganizationMember{}, err
	}
	return out, nil
}

func (c *Client) UpdateOrgMember(ctx context.Context, orgID uint, userID uint, input OrgMemberInput) (OrganizationMember, error) {
	var out OrganizationMember
	if err := c.patch(ctx, fmt.Sprintf("/v1/auth/orgs/%d/members/%d", orgID, userID), input, &out); err != nil {
		return OrganizationMember{}, err
	}
	return out, nil
}

func (c *Client) RemoveOrgMember(ctx context.Context, orgID uint, userID uint) (bool, error) {
	var out removedResponse
	if err := c.do(ctx, http.MethodDelete, fmt.Sprintf("/v1/auth/orgs/%d/members/%d", orgID, userID), nil, &out, http.StatusOK); err != nil {
		return false, err
	}
	return out.Removed, nil
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	return c.do(ctx, http.MethodGet, path, nil, out, http.StatusOK)
}

func (c *Client) post(ctx context.Context, path string, in any, out any) error {
	return c.do(ctx, http.MethodPost, path, in, out, http.StatusCreated)
}

func (c *Client) patch(ctx context.Context, path string, in any, out any) error {
	return c.do(ctx, http.MethodPatch, path, in, out, http.StatusOK)
}

func (c *Client) put(ctx context.Context, path string, in any, out any) error {
	return c.do(ctx, http.MethodPut, path, in, out, http.StatusOK)
}

func (c *Client) do(ctx context.Context, method string, path string, in any, out any, successStatus int) error {
	if c == nil {
		return fmt.Errorf("%w: nil auth identity client", ErrInvalidConfig)
	}
	var body io.Reader
	if in != nil {
		payload, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(payload)
	}
	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	if in != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if c.managementToken != "" {
		request.Header.Set("Authorization", "Bearer "+c.managementToken)
	}
	response, err := c.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	switch response.StatusCode {
	case successStatus:
	case http.StatusNotFound:
		_, _ = io.Copy(io.Discard, response.Body)
		return notFoundError(path)
	case http.StatusUnauthorized:
		_, _ = io.Copy(io.Discard, response.Body)
		return ErrUnauthorized
	case http.StatusConflict:
		_, _ = io.Copy(io.Discard, response.Body)
		return ErrConflict
	case http.StatusBadRequest:
		_, _ = io.Copy(io.Discard, response.Body)
		return ErrBadRequest
	default:
		_, _ = io.Copy(io.Discard, response.Body)
		return fmt.Errorf("auth identity request failed: status %d", response.StatusCode)
	}
	if out != nil {
		if err := json.NewDecoder(response.Body).Decode(out); err != nil {
			return err
		}
	} else {
		_, _ = io.Copy(io.Discard, response.Body)
	}
	return nil
}

func userProfileFromWire(out wireUserProfile) domainidentity.UserProfile {
	return domainidentity.UserProfile{
		ID:              out.ID,
		Username:        out.Username,
		SystemRole:      out.SystemRole,
		PrimaryEmail:    out.PrimaryEmail,
		PrimaryPhone:    out.PrimaryPhone,
		DisplayName:     out.DisplayName,
		AvatarURL:       out.AvatarURL,
		Locale:          out.Locale,
		Status:          out.Status,
		EmailVerifiedAt: out.EmailVerifiedAt,
	}
}

func userFilterQuery(filter ListUsersFilter) string {
	values := make([]string, 0)
	addQuery(&values, "query", filter.Query)
	if filter.UserID != nil {
		addQuery(&values, "user_id", fmt.Sprintf("%d", *filter.UserID))
	}
	addQuery(&values, "system_role", filter.SystemRole)
	addQuery(&values, "status", filter.Status)
	if filter.Page > 0 {
		addQuery(&values, "page", fmt.Sprintf("%d", filter.Page))
	}
	if filter.PageSize > 0 {
		addQuery(&values, "page_size", fmt.Sprintf("%d", filter.PageSize))
	}
	return queryString(values)
}

func orgFilterQuery(filter ListOrgsFilter) string {
	values := make([]string, 0)
	addQuery(&values, "query", filter.Query)
	if filter.OrgID != nil {
		addQuery(&values, "org_id", fmt.Sprintf("%d", *filter.OrgID))
	}
	if filter.UserID != nil {
		addQuery(&values, "user_id", fmt.Sprintf("%d", *filter.UserID))
	}
	addQuery(&values, "status", filter.Status)
	addQuery(&values, "plan", filter.Plan)
	if filter.IsPersonal != nil {
		addQuery(&values, "is_personal", fmt.Sprintf("%t", *filter.IsPersonal))
	}
	if filter.Page > 0 {
		addQuery(&values, "page", fmt.Sprintf("%d", filter.Page))
	}
	if filter.PageSize > 0 {
		addQuery(&values, "page_size", fmt.Sprintf("%d", filter.PageSize))
	}
	return queryString(values)
}

func addQuery(values *[]string, key string, value string) {
	value = strings.TrimSpace(value)
	if value == "" {
		return
	}
	*values = append(*values, url.QueryEscape(key)+"="+url.QueryEscape(value))
}

func queryString(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return "?" + strings.Join(values, "&")
}

func notFoundError(path string) error {
	if strings.Contains(path, "/orgs") {
		return ErrOrgNotFound
	}
	return ErrUserNotFound
}

package authprovider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type OpaqueKeyProvider struct {
	baseURL string
	client  *http.Client
}

type IntrospectionRequest struct {
	Token    string    `json:"token"`
	Action   string    `json:"action,omitempty"`
	Resource *Resource `json:"resource,omitempty"`
}

type IntrospectionResponse struct {
	Active      bool              `json:"active"`
	TokenType   string            `json:"token_type,omitempty"`
	Principal   *wirePrincipal    `json:"principal,omitempty"`
	Claims      map[string]string `json:"claims,omitempty"`
	AuthContext *wireAuthContext  `json:"auth_context,omitempty"`
}

type wirePrincipal struct {
	ID          string `json:"id,omitempty"`
	Subject     string `json:"subject,omitempty"`
	Type        string `json:"type,omitempty"`
	Kind        string `json:"kind,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
}

type wireAuthContext struct {
	Principal *wirePrincipal    `json:"principal,omitempty"`
	Claims    map[string]string `json:"claims,omitempty"`
	TokenID   string            `json:"token_id,omitempty"`
	Local     *LocalContext     `json:"local,omitempty"`
	Roles     []string          `json:"roles,omitempty"`
	Scopes    []string          `json:"scopes,omitempty"`
	TenantID  string            `json:"tenant_id,omitempty"`
	OrgID     string            `json:"org_id,omitempty"`
	RawClaims map[string]any    `json:"-"`
}

func NewOpaqueKeyProvider(baseURL string, client *http.Client) (*OpaqueKeyProvider, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("auth service base url is required")
	}
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &OpaqueKeyProvider{baseURL: baseURL, client: client}, nil
}

func (p *OpaqueKeyProvider) Mode() Mode {
	return ModeOpaqueKey
}

func (p *OpaqueKeyProvider) Authenticate(ctx context.Context, request Request) (AuthContext, error) {
	token := strings.TrimSpace(request.Token)
	if token == "" || !strings.HasPrefix(token, "sk-") {
		return InactiveContext(ModeOpaqueKey, "missing-token"), nil
	}
	payload, err := json.Marshal(IntrospectionRequest{
		Token:    token,
		Action:   request.Action,
		Resource: request.Resource,
	})
	if err != nil {
		return AuthContext{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/v1/auth/introspect", bytes.NewReader(payload))
	if err != nil {
		return AuthContext{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	res, err := p.client.Do(httpReq)
	if err != nil {
		return AuthContext{}, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, res.Body)
		return AuthContext{}, fmt.Errorf("%w: introspection status %d", ErrAuthenticationFailed, res.StatusCode)
	}
	var out IntrospectionResponse
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return AuthContext{}, err
	}
	return authContextFromIntrospection(out), nil
}

func (p *OpaqueKeyProvider) Authorize(_ context.Context, auth AuthContext, _ string, _ *Resource) (Decision, error) {
	return AllowIfAuthenticated(auth), nil
}

func authContextFromIntrospection(result IntrospectionResponse) AuthContext {
	if !result.Active {
		return InactiveContext(ModeOpaqueKey, "inactive")
	}
	principal := result.Principal
	if result.AuthContext != nil && result.AuthContext.Principal != nil {
		principal = result.AuthContext.Principal
	}
	if principal == nil {
		return InactiveContext(ModeOpaqueKey, "missing-principal")
	}
	claims := cloneClaims(result.Claims)
	if result.AuthContext != nil && len(result.AuthContext.Claims) > 0 {
		claims = cloneClaims(result.AuthContext.Claims)
	}
	context := AuthContext{
		Authenticated: true,
		Mode:          ModeOpaqueKey,
		Principal: Principal{
			Kind:        principalKind(principal.Kind, principal.Type),
			Subject:     firstNonEmpty(principal.Subject, principal.ID),
			DisplayName: principal.DisplayName,
		},
		Claims: claims,
	}
	if result.AuthContext != nil {
		context.TokenID = result.AuthContext.TokenID
		context.Local = result.AuthContext.Local
		context.Roles = cloneStrings(result.AuthContext.Roles)
		context.Scopes = cloneStrings(result.AuthContext.Scopes)
		context.TenantID = result.AuthContext.TenantID
		context.OrgID = result.AuthContext.OrgID
	}
	return context
}

func principalKind(kind string, typ string) PrincipalKind {
	value := strings.TrimSpace(kind)
	if value == "" {
		value = strings.TrimSpace(typ)
	}
	switch value {
	case "user", "cloud-user":
		return PrincipalCloudUser
	case "agent":
		return PrincipalAgent
	case "service":
		return PrincipalService
	case "local-owner":
		return PrincipalLocalOwner
	case "test":
		return PrincipalTest
	default:
		return PrincipalAnonymous
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

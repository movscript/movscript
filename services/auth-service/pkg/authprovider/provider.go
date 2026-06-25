package authprovider

import (
	"context"
	"errors"
	"strings"
)

type Mode string

const (
	ModeOpaqueKey  Mode = "opaque-key"
	ModeLocalOwner Mode = "local-owner"
	ModeNoAuth     Mode = "no-auth"
	ModeTest       Mode = "test"
)

type PrincipalKind string

const (
	PrincipalCloudUser  PrincipalKind = "cloud-user"
	PrincipalAgent      PrincipalKind = "agent"
	PrincipalService    PrincipalKind = "service"
	PrincipalLocalOwner PrincipalKind = "local-owner"
	PrincipalAnonymous  PrincipalKind = "anonymous"
	PrincipalTest       PrincipalKind = "test"
)

var ErrAuthenticationFailed = errors.New("auth provider authentication failed")

type Principal struct {
	Kind        PrincipalKind `json:"kind"`
	Subject     string        `json:"subject"`
	DisplayName string        `json:"display_name,omitempty"`
}

type LocalContext struct {
	HomeID          string `json:"home_id,omitempty"`
	WorkspaceID     string `json:"workspace_id,omitempty"`
	DeviceSessionID string `json:"device_session_id,omitempty"`
}

type AuthContext struct {
	Authenticated bool              `json:"authenticated"`
	Mode          Mode              `json:"mode"`
	Principal     Principal         `json:"principal"`
	TenantID      string            `json:"tenant_id,omitempty"`
	OrgID         string            `json:"org_id,omitempty"`
	Local         *LocalContext     `json:"local,omitempty"`
	Roles         []string          `json:"roles,omitempty"`
	Scopes        []string          `json:"scopes,omitempty"`
	Claims        map[string]string `json:"claims,omitempty"`
	TokenID       string            `json:"token_id,omitempty"`
}

type Resource struct {
	Type       string         `json:"type"`
	ID         string         `json:"id,omitempty"`
	Attributes map[string]any `json:"attributes,omitempty"`
}

type Request struct {
	Token    string    `json:"token,omitempty"`
	Action   string    `json:"action,omitempty"`
	Resource *Resource `json:"resource,omitempty"`
}

type Decision struct {
	Allowed bool   `json:"allowed"`
	Reason  string `json:"reason,omitempty"`
}

type Provider interface {
	Mode() Mode
	Authenticate(ctx context.Context, request Request) (AuthContext, error)
	Authorize(ctx context.Context, auth AuthContext, action string, resource *Resource) (Decision, error)
}

func InactiveContext(mode Mode, reason string) AuthContext {
	kind := PrincipalAnonymous
	if mode == ModeTest {
		kind = PrincipalTest
	}
	return AuthContext{
		Authenticated: false,
		Mode:          mode,
		Principal: Principal{
			Kind:    kind,
			Subject: strings.TrimSpace(reason),
		},
		Claims: map[string]string{},
	}
}

func AllowIfAuthenticated(auth AuthContext) Decision {
	if auth.Authenticated {
		return Decision{Allowed: true}
	}
	return Decision{Allowed: false, Reason: "not-authenticated"}
}

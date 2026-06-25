package authprovider

import (
	"context"
	"strings"
)

type LocalOwnerOptions struct {
	Subject         string
	HomeID          string
	WorkspaceID     string
	DeviceSessionID string
	Roles           []string
	Scopes          []string
	Claims          map[string]string
}

type LocalOwnerProvider struct {
	options LocalOwnerOptions
}

func NewLocalOwnerProvider(options LocalOwnerOptions) *LocalOwnerProvider {
	if strings.TrimSpace(options.Subject) == "" {
		options.Subject = "local-owner"
	}
	if len(options.Roles) == 0 {
		options.Roles = []string{"owner"}
	}
	if len(options.Scopes) == 0 {
		options.Scopes = []string{"local:*"}
	}
	return &LocalOwnerProvider{options: options}
}

func (p *LocalOwnerProvider) Mode() Mode {
	return ModeLocalOwner
}

func (p *LocalOwnerProvider) Authenticate(_ context.Context, _ Request) (AuthContext, error) {
	return AuthContext{
		Authenticated: true,
		Mode:          ModeLocalOwner,
		Principal: Principal{
			Kind:    PrincipalLocalOwner,
			Subject: p.options.Subject,
		},
		Local: &LocalContext{
			HomeID:          p.options.HomeID,
			WorkspaceID:     p.options.WorkspaceID,
			DeviceSessionID: p.options.DeviceSessionID,
		},
		Roles:  cloneStrings(p.options.Roles),
		Scopes: cloneStrings(p.options.Scopes),
		Claims: cloneClaims(p.options.Claims),
	}, nil
}

func (p *LocalOwnerProvider) Authorize(_ context.Context, auth AuthContext, _ string, _ *Resource) (Decision, error) {
	return AllowIfAuthenticated(auth), nil
}

type NoAuthProvider struct {
	subject string
}

func NewNoAuthProvider(subject string) *NoAuthProvider {
	subject = strings.TrimSpace(subject)
	if subject == "" {
		subject = "anonymous"
	}
	return &NoAuthProvider{subject: subject}
}

func (p *NoAuthProvider) Mode() Mode {
	return ModeNoAuth
}

func (p *NoAuthProvider) Authenticate(_ context.Context, _ Request) (AuthContext, error) {
	return AuthContext{
		Authenticated: false,
		Mode:          ModeNoAuth,
		Principal: Principal{
			Kind:    PrincipalAnonymous,
			Subject: p.subject,
		},
		Claims: map[string]string{},
	}, nil
}

func (p *NoAuthProvider) Authorize(_ context.Context, _ AuthContext, _ string, _ *Resource) (Decision, error) {
	return Decision{Allowed: false, Reason: "no-auth"}, nil
}

func cloneStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	next := make([]string, len(values))
	copy(next, values)
	return next
}

func cloneClaims(claims map[string]string) map[string]string {
	if len(claims) == 0 {
		return map[string]string{}
	}
	next := make(map[string]string, len(claims))
	for key, value := range claims {
		next[key] = value
	}
	return next
}

package overview

import (
	"context"
	"errors"
	"time"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"gorm.io/gorm"
)

var ErrIdentityUnavailable = errors.New("admin overview identity manager is required")

type CountSummary struct {
	Total int64 `json:"total"`
}

type UserSummary struct {
	Total    int64 `json:"total"`
	Active   int64 `json:"active"`
	Disabled int64 `json:"disabled"`
}

type OrgSummary struct {
	Total     int64 `json:"total"`
	Suspended int64 `json:"suspended"`
}

type ModelSummary struct {
	Credentials           int64 `json:"credentials"`
	EnabledCredentials    int64 `json:"enabled_credentials"`
	CatalogEntries        int64 `json:"catalog_entries"`
	EnabledCatalogEntries int64 `json:"enabled_catalog_entries"`
	RouteBindings         int64 `json:"route_bindings"`
	EnabledRouteBindings  int64 `json:"enabled_route_bindings"`
}

type JobSummary struct {
	Total     int64 `json:"total"`
	Pending   int64 `json:"pending"`
	Running   int64 `json:"running"`
	Succeeded int64 `json:"succeeded"`
	Failed    int64 `json:"failed"`
	Cancelled int64 `json:"cancelled"`
}

type UsageSummary struct {
	Records int64   `json:"records"`
	Cost7D  float64 `json:"cost_7d"`
	Cost30D float64 `json:"cost_30d"`
}

type ResourceSummary struct {
	Total int64 `json:"total"`
	Bytes int64 `json:"bytes"`
}

type Summary struct {
	GeneratedAt string          `json:"generated_at"`
	Users       UserSummary     `json:"users"`
	Orgs        OrgSummary      `json:"orgs"`
	Projects    CountSummary    `json:"projects"`
	Models      ModelSummary    `json:"models"`
	Jobs        JobSummary      `json:"jobs"`
	Usage       UsageSummary    `json:"usage"`
	Resources   ResourceSummary `json:"resources"`
	Audits      CountSummary    `json:"audits"`
}

type Service struct {
	repo     repository
	identity identityDirectory
	now      func() time.Time
}

type identityDirectory interface {
	authidentity.UserDirectory
	authidentity.OrgDirectory
}

func NewService(db *gorm.DB, identity identityDirectory) *Service {
	return &Service{
		repo:     &gormRepository{db: db},
		identity: identity,
		now:      func() time.Time { return time.Now().UTC() },
	}
}

func (s *Service) Summary(ctx context.Context) (Summary, error) {
	now := s.now()
	summary, err := s.repo.Summary(ctx, now)
	if err != nil {
		return Summary{}, err
	}
	identitySummary, err := s.identitySummary(ctx)
	if err != nil {
		return Summary{}, err
	}
	summary.Users = identitySummary.Users
	summary.Orgs = identitySummary.Orgs
	summary.GeneratedAt = now.Format(time.RFC3339Nano)
	return summary, nil
}

type identitySummary struct {
	Users UserSummary
	Orgs  OrgSummary
}

func (s *Service) identitySummary(ctx context.Context) (identitySummary, error) {
	if s.identity == nil {
		return identitySummary{}, ErrIdentityUnavailable
	}
	totalUsers, err := s.userCount(ctx, "")
	if err != nil {
		return identitySummary{}, err
	}
	activeUsers, err := s.userCount(ctx, domainidentity.UserStatusActive)
	if err != nil {
		return identitySummary{}, err
	}
	totalOrgs, err := s.orgCount(ctx, "")
	if err != nil {
		return identitySummary{}, err
	}
	suspendedOrgs, err := s.orgCount(ctx, "suspended")
	if err != nil {
		return identitySummary{}, err
	}
	disabledUsers := totalUsers - activeUsers
	if disabledUsers < 0 {
		disabledUsers = 0
	}
	return identitySummary{
		Users: UserSummary{Total: totalUsers, Active: activeUsers, Disabled: disabledUsers},
		Orgs:  OrgSummary{Total: totalOrgs, Suspended: suspendedOrgs},
	}, nil
}

func (s *Service) userCount(ctx context.Context, status string) (int64, error) {
	page, err := s.identity.ListUsers(ctx, authidentity.ListUsersFilter{Status: status, Page: 1, PageSize: 1})
	if err != nil {
		return 0, err
	}
	return page.Total, nil
}

func (s *Service) orgCount(ctx context.Context, status string) (int64, error) {
	page, err := s.identity.ListOrgs(ctx, authidentity.ListOrgsFilter{Status: status, Page: 1, PageSize: 1})
	if err != nil {
		return 0, err
	}
	return page.Total, nil
}

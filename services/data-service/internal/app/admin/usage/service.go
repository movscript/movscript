package usage

import (
	"context"
	"time"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

type Service struct {
	reporter providercontract.AIGatewayUsageReporter
	identity authidentity.Reader
}

func NewService(db *gorm.DB, identity ...authidentity.Reader) *Service {
	return NewServiceWithReporter(&gormRepository{db: db}, identity...)
}

func NewServiceWithReporter(reporter providercontract.AIGatewayUsageReporter, identity ...authidentity.Reader) *Service {
	service := &Service{reporter: reporter}
	if len(identity) > 0 {
		service.identity = identity[0]
	}
	return service
}

type ListFilter struct {
	UserID        string
	OrgID         string
	ProjectID     string
	ModelID       string
	ProviderID    string
	GatewayKeyID  string
	OperationType string
	Since         *time.Time
	Until         *time.Time
	Page          int
	PageSize      int
}

type Page struct {
	Items    []Log `json:"items"`
	Total    int64 `json:"total"`
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
}

type UsageTotals struct {
	Records           int64   `json:"records"`
	Cost              float64 `json:"cost"`
	InputTokens       int64   `json:"input_tokens"`
	OutputTokens      int64   `json:"output_tokens"`
	CachedInputTokens int64   `json:"cached_input_tokens"`
	ReasoningTokens   int64   `json:"reasoning_tokens"`
	DurationSec       int64   `json:"duration_sec"`
	ImageCount        int64   `json:"image_count"`
}

type OperationSummary struct {
	OperationType string `json:"operation_type"`
	UsageTotals
}

type ModelSummary struct {
	AIModelCatalogEntryID *uint            `json:"ai_model_catalog_entry_id,omitempty"`
	AIModelCatalogEntry   *CatalogEntryRef `gorm:"-" json:"ai_model_catalog_entry,omitempty"`
	UsageTotals
}

type UserSummary struct {
	UserID uint     `json:"user_id"`
	User   *UserRef `gorm:"-" json:"user,omitempty"`
	UsageTotals
}

type Summary struct {
	Totals      UsageTotals        `json:"totals"`
	Operations  []OperationSummary `json:"operations"`
	TopModels   []ModelSummary     `json:"top_models"`
	TopUsers    []UserSummary      `json:"top_users"`
	GeneratedAt time.Time          `json:"generated_at"`
}

type UserRef struct {
	ID         uint   `json:"ID"`
	Username   string `json:"username"`
	SystemRole string `json:"system_role"`
}

type CatalogEntryRef struct {
	ID            uint   `json:"ID"`
	PublicModelID string `json:"public_model_id"`
	DisplayName   string `json:"display_name"`
	ShortName     string `json:"short_name"`
}

type Log struct {
	ID                    uint             `json:"ID"`
	UserID                uint             `json:"user_id"`
	OrgID                 *uint            `json:"org_id,omitempty"`
	AIModelCatalogEntryID *uint            `json:"ai_model_catalog_entry_id,omitempty"`
	RouteBindingID        *uint            `json:"route_binding_id,omitempty"`
	UsageReservationID    *uint            `json:"usage_reservation_id,omitempty"`
	GatewayAPIKeyID       *uint            `json:"gateway_api_key_id,omitempty"`
	ProjectID             *uint            `json:"project_id,omitempty"`
	OperationType         string           `json:"operation_type"`
	InputTokens           int              `json:"input_tokens"`
	OutputTokens          int              `json:"output_tokens"`
	CachedInputTokens     int              `json:"cached_input_tokens"`
	ReasoningTokens       int              `json:"reasoning_tokens"`
	DurationSec           int              `json:"duration_sec"`
	ImageCount            int              `json:"image_count"`
	Cost                  float64          `json:"cost"`
	ProviderID            string           `json:"provider_id,omitempty"`
	ProviderModelID       string           `json:"provider_model_id,omitempty"`
	User                  *UserRef         `json:"user,omitempty"`
	AIModelCatalogEntry   *CatalogEntryRef `json:"ai_model_catalog_entry,omitempty"`
	CreatedAt             time.Time        `json:"CreatedAt"`
	UpdatedAt             time.Time        `json:"UpdatedAt"`
}

func (s *Service) List(ctx context.Context, filter ListFilter) (Page, error) {
	page, err := s.reporter.ListGatewayUsageLogs(ctx, usageFilterToContract(filter))
	if err != nil {
		return Page{}, err
	}
	out := usagePageFromContract(page)
	s.enrichLogs(ctx, out.Items)
	return out, nil
}

func (s *Service) Export(ctx context.Context, filter ListFilter, limit int) ([]Log, error) {
	if limit <= 0 {
		limit = 1000
	}
	if limit > 5000 {
		limit = 5000
	}
	rows, err := s.reporter.ExportGatewayUsageLogs(ctx, usageFilterToContract(filter), limit)
	if err != nil {
		return nil, err
	}
	out := usageLogsFromContract(rows)
	s.enrichLogs(ctx, out)
	return out, nil
}

func (s *Service) Summary(ctx context.Context, filter ListFilter) (Summary, error) {
	summary, err := s.reporter.SummarizeGatewayUsage(ctx, usageFilterToContract(filter))
	if err != nil {
		return Summary{}, err
	}
	out := usageSummaryFromContract(summary)
	if out.GeneratedAt.IsZero() {
		out.GeneratedAt = time.Now().UTC()
	}
	s.enrichSummary(ctx, &out)
	return out, nil
}

func (s *Service) enrichLogs(ctx context.Context, rows []Log) {
	if s.identity == nil {
		return
	}
	userIDs := make([]uint, 0, len(rows))
	seen := make(map[uint]struct{})
	for _, row := range rows {
		if row.UserID == 0 || row.User != nil {
			continue
		}
		if _, ok := seen[row.UserID]; ok {
			continue
		}
		seen[row.UserID] = struct{}{}
		userIDs = append(userIDs, row.UserID)
	}
	users := s.userRefs(ctx, userIDs)
	for i := range rows {
		if rows[i].User == nil {
			if ref, ok := users[rows[i].UserID]; ok {
				rows[i].User = &ref
			}
		}
	}
}

func (s *Service) enrichSummary(ctx context.Context, summary *Summary) {
	if s.identity == nil || summary == nil {
		return
	}
	userIDs := make([]uint, 0, len(summary.TopUsers))
	seen := make(map[uint]struct{})
	for _, row := range summary.TopUsers {
		if row.UserID == 0 || row.User != nil {
			continue
		}
		if _, ok := seen[row.UserID]; ok {
			continue
		}
		seen[row.UserID] = struct{}{}
		userIDs = append(userIDs, row.UserID)
	}
	users := s.userRefs(ctx, userIDs)
	for i := range summary.TopUsers {
		if summary.TopUsers[i].User == nil {
			if ref, ok := users[summary.TopUsers[i].UserID]; ok {
				summary.TopUsers[i].User = &ref
			}
		}
	}
}

func (s *Service) userRefs(ctx context.Context, userIDs []uint) map[uint]UserRef {
	out := make(map[uint]UserRef, len(userIDs))
	for _, userID := range userIDs {
		profile, err := s.identity.UserProfile(ctx, userID)
		if err != nil {
			continue
		}
		out[userID] = userRefFromProfile(profile)
	}
	return out
}

func userRefFromProfile(profile domainidentity.UserProfile) UserRef {
	return UserRef{ID: profile.ID, Username: profile.Username, SystemRole: profile.SystemRole}
}

func usageFilterToContract(filter ListFilter) providercontract.AIGatewayUsageLogFilter {
	return providercontract.AIGatewayUsageLogFilter{
		UserID:        filter.UserID,
		OrgID:         filter.OrgID,
		ProjectID:     filter.ProjectID,
		ModelID:       filter.ModelID,
		ProviderID:    filter.ProviderID,
		GatewayKeyID:  filter.GatewayKeyID,
		OperationType: filter.OperationType,
		Since:         filter.Since,
		Until:         filter.Until,
		Page:          filter.Page,
		PageSize:      filter.PageSize,
	}
}

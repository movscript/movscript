package usage

import (
	"context"
	"time"

	"gorm.io/gorm"
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type ListFilter struct {
	UserID        string
	OrgID         string
	ProjectID     string
	ModelConfigID string
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
	Records      int64   `json:"records"`
	Cost         float64 `json:"cost"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	DurationSec  int64   `json:"duration_sec"`
	ImageCount   int64   `json:"image_count"`
}

type OperationSummary struct {
	OperationType string `json:"operation_type"`
	UsageTotals
}

type ModelSummary struct {
	ModelConfigID uint            `json:"model_config_id"`
	AIModelConfig *ModelConfigRef `gorm:"-" json:"ai_model_config,omitempty"`
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

type ModelConfigRef struct {
	ID                uint   `json:"ID"`
	CredentialID      uint   `json:"credential_id"`
	ModelDefID        string `json:"model_def_id"`
	ModelIDOverride   string `json:"model_id_override"`
	CustomDisplayName string `json:"custom_display_name"`
	ShortName         string `json:"short_name"`
}

type Log struct {
	ID                 uint            `json:"ID"`
	UserID             uint            `json:"user_id"`
	OrgID              *uint           `json:"org_id,omitempty"`
	AIModelConfigID    uint            `json:"ai_model_config_id"`
	UsageReservationID *uint           `json:"usage_reservation_id,omitempty"`
	GatewayAPIKeyID    *uint           `json:"gateway_api_key_id,omitempty"`
	ProjectID          *uint           `json:"project_id,omitempty"`
	OperationType      string          `json:"operation_type"`
	InputTokens        int             `json:"input_tokens"`
	OutputTokens       int             `json:"output_tokens"`
	DurationSec        int             `json:"duration_sec"`
	ImageCount         int             `json:"image_count"`
	Cost               float64         `json:"cost"`
	User               *UserRef        `json:"user,omitempty"`
	AIModelConfig      *ModelConfigRef `json:"ai_model_config,omitempty"`
	CreatedAt          time.Time       `json:"CreatedAt"`
	UpdatedAt          time.Time       `json:"UpdatedAt"`
}

func (s *Service) List(ctx context.Context, filter ListFilter) (Page, error) {
	return s.repo.ListLogs(ctx, filter)
}

func (s *Service) Export(ctx context.Context, filter ListFilter, limit int) ([]Log, error) {
	if limit <= 0 {
		limit = 1000
	}
	if limit > 5000 {
		limit = 5000
	}
	return s.repo.ExportLogs(ctx, filter, limit)
}

func (s *Service) Summary(ctx context.Context, filter ListFilter) (Summary, error) {
	summary, err := s.repo.Summary(ctx, filter)
	if err != nil {
		return Summary{}, err
	}
	summary.GeneratedAt = time.Now().UTC()
	return summary, nil
}

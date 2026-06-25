package user

import (
	"context"
	"errors"
	"time"

	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	"gorm.io/gorm"
)

var (
	ErrUserNotFound = errors.New("user not found")
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type Detail struct {
	User     domainidentity.UserProfile `json:"user"`
	Orgs     []OrgMembership            `json:"orgs"`
	Projects []ProjectMembership        `json:"projects"`
	Usage    UsageSummary               `json:"usage"`
	Audit    AuditSummary               `json:"audit"`
}

type OrgMembership struct {
	ID       uint      `json:"ID"`
	Name     string    `json:"name"`
	Slug     string    `json:"slug"`
	Plan     string    `json:"plan"`
	Status   string    `json:"status"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

type ProjectMembership struct {
	ID       uint      `json:"ID"`
	Name     string    `json:"name"`
	OrgID    *uint     `json:"org_id,omitempty"`
	OwnerID  uint      `json:"owner_id"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

type UsageSummary struct {
	Calls        int64   `json:"calls"`
	Cost         float64 `json:"cost"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	Images       int64   `json:"images"`
	DurationSec  int64   `json:"duration_sec"`
}

type AuditSummary struct {
	Records    int64      `json:"records"`
	LastAction string     `json:"last_action,omitempty"`
	LastAt     *time.Time `json:"last_at,omitempty"`
}

func (s *Service) Detail(ctx context.Context, id uint) (Detail, error) {
	if id == 0 {
		return Detail{}, ErrUserNotFound
	}
	return s.repo.Detail(ctx, id)
}

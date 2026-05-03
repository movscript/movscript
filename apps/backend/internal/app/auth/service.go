package auth

import (
	"context"
	"errors"

	orgapp "github.com/movscript/movscript/internal/app/org"
	"github.com/movscript/movscript/internal/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrConflict           = errors.New("auth conflict")
	ErrInvalidCredentials = errors.New("invalid credentials")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type RegisterInput struct {
	Username string
	Password string
}

type LoginInput struct {
	Username string
	Password string
}

type OrgMembershipSummary struct {
	OrgID      uint   `json:"org_id"`
	OrgName    string `json:"org_name"`
	OrgSlug    string `json:"org_slug"`
	IsPersonal bool   `json:"is_personal"`
	Role       string `json:"role"`
}

func (s *Service) Register(ctx context.Context, input RegisterInput) (model.User, error) {
	var existing model.User
	if s.db.WithContext(ctx).Where("username = ?", input.Username).First(&existing).Error == nil {
		return model.User{}, ErrConflict
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
	if err != nil {
		return model.User{}, err
	}

	var count int64
	if err := s.db.WithContext(ctx).Model(&model.User{}).Count(&count).Error; err != nil {
		return model.User{}, err
	}
	role := "user"
	if count == 0 {
		role = "super_admin"
	}

	u := model.User{
		Username:     input.Username,
		PasswordHash: string(hash),
		SystemRole:   role,
	}
	if err := s.db.WithContext(ctx).Create(&u).Error; err != nil {
		return model.User{}, err
	}
	_ = orgapp.CreatePersonalOrg(s.db.WithContext(ctx), &u)
	return u, nil
}

func (s *Service) Login(ctx context.Context, input LoginInput) (model.User, error) {
	var u model.User
	if err := s.db.WithContext(ctx).Where("username = ?", input.Username).First(&u).Error; err != nil {
		return model.User{}, ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(input.Password)); err != nil {
		return model.User{}, ErrInvalidCredentials
	}
	return u, nil
}

func (s *Service) OrgMemberships(ctx context.Context, userID uint) ([]OrgMembershipSummary, error) {
	members := make([]model.OrganizationMember, 0)
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Find(&members).Error; err != nil {
		return nil, err
	}

	memberships := make([]OrgMembershipSummary, 0, len(members))
	for _, m := range members {
		var org model.Organization
		if s.db.WithContext(ctx).First(&org, m.OrgID).Error != nil {
			continue
		}
		memberships = append(memberships, OrgMembershipSummary{
			OrgID:      org.ID,
			OrgName:    org.Name,
			OrgSlug:    org.Slug,
			IsPersonal: org.IsPersonal,
			Role:       m.Role,
		})
	}
	return memberships, nil
}

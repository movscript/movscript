package user

import (
	"context"

	dto "github.com/movscript/movscript/internal/app/dto"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	"gorm.io/gorm"
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type ListFilter struct {
	Query string
}

func (s *Service) List(ctx context.Context, filter ListFilter) ([]domainauth.UserProfile, error) {
	return s.repo.ListUsers(ctx, filter)
}

func (s *Service) Create(ctx context.Context, input dto.UserCreateInput) (domainauth.UserProfile, error) {
	u := domainauth.RegisteredUser{
		Username: input.Username,
		Status:   domainauth.UserStatusActive,
	}
	if err := s.repo.CreateUser(ctx, &u); err != nil {
		return domainauth.UserProfile{}, err
	}
	return domainauth.UserProfile{
		ID:              u.ID,
		Username:        u.Username,
		SystemRole:      u.SystemRole,
		PrimaryEmail:    u.PrimaryEmail,
		PrimaryPhone:    u.PrimaryPhone,
		DisplayName:     u.DisplayName,
		AvatarURL:       u.AvatarURL,
		Locale:          u.Locale,
		Status:          u.Status,
		EmailVerifiedAt: u.EmailVerifiedAt,
	}, nil
}

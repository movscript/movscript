package auth

import (
	"context"
	"errors"
	"strconv"
	"time"

	orgapp "github.com/movscript/movscript/internal/app/org"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	UsernameExists(ctx context.Context, username string) (bool, error)
	EmailExists(ctx context.Context, email string) (bool, error)
	CreateUser(ctx context.Context, user *domainauth.RegisteredUser) (domainauth.UserProfile, error)
	SuperAdminCount(ctx context.Context) (int64, error)
	FindSuperAdmin(ctx context.Context) (domainauth.RegisteredUser, error)
	UpdateUser(ctx context.Context, userID uint, updates map[string]any) error
	FindAvailableUsername(ctx context.Context, base string) (string, error)
	FindUserForLogin(ctx context.Context, username string, email string) (domainauth.RegisteredUser, error)
	FindUserByID(ctx context.Context, userID uint) (domainauth.UserProfile, error)
	FindUserModelByID(ctx context.Context, userID uint) (persistencemodel.User, error)
	CreateChallenge(ctx context.Context, challenge *domainauth.AuthChallenge) error
	FindChallenge(ctx context.Context, id uint) (domainauth.AuthChallenge, error)
	IncrementChallengeAttempts(ctx context.Context, challenge *domainauth.AuthChallenge) error
	ConsumeChallenge(ctx context.Context, challenge *domainauth.AuthChallenge, consumedAt time.Time) error
	FindUserByEmail(ctx context.Context, email string) (domainauth.UserProfile, error)
	CreateSession(ctx context.Context, session *persistencemodel.AuthSession) error
	FindActiveSession(ctx context.Context, tokenHash string, now time.Time) (persistencemodel.AuthSession, error)
	TouchSession(ctx context.Context, session *persistencemodel.AuthSession, seenAt time.Time) error
	RevokeSession(ctx context.Context, tokenHash string, revokedAt time.Time) error
	OrgMemberships(ctx context.Context, userID uint) ([]OrgMembershipSummary, error)
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) UsernameExists(ctx context.Context, username string) (bool, error) {
	var user persistencemodel.User
	err := r.db.WithContext(ctx).Where("username = ?", username).First(&user).Error
	if err == nil {
		return true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	return false, err
}

func (r *gormRepository) EmailExists(ctx context.Context, email string) (bool, error) {
	var user persistencemodel.User
	err := r.db.WithContext(ctx).Where("primary_email = ?", email).First(&user).Error
	if err == nil {
		return true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	return false, err
}

func (r *gormRepository) CreateUser(ctx context.Context, user *domainauth.RegisteredUser) (domainauth.UserProfile, error) {
	row := user.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return domainauth.UserProfile{}, err
	}
	_ = orgapp.CreatePersonalOrg(r.db.WithContext(ctx), domainorg.UserFromModel(row))
	*user = domainauth.RegisteredUserFromModel(row)
	return domainauth.UserProfileFromModel(row), nil
}

func (r *gormRepository) SuperAdminCount(ctx context.Context) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&persistencemodel.User{}).Where("system_role = ?", "super_admin").Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *gormRepository) FindSuperAdmin(ctx context.Context) (domainauth.RegisteredUser, error) {
	var user persistencemodel.User
	if err := r.db.WithContext(ctx).Where("system_role = ?", "super_admin").First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainauth.RegisteredUser{}, ErrNotFound
		}
		return domainauth.RegisteredUser{}, err
	}
	return domainauth.RegisteredUserFromModel(user), nil
}

func (r *gormRepository) UpdateUser(ctx context.Context, userID uint, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Model(&persistencemodel.User{}).Where("id = ?", userID).Updates(updates).Error
}

func (r *gormRepository) FindAvailableUsername(ctx context.Context, base string) (string, error) {
	for i := 0; ; i++ {
		candidate := base
		if i > 0 {
			candidate = base + strconv.Itoa(i+1)
		}
		var count int64
		if err := r.db.WithContext(ctx).Model(&persistencemodel.User{}).Where("username = ?", candidate).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return candidate, nil
		}
	}
}

func (r *gormRepository) FindUserForLogin(ctx context.Context, username string, email string) (domainauth.RegisteredUser, error) {
	var user persistencemodel.User
	query := r.db.WithContext(ctx)
	if email != "" {
		query = query.Where("username = ? OR primary_email = ?", username, email)
	} else {
		query = query.Where("username = ?", username)
	}
	if err := query.First(&user).Error; err != nil {
		return domainauth.RegisteredUser{}, err
	}
	return domainauth.RegisteredUserFromModel(user), nil
}

func (r *gormRepository) FindUserByID(ctx context.Context, userID uint) (domainauth.UserProfile, error) {
	var user persistencemodel.User
	if err := r.db.WithContext(ctx).First(&user, userID).Error; err != nil {
		return domainauth.UserProfile{}, err
	}
	return domainauth.UserProfileFromModel(user), nil
}

func (r *gormRepository) FindUserModelByID(ctx context.Context, userID uint) (persistencemodel.User, error) {
	var user persistencemodel.User
	if err := r.db.WithContext(ctx).First(&user, userID).Error; err != nil {
		return persistencemodel.User{}, err
	}
	return user, nil
}

func (r *gormRepository) CreateChallenge(ctx context.Context, challenge *domainauth.AuthChallenge) error {
	row := challenge.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return err
	}
	*challenge = domainauth.AuthChallengeFromModel(row)
	return nil
}

func (r *gormRepository) FindChallenge(ctx context.Context, id uint) (domainauth.AuthChallenge, error) {
	var challenge persistencemodel.AuthChallenge
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&challenge).Error; err != nil {
		return domainauth.AuthChallenge{}, err
	}
	return domainauth.AuthChallengeFromModel(challenge), nil
}

func (r *gormRepository) IncrementChallengeAttempts(ctx context.Context, challenge *domainauth.AuthChallenge) error {
	row := challenge.ToModel()
	return r.db.WithContext(ctx).Model(&row).UpdateColumn("attempts", gorm.Expr("attempts + 1")).Error
}

func (r *gormRepository) ConsumeChallenge(ctx context.Context, challenge *domainauth.AuthChallenge, consumedAt time.Time) error {
	row := challenge.ToModel()
	if err := r.db.WithContext(ctx).Model(&row).Updates(map[string]any{"consumed_at": &consumedAt}).Error; err != nil {
		return err
	}
	challenge.ConsumedAt = &consumedAt
	return nil
}

func (r *gormRepository) FindUserByEmail(ctx context.Context, email string) (domainauth.UserProfile, error) {
	var user persistencemodel.User
	if err := r.db.WithContext(ctx).Where("primary_email = ?", email).First(&user).Error; err != nil {
		return domainauth.UserProfile{}, err
	}
	return domainauth.UserProfileFromModel(user), nil
}

func (r *gormRepository) CreateSession(ctx context.Context, session *persistencemodel.AuthSession) error {
	return r.db.WithContext(ctx).Create(session).Error
}

func (r *gormRepository) FindActiveSession(ctx context.Context, tokenHash string, now time.Time) (persistencemodel.AuthSession, error) {
	var session persistencemodel.AuthSession
	err := r.db.WithContext(ctx).
		Where("token_hash = ? AND revoked_at IS NULL AND expires_at > ?", tokenHash, now).
		First(&session).Error
	if err != nil {
		return persistencemodel.AuthSession{}, err
	}
	return session, nil
}

func (r *gormRepository) TouchSession(ctx context.Context, session *persistencemodel.AuthSession, seenAt time.Time) error {
	return r.db.WithContext(ctx).Model(session).Updates(map[string]any{"last_seen_at": &seenAt}).Error
}

func (r *gormRepository) RevokeSession(ctx context.Context, tokenHash string, revokedAt time.Time) error {
	return r.db.WithContext(ctx).
		Model(&persistencemodel.AuthSession{}).
		Where("token_hash = ? AND revoked_at IS NULL", tokenHash).
		Update("revoked_at", &revokedAt).Error
}

func (r *gormRepository) OrgMemberships(ctx context.Context, userID uint) ([]OrgMembershipSummary, error) {
	members := make([]persistencemodel.OrganizationMember, 0)
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&members).Error; err != nil {
		return nil, err
	}
	if len(members) == 0 {
		var user persistencemodel.User
		if err := r.db.WithContext(ctx).First(&user, userID).Error; err == nil {
			_ = orgapp.CreatePersonalOrg(r.db.WithContext(ctx), domainorg.UserFromModel(user))
			_ = r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&members).Error
		}
	}

	memberships := make([]OrgMembershipSummary, 0, len(members))
	for _, member := range members {
		var org persistencemodel.Organization
		if r.db.WithContext(ctx).First(&org, member.OrgID).Error != nil {
			continue
		}
		memberships = append(memberships, OrgMembershipSummary{
			OrgID:      org.ID,
			OrgName:    org.Name,
			OrgSlug:    org.Slug,
			IsPersonal: org.IsPersonal,
			Plan:       org.Plan,
			Status:     org.Status,
			Role:       member.Role,
		})
	}
	return memberships, nil
}

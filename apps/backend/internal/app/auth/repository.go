package auth

import (
	"context"
	"errors"
	"strconv"
	"time"

	orgapp "github.com/movscript/movscript/internal/app/org"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	UsernameExists(ctx context.Context, username string) (bool, error)
	EmailExists(ctx context.Context, email string) (bool, error)
	CreateUser(ctx context.Context, user *model.User) error
	SuperAdminCount(ctx context.Context) (int64, error)
	FindSuperAdmin(ctx context.Context) (model.User, error)
	UpdateUser(ctx context.Context, userID uint, updates map[string]any) error
	FindAvailableUsername(ctx context.Context, base string) (string, error)
	FindUserForLogin(ctx context.Context, username string, email string) (model.User, error)
	FindUserByID(ctx context.Context, userID uint) (model.User, error)
	CreateChallenge(ctx context.Context, challenge *model.AuthChallenge) error
	FindChallenge(ctx context.Context, id uint) (model.AuthChallenge, error)
	IncrementChallengeAttempts(ctx context.Context, challenge *model.AuthChallenge) error
	ConsumeChallenge(ctx context.Context, challenge *model.AuthChallenge, consumedAt time.Time) error
	FindUserByEmail(ctx context.Context, email string) (model.User, error)
	CreateSession(ctx context.Context, session *model.AuthSession) error
	FindActiveSession(ctx context.Context, tokenHash string, now time.Time) (model.AuthSession, error)
	TouchSession(ctx context.Context, session *model.AuthSession, seenAt time.Time) error
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
	var user model.User
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
	var user model.User
	err := r.db.WithContext(ctx).Where("primary_email = ?", email).First(&user).Error
	if err == nil {
		return true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	return false, err
}

func (r *gormRepository) CreateUser(ctx context.Context, user *model.User) error {
	if err := r.db.WithContext(ctx).Create(user).Error; err != nil {
		return err
	}
	_ = orgapp.CreatePersonalOrg(r.db.WithContext(ctx), user)
	return nil
}

func (r *gormRepository) SuperAdminCount(ctx context.Context) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&model.User{}).Where("system_role = ?", "super_admin").Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *gormRepository) FindSuperAdmin(ctx context.Context) (model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).Where("system_role = ?", "super_admin").First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.User{}, ErrNotFound
		}
		return model.User{}, err
	}
	return user, nil
}

func (r *gormRepository) UpdateUser(ctx context.Context, userID uint, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", userID).Updates(updates).Error
}

func (r *gormRepository) FindAvailableUsername(ctx context.Context, base string) (string, error) {
	for i := 0; ; i++ {
		candidate := base
		if i > 0 {
			candidate = base + strconv.Itoa(i+1)
		}
		var count int64
		if err := r.db.WithContext(ctx).Model(&model.User{}).Where("username = ?", candidate).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return candidate, nil
		}
	}
}

func (r *gormRepository) FindUserForLogin(ctx context.Context, username string, email string) (model.User, error) {
	var user model.User
	query := r.db.WithContext(ctx)
	if email != "" {
		query = query.Where("username = ? OR primary_email = ?", username, email)
	} else {
		query = query.Where("username = ?", username)
	}
	if err := query.First(&user).Error; err != nil {
		return model.User{}, err
	}
	return user, nil
}

func (r *gormRepository) FindUserByID(ctx context.Context, userID uint) (model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).First(&user, userID).Error; err != nil {
		return model.User{}, err
	}
	return user, nil
}

func (r *gormRepository) CreateChallenge(ctx context.Context, challenge *model.AuthChallenge) error {
	return r.db.WithContext(ctx).Create(challenge).Error
}

func (r *gormRepository) FindChallenge(ctx context.Context, id uint) (model.AuthChallenge, error) {
	var challenge model.AuthChallenge
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&challenge).Error; err != nil {
		return model.AuthChallenge{}, err
	}
	return challenge, nil
}

func (r *gormRepository) IncrementChallengeAttempts(ctx context.Context, challenge *model.AuthChallenge) error {
	return r.db.WithContext(ctx).Model(challenge).UpdateColumn("attempts", gorm.Expr("attempts + 1")).Error
}

func (r *gormRepository) ConsumeChallenge(ctx context.Context, challenge *model.AuthChallenge, consumedAt time.Time) error {
	return r.db.WithContext(ctx).Model(challenge).Updates(map[string]any{"consumed_at": &consumedAt}).Error
}

func (r *gormRepository) FindUserByEmail(ctx context.Context, email string) (model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).Where("primary_email = ?", email).First(&user).Error; err != nil {
		return model.User{}, err
	}
	return user, nil
}

func (r *gormRepository) CreateSession(ctx context.Context, session *model.AuthSession) error {
	return r.db.WithContext(ctx).Create(session).Error
}

func (r *gormRepository) FindActiveSession(ctx context.Context, tokenHash string, now time.Time) (model.AuthSession, error) {
	var session model.AuthSession
	err := r.db.WithContext(ctx).
		Where("token_hash = ? AND revoked_at IS NULL AND expires_at > ?", tokenHash, now).
		First(&session).Error
	if err != nil {
		return model.AuthSession{}, err
	}
	return session, nil
}

func (r *gormRepository) TouchSession(ctx context.Context, session *model.AuthSession, seenAt time.Time) error {
	return r.db.WithContext(ctx).Model(session).Updates(map[string]any{"last_seen_at": &seenAt}).Error
}

func (r *gormRepository) RevokeSession(ctx context.Context, tokenHash string, revokedAt time.Time) error {
	return r.db.WithContext(ctx).
		Model(&model.AuthSession{}).
		Where("token_hash = ? AND revoked_at IS NULL", tokenHash).
		Update("revoked_at", &revokedAt).Error
}

func (r *gormRepository) OrgMemberships(ctx context.Context, userID uint) ([]OrgMembershipSummary, error) {
	members := make([]model.OrganizationMember, 0)
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&members).Error; err != nil {
		return nil, err
	}
	if len(members) == 0 {
		var user model.User
		if err := r.db.WithContext(ctx).First(&user, userID).Error; err == nil {
			_ = orgapp.CreatePersonalOrg(r.db.WithContext(ctx), &user)
			_ = r.db.WithContext(ctx).Where("user_id = ?", userID).Find(&members).Error
		}
	}

	memberships := make([]OrgMembershipSummary, 0, len(members))
	for _, member := range members {
		var org model.Organization
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

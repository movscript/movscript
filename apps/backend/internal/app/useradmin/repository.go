package useradmin

import (
	"context"
	"errors"
	"strings"
	"time"

	orgapp "github.com/movscript/movscript/internal/app/org"
	domainauth "github.com/movscript/movscript/internal/domain/auth"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	List(ctx context.Context, filter ListFilter) (Page, error)
	Detail(ctx context.Context, id uint) (Detail, error)
	Create(ctx context.Context, user domainauth.RegisteredUser) (domainauth.UserProfile, error)
	ResetPassword(ctx context.Context, id uint, passwordHash string) (domainauth.UserProfile, error)
	RevokeSession(ctx context.Context, userID uint, sessionID uint, revokedAt time.Time) error
	RevokeAllSessions(ctx context.Context, userID uint, revokedAt time.Time) (int64, error)
	Update(ctx context.Context, id uint, spec updateSpec) (domainauth.UserProfile, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) List(ctx context.Context, filter ListFilter) (Page, error) {
	users := make([]persistencemodel.User, 0)
	q := r.db.WithContext(ctx).Model(&persistencemodel.User{})
	if filter.Query != "" {
		like := "%" + filter.Query + "%"
		if r.db.Dialector.Name() == "postgres" {
			q = q.Where("username ILIKE ? OR display_name ILIKE ? OR primary_email ILIKE ?", like, like, like)
		} else {
			q = q.Where("LOWER(username) LIKE LOWER(?) OR LOWER(display_name) LIKE LOWER(?) OR LOWER(primary_email) LIKE LOWER(?)", like, like, like)
		}
	}
	if filter.SystemRole != "" {
		q = q.Where("system_role = ?", filter.SystemRole)
	}
	if filter.Status != "" {
		q = q.Where("status = ?", filter.Status)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return Page{}, err
	}
	offset := (filter.Page - 1) * filter.PageSize
	if err := q.Order("id desc").Limit(filter.PageSize).Offset(offset).Find(&users).Error; err != nil {
		return Page{}, err
	}
	return Page{
		Items:    userProfilesFromModels(users),
		Total:    total,
		Page:     filter.Page,
		PageSize: filter.PageSize,
	}, nil
}

func (r *gormRepository) Create(ctx context.Context, user domainauth.RegisteredUser) (domainauth.UserProfile, error) {
	row := user.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		if isDuplicateKey(err) {
			return domainauth.UserProfile{}, ErrUserConflict
		}
		return domainauth.UserProfile{}, err
	}
	_ = orgapp.CreatePersonalOrg(r.db.WithContext(ctx), domainorg.UserFromModel(row))
	return domainauth.UserProfileFromModel(row), nil
}

func (r *gormRepository) ResetPassword(ctx context.Context, id uint, passwordHash string) (domainauth.UserProfile, error) {
	var updated persistencemodel.User
	result := r.db.WithContext(ctx).
		Model(&persistencemodel.User{}).
		Where("id = ?", id).
		Update("password_hash", passwordHash)
	if result.Error != nil {
		return domainauth.UserProfile{}, result.Error
	}
	if result.RowsAffected == 0 {
		return domainauth.UserProfile{}, ErrUserNotFound
	}
	if err := r.db.WithContext(ctx).First(&updated, id).Error; err != nil {
		return domainauth.UserProfile{}, err
	}
	return domainauth.UserProfileFromModel(updated), nil
}

func (r *gormRepository) Detail(ctx context.Context, id uint) (Detail, error) {
	var user persistencemodel.User
	if err := r.db.WithContext(ctx).First(&user, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Detail{}, ErrUserNotFound
		}
		return Detail{}, err
	}

	orgs := make([]OrgMembership, 0)
	if err := r.db.WithContext(ctx).
		Table("organization_members om").
		Select("o.id, o.name, o.slug, o.plan, o.status, om.role, om.created_at AS joined_at").
		Joins("JOIN organizations o ON o.id = om.org_id AND o.deleted_at IS NULL").
		Where("om.user_id = ? AND om.deleted_at IS NULL", id).
		Order("om.created_at DESC").
		Limit(50).
		Scan(&orgs).Error; err != nil {
		return Detail{}, err
	}

	projects := make([]ProjectMembership, 0)
	if err := r.db.WithContext(ctx).
		Table("project_members pm").
		Select("p.id, p.name, p.status, p.org_id, p.owner_id, pm.role, pm.created_at AS joined_at").
		Joins("JOIN projects p ON p.id = pm.project_id AND p.deleted_at IS NULL").
		Where("pm.user_id = ? AND pm.deleted_at IS NULL", id).
		Order("p.updated_at DESC, p.id DESC").
		Limit(50).
		Scan(&projects).Error; err != nil {
		return Detail{}, err
	}

	sessions := make([]SessionSummary, 0)
	if err := r.db.WithContext(ctx).
		Model(&persistencemodel.AuthSession{}).
		Select("id, expires_at, revoked_at, last_seen_at, user_agent, ip_address, created_at").
		Where("user_id = ?", id).
		Order("created_at DESC, id DESC").
		Limit(20).
		Scan(&sessions).Error; err != nil {
		return Detail{}, err
	}

	var usage UsageSummary
	if err := r.db.WithContext(ctx).
		Model(&persistencemodel.UsageLog{}).
		Select(`
			COUNT(*) AS calls,
			COALESCE(SUM(cost), 0) AS cost,
			COALESCE(SUM(input_tokens), 0) AS input_tokens,
			COALESCE(SUM(output_tokens), 0) AS output_tokens,
			COALESCE(SUM(CASE WHEN operation_type = ? THEN image_count ELSE 0 END), 0) AS images,
			COALESCE(SUM(duration_sec), 0) AS duration_sec
		`, "image").
		Where("user_id = ?", id).
		Scan(&usage).Error; err != nil {
		return Detail{}, err
	}

	audit := AuditSummary{}
	if err := r.db.WithContext(ctx).
		Model(&persistencemodel.AuditLog{}).
		Where("actor_id = ?", id).
		Count(&audit.Records).Error; err != nil {
		return Detail{}, err
	}
	if audit.Records > 0 {
		var last persistencemodel.AuditLog
		if err := r.db.WithContext(ctx).
			Where("actor_id = ?", id).
			Order("created_at DESC, id DESC").
			First(&last).Error; err != nil {
			return Detail{}, err
		}
		audit.LastAction = last.Action
		audit.LastAt = &last.CreatedAt
	}

	return Detail{
		User:     domainauth.UserProfileFromModel(user),
		Orgs:     orgs,
		Projects: projects,
		Sessions: sessions,
		Usage:    usage,
		Audit:    audit,
	}, nil
}

func (r *gormRepository) RevokeSession(ctx context.Context, userID uint, sessionID uint, revokedAt time.Time) error {
	result := r.db.WithContext(ctx).
		Model(&persistencemodel.AuthSession{}).
		Where("id = ? AND user_id = ?", sessionID, userID).
		Update("revoked_at", &revokedAt)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrSessionNotFound
	}
	return nil
}

func (r *gormRepository) RevokeAllSessions(ctx context.Context, userID uint, revokedAt time.Time) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user persistencemodel.User
		if err := tx.Select("id").First(&user, userID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUserNotFound
			}
			return err
		}
		result := tx.Model(&persistencemodel.AuthSession{}).
			Where("user_id = ? AND revoked_at IS NULL", userID).
			Update("revoked_at", &revokedAt)
		if result.Error != nil {
			return result.Error
		}
		count = result.RowsAffected
		return nil
	})
	if err != nil {
		return 0, err
	}
	return count, nil
}

func isDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(msg, "unique_violation")
}

func (r *gormRepository) Update(ctx context.Context, id uint, spec updateSpec) (domainauth.UserProfile, error) {
	var updated persistencemodel.User
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var user persistencemodel.User
		if err := tx.First(&user, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUserNotFound
			}
			return err
		}
		if removesSuperAdmin(user, spec) {
			var count int64
			if err := tx.Model(&persistencemodel.User{}).
				Where("system_role = ? AND status = ? AND id <> ?", domainauth.SystemRoleSuperAdmin, domainauth.UserStatusActive, id).
				Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return ErrLastSuperAdmin
			}
		}
		updates := map[string]any{}
		if spec.SystemRole != nil {
			updates["system_role"] = *spec.SystemRole
		}
		if spec.Status != nil {
			updates["status"] = *spec.Status
		}
		if spec.DisplayName != nil {
			updates["display_name"] = *spec.DisplayName
		}
		if spec.EmailSet {
			updates["primary_email"] = spec.PrimaryEmail
			updates["email_verified_at"] = spec.EmailVerifiedAt
		}
		if err := tx.Model(&persistencemodel.User{}).Where("id = ?", user.ID).Updates(updates).Error; err != nil {
			if isDuplicateKey(err) {
				return ErrUserConflict
			}
			return err
		}
		if spec.RevokeSessions {
			if err := tx.Model(&persistencemodel.AuthSession{}).
				Where("user_id = ? AND revoked_at IS NULL", user.ID).
				Update("revoked_at", time.Now().UTC()).Error; err != nil {
				return err
			}
		}
		return tx.First(&updated, id).Error
	})
	if err != nil {
		return domainauth.UserProfile{}, err
	}
	return domainauth.UserProfileFromModel(updated), nil
}

func userProfilesFromModels(users []persistencemodel.User) []domainauth.UserProfile {
	result := make([]domainauth.UserProfile, 0, len(users))
	for _, user := range users {
		result = append(result, domainauth.UserProfileFromModel(user))
	}
	return result
}

func removesSuperAdmin(user persistencemodel.User, spec updateSpec) bool {
	if user.SystemRole != domainauth.SystemRoleSuperAdmin || user.Status != domainauth.UserStatusActive {
		return false
	}
	if spec.SystemRole != nil && *spec.SystemRole != domainauth.SystemRoleSuperAdmin {
		return true
	}
	if spec.Status != nil && *spec.Status != domainauth.UserStatusActive {
		return true
	}
	return false
}

package project

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	domainproject "github.com/movscript/movscript/internal/domain/project"
	"github.com/movscript/movscript/internal/infra/cache"
	"gorm.io/gorm"
)

var (
	ErrProjectNotFound       = errors.New("project not found")
	ErrOwnerNotFound         = errors.New("owner user not found")
	ErrProjectMemberNotFound = errors.New("project member not found")
)

type Service struct {
	db    *gorm.DB
	cache cache.Cache
}

const progressCacheTTL = 2 * time.Minute

func NewService(db *gorm.DB, cacheStore ...cache.Cache) *Service {
	var c cache.Cache
	if len(cacheStore) > 0 {
		c = cacheStore[0]
	}
	if c == nil {
		c = cache.NewNoop()
	}
	return &Service{db: db, cache: c}
}

type CreateInput struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	TotalEpisodes int    `json:"total_episodes"`
}

type UpdateInput struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	TotalEpisodes int    `json:"total_episodes"`
}

type MemberInput struct {
	UserID uint   `json:"user_id" binding:"required"`
	Role   string `json:"role"`
}

type Progress struct {
	Scripts         int64
	Segments        int64
	AssetSlots      int64
	Members         int64
	StoryboardLines int64
	ContentUnits    map[string]int64
	Keyframes       map[string]int64
}

type ProjectRole struct {
	Role   string
	UserID uint
}

func (s *Service) List(ctx context.Context, orgID *uint) ([]model.Project, error) {
	projects := make([]model.Project, 0)
	query := s.db.WithContext(ctx).Preload("Owner")
	if orgID != nil {
		query = query.Where("org_id = ?", *orgID)
	}
	err := query.Find(&projects).Error
	return projects, err
}

func (s *Service) AdminList(ctx context.Context) ([]model.Project, error) {
	projects := make([]model.Project, 0)
	err := s.db.WithContext(ctx).Preload("Owner").Preload("Members.User").Order("id desc").Find(&projects).Error
	return projects, err
}

func (s *Service) ForceSetOwner(ctx context.Context, projectID uint, ownerID uint) (model.Project, error) {
	var updated model.Project
	if projectID == 0 || ownerID == 0 {
		return updated, ErrProjectNotFound
	}

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var owner model.User
		if err := tx.First(&owner, ownerID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrOwnerNotFound
			}
			return err
		}

		var project model.Project
		if err := tx.First(&project, projectID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProjectNotFound
			}
			return err
		}

		if err := tx.Model(&model.Project{}).Where("id = ?", project.ID).Update("owner_id", ownerID).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.ProjectMember{}).
			Where("project_id = ? AND user_id <> ? AND role = ?", project.ID, ownerID, "owner").
			Update("role", "director").Error; err != nil {
			return err
		}

		result := tx.Model(&model.ProjectMember{}).
			Where("project_id = ? AND user_id = ?", project.ID, ownerID).
			Update("role", "owner")
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			if err := tx.Create(&model.ProjectMember{ProjectID: project.ID, UserID: ownerID, Role: "owner"}).Error; err != nil {
				return err
			}
		}

		return tx.Preload("Owner").Preload("Members.User").First(&updated, project.ID).Error
	})
	return updated, err
}

func (s *Service) Create(ctx context.Context, input CreateInput, ownerID uint, orgID *uint) (model.Project, error) {
	project := domainproject.NewProject(input.Name, input.Description, input.TotalEpisodes, ownerID, orgID)
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&project).Error; err != nil {
			return err
		}
		if project.OwnerID != 0 {
			member := domainproject.OwnerMember(project.ID, project.OwnerID)
			return tx.Create(&member).Error
		}
		return nil
	})
	if err == nil {
		s.bumpProgressVersion(ctx, project.ID)
	}
	return project, err
}

func (s *Service) Get(ctx context.Context, id uint, orgID *uint) (model.Project, error) {
	var project model.Project
	query := s.db.WithContext(ctx).Preload("Owner").Preload("Members.User").Where("id = ?", id)
	if orgID != nil {
		query = query.Where("org_id = ?", *orgID)
	}
	if err := query.First(&project).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return project, ErrProjectNotFound
		}
		return project, err
	}
	return project, nil
}

func (s *Service) ResolveRole(ctx context.Context, projectID uint, userID uint, systemRole string) (ProjectRole, error) {
	if projectID == 0 {
		return ProjectRole{}, ErrProjectNotFound
	}
	if resolved, ok := domainproject.ResolveSystemRole(projectID, userID, systemRole); ok {
		var project model.Project
		if err := s.db.WithContext(ctx).Select("id").First(&project, projectID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ProjectRole{}, ErrProjectNotFound
			}
			return ProjectRole{}, err
		}
		return ProjectRole{Role: resolved.Role, UserID: resolved.UserID}, nil
	}

	var project model.Project
	if err := s.db.WithContext(ctx).Select("id, owner_id").First(&project, projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectRole{}, ErrProjectNotFound
		}
		return ProjectRole{}, err
	}
	if resolved, ok := domainproject.ResolveOwnerRole(project.OwnerID, userID); ok {
		return ProjectRole{Role: resolved.Role, UserID: resolved.UserID}, nil
	}

	var member model.ProjectMember
	if err := s.db.WithContext(ctx).Where("project_id = ? AND user_id = ?", projectID, userID).First(&member).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectRole{}, ErrProjectMemberNotFound
		}
		return ProjectRole{}, err
	}
	return ProjectRole{Role: member.Role, UserID: userID}, nil
}

func (s *Service) Update(ctx context.Context, id uint, input UpdateInput, orgID *uint) (model.Project, error) {
	var project model.Project
	query := s.db.WithContext(ctx).Where("id = ?", id)
	if orgID != nil {
		query = query.Where("org_id = ?", *orgID)
	}
	if err := query.First(&project).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return project, ErrProjectNotFound
		}
		return project, err
	}
	project.Name = input.Name
	project.Description = input.Description
	project.TotalEpisodes = input.TotalEpisodes
	err := s.db.WithContext(ctx).Save(&project).Error
	if err == nil {
		s.bumpProgressVersion(ctx, project.ID)
	}
	return project, err
}

func (s *Service) Delete(ctx context.Context, id uint, orgID *uint) error {
	query := s.db.WithContext(ctx).Where("id = ?", id)
	if orgID != nil {
		query = query.Where("org_id = ?", *orgID)
	}
	err := query.Delete(&model.Project{}).Error
	if err == nil {
		s.bumpProgressVersion(ctx, id)
	}
	return err
}

func (s *Service) AddMember(ctx context.Context, projectID uint, input MemberInput, orgID *uint) (model.ProjectMember, error) {
	if _, err := s.Get(ctx, projectID, orgID); err != nil {
		return model.ProjectMember{}, err
	}
	member := domainproject.NewMember(projectID, input.UserID, input.Role)
	if err := s.db.WithContext(ctx).Create(&member).Error; err != nil {
		return member, err
	}
	if err := s.db.WithContext(ctx).Preload("User").First(&member, member.ID).Error; err != nil {
		return member, err
	}
	s.bumpProgressVersion(ctx, projectID)
	return member, nil
}

func (s *Service) RemoveMember(ctx context.Context, projectID uint, memberID uint, orgID *uint) error {
	if _, err := s.Get(ctx, projectID, orgID); err != nil {
		return err
	}
	err := s.db.WithContext(ctx).
		Where("project_id = ? AND id = ?", projectID, memberID).
		Delete(&model.ProjectMember{}).Error
	if err == nil {
		s.bumpProgressVersion(ctx, projectID)
	}
	return err
}

func (s *Service) ListMembers(ctx context.Context, projectID uint, orgID *uint) ([]model.ProjectMember, error) {
	members := make([]model.ProjectMember, 0)
	if _, err := s.Get(ctx, projectID, orgID); err != nil {
		return members, err
	}
	err := s.db.WithContext(ctx).Where("project_id = ?", projectID).Preload("User").Find(&members).Error
	return members, err
}

func (s *Service) Progress(ctx context.Context, projectID uint, orgID *uint) (Progress, error) {
	var progress Progress
	version, _ := s.cache.GetVersion(ctx, progressCacheNamespace(projectID))
	cacheKey := fmt.Sprintf("project:%d:progress:v%d", projectID, version)
	if ok, err := s.cache.GetJSON(ctx, cacheKey, &progress); err == nil && ok {
		return progress, nil
	}
	db := s.db.WithContext(ctx)
	if _, err := s.Get(ctx, projectID, orgID); err != nil {
		return progress, err
	}
	if err := db.Model(&model.ScriptVersion{}).Where("project_id = ?", projectID).Count(&progress.Scripts).Error; err != nil {
		return progress, err
	}
	if err := db.Model(&model.Segment{}).Where("project_id = ?", projectID).Count(&progress.Segments).Error; err != nil {
		return progress, err
	}
	if err := db.Model(&model.ProjectMember{}).Where("project_id = ?", projectID).Count(&progress.Members).Error; err != nil {
		return progress, err
	}
	if err := db.Model(&model.AssetSlot{}).Where("project_id = ?", projectID).Count(&progress.AssetSlots).Error; err != nil {
		return progress, err
	}
	if err := db.Model(&model.StoryboardLine{}).Where("project_id = ?", projectID).Count(&progress.StoryboardLines).Error; err != nil {
		return progress, err
	}

	type statusCount struct {
		Status string
		Count  int64
	}
	var contentUnitBreakdown []statusCount
	if err := db.Model(&model.ContentUnit{}).
		Select("status, count(*) as count").
		Where("project_id = ?", projectID).
		Group("status").
		Scan(&contentUnitBreakdown).Error; err != nil {
		return progress, err
	}
	progress.ContentUnits = map[string]int64{}
	for _, row := range contentUnitBreakdown {
		progress.ContentUnits[row.Status] = row.Count
		progress.ContentUnits["total"] += row.Count
	}

	var acceptedKeyframeCount int64
	if err := db.Model(&model.Keyframe{}).Where("project_id = ? AND status IN ?", projectID, []string{"attached", "accepted"}).Count(&acceptedKeyframeCount).Error; err != nil {
		return progress, err
	}
	progress.Keyframes = map[string]int64{"accepted": acceptedKeyframeCount}
	_ = s.cache.SetJSON(ctx, cacheKey, progress, progressCacheTTL)
	return progress, nil
}

func (s *Service) bumpProgressVersion(ctx context.Context, projectID uint) {
	if projectID == 0 {
		return
	}
	_, _ = s.cache.BumpVersion(ctx, progressCacheNamespace(projectID))
}

func progressCacheNamespace(projectID uint) string {
	return fmt.Sprintf("project:%d:progress", projectID)
}

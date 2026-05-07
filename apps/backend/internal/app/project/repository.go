package project

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/domain/model"
	domainproject "github.com/movscript/movscript/internal/domain/project"
	"gorm.io/gorm"
)

type repository interface {
	List(ctx context.Context, orgID *uint) ([]domainproject.Project, error)
	AdminList(ctx context.Context) ([]domainproject.Project, error)
	ForceSetOwner(ctx context.Context, projectID uint, ownerID uint) (domainproject.Project, error)
	Create(ctx context.Context, input CreateInput, ownerID uint, orgID *uint) (domainproject.Project, error)
	Get(ctx context.Context, id uint, orgID *uint) (domainproject.Project, error)
	ResolveRole(ctx context.Context, projectID uint, userID uint, systemRole string) (domainproject.Role, error)
	Update(ctx context.Context, id uint, input UpdateInput, orgID *uint) (domainproject.Project, error)
	Delete(ctx context.Context, id uint, orgID *uint) error
	AddMember(ctx context.Context, projectID uint, input MemberInput, orgID *uint) (domainproject.Member, error)
	RemoveMember(ctx context.Context, projectID uint, memberID uint, orgID *uint) error
	ListMembers(ctx context.Context, projectID uint, orgID *uint) ([]domainproject.Member, error)
	Progress(ctx context.Context, projectID uint, orgID *uint) (Progress, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) List(ctx context.Context, orgID *uint) ([]domainproject.Project, error) {
	projects := make([]model.Project, 0)
	query := r.db.WithContext(ctx).Preload("Owner")
	if orgID != nil {
		query = query.Where("org_id = ?", *orgID)
	}
	if err := query.Find(&projects).Error; err != nil {
		return nil, err
	}
	return projectSliceFromModels(projects), nil
}

func (r *gormRepository) AdminList(ctx context.Context) ([]domainproject.Project, error) {
	projects := make([]model.Project, 0)
	if err := r.db.WithContext(ctx).Preload("Owner").Preload("Members.User").Order("id desc").Find(&projects).Error; err != nil {
		return nil, err
	}
	return projectSliceFromModels(projects), nil
}

func (r *gormRepository) ForceSetOwner(ctx context.Context, projectID uint, ownerID uint) (domainproject.Project, error) {
	var updated model.Project
	if projectID == 0 || ownerID == 0 {
		return domainproject.Project{}, ErrProjectNotFound
	}

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
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
			Where("project_id = ? AND user_id <> ? AND role = ?", project.ID, ownerID, domainproject.RoleOwner).
			Update("role", domainproject.RoleDirector).Error; err != nil {
			return err
		}

		result := tx.Model(&model.ProjectMember{}).
			Where("project_id = ? AND user_id = ?", project.ID, ownerID).
			Update("role", domainproject.RoleOwner)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			member := domainproject.OwnerMember(project.ID, ownerID).ToModel()
			if err := tx.Create(&member).Error; err != nil {
				return err
			}
		}

		return tx.Preload("Owner").Preload("Members.User").First(&updated, project.ID).Error
	})
	if err != nil {
		return domainproject.Project{}, err
	}
	return domainproject.ProjectFromModel(updated), nil
}

func (r *gormRepository) Create(ctx context.Context, input CreateInput, ownerID uint, orgID *uint) (domainproject.Project, error) {
	project := domainproject.NewProject(input.Name, input.Description, input.TotalEpisodes, ownerID, orgID).ToModel()
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&project).Error; err != nil {
			return err
		}
		if project.OwnerID != 0 {
			member := domainproject.OwnerMember(project.ID, project.OwnerID).ToModel()
			return tx.Create(&member).Error
		}
		return nil
	})
	if err != nil {
		return domainproject.Project{}, err
	}
	return domainproject.ProjectFromModel(project), nil
}

func (r *gormRepository) Get(ctx context.Context, id uint, orgID *uint) (domainproject.Project, error) {
	var project model.Project
	query := r.db.WithContext(ctx).Preload("Owner").Preload("Members.User").Where("id = ?", id)
	if orgID != nil {
		query = query.Where("org_id = ?", *orgID)
	}
	if err := query.First(&project).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainproject.Project{}, ErrProjectNotFound
		}
		return domainproject.Project{}, err
	}
	return domainproject.ProjectFromModel(project), nil
}

func (r *gormRepository) ResolveRole(ctx context.Context, projectID uint, userID uint, systemRole string) (domainproject.Role, error) {
	if projectID == 0 {
		return domainproject.Role{}, ErrProjectNotFound
	}
	if resolved, ok := domainproject.ResolveSystemRole(projectID, userID, systemRole); ok {
		var project model.Project
		if err := r.db.WithContext(ctx).Select("id").First(&project, projectID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return domainproject.Role{}, ErrProjectNotFound
			}
			return domainproject.Role{}, err
		}
		return resolved, nil
	}

	var project model.Project
	if err := r.db.WithContext(ctx).Select("id, owner_id").First(&project, projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainproject.Role{}, ErrProjectNotFound
		}
		return domainproject.Role{}, err
	}
	if resolved, ok := domainproject.ResolveOwnerRole(project.OwnerID, userID); ok {
		return resolved, nil
	}

	var member model.ProjectMember
	if err := r.db.WithContext(ctx).Where("project_id = ? AND user_id = ?", projectID, userID).First(&member).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainproject.Role{}, ErrProjectMemberNotFound
		}
		return domainproject.Role{}, err
	}
	return domainproject.Role{Role: member.Role, UserID: userID}, nil
}

func (r *gormRepository) Update(ctx context.Context, id uint, input UpdateInput, orgID *uint) (domainproject.Project, error) {
	var project model.Project
	query := r.db.WithContext(ctx).Where("id = ?", id)
	if orgID != nil {
		query = query.Where("org_id = ?", *orgID)
	}
	if err := query.First(&project).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainproject.Project{}, ErrProjectNotFound
		}
		return domainproject.Project{}, err
	}
	project.Name = input.Name
	project.Description = input.Description
	project.TotalEpisodes = input.TotalEpisodes
	if err := r.db.WithContext(ctx).Save(&project).Error; err != nil {
		return domainproject.Project{}, err
	}
	return domainproject.ProjectFromModel(project), nil
}

func (r *gormRepository) Delete(ctx context.Context, id uint, orgID *uint) error {
	query := r.db.WithContext(ctx).Where("id = ?", id)
	if orgID != nil {
		query = query.Where("org_id = ?", *orgID)
	}
	return query.Delete(&model.Project{}).Error
}

func (r *gormRepository) AddMember(ctx context.Context, projectID uint, input MemberInput, orgID *uint) (domainproject.Member, error) {
	if _, err := r.Get(ctx, projectID, orgID); err != nil {
		return domainproject.Member{}, err
	}
	member := domainproject.NewMember(projectID, input.UserID, input.Role).ToModel()
	if err := r.db.WithContext(ctx).Create(&member).Error; err != nil {
		return domainproject.Member{}, err
	}
	if err := r.db.WithContext(ctx).Preload("User").First(&member, member.ID).Error; err != nil {
		return domainproject.Member{}, err
	}
	return domainproject.MemberFromModel(member), nil
}

func (r *gormRepository) RemoveMember(ctx context.Context, projectID uint, memberID uint, orgID *uint) error {
	if _, err := r.Get(ctx, projectID, orgID); err != nil {
		return err
	}
	return r.db.WithContext(ctx).
		Where("project_id = ? AND id = ?", projectID, memberID).
		Delete(&model.ProjectMember{}).Error
}

func (r *gormRepository) ListMembers(ctx context.Context, projectID uint, orgID *uint) ([]domainproject.Member, error) {
	members := make([]model.ProjectMember, 0)
	if _, err := r.Get(ctx, projectID, orgID); err != nil {
		return nil, err
	}
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Preload("User").Find(&members).Error; err != nil {
		return nil, err
	}
	return memberSliceFromModels(members), nil
}

func (r *gormRepository) Progress(ctx context.Context, projectID uint, orgID *uint) (Progress, error) {
	var progress Progress
	if _, err := r.Get(ctx, projectID, orgID); err != nil {
		return progress, err
	}
	db := r.db.WithContext(ctx)
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
	return progress, nil
}

func projectSliceFromModels(items []model.Project) []domainproject.Project {
	projects := make([]domainproject.Project, 0, len(items))
	for _, item := range items {
		projects = append(projects, domainproject.ProjectFromModel(item))
	}
	return projects
}

func memberSliceFromModels(items []model.ProjectMember) []domainproject.Member {
	members := make([]domainproject.Member, 0, len(items))
	for _, item := range items {
		members = append(members, domainproject.MemberFromModel(item))
	}
	return members
}

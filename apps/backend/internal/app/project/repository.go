package project

import (
	"context"
	"errors"
	"strconv"
	"strings"

	domainauth "github.com/movscript/movscript/internal/domain/auth"
	domainorg "github.com/movscript/movscript/internal/domain/org"
	domainproject "github.com/movscript/movscript/internal/domain/project"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	List(ctx context.Context, orgID *uint) ([]domainproject.Project, error)
	AdminList(ctx context.Context, filter AdminListFilter) (ProjectPage, error)
	AdminDetail(ctx context.Context, id uint) (AdminDetail, error)
	ForceSetOwner(ctx context.Context, projectID uint, ownerID uint) (domainproject.Project, error)
	AdminCreate(ctx context.Context, input AdminCreateInput) (domainproject.Project, error)
	Create(ctx context.Context, input CreateInput, ownerID uint, orgID *uint) (domainproject.Project, error)
	Get(ctx context.Context, id uint, orgID *uint) (domainproject.Project, error)
	BelongsToOrg(ctx context.Context, projectID uint, orgID uint) (bool, error)
	ResolveRole(ctx context.Context, projectID uint, userID uint, systemRole string) (domainproject.Role, error)
	Update(ctx context.Context, id uint, input UpdateInput, orgID *uint) (domainproject.Project, error)
	AdminUpdate(ctx context.Context, id uint, spec adminUpdateSpec) (domainproject.Project, error)
	Delete(ctx context.Context, id uint, orgID *uint) error
	AddMember(ctx context.Context, projectID uint, input MemberInput, orgID *uint) (domainproject.Member, error)
	UpdateMemberRole(ctx context.Context, projectID uint, memberID uint, role string, orgID *uint) (domainproject.Member, error)
	RemoveMember(ctx context.Context, projectID uint, memberID uint, orgID *uint) error
	ListMembers(ctx context.Context, projectID uint, orgID *uint) ([]domainproject.Member, error)
	Progress(ctx context.Context, projectID uint, orgID *uint) (Progress, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) List(ctx context.Context, orgID *uint) ([]domainproject.Project, error) {
	projects := make([]persistencemodel.Project, 0)
	query := r.db.WithContext(ctx).Preload("Owner")
	if orgID != nil {
		query = query.Where("org_id = ?", *orgID)
	}
	if err := query.Find(&projects).Error; err != nil {
		return nil, err
	}
	return projectSliceFromModels(projects), nil
}

func (r *gormRepository) AdminList(ctx context.Context, filter AdminListFilter) (ProjectPage, error) {
	projects := make([]persistencemodel.Project, 0)
	query := r.db.WithContext(ctx).Model(&persistencemodel.Project{})
	if q := strings.TrimSpace(filter.Query); q != "" {
		like := "%" + strings.ToLower(q) + "%"
		query = query.Where("LOWER(name) LIKE ? OR LOWER(description) LIKE ?", like, like)
	}
	if filter.ProjectID != nil {
		query = query.Where("id = ?", *filter.ProjectID)
	}
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.OwnerID != nil {
		query = query.Where("owner_id = ?", *filter.OwnerID)
	}
	if filter.OrgID != nil {
		query = query.Where("org_id = ?", *filter.OrgID)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return ProjectPage{}, err
	}
	offset := (filter.Page - 1) * filter.PageSize
	if err := query.Preload("Owner").Preload("Members.User").
		Order("id desc").
		Limit(filter.PageSize).
		Offset(offset).
		Find(&projects).Error; err != nil {
		return ProjectPage{}, err
	}
	return ProjectPage{Items: projectSliceFromModels(projects), Total: total}, nil
}

func (r *gormRepository) AdminDetail(ctx context.Context, id uint) (AdminDetail, error) {
	var project persistencemodel.Project
	if err := r.db.WithContext(ctx).Preload("Owner").Preload("Members.User").First(&project, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return AdminDetail{}, ErrProjectNotFound
		}
		return AdminDetail{}, err
	}

	var memberCount int64
	if err := r.db.WithContext(ctx).Model(&persistencemodel.ProjectMember{}).Where("project_id = ?", id).Count(&memberCount).Error; err != nil {
		return AdminDetail{}, err
	}
	var scriptCount int64
	if err := r.db.WithContext(ctx).Model(&persistencemodel.Script{}).Where("project_id = ?", id).Count(&scriptCount).Error; err != nil {
		return AdminDetail{}, err
	}
	var contentUnitCount int64
	if err := r.db.WithContext(ctx).Model(&persistencemodel.ContentUnit{}).Where("project_id = ?", id).Count(&contentUnitCount).Error; err != nil {
		return AdminDetail{}, err
	}
	var assetSlotCount int64
	if err := r.db.WithContext(ctx).Model(&persistencemodel.AssetSlot{}).Where("project_id = ?", id).Count(&assetSlotCount).Error; err != nil {
		return AdminDetail{}, err
	}
	var resourceCount int64
	if err := r.db.WithContext(ctx).Model(&persistencemodel.ResourceBinding{}).Where("project_id = ?", id).Distinct("resource_id").Count(&resourceCount).Error; err != nil {
		return AdminDetail{}, err
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
		Where("project_id = ?", id).
		Scan(&usage).Error; err != nil {
		return AdminDetail{}, err
	}

	audit := AuditSummary{}
	auditQuery := r.db.WithContext(ctx).
		Model(&persistencemodel.AuditLog{}).
		Where("project_id = ? OR (target_type = ? AND target_id = ?)", id, "project", strconv.FormatUint(uint64(id), 10))
	if err := auditQuery.Count(&audit.Records).Error; err != nil {
		return AdminDetail{}, err
	}
	if audit.Records > 0 {
		var last persistencemodel.AuditLog
		if err := auditQuery.Order("created_at DESC, id DESC").First(&last).Error; err != nil {
			return AdminDetail{}, err
		}
		audit.LastAction = last.Action
		audit.LastAt = &last.CreatedAt
	}

	return AdminDetail{
		Project:          domainproject.ProjectFromModel(project),
		MemberCount:      memberCount,
		ScriptCount:      scriptCount,
		ContentUnitCount: contentUnitCount,
		AssetSlotCount:   assetSlotCount,
		ResourceCount:    resourceCount,
		Usage:            usage,
		Audit:            audit,
	}, nil
}

func (r *gormRepository) ForceSetOwner(ctx context.Context, projectID uint, ownerID uint) (domainproject.Project, error) {
	var updated persistencemodel.Project
	if projectID == 0 || ownerID == 0 {
		return domainproject.Project{}, ErrProjectNotFound
	}

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var owner persistencemodel.User
		if err := tx.Select("id, status").First(&owner, ownerID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrOwnerNotFound
			}
			return err
		}
		if !userIsActive(owner) {
			return ErrOwnerInactive
		}

		var project persistencemodel.Project
		if err := tx.First(&project, projectID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProjectNotFound
			}
			return err
		}

		if err := tx.Model(&persistencemodel.Project{}).Where("id = ?", project.ID).Update("owner_id", ownerID).Error; err != nil {
			return err
		}
		if err := tx.Model(&persistencemodel.ProjectMember{}).
			Where("project_id = ? AND user_id <> ? AND role = ?", project.ID, ownerID, domainproject.RoleOwner).
			Update("role", domainproject.RoleDirector).Error; err != nil {
			return err
		}

		result := tx.Model(&persistencemodel.ProjectMember{}).
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

func (r *gormRepository) AdminCreate(ctx context.Context, input AdminCreateInput) (domainproject.Project, error) {
	var project persistencemodel.Project
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var owner persistencemodel.User
		if err := tx.Select("id, status").First(&owner, input.OwnerID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrOwnerNotFound
			}
			return err
		}
		if !userIsActive(owner) {
			return ErrOwnerInactive
		}
		if input.OrgID != nil {
			var org persistencemodel.Organization
			if err := tx.Select("id, status").First(&org, *input.OrgID).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrProjectOrgNotFound
				}
				return err
			}
			if org.Status == domainorg.StatusSuspended {
				return ErrProjectOrgInactive
			}
		}
		project = domainproject.NewProject(input.Name, input.Description, input.TotalEpisodes, input.OwnerID, input.OrgID).ToModel()
		project.Status = input.Status
		project.AspectRatio = input.AspectRatio
		project.VisualStyle = input.VisualStyle
		project.ProjectStyle = input.ProjectStyle
		if err := tx.Create(&project).Error; err != nil {
			return err
		}
		member := domainproject.OwnerMember(project.ID, project.OwnerID).ToModel()
		if err := tx.Create(&member).Error; err != nil {
			return err
		}
		return tx.Preload("Owner").Preload("Members.User").First(&project, project.ID).Error
	})
	if err != nil {
		return domainproject.Project{}, err
	}
	return domainproject.ProjectFromModel(project), nil
}

func (r *gormRepository) Create(ctx context.Context, input CreateInput, ownerID uint, orgID *uint) (domainproject.Project, error) {
	project := domainproject.NewProject(input.Name, input.Description, input.TotalEpisodes, ownerID, orgID).ToModel()
	project.AspectRatio = input.AspectRatio
	project.VisualStyle = input.VisualStyle
	project.ProjectStyle = input.ProjectStyle
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
	var project persistencemodel.Project
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

func (r *gormRepository) BelongsToOrg(ctx context.Context, projectID uint, orgID uint) (bool, error) {
	var project persistencemodel.Project
	if err := r.db.WithContext(ctx).Select("id, org_id").Where("id = ?", projectID).First(&project).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, ErrProjectNotFound
		}
		return false, err
	}
	return project.OrgID != nil && *project.OrgID == orgID, nil
}

func (r *gormRepository) ResolveRole(ctx context.Context, projectID uint, userID uint, systemRole string) (domainproject.Role, error) {
	if projectID == 0 {
		return domainproject.Role{}, ErrProjectNotFound
	}
	if resolved, ok := domainproject.ResolveSystemRole(projectID, userID, systemRole); ok {
		var project persistencemodel.Project
		if err := r.db.WithContext(ctx).Select("id").First(&project, projectID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return domainproject.Role{}, ErrProjectNotFound
			}
			return domainproject.Role{}, err
		}
		return resolved, nil
	}

	var project persistencemodel.Project
	if err := r.db.WithContext(ctx).Select("id, owner_id").First(&project, projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainproject.Role{}, ErrProjectNotFound
		}
		return domainproject.Role{}, err
	}
	if resolved, ok := domainproject.ResolveOwnerRole(project.OwnerID, userID); ok {
		return resolved, nil
	}

	var member persistencemodel.ProjectMember
	if err := r.db.WithContext(ctx).Where("project_id = ? AND user_id = ?", projectID, userID).First(&member).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainproject.Role{}, ErrProjectMemberNotFound
		}
		return domainproject.Role{}, err
	}
	return domainproject.Role{Role: member.Role, UserID: userID}, nil
}

func (r *gormRepository) Update(ctx context.Context, id uint, input UpdateInput, orgID *uint) (domainproject.Project, error) {
	var project persistencemodel.Project
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
	project.AspectRatio = input.AspectRatio
	project.VisualStyle = input.VisualStyle
	project.ProjectStyle = input.ProjectStyle
	if err := r.db.WithContext(ctx).Save(&project).Error; err != nil {
		return domainproject.Project{}, err
	}
	return domainproject.ProjectFromModel(project), nil
}

func (r *gormRepository) AdminUpdate(ctx context.Context, id uint, spec adminUpdateSpec) (domainproject.Project, error) {
	var project persistencemodel.Project
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&project, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProjectNotFound
			}
			return err
		}
		updates := map[string]any{}
		if spec.Name != nil {
			updates["name"] = *spec.Name
		}
		if spec.Status != nil {
			updates["status"] = *spec.Status
		}
		if err := tx.Model(&persistencemodel.Project{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return err
		}
		return tx.Preload("Owner").Preload("Members.User").First(&project, id).Error
	})
	if err != nil {
		return domainproject.Project{}, err
	}
	return domainproject.ProjectFromModel(project), nil
}

func (r *gormRepository) Delete(ctx context.Context, id uint, orgID *uint) error {
	query := r.db.WithContext(ctx).Where("id = ?", id)
	if orgID != nil {
		query = query.Where("org_id = ?", *orgID)
	}
	result := query.Delete(&persistencemodel.Project{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrProjectNotFound
	}
	return nil
}

func (r *gormRepository) AddMember(ctx context.Context, projectID uint, input MemberInput, orgID *uint) (domainproject.Member, error) {
	var member persistencemodel.ProjectMember
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		query := tx.Where("id = ?", projectID)
		if orgID != nil {
			query = query.Where("org_id = ?", *orgID)
		}
		var project persistencemodel.Project
		if err := query.First(&project).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProjectNotFound
			}
			return err
		}
		var user persistencemodel.User
		if err := tx.Select("id, status").First(&user, input.UserID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrMemberUserNotFound
			}
			return err
		}
		if !userIsActive(user) {
			return ErrMemberUserInactive
		}
		var existing persistencemodel.ProjectMember
		if err := tx.Where("project_id = ? AND user_id = ?", projectID, input.UserID).First(&existing).Error; err == nil {
			if existing.Role == domainproject.RoleOwner || existing.UserID == project.OwnerID {
				return ErrProjectOwnerMemberLocked
			}
			if err := tx.Model(&persistencemodel.ProjectMember{}).Where("id = ?", existing.ID).Update("role", input.Role).Error; err != nil {
				return err
			}
			return tx.Preload("User").First(&member, existing.ID).Error
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		member = domainproject.NewMember(projectID, input.UserID, input.Role).ToModel()
		if err := tx.Create(&member).Error; err != nil {
			return err
		}
		return tx.Preload("User").First(&member, member.ID).Error
	})
	if err != nil {
		return domainproject.Member{}, err
	}
	return domainproject.MemberFromModel(member), nil
}

func userIsActive(user persistencemodel.User) bool {
	return user.Status == "" || user.Status == domainauth.UserStatusActive
}

func (r *gormRepository) UpdateMemberRole(ctx context.Context, projectID uint, memberID uint, role string, orgID *uint) (domainproject.Member, error) {
	var updated persistencemodel.ProjectMember
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var project persistencemodel.Project
		query := tx.Where("id = ?", projectID)
		if orgID != nil {
			query = query.Where("org_id = ?", *orgID)
		}
		if err := query.First(&project).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProjectNotFound
			}
			return err
		}
		var member persistencemodel.ProjectMember
		if err := tx.Where("project_id = ? AND id = ?", projectID, memberID).First(&member).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProjectMemberNotFound
			}
			return err
		}
		if member.UserID == project.OwnerID || member.Role == domainproject.RoleOwner {
			return ErrProjectOwnerMemberLocked
		}
		if err := tx.Model(&persistencemodel.ProjectMember{}).Where("id = ?", member.ID).Update("role", role).Error; err != nil {
			return err
		}
		return tx.Preload("User").First(&updated, member.ID).Error
	})
	if err != nil {
		return domainproject.Member{}, err
	}
	return domainproject.MemberFromModel(updated), nil
}

func (r *gormRepository) RemoveMember(ctx context.Context, projectID uint, memberID uint, orgID *uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var project persistencemodel.Project
		query := tx.Where("id = ?", projectID)
		if orgID != nil {
			query = query.Where("org_id = ?", *orgID)
		}
		if err := query.First(&project).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProjectNotFound
			}
			return err
		}
		var member persistencemodel.ProjectMember
		if err := tx.Where("project_id = ? AND id = ?", projectID, memberID).First(&member).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProjectMemberNotFound
			}
			return err
		}
		if member.UserID == project.OwnerID || member.Role == domainproject.RoleOwner {
			return ErrProjectOwnerMemberLocked
		}
		return tx.Delete(&member).Error
	})
}

func (r *gormRepository) ListMembers(ctx context.Context, projectID uint, orgID *uint) ([]domainproject.Member, error) {
	members := make([]persistencemodel.ProjectMember, 0)
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
	if err := db.Model(&persistencemodel.ScriptVersion{}).Where("project_id = ?", projectID).Count(&progress.Scripts).Error; err != nil {
		return progress, err
	}
	if err := db.Model(&persistencemodel.Segment{}).Where("project_id = ?", projectID).Count(&progress.Segments).Error; err != nil {
		return progress, err
	}
	if err := db.Model(&persistencemodel.ProjectMember{}).Where("project_id = ?", projectID).Count(&progress.Members).Error; err != nil {
		return progress, err
	}
	if err := db.Model(&persistencemodel.AssetSlot{}).Where("project_id = ?", projectID).Count(&progress.AssetSlots).Error; err != nil {
		return progress, err
	}
	type statusCount struct {
		Status string
		Count  int64
	}
	var contentUnitBreakdown []statusCount
	if err := db.Model(&persistencemodel.ContentUnit{}).
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
	if err := db.Model(&persistencemodel.Keyframe{}).Where("project_id = ? AND status IN ?", projectID, []string{"attached", "accepted"}).Count(&acceptedKeyframeCount).Error; err != nil {
		return progress, err
	}
	progress.Keyframes = map[string]int64{"accepted": acceptedKeyframeCount}
	return progress, nil
}

func projectSliceFromModels(items []persistencemodel.Project) []domainproject.Project {
	projects := make([]domainproject.Project, 0, len(items))
	for _, item := range items {
		projects = append(projects, domainproject.ProjectFromModel(item))
	}
	return projects
}

func memberSliceFromModels(items []persistencemodel.ProjectMember) []domainproject.Member {
	members := make([]domainproject.Member, 0, len(items))
	for _, item := range items {
		members = append(members, domainproject.MemberFromModel(item))
	}
	return members
}

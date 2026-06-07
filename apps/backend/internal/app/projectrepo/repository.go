package projectrepo

import (
	"context"
	"errors"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	GetProject(ctx context.Context, projectID uint, orgID *uint) (persistencemodel.Project, error)
	GetBinding(ctx context.Context, projectID uint) (persistencemodel.ProjectRepository, error)
	CreateBinding(ctx context.Context, binding persistencemodel.ProjectRepository) (persistencemodel.ProjectRepository, error)
	UpdateBindingOwner(ctx context.Context, bindingID uint, owner string) (persistencemodel.ProjectRepository, error)
	UpdateProvisioning(ctx context.Context, bindingID uint, status string, providerRepoID string, headCommit string, lastSyncError string) (persistencemodel.ProjectRepository, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) GetProject(ctx context.Context, projectID uint, orgID *uint) (persistencemodel.Project, error) {
	var project persistencemodel.Project
	query := r.db.WithContext(ctx).Preload("Owner").Preload("Organization").Where("id = ?", projectID)
	if orgID != nil {
		query = query.Where("org_id = ?", *orgID)
	}
	if err := query.First(&project).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return persistencemodel.Project{}, ErrProjectNotFound
		}
		return persistencemodel.Project{}, err
	}
	return project, nil
}

func (r *gormRepository) GetBinding(ctx context.Context, projectID uint) (persistencemodel.ProjectRepository, error) {
	var binding persistencemodel.ProjectRepository
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).First(&binding).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return persistencemodel.ProjectRepository{}, ErrRepositoryBindingMissing
		}
		return persistencemodel.ProjectRepository{}, err
	}
	return binding, nil
}

func (r *gormRepository) CreateBinding(ctx context.Context, binding persistencemodel.ProjectRepository) (persistencemodel.ProjectRepository, error) {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing persistencemodel.ProjectRepository
		if err := tx.Where("project_id = ?", binding.ProjectID).First(&existing).Error; err == nil {
			binding = existing
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		return tx.Create(&binding).Error
	})
	if err != nil {
		return persistencemodel.ProjectRepository{}, err
	}
	return binding, nil
}

func (r *gormRepository) UpdateBindingOwner(ctx context.Context, bindingID uint, owner string) (persistencemodel.ProjectRepository, error) {
	updates := map[string]any{
		"owner":            owner,
		"status":           StatusProvisioning,
		"provider_repo_id": "",
		"head_commit":      "",
		"last_sync_error":  "",
	}
	if err := r.db.WithContext(ctx).Model(&persistencemodel.ProjectRepository{}).Where("id = ?", bindingID).Updates(updates).Error; err != nil {
		return persistencemodel.ProjectRepository{}, err
	}
	var binding persistencemodel.ProjectRepository
	if err := r.db.WithContext(ctx).First(&binding, bindingID).Error; err != nil {
		return persistencemodel.ProjectRepository{}, err
	}
	return binding, nil
}

func (r *gormRepository) UpdateProvisioning(ctx context.Context, bindingID uint, status string, providerRepoID string, headCommit string, lastSyncError string) (persistencemodel.ProjectRepository, error) {
	updates := map[string]any{
		"status":          status,
		"last_sync_error": lastSyncError,
	}
	if providerRepoID != "" {
		updates["provider_repo_id"] = providerRepoID
	}
	if headCommit != "" {
		updates["head_commit"] = headCommit
	}
	if err := r.db.WithContext(ctx).Model(&persistencemodel.ProjectRepository{}).Where("id = ?", bindingID).Updates(updates).Error; err != nil {
		return persistencemodel.ProjectRepository{}, err
	}
	var binding persistencemodel.ProjectRepository
	if err := r.db.WithContext(ctx).First(&binding, bindingID).Error; err != nil {
		return persistencemodel.ProjectRepository{}, err
	}
	return binding, nil
}

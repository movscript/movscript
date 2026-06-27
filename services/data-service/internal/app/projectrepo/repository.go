package projectrepo

import (
	"context"
	"errors"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	GetProject(ctx context.Context, projectID uint, orgID *uint) (projectRecord, error)
	GetBinding(ctx context.Context, projectID uint) (repositoryBinding, error)
	CreateBinding(ctx context.Context, binding repositoryBinding) (repositoryBinding, error)
	UpdateBindingOwner(ctx context.Context, bindingID uint, owner string) (repositoryBinding, error)
	UpdateProvisioning(ctx context.Context, bindingID uint, status string, providerRepoID string, headCommit string, lastSyncError string) (repositoryBinding, error)
}

type projectRecord struct {
	ID          uint
	OwnerID     uint
	OrgID       *uint
	Description string
}

type repositoryBinding struct {
	ID             uint
	ProjectID      uint
	Provider       string
	ProviderRepoID string
	Owner          string
	Repo           string
	DefaultBranch  string
	HeadCommit     string
	Status         string
	LastSyncError  string
	CreatedBy      *uint
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) GetProject(ctx context.Context, projectID uint, orgID *uint) (projectRecord, error) {
	var project persistencemodel.Project
	query := r.db.WithContext(ctx).Where("id = ?", projectID)
	if orgID != nil {
		query = query.Where("org_id = ?", *orgID)
	}
	if err := query.First(&project).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return projectRecord{}, ErrProjectNotFound
		}
		return projectRecord{}, err
	}
	return projectRecordFromModel(project), nil
}

func (r *gormRepository) GetBinding(ctx context.Context, projectID uint) (repositoryBinding, error) {
	var binding persistencemodel.ProjectRepository
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).First(&binding).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return repositoryBinding{}, ErrRepositoryBindingMissing
		}
		return repositoryBinding{}, err
	}
	return repositoryBindingFromModel(binding), nil
}

func (r *gormRepository) CreateBinding(ctx context.Context, binding repositoryBinding) (repositoryBinding, error) {
	model := binding.toModel()
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing persistencemodel.ProjectRepository
		if err := tx.Where("project_id = ?", model.ProjectID).First(&existing).Error; err == nil {
			model = existing
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		return tx.Create(&model).Error
	})
	if err != nil {
		return repositoryBinding{}, err
	}
	return repositoryBindingFromModel(model), nil
}

func (r *gormRepository) UpdateBindingOwner(ctx context.Context, bindingID uint, owner string) (repositoryBinding, error) {
	updates := map[string]any{
		"owner":            owner,
		"status":           StatusProvisioning,
		"provider_repo_id": "",
		"head_commit":      "",
		"last_sync_error":  "",
	}
	if err := r.db.WithContext(ctx).Model(&persistencemodel.ProjectRepository{}).Where("id = ?", bindingID).Updates(updates).Error; err != nil {
		return repositoryBinding{}, err
	}
	var binding persistencemodel.ProjectRepository
	if err := r.db.WithContext(ctx).First(&binding, bindingID).Error; err != nil {
		return repositoryBinding{}, err
	}
	return repositoryBindingFromModel(binding), nil
}

func (r *gormRepository) UpdateProvisioning(ctx context.Context, bindingID uint, status string, providerRepoID string, headCommit string, lastSyncError string) (repositoryBinding, error) {
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
		return repositoryBinding{}, err
	}
	var binding persistencemodel.ProjectRepository
	if err := r.db.WithContext(ctx).First(&binding, bindingID).Error; err != nil {
		return repositoryBinding{}, err
	}
	return repositoryBindingFromModel(binding), nil
}

func projectRecordFromModel(project persistencemodel.Project) projectRecord {
	return projectRecord{
		ID:          project.ID,
		OwnerID:     project.OwnerID,
		OrgID:       project.OrgID,
		Description: project.Description,
	}
}

func repositoryBindingFromModel(binding persistencemodel.ProjectRepository) repositoryBinding {
	return repositoryBinding{
		ID:             binding.ID,
		ProjectID:      binding.ProjectID,
		Provider:       binding.Provider,
		ProviderRepoID: binding.ProviderRepoID,
		Owner:          binding.Owner,
		Repo:           binding.Repo,
		DefaultBranch:  binding.DefaultBranch,
		HeadCommit:     binding.HeadCommit,
		Status:         binding.Status,
		LastSyncError:  binding.LastSyncError,
		CreatedBy:      binding.CreatedBy,
	}
}

func (binding repositoryBinding) toModel() persistencemodel.ProjectRepository {
	model := persistencemodel.ProjectRepository{
		ProjectID:      binding.ProjectID,
		Provider:       binding.Provider,
		ProviderRepoID: binding.ProviderRepoID,
		Owner:          binding.Owner,
		Repo:           binding.Repo,
		DefaultBranch:  binding.DefaultBranch,
		HeadCommit:     binding.HeadCommit,
		Status:         binding.Status,
		LastSyncError:  binding.LastSyncError,
		CreatedBy:      binding.CreatedBy,
	}
	model.Model.ID = binding.ID
	return model
}

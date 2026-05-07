package job

import (
	"context"
	"errors"
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	List(ctx context.Context, filter ListFilter) (ListResult, error)
	Get(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, error)
	GetOwned(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, error)
	LoadInputResources(ctx context.Context, ids []uint, userID uint, orgID *uint) (InputResourcesResult, error)
	ResponseLookups(ctx context.Context, resourceIDs []uint, modelConfigIDs []uint) (ResponseLookups, error)
	GetCredential(ctx context.Context, id uint) (domainjob.AICredential, error)
	Create(ctx context.Context, job domainjob.Job) (domainjob.Job, error)
	Retry(ctx context.Context, job *domainjob.Job, message string) (domainjob.Job, error)
	MarkCancelled(ctx context.Context, id uint, userID uint, orgID *uint, providerStatus string, message string) (domainjob.Job, error)
	Delete(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, bool, error)
	EnsureProjectInOrg(ctx context.Context, projectID *uint, orgID *uint) error
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) List(ctx context.Context, filter ListFilter) (ListResult, error) {
	spec := domainjob.BuildListSpec(filter)
	q := r.db.WithContext(ctx).Model(&model.Job{}).Where("user_id = ?", filter.UserID)
	q = r.applyOrgScope(ctx, q, filter.OrgID, filter.UserID)
	if filter.ProjectID != nil {
		q = q.Where("project_id = ?", *filter.ProjectID)
	}
	if filter.Status != "" {
		q = q.Where("status = ?", filter.Status)
	}
	if filter.FeatureKey != "" {
		q = q.Where("feature_key = ?", filter.FeatureKey)
	}
	if len(spec.JobTypes) == 1 {
		q = q.Where("job_type = ?", spec.JobTypes[0])
	} else if len(spec.JobTypes) > 1 {
		q = q.Where("job_type IN ?", spec.JobTypes)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return ListResult{}, err
	}
	jobs := make([]model.Job, 0)
	if err := q.Preload("OutputResource").Order("id desc").Limit(spec.Limit).Offset(spec.Offset).Find(&jobs).Error; err != nil {
		return ListResult{}, err
	}
	return ListResult{Items: domainjob.JobsFromModels(jobs), Total: total}, nil
}

func (r *gormRepository) Get(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, error) {
	return r.getOwned(ctx, id, userID, orgID)
}

func (r *gormRepository) GetOwned(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, error) {
	return r.getOwned(ctx, id, userID, orgID)
}

func (r *gormRepository) LoadInputResources(ctx context.Context, ids []uint, userID uint, orgID *uint) (InputResourcesResult, error) {
	if len(ids) == 0 {
		return InputResourcesResult{}, nil
	}
	resources := make([]model.RawResource, 0)
	if err := r.db.WithContext(ctx).Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return InputResourcesResult{}, err
	}
	if len(resources) != len(ids) {
		return InputResourcesResult{}, ErrResourceOutsideOrg
	}
	for _, resource := range resources {
		if !r.inOrgScope(ctx, resource.OrgID, orgID, resource.OwnerID, userID) {
			return InputResourcesResult{}, ErrResourceOutsideOrg
		}
	}
	result := domainjob.CountInputResources(domainjob.InputResourcesFromRawResources(domainjob.RawResourcesFromModels(resources)))
	return InputResourcesResult{Resources: result.Resources, ImageCount: result.ImageCount, VideoCount: result.VideoCount}, nil
}

func (r *gormRepository) ResponseLookups(ctx context.Context, resourceIDs []uint, modelConfigIDs []uint) (ResponseLookups, error) {
	lookups := ResponseLookups{
		ResourcesByID:   map[uint]domainjob.RawResource{},
		ConfigsByID:     map[uint]domainjob.AIModelConfig{},
		CredentialsByID: map[uint]domainjob.AICredential{},
	}
	if len(resourceIDs) > 0 {
		resources := make([]model.RawResource, 0)
		if err := r.db.WithContext(ctx).Where("id IN ?", resourceIDs).Find(&resources).Error; err != nil {
			return lookups, err
		}
		for _, resource := range resources {
			lookups.ResourcesByID[resource.ID] = domainjob.RawResourceFromModel(resource)
		}
	}
	credentialIDSet := map[uint]bool{}
	if len(modelConfigIDs) > 0 {
		configs := make([]model.AIModelConfig, 0)
		if err := r.db.WithContext(ctx).Where("id IN ?", modelConfigIDs).Find(&configs).Error; err != nil {
			return lookups, err
		}
		for _, cfg := range configs {
			lookups.ConfigsByID[cfg.ID] = domainjob.AIModelConfigFromModel(cfg)
			credentialIDSet[cfg.CredentialID] = true
		}
	}
	credentialIDs := make([]uint, 0, len(credentialIDSet))
	for id := range credentialIDSet {
		credentialIDs = append(credentialIDs, id)
	}
	if len(credentialIDs) > 0 {
		creds := make([]model.AICredential, 0)
		if err := r.db.WithContext(ctx).Where("id IN ?", credentialIDs).Find(&creds).Error; err != nil {
			return lookups, err
		}
		for _, cred := range creds {
			lookups.CredentialsByID[cred.ID] = domainjob.AICredentialFromModel(cred)
		}
	}
	return lookups, nil
}

func (r *gormRepository) GetCredential(ctx context.Context, id uint) (domainjob.AICredential, error) {
	var cred model.AICredential
	if err := r.db.WithContext(ctx).First(&cred, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainjob.AICredential{}, ErrNotFound
		}
		return domainjob.AICredential{}, err
	}
	return domainjob.AICredentialFromModel(cred), nil
}

func (r *gormRepository) Create(ctx context.Context, job domainjob.Job) (domainjob.Job, error) {
	row := job.ToModel()
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return job, err
	}
	return domainjob.JobFromModel(row), nil
}

func (r *gormRepository) Retry(ctx context.Context, job *domainjob.Job, message string) (domainjob.Job, error) {
	now := time.Now()
	maxAttempts := job.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = domainjob.DefaultMaxAttempts
	}
	row := job.ToModel()
	if err := r.db.WithContext(ctx).Model(&row).Updates(map[string]any{
		"status":                domainjob.StatusPending,
		"attempt_count":         0,
		"max_attempts":          maxAttempts,
		"error_msg":             "",
		"next_run_at":           &now,
		"finished_at":           nil,
		"locked_by":             "",
		"lease_until":           nil,
		"last_heartbeat_at":     nil,
		"output_resource_id":    nil,
		"provider_task_id":      "",
		"provider_task_kind":    "",
		"provider_task_status":  "",
		"provider_task_history": "",
	}).Error; err != nil {
		return *job, err
	}
	MarkRetryScheduled(r.db.WithContext(ctx), &row, message)
	return r.reload(ctx, job.ID)
}

func (r *gormRepository) MarkCancelled(ctx context.Context, id uint, userID uint, orgID *uint, providerStatus string, message string) (domainjob.Job, error) {
	job, err := r.getOwned(ctx, id, userID, orgID)
	if err != nil {
		return job, err
	}
	now := time.Now()
	row := job.ToModel()
	if err := r.db.WithContext(ctx).Model(&row).Updates(map[string]any{
		"status":               domainjob.StatusCancelled,
		"provider_task_status": providerStatus,
		"error_msg":            message,
		"next_run_at":          nil,
		"finished_at":          &now,
		"locked_by":            "",
		"lease_until":          nil,
		"last_heartbeat_at":    &now,
	}).Error; err != nil {
		return job, err
	}
	return r.reload(ctx, job.ID)
}

func (r *gormRepository) Delete(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, bool, error) {
	job, err := r.getOwned(ctx, id, userID, orgID)
	if err != nil {
		return job, false, err
	}
	row := job.ToModel()
	releaseReservation := false
	if job.Status == domainjob.StatusPending {
		now := time.Now()
		if err := r.db.WithContext(ctx).Model(&row).Updates(map[string]any{
			"status":            domainjob.StatusCancelled,
			"error_msg":         "cancelled by user",
			"finished_at":       &now,
			"next_run_at":       nil,
			"locked_by":         "",
			"lease_until":       nil,
			"last_heartbeat_at": &now,
		}).Error; err != nil {
			return job, false, err
		}
		releaseReservation = job.UsageReservationID != nil
	} else if job.Status == domainjob.StatusRunning {
		return job, false, ErrRunningJobMustCancelDelete
	} else if err := r.db.WithContext(ctx).Delete(&row).Error; err != nil {
		return job, false, err
	}
	return job, releaseReservation, nil
}

func (r *gormRepository) EnsureProjectInOrg(ctx context.Context, projectID *uint, orgID *uint) error {
	if projectID == nil {
		return nil
	}
	var project model.Project
	if err := r.db.WithContext(ctx).Select("id, org_id").First(&project, *projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrProjectNotFound
		}
		return err
	}
	if !sameOrg(project.OrgID, orgID) {
		return ErrProjectOutsideOrg
	}
	return nil
}

func (r *gormRepository) getOwned(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, error) {
	var job model.Job
	if err := r.db.WithContext(ctx).Preload("OutputResource").First(&job, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainjob.Job{}, ErrNotFound
		}
		return domainjob.Job{}, err
	}
	if job.UserID != userID {
		return domainjob.JobFromModel(job), ErrForbidden
	}
	if !r.inOrgScope(ctx, job.OrgID, orgID, job.UserID, userID) {
		return domainjob.JobFromModel(job), ErrForbidden
	}
	return domainjob.JobFromModel(job), nil
}

func (r *gormRepository) reload(ctx context.Context, id uint) (domainjob.Job, error) {
	var job model.Job
	if err := r.db.WithContext(ctx).Preload("OutputResource").First(&job, id).Error; err != nil {
		return domainjob.Job{}, err
	}
	return domainjob.JobFromModel(job), nil
}

func (r *gormRepository) applyOrgScope(ctx context.Context, q *gorm.DB, orgID *uint, userID uint) *gorm.DB {
	if orgID == nil {
		return q.Where("org_id IS NULL")
	}
	if r.includeLegacyPersonal(ctx, orgID) {
		return q.Where("org_id = ? OR (org_id IS NULL AND user_id = ?)", *orgID, userID)
	}
	return q.Where("org_id = ?", *orgID)
}

func (r *gormRepository) inOrgScope(ctx context.Context, entityOrgID *uint, currentOrgID *uint, ownerID uint, userID uint) bool {
	if sameOrg(entityOrgID, currentOrgID) {
		return true
	}
	return r.includeLegacyPersonal(ctx, currentOrgID) && entityOrgID == nil && ownerID == userID
}

func (r *gormRepository) includeLegacyPersonal(ctx context.Context, orgID *uint) bool {
	if orgID == nil {
		return true
	}
	var org model.Organization
	if err := r.db.WithContext(ctx).Select("is_personal").First(&org, *orgID).Error; err != nil {
		return false
	}
	return org.IsPersonal
}

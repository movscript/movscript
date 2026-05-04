package job

import (
	"context"
	"errors"
	"time"

	jobrunner "github.com/movscript/movscript/internal/job"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

var (
	ErrNotFound                   = errors.New("job not found")
	ErrForbidden                  = errors.New("job forbidden")
	ErrSucceededJobCannotRetry    = errors.New("succeeded jobs cannot be retried")
	ErrRunningJobCannotRetry      = errors.New("running jobs cannot be retried until they fail or time out")
	ErrOnlyVideoJobsCanCancel     = errors.New("only video generation jobs can be cancelled")
	ErrFinishedJobCannotCancel    = errors.New("finished jobs cannot be cancelled")
	ErrInvalidCancelStatus        = errors.New("job cannot be cancelled from current status")
	ErrRunningJobMustCancelDelete = errors.New("running jobs must be cancelled before deletion")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type ListFilter struct {
	UserID     uint
	ProjectID  *uint
	Status     string
	FeatureKey string
	JobType    string
	ExactType  bool
	Limit      int
	Offset     int
}

type ListResult struct {
	Items []model.Job
	Total int64
}

type InputResourcesResult struct {
	Resources  []model.RawResource
	ImageCount int
	VideoCount int
}

type ResponseLookups struct {
	ResourcesByID   map[uint]model.RawResource
	ConfigsByID     map[uint]model.AIModelConfig
	CredentialsByID map[uint]model.AICredential
}

type CreateInput struct {
	UserID             uint
	ModelConfigID      uint
	JobType            string
	FeatureKey         string
	Prompt             string
	ExtraParams        string
	AspectRatio        string
	Duration           int
	RequestContext     string
	InputResourceID    *uint
	InputResourceIDs   string
	UsageReservationID *uint
	ProjectID          *uint
}

func (s *Service) List(ctx context.Context, filter ListFilter) (ListResult, error) {
	q := s.db.WithContext(ctx).Model(&model.Job{}).Where("user_id = ?", filter.UserID)
	if filter.ProjectID != nil {
		q = q.Where("project_id = ?", *filter.ProjectID)
	}
	if filter.Status != "" {
		q = q.Where("status = ?", filter.Status)
	}
	if filter.FeatureKey != "" {
		q = q.Where("feature_key = ?", filter.FeatureKey)
	}
	if filter.JobType != "" {
		if filter.JobType == "image" && !filter.ExactType {
			q = q.Where("job_type IN ?", []string{"image", "image_edit"})
		} else {
			q = q.Where("job_type = ?", filter.JobType)
		}
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return ListResult{}, err
	}
	jobs := make([]model.Job, 0)
	if err := q.Preload("OutputResource").Order("id desc").Limit(filter.Limit).Offset(filter.Offset).Find(&jobs).Error; err != nil {
		return ListResult{}, err
	}
	return ListResult{Items: jobs, Total: total}, nil
}

func (s *Service) Get(ctx context.Context, id uint, userID uint) (model.Job, error) {
	var job model.Job
	if err := s.db.WithContext(ctx).Preload("OutputResource").First(&job, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return job, ErrNotFound
		}
		return job, err
	}
	if job.UserID != userID {
		return job, ErrForbidden
	}
	return job, nil
}

func (s *Service) LoadInputResources(ctx context.Context, ids []uint) (InputResourcesResult, error) {
	if len(ids) == 0 {
		return InputResourcesResult{}, nil
	}
	resources := make([]model.RawResource, 0)
	if err := s.db.WithContext(ctx).Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return InputResourcesResult{}, err
	}
	result := InputResourcesResult{Resources: resources}
	for _, r := range resources {
		switch r.Type {
		case "image":
			result.ImageCount++
		case "video":
			result.VideoCount++
		}
	}
	return result, nil
}

func (s *Service) ResponseLookups(ctx context.Context, resourceIDs []uint, modelConfigIDs []uint) (ResponseLookups, error) {
	lookups := ResponseLookups{
		ResourcesByID:   map[uint]model.RawResource{},
		ConfigsByID:     map[uint]model.AIModelConfig{},
		CredentialsByID: map[uint]model.AICredential{},
	}
	if len(resourceIDs) > 0 {
		resources := make([]model.RawResource, 0)
		if err := s.db.WithContext(ctx).Where("id IN ?", resourceIDs).Find(&resources).Error; err != nil {
			return lookups, err
		}
		for _, r := range resources {
			lookups.ResourcesByID[r.ID] = r
		}
	}
	credentialIDSet := map[uint]bool{}
	if len(modelConfigIDs) > 0 {
		configs := make([]model.AIModelConfig, 0)
		if err := s.db.WithContext(ctx).Where("id IN ?", modelConfigIDs).Find(&configs).Error; err != nil {
			return lookups, err
		}
		for _, cfg := range configs {
			lookups.ConfigsByID[cfg.ID] = cfg
			credentialIDSet[cfg.CredentialID] = true
		}
	}
	credentialIDs := make([]uint, 0, len(credentialIDSet))
	for id := range credentialIDSet {
		credentialIDs = append(credentialIDs, id)
	}
	if len(credentialIDs) > 0 {
		creds := make([]model.AICredential, 0)
		if err := s.db.WithContext(ctx).Where("id IN ?", credentialIDs).Find(&creds).Error; err != nil {
			return lookups, err
		}
		for _, cred := range creds {
			lookups.CredentialsByID[cred.ID] = cred
		}
	}
	return lookups, nil
}

func (s *Service) GetCredential(ctx context.Context, id uint) (model.AICredential, error) {
	var cred model.AICredential
	if err := s.db.WithContext(ctx).First(&cred, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return cred, ErrNotFound
		}
		return cred, err
	}
	return cred, nil
}

func (s *Service) Create(ctx context.Context, input CreateInput) (model.Job, error) {
	job := model.Job{
		UserID:             input.UserID,
		ModelConfigID:      input.ModelConfigID,
		JobType:            input.JobType,
		FeatureKey:         input.FeatureKey,
		Status:             jobrunner.StatusPending,
		MaxAttempts:        jobrunner.DefaultMaxAttempts,
		Prompt:             input.Prompt,
		ExtraParams:        input.ExtraParams,
		AspectRatio:        input.AspectRatio,
		Duration:           input.Duration,
		RequestContext:     input.RequestContext,
		InputResourceID:    input.InputResourceID,
		InputResourceIDs:   input.InputResourceIDs,
		UsageReservationID: input.UsageReservationID,
		ProjectID:          input.ProjectID,
	}
	if err := s.db.WithContext(ctx).Create(&job).Error; err != nil {
		return job, err
	}
	return job, nil
}

func (s *Service) Retry(ctx context.Context, id uint, userID uint) (model.Job, error) {
	job, err := s.getOwned(ctx, id, userID)
	if err != nil {
		return job, err
	}
	if job.Status == jobrunner.StatusSucceeded {
		return job, ErrSucceededJobCannotRetry
	}
	if job.Status == jobrunner.StatusRunning {
		return job, ErrRunningJobCannotRetry
	}

	now := time.Now()
	maxAttempts := job.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = jobrunner.DefaultMaxAttempts
	}
	if err := s.db.WithContext(ctx).Model(&job).Updates(map[string]any{
		"status":                jobrunner.StatusPending,
		"attempt_count":         0,
		"max_attempts":          maxAttempts,
		"error_msg":             "",
		"next_run_at":           &now,
		"finished_at":           nil,
		"last_heartbeat_at":     nil,
		"output_resource_id":    nil,
		"provider_task_id":      "",
		"provider_task_kind":    "",
		"provider_task_status":  "",
		"provider_task_history": "",
	}).Error; err != nil {
		return job, err
	}
	jobrunner.MarkRetryScheduled(s.db.WithContext(ctx), &job, "manual retry requested")
	return s.reload(ctx, job.ID)
}

func (s *Service) ValidateCancellation(ctx context.Context, id uint, userID uint) (model.Job, error) {
	job, err := s.getOwned(ctx, id, userID)
	if err != nil {
		return job, err
	}
	if !isVideoJob(job.JobType) {
		return job, ErrOnlyVideoJobsCanCancel
	}
	switch job.Status {
	case jobrunner.StatusCancelled:
		return job, nil
	case jobrunner.StatusSucceeded, jobrunner.StatusFailed:
		return job, ErrFinishedJobCannotCancel
	case jobrunner.StatusPending, jobrunner.StatusRunning:
	default:
		return job, ErrInvalidCancelStatus
	}
	return job, nil
}

func (s *Service) MarkCancelled(ctx context.Context, id uint, userID uint, providerStatus string, message string) (model.Job, error) {
	job, err := s.getOwned(ctx, id, userID)
	if err != nil {
		return job, err
	}
	now := time.Now()
	if err := s.db.WithContext(ctx).Model(&job).Updates(map[string]any{
		"status":               jobrunner.StatusCancelled,
		"provider_task_status": providerStatus,
		"error_msg":            message,
		"next_run_at":          nil,
		"finished_at":          &now,
		"last_heartbeat_at":    &now,
	}).Error; err != nil {
		return job, err
	}
	return s.reload(ctx, job.ID)
}

func (s *Service) Delete(ctx context.Context, id uint, userID uint) (model.Job, bool, error) {
	job, err := s.getOwned(ctx, id, userID)
	if err != nil {
		return job, false, err
	}
	releaseReservation := false
	if job.Status == jobrunner.StatusPending {
		now := time.Now()
		if err := s.db.WithContext(ctx).Model(&job).Updates(map[string]any{
			"status":            jobrunner.StatusCancelled,
			"error_msg":         "cancelled by user",
			"finished_at":       &now,
			"next_run_at":       nil,
			"last_heartbeat_at": &now,
		}).Error; err != nil {
			return job, false, err
		}
		releaseReservation = job.UsageReservationID != nil
	} else if job.Status == jobrunner.StatusRunning {
		return job, false, ErrRunningJobMustCancelDelete
	} else if err := s.db.WithContext(ctx).Delete(&job).Error; err != nil {
		return job, false, err
	}
	return job, releaseReservation, nil
}

func (s *Service) getOwned(ctx context.Context, id uint, userID uint) (model.Job, error) {
	var job model.Job
	if err := s.db.WithContext(ctx).First(&job, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return job, ErrNotFound
		}
		return job, err
	}
	if job.UserID != userID {
		return job, ErrForbidden
	}
	return job, nil
}

func (s *Service) reload(ctx context.Context, id uint) (model.Job, error) {
	var job model.Job
	if err := s.db.WithContext(ctx).Preload("OutputResource").First(&job, id).Error; err != nil {
		return job, err
	}
	return job, nil
}

func isVideoJob(jobType string) bool {
	return jobType == "video" || jobType == "video_i2v" || jobType == "video_v2v"
}

package job

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
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
	ErrUnsupportedProviderCancel  = errors.New("this provider does not support video task cancellation")
	ErrProviderCancellationFailed = errors.New("provider cancellation failed")
	ErrInvalidJobType             = errors.New("invalid job type")
	ErrJobTypeRequired            = errors.New("job_type is required")
	ErrCredentialNotFound         = errors.New("credential not found")
	ErrProjectNotFound            = errors.New("project not found")
	ErrProjectOutsideOrg          = errors.New("project is outside current org")
	ErrResourceOutsideOrg         = errors.New("resource is outside current org")
	ErrLoadInputResources         = errors.New("failed to load input resources")
	ErrReserveQuota               = errors.New("failed to reserve job quota")
	ErrCreateJob                  = errors.New("failed to create job")
)

type InvalidJobTypeError struct {
	JobType string
}

func (e InvalidJobTypeError) Error() string {
	return "invalid job_type: " + e.JobType
}

func (e InvalidJobTypeError) Unwrap() error {
	return ErrInvalidJobType
}

func IsInsufficientQuota(err error) bool {
	return errors.Is(err, ai.ErrInsufficientQuota)
}

type Service struct {
	db *gorm.DB
	ai *ai.AIService
}

func NewService(db *gorm.DB, aiService ...*ai.AIService) *Service {
	var svc *ai.AIService
	if len(aiService) > 0 {
		svc = aiService[0]
	}
	return &Service{db: db, ai: svc}
}

type ListFilter struct {
	UserID     uint
	OrgID      *uint
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
	OrgID              *uint
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

type EnqueueInput struct {
	UserID           uint
	OrgID            *uint
	ModelConfigID    uint
	JobType          string
	FeatureKey       string
	Prompt           string
	ExtraParams      string
	AspectRatio      string
	Duration         int
	InputResourceID  *uint
	InputResourceIDs []uint
	ProjectID        *uint
	CreatedAt        time.Time
}

func (s *Service) List(ctx context.Context, filter ListFilter) (ListResult, error) {
	q := s.db.WithContext(ctx).Model(&model.Job{}).Where("user_id = ?", filter.UserID)
	q = s.applyOrgScope(ctx, q, filter.OrgID, filter.UserID)
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

func (s *Service) Get(ctx context.Context, id uint, userID uint, orgID *uint) (model.Job, error) {
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
	if !s.inOrgScope(ctx, job.OrgID, orgID, job.UserID, userID) {
		return job, ErrForbidden
	}
	return job, nil
}

func (s *Service) LoadInputResources(ctx context.Context, ids []uint, userID uint, orgID *uint) (InputResourcesResult, error) {
	if len(ids) == 0 {
		return InputResourcesResult{}, nil
	}
	resources := make([]model.RawResource, 0)
	if err := s.db.WithContext(ctx).Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return InputResourcesResult{}, err
	}
	if len(resources) != len(ids) {
		return InputResourcesResult{}, ErrResourceOutsideOrg
	}
	result := InputResourcesResult{Resources: resources}
	for _, r := range resources {
		if !s.inOrgScope(ctx, r.OrgID, orgID, r.OwnerID, userID) {
			return InputResourcesResult{}, ErrResourceOutsideOrg
		}
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
		OrgID:              input.OrgID,
		ModelConfigID:      input.ModelConfigID,
		JobType:            input.JobType,
		FeatureKey:         input.FeatureKey,
		Status:             StatusPending,
		MaxAttempts:        DefaultMaxAttempts,
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

func (s *Service) EnqueueGeneration(ctx context.Context, input EnqueueInput) (model.Job, error) {
	if s.ai == nil {
		return model.Job{}, errors.New("ai service is required")
	}
	if input.JobType == "" {
		return model.Job{}, ErrJobTypeRequired
	}
	switch input.JobType {
	case ai.CapabilityImage, ai.CapabilityImageEdit,
		ai.CapabilityVideo, ai.CapabilityVideoI2V, ai.CapabilityVideoV2V:
	default:
		return model.Job{}, InvalidJobTypeError{JobType: input.JobType}
	}
	if err := s.ensureProjectInOrg(ctx, input.ProjectID, input.OrgID); err != nil {
		return model.Job{}, err
	}

	allIDs := MergeIDs(input.InputResourceIDs, input.InputResourceID)
	inputResources, err := s.LoadInputResources(ctx, allIDs, input.UserID, input.OrgID)
	if err != nil {
		return model.Job{}, wrapErr(ErrLoadInputResources, err)
	}

	preflight, err := s.ai.PreflightGeneration(ai.GenerationPreflightRequest{
		ModelConfigID: input.ModelConfigID,
		OutputType:    input.JobType,
		ExtraParams:   input.ExtraParams,
		AspectRatio:   input.AspectRatio,
		Duration:      input.Duration,
		ImageCount:    inputResources.ImageCount,
		VideoCount:    inputResources.VideoCount,
	})
	if err != nil {
		return model.Job{}, err
	}

	cred, err := s.GetCredential(ctx, preflight.Config.CredentialID)
	if err != nil {
		return model.Job{}, ErrCredentialNotFound
	}

	inputResourceIDsJSON := ""
	if len(allIDs) > 0 {
		b, _ := json.Marshal(allIDs)
		inputResourceIDsJSON = string(b)
	}
	var legacyInputID *uint
	if len(allIDs) > 0 {
		legacyInputID = &allIDs[0]
	}

	createdAt := input.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now()
	}
	requestContext := BuildContextSnapshot(ContextSnapshotInput{
		Model:          preflight.Config,
		Credential:     cred,
		JobType:        input.JobType,
		FeatureKey:     input.FeatureKey,
		Prompt:         input.Prompt,
		ExtraParams:    input.ExtraParams,
		AspectRatio:    input.AspectRatio,
		Duration:       input.Duration,
		InputResources: OrderedResources(inputResources.Resources, allIDs),
		CreatedAt:      createdAt,
	})

	estimate, err := s.estimateJobCost(input.ModelConfigID, input.JobType, input.Duration, input.ExtraParams, input.AspectRatio)
	if err != nil {
		return model.Job{}, err
	}
	reservation, err := s.ai.ReserveQuota(ctx, input.UserID, input.ModelConfigID, estimate, ai.BillingContext{OrgID: input.OrgID, ProjectID: input.ProjectID})
	if err != nil {
		if errors.Is(err, ai.ErrInsufficientQuota) {
			return model.Job{}, err
		}
		return model.Job{}, wrapErr(ErrReserveQuota, err)
	}

	job, err := s.Create(ctx, CreateInput{
		UserID:             input.UserID,
		OrgID:              input.OrgID,
		ModelConfigID:      input.ModelConfigID,
		JobType:            input.JobType,
		FeatureKey:         input.FeatureKey,
		Prompt:             input.Prompt,
		ExtraParams:        input.ExtraParams,
		AspectRatio:        input.AspectRatio,
		Duration:           input.Duration,
		RequestContext:     requestContext,
		InputResourceID:    legacyInputID,
		InputResourceIDs:   inputResourceIDsJSON,
		UsageReservationID: &reservation.ID,
		ProjectID:          input.ProjectID,
	})
	if err != nil {
		_ = s.ai.ReleaseReservation(ctx, reservation.ID, "gen job create failed")
		return model.Job{}, wrapErr(ErrCreateJob, err)
	}
	_ = s.ai.SetReservationJob(ctx, reservation.ID, job.ID)
	return job, nil
}

func (s *Service) estimateJobCost(modelConfigID uint, jobType string, duration int, extraParams, aspectRatio string) (ai.UsageEstimate, error) {
	kind, imageReq, videoReq, err := CostRequest(modelConfigID, jobType, duration, extraParams, aspectRatio)
	if err != nil {
		return ai.UsageEstimate{}, err
	}
	switch kind {
	case "image":
		return s.ai.EstimateImageCost(modelConfigID, imageReq)
	case "video":
		return s.ai.EstimateVideoCost(modelConfigID, videoReq)
	default:
		return ai.UsageEstimate{}, err
	}
}

func (s *Service) Retry(ctx context.Context, id uint, userID uint, orgID *uint) (model.Job, error) {
	job, err := s.getOwned(ctx, id, userID, orgID)
	if err != nil {
		return job, err
	}
	if job.Status == StatusSucceeded {
		return job, ErrSucceededJobCannotRetry
	}
	if job.Status == StatusRunning {
		return job, ErrRunningJobCannotRetry
	}

	now := time.Now()
	maxAttempts := job.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = DefaultMaxAttempts
	}
	if err := s.db.WithContext(ctx).Model(&job).Updates(map[string]any{
		"status":                StatusPending,
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
	MarkRetryScheduled(s.db.WithContext(ctx), &job, "manual retry requested")
	return s.reload(ctx, job.ID)
}

func (s *Service) ValidateCancellation(ctx context.Context, id uint, userID uint, orgID *uint) (model.Job, error) {
	job, err := s.getOwned(ctx, id, userID, orgID)
	if err != nil {
		return job, err
	}
	if !isVideoJob(job.JobType) {
		return job, ErrOnlyVideoJobsCanCancel
	}
	switch job.Status {
	case StatusCancelled:
		return job, nil
	case StatusSucceeded, StatusFailed:
		return job, ErrFinishedJobCannotCancel
	case StatusPending, StatusRunning:
	default:
		return job, ErrInvalidCancelStatus
	}
	return job, nil
}

func (s *Service) Cancel(ctx context.Context, id uint, userID uint, orgID *uint) (model.Job, error) {
	if s.ai == nil {
		return model.Job{}, errors.New("ai service is required")
	}
	job, err := s.ValidateCancellation(ctx, id, userID, orgID)
	if err != nil {
		return job, err
	}
	if job.Status == StatusCancelled {
		return job, nil
	}
	if !s.ai.SupportsVideoTaskCancellation(job.ModelConfigID) {
		return job, ErrUnsupportedProviderCancel
	}

	providerStatus := ai.VideoStatusCancelled
	message := "cancelled by user"
	if job.ProviderTaskID != "" {
		resp, err := s.ai.CallVideoCancel(ctx, job.ModelConfigID, job.ProviderTaskID, job.ProviderTaskKind)
		if err != nil {
			return job, wrapErr(ErrProviderCancellationFailed, err)
		}
		providerStatus = FirstNonEmpty(resp.Status, ai.VideoStatusCancelled)
		message = FirstNonEmpty(resp.Message, message)
	}

	job, err = s.MarkCancelled(ctx, id, userID, orgID, providerStatus, message)
	if err != nil {
		return job, err
	}
	if job.UsageReservationID != nil {
		_ = s.ai.ReleaseReservation(ctx, *job.UsageReservationID, "cancelled by user")
	}
	return job, nil
}

func (s *Service) MarkCancelled(ctx context.Context, id uint, userID uint, orgID *uint, providerStatus string, message string) (model.Job, error) {
	job, err := s.getOwned(ctx, id, userID, orgID)
	if err != nil {
		return job, err
	}
	now := time.Now()
	if err := s.db.WithContext(ctx).Model(&job).Updates(map[string]any{
		"status":               StatusCancelled,
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

func (s *Service) Delete(ctx context.Context, id uint, userID uint, orgID *uint) (model.Job, bool, error) {
	job, err := s.getOwned(ctx, id, userID, orgID)
	if err != nil {
		return job, false, err
	}
	releaseReservation := false
	if job.Status == StatusPending {
		now := time.Now()
		if err := s.db.WithContext(ctx).Model(&job).Updates(map[string]any{
			"status":            StatusCancelled,
			"error_msg":         "cancelled by user",
			"finished_at":       &now,
			"next_run_at":       nil,
			"last_heartbeat_at": &now,
		}).Error; err != nil {
			return job, false, err
		}
		releaseReservation = job.UsageReservationID != nil
	} else if job.Status == StatusRunning {
		return job, false, ErrRunningJobMustCancelDelete
	} else if err := s.db.WithContext(ctx).Delete(&job).Error; err != nil {
		return job, false, err
	}
	return job, releaseReservation, nil
}

func (s *Service) DeleteAndRelease(ctx context.Context, id uint, userID uint, orgID *uint) error {
	job, releaseReservation, err := s.Delete(ctx, id, userID, orgID)
	if err != nil {
		return err
	}
	if releaseReservation && job.UsageReservationID != nil && s.ai != nil {
		_ = s.ai.ReleaseReservation(ctx, *job.UsageReservationID, "cancelled by user")
	}
	return nil
}

func wrapErr(base error, err error) error {
	if err == nil {
		return base
	}
	return fmt.Errorf("%w: %w", base, err)
}

func (s *Service) getOwned(ctx context.Context, id uint, userID uint, orgID *uint) (model.Job, error) {
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
	if !s.inOrgScope(ctx, job.OrgID, orgID, job.UserID, userID) {
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

func (s *Service) ensureProjectInOrg(ctx context.Context, projectID *uint, orgID *uint) error {
	if projectID == nil {
		return nil
	}
	var project model.Project
	if err := s.db.WithContext(ctx).Select("id, org_id").First(&project, *projectID).Error; err != nil {
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

func (s *Service) applyOrgScope(ctx context.Context, q *gorm.DB, orgID *uint, userID uint) *gorm.DB {
	if orgID == nil {
		return q.Where("org_id IS NULL")
	}
	if s.includeLegacyPersonal(ctx, orgID) {
		return q.Where("org_id = ? OR (org_id IS NULL AND user_id = ?)", *orgID, userID)
	}
	return q.Where("org_id = ?", *orgID)
}

func (s *Service) inOrgScope(ctx context.Context, entityOrgID *uint, currentOrgID *uint, ownerID uint, userID uint) bool {
	if sameOrg(entityOrgID, currentOrgID) {
		return true
	}
	return s.includeLegacyPersonal(ctx, currentOrgID) && entityOrgID == nil && ownerID == userID
}

func (s *Service) includeLegacyPersonal(ctx context.Context, orgID *uint) bool {
	if orgID == nil {
		return true
	}
	var org model.Organization
	if err := s.db.WithContext(ctx).Select("is_personal").First(&org, *orgID).Error; err != nil {
		return false
	}
	return org.IsPersonal
}

func sameOrg(a, b *uint) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func isVideoJob(jobType string) bool {
	return domainjob.IsVideoJob(jobType)
}

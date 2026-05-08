package job

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
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
	ErrReserveUsage               = errors.New("failed to reserve job usage")
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

func IsUsageLimitExceeded(err error) bool {
	return errors.Is(err, ai.ErrUsageLimitExceeded)
}

type Service struct {
	repo repository
	ai   *ai.AIService
}

func NewService(db *gorm.DB, aiService ...*ai.AIService) *Service {
	var svc *ai.AIService
	if len(aiService) > 0 {
		svc = aiService[0]
	}
	return &Service{repo: newRepository(db), ai: svc}
}

type ListFilter = domainjob.ListFilter

type ListResult struct {
	Items []domainjob.Job
	Total int64
}

type InputResourcesResult struct {
	Resources  []domainjob.InputResource
	ImageCount int
	VideoCount int
}

type ResponseLookups struct {
	ResourcesByID   map[uint]domainjob.RawResource
	ConfigsByID     map[uint]domainjob.AIModelConfig
	CredentialsByID map[uint]domainjob.AICredential
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
	return s.repo.List(ctx, filter)
}

func (s *Service) Get(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, error) {
	return s.repo.Get(ctx, id, userID, orgID)
}

func (s *Service) LoadInputResources(ctx context.Context, ids []uint, userID uint, orgID *uint) (InputResourcesResult, error) {
	return s.repo.LoadInputResources(ctx, ids, userID, orgID)
}

func (s *Service) ResponseLookups(ctx context.Context, resourceIDs []uint, modelConfigIDs []uint) (ResponseLookups, error) {
	return s.repo.ResponseLookups(ctx, resourceIDs, modelConfigIDs)
}

func (s *Service) GetCredential(ctx context.Context, id uint) (domainjob.AICredential, error) {
	return s.repo.GetCredential(ctx, id)
}

func (s *Service) Create(ctx context.Context, input CreateInput) (domainjob.Job, error) {
	job := domainjob.NewQueuedJob(domainjob.NewQueuedJobSpec(input))
	return s.repo.Create(ctx, job)
}

func (s *Service) EnqueueGeneration(ctx context.Context, input EnqueueInput) (domainjob.Job, error) {
	if s.ai == nil {
		return domainjob.Job{}, errors.New("ai service is required")
	}
	if input.JobType == "" {
		return domainjob.Job{}, ErrJobTypeRequired
	}
	switch input.JobType {
	case ai.CapabilityImage, ai.CapabilityImageEdit,
		ai.CapabilityVideo, ai.CapabilityVideoI2V, ai.CapabilityVideoV2V:
	default:
		return domainjob.Job{}, InvalidJobTypeError{JobType: input.JobType}
	}
	if err := s.repo.EnsureProjectInOrg(ctx, input.ProjectID, input.OrgID); err != nil {
		return domainjob.Job{}, err
	}

	allIDs := MergeIDs(input.InputResourceIDs, input.InputResourceID)
	inputResources, err := s.LoadInputResources(ctx, allIDs, input.UserID, input.OrgID)
	if err != nil {
		return domainjob.Job{}, wrapErr(ErrLoadInputResources, err)
	}

	runtimeModelConfigID, err := s.ai.ResolveRuntimeGenerationModel(input.ModelConfigID, input.JobType)
	if err != nil {
		return domainjob.Job{}, err
	}
	preflight, err := s.ai.PreflightGeneration(ai.GenerationPreflightRequest{
		ModelConfigID: runtimeModelConfigID,
		OutputType:    input.JobType,
		ExtraParams:   input.ExtraParams,
		AspectRatio:   input.AspectRatio,
		Duration:      input.Duration,
		ImageCount:    inputResources.ImageCount,
		VideoCount:    inputResources.VideoCount,
	})
	if err != nil {
		return domainjob.Job{}, err
	}
	if err := s.requireImageVerification(preflight.Def, inputResources.Resources); err != nil {
		return domainjob.Job{}, err
	}

	cred, err := s.GetCredential(ctx, preflight.Config.CredentialID)
	if err != nil {
		return domainjob.Job{}, ErrCredentialNotFound
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
		Model:          domainjob.AIModelConfigFromModel(preflight.Config),
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

	estimate, err := s.estimateJobCost(preflight.Config.ID, input.JobType, input.Duration, input.ExtraParams, input.AspectRatio)
	if err != nil {
		return domainjob.Job{}, err
	}
	reservation, err := s.ai.ReserveUsage(ctx, input.UserID, preflight.Config.ID, estimate, ai.UsageContext{OrgID: input.OrgID, ProjectID: input.ProjectID})
	if err != nil {
		if errors.Is(err, ai.ErrUsageLimitExceeded) {
			return domainjob.Job{}, err
		}
		return domainjob.Job{}, wrapErr(ErrReserveUsage, err)
	}

	job, err := s.Create(ctx, CreateInput{
		UserID:             input.UserID,
		OrgID:              input.OrgID,
		ModelConfigID:      preflight.Config.ID,
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
		return domainjob.Job{}, wrapErr(ErrCreateJob, err)
	}
	_ = s.ai.SetReservationJob(ctx, reservation.ID, job.ID)
	return job, nil
}

func (s *Service) requireImageVerification(def *ai.ModelDef, resources []domainjob.InputResource) error {
	if !def.RequiresImageVerification() {
		return nil
	}
	for _, resource := range resources {
		if resource.Type != "image" {
			continue
		}
		if resource.VerificationStatus != string(ai.ImageVerificationVerified) {
			return ai.ErrImageVerificationRequired
		}
	}
	return nil
}

func (s *Service) estimateJobCost(modelConfigID uint, jobType string, duration int, extraParams, aspectRatio string) (ai.UsageEstimate, error) {
	kind, imageReq, videoReq, err := CostRequest(modelConfigID, jobType, duration, extraParams, aspectRatio)
	if err != nil {
		return ai.UsageEstimate{}, err
	}
	switch kind {
	case domainjob.CostRequestImage:
		return s.ai.EstimateImageCost(modelConfigID, imageReq)
	case domainjob.CostRequestVideo:
		return s.ai.EstimateVideoCost(modelConfigID, videoReq)
	default:
		return ai.UsageEstimate{}, err
	}
}

func (s *Service) Retry(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, error) {
	job, err := s.repo.GetOwned(ctx, id, userID, orgID)
	if err != nil {
		return job, err
	}
	if job.Status == domainjob.StatusSucceeded {
		return job, ErrSucceededJobCannotRetry
	}
	if job.Status == domainjob.StatusRunning {
		return job, ErrRunningJobCannotRetry
	}
	return s.repo.Retry(ctx, &job, "manual retry requested")
}

func (s *Service) ValidateCancellation(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, error) {
	job, err := s.repo.GetOwned(ctx, id, userID, orgID)
	if err != nil {
		return job, err
	}
	if !isVideoJob(job.JobType) {
		return job, ErrOnlyVideoJobsCanCancel
	}
	switch job.Status {
	case domainjob.StatusCancelled:
		return job, nil
	case domainjob.StatusSucceeded, domainjob.StatusFailed:
		return job, ErrFinishedJobCannotCancel
	case domainjob.StatusPending, domainjob.StatusRunning:
	default:
		return job, ErrInvalidCancelStatus
	}
	return job, nil
}

func (s *Service) Cancel(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, error) {
	if s.ai == nil {
		return domainjob.Job{}, errors.New("ai service is required")
	}
	job, err := s.ValidateCancellation(ctx, id, userID, orgID)
	if err != nil {
		return job, err
	}
	if job.Status == domainjob.StatusCancelled {
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

func (s *Service) MarkCancelled(ctx context.Context, id uint, userID uint, orgID *uint, providerStatus string, message string) (domainjob.Job, error) {
	return s.repo.MarkCancelled(ctx, id, userID, orgID, providerStatus, message)
}

func (s *Service) Delete(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, bool, error) {
	return s.repo.Delete(ctx, id, userID, orgID)
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

func sameOrg(a, b *uint) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func isVideoJob(jobType string) bool {
	return domainjob.IsVideoJob(jobType)
}

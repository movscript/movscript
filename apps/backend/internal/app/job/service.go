package job

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
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
	repo    repository
	ai      *ai.AIService
	routing providercontract.AIGatewayRoutingPolicy
}

func NewService(db *gorm.DB, aiService ...*ai.AIService) *Service {
	var svc *ai.AIService
	if len(aiService) > 0 {
		svc = aiService[0]
	}
	service := &Service{repo: newRepository(db), ai: svc}
	if svc != nil {
		service.routing = svc
	}
	return service
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
	ResourcesByID      map[uint]domainjob.RawResource
	CatalogEntriesByID map[uint]ModelCatalogEntryLookup
}

type ModelCatalogEntryLookup struct {
	ID            uint
	PublicModelID string
	DisplayName   string
	ShortName     string
}

type CreateInput struct {
	UserID                uint
	OrgID                 *uint
	RuntimeModelID        uint
	AIModelCatalogEntryID *uint
	RouteBindingID        *uint
	RouteGroup            string
	JobType               string
	FeatureKey            string
	Title                 string
	Prompt                string
	ExtraParams           string
	AspectRatio           string
	Duration              int
	RequestContext        string
	InputResourceID       *uint
	InputResourceIDs      string
	UsageReservationID    *uint
	ProjectID             *uint
}

type EnqueueInput struct {
	UserID                uint
	OrgID                 *uint
	ModelID               string
	RuntimeModelID        uint
	AIModelCatalogEntryID *uint
	JobType               string
	FeatureKey            string
	Title                 string
	Prompt                string
	ExtraParams           string
	AspectRatio           string
	Duration              int
	InputResourceID       *uint
	InputResourceIDs      []uint
	ProjectID             *uint
	CreatedAt             time.Time
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

func (s *Service) ResponseLookups(ctx context.Context, resourceIDs []uint, catalogEntryIDs []uint) (ResponseLookups, error) {
	return s.repo.ResponseLookups(ctx, resourceIDs, catalogEntryIDs)
}

func (s *Service) GetCredential(ctx context.Context, id uint) (domainjob.AICredential, error) {
	return s.repo.GetCredential(ctx, id)
}

func (s *Service) Create(ctx context.Context, input CreateInput) (domainjob.Job, error) {
	input.Title = strings.TrimSpace(input.Title)
	job := domainjob.NewQueuedJob(domainjob.NewQueuedJobSpec{
		UserID:                input.UserID,
		OrgID:                 input.OrgID,
		RuntimeModelID:        input.RuntimeModelID,
		AIModelCatalogEntryID: input.AIModelCatalogEntryID,
		RouteBindingID:        input.RouteBindingID,
		RouteGroup:            input.RouteGroup,
		JobType:               input.JobType,
		FeatureKey:            input.FeatureKey,
		Title:                 input.Title,
		Prompt:                input.Prompt,
		ExtraParams:           input.ExtraParams,
		AspectRatio:           input.AspectRatio,
		Duration:              input.Duration,
		RequestContext:        input.RequestContext,
		InputResourceID:       input.InputResourceID,
		InputResourceIDs:      input.InputResourceIDs,
		UsageReservationID:    input.UsageReservationID,
		ProjectID:             input.ProjectID,
	})
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
		ai.CapabilityVideo, ai.CapabilityVideoI2V, ai.CapabilityVideoV2V,
		ai.CapabilityAudioTTS, ai.CapabilityAudioSTT,
		ai.CapabilityAudioMusic, ai.CapabilityAudioSFX,
		ai.CapabilitySubAlign, ai.CapabilitySubTranslate:
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

	route, err := s.resolveGenerationModelRoute(ctx, input)
	if err != nil {
		return domainjob.Job{}, err
	}
	aiRoute := aiRouteFromGateway(route)
	preflight, err := s.ai.PreflightGenerationRoute(ctx, input.UserID, ai.GenerationRoutePreflightRequest{
		Route:       aiRoute,
		OutputType:  input.JobType,
		ExtraParams: input.ExtraParams,
		AspectRatio: input.AspectRatio,
		Duration:    input.Duration,
		ImageCount:  inputResources.ImageCount,
		VideoCount:  inputResources.VideoCount,
	})
	if err != nil {
		return domainjob.Job{}, err
	}
	if err := s.requireImageVerification(preflight.Def, inputResources.Resources); err != nil {
		return domainjob.Job{}, err
	}

	cred, err := s.credentialForRouteSnapshot(ctx, route, preflight.CredentialID)
	if err != nil {
		return domainjob.Job{}, err
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
		Model:          preflightModelSnapshot(preflight),
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

	estimate, err := s.estimateJobRouteCost(ctx, input.UserID, aiRoute, input.JobType, input.Duration, input.ExtraParams, input.AspectRatio)
	if err != nil {
		return domainjob.Job{}, err
	}
	usage := ai.UsageContext{OrgID: input.OrgID, ProjectID: input.ProjectID}
	if route.CatalogEntryID != 0 {
		usage.AIModelCatalogEntryID = &route.CatalogEntryID
	}
	if route.RouteBindingID != 0 {
		usage.RouteBindingID = &route.RouteBindingID
	}
	runtimeModelID := aiRoute.RuntimeModelID
	reservation, err := s.ai.ReserveUsage(ctx, input.UserID, runtimeModelID, estimate, usage)
	if err != nil {
		if errors.Is(err, ai.ErrUsageLimitExceeded) {
			return domainjob.Job{}, err
		}
		return domainjob.Job{}, wrapErr(ErrReserveUsage, err)
	}

	job, err := s.Create(ctx, CreateInput{
		UserID:                input.UserID,
		OrgID:                 input.OrgID,
		RuntimeModelID:        runtimeModelID,
		AIModelCatalogEntryID: catalogEntryIDPtr(route.CatalogEntryID),
		RouteBindingID:        routeBindingIDPtr(route.RouteBindingID),
		RouteGroup:            route.RouteGroup,
		JobType:               input.JobType,
		FeatureKey:            input.FeatureKey,
		Title:                 strings.TrimSpace(input.Title),
		Prompt:                input.Prompt,
		ExtraParams:           input.ExtraParams,
		AspectRatio:           input.AspectRatio,
		Duration:              input.Duration,
		RequestContext:        requestContext,
		InputResourceID:       legacyInputID,
		InputResourceIDs:      inputResourceIDsJSON,
		UsageReservationID:    &reservation.ID,
		ProjectID:             input.ProjectID,
	})
	if err != nil {
		_ = s.ai.ReleaseReservation(ctx, reservation.ID, "gen job create failed")
		return domainjob.Job{}, wrapErr(ErrCreateJob, err)
	}
	_ = s.ai.SetReservationJob(ctx, reservation.ID, job.ID)
	return job, nil
}

func (s *Service) resolveGenerationModelRoute(ctx context.Context, input EnqueueInput) (providercontract.AIGatewayModelRoute, error) {
	if s.routing == nil {
		return providercontract.AIGatewayModelRoute{}, errors.New("ai routing policy is required")
	}
	if input.AIModelCatalogEntryID != nil && *input.AIModelCatalogEntryID != 0 {
		return s.routing.ResolveGatewayModelRoute(ctx, providercontract.AIGatewayRouteRequest{
			CatalogEntryID: *input.AIModelCatalogEntryID,
			Capability:     input.JobType,
		})
	}
	modelID := strings.TrimSpace(input.ModelID)
	if modelID != "" {
		return s.routing.ResolveGatewayGenerationModelRoute(ctx, modelID, input.JobType)
	}
	return providercontract.AIGatewayModelRoute{}, errors.New("model_id is required")
}

func catalogEntryIDPtr(id uint) *uint {
	if id == 0 {
		return nil
	}
	return &id
}

func routeBindingIDPtr(id uint) *uint {
	if id == 0 {
		return nil
	}
	return &id
}

func aiRouteFromGateway(route providercontract.AIGatewayModelRoute) ai.ModelRoute {
	return ai.ModelRoute{
		ModelID:         route.ModelID,
		RuntimeModelID:  route.CatalogEntryID,
		CatalogEntryID:  route.CatalogEntryID,
		RouteBindingID:  route.RouteBindingID,
		CredentialID:    route.CredentialID,
		SourceType:      route.SourceType,
		RouteGroup:      route.RouteGroup,
		ProviderID:      route.ProviderID,
		ProviderModelID: route.ProviderModelID,
		SelectionReason: route.SelectionReason,
		EstimatedCost:   route.EstimatedCost,
	}
}

func preflightModelSnapshot(preflight ai.GenerationPreflightResult) domainjob.RuntimeModelSnapshotInput {
	return domainjob.RuntimeModelSnapshotInput{
		ID:                preflight.SnapshotModel.ID,
		CredentialID:      preflight.SnapshotModel.CredentialID,
		ModelDefID:        preflight.SnapshotModel.ModelDefID,
		ModelIDOverride:   preflight.SnapshotModel.ModelIDOverride,
		CustomDisplayName: preflight.SnapshotModel.CustomDisplayName,
	}
}

func (s *Service) credentialForRouteSnapshot(ctx context.Context, route providercontract.AIGatewayModelRoute, credentialID uint) (domainjob.AICredential, error) {
	if credentialID != 0 {
		cred, err := s.GetCredential(ctx, credentialID)
		if err == nil {
			return cred, nil
		}
		if route.SourceType == "" {
			return domainjob.AICredential{}, ErrCredentialNotFound
		}
	}
	if route.CredentialID != 0 {
		cred, err := s.GetCredential(ctx, route.CredentialID)
		if err == nil {
			return cred, nil
		}
	}
	display := strings.TrimSpace(route.SourceType)
	if display == "" {
		display = "catalog"
	}
	if route.ProviderModelID != "" {
		display += " / " + route.ProviderModelID
	}
	return domainjob.AICredential{
		ID:          route.CredentialID,
		AdapterType: route.SourceType,
		DisplayName: display,
		IsEnabled:   true,
	}, nil
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

func (s *Service) estimateJobRouteCost(ctx context.Context, userID uint, route ai.ModelRoute, jobType string, duration int, extraParams, aspectRatio string) (ai.UsageEstimate, error) {
	if jobType == ai.CapabilityAudioTTS {
		return s.ai.EstimateAudioTTSRouteCost(ctx, userID, route)
	}
	if jobType == ai.CapabilityAudioMusic || jobType == ai.CapabilityAudioSFX {
		return s.ai.EstimateAudioGenerateRouteCost(ctx, userID, route, jobType, duration)
	}
	if jobType == ai.CapabilityAudioSTT || jobType == ai.CapabilitySubAlign || jobType == ai.CapabilitySubTranslate {
		return s.ai.EstimateCapabilityPerCallRouteCost(ctx, userID, route, jobType)
	}
	kind, imageReq, videoReq, err := CostRequest(route.RuntimeModelID, jobType, duration, extraParams, aspectRatio)
	if err != nil {
		return ai.UsageEstimate{}, err
	}
	switch kind {
	case domainjob.CostRequestImage:
		return s.ai.EstimateImageRouteCost(ctx, userID, route, imageReq)
	case domainjob.CostRequestVideo:
		return s.ai.EstimateVideoRouteCost(ctx, userID, route, videoReq)
	default:
		return ai.UsageEstimate{}, err
	}
}

func (s *Service) Retry(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, error) {
	job, err := s.repo.GetOwned(ctx, id, userID, orgID)
	if err != nil {
		return job, err
	}
	return s.retryJob(ctx, job, "manual retry requested")
}

func (s *Service) RetryAdmin(ctx context.Context, id uint) (domainjob.Job, error) {
	job, err := s.repo.GetAny(ctx, id)
	if err != nil {
		return job, err
	}
	return s.retryJob(ctx, job, "admin retry requested")
}

func (s *Service) retryJob(ctx context.Context, job domainjob.Job, message string) (domainjob.Job, error) {
	if job.Status == domainjob.StatusSucceeded {
		return job, ErrSucceededJobCannotRetry
	}
	if job.Status == domainjob.StatusRunning {
		return job, ErrRunningJobCannotRetry
	}
	return s.repo.Retry(ctx, &job, message)
}

func (s *Service) ValidateCancellation(ctx context.Context, id uint, userID uint, orgID *uint) (domainjob.Job, error) {
	job, err := s.repo.GetOwned(ctx, id, userID, orgID)
	if err != nil {
		return job, err
	}
	return validateCancellation(job)
}

func (s *Service) ValidateAdminCancellation(ctx context.Context, id uint) (domainjob.Job, error) {
	job, err := s.repo.GetAny(ctx, id)
	if err != nil {
		return job, err
	}
	return validateCancellation(job)
}

func validateCancellation(job domainjob.Job) (domainjob.Job, error) {
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
	return s.cancelValidatedJob(ctx, job, func(providerStatus string, message string) (domainjob.Job, error) {
		return s.MarkCancelled(ctx, id, userID, orgID, providerStatus, message)
	}, "cancelled by user")
}

func (s *Service) CancelAdmin(ctx context.Context, id uint) (domainjob.Job, error) {
	if s.ai == nil {
		return domainjob.Job{}, errors.New("ai service is required")
	}
	job, err := s.ValidateAdminCancellation(ctx, id)
	if err != nil {
		return job, err
	}
	return s.cancelValidatedJob(ctx, job, func(providerStatus string, message string) (domainjob.Job, error) {
		return s.MarkCancelledAdmin(ctx, id, providerStatus, message)
	}, "cancelled by admin")
}

func (s *Service) cancelValidatedJob(ctx context.Context, job domainjob.Job, markCancelled func(providerStatus string, message string) (domainjob.Job, error), fallbackMessage string) (domainjob.Job, error) {
	if job.Status == domainjob.StatusCancelled {
		return job, nil
	}
	route, err := s.resolveJobModelRoute(ctx, job, job.JobType)
	if err != nil {
		return job, err
	}
	if !s.ai.SupportsVideoTaskCancellationRoute(ctx, job.UserID, route) {
		return job, ErrUnsupportedProviderCancel
	}

	providerStatus := ai.VideoStatusCancelled
	message := "cancelled by user"
	if job.ProviderTaskID != "" {
		resp, err := s.ai.CallVideoCancelRoute(ctx, job.UserID, route, job.ProviderTaskID, job.ProviderTaskKind)
		if err != nil {
			return job, wrapErr(ErrProviderCancellationFailed, err)
		}
		providerStatus = FirstNonEmpty(resp.Status, ai.VideoStatusCancelled)
		message = FirstNonEmpty(resp.Message, message)
	}

	cancelledJob, err := markCancelled(providerStatus, message)
	if err != nil {
		return cancelledJob, err
	}
	if cancelledJob.UsageReservationID != nil {
		_ = s.ai.ReleaseReservation(ctx, *cancelledJob.UsageReservationID, fallbackMessage)
	}
	return cancelledJob, nil
}

func (s *Service) resolveJobModelRoute(ctx context.Context, job domainjob.Job, capability string) (ai.ModelRoute, error) {
	if strings.TrimSpace(job.RouteGroup) != "" {
		ctx = ai.WithProviderRouteGroup(ctx, strings.TrimSpace(job.RouteGroup))
	}
	catalogEntryID := uint(0)
	routeBindingID := uint(0)
	if job.RouteBindingID != nil && *job.RouteBindingID != 0 {
		routeBindingID = *job.RouteBindingID
	}
	if job.AIModelCatalogEntryID != nil && *job.AIModelCatalogEntryID != 0 {
		catalogEntryID = *job.AIModelCatalogEntryID
	}
	if catalogEntryID == 0 && routeBindingID == 0 {
		return ai.ModelRoute{}, errors.New("job route binding or catalog entry is required")
	}
	return s.ai.ResolveModelRoute(ai.ModelRouteRequest{
		CatalogEntryID: catalogEntryID,
		RouteBindingID: routeBindingID,
		Capability:     capability,
		RouteGroup:     strings.TrimSpace(job.RouteGroup),
	})
}

func (s *Service) MarkCancelled(ctx context.Context, id uint, userID uint, orgID *uint, providerStatus string, message string) (domainjob.Job, error) {
	return s.repo.MarkCancelled(ctx, id, userID, orgID, providerStatus, message)
}

func (s *Service) MarkCancelledAdmin(ctx context.Context, id uint, providerStatus string, message string) (domainjob.Job, error) {
	return s.repo.MarkCancelledAny(ctx, id, providerStatus, message)
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

func (s *Service) DeleteAndReleaseAdmin(ctx context.Context, id uint) (domainjob.Job, error) {
	job, releaseReservation, err := s.repo.DeleteAny(ctx, id)
	if err != nil {
		return job, err
	}
	if releaseReservation && job.UsageReservationID != nil && s.ai != nil {
		_ = s.ai.ReleaseReservation(ctx, *job.UsageReservationID, "cancelled by admin")
	}
	return job, nil
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

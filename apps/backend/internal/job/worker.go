package job

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/cloudup"
	"github.com/movscript/movscript/internal/media"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/storage"
	"gorm.io/gorm"
)

// Worker is a pool of goroutines that execute pending Job records.
type Worker struct {
	db            *gorm.DB
	aiService     *ai.AIService
	store         storage.Storage
	encryptionKey []byte
	client        *http.Client
}

const (
	jobExecutionTimeout = 10 * time.Minute
	providerCallTimeout = 8 * time.Minute
	providerPollTimeout = 90 * time.Second
	videoPollInterval   = 30 * time.Second
	heartbeatInterval   = 15 * time.Second
	staleRunningTimeout = 12 * time.Minute
)

var errJobCancelled = errors.New("generation job cancelled")

func NewWorker(db *gorm.DB, aiService *ai.AIService, store storage.Storage, encryptionKey []byte) *Worker {
	return &Worker{
		db:            db,
		aiService:     aiService,
		store:         store,
		encryptionKey: encryptionKey,
		client:        &http.Client{Timeout: 10 * time.Minute},
	}
}

// cloudupService loads enabled cloud file configs from DB and builds a cloudup.Service.
// Returns nil (no error) if no configs are enabled — callers must check HasUploaders().
func (w *Worker) cloudupService() *cloudup.Service {
	var rows []model.CloudFileConfig
	if err := w.db.Where("is_enabled = true AND deleted_at IS NULL").Order("priority asc").Find(&rows).Error; err != nil {
		return nil
	}
	svc, err := cloudup.NewFromDBConfigs(rows, w.encryptionKey)
	if err != nil {
		log.Printf("[job] cloudup init error: %v", err)
		return nil
	}
	return svc
}

// Start launches n worker goroutines. Cancel ctx to stop them gracefully.
func (w *Worker) Start(ctx context.Context, n int) {
	for i := 0; i < n; i++ {
		go w.loop(ctx)
	}
}

func (w *Worker) loop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
			w.processOne(ctx)
		}
	}
}

// processOne atomically claims one pending job and executes it.
func (w *Worker) processOne(ctx context.Context) {
	w.requeueStaleRunningJobs(ctx)

	var job model.Job
	// Atomically claim a pending job using PostgreSQL FOR UPDATE SKIP LOCKED.
	result := w.db.Raw(`
		UPDATE jobs
		SET status='running',
			started_at=NOW(),
			finished_at=NULL,
			next_run_at=NULL,
			attempt_count=attempt_count + CASE WHEN COALESCE(provider_task_id, '') = '' THEN 1 ELSE 0 END,
			last_heartbeat_at=NOW(),
			error_msg='',
			updated_at=NOW()
		WHERE id = (
			SELECT id FROM jobs
			WHERE status='pending'
				AND deleted_at IS NULL
				AND (next_run_at IS NULL OR next_run_at <= NOW())
				AND ((max_attempts <= 0 OR attempt_count < max_attempts) OR COALESCE(provider_task_id, '') <> '')
			ORDER BY COALESCE(next_run_at, created_at), created_at
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		RETURNING *
	`).Scan(&job)

	if result.Error != nil || job.ID == 0 {
		return
	}

	maxAttempts := effectiveMaxAttempts(&job)
	newJobStateMachine(w, &job).enter(StateClaimed, fmt.Sprintf("worker claimed job (attempt %d/%d)", job.AttemptCount, maxAttempts))
	log.Printf("[job] picked job #%d type=%s user=%d attempt=%d/%d", job.ID, job.JobType, job.UserID, job.AttemptCount, maxAttempts)

	if err := w.execute(ctx, &job); err != nil {
		w.completeFailure(&job, err)
	}
}

func (w *Worker) completeFailure(job *model.Job, err error) {
	if err == nil {
		return
	}
	if errors.Is(err, errJobCancelled) || w.isJobCancelled(job.ID) {
		return
	}
	now := time.Now()
	maxAttempts := effectiveMaxAttempts(job)
	if job.AttemptCount < maxAttempts {
		nextRun := now.Add(retryDelay(job.AttemptCount))
		w.db.Model(job).Updates(map[string]any{
			"status":            StatusPending,
			"error_msg":         err.Error(),
			"next_run_at":       &nextRun,
			"last_heartbeat_at": &now,
			"finished_at":       nil,
		})
		newJobStateMachine(w, job).finish(StateRetryScheduled, fmt.Sprintf("retry scheduled at %s", nextRun.Format(time.RFC3339)))
		log.Printf("[job] job #%d failed attempt %d/%d, retry at %s: %v", job.ID, job.AttemptCount, maxAttempts, nextRun.Format(time.RFC3339), err)
		return
	}

	w.db.Model(job).Updates(map[string]any{
		"status":            StatusFailed,
		"error_msg":         err.Error(),
		"finished_at":       &now,
		"next_run_at":       nil,
		"last_heartbeat_at": &now,
	})
	if job.UsageReservationID != nil {
		_ = w.aiService.ReleaseReservation(context.Background(), *job.UsageReservationID, err.Error())
	}
	log.Printf("[job] job #%d failed after %d/%d attempts: %v", job.ID, job.AttemptCount, maxAttempts, err)
}

func (w *Worker) isJobCancelled(jobID uint) bool {
	var status string
	if err := w.db.Model(&model.Job{}).
		Select("status").
		Where("id = ?", jobID).
		Scan(&status).Error; err != nil {
		return false
	}
	return status == StatusCancelled
}

func (w *Worker) abortIfCancelled(ctx context.Context, job *model.Job, sm *jobStateMachine) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if !w.isJobCancelled(job.ID) {
		return nil
	}
	job.Status = StatusCancelled
	sm.cancel("job cancelled")
	return errJobCancelled
}

func (w *Worker) requeueStaleRunningJobs(ctx context.Context) {
	if ctx.Err() != nil {
		return
	}
	threshold := time.Now().Add(-staleRunningTimeout)
	var jobs []model.Job
	if err := w.db.Where(`
		status = ?
		AND deleted_at IS NULL
		AND (last_heartbeat_at IS NULL OR last_heartbeat_at < ?)
	`, StatusRunning, threshold).
		Order("updated_at asc").
		Limit(10).
		Find(&jobs).Error; err != nil {
		log.Printf("[job] stale running scan failed: %v", err)
		return
	}
	if len(jobs) == 0 {
		return
	}

	now := time.Now()
	for i := range jobs {
		job := &jobs[i]
		if job.ProviderTaskID != "" {
			nextRun := now.Add(videoPollInterval)
			msg := fmt.Sprintf("worker heartbeat stale for %s; provider task will be polled again", staleRunningTimeout)
			if err := w.db.Model(job).Updates(map[string]any{
				"status":      StatusPending,
				"error_msg":   msg,
				"next_run_at": &nextRun,
				"finished_at": nil,
			}).Error; err != nil {
				log.Printf("[job] stale provider task job #%d requeue failed: %v", job.ID, err)
				continue
			}
			newJobStateMachine(w, job).finish(StateWaitingProviderTask, msg)
			log.Printf("[job] stale provider task job #%d scheduled for polling", job.ID)
			continue
		}

		maxAttempts := effectiveMaxAttempts(job)
		if job.AttemptCount < maxAttempts {
			msg := fmt.Sprintf("worker heartbeat stale for %s; requeued", staleRunningTimeout)
			if err := w.db.Model(job).Updates(map[string]any{
				"status":      StatusPending,
				"error_msg":   msg,
				"next_run_at": &now,
				"finished_at": nil,
			}).Error; err != nil {
				log.Printf("[job] stale job #%d requeue failed: %v", job.ID, err)
				continue
			}
			newJobStateMachine(w, job).finish(StateRetryScheduled, msg)
			log.Printf("[job] stale running job #%d requeued", job.ID)
			continue
		}

		msg := fmt.Sprintf("worker heartbeat stale for %s; max attempts exhausted", staleRunningTimeout)
		if err := w.db.Model(job).Updates(map[string]any{
			"status":      StatusFailed,
			"error_msg":   msg,
			"finished_at": &now,
			"next_run_at": nil,
		}).Error; err != nil {
			log.Printf("[job] stale job #%d fail update failed: %v", job.ID, err)
			continue
		}
		newJobStateMachine(w, job).fail(fmt.Errorf("%s", msg))
		log.Printf("[job] stale running job #%d marked failed", job.ID)
	}
}

func (w *Worker) heartbeat(ctx context.Context, jobID uint) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now()
			w.db.Model(&model.Job{}).Where("id = ? AND status = ?", jobID, StatusRunning).Update("last_heartbeat_at", &now)
		}
	}
}

func effectiveMaxAttempts(job *model.Job) int {
	if job.MaxAttempts > 0 {
		return job.MaxAttempts
	}
	return DefaultMaxAttempts
}

func retryDelay(attempt int) time.Duration {
	if attempt <= 1 {
		return 10 * time.Second
	}
	delay := time.Duration(1<<min(attempt-1, 5)) * 10 * time.Second
	if delay > 5*time.Minute {
		return 5 * time.Minute
	}
	return delay
}

func callProviderWithTimeout[T any](ctx context.Context, timeout time.Duration, call func(context.Context) (T, error)) (T, error) {
	callCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	type result struct {
		value T
		err   error
	}
	done := make(chan result, 1)
	go func() {
		value, err := call(callCtx)
		done <- result{value: value, err: err}
	}()

	select {
	case res := <-done:
		return res.value, res.err
	case <-callCtx.Done():
		var zero T
		if callCtx.Err() == context.DeadlineExceeded {
			return zero, fmt.Errorf("provider call timed out after %s: %w", timeout, callCtx.Err())
		}
		return zero, callCtx.Err()
	}
}

func (w *Worker) execute(ctx context.Context, job *model.Job) (err error) {
	callCtx, cancel := context.WithTimeout(ctx, jobExecutionTimeout)
	defer cancel()
	heartbeatCtx, stopHeartbeat := context.WithCancel(callCtx)
	defer stopHeartbeat()
	go w.heartbeat(heartbeatCtx, job.ID)

	sm := newJobStateMachine(w, job)

	// Attach a debug recorder so adapters can capture the raw HTTP exchange.
	debugCtx, debugResult := ai.WithDebugRecorder(callCtx)
	defer func() {
		if err == nil {
			return
		}
		if debugResult != nil {
			debugResult.Success = false
			if debugResult.Error == "" {
				debugResult.Error = err.Error()
			}
			w.saveDebugInfo(job, debugResult)
		}
		sm.fail(err)
	}()

	// Resolve @[resource:ID] mentions in the prompt.
	// This populates InputResourceID (legacy) and merges mention IDs into InputResourceIDs.
	// All mention markers are stripped from the prompt text sent to the model.
	sm.enter(StateResolvingInputs, "resolve resource mentions in prompt")
	if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
		return err
	}
	job.Prompt, job.InputResourceID, job.InputResourceIDs = w.resolveMentions(job.Prompt, job.InputResourceID, job.InputResourceIDs)
	sm.succeed("resource mentions resolved")

	// Parse extra params (size, quality, duration, aspect_ratio, etc.)
	sm.enter(StatePreparingRequest, "parse job params")
	var extra map[string]interface{}
	if job.ExtraParams != "" {
		_ = json.Unmarshal([]byte(job.ExtraParams), &extra)
	}
	if extra == nil {
		extra = map[string]interface{}{}
	}
	extra = ai.NormalizeGenerationParams(extra)

	getString := func(key string) string {
		if v, ok := extra[key]; ok {
			if s, ok := v.(string); ok {
				return s
			}
		}
		return ""
	}
	getInt := func(key string) int {
		if v, ok := extra[key]; ok {
			switch n := v.(type) {
			case float64:
				return int(n)
			case int:
				return n
			case string:
				i, err := strconv.Atoi(strings.TrimSpace(n))
				if err == nil {
					return i
				}
			}
		}
		return 0
	}
	getInt64Ptr := func(key string) *int64 {
		if v, ok := extra[key]; ok {
			switch n := v.(type) {
			case float64:
				i := int64(n)
				return &i
			case int:
				i := int64(n)
				return &i
			case int64:
				i := n
				return &i
			case string:
				i, err := strconv.ParseInt(strings.TrimSpace(n), 10, 64)
				if err == nil {
					return &i
				}
			}
		}
		return nil
	}
	getFloat := func(key string) float64 {
		if v, ok := extra[key]; ok {
			switch n := v.(type) {
			case float64:
				return n
			case int:
				return float64(n)
			case string:
				f, err := strconv.ParseFloat(strings.TrimSpace(n), 64)
				if err == nil {
					return f
				}
			}
		}
		return 0
	}
	getBool := func(key string) bool {
		p := getBoolPtr(extra, key)
		return p != nil && *p
	}
	sm.succeed("job params parsed")

	// Load all input resources as raw bytes from storage, classified by type.
	sm.enter(StateLoadingInputs, "load input resources from storage")
	if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
		return err
	}
	imageData, videoData := w.loadInputResources(job)
	sm.succeed(fmt.Sprintf("loaded %d image inputs and %d video inputs", len(imageData), len(videoData)))

	var resultURL string
	var mimeType string

	sm.enter(StatePreparingRequest, "resolve model and debug context")

	// Determine effective output type from job_type.
	outputType := job.JobType

	// Resolve the model def ID for debug context.
	modelDefID := ""
	if mcfg := w.loadModelConfig(job.ModelConfigID); mcfg != nil {
		modelDefID = mcfg.ModelDefID
	}

	// Pre-populate job-level context in the debug record before any adapter call.
	debugResult.JobType = outputType
	debugResult.JobModelDefID = modelDefID
	debugResult.JobResolvedPrompt = job.Prompt
	debugResult.JobInputResourceIDs = parseResourceIDs(job.InputResourceIDs)
	if job.InputResourceID != nil {
		// ensure legacy single ID is included
		found := false
		for _, id := range debugResult.JobInputResourceIDs {
			if id == *job.InputResourceID {
				found = true
				break
			}
		}
		if !found {
			debugResult.JobInputResourceIDs = append(debugResult.JobInputResourceIDs, *job.InputResourceID)
		}
	}
	sm.succeed("request context prepared")

	switch outputType {
	case ai.CapabilityImage:
		if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
			return err
		}
		cloudFileID := w.prepareImageInputReferences(job, imageData)
		req := ai.ImageRequest{
			Prompt:              job.Prompt,
			N:                   1,
			Size:                getString("size"),
			Quality:             getString("quality"),
			Style:               getString("style"),
			AspectRatio:         firstNonEmpty(job.AspectRatio, getString("aspect_ratio")),
			Seed:                getInt64Ptr("seed"),
			GuidanceScale:       getFloat("guidance_scale"),
			Watermark:           getBoolPtr(extra, "watermark"),
			OutputFormat:        getString("output_format"),
			SequentialMode:      getString("sequential_image_generation"),
			SequentialMaxImages: getInt("max_images"),
			WebSearch:           getBool("web_search"),
			OptimizePromptMode:  getString("optimize_prompt_mode"),
			InputImageDataList:  imageData,
			CloudFileID:         cloudFileID,
		}
		if len(imageData) > 0 {
			if cloudFileID == "" && imageData[0].PresignedURL != "" {
				req.InputImage = imageData[0].PresignedURL
			} else if cloudFileID == "" {
				req.InputImageBytes = imageData[0].Bytes
				req.InputImageMime = imageData[0].MimeType
			}
		}
		sm.enter(StateCallingProvider, "call image provider")
		resp, err := callProviderWithTimeout(debugCtx, providerCallTimeout, func(ctx context.Context) (ai.ImageResponse, error) {
			return w.aiService.CallImageWithBilling(ctx, job.UserID, job.ModelConfigID, req, w.billingContext(job))
		})
		if err != nil {
			w.saveDebugInfo(job, debugResult)
			return fmt.Errorf("image generation: %w", err)
		}
		sm.succeed("image provider returned")
		if len(resp.URLs) == 0 {
			return fmt.Errorf("no image URL returned by provider")
		}
		resultURL = resp.URLs[0]
		mimeType = "image/png"

	case ai.CapabilityImageEdit:
		if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
			return err
		}
		if len(imageData) == 0 {
			return fmt.Errorf("image_edit job requires an image input but none was found (job #%d)", job.ID)
		}
		cloudFileID := w.prepareImageInputReferences(job, imageData)
		req := ai.ImageRequest{
			Prompt:              job.Prompt,
			N:                   1,
			Size:                getString("size"),
			Quality:             getString("quality"),
			Style:               getString("style"),
			AspectRatio:         firstNonEmpty(job.AspectRatio, getString("aspect_ratio")),
			Seed:                getInt64Ptr("seed"),
			GuidanceScale:       getFloat("guidance_scale"),
			Watermark:           getBoolPtr(extra, "watermark"),
			OutputFormat:        getString("output_format"),
			SequentialMode:      getString("sequential_image_generation"),
			SequentialMaxImages: getInt("max_images"),
			WebSearch:           getBool("web_search"),
			OptimizePromptMode:  getString("optimize_prompt_mode"),
			InputImageDataList:  imageData,
			CloudFileID:         cloudFileID,
		}
		if cloudFileID == "" {
			firstImage := imageData[0]
			if firstImage.PresignedURL != "" {
				req.InputImage = firstImage.PresignedURL
			} else {
				req.InputImageBytes = firstImage.Bytes
				req.InputImageMime = firstImage.MimeType
			}
		}

		sm.enter(StateCallingProvider, "call image edit provider")
		resp, err := callProviderWithTimeout(debugCtx, providerCallTimeout, func(ctx context.Context) (ai.ImageResponse, error) {
			return w.aiService.CallImageWithBilling(ctx, job.UserID, job.ModelConfigID, req, w.billingContext(job))
		})
		if err != nil {
			w.saveDebugInfo(job, debugResult)
			return fmt.Errorf("image generation: %w", err)
		}
		sm.succeed("image edit provider returned")
		if len(resp.URLs) == 0 {
			return fmt.Errorf("no image URL returned by provider")
		}
		resultURL = resp.URLs[0]
		mimeType = "image/png"

	case ai.CapabilityVideo, ai.CapabilityVideoI2V, ai.CapabilityVideoV2V:
		if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
			return err
		}
		dur := job.Duration
		if dur == 0 {
			dur = getInt("duration")
		}
		req := ai.VideoRequest{
			Prompt:                job.Prompt,
			Duration:              dur,
			Frames:                getInt("frames"),
			Seed:                  getInt64Ptr("seed"),
			AspectRatio:           firstNonEmpty(job.AspectRatio, getString("aspect_ratio"), getString("ratio")),
			Ratio:                 firstNonEmpty(getString("ratio"), job.AspectRatio, getString("aspect_ratio")),
			Quality:               getString("quality"),
			Size:                  getString("size"),
			ResolutionName:        firstNonEmpty(getString("resolution"), getString("resolution_name")),
			Preset:                getString("preset"),
			CameraFixed:           getBoolPtr(extra, "camera_fixed"),
			Watermark:             getBoolPtr(extra, "watermark"),
			GenerateAudio:         getBoolPtr(extra, "generate_audio"),
			ReturnLastFrame:       getBoolPtr(extra, "return_last_frame"),
			ServiceTier:           getString("service_tier"),
			ExecutionExpiresAfter: getInt("execution_expires_after"),
			Draft:                 getBoolPtr(extra, "draft"),
			WebSearch:             getBool("web_search"),
			InputImageDataList:    imageData,
		}
		if len(videoData) > 0 {
			req.InputVideoData = &videoData[0]
		}
		w.preparePublicMediaReferences(job, req.InputImageDataList)
		if req.InputVideoData != nil {
			if cloudResult, _ := w.ensureCloudUpload(job, *req.InputVideoData, true); cloudResult.URL != "" {
				req.InputVideoData.PresignedURL = cloudResult.URL
			} else {
				req.InputVideoData.PresignedURL = ""
			}
		}
		if job.ProviderTaskID != "" {
			sm.enter(StatePollingProviderTask, fmt.Sprintf("poll provider task %s", job.ProviderTaskID))
			if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
				return err
			}
			resp, err := callProviderWithTimeout(debugCtx, providerPollTimeout, func(ctx context.Context) (ai.VideoResponse, error) {
				return w.aiService.CallVideoPollWithBilling(ctx, job.UserID, job.ModelConfigID, job.ProviderTaskID, job.ProviderTaskKind, dur, w.billingContext(job))
			})
			w.saveDebugInfo(job, debugResult)
			w.appendProviderTaskEvent(job, "poll", resp, err)
			if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
				return err
			}
			if err != nil {
				if resp.Status == ai.VideoStatusFailed {
					w.markProviderTaskFailed(job, resp, err)
					sm.fail(fmt.Errorf("%s", firstNonEmpty(resp.Message, err.Error())))
					return nil
				}
				sm.succeed("provider poll deferred")
				w.scheduleProviderPoll(job, firstNonEmpty(resp.Message, err.Error()), sm)
				return nil
			}
			sm.succeed(firstNonEmpty(resp.Status, "provider task polled"))
			switch resp.Status {
			case ai.VideoStatusSucceeded:
				if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
					return err
				}
				if err := w.completeVideoSuccess(callCtx, job, resp, sm, debugResult); err != nil {
					return err
				}
				return nil
			case ai.VideoStatusCancelled:
				w.markProviderTaskCancelled(job, resp, firstNonEmpty(resp.Message, "video generation cancelled"))
				sm.cancel(firstNonEmpty(resp.Message, "provider task cancelled"))
				return nil
			case ai.VideoStatusFailed:
				w.markProviderTaskFailed(job, resp, fmt.Errorf("%s", firstNonEmpty(resp.Message, "video generation failed")))
				sm.fail(fmt.Errorf("%s", firstNonEmpty(resp.Message, "video generation failed")))
				return nil
			default:
				w.scheduleProviderPoll(job, firstNonEmpty(resp.Status, "provider task still running"), sm)
				return nil
			}
		}

		if w.aiService.SupportsVideoTasks(job.ModelConfigID) {
			sm.enter(StateSubmittingProviderTask, "submit async video provider task")
			resp, err := callProviderWithTimeout(debugCtx, providerCallTimeout, func(ctx context.Context) (ai.VideoResponse, error) {
				return w.aiService.CallVideoStartWithBilling(ctx, job.UserID, job.ModelConfigID, req, w.billingContext(job))
			})
			w.saveDebugInfo(job, debugResult)
			w.appendProviderTaskEvent(job, "submit", resp, err)
			if err != nil {
				return fmt.Errorf("video task submission: %w", err)
			}
			sm.succeed("video provider accepted task")
			if w.isJobCancelled(job.ID) {
				job.ProviderTaskID = resp.TaskID
				job.ProviderTaskKind = resp.TaskKind
				if resp.TaskID != "" {
					cancelResp, cancelErr := w.cancelProviderTask(callCtx, job, resp.TaskID, resp.TaskKind)
					w.appendProviderTaskEvent(job, "cancel_after_submit", cancelResp, cancelErr)
				}
				sm.cancel("job cancelled after provider task submission")
				return errJobCancelled
			}
			if resp.URL != "" || len(resp.ContentBytes) > 0 {
				if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
					return err
				}
				if err := w.completeVideoSuccess(callCtx, job, resp, sm, debugResult); err != nil {
					return err
				}
				return nil
			}
			if resp.TaskID == "" {
				return fmt.Errorf("video provider accepted task but returned no task ID")
			}
			w.scheduleSubmittedProviderTask(job, resp, sm)
			return nil
		}

		sm.enter(StateCallingProvider, "call video provider")
		if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
			return err
		}
		resp, err := callProviderWithTimeout(debugCtx, providerCallTimeout, func(ctx context.Context) (ai.VideoResponse, error) {
			return w.aiService.CallVideoWithBilling(ctx, job.UserID, job.ModelConfigID, req, w.billingContext(job))
		})
		if err != nil {
			w.saveDebugInfo(job, debugResult)
			return fmt.Errorf("video generation: %w", err)
		}
		sm.succeed("video provider returned")
		if err := w.completeVideoSuccess(callCtx, job, resp, sm, debugResult); err != nil {
			return err
		}
		return nil

	default:
		return fmt.Errorf("unsupported output type %q", outputType)
	}

	sm.enter(StateValidatingProviderData, "validate provider result URL")
	if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
		return err
	}
	resultURL = strings.TrimSpace(resultURL)
	if err := validateProviderResultURL(resultURL); err != nil {
		return err
	}
	sm.succeed("provider returned downloadable result")

	sm.enter(StateSavingResult, "download and store provider result")
	if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
		return err
	}
	resourceID, err := w.saveResult(callCtx, job, resultURL, mimeType)
	if err != nil {
		return fmt.Errorf("save result: %w", err)
	}
	sm.succeed(fmt.Sprintf("stored resource #%d", resourceID))

	sm.enter(StatePersistingSuccess, "mark job succeeded")
	if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
		return err
	}
	now := time.Now()
	updates := map[string]any{
		"status":             StatusSucceeded,
		"output_resource_id": resourceID,
		"finished_at":        &now,
	}
	if debugResult != nil {
		if b, err := json.Marshal(debugResult); err == nil {
			updates["debug_info"] = string(b)
		}
	}
	result := w.db.Model(job).Where("status <> ?", StatusCancelled).Updates(updates)
	if result.RowsAffected == 0 && w.isJobCancelled(job.ID) {
		sm.cancel("job cancelled")
		return errJobCancelled
	}
	sm.succeed("job marked succeeded")
	sm.finish(StateSucceeded, fmt.Sprintf("resource #%d", resourceID))
	log.Printf("[job] job #%d succeeded → resource #%d", job.ID, resourceID)
	return nil
}

func (w *Worker) billingContext(job *model.Job) ai.BillingContext {
	return ai.BillingContext{
		ProjectID:     job.ProjectID,
		JobID:         &job.ID,
		ReservationID: job.UsageReservationID,
	}
}

type providerTaskEvent struct {
	Action    string    `json:"action"`
	TaskID    string    `json:"task_id,omitempty"`
	TaskKind  string    `json:"task_kind,omitempty"`
	Status    string    `json:"status,omitempty"`
	Message   string    `json:"message,omitempty"`
	ResultURL string    `json:"result_url,omitempty"`
	Error     string    `json:"error,omitempty"`
	At        time.Time `json:"at"`
}

func (w *Worker) appendProviderTaskEvent(job *model.Job, action string, resp ai.VideoResponse, err error) {
	var history []providerTaskEvent
	if job.ProviderTaskHistory != "" {
		_ = json.Unmarshal([]byte(job.ProviderTaskHistory), &history)
	}
	event := providerTaskEvent{
		Action:    action,
		TaskID:    firstNonEmpty(resp.TaskID, job.ProviderTaskID),
		TaskKind:  firstNonEmpty(resp.TaskKind, job.ProviderTaskKind),
		Status:    resp.Status,
		Message:   resp.Message,
		ResultURL: resp.URL,
		At:        time.Now(),
	}
	if err != nil {
		event.Error = err.Error()
	}
	history = append(history, event)
	if len(history) > 200 {
		history = history[len(history)-200:]
	}
	if b, marshalErr := json.Marshal(history); marshalErr == nil {
		job.ProviderTaskHistory = string(b)
		updates := map[string]any{
			"provider_task_history": job.ProviderTaskHistory,
		}
		if event.TaskID != "" {
			job.ProviderTaskID = event.TaskID
			updates["provider_task_id"] = event.TaskID
		}
		if event.TaskKind != "" {
			job.ProviderTaskKind = event.TaskKind
			updates["provider_task_kind"] = event.TaskKind
		}
		if event.Status != "" {
			job.ProviderTaskStatus = event.Status
			updates["provider_task_status"] = event.Status
		}
		w.db.Model(job).Updates(updates)
	}
}

func (w *Worker) scheduleSubmittedProviderTask(job *model.Job, resp ai.VideoResponse, sm *jobStateMachine) {
	nextRun := time.Now().Add(videoPollInterval)
	status := firstNonEmpty(resp.Status, ai.VideoStatusSubmitted)
	updates := map[string]any{
		"status":               StatusPending,
		"provider_task_id":     resp.TaskID,
		"provider_task_kind":   resp.TaskKind,
		"provider_task_status": status,
		"next_run_at":          &nextRun,
		"finished_at":          nil,
		"error_msg":            "",
	}
	result := w.db.Model(job).Where("status <> ?", StatusCancelled).Updates(updates)
	if result.RowsAffected == 0 && w.isJobCancelled(job.ID) {
		sm.cancel("job cancelled")
		return
	}
	job.ProviderTaskID = resp.TaskID
	job.ProviderTaskKind = resp.TaskKind
	job.ProviderTaskStatus = status
	sm.finish(StateWaitingProviderTask, fmt.Sprintf("provider task %s accepted; next poll at %s", resp.TaskID, nextRun.Format(time.RFC3339)))
	log.Printf("[job] job #%d submitted provider task %s; poll at %s", job.ID, resp.TaskID, nextRun.Format(time.RFC3339))
}

func (w *Worker) scheduleProviderPoll(job *model.Job, message string, sm *jobStateMachine) {
	nextRun := time.Now().Add(videoPollInterval)
	updates := map[string]any{
		"status":      StatusPending,
		"error_msg":   message,
		"next_run_at": &nextRun,
		"finished_at": nil,
	}
	result := w.db.Model(job).Where("status <> ?", StatusCancelled).Updates(updates)
	if result.RowsAffected == 0 && w.isJobCancelled(job.ID) {
		sm.cancel("job cancelled")
		return
	}
	sm.finish(StateWaitingProviderTask, fmt.Sprintf("%s; next poll at %s", firstNonEmpty(message, "provider task still running"), nextRun.Format(time.RFC3339)))
	log.Printf("[job] job #%d provider task %s pending; next poll at %s", job.ID, job.ProviderTaskID, nextRun.Format(time.RFC3339))
}

func (w *Worker) markProviderTaskFailed(job *model.Job, resp ai.VideoResponse, err error) {
	now := time.Now()
	msg := firstNonEmpty(resp.Message)
	if msg == "" && err != nil {
		msg = err.Error()
	}
	if msg == "" {
		msg = "video generation failed"
	}
	w.db.Model(job).Updates(map[string]any{
		"status":               StatusFailed,
		"provider_task_status": ai.VideoStatusFailed,
		"error_msg":            msg,
		"finished_at":          &now,
		"next_run_at":          nil,
		"last_heartbeat_at":    &now,
	})
	if job.UsageReservationID != nil {
		_ = w.aiService.ReleaseReservation(context.Background(), *job.UsageReservationID, msg)
	}
	log.Printf("[job] job #%d provider task %s failed: %s", job.ID, job.ProviderTaskID, msg)
}

func (w *Worker) markProviderTaskCancelled(job *model.Job, resp ai.VideoResponse, message string) {
	now := time.Now()
	msg := firstNonEmpty(message, resp.Message, "video generation cancelled")
	w.db.Model(job).Updates(map[string]any{
		"status":               StatusCancelled,
		"provider_task_status": ai.VideoStatusCancelled,
		"error_msg":            msg,
		"finished_at":          &now,
		"next_run_at":          nil,
		"last_heartbeat_at":    &now,
	})
	if job.UsageReservationID != nil {
		_ = w.aiService.ReleaseReservation(context.Background(), *job.UsageReservationID, msg)
	}
	log.Printf("[job] job #%d provider task %s cancelled: %s", job.ID, job.ProviderTaskID, msg)
}

func (w *Worker) cancelProviderTask(ctx context.Context, job *model.Job, taskID, taskKind string) (ai.VideoResponse, error) {
	if taskID == "" {
		return ai.VideoResponse{}, nil
	}
	if !w.aiService.SupportsVideoTaskCancellation(job.ModelConfigID) {
		return ai.VideoResponse{TaskID: taskID, TaskKind: taskKind}, fmt.Errorf("provider does not support video task cancellation")
	}
	cancelCtx, cancel := context.WithTimeout(ctx, providerPollTimeout)
	defer cancel()
	resp, err := w.aiService.CallVideoCancel(cancelCtx, job.ModelConfigID, taskID, taskKind)
	if err != nil {
		return resp, err
	}
	return resp, nil
}

func (w *Worker) completeVideoSuccess(ctx context.Context, job *model.Job, resp ai.VideoResponse, sm *jobStateMachine, debugResult *ai.DebugCallResult) error {
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
		return err
	}
	var resourceID uint
	var err error
	if len(resp.ContentBytes) > 0 {
		sm.enter(StateSavingResult, "store provider bytes")
		resourceID, err = w.saveBytes(ctx, job, resp.ContentBytes, "video/mp4")
	} else {
		resultURL := strings.TrimSpace(resp.URL)
		if resultURL == "" {
			return fmt.Errorf("no video URL returned by provider")
		}
		sm.enter(StateValidatingProviderData, "validate provider result URL")
		if err := validateProviderResultURL(resultURL); err != nil {
			return err
		}
		sm.succeed("provider returned downloadable result")
		sm.enter(StateSavingResult, "download and store provider result")
		resourceID, err = w.saveResult(ctx, job, resultURL, "video/mp4")
	}
	if err != nil {
		return fmt.Errorf("save result: %w", err)
	}
	sm.succeed(fmt.Sprintf("stored resource #%d", resourceID))

	sm.enter(StatePersistingSuccess, "mark job succeeded")
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
		return err
	}
	now := time.Now()
	updates := map[string]any{
		"status":               StatusSucceeded,
		"provider_task_status": firstNonEmpty(resp.Status, ai.VideoStatusSucceeded),
		"output_resource_id":   resourceID,
		"finished_at":          &now,
		"next_run_at":          nil,
	}
	if resp.TaskID != "" {
		updates["provider_task_id"] = resp.TaskID
	}
	if resp.TaskKind != "" {
		updates["provider_task_kind"] = resp.TaskKind
	}
	if debugResult != nil {
		if b, err := json.Marshal(debugResult); err == nil {
			updates["debug_info"] = string(b)
		}
	}
	result := w.db.Model(job).Where("status <> ?", StatusCancelled).Updates(updates)
	if result.RowsAffected == 0 && w.isJobCancelled(job.ID) {
		sm.cancel("job cancelled")
		return errJobCancelled
	}
	sm.succeed("job marked succeeded")
	sm.finish(StateSucceeded, fmt.Sprintf("resource #%d", resourceID))
	log.Printf("[job] job #%d succeeded → resource #%d", job.ID, resourceID)
	return nil
}

func (w *Worker) prepareImageInputReferences(job *model.Job, mediaList []ai.MediaData) string {
	if len(mediaList) == 0 {
		return ""
	}

	switch w.modelAdapterType(job.ModelConfigID) {
	case ai.AdapterVolcen, ai.AdapterKling:
		// These generation APIs accept provider-readable URLs for reference media.
		// Volcen Files API file_id is supported by Responses multimodal input, but
		// not by the Seedream / Seedance generation endpoints used here.
		w.preparePublicMediaReferences(job, mediaList)
		return ""
	default:
		// OpenAI-compatible image edit paths can consume a provider Files API ID.
		if cloudResult, _ := w.ensureCloudUpload(job, mediaList[0], false); cloudResult.FileID != "" {
			mediaList[0].CloudFileID = cloudResult.FileID
			return cloudResult.FileID
		} else if cloudResult.URL != "" {
			mediaList[0].PresignedURL = cloudResult.URL
		}
		w.preparePublicMediaReferences(job, mediaList)
		return ""
	}
}

func (w *Worker) preparePublicMediaReferences(job *model.Job, mediaList []ai.MediaData) {
	for i := range mediaList {
		if mediaList[i].PresignedURL != "" {
			continue
		}
		if cloudResult, _ := w.ensureCloudUpload(job, mediaList[i], true); cloudResult.URL != "" {
			mediaList[i].PresignedURL = cloudResult.URL
			continue
		}
		mediaList[i].PresignedURL = ""
	}
}

func (w *Worker) modelAdapterType(modelConfigID uint) string {
	var row struct {
		AdapterType string
	}
	if err := w.db.Model(&model.AIModelConfig{}).
		Select("ai_credentials.adapter_type AS adapter_type").
		Joins("JOIN ai_credentials ON ai_credentials.id = ai_model_configs.credential_id").
		Where("ai_model_configs.id = ?", modelConfigID).
		Scan(&row).Error; err != nil {
		return ""
	}
	return row.AdapterType
}

// ensureCloudUpload checks the resource's CloudUploads cache; if no valid entry exists,
// uploads via the provider Files API or configured cloud backends and caches the result.
// Returns zero-value UploadResult if no uploader is enabled or upload fails.
func (w *Worker) ensureCloudUpload(job *model.Job, media ai.MediaData, requirePublicURL bool) (cloudup.UploadResult, uint) {
	// Find the resource ID for this media data (first input resource).
	resourceID := media.ResourceID
	if resourceID == 0 {
		ids := parseResourceIDs(job.InputResourceIDs)
		if job.InputResourceID != nil && len(ids) == 0 {
			ids = []uint{*job.InputResourceID}
		}
		if len(ids) == 0 {
			return cloudup.UploadResult{}, 0
		}
		resourceID = ids[0]
	}

	var resource model.RawResource
	if err := w.db.First(&resource, resourceID).Error; err != nil {
		return cloudup.UploadResult{}, 0
	}

	// Parse existing cloud uploads cache.
	type cacheEntry struct {
		FileID     string    `json:"file_id,omitempty"`
		URL        string    `json:"url,omitempty"`
		UploadedAt time.Time `json:"uploaded_at"`
	}
	cache := map[string]cacheEntry{}
	if resource.CloudUploads != "" && resource.CloudUploads != "{}" {
		_ = json.Unmarshal([]byte(resource.CloudUploads), &cache)
	}

	// Check if any cached entry is still valid (not older than 24h for file IDs, 7 days for URLs).
	// When a provider file ID is allowed, prefer it over cached public URLs to avoid sending media again.
	if !requirePublicURL {
		for _, entry := range cache {
			if entry.FileID != "" && time.Since(entry.UploadedAt) < 24*time.Hour {
				return cloudup.UploadResult{FileID: entry.FileID}, 0
			}
		}
	} else {
		for _, entry := range cache {
			if entry.URL != "" && time.Since(entry.UploadedAt) < 7*24*time.Hour {
				return cloudup.UploadResult{URL: entry.URL}, 0
			}
		}
	}

	filename := resource.Name
	if filename == "" {
		filename = fmt.Sprintf("resource_%d.png", resourceID)
	}
	mimeType := media.MimeType
	if mimeType == "" {
		mimeType = "image/png"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	if !requirePublicURL {
		if uploader := w.aiService.GetFileUploader(job.ModelConfigID); uploader != nil {
			fileID, err := uploader.UploadFile(ctx, media.Bytes, filename, mimeType, "")
			if err == nil && fileID != "" {
				key := fmt.Sprintf("ai_model_config:%d", job.ModelConfigID)
				cache[key] = cacheEntry{FileID: fileID, UploadedAt: time.Now()}
				if b, err := json.Marshal(cache); err == nil {
					w.db.Model(&resource).Update("cloud_uploads", string(b))
				}
				return cloudup.UploadResult{FileID: fileID}, 0
			}
			if err != nil {
				log.Printf("[job] provider file upload for resource #%d failed: %v", resourceID, err)
			}
		}
	}

	svc := w.cloudupService()
	if svc == nil || !svc.HasUploaders() {
		return cloudup.UploadResult{}, 0
	}

	configID, result, err := svc.UploadWithFallback(ctx, media.Bytes, filename, mimeType)
	if err != nil {
		log.Printf("[job] cloud upload for resource #%d failed: %v", resourceID, err)
		return cloudup.UploadResult{}, 0
	}

	// Cache the result.
	key := strconv.FormatUint(uint64(configID), 10)
	cache[key] = cacheEntry{
		FileID:     result.FileID,
		URL:        result.URL,
		UploadedAt: time.Now(),
	}
	if b, err := json.Marshal(cache); err == nil {
		w.db.Model(&resource).Update("cloud_uploads", string(b))
	}

	return result, configID
}

func (w *Worker) saveDebugInfo(job *model.Job, result *ai.DebugCallResult) {
	if result == nil {
		return
	}
	// Always save: job context fields are pre-populated before any adapter call,
	// so debug_info is useful even when the HTTP exchange wasn't recorded.
	if b, err := json.Marshal(result); err == nil {
		w.db.Model(job).Update("debug_info", string(b))
	}
}

// saveBytes stores raw bytes directly (used when the adapter downloads auth-gated content).
func (w *Worker) saveBytes(ctx context.Context, job *model.Job, data []byte, mimeType string) (uint, error) {
	if normalized, normalizedMime, changed, err := media.NormalizeVideoForBrowser(ctx, data, mimeType); err != nil {
		log.Printf("[job] video normalization skipped for job #%d: %v", job.ID, err)
	} else if changed {
		data = normalized
		mimeType = normalizedMime
	}
	resType := typeFromMime(mimeType)
	name := fmt.Sprintf("job_%d_%s.%s", job.ID, resType, extFromMime(mimeType))
	key := fmt.Sprintf("gen_%d_%s", job.ID, name)

	r := model.RawResource{
		OwnerID:        job.UserID,
		Type:           resType,
		Name:           name,
		MimeType:       mimeType,
		Size:           int64(len(data)),
		FilePath:       "pending",
		StorageBackend: w.store.Backend(),
		StorageKey:     key,
	}
	if err := w.db.Create(&r).Error; err != nil {
		return 0, fmt.Errorf("create resource record: %w", err)
	}
	if err := w.store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		w.db.Delete(&r)
		return 0, fmt.Errorf("store file: %w", err)
	}
	w.db.Model(&r).Update("file_path", "stored:"+key)
	return r.ID, nil
}

// saveResult downloads the provider URL (or decodes a data URI), stores it, and creates a RawResource record.
func (w *Worker) saveResult(ctx context.Context, job *model.Job, providerURL, mimeType string) (uint, error) {
	var data []byte
	providerURL = strings.TrimSpace(providerURL)
	if err := validateProviderResultURL(providerURL); err != nil {
		return 0, err
	}

	if strings.HasPrefix(providerURL, "data:") {
		// data URI: data:<mime>;base64,<encoded>
		rest := providerURL[5:] // strip "data:"
		semi := strings.Index(rest, ";")
		comma := strings.Index(rest, ",")
		if semi < 0 || comma < 0 || comma <= semi {
			return 0, fmt.Errorf("malformed data URI")
		}
		mimeType = rest[:semi]
		encoded := rest[comma+1:]
		var err error
		data, err = base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return 0, fmt.Errorf("decode data URI: %w", err)
		}
	} else {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, providerURL, nil)
		if err != nil {
			return 0, fmt.Errorf("build download request: %w", err)
		}
		resp, err := w.client.Do(req)
		if err != nil {
			return 0, fmt.Errorf("download from provider: %w", err)
		}
		defer resp.Body.Close()

		if ct := resp.Header.Get("Content-Type"); ct != "" {
			mimeType = ct
		}
		data, err = io.ReadAll(resp.Body)
		if err != nil {
			return 0, fmt.Errorf("read response body: %w", err)
		}
	}

	if normalized, normalizedMime, changed, err := media.NormalizeVideoForBrowser(ctx, data, mimeType); err != nil {
		log.Printf("[job] video normalization skipped for job #%d: %v", job.ID, err)
	} else if changed {
		data = normalized
		mimeType = normalizedMime
	}

	resType := typeFromMime(mimeType)
	name := fmt.Sprintf("job_%d_%s.%s", job.ID, resType, extFromMime(mimeType))
	key := fmt.Sprintf("gen_%d_%s", job.ID, name)

	r := model.RawResource{
		OwnerID:        job.UserID,
		Type:           resType,
		Name:           name,
		MimeType:       mimeType,
		Size:           int64(len(data)),
		FilePath:       "pending",
		StorageBackend: w.store.Backend(),
		StorageKey:     key,
	}
	if err := w.db.Create(&r).Error; err != nil {
		return 0, fmt.Errorf("create resource record: %w", err)
	}

	if err := w.store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		w.db.Delete(&r)
		return 0, fmt.Errorf("store file: %w", err)
	}

	w.db.Model(&r).Update("file_path", "stored:"+key)
	return r.ID, nil
}

func validateProviderResultURL(providerURL string) error {
	if providerURL == "" {
		return fmt.Errorf("provider result URL is empty")
	}
	if strings.HasPrefix(providerURL, "data:") {
		return nil
	}
	u, err := url.Parse(providerURL)
	if err != nil {
		return fmt.Errorf("provider result URL is invalid: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("provider result URL must use http, https, or data URI, got scheme %q", u.Scheme)
	}
	return nil
}

func (w *Worker) resourceURL(id *uint) (string, error) {
	var r model.RawResource
	if err := w.db.First(&r, id).Error; err != nil {
		return "", err
	}
	if r.StorageKey != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		url, err := w.store.DirectURL(ctx, r.StorageKey)
		if err == nil && url != "" {
			return url, nil
		}
	}
	return r.FilePath, nil
}

// loadInputResources reads all input resource bytes from storage, classified by type.
// It reads both the new InputResourceIDs JSON array and the legacy InputResourceID field.
func (w *Worker) loadInputResources(job *model.Job) (imageData, videoData []ai.MediaData) {
	ids := parseResourceIDs(job.InputResourceIDs)
	// Append legacy single ID if not already in the list.
	if job.InputResourceID != nil {
		seen := false
		for _, id := range ids {
			if id == *job.InputResourceID {
				seen = true
				break
			}
		}
		if !seen {
			ids = append(ids, *job.InputResourceID)
		}
	}
	if len(ids) == 0 {
		return nil, nil
	}

	var resources []model.RawResource
	if err := w.db.Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return nil, nil
	}
	// Preserve order of ids.
	byID := make(map[uint]model.RawResource, len(resources))
	for _, r := range resources {
		byID[r.ID] = r
	}
	for _, id := range ids {
		r, ok := byID[id]
		if !ok {
			continue
		}
		data, mime, presigned, err := w.readResourceBytes(r)
		if err != nil || len(data) == 0 {
			log.Printf("[job] failed to read resource #%d: %v", r.ID, err)
			continue
		}
		md := ai.MediaData{Bytes: data, MimeType: mime, PresignedURL: presigned, ResourceID: r.ID}
		switch r.Type {
		case "image":
			imageData = append(imageData, md)
		case "video":
			videoData = append(videoData, md)
		}
	}
	return imageData, videoData
}

// readResourceBytes reads a resource's bytes directly from the internal resource store.
// The returned URL is intentionally empty: storage DirectURL may point at a private
// MinIO hostname and must not be passed to external AI providers.
func (w *Worker) readResourceBytes(r model.RawResource) ([]byte, string, string, error) {
	if r.StorageKey == "" {
		return nil, "", "", fmt.Errorf("resource #%d has no storage key", r.ID)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	rc, _, mimeType, err := w.store.GetObject(ctx, r.StorageKey, -1, -1)
	if err != nil {
		return nil, "", "", fmt.Errorf("get object %q: %w", r.StorageKey, err)
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		return nil, "", "", fmt.Errorf("read object %q: %w", r.StorageKey, err)
	}
	if mimeType == "" {
		mimeType = r.MimeType
	}
	return data, mimeType, "", nil
}

func parseResourceIDs(s string) []uint {
	if s == "" || s == "[]" {
		return nil
	}
	var ids []uint
	_ = json.Unmarshal([]byte(s), &ids)
	return ids
}

// resolveMentions parses @[resource:ID] markers in the prompt.
// Each marker is replaced with "图片N" (N = order of first appearance, 1-based).
// All mentioned resource IDs are merged into existingInputIDs so that
// loadInputResources picks them up. The first mentioned resource is also promoted
// to InputResourceID for backward-compat.
func (w *Worker) resolveMentions(prompt string, existingInput *uint, existingInputIDs string) (string, *uint, string) {
	re := regexp.MustCompile(`@\[resource:(\d+)\]`)
	inputID := existingInput

	// First pass: collect ordered unique resource IDs from the prompt.
	var order []uint
	seen := map[uint]int{} // id → 1-based label index
	for _, sub := range re.FindAllStringSubmatch(prompt, -1) {
		id64, err := strconv.ParseUint(sub[1], 10, 64)
		if err != nil {
			continue
		}
		id := uint(id64)
		if _, ok := seen[id]; !ok {
			order = append(order, id)
			seen[id] = len(order) // 1-based
		}
	}

	// Promote first mentioned resource to InputResourceID if not already set.
	if len(order) > 0 && inputID == nil {
		first := order[0]
		inputID = &first
	}

	// Merge mention IDs into InputResourceIDs (deduplicating against existing entries).
	mergedIDs := parseResourceIDs(existingInputIDs)
	existing := make(map[uint]bool, len(mergedIDs))
	for _, id := range mergedIDs {
		existing[id] = true
	}
	for _, id := range order {
		if !existing[id] {
			mergedIDs = append(mergedIDs, id)
		}
	}
	mergedIDsJSON := ""
	if len(mergedIDs) > 0 {
		if b, err := json.Marshal(mergedIDs); err == nil {
			mergedIDsJSON = string(b)
		}
	}

	// Second pass: replace each marker with "图片N".
	cleaned := re.ReplaceAllStringFunc(prompt, func(match string) string {
		sub := re.FindStringSubmatch(match)
		if len(sub) < 2 {
			return ""
		}
		id64, err := strconv.ParseUint(sub[1], 10, 64)
		if err != nil {
			return ""
		}
		id := uint(id64)
		return fmt.Sprintf("图片%d", seen[id])
	})

	cleaned = strings.TrimSpace(cleaned)
	return cleaned, inputID, mergedIDsJSON
}

// firstNonEmpty returns the first non-empty string from the arguments.
func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func getBoolPtr(values map[string]interface{}, key string) *bool {
	v, ok := values[key]
	if !ok {
		return nil
	}
	switch t := v.(type) {
	case bool:
		b := t
		return &b
	case string:
		switch strings.ToLower(strings.TrimSpace(t)) {
		case "true", "1", "yes", "on":
			b := true
			return &b
		case "false", "0", "no", "off":
			b := false
			return &b
		}
	}
	return nil
}

func typeFromMime(mime string) string {
	switch {
	case strings.HasPrefix(mime, "image/"):
		return "image"
	case strings.HasPrefix(mime, "video/"):
		return "video"
	case strings.HasPrefix(mime, "audio/"):
		return "audio"
	}
	return "image"
}

func extFromMime(mime string) string {
	switch mime {
	case "image/png":
		return "png"
	case "image/jpeg":
		return "jpg"
	case "image/webp":
		return "webp"
	case "video/mp4":
		return "mp4"
	case "video/webm":
		return "webm"
	default:
		if strings.HasPrefix(mime, "image/") {
			return "png"
		}
		return "mp4"
	}
}

// loadModelConfig fetches the AIModelConfig by ID. Returns nil if not found.
func (w *Worker) loadModelConfig(id uint) *model.AIModelConfig {
	var cfg model.AIModelConfig
	if err := w.db.First(&cfg, id).Error; err != nil {
		return nil
	}
	return &cfg
}

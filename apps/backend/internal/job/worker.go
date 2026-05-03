package job

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/cloudup"
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
	params := parseGenerationParams(job.ExtraParams)
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
			Size:                params.String("size"),
			Quality:             params.String("quality"),
			Style:               params.String("style"),
			AspectRatio:         firstNonEmpty(job.AspectRatio, params.String("aspect_ratio")),
			Seed:                params.Int64Ptr("seed"),
			GuidanceScale:       params.Float("guidance_scale"),
			Watermark:           params.BoolPtr("watermark"),
			OutputFormat:        params.String("output_format"),
			SequentialMode:      params.String("sequential_image_generation"),
			SequentialMaxImages: params.Int("max_images"),
			WebSearch:           params.Bool("web_search"),
			OptimizePromptMode:  params.String("optimize_prompt_mode"),
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
			Size:                params.String("size"),
			Quality:             params.String("quality"),
			Style:               params.String("style"),
			AspectRatio:         firstNonEmpty(job.AspectRatio, params.String("aspect_ratio")),
			Seed:                params.Int64Ptr("seed"),
			GuidanceScale:       params.Float("guidance_scale"),
			Watermark:           params.BoolPtr("watermark"),
			OutputFormat:        params.String("output_format"),
			SequentialMode:      params.String("sequential_image_generation"),
			SequentialMaxImages: params.Int("max_images"),
			WebSearch:           params.Bool("web_search"),
			OptimizePromptMode:  params.String("optimize_prompt_mode"),
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
			dur = params.Int("duration")
		}
		req := ai.VideoRequest{
			Prompt:                job.Prompt,
			Duration:              dur,
			Frames:                params.Int("frames"),
			Seed:                  params.Int64Ptr("seed"),
			AspectRatio:           firstNonEmpty(job.AspectRatio, params.String("aspect_ratio"), params.String("ratio")),
			Ratio:                 firstNonEmpty(params.String("ratio"), job.AspectRatio, params.String("aspect_ratio")),
			Quality:               params.String("quality"),
			Size:                  params.String("size"),
			ResolutionName:        firstNonEmpty(params.String("resolution"), params.String("resolution_name")),
			Preset:                params.String("preset"),
			CameraFixed:           params.BoolPtr("camera_fixed"),
			Watermark:             params.BoolPtr("watermark"),
			GenerateAudio:         params.BoolPtr("generate_audio"),
			ReturnLastFrame:       params.BoolPtr("return_last_frame"),
			ServiceTier:           params.String("service_tier"),
			ExecutionExpiresAfter: params.Int("execution_expires_after"),
			Draft:                 params.BoolPtr("draft"),
			WebSearch:             params.Bool("web_search"),
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

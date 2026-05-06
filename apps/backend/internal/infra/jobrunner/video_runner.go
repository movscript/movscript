package jobrunner

import (
	"context"
	"fmt"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
)

func (w *Worker) runVideoJob(ctx context.Context, debugCtx context.Context, job *model.Job, params generationParams, imageData []ai.MediaData, videoData []ai.MediaData, sm *jobStateMachine, debugResult *ai.DebugCallResult) error {
	dur := job.Duration
	if dur == 0 {
		dur = params.Int("duration")
	}
	req := w.buildVideoRequest(job, params, dur, imageData, videoData)
	w.preparePublicMediaReferences(job, req.InputImageDataList)
	if req.InputVideoData != nil {
		if cloudResult, _ := w.ensureCloudUpload(job, *req.InputVideoData, true); cloudResult.URL != "" {
			req.InputVideoData.PresignedURL = cloudResult.URL
		} else {
			req.InputVideoData.PresignedURL = ""
		}
	}
	if job.ProviderTaskID != "" {
		return w.pollVideoProviderTask(ctx, debugCtx, job, dur, sm, debugResult)
	}
	if w.aiService.SupportsVideoTasks(job.ModelConfigID) {
		return w.submitVideoProviderTask(ctx, debugCtx, job, req, sm, debugResult)
	}
	return w.callVideoProvider(ctx, debugCtx, job, req, sm, debugResult)
}

func (w *Worker) buildVideoRequest(job *model.Job, params generationParams, dur int, imageData []ai.MediaData, videoData []ai.MediaData) ai.VideoRequest {
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
	return req
}

func (w *Worker) pollVideoProviderTask(ctx context.Context, debugCtx context.Context, job *model.Job, duration int, sm *jobStateMachine, debugResult *ai.DebugCallResult) error {
	sm.enter(StatePollingProviderTask, fmt.Sprintf("poll provider task %s", job.ProviderTaskID))
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
		return err
	}
	resp, err := callProviderWithTimeout(debugCtx, providerPollTimeout, func(ctx context.Context) (ai.VideoResponse, error) {
		return w.aiService.CallVideoPollWithBilling(ctx, job.UserID, job.ModelConfigID, job.ProviderTaskID, job.ProviderTaskKind, duration, w.billingContext(job))
	})
	w.saveDebugInfo(job, debugResult)
	w.appendProviderTaskEvent(job, "poll", resp, err)
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
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
		if err := w.abortIfCancelled(ctx, job, sm); err != nil {
			return err
		}
		return w.completeVideoSuccess(ctx, job, resp, sm, debugResult)
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

func (w *Worker) submitVideoProviderTask(ctx context.Context, debugCtx context.Context, job *model.Job, req ai.VideoRequest, sm *jobStateMachine, debugResult *ai.DebugCallResult) error {
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
			cancelResp, cancelErr := w.cancelProviderTask(ctx, job, resp.TaskID, resp.TaskKind)
			w.appendProviderTaskEvent(job, "cancel_after_submit", cancelResp, cancelErr)
		}
		sm.cancel("job cancelled after provider task submission")
		return errJobCancelled
	}
	if resp.URL != "" || len(resp.ContentBytes) > 0 {
		if err := w.abortIfCancelled(ctx, job, sm); err != nil {
			return err
		}
		return w.completeVideoSuccess(ctx, job, resp, sm, debugResult)
	}
	if resp.TaskID == "" {
		return fmt.Errorf("video provider accepted task but returned no task ID")
	}
	w.scheduleSubmittedProviderTask(job, resp, sm)
	return nil
}

func (w *Worker) callVideoProvider(ctx context.Context, debugCtx context.Context, job *model.Job, req ai.VideoRequest, sm *jobStateMachine, debugResult *ai.DebugCallResult) error {
	sm.enter(StateCallingProvider, "call video provider")
	if err := w.abortIfCancelled(ctx, job, sm); err != nil {
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
	return w.completeVideoSuccess(ctx, job, resp, sm, debugResult)
}

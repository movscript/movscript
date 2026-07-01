package runner

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/movscript/movscript/internal/app/systemstream"
	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/storage"
	"github.com/movscript/movscript/internal/infra/upload"
	"gorm.io/gorm"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// Worker is a pool of goroutines that execute pending Job records.
type Worker struct {
	db             *gorm.DB
	aiService      *ai.AIService
	store          storage.Storage
	encryptionKey  []byte
	client         *http.Client
	workerID       string
	systemMessages *systemstream.Hub
	wg             sync.WaitGroup
}

const (
	jobExecutionTimeout = 10 * time.Minute
	providerCallTimeout = 8 * time.Minute
	providerPollTimeout = 90 * time.Second
	videoPollInterval   = 30 * time.Second
	heartbeatInterval   = 15 * time.Second
	staleRunningTimeout = 12 * time.Minute
	staleReaperInterval = 45 * time.Second
	leaseDuration       = 90 * time.Second
)

var errJobCancelled = errors.New("generation job cancelled")

func NewWorker(db *gorm.DB, aiService *ai.AIService, store storage.Storage, encryptionKey []byte, systemMessages ...*systemstream.Hub) *Worker {
	var hub *systemstream.Hub
	if len(systemMessages) > 0 {
		hub = systemMessages[0]
	}
	return &Worker{
		db:             db,
		aiService:      aiService,
		store:          store,
		encryptionKey:  encryptionKey,
		client:         &http.Client{Timeout: 10 * time.Minute},
		workerID:       newWorkerID(),
		systemMessages: hub,
	}
}

func newWorkerID() string {
	var b [6]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%s-%d", firstNonEmpty(os.Getenv("HOSTNAME"), "worker"), time.Now().UnixNano())
	}
	return fmt.Sprintf("%s-%s", firstNonEmpty(os.Getenv("HOSTNAME"), "worker"), hex.EncodeToString(b[:]))
}

func (w *Worker) resolveJobModelRoute(ctx context.Context, job *persistencemodel.Job, capability string) (ai.ModelRoute, error) {
	if w.aiService == nil {
		return ai.ModelRoute{}, fmt.Errorf("ai service is required")
	}
	capability = runnerGenerationCapabilityForJobType(capability)
	if job.RouteGroup != "" {
		ctx = ai.WithProviderRouteGroup(ctx, job.RouteGroup)
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
		return ai.ModelRoute{}, fmt.Errorf("job route binding or catalog entry is required")
	}
	request := ai.ModelRouteRequest{
		CatalogEntryID: catalogEntryID,
		RouteBindingID: routeBindingID,
		Capability:     capability,
		RouteGroup:     job.RouteGroup,
	}
	if intent := runnerGenerationIntentFromRequestContext(job.RequestContext); intent != nil {
		request.Capability = intent.Capability
		request.Operation = intent.Operation
		request.ReferenceAssets = intent.ReferenceAssets
	}
	route, err := w.aiService.ResolveModelRoute(request)
	if err != nil {
		return ai.ModelRoute{}, err
	}
	return route, nil
}

func runnerGenerationCapabilityForJobType(jobType string) string {
	switch strings.TrimSpace(jobType) {
	case domainjob.JobTypeImage:
		return ai.CapabilityFamilyImageGeneration
	case domainjob.JobTypeVideo:
		return ai.CapabilityFamilyVideoGeneration
	case domainjob.JobTypeAudio:
		return ai.CapabilityFamilyAudioGeneration
	default:
		return strings.TrimSpace(jobType)
	}
}

func annotateDebugRouteContext(debugResult *ai.DebugCallResult, route ai.ModelRoute, fallbackCapability string) {
	if debugResult == nil {
		return
	}
	capability := strings.TrimSpace(route.Capability)
	if capability == "" {
		capability = strings.TrimSpace(fallbackCapability)
	}
	debugResult.RouteTrace = &ai.DebugRouteTrace{
		PublicModelID:      strings.TrimSpace(route.ModelID),
		CatalogEntryID:     route.CatalogEntryID,
		RouteBindingID:     route.RouteBindingID,
		SourceType:         strings.TrimSpace(route.SourceType),
		RouteGroup:         strings.TrimSpace(route.RouteGroup),
		ProviderID:         strings.TrimSpace(route.ProviderID),
		ProviderKind:       strings.TrimSpace(route.ProviderKind),
		AdapterKey:         strings.TrimSpace(route.AdapterKey),
		AdapterType:        strings.TrimSpace(route.AdapterType),
		ProviderModelID:    strings.TrimSpace(route.ProviderModelID),
		Capability:         capability,
		Operation:          strings.TrimSpace(route.Operation),
		APIKind:            strings.TrimSpace(route.APIKind),
		EndpointBaseURL:    strings.TrimSpace(route.EndpointBaseURL),
		EndpointPathPrefix: strings.TrimSpace(route.EndpointPathPrefix),
		EndpointMode:       strings.TrimSpace(route.EndpointMode),
		SelectionReason:    strings.TrimSpace(route.SelectionReason),
	}
}

type runnerResolvedGenerationIntent struct {
	Capability      string
	Operation       string
	ReferenceAssets []ai.RouteReferenceAssetIntent
	RequestAssets   []ai.ReferenceAsset
}

func runnerGenerationIntentFromRequestContext(requestContext string) *runnerResolvedGenerationIntent {
	var body struct {
		Intent struct {
			Capability      string `json:"capability"`
			Operation       string `json:"operation"`
			ReferenceAssets []struct {
				ReferenceID string `json:"reference_id"`
				SourceKind  string `json:"source_kind"`
				SourceID    any    `json:"source_id"`
				SourceRef   any    `json:"source_ref"`
				Role        string `json:"role"`
				MediaType   string `json:"media_type"`
				ResourceID  uint   `json:"resource_id"`
			} `json:"reference_assets"`
		} `json:"intent"`
	}
	if err := json.Unmarshal([]byte(requestContext), &body); err != nil {
		return nil
	}
	capability := strings.TrimSpace(body.Intent.Capability)
	if capability == "" {
		return nil
	}
	out := &runnerResolvedGenerationIntent{
		Capability: capability,
		Operation:  strings.TrimSpace(body.Intent.Operation),
	}
	for _, ref := range body.Intent.ReferenceAssets {
		role := strings.TrimSpace(ref.Role)
		mediaType := strings.TrimSpace(ref.MediaType)
		out.ReferenceAssets = append(out.ReferenceAssets, ai.RouteReferenceAssetIntent{
			Role:      role,
			MediaType: mediaType,
		})
		out.RequestAssets = append(out.RequestAssets, ai.ReferenceAsset{
			ReferenceID: strings.TrimSpace(ref.ReferenceID),
			SourceKind:  strings.TrimSpace(ref.SourceKind),
			SourceID:    ref.SourceID,
			SourceRef:   ref.SourceRef,
			Role:        role,
			MediaType:   mediaType,
			ResourceID:  ref.ResourceID,
		})
	}
	return out
}

func runnerGenerationOperationFromJob(job *persistencemodel.Job) string {
	if intent := runnerGenerationIntentFromRequestContext(job.RequestContext); intent != nil {
		return intent.Operation
	}
	return ""
}

func runnerReferenceAssetsFromJob(job *persistencemodel.Job) []ai.ReferenceAsset {
	if intent := runnerGenerationIntentFromRequestContext(job.RequestContext); intent != nil {
		return intent.RequestAssets
	}
	return nil
}

// cloudupService loads enabled cloud file configs from DB and builds a upload.Service.
// Returns nil (no error) if no configs are enabled — callers must check HasUploaders().
func (w *Worker) cloudupService() *upload.Service {
	var rows []persistencemodel.CloudFileConfig
	if err := w.db.Where("is_enabled = true AND deleted_at IS NULL").Order("priority asc").Find(&rows).Error; err != nil {
		return nil
	}
	svc, err := upload.NewFromDBConfigs(rows, w.encryptionKey)
	if err != nil {
		log.Printf("[job] upload init error: %v", err)
		return nil
	}
	return svc
}

func (w *Worker) execute(ctx context.Context, job *persistencemodel.Job) (err error) {
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
	// All mention markers are stripped from the prompt text sent to the persistencemodel.
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
	imageData, videoData, audioData, textData := w.loadInputResources(job)
	sm.succeed(fmt.Sprintf("loaded %d image inputs, %d video inputs, %d audio inputs, and %d text inputs", len(imageData), len(videoData), len(audioData), len(textData)))

	sm.enter(StatePreparingRequest, "resolve model and debug context")

	// Determine effective output type from job_type.
	outputType := job.JobType

	// Resolve the model def ID for debug context.
	modelDefID := w.jobModelDefID(callCtx, job)

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

	operation := runnerGenerationOperationFromJob(job)
	switch outputType {
	case domainjob.JobTypeImage:
		if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
			return err
		}
		var (
			result providerResult
			err    error
		)
		if operation == "" || operation == ai.ImageOperationTextToImage {
			result, err = w.runImageJob(debugCtx, job, params, imageData, sm, debugResult)
		} else {
			result, err = w.runImageEditJob(debugCtx, job, params, imageData, sm, debugResult)
		}
		if err != nil {
			w.saveDebugInfo(job, debugResult)
			return err
		}
		return w.completeProviderResult(callCtx, job, result, sm, debugResult)

	case domainjob.JobTypeVideo:
		if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
			return err
		}
		return w.runVideoJob(callCtx, debugCtx, job, params, imageData, videoData, audioData, sm, debugResult)

	case domainjob.JobTypeAudio:
		if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
			return err
		}
		switch operation {
		case "", ai.AudioOperationTextToSpeech:
			return w.runAudioTTSJob(callCtx, debugCtx, job, params, sm, debugResult)
		case ai.AudioOperationMusicGeneration, ai.AudioOperationSoundEffectGeneration:
			return w.runAudioGenerateJob(callCtx, debugCtx, job, params, sm, debugResult, operation)
		case ai.AudioOperationSpeechToSpeech:
			return w.runSpeechToSpeechJob(callCtx, debugCtx, job, params, sm, debugResult, audioData)
		case ai.AudioOperationVoiceClone, ai.AudioOperationVoiceDesign:
			return w.runVoiceProfileJob(callCtx, debugCtx, job, params, sm, debugResult, operation, audioData)
		case ai.AudioOperationSpeechToText, ai.AudioOperationSpeechTranslate, ai.AudioOperationForcedAlignment, ai.AudioOperationDubbing:
			return w.runSubtitleJob(callCtx, debugCtx, job, params, sm, debugResult, operation, audioData, textData)
		default:
			return fmt.Errorf("unsupported audio generation operation %q", operation)
		}

	default:
		return fmt.Errorf("unsupported output type %q", outputType)
	}
}

package jobrunner

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/cloudup"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
	"log"
	"net/http"
	"os"
	"time"
)

// Worker is a pool of goroutines that execute pending Job records.
type Worker struct {
	db            *gorm.DB
	aiService     *ai.AIService
	store         storage.Storage
	encryptionKey []byte
	client        *http.Client
	workerID      string
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

func NewWorker(db *gorm.DB, aiService *ai.AIService, store storage.Storage, encryptionKey []byte) *Worker {
	return &Worker{
		db:            db,
		aiService:     aiService,
		store:         store,
		encryptionKey: encryptionKey,
		client:        &http.Client{Timeout: 10 * time.Minute},
		workerID:      newWorkerID(),
	}
}

func newWorkerID() string {
	var b [6]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%s-%d", firstNonEmpty(os.Getenv("HOSTNAME"), "worker"), time.Now().UnixNano())
	}
	return fmt.Sprintf("%s-%s", firstNonEmpty(os.Getenv("HOSTNAME"), "worker"), hex.EncodeToString(b[:]))
}

// cloudupService loads enabled cloud file configs from DB and builds a cloudup.Service.
// Returns nil (no error) if no configs are enabled — callers must check HasUploaders().
func (w *Worker) cloudupService() *cloudup.Service {
	var rows []persistencemodel.CloudFileConfig
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
	imageData, videoData := w.loadInputResources(job)
	sm.succeed(fmt.Sprintf("loaded %d image inputs and %d video inputs", len(imageData), len(videoData)))

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
		result, err := w.runImageJob(debugCtx, job, params, imageData, sm)
		if err != nil {
			w.saveDebugInfo(job, debugResult)
			return err
		}
		return w.completeProviderResult(callCtx, job, result, sm, debugResult)

	case ai.CapabilityImageEdit:
		if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
			return err
		}
		result, err := w.runImageEditJob(debugCtx, job, params, imageData, sm)
		if err != nil {
			w.saveDebugInfo(job, debugResult)
			return err
		}
		return w.completeProviderResult(callCtx, job, result, sm, debugResult)

	case ai.CapabilityVideo, ai.CapabilityVideoI2V, ai.CapabilityVideoV2V:
		if err := w.abortIfCancelled(callCtx, job, sm); err != nil {
			return err
		}
		return w.runVideoJob(callCtx, debugCtx, job, params, imageData, videoData, sm, debugResult)

	default:
		return fmt.Errorf("unsupported output type %q", outputType)
	}
}

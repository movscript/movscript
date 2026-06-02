package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/observability"
)

type AgentTelemetryHandler struct {
	metrics *observability.AgentClientMetrics
}

func NewAgentTelemetryHandler(metrics *observability.AgentClientMetrics) *AgentTelemetryHandler {
	if metrics == nil {
		metrics = observability.DefaultAgentClientMetrics()
	}
	return &AgentTelemetryHandler{metrics: metrics}
}

type agentTelemetryBatchRequest struct {
	Schema           string                           `json:"schema"`
	Operations       []agentTelemetryOperationRequest `json:"operations"`
	LongTasks        []agentTelemetryDurationRequest  `json:"longTasks"`
	StorageSnapshots []agentTelemetryStorageRequest   `json:"storageSnapshots"`
}

type agentTelemetryOperationRequest struct {
	Kind       string                       `json:"kind"`
	Status     string                       `json:"status"`
	DurationMS float64                      `json:"durationMs"`
	Slow       bool                         `json:"slow"`
	Phases     []agentTelemetryPhaseRequest `json:"phases"`
}

type agentTelemetryPhaseRequest struct {
	Name                   string  `json:"name"`
	DurationFromPreviousMS float64 `json:"durationFromPreviousMs"`
}

type agentTelemetryDurationRequest struct {
	DurationMS float64 `json:"durationMs"`
}

type agentTelemetryStorageRequest struct {
	TotalBytes int64 `json:"totalBytes"`
}

func (h *AgentTelemetryHandler) Record(c *gin.Context) {
	var req agentTelemetryBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid telemetry payload"})
		return
	}
	if req.Schema != "" && req.Schema != "movscript.agent.client-telemetry.v1" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported telemetry schema"})
		return
	}

	recorded := 0
	for _, operation := range req.Operations {
		h.metrics.RecordOperation(observability.AgentClientOperationSample{
			Kind:        operation.Kind,
			Status:      operation.Status,
			Duration:    durationFromMilliseconds(operation.DurationMS),
			Slow:        operation.Slow,
			PhaseDeltas: phaseDeltas(operation.Phases),
		})
		recorded++
	}
	for _, task := range req.LongTasks {
		h.metrics.RecordLongTask(observability.AgentClientLongTaskSample{
			Duration: durationFromMilliseconds(task.DurationMS),
		})
		recorded++
	}
	for _, snapshot := range req.StorageSnapshots {
		h.metrics.RecordStorage(observability.AgentClientStorageSample{
			TotalBytes: snapshot.TotalBytes,
		})
		recorded++
	}

	c.JSON(http.StatusAccepted, gin.H{"recorded": recorded})
}

func (h *AgentTelemetryHandler) Snapshot(c *gin.Context) {
	c.JSON(http.StatusOK, h.metrics.Snapshot())
}

func phaseDeltas(phases []agentTelemetryPhaseRequest) map[string]time.Duration {
	if len(phases) == 0 {
		return nil
	}
	result := make(map[string]time.Duration, len(phases))
	for _, phase := range phases {
		if phase.Name == "" {
			continue
		}
		result[phase.Name] += durationFromMilliseconds(phase.DurationFromPreviousMS)
	}
	return result
}

func durationFromMilliseconds(value float64) time.Duration {
	if value <= 0 {
		return 0
	}
	return time.Duration(value * float64(time.Millisecond))
}

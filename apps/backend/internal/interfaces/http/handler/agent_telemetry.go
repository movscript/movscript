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

const agentClientTelemetrySchema = "movscript.agent.client-telemetry.v1"

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
	Metrics          []agentTelemetryMetricRequest    `json:"metrics"`
	Logs             []agentTelemetryLogRequest       `json:"logs"`
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

type agentTelemetryMetricRequest struct {
	Name   string            `json:"name"`
	Unit   string            `json:"unit"`
	Value  float64           `json:"value"`
	Labels map[string]string `json:"labels"`
}

type agentTelemetryLogRequest struct {
	Level string `json:"level"`
	Area  string `json:"area"`
	Kind  string `json:"kind"`
}

func (h *AgentTelemetryHandler) Record(c *gin.Context) {
	var req agentTelemetryBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.metrics.RecordIngest("invalid_payload", 0)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid telemetry payload"})
		return
	}
	if req.Schema != "" && req.Schema != agentClientTelemetrySchema {
		h.metrics.RecordIngest("unsupported_schema", 0)
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
	for _, metric := range req.Metrics {
		h.metrics.RecordMetric(observability.AgentClientMetricSample{
			Name:   metric.Name,
			Unit:   metric.Unit,
			Value:  metric.Value,
			Labels: metric.Labels,
		})
		recorded++
	}
	for _, log := range req.Logs {
		h.metrics.RecordLog(observability.AgentClientLogSample{
			Level: log.Level,
			Area:  log.Area,
			Kind:  log.Kind,
		})
		recorded++
	}
	h.metrics.RecordIngest("accepted", recorded)

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

package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/movscript/movscript/internal/infra/observability"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

const (
	llmCallLogSettingsKey      = "llm_call_log_settings"
	defaultLLMLogRetentionDays = 14
	maxLLMLogPayloadBytes      = 64 * 1024
)

type llmCallLogSettings struct {
	RetentionDays int `json:"retention_days"`
}

type llmCallLogInput struct {
	UserID         uint
	Usage          UsageContext
	Config         persistencemodel.AIModelConfig
	Provider       string
	OperationType  string
	PromptName     string
	RequestModel   string
	ResponseModel  string
	RequestPayload any
	Response       *TextResponse
	Start          time.Time
	Err            error
}

func (s *AIService) logLLMCall(ctx context.Context, input llmCallLogInput) {
	errText := ""
	if input.Err != nil {
		errText = input.Err.Error()
	}
	if err := s.RecordGatewayCall(ctx, providercontract.AIGatewayCallAuditInput{
		UserID:         input.UserID,
		Context:        usageContextToContract(input.Usage),
		ModelConfigID:  input.Config.ID,
		CredentialID:   input.Config.CredentialID,
		Provider:       input.Provider,
		OperationType:  input.OperationType,
		PromptName:     input.PromptName,
		RequestModel:   input.RequestModel,
		ResponseModel:  input.ResponseModel,
		RequestPayload: input.RequestPayload,
		Response:       input.Response,
		StartedAt:      input.Start,
		Error:          errText,
	}); err != nil {
		observability.WithRequest(ctx).Warn("llm_call_log_write_failed", slog.String("error", err.Error()))
	}
}

func (s *AIService) RecordGatewayCall(ctx context.Context, input providercontract.AIGatewayCallAuditInput) error {
	if s == nil || s.db == nil || input.ModelConfigID == 0 || input.UserID == 0 {
		return nil
	}
	retentionDays := input.RetentionDays
	if retentionDays <= 0 {
		retentionDays = s.llmLogRetentionDays(ctx)
	}
	if retentionDays > 365 {
		retentionDays = 365
	}
	expiresAt := time.Now().UTC().Add(time.Duration(retentionDays) * 24 * time.Hour)
	requestJSON, requestTruncated := boundedJSON(input.RequestPayload)
	responseJSON, responseTruncated := boundedJSON(input.Response)
	status := input.Status
	if status == "" {
		status = "success"
	}
	if input.Error != "" {
		status = "error"
		responseJSON = ""
	}
	inputTokens := 0
	outputTokens := 0
	cachedInputTokens := 0
	reasoningTokens := 0
	if input.Response != nil {
		inputTokens = input.Response.Usage.InputTokens
		outputTokens = input.Response.Usage.OutputTokens
		cachedInputTokens = input.Response.Usage.CachedInputTokens
		reasoningTokens = input.Response.Usage.ReasoningTokens
		if input.ResponseModel == "" && input.Response.Debug != nil {
			input.ResponseModel = input.Response.Debug.ModelID
		}
	}
	latencyMs := input.LatencyMs
	if latencyMs == 0 && !input.StartedAt.IsZero() {
		latencyMs = time.Since(input.StartedAt).Milliseconds()
	}
	entry := persistencemodel.LLMCallLog{
		RequestID:         observability.RequestIDFromContext(ctx),
		UserID:            input.UserID,
		OrgID:             input.Context.OrgID,
		ProjectID:         input.Context.ProjectID,
		GatewayAPIKeyID:   input.Context.GatewayAPIKeyID,
		AIModelConfigID:   input.ModelConfigID,
		CredentialID:      input.CredentialID,
		OperationType:     input.OperationType,
		PromptName:        input.PromptName,
		Provider:          input.Provider,
		RequestModel:      input.RequestModel,
		ResponseModel:     input.ResponseModel,
		Status:            status,
		Error:             input.Error,
		LatencyMs:         latencyMs,
		InputTokens:       inputTokens,
		OutputTokens:      outputTokens,
		CachedInputTokens: cachedInputTokens,
		ReasoningTokens:   reasoningTokens,
		RequestJSON:       requestJSON,
		ResponseJSON:      responseJSON,
		PayloadTruncated:  input.PayloadTruncated || requestTruncated || responseTruncated,
		ExpiresAt:         &expiresAt,
		RetentionDays:     retentionDays,
	}
	return s.db.WithContext(ctx).Create(&entry).Error
}

func (input llmCallLogInput) ResponseModelFromResponse() string {
	if input.Response == nil || input.Response.Debug == nil {
		return ""
	}
	return input.Response.Debug.ModelID
}

func (s *AIService) llmLogRetentionDays(ctx context.Context) int {
	var setting persistencemodel.AdminSetting
	if err := s.db.WithContext(ctx).Where("key = ?", llmCallLogSettingsKey).First(&setting).Error; err != nil {
		return defaultLLMLogRetentionDays
	}
	var parsed llmCallLogSettings
	if err := json.Unmarshal([]byte(setting.ValueJSON), &parsed); err != nil {
		return defaultLLMLogRetentionDays
	}
	if parsed.RetentionDays <= 0 {
		return defaultLLMLogRetentionDays
	}
	if parsed.RetentionDays > 365 {
		return 365
	}
	return parsed.RetentionDays
}

func boundedJSON(value any) (string, bool) {
	if value == nil {
		return "", false
	}
	raw, err := json.Marshal(value)
	if err != nil {
		raw = []byte(fmt.Sprintf(`{"marshal_error":%q}`, err.Error()))
	}
	if len(raw) <= maxLLMLogPayloadBytes {
		return string(raw), false
	}
	return string(raw[:maxLLMLogPayloadBytes]) + "\n...truncated", true
}

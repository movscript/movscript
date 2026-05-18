package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/movscript/movscript/internal/infra/observability"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
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
	if s == nil || s.db == nil || input.Config.ID == 0 || input.UserID == 0 {
		return
	}
	retentionDays := s.llmLogRetentionDays(ctx)
	expiresAt := time.Now().UTC().Add(time.Duration(retentionDays) * 24 * time.Hour)
	requestJSON, requestTruncated := boundedJSON(input.RequestPayload)
	responseJSON, responseTruncated := boundedJSON(input.Response)
	status := "success"
	errText := ""
	if input.Err != nil {
		status = "error"
		errText = input.Err.Error()
		responseJSON = ""
	}
	inputTokens := 0
	outputTokens := 0
	if input.Response != nil {
		inputTokens = input.Response.Usage.InputTokens
		outputTokens = input.Response.Usage.OutputTokens
		if input.ResponseModel == "" {
			input.ResponseModel = input.ResponseModelFromResponse()
		}
	}
	entry := persistencemodel.LLMCallLog{
		RequestID:        observability.RequestIDFromContext(ctx),
		UserID:           input.UserID,
		OrgID:            input.Usage.OrgID,
		ProjectID:        input.Usage.ProjectID,
		GatewayAPIKeyID:  input.Usage.GatewayAPIKeyID,
		AIModelConfigID:  input.Config.ID,
		CredentialID:     input.Config.CredentialID,
		OperationType:    input.OperationType,
		PromptName:       input.PromptName,
		Provider:         input.Provider,
		RequestModel:     input.RequestModel,
		ResponseModel:    input.ResponseModel,
		Status:           status,
		Error:            errText,
		LatencyMs:        time.Since(input.Start).Milliseconds(),
		InputTokens:      inputTokens,
		OutputTokens:     outputTokens,
		RequestJSON:      requestJSON,
		ResponseJSON:     responseJSON,
		PayloadTruncated: requestTruncated || responseTruncated,
		ExpiresAt:        &expiresAt,
		RetentionDays:    retentionDays,
	}
	if err := s.db.WithContext(ctx).Create(&entry).Error; err != nil {
		observability.WithRequest(ctx).Warn("llm_call_log_write_failed", slog.String("error", err.Error()))
	}
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

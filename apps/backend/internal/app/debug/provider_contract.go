package debug

import (
	"context"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

var _ providercontract.AIGatewayAuditLogReader = (*gormRepository)(nil)

func (r *gormRepository) ListGatewayCallLogs(ctx context.Context, filter providercontract.AIGatewayCallLogFilter) (providercontract.AIGatewayCallLogPage, error) {
	page, err := r.ListLLMCallLogs(ctx, llmCallLogFilterFromContract(filter))
	if err != nil {
		return providercontract.AIGatewayCallLogPage{}, err
	}
	return llmCallLogPageToContract(page), nil
}

func (r *gormRepository) SummarizeGatewayCallLogs(ctx context.Context, filter providercontract.AIGatewayCallLogFilter) (providercontract.AIGatewayCallLogSummary, error) {
	summary, err := r.LLMCallLogSummary(ctx, llmCallLogFilterFromContract(filter))
	if err != nil {
		return providercontract.AIGatewayCallLogSummary{}, err
	}
	return llmCallLogSummaryToContract(summary), nil
}

func llmCallLogFilterToContract(filter LLMCallLogFilter) providercontract.AIGatewayCallLogFilter {
	return providercontract.AIGatewayCallLogFilter{
		UserID:          filter.UserID,
		OrgID:           filter.OrgID,
		ProjectID:       filter.ProjectID,
		ModelID:         filter.ModelID,
		CredentialID:    filter.CredentialID,
		GatewayAPIKeyID: filter.GatewayAPIKeyID,
		OperationType:   filter.OperationType,
		Status:          filter.Status,
		Provider:        filter.Provider,
		PromptName:      filter.PromptName,
		Since:           filter.Since,
		Until:           filter.Until,
		IncludeExpired:  filter.IncludeExpired,
		ExpiredOnly:     filter.ExpiredOnly,
		Page:            filter.Page,
		PageSize:        filter.PageSize,
	}
}

func llmCallLogFilterFromContract(filter providercontract.AIGatewayCallLogFilter) LLMCallLogFilter {
	return LLMCallLogFilter{
		UserID:          filter.UserID,
		OrgID:           filter.OrgID,
		ProjectID:       filter.ProjectID,
		ModelID:         filter.ModelID,
		CredentialID:    filter.CredentialID,
		GatewayAPIKeyID: filter.GatewayAPIKeyID,
		OperationType:   filter.OperationType,
		Status:          filter.Status,
		Provider:        filter.Provider,
		PromptName:      filter.PromptName,
		Since:           filter.Since,
		Until:           filter.Until,
		IncludeExpired:  filter.IncludeExpired,
		ExpiredOnly:     filter.ExpiredOnly,
		Page:            filter.Page,
		PageSize:        filter.PageSize,
	}
}

func llmCallLogPageToContract(page LLMCallLogPage) providercontract.AIGatewayCallLogPage {
	return providercontract.AIGatewayCallLogPage{
		Items:    llmCallLogsToContract(page.Items),
		Total:    page.Total,
		Page:     page.Page,
		PageSize: page.PageSize,
	}
}

func llmCallLogPageFromContract(page providercontract.AIGatewayCallLogPage) LLMCallLogPage {
	return LLMCallLogPage{
		Items:    llmCallLogsFromContract(page.Items),
		Total:    page.Total,
		Page:     page.Page,
		PageSize: page.PageSize,
	}
}

func llmCallLogsToContract(rows []LLMCallLog) []providercontract.AIGatewayCallLog {
	out := make([]providercontract.AIGatewayCallLog, 0, len(rows))
	for _, row := range rows {
		out = append(out, llmCallLogToContract(row))
	}
	return out
}

func llmCallLogsFromContract(rows []providercontract.AIGatewayCallLog) []LLMCallLog {
	out := make([]LLMCallLog, 0, len(rows))
	for _, row := range rows {
		out = append(out, llmCallLogFromContract(row))
	}
	return out
}

func llmCallLogToContract(row LLMCallLog) providercontract.AIGatewayCallLog {
	return providercontract.AIGatewayCallLog{
		ID:                row.ID,
		RequestID:         row.RequestID,
		UserID:            row.UserID,
		User:              llmUserRefToContract(row.User),
		OrgID:             row.OrgID,
		ProjectID:         row.ProjectID,
		GatewayAPIKeyID:   row.GatewayAPIKeyID,
		ModelID:           row.ModelID,
		CredentialID:      row.CredentialID,
		OperationType:     row.OperationType,
		PromptName:        row.PromptName,
		Provider:          row.Provider,
		RequestModel:      row.RequestModel,
		ResponseModel:     row.ResponseModel,
		Status:            row.Status,
		Error:             row.Error,
		LatencyMs:         row.LatencyMs,
		InputTokens:       row.InputTokens,
		OutputTokens:      row.OutputTokens,
		CachedInputTokens: row.CachedInputTokens,
		ReasoningTokens:   row.ReasoningTokens,
		RequestJSON:       row.RequestJSON,
		ResponseJSON:      row.ResponseJSON,
		PayloadTruncated:  row.PayloadTruncated,
		ExpiresAt:         row.ExpiresAt,
		RetentionDays:     row.RetentionDays,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
}

func llmCallLogFromContract(row providercontract.AIGatewayCallLog) LLMCallLog {
	return LLMCallLog{
		ID:                row.ID,
		RequestID:         row.RequestID,
		UserID:            row.UserID,
		User:              llmUserRefFromContract(row.User),
		OrgID:             row.OrgID,
		ProjectID:         row.ProjectID,
		GatewayAPIKeyID:   row.GatewayAPIKeyID,
		ModelID:           row.ModelID,
		CredentialID:      row.CredentialID,
		OperationType:     row.OperationType,
		PromptName:        row.PromptName,
		Provider:          row.Provider,
		RequestModel:      row.RequestModel,
		ResponseModel:     row.ResponseModel,
		Status:            row.Status,
		Error:             row.Error,
		LatencyMs:         row.LatencyMs,
		InputTokens:       row.InputTokens,
		OutputTokens:      row.OutputTokens,
		CachedInputTokens: row.CachedInputTokens,
		ReasoningTokens:   row.ReasoningTokens,
		RequestJSON:       row.RequestJSON,
		ResponseJSON:      row.ResponseJSON,
		PayloadTruncated:  row.PayloadTruncated,
		ExpiresAt:         row.ExpiresAt,
		RetentionDays:     row.RetentionDays,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
}

func llmCallLogSummaryToContract(summary LLMCallLogSummary) providercontract.AIGatewayCallLogSummary {
	return providercontract.AIGatewayCallLogSummary{
		Total:             summary.Total,
		Success:           summary.Success,
		Errors:            summary.Errors,
		ErrorRate:         summary.ErrorRate,
		AvgLatencyMs:      summary.AvgLatencyMs,
		InputTokens:       summary.InputTokens,
		OutputTokens:      summary.OutputTokens,
		CachedInputTokens: summary.CachedInputTokens,
		ReasoningTokens:   summary.ReasoningTokens,
		RecentErrors:      llmCallLogsToContract(summary.RecentErrors),
		GeneratedAt:       summary.GeneratedAt,
	}
}

func llmCallLogSummaryFromContract(summary providercontract.AIGatewayCallLogSummary) LLMCallLogSummary {
	return LLMCallLogSummary{
		Total:             summary.Total,
		Success:           summary.Success,
		Errors:            summary.Errors,
		ErrorRate:         summary.ErrorRate,
		AvgLatencyMs:      summary.AvgLatencyMs,
		InputTokens:       summary.InputTokens,
		OutputTokens:      summary.OutputTokens,
		CachedInputTokens: summary.CachedInputTokens,
		ReasoningTokens:   summary.ReasoningTokens,
		RecentErrors:      llmCallLogsFromContract(summary.RecentErrors),
		GeneratedAt:       summary.GeneratedAt,
	}
}

func llmUserRefToContract(ref *LLMCallLogUserRef) *providercontract.AIGatewayCallLogUserRef {
	if ref == nil {
		return nil
	}
	return &providercontract.AIGatewayCallLogUserRef{ID: ref.ID, Username: ref.Username, SystemRole: ref.SystemRole}
}

func llmUserRefFromContract(ref *providercontract.AIGatewayCallLogUserRef) *LLMCallLogUserRef {
	if ref == nil {
		return nil
	}
	return &LLMCallLogUserRef{ID: ref.ID, Username: ref.Username, SystemRole: ref.SystemRole}
}

package usage

import (
	"context"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

var _ providercontract.AIGatewayUsageReporter = (*gormRepository)(nil)

func (r *gormRepository) ListGatewayUsageLogs(ctx context.Context, filter providercontract.AIGatewayUsageLogFilter) (providercontract.AIGatewayUsageLogPage, error) {
	page, err := r.ListLogs(ctx, usageFilterFromContract(filter))
	if err != nil {
		return providercontract.AIGatewayUsageLogPage{}, err
	}
	return usagePageToContract(page), nil
}

func (r *gormRepository) ExportGatewayUsageLogs(ctx context.Context, filter providercontract.AIGatewayUsageLogFilter, limit int) ([]providercontract.AIGatewayUsageLog, error) {
	rows, err := r.ExportLogs(ctx, usageFilterFromContract(filter), limit)
	if err != nil {
		return nil, err
	}
	return usageLogsToContract(rows), nil
}

func (r *gormRepository) SummarizeGatewayUsage(ctx context.Context, filter providercontract.AIGatewayUsageLogFilter) (providercontract.AIGatewayUsageSummary, error) {
	summary, err := r.Summary(ctx, usageFilterFromContract(filter))
	if err != nil {
		return providercontract.AIGatewayUsageSummary{}, err
	}
	return usageSummaryToContract(summary), nil
}

func usageFilterFromContract(filter providercontract.AIGatewayUsageLogFilter) ListFilter {
	return ListFilter{
		UserID:        filter.UserID,
		OrgID:         filter.OrgID,
		ProjectID:     filter.ProjectID,
		ModelID:       filter.ModelID,
		ProviderID:    filter.ProviderID,
		GatewayKeyID:  filter.GatewayKeyID,
		OperationType: filter.OperationType,
		Since:         filter.Since,
		Until:         filter.Until,
		Page:          filter.Page,
		PageSize:      filter.PageSize,
	}
}

func usagePageToContract(page Page) providercontract.AIGatewayUsageLogPage {
	return providercontract.AIGatewayUsageLogPage{
		Items:    usageLogsToContract(page.Items),
		Total:    page.Total,
		Page:     page.Page,
		PageSize: page.PageSize,
	}
}

func usagePageFromContract(page providercontract.AIGatewayUsageLogPage) Page {
	return Page{
		Items:    usageLogsFromContract(page.Items),
		Total:    page.Total,
		Page:     page.Page,
		PageSize: page.PageSize,
	}
}

func usageLogsToContract(rows []Log) []providercontract.AIGatewayUsageLog {
	out := make([]providercontract.AIGatewayUsageLog, 0, len(rows))
	for _, row := range rows {
		out = append(out, usageLogToContract(row))
	}
	return out
}

func usageLogsFromContract(rows []providercontract.AIGatewayUsageLog) []Log {
	out := make([]Log, 0, len(rows))
	for _, row := range rows {
		out = append(out, usageLogFromContract(row))
	}
	return out
}

func usageLogToContract(row Log) providercontract.AIGatewayUsageLog {
	return providercontract.AIGatewayUsageLog{
		ID:                    row.ID,
		UserID:                row.UserID,
		OrgID:                 row.OrgID,
		AIModelCatalogEntryID: row.AIModelCatalogEntryID,
		UsageReservationID:    row.UsageReservationID,
		GatewayAPIKeyID:       row.GatewayAPIKeyID,
		ProjectID:             row.ProjectID,
		OperationType:         row.OperationType,
		InputTokens:           row.InputTokens,
		OutputTokens:          row.OutputTokens,
		CachedInputTokens:     row.CachedInputTokens,
		ReasoningTokens:       row.ReasoningTokens,
		DurationSec:           row.DurationSec,
		ImageCount:            row.ImageCount,
		Cost:                  row.Cost,
		User:                  usageUserRefToContract(row.User),
		AIModelCatalogEntry:   usageCatalogEntryRefToContract(row.AIModelCatalogEntry),
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}
}

func usageLogFromContract(row providercontract.AIGatewayUsageLog) Log {
	return Log{
		ID:                    row.ID,
		UserID:                row.UserID,
		OrgID:                 row.OrgID,
		AIModelCatalogEntryID: row.AIModelCatalogEntryID,
		UsageReservationID:    row.UsageReservationID,
		GatewayAPIKeyID:       row.GatewayAPIKeyID,
		ProjectID:             row.ProjectID,
		OperationType:         row.OperationType,
		InputTokens:           row.InputTokens,
		OutputTokens:          row.OutputTokens,
		CachedInputTokens:     row.CachedInputTokens,
		ReasoningTokens:       row.ReasoningTokens,
		DurationSec:           row.DurationSec,
		ImageCount:            row.ImageCount,
		Cost:                  row.Cost,
		User:                  usageUserRefFromContract(row.User),
		AIModelCatalogEntry:   usageCatalogEntryRefFromContract(row.AIModelCatalogEntry),
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}
}

func usageSummaryToContract(summary Summary) providercontract.AIGatewayUsageSummary {
	out := providercontract.AIGatewayUsageSummary{
		Totals:      usageTotalsToContract(summary.Totals),
		Operations:  make([]providercontract.AIGatewayUsageOperationSummary, 0, len(summary.Operations)),
		TopModels:   make([]providercontract.AIGatewayUsageModelSummary, 0, len(summary.TopModels)),
		TopUsers:    make([]providercontract.AIGatewayUsageUserSummary, 0, len(summary.TopUsers)),
		GeneratedAt: summary.GeneratedAt,
	}
	for _, row := range summary.Operations {
		out.Operations = append(out.Operations, providercontract.AIGatewayUsageOperationSummary{
			OperationType:        row.OperationType,
			AIGatewayUsageTotals: usageTotalsToContract(row.UsageTotals),
		})
	}
	for _, row := range summary.TopModels {
		out.TopModels = append(out.TopModels, providercontract.AIGatewayUsageModelSummary{
			AIModelCatalogEntryID: row.AIModelCatalogEntryID,
			AIModelCatalogEntry:   usageCatalogEntryRefToContract(row.AIModelCatalogEntry),
			AIGatewayUsageTotals:  usageTotalsToContract(row.UsageTotals),
		})
	}
	for _, row := range summary.TopUsers {
		out.TopUsers = append(out.TopUsers, providercontract.AIGatewayUsageUserSummary{
			UserID:               row.UserID,
			User:                 usageUserRefToContract(row.User),
			AIGatewayUsageTotals: usageTotalsToContract(row.UsageTotals),
		})
	}
	return out
}

func usageSummaryFromContract(summary providercontract.AIGatewayUsageSummary) Summary {
	out := Summary{
		Totals:      usageTotalsFromContract(summary.Totals),
		Operations:  make([]OperationSummary, 0, len(summary.Operations)),
		TopModels:   make([]ModelSummary, 0, len(summary.TopModels)),
		TopUsers:    make([]UserSummary, 0, len(summary.TopUsers)),
		GeneratedAt: summary.GeneratedAt,
	}
	for _, row := range summary.Operations {
		out.Operations = append(out.Operations, OperationSummary{
			OperationType: row.OperationType,
			UsageTotals:   usageTotalsFromContract(row.AIGatewayUsageTotals),
		})
	}
	for _, row := range summary.TopModels {
		out.TopModels = append(out.TopModels, ModelSummary{
			AIModelCatalogEntryID: row.AIModelCatalogEntryID,
			AIModelCatalogEntry:   usageCatalogEntryRefFromContract(row.AIModelCatalogEntry),
			UsageTotals:           usageTotalsFromContract(row.AIGatewayUsageTotals),
		})
	}
	for _, row := range summary.TopUsers {
		out.TopUsers = append(out.TopUsers, UserSummary{
			UserID:      row.UserID,
			User:        usageUserRefFromContract(row.User),
			UsageTotals: usageTotalsFromContract(row.AIGatewayUsageTotals),
		})
	}
	return out
}

func usageTotalsToContract(totals UsageTotals) providercontract.AIGatewayUsageTotals {
	return providercontract.AIGatewayUsageTotals{
		Records:           totals.Records,
		Cost:              totals.Cost,
		InputTokens:       totals.InputTokens,
		OutputTokens:      totals.OutputTokens,
		CachedInputTokens: totals.CachedInputTokens,
		ReasoningTokens:   totals.ReasoningTokens,
		DurationSec:       totals.DurationSec,
		ImageCount:        totals.ImageCount,
	}
}

func usageTotalsFromContract(totals providercontract.AIGatewayUsageTotals) UsageTotals {
	return UsageTotals{
		Records:           totals.Records,
		Cost:              totals.Cost,
		InputTokens:       totals.InputTokens,
		OutputTokens:      totals.OutputTokens,
		CachedInputTokens: totals.CachedInputTokens,
		ReasoningTokens:   totals.ReasoningTokens,
		DurationSec:       totals.DurationSec,
		ImageCount:        totals.ImageCount,
	}
}

func usageUserRefToContract(ref *UserRef) *providercontract.AIGatewayUsageUserRef {
	if ref == nil {
		return nil
	}
	return &providercontract.AIGatewayUsageUserRef{ID: ref.ID, Username: ref.Username, SystemRole: ref.SystemRole}
}

func usageUserRefFromContract(ref *providercontract.AIGatewayUsageUserRef) *UserRef {
	if ref == nil {
		return nil
	}
	return &UserRef{ID: ref.ID, Username: ref.Username, SystemRole: ref.SystemRole}
}

func usageModelRefToContract(ref *ModelConfigRef) *providercontract.AIGatewayUsageModelConfigRef {
	if ref == nil {
		return nil
	}
	return &providercontract.AIGatewayUsageModelConfigRef{
		ID:                ref.ID,
		CredentialID:      ref.CredentialID,
		ModelDefID:        ref.ModelDefID,
		ModelIDOverride:   ref.ModelIDOverride,
		CustomDisplayName: ref.CustomDisplayName,
		ShortName:         ref.ShortName,
	}
}

func usageModelRefFromContract(ref *providercontract.AIGatewayUsageModelConfigRef) *ModelConfigRef {
	if ref == nil {
		return nil
	}
	return &ModelConfigRef{
		ID:                ref.ID,
		CredentialID:      ref.CredentialID,
		ModelDefID:        ref.ModelDefID,
		ModelIDOverride:   ref.ModelIDOverride,
		CustomDisplayName: ref.CustomDisplayName,
		ShortName:         ref.ShortName,
	}
}

func usageCatalogEntryRefToContract(ref *CatalogEntryRef) *providercontract.AIGatewayUsageCatalogEntryRef {
	if ref == nil {
		return nil
	}
	return &providercontract.AIGatewayUsageCatalogEntryRef{
		ID:              ref.ID,
		PublicModelID:   ref.PublicModelID,
		ProviderModelID: ref.ProviderModelID,
		DisplayName:     ref.DisplayName,
		ShortName:       ref.ShortName,
	}
}

func usageCatalogEntryRefFromContract(ref *providercontract.AIGatewayUsageCatalogEntryRef) *CatalogEntryRef {
	if ref == nil {
		return nil
	}
	return &CatalogEntryRef{
		ID:              ref.ID,
		PublicModelID:   ref.PublicModelID,
		ProviderModelID: ref.ProviderModelID,
		DisplayName:     ref.DisplayName,
		ShortName:       ref.ShortName,
	}
}

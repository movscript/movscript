package usage

import (
	"context"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	ListLogs(ctx context.Context, filter ListFilter) (Page, error)
	ExportLogs(ctx context.Context, filter ListFilter, limit int) ([]Log, error)
	Summary(ctx context.Context, filter ListFilter) (Summary, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListLogs(ctx context.Context, filter ListFilter) (Page, error) {
	page := filter.Page
	if page <= 0 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = 50
	}
	if pageSize > 200 {
		pageSize = 200
	}

	q := r.filteredQuery(ctx, filter).Order("usage_logs.id desc")

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return Page{}, err
	}

	rows := make([]persistencemodel.UsageLog, 0)
	if err := q.
		Preload("User").
		Preload("AIModelCatalogEntry").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&rows).Error; err != nil {
		return Page{}, err
	}

	return Page{Items: usageLogsFromModels(rows), Total: total, Page: page, PageSize: pageSize}, nil
}

func (r *gormRepository) ExportLogs(ctx context.Context, filter ListFilter, limit int) ([]Log, error) {
	if limit <= 0 {
		limit = 1000
	}
	rows := make([]persistencemodel.UsageLog, 0)
	if err := r.filteredQuery(ctx, filter).
		Preload("User").
		Preload("AIModelCatalogEntry").
		Order("usage_logs.id desc").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	return usageLogsFromModels(rows), nil
}

func (r *gormRepository) Summary(ctx context.Context, filter ListFilter) (Summary, error) {
	var totals UsageTotals
	if err := r.filteredQuery(ctx, filter).
		Select(usageSummarySelect("")).
		Scan(&totals).Error; err != nil {
		return Summary{}, err
	}

	operations := make([]OperationSummary, 0)
	if err := r.filteredQuery(ctx, filter).
		Select("usage_logs.operation_type, " + usageSummarySelect("")).
		Group("usage_logs.operation_type").
		Order("cost desc").
		Scan(&operations).Error; err != nil {
		return Summary{}, err
	}

	topModels := make([]ModelSummary, 0)
	if err := r.filteredQuery(ctx, filter).
		Select("usage_logs.ai_model_catalog_entry_id as ai_model_catalog_entry_id, " + usageSummarySelect("")).
		Where("usage_logs.ai_model_catalog_entry_id IS NOT NULL").
		Group("usage_logs.ai_model_catalog_entry_id").
		Order("cost desc").
		Limit(10).
		Scan(&topModels).Error; err != nil {
		return Summary{}, err
	}
	if err := r.fillCatalogEntryRefs(ctx, topModels); err != nil {
		return Summary{}, err
	}

	topUsers := make([]UserSummary, 0)
	if err := r.filteredQuery(ctx, filter).
		Select("usage_logs.user_id, " + usageSummarySelect("")).
		Group("usage_logs.user_id").
		Order("cost desc").
		Limit(10).
		Scan(&topUsers).Error; err != nil {
		return Summary{}, err
	}
	if err := r.fillUserRefs(ctx, topUsers); err != nil {
		return Summary{}, err
	}

	return Summary{Totals: totals, Operations: operations, TopModels: topModels, TopUsers: topUsers}, nil
}

func (r *gormRepository) filteredQuery(ctx context.Context, filter ListFilter) *gorm.DB {
	q := r.db.WithContext(ctx).
		Model(&persistencemodel.UsageLog{})
	hasCatalogEntries := r.db.Migrator().HasTable(&persistencemodel.AIModelCatalogEntry{})
	hasLegacyConfigs := r.db.Migrator().HasTable(&persistencemodel.AIModelConfig{})
	if hasCatalogEntries {
		q = q.Joins("LEFT JOIN ai_model_catalog_entries ON ai_model_catalog_entries.id = usage_logs.ai_model_catalog_entry_id")
	}
	if hasLegacyConfigs {
		q = q.Joins("LEFT JOIN ai_model_configs ON ai_model_configs.id = usage_logs.ai_model_config_id")
	}

	if filter.UserID != "" {
		q = q.Where("usage_logs.user_id = ?", filter.UserID)
	}
	if filter.OrgID != "" {
		q = q.Where("usage_logs.org_id = ?", filter.OrgID)
	}
	if filter.ProjectID != "" {
		q = q.Where("usage_logs.project_id = ?", filter.ProjectID)
	}
	if filter.ModelID != "" {
		if hasCatalogEntries {
			q = q.Where("ai_model_catalog_entries.public_model_id = ? OR ai_model_catalog_entries.provider_model_id = ?", filter.ModelID, filter.ModelID)
		} else {
			q = q.Where("1 = 0")
		}
	}
	if filter.ProviderID != "" {
		if hasLegacyConfigs {
			q = q.Where("ai_model_configs.credential_id = ?", filter.ProviderID)
		} else {
			q = q.Where("1 = 0")
		}
	}
	if filter.GatewayKeyID != "" {
		q = q.Where("usage_logs.gateway_api_key_id = ?", filter.GatewayKeyID)
	}
	if filter.OperationType != "" {
		q = q.Where("usage_logs.operation_type = ?", filter.OperationType)
	}
	if filter.Since != nil {
		q = q.Where("usage_logs.created_at >= ?", *filter.Since)
	}
	if filter.Until != nil {
		q = q.Where("usage_logs.created_at <= ?", *filter.Until)
	}
	return q
}

func usageSummarySelect(prefix string) string {
	if prefix == "" {
		prefix = "usage_logs"
	}
	return "COUNT(*) as records, " +
		"COALESCE(SUM(" + prefix + ".cost), 0) as cost, " +
		"COALESCE(SUM(" + prefix + ".input_tokens), 0) as input_tokens, " +
		"COALESCE(SUM(" + prefix + ".output_tokens), 0) as output_tokens, " +
		"COALESCE(SUM(" + prefix + ".cached_input_tokens), 0) as cached_input_tokens, " +
		"COALESCE(SUM(" + prefix + ".reasoning_tokens), 0) as reasoning_tokens, " +
		"COALESCE(SUM(" + prefix + ".duration_sec), 0) as duration_sec, " +
		"COALESCE(SUM(CASE WHEN " + prefix + ".operation_type = 'image' THEN " + prefix + ".image_count ELSE 0 END), 0) as image_count"
}

func (r *gormRepository) fillCatalogEntryRefs(ctx context.Context, rows []ModelSummary) error {
	ids := make([]uint, 0, len(rows))
	for _, row := range rows {
		if row.AIModelCatalogEntryID != nil && *row.AIModelCatalogEntryID != 0 {
			ids = append(ids, *row.AIModelCatalogEntryID)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	entries := make([]persistencemodel.AIModelCatalogEntry, 0, len(ids))
	if err := r.db.WithContext(ctx).Find(&entries, ids).Error; err != nil {
		return err
	}
	byID := make(map[uint]CatalogEntryRef, len(entries))
	for _, entry := range entries {
		byID[entry.ID] = catalogEntryRefFromModel(entry)
	}
	for i := range rows {
		if rows[i].AIModelCatalogEntryID != nil {
			if ref, ok := byID[*rows[i].AIModelCatalogEntryID]; ok {
				rows[i].AIModelCatalogEntry = &ref
			}
		}
	}
	return nil
}

func (r *gormRepository) fillUserRefs(ctx context.Context, rows []UserSummary) error {
	ids := make([]uint, 0, len(rows))
	for _, row := range rows {
		if row.UserID != 0 {
			ids = append(ids, row.UserID)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	users := make([]persistencemodel.User, 0, len(ids))
	if err := r.db.WithContext(ctx).Find(&users, ids).Error; err != nil {
		return err
	}
	byID := make(map[uint]UserRef, len(users))
	for _, user := range users {
		byID[user.ID] = UserRef{ID: user.ID, Username: user.Username, SystemRole: user.SystemRole}
	}
	for i := range rows {
		if ref, ok := byID[rows[i].UserID]; ok {
			rows[i].User = &ref
		}
	}
	return nil
}

func usageLogsFromModels(rows []persistencemodel.UsageLog) []Log {
	out := make([]Log, 0, len(rows))
	for _, row := range rows {
		out = append(out, usageLogFromModel(row))
	}
	return out
}

func usageLogFromModel(row persistencemodel.UsageLog) Log {
	item := Log{
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
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}
	if row.User.ID != 0 {
		item.User = &UserRef{ID: row.User.ID, Username: row.User.Username, SystemRole: row.User.SystemRole}
	}
	if row.AIModelCatalogEntry != nil && row.AIModelCatalogEntry.ID != 0 {
		ref := catalogEntryRefFromModel(*row.AIModelCatalogEntry)
		item.AIModelCatalogEntry = &ref
	}
	return item
}

func catalogEntryRefFromModel(entry persistencemodel.AIModelCatalogEntry) CatalogEntryRef {
	return CatalogEntryRef{
		ID:              entry.ID,
		PublicModelID:   entry.PublicModelID,
		ProviderModelID: entry.ProviderModelID,
		DisplayName:     entry.DisplayName,
		ShortName:       entry.ShortName,
	}
}

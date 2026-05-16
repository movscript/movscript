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
		Preload("AIModelConfig").
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
		Preload("AIModelConfig").
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
		Select("usage_logs.ai_model_config_id as model_config_id, " + usageSummarySelect("")).
		Group("usage_logs.ai_model_config_id").
		Order("cost desc").
		Limit(10).
		Scan(&topModels).Error; err != nil {
		return Summary{}, err
	}
	if err := r.fillModelRefs(ctx, topModels); err != nil {
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
		Model(&persistencemodel.UsageLog{}).
		Joins("LEFT JOIN ai_model_configs ON ai_model_configs.id = usage_logs.ai_model_config_id")

	if filter.UserID != "" {
		q = q.Where("usage_logs.user_id = ?", filter.UserID)
	}
	if filter.OrgID != "" {
		q = q.Where("usage_logs.org_id = ?", filter.OrgID)
	}
	if filter.ProjectID != "" {
		q = q.Where("usage_logs.project_id = ?", filter.ProjectID)
	}
	if filter.ModelConfigID != "" {
		q = q.Where("usage_logs.ai_model_config_id = ?", filter.ModelConfigID)
	}
	if filter.ProviderID != "" {
		q = q.Where("ai_model_configs.credential_id = ?", filter.ProviderID)
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
		"COALESCE(SUM(" + prefix + ".duration_sec), 0) as duration_sec, " +
		"COALESCE(SUM(CASE WHEN " + prefix + ".operation_type = 'image' THEN " + prefix + ".image_count ELSE 0 END), 0) as image_count"
}

func (r *gormRepository) fillModelRefs(ctx context.Context, rows []ModelSummary) error {
	ids := make([]uint, 0, len(rows))
	for _, row := range rows {
		if row.ModelConfigID != 0 {
			ids = append(ids, row.ModelConfigID)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	configs := make([]persistencemodel.AIModelConfig, 0, len(ids))
	if err := r.db.WithContext(ctx).Find(&configs, ids).Error; err != nil {
		return err
	}
	byID := make(map[uint]ModelConfigRef, len(configs))
	for _, cfg := range configs {
		byID[cfg.ID] = ModelConfigRef{
			ID:                cfg.ID,
			CredentialID:      cfg.CredentialID,
			ModelDefID:        cfg.ModelDefID,
			ModelIDOverride:   cfg.ModelIDOverride,
			CustomDisplayName: cfg.CustomDisplayName,
			ShortName:         cfg.ShortName,
		}
	}
	for i := range rows {
		if ref, ok := byID[rows[i].ModelConfigID]; ok {
			rows[i].AIModelConfig = &ref
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
		ID:                 row.ID,
		UserID:             row.UserID,
		OrgID:              row.OrgID,
		AIModelConfigID:    row.AIModelConfigID,
		UsageReservationID: row.UsageReservationID,
		GatewayAPIKeyID:    row.GatewayAPIKeyID,
		ProjectID:          row.ProjectID,
		OperationType:      row.OperationType,
		InputTokens:        row.InputTokens,
		OutputTokens:       row.OutputTokens,
		DurationSec:        row.DurationSec,
		ImageCount:         row.ImageCount,
		Cost:               row.Cost,
		CreatedAt:          row.CreatedAt,
		UpdatedAt:          row.UpdatedAt,
	}
	if row.User.ID != 0 {
		item.User = &UserRef{ID: row.User.ID, Username: row.User.Username, SystemRole: row.User.SystemRole}
	}
	if row.AIModelConfig.ID != 0 {
		item.AIModelConfig = &ModelConfigRef{
			ID:                row.AIModelConfig.ID,
			CredentialID:      row.AIModelConfig.CredentialID,
			ModelDefID:        row.AIModelConfig.ModelDefID,
			ModelIDOverride:   row.AIModelConfig.ModelIDOverride,
			CustomDisplayName: row.AIModelConfig.CustomDisplayName,
			ShortName:         row.AIModelConfig.ShortName,
		}
	}
	return item
}

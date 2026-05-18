package debug

import (
	"context"
	"errors"
	"time"

	domainai "github.com/movscript/movscript/internal/domain/ai"
	domainjob "github.com/movscript/movscript/internal/domain/job"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	GetCredential(ctx context.Context, id uint) (domainai.Credential, error)
	ListJobs(ctx context.Context, filters JobFilters, limit, offset int) (JobPage, error)
	JobStats(ctx context.Context, recentLimit int) (JobStats, error)
	GetJob(ctx context.Context, id string) (domainjob.Job, error)
	ListLLMCallLogs(ctx context.Context, filter LLMCallLogFilter) (LLMCallLogPage, error)
	LLMCallLogSummary(ctx context.Context, filter LLMCallLogFilter) (LLMCallLogSummary, error)
	GetAdminSetting(ctx context.Context, key string) (string, error)
	SaveAdminSetting(ctx context.Context, key string, valueJSON string) error
	PurgeExpiredLLMCallLogs(ctx context.Context, now time.Time) (int64, error)
	UpdateLLMCallLogExpiration(ctx context.Context, id uint, expiresAt *time.Time) (LLMCallLog, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) GetCredential(ctx context.Context, id uint) (domainai.Credential, error) {
	var cred persistencemodel.AICredential
	if err := r.db.WithContext(ctx).First(&cred, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainai.Credential{}, ErrNotFound
		}
		return domainai.Credential{}, err
	}
	return domainai.CredentialFromModel(cred), nil
}

func (r *gormRepository) ListJobs(ctx context.Context, filters JobFilters, limit, offset int) (JobPage, error) {
	q := r.db.WithContext(ctx).Model(&persistencemodel.Job{}).Preload("OutputResource")
	q = applyJobFilters(q, filters)

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return JobPage{}, err
	}

	items := make([]persistencemodel.Job, 0)
	if err := q.Order("id DESC").Limit(limit).Offset(offset).Find(&items).Error; err != nil {
		return JobPage{}, err
	}
	return JobPage{Items: domainjob.JobsFromModels(items), Total: total}, nil
}

func applyJobFilters(q *gorm.DB, filters JobFilters) *gorm.DB {
	if filters.JobID != nil {
		q = q.Where("id = ?", *filters.JobID)
	}
	if filters.Status != "" {
		q = q.Where("status = ?", filters.Status)
	}
	if filters.JobType != "" {
		q = q.Where("job_type = ?", filters.JobType)
	}
	if filters.FeatureKey != "" {
		q = q.Where("feature_key = ?", filters.FeatureKey)
	}
	if filters.UserID != nil {
		q = q.Where("user_id = ?", *filters.UserID)
	}
	if filters.OrgID != nil {
		q = q.Where("org_id = ?", *filters.OrgID)
	}
	if filters.ProjectID != nil {
		q = q.Where("project_id = ?", *filters.ProjectID)
	}
	if filters.ModelConfigID != nil {
		q = q.Where("model_config_id = ?", *filters.ModelConfigID)
	}
	return q
}

func (r *gormRepository) JobStats(ctx context.Context, recentLimit int) (JobStats, error) {
	var rows []JobStatusCount
	if err := r.db.WithContext(ctx).Model(&persistencemodel.Job{}).
		Select("status, count(*) as count").
		Group("status").
		Order("status").
		Scan(&rows).Error; err != nil {
		return JobStats{}, err
	}
	var total int64
	for _, row := range rows {
		total += row.Count
	}
	recent := make([]persistencemodel.Job, 0)
	if err := r.db.WithContext(ctx).Model(&persistencemodel.Job{}).
		Preload("OutputResource").
		Where("status = ?", domainjob.StatusFailed).
		Order("id DESC").
		Limit(recentLimit).
		Find(&recent).Error; err != nil {
		return JobStats{}, err
	}
	return JobStats{Total: total, ByStatus: rows, RecentFailed: jobDetailsFromJobs(domainjob.JobsFromModels(recent))}, nil
}

func (r *gormRepository) GetJob(ctx context.Context, id string) (domainjob.Job, error) {
	var job persistencemodel.Job
	if err := r.db.WithContext(ctx).Preload("OutputResource").First(&job, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainjob.Job{}, ErrNotFound
		}
		return domainjob.Job{}, err
	}
	return domainjob.JobFromModel(job), nil
}

func (r *gormRepository) ListLLMCallLogs(ctx context.Context, filter LLMCallLogFilter) (LLMCallLogPage, error) {
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

	q := r.filteredLLMCallLogQuery(ctx, filter)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return LLMCallLogPage{}, err
	}
	rows := make([]persistencemodel.LLMCallLog, 0)
	if err := q.
		Preload("User").
		Preload("AIModelConfig").
		Order("llm_call_logs.id DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&rows).Error; err != nil {
		return LLMCallLogPage{}, err
	}
	return LLMCallLogPage{Items: llmCallLogsFromModels(rows), Total: total, Page: page, PageSize: pageSize}, nil
}

func (r *gormRepository) LLMCallLogSummary(ctx context.Context, filter LLMCallLogFilter) (LLMCallLogSummary, error) {
	var row struct {
		Total        int64
		Success      int64
		Errors       int64
		AvgLatencyMs float64
		InputTokens  int64
		OutputTokens int64
	}
	if err := r.filteredLLMCallLogQuery(ctx, filter).
		Select("COUNT(*) as total, " +
			"COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) as success, " +
			"COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) as errors, " +
			"COALESCE(AVG(latency_ms), 0) as avg_latency_ms, " +
			"COALESCE(SUM(input_tokens), 0) as input_tokens, " +
			"COALESCE(SUM(output_tokens), 0) as output_tokens").
		Scan(&row).Error; err != nil {
		return LLMCallLogSummary{}, err
	}
	recent := make([]persistencemodel.LLMCallLog, 0)
	recentFilter := filter
	recentFilter.Status = "error"
	if err := r.filteredLLMCallLogQuery(ctx, recentFilter).
		Preload("User").
		Preload("AIModelConfig").
		Order("llm_call_logs.id DESC").
		Limit(8).
		Find(&recent).Error; err != nil {
		return LLMCallLogSummary{}, err
	}
	errorRate := 0.0
	if row.Total > 0 {
		errorRate = float64(row.Errors) / float64(row.Total) * 100
	}
	return LLMCallLogSummary{
		Total:        row.Total,
		Success:      row.Success,
		Errors:       row.Errors,
		ErrorRate:    errorRate,
		AvgLatencyMs: row.AvgLatencyMs,
		InputTokens:  row.InputTokens,
		OutputTokens: row.OutputTokens,
		RecentErrors: llmCallLogsFromModels(recent),
	}, nil
}

func (r *gormRepository) filteredLLMCallLogQuery(ctx context.Context, filter LLMCallLogFilter) *gorm.DB {
	q := r.db.WithContext(ctx).Model(&persistencemodel.LLMCallLog{})
	if filter.UserID != "" {
		q = q.Where("llm_call_logs.user_id = ?", filter.UserID)
	}
	if filter.OrgID != "" {
		q = q.Where("llm_call_logs.org_id = ?", filter.OrgID)
	}
	if filter.ProjectID != "" {
		q = q.Where("llm_call_logs.project_id = ?", filter.ProjectID)
	}
	if filter.ModelConfigID != "" {
		q = q.Where("llm_call_logs.ai_model_config_id = ?", filter.ModelConfigID)
	}
	if filter.CredentialID != "" {
		q = q.Where("llm_call_logs.credential_id = ?", filter.CredentialID)
	}
	if filter.GatewayAPIKeyID != "" {
		q = q.Where("llm_call_logs.gateway_api_key_id = ?", filter.GatewayAPIKeyID)
	}
	if filter.OperationType != "" {
		q = q.Where("llm_call_logs.operation_type = ?", filter.OperationType)
	}
	if filter.Status != "" {
		q = q.Where("llm_call_logs.status = ?", filter.Status)
	}
	if filter.Provider != "" {
		q = q.Where("llm_call_logs.provider = ?", filter.Provider)
	}
	if filter.PromptName != "" {
		q = q.Where("llm_call_logs.prompt_name = ?", filter.PromptName)
	}
	if filter.Since != nil {
		q = q.Where("llm_call_logs.created_at >= ?", *filter.Since)
	}
	if filter.Until != nil {
		q = q.Where("llm_call_logs.created_at <= ?", *filter.Until)
	}
	now := time.Now().UTC()
	if filter.ExpiredOnly {
		q = q.Where("llm_call_logs.expires_at IS NOT NULL AND llm_call_logs.expires_at <= ?", now)
	} else if !filter.IncludeExpired {
		q = q.Where("(llm_call_logs.expires_at IS NULL OR llm_call_logs.expires_at > ?)", now)
	}
	return q
}

func (r *gormRepository) GetAdminSetting(ctx context.Context, key string) (string, error) {
	var setting persistencemodel.AdminSetting
	if err := r.db.WithContext(ctx).Where("key = ?", key).First(&setting).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", ErrNotFound
		}
		return "", err
	}
	return setting.ValueJSON, nil
}

func (r *gormRepository) SaveAdminSetting(ctx context.Context, key string, valueJSON string) error {
	var setting persistencemodel.AdminSetting
	err := r.db.WithContext(ctx).Where("key = ?", key).First(&setting).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return r.db.WithContext(ctx).Create(&persistencemodel.AdminSetting{Key: key, ValueJSON: valueJSON}).Error
		}
		return err
	}
	setting.ValueJSON = valueJSON
	return r.db.WithContext(ctx).Save(&setting).Error
}

func (r *gormRepository) PurgeExpiredLLMCallLogs(ctx context.Context, now time.Time) (int64, error) {
	result := r.db.WithContext(ctx).
		Unscoped().
		Where("expires_at IS NOT NULL AND expires_at <= ?", now.UTC()).
		Delete(&persistencemodel.LLMCallLog{})
	return result.RowsAffected, result.Error
}

func (r *gormRepository) UpdateLLMCallLogExpiration(ctx context.Context, id uint, expiresAt *time.Time) (LLMCallLog, error) {
	var row persistencemodel.LLMCallLog
	if err := r.db.WithContext(ctx).First(&row, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return LLMCallLog{}, ErrNotFound
		}
		return LLMCallLog{}, err
	}
	if err := r.db.WithContext(ctx).Model(&row).Update("expires_at", expiresAt).Error; err != nil {
		return LLMCallLog{}, err
	}
	if err := r.db.WithContext(ctx).Preload("User").Preload("AIModelConfig").First(&row, id).Error; err != nil {
		return LLMCallLog{}, err
	}
	return llmCallLogFromModel(row), nil
}

func llmCallLogsFromModels(rows []persistencemodel.LLMCallLog) []LLMCallLog {
	out := make([]LLMCallLog, 0, len(rows))
	for _, row := range rows {
		out = append(out, llmCallLogFromModel(row))
	}
	return out
}

func llmCallLogFromModel(row persistencemodel.LLMCallLog) LLMCallLog {
	item := LLMCallLog{
		ID:               row.ID,
		RequestID:        row.RequestID,
		UserID:           row.UserID,
		OrgID:            row.OrgID,
		ProjectID:        row.ProjectID,
		GatewayAPIKeyID:  row.GatewayAPIKeyID,
		AIModelConfigID:  row.AIModelConfigID,
		CredentialID:     row.CredentialID,
		OperationType:    row.OperationType,
		PromptName:       row.PromptName,
		Provider:         row.Provider,
		RequestModel:     row.RequestModel,
		ResponseModel:    row.ResponseModel,
		Status:           row.Status,
		Error:            row.Error,
		LatencyMs:        row.LatencyMs,
		InputTokens:      row.InputTokens,
		OutputTokens:     row.OutputTokens,
		RequestJSON:      row.RequestJSON,
		ResponseJSON:     row.ResponseJSON,
		PayloadTruncated: row.PayloadTruncated,
		ExpiresAt:        row.ExpiresAt,
		RetentionDays:    row.RetentionDays,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}
	if row.User.ID != 0 {
		item.User = &LLMCallLogUserRef{ID: row.User.ID, Username: row.User.Username, SystemRole: row.User.SystemRole}
	}
	if row.AIModelConfig.ID != 0 {
		item.AIModelConfig = &LLMCallLogModelConfigRef{
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

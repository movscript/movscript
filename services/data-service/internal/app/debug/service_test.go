package debug

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	domainjob "github.com/movscript/movscript/internal/domain/job"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
)

func TestServiceUsesGatewayAuditLogReaderContract(t *testing.T) {
	now := time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC)
	reader := &fakeAuditLogReader{
		page: providercontract.AIGatewayCallLogPage{
			Items: []providercontract.AIGatewayCallLog{{
				ID:            1,
				UserID:        7,
				ModelID:       "gpt-5.2",
				CredentialID:  11,
				OperationType: "text",
				Status:        "success",
				InputTokens:   3,
				OutputTokens:  2,
				CreatedAt:     now,
			}},
			Total:    1,
			Page:     2,
			PageSize: 10,
		},
		summary: providercontract.AIGatewayCallLogSummary{
			Total:        1,
			Success:      1,
			InputTokens:  3,
			OutputTokens: 2,
			RecentErrors: []providercontract.AIGatewayCallLog{{
				ID:            2,
				UserID:        7,
				ModelID:       "gpt-5.2",
				CredentialID:  11,
				OperationType: "text",
				Status:        "error",
				CreatedAt:     now,
			}},
			GeneratedAt: now,
		},
	}
	service := NewServiceWithAuditLogReader(nil, reader, nil, fakeDebugIdentity{
		profiles: map[uint]domainidentity.UserProfile{
			7: {ID: 7, Username: "debug-user", SystemRole: domainidentity.SystemRoleUser, Status: domainidentity.UserStatusActive},
		},
	})
	filter := LLMCallLogFilter{CredentialID: "11", Status: "success", Page: 2, PageSize: 10}

	page, err := service.ListLLMCallLogs(context.Background(), filter)
	if err != nil {
		t.Fatalf("ListLLMCallLogs() error = %v", err)
	}
	if page.Total != 1 || page.Page != 2 || len(page.Items) != 1 || page.Items[0].ModelID != "gpt-5.2" {
		t.Fatalf("page = %#v, want reader data mapped to debug shape", page)
	}
	if page.Items[0].User == nil || page.Items[0].User.Username != "debug-user" {
		t.Fatalf("user ref = %#v, want AuthIdentity-enriched debug-user", page.Items[0].User)
	}
	summary, err := service.LLMCallLogSummary(context.Background(), filter)
	if err != nil {
		t.Fatalf("LLMCallLogSummary() error = %v", err)
	}
	if summary.Total != 1 || summary.Success != 1 || !summary.GeneratedAt.Equal(now) {
		t.Fatalf("summary = %#v, want reader summary", summary)
	}
	if len(summary.RecentErrors) != 1 || summary.RecentErrors[0].User == nil || summary.RecentErrors[0].User.Username != "debug-user" {
		t.Fatalf("recent errors = %#v, want AuthIdentity-enriched user ref", summary.RecentErrors)
	}
	if len(reader.filters) != 2 || reader.filters[0].CredentialID != "11" || reader.filters[0].Status != "success" || reader.filters[0].Page != 2 {
		t.Fatalf("reader filters = %#v, want mapped filters", reader.filters)
	}
}

type fakeDebugIdentity struct {
	profiles map[uint]domainidentity.UserProfile
}

func (f fakeDebugIdentity) UserProfile(_ context.Context, userID uint) (domainidentity.UserProfile, error) {
	profile, ok := f.profiles[userID]
	if !ok {
		return domainidentity.UserProfile{}, authidentity.ErrUserNotFound
	}
	return profile, nil
}

func (f fakeDebugIdentity) OrgMemberships(_ context.Context, _ uint) ([]authidentity.OrgMembership, error) {
	return nil, nil
}

func TestListLLMCallLogsWithoutLegacyModelConfigTable(t *testing.T) {
	db := testutil.OpenSQLite(t, "debug-llm-no-legacy-model-config.db", &persistencemodel.LLMCallLog{})
	row := persistencemodel.LLMCallLog{
		UserID:        7,
		CredentialID:  3,
		OperationType: "text",
		RequestModel:  "gpt-5.2",
		ResponseModel: "gpt-5.2",
		Status:        "success",
		LatencyMs:     12,
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("seed llm call log: %v", err)
	}

	service := NewService(db)
	page, err := service.ListLLMCallLogs(context.Background(), LLMCallLogFilter{ModelID: "gpt-5.2"})
	if err != nil {
		t.Fatalf("ListLLMCallLogs() without legacy model config table error = %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ModelID != "gpt-5.2" {
		t.Fatalf("page = %#v, want request/response model fallback", page)
	}

	summary, err := service.LLMCallLogSummary(context.Background(), LLMCallLogFilter{ModelID: "gpt-5.2"})
	if err != nil {
		t.Fatalf("LLMCallLogSummary() without legacy model config table error = %v", err)
	}
	if summary.Total != 1 || summary.Success != 1 {
		t.Fatalf("summary = %#v, want one successful call", summary)
	}
}

func TestListLLMCallLogsDoesNotFilterByLegacyModelConfig(t *testing.T) {
	db := testutil.OpenSQLite(t, "debug-llm-no-legacy-model-config-filter.db",
		&persistencemodel.AICredential{},
		&persistencemodel.LLMCallLog{},
	)
	cred := persistencemodel.AICredential{AdapterType: "openai_compat", DisplayName: "legacy provider", IsEnabled: true}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("seed credential: %v", err)
	}
	row := persistencemodel.LLMCallLog{
		UserID:         7,
		RuntimeModelID: 99,
		CredentialID:   cred.ID,
		OperationType:  "text",
		RequestModel:   "public-chat",
		ResponseModel:  "public-chat",
		Status:         "success",
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("seed llm call log: %v", err)
	}

	service := NewService(db)
	page, err := service.ListLLMCallLogs(context.Background(), LLMCallLogFilter{ModelID: "gpt-legacy"})
	if err != nil {
		t.Fatalf("ListLLMCallLogs() legacy config filter error = %v", err)
	}
	if page.Total != 0 || len(page.Items) != 0 {
		t.Fatalf("page = %#v, want no match from legacy ai_model_configs", page)
	}

	page, err = service.ListLLMCallLogs(context.Background(), LLMCallLogFilter{ModelID: "public-chat"})
	if err != nil {
		t.Fatalf("ListLLMCallLogs() request model filter error = %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ModelID != "public-chat" {
		t.Fatalf("page = %#v, want request/response model match", page)
	}
}

func TestListLLMCallLogsFiltersByCatalogEntryWithoutLegacyModelConfigTable(t *testing.T) {
	db := testutil.OpenSQLite(t, "debug-llm-catalog-entry-filter.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.LLMCallLog{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: "gpt-5.2",
		DisplayName:   "GPT 5.2",
		Capabilities:  "text",
		IsEnabled:     true,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("seed catalog entry: %v", err)
	}
	row := persistencemodel.LLMCallLog{
		UserID:                7,
		AIModelCatalogEntryID: &entry.ID,
		CredentialID:          3,
		OperationType:         "text",
		Status:                "success",
		LatencyMs:             12,
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("seed llm call log: %v", err)
	}

	service := NewService(db)
	page, err := service.ListLLMCallLogs(context.Background(), LLMCallLogFilter{ModelID: "gpt-5.2"})
	if err != nil {
		t.Fatalf("ListLLMCallLogs() with catalog entry filter error = %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 {
		t.Fatalf("page = %#v, want one catalog-filtered call", page)
	}
	if page.Items[0].CatalogEntryID == nil || *page.Items[0].CatalogEntryID != entry.ID {
		t.Fatalf("catalog entry id = %v, want %d", page.Items[0].CatalogEntryID, entry.ID)
	}
}

func TestDoRawHTTPBlocksUnsafeURLs(t *testing.T) {
	tests := []string{
		"http://127.0.0.1:8765/health",
		"http://localhost:8765/health",
		"ftp://example.com/file",
	}
	for _, rawURL := range tests {
		t.Run(rawURL, func(t *testing.T) {
			result := doRawHTTP(context.Background(), "GET", rawURL, nil, "")
			if result.Error == "" {
				t.Fatal("expected unsafe URL to be blocked")
			}
			if strings.Contains(result.Error, "unsupported protocol scheme") {
				t.Fatalf("URL was blocked too late by HTTP client: %v", result.Error)
			}
		})
	}
}

func TestProviderCallBlocksUnsafeBaseURL(t *testing.T) {
	svc := NewService(nil)

	result := svc.ProviderCall(context.Background(), ProviderCallInput{
		AdapterType: "openai_compat",
		BaseURL:     "http://127.0.0.1:8765/v1",
		APIKey:      "sk-test",
		Capability:  "text",
		Model:       "debug-model",
		DryRun:      true,
	})

	if result.Error == "" {
		t.Fatal("expected unsafe provider base_url to be blocked")
	}
	if !strings.Contains(result.Error, "provider base_url") {
		t.Fatalf("expected provider base_url validation error, got %q", result.Error)
	}
	if strings.Contains(result.Error, "unsupported protocol scheme") {
		t.Fatalf("URL was blocked too late by HTTP client: %v", result.Error)
	}
}

func TestProviderCallBlocksUnsafeEndpointURL(t *testing.T) {
	svc := NewService(nil)

	result := svc.ProviderCall(context.Background(), ProviderCallInput{
		AdapterType: "openai_compat",
		BaseURL:     "https://93.184.216.34/v1",
		APIKey:      "sk-test",
		EndpointURL: "http://localhost:8765/v1/images/generations",
		Model:       "debug-model",
		DryRun:      true,
	})

	if result.Error == "" {
		t.Fatal("expected unsafe provider endpoint_url to be blocked")
	}
	if !strings.Contains(result.Error, "provider endpoint_url") {
		t.Fatalf("expected provider endpoint_url validation error, got %q", result.Error)
	}
}

func TestListJobDetailsFiltersOperationalScope(t *testing.T) {
	db := testutil.OpenSQLite(t, "debug-jobs.db", &persistencemodel.Job{}, &persistencemodel.RawResource{})
	projectID := uint(10)
	otherProjectID := uint(11)
	orgID := uint(2)
	otherOrgID := uint(3)
	jobs := []persistencemodel.Job{
		{UserID: 7, OrgID: &orgID, ProjectID: &projectID, RuntimeModelID: 4, JobType: "video_i2v", FeatureKey: "ref_video_gen", Status: domainjob.StatusFailed, RequestContext: `{"model_id":"video.fast"}`},
		{UserID: 7, OrgID: &orgID, ProjectID: &projectID, RuntimeModelID: 4, JobType: "image", FeatureKey: "ref_image_gen", Status: domainjob.StatusSucceeded, RequestContext: `{"model_id":"image.fast"}`},
		{UserID: 8, OrgID: &otherOrgID, ProjectID: &otherProjectID, RuntimeModelID: 5, JobType: "video_i2v", FeatureKey: "ref_video_gen", Status: domainjob.StatusFailed, RequestContext: `{"model_id":"video.slow"}`},
	}
	if err := db.Create(&jobs).Error; err != nil {
		t.Fatalf("seed jobs: %v", err)
	}
	service := NewService(db)

	items, total, err := service.ListJobDetails(context.Background(), JobFilters{
		JobID:      &jobs[0].ID,
		Status:     domainjob.StatusFailed,
		JobType:    "video_i2v",
		FeatureKey: "ref_video_gen",
		UserID:     uintPtr(7),
		OrgID:      &orgID,
		ProjectID:  &projectID,
		ModelID:    "video.fast",
	}, 20, 0)
	if err != nil {
		t.Fatalf("ListJobDetails returned error: %v", err)
	}
	if total != 1 || len(items) != 1 {
		t.Fatalf("expected one filtered job, total=%d len=%d items=%+v", total, len(items), items)
	}
	if items[0].UserID != 7 || items[0].JobType != "video_i2v" || items[0].Status != domainjob.StatusFailed {
		t.Fatalf("unexpected filtered job: %+v", items[0].Job)
	}
}

func TestListJobDetailsDoesNotFilterByLegacyModelConfig(t *testing.T) {
	db := testutil.OpenSQLite(t, "debug-jobs-no-legacy-model-config-filter.db",
		&persistencemodel.Job{},
		&persistencemodel.RawResource{},
		&persistencemodel.AICredential{},
	)
	cred := persistencemodel.AICredential{AdapterType: "openai_compat", DisplayName: "legacy provider", IsEnabled: true}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("seed credential: %v", err)
	}
	job := persistencemodel.Job{
		UserID:         7,
		RuntimeModelID: 99,
		JobType:        "video",
		Status:         domainjob.StatusSucceeded,
		Prompt:         "draw",
		RequestContext: `{"model_id":"public-video"}`,
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("seed job: %v", err)
	}

	service := NewService(db)
	items, total, err := service.ListJobDetails(context.Background(), JobFilters{ModelID: "legacy-video"}, 20, 0)
	if err != nil {
		t.Fatalf("ListJobDetails legacy config filter error: %v", err)
	}
	if total != 0 || len(items) != 0 {
		t.Fatalf("items = %+v total = %d, want no match from legacy ai_model_configs", items, total)
	}

	items, total, err = service.ListJobDetails(context.Background(), JobFilters{ModelID: "public-video"}, 20, 0)
	if err != nil {
		t.Fatalf("ListJobDetails request context filter error: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].ID != job.ID {
		t.Fatalf("items = %+v total = %d, want request context match", items, total)
	}
}

func TestListJobDetailsFiltersByCatalogEntryWithoutLegacyModelConfigFallback(t *testing.T) {
	db := testutil.OpenSQLite(t, "debug-jobs-catalog-filter.db",
		&persistencemodel.Job{},
		&persistencemodel.RawResource{},
		&persistencemodel.AIModelCatalogEntry{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: "video-fast",
		DisplayName:   "Video Fast",
		Capabilities:  "video",
		IsEnabled:     true,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("seed catalog entry: %v", err)
	}
	jobs := []persistencemodel.Job{
		{
			UserID:                7,
			RuntimeModelID:        999,
			AIModelCatalogEntryID: &entry.ID,
			JobType:               "video",
			Status:                domainjob.StatusFailed,
			Prompt:                "draw",
			RequestContext:        `{}`,
		},
		{
			UserID:         7,
			RuntimeModelID: entry.ID,
			JobType:        "video",
			Status:         domainjob.StatusFailed,
			Prompt:         "legacy fallback should not match",
			RequestContext: `{}`,
		},
	}
	if err := db.Create(&jobs).Error; err != nil {
		t.Fatalf("seed jobs: %v", err)
	}
	if db.Migrator().HasTable("ai_model_configs") {
		t.Fatal("test must run without legacy ai_model_configs table")
	}

	service := NewService(db)
	items, total, err := service.ListJobDetails(context.Background(), JobFilters{ModelID: "video-fast"}, 20, 0)
	if err != nil {
		t.Fatalf("ListJobDetails returned error: %v", err)
	}
	if total != 1 || len(items) != 1 {
		t.Fatalf("expected one catalog-filtered job, total=%d len=%d items=%+v", total, len(items), items)
	}
	if items[0].ID != jobs[0].ID {
		t.Fatalf("matched job id = %d, want catalog-linked job %d", items[0].ID, jobs[0].ID)
	}
}

func uintPtr(value uint) *uint {
	return &value
}

type fakeAuditLogReader struct {
	page    providercontract.AIGatewayCallLogPage
	summary providercontract.AIGatewayCallLogSummary
	filters []providercontract.AIGatewayCallLogFilter
}

func (f *fakeAuditLogReader) ListGatewayCallLogs(_ context.Context, filter providercontract.AIGatewayCallLogFilter) (providercontract.AIGatewayCallLogPage, error) {
	f.filters = append(f.filters, filter)
	return f.page, nil
}

func (f *fakeAuditLogReader) SummarizeGatewayCallLogs(_ context.Context, filter providercontract.AIGatewayCallLogFilter) (providercontract.AIGatewayCallLogSummary, error) {
	f.filters = append(f.filters, filter)
	return f.summary, nil
}

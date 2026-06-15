package debug

import (
	"context"
	"strings"
	"testing"
	"time"

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
				ID:              1,
				UserID:          7,
				AIModelConfigID: 9,
				CredentialID:    11,
				OperationType:   "text",
				Status:          "success",
				InputTokens:     3,
				OutputTokens:    2,
				CreatedAt:       now,
				AIModelConfig: &providercontract.AIGatewayCallLogModelConfigRef{
					ID:         9,
					ModelDefID: "gpt-5.2",
				},
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
			GeneratedAt:  now,
		},
	}
	service := NewServiceWithAuditLogReader(nil, reader, nil)
	filter := LLMCallLogFilter{CredentialID: "11", Status: "success", Page: 2, PageSize: 10}

	page, err := service.ListLLMCallLogs(context.Background(), filter)
	if err != nil {
		t.Fatalf("ListLLMCallLogs() error = %v", err)
	}
	if page.Total != 1 || page.Page != 2 || len(page.Items) != 1 || page.Items[0].AIModelConfig.ModelDefID != "gpt-5.2" {
		t.Fatalf("page = %#v, want reader data mapped to debug shape", page)
	}
	summary, err := service.LLMCallLogSummary(context.Background(), filter)
	if err != nil {
		t.Fatalf("LLMCallLogSummary() error = %v", err)
	}
	if summary.Total != 1 || summary.Success != 1 || !summary.GeneratedAt.Equal(now) {
		t.Fatalf("summary = %#v, want reader summary", summary)
	}
	if len(reader.filters) != 2 || reader.filters[0].CredentialID != "11" || reader.filters[0].Status != "success" || reader.filters[0].Page != 2 {
		t.Fatalf("reader filters = %#v, want mapped filters", reader.filters)
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
		{UserID: 7, OrgID: &orgID, ProjectID: &projectID, ModelConfigID: 4, JobType: "video_i2v", FeatureKey: "ref_video_gen", Status: domainjob.StatusFailed},
		{UserID: 7, OrgID: &orgID, ProjectID: &projectID, ModelConfigID: 4, JobType: "image", FeatureKey: "ref_image_gen", Status: domainjob.StatusSucceeded},
		{UserID: 8, OrgID: &otherOrgID, ProjectID: &otherProjectID, ModelConfigID: 5, JobType: "video_i2v", FeatureKey: "ref_video_gen", Status: domainjob.StatusFailed},
	}
	if err := db.Create(&jobs).Error; err != nil {
		t.Fatalf("seed jobs: %v", err)
	}
	service := NewService(db)

	items, total, err := service.ListJobDetails(context.Background(), JobFilters{
		JobID:         &jobs[0].ID,
		Status:        domainjob.StatusFailed,
		JobType:       "video_i2v",
		FeatureKey:    "ref_video_gen",
		UserID:        uintPtr(7),
		OrgID:         &orgID,
		ProjectID:     &projectID,
		ModelConfigID: uintPtr(4),
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

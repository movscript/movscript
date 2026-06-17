package usage

import (
	"context"
	"strconv"
	"testing"
	"time"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestServiceUsesGatewayUsageReporterContract(t *testing.T) {
	now := time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC)
	reporter := &fakeUsageReporter{
		page: providercontract.AIGatewayUsageLogPage{
			Items: []providercontract.AIGatewayUsageLog{{
				ID:                    1,
				UserID:                7,
				AIModelCatalogEntryID: uintPtr(19),
				OperationType:         "text",
				InputTokens:           3,
				OutputTokens:          2,
				Cost:                  0.5,
				CreatedAt:             now,
				AIModelCatalogEntry: &providercontract.AIGatewayUsageCatalogEntryRef{
					ID:            19,
					PublicModelID: "gpt-5.2",
					DisplayName:   "GPT 5.2",
				},
			}},
			Total:    1,
			Page:     2,
			PageSize: 10,
		},
		summary: providercontract.AIGatewayUsageSummary{
			Totals:      providercontract.AIGatewayUsageTotals{Records: 1, Cost: 0.5, InputTokens: 3, OutputTokens: 2},
			GeneratedAt: now,
		},
	}
	service := NewServiceWithReporter(reporter)
	filter := ListFilter{ProviderID: "11", OperationType: "text", Page: 2, PageSize: 10}

	page, err := service.List(context.Background(), filter)
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if page.Total != 1 || page.Page != 2 || len(page.Items) != 1 || page.Items[0].AIModelCatalogEntry.PublicModelID != "gpt-5.2" {
		t.Fatalf("page = %#v, want reporter data mapped to admin shape", page)
	}
	exported, err := service.Export(context.Background(), filter, 100)
	if err != nil {
		t.Fatalf("Export() error = %v", err)
	}
	if len(exported) != 1 || exported[0].ID != 1 {
		t.Fatalf("export = %#v, want reporter rows", exported)
	}
	summary, err := service.Summary(context.Background(), filter)
	if err != nil {
		t.Fatalf("Summary() error = %v", err)
	}
	if summary.Totals.Records != 1 || summary.Totals.Cost != 0.5 || !summary.GeneratedAt.Equal(now) {
		t.Fatalf("summary = %#v, want reporter summary", summary)
	}
	if len(reporter.filters) != 3 {
		t.Fatalf("reporter filter calls = %d, want 3", len(reporter.filters))
	}
	if reporter.filters[0].ProviderID != "11" || reporter.filters[0].OperationType != "text" || reporter.filters[0].Page != 2 {
		t.Fatalf("first reporter filter = %#v, want service filter mapped", reporter.filters[0])
	}
}

func TestSummaryAggregatesFilteredUsage(t *testing.T) {
	db := testutil.OpenSQLite(t, "adminusage.db", &persistencemodel.User{}, &persistencemodel.AICredential{}, &persistencemodel.AIModelCatalogEntry{}, &persistencemodel.AIModelRouteBinding{}, &persistencemodel.UsageLog{})
	now := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)
	userA := createUsageUser(t, db, "alice")
	userB := createUsageUser(t, db, "bob")
	credA := createUsageCredential(t, db, "openai")
	credB := createUsageCredential(t, db, "gemini")
	entryA := createUsageCatalogEntry(t, db, "gpt-4o", "provider-gpt-4o", "GPT 4o")
	entryB := createUsageCatalogEntry(t, db, "gemini", "provider-gemini", "Gemini")
	bindingA := createUsageRouteBinding(t, db, entryA.ID, credA.ID)
	bindingB := createUsageRouteBinding(t, db, entryB.ID, credB.ID)
	textLog := createUsageLog(t, db, userA.ID, entryA.ID, &entryA.ID, "text", 100, 200, 0, 0, 1.5, now.Add(-time.Hour))
	imageLog := createUsageLog(t, db, userA.ID, entryA.ID, &entryA.ID, "image", 0, 0, 0, 2, 4, now.Add(-2*time.Hour))
	videoLog := createUsageLog(t, db, userB.ID, entryB.ID, &entryB.ID, "video", 0, 0, 8, 0, 9, now.Add(-3*time.Hour))
	oldLog := createUsageLog(t, db, userA.ID, entryA.ID, &entryA.ID, "text", 10, 20, 0, 0, 0.5, now.AddDate(0, 0, -40))
	setUsageRouteBinding(t, db, textLog, bindingA.ID)
	setUsageRouteBinding(t, db, imageLog, bindingA.ID)
	setUsageRouteBinding(t, db, videoLog, bindingB.ID)
	setUsageRouteBinding(t, db, oldLog, bindingA.ID)
	gatewayKeyID := uint(21)
	otherGatewayKeyID := uint(22)
	setUsageGatewayKey(t, db, textLog, gatewayKeyID)
	setUsageGatewayKey(t, db, imageLog, otherGatewayKeyID)

	service := NewService(db)
	since := now.AddDate(0, 0, -7)
	summary, err := service.Summary(context.Background(), ListFilter{ProviderID: "1", Since: &since})
	if err != nil {
		t.Fatalf("Summary returned error: %v", err)
	}
	if summary.Totals.Records != 2 || summary.Totals.Cost != 5.5 || summary.Totals.InputTokens != 100 || summary.Totals.OutputTokens != 200 || summary.Totals.ImageCount != 2 {
		t.Fatalf("unexpected totals: %+v", summary.Totals)
	}
	if len(summary.Operations) != 2 || summary.Operations[0].OperationType != "image" || summary.Operations[0].Cost != 4 {
		t.Fatalf("unexpected operations: %+v", summary.Operations)
	}
	if len(summary.TopModels) != 1 || summary.TopModels[0].AIModelCatalogEntry == nil || summary.TopModels[0].AIModelCatalogEntry.PublicModelID != "gpt-4o" {
		t.Fatalf("unexpected top models: %+v", summary.TopModels)
	}
	if len(summary.TopUsers) != 1 || summary.TopUsers[0].User == nil || summary.TopUsers[0].User.Username != "alice" {
		t.Fatalf("unexpected top users: %+v", summary.TopUsers)
	}
	if summary.GeneratedAt.IsZero() {
		t.Fatalf("GeneratedAt was not set")
	}

	keySummary, err := service.Summary(context.Background(), ListFilter{ProviderID: "1", GatewayKeyID: "21", Since: &since})
	if err != nil {
		t.Fatalf("Summary with gateway key filter returned error: %v", err)
	}
	if keySummary.Totals.Records != 1 || keySummary.Totals.Cost != 1.5 || keySummary.Totals.InputTokens != 100 || keySummary.Totals.OutputTokens != 200 {
		t.Fatalf("unexpected gateway key totals: %+v", keySummary.Totals)
	}
	if len(keySummary.Operations) != 1 || keySummary.Operations[0].OperationType != "text" {
		t.Fatalf("unexpected gateway key operations: %+v", keySummary.Operations)
	}
	if len(keySummary.TopModels) != 1 || keySummary.TopModels[0].AIModelCatalogEntryID == nil || *keySummary.TopModels[0].AIModelCatalogEntryID != entryA.ID {
		t.Fatalf("unexpected gateway key top models: %+v", keySummary.TopModels)
	}
	if len(keySummary.TopUsers) != 1 || keySummary.TopUsers[0].UserID != userA.ID {
		t.Fatalf("unexpected gateway key top users: %+v", keySummary.TopUsers)
	}
}

func TestSummaryFiltersProviderByRouteBindingCredential(t *testing.T) {
	db := testutil.OpenSQLite(t, "adminusage-route-provider.db",
		&persistencemodel.User{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageLog{},
	)
	now := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)
	user := createUsageUser(t, db, "alice")
	legacyCred := createUsageCredential(t, db, "legacy")
	routeCred := createUsageCredential(t, db, "route")
	entry := createUsageCatalogEntry(t, db, "gpt-4o", "provider-gpt-4o", "GPT 4o")
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceLocalProvider,
		CredentialID:   &routeCred.ID,
		IsEnabled:      true,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	log := createUsageLog(t, db, user.ID, entry.ID, &entry.ID, "text", 100, 200, 0, 0, 1.5, now)
	if err := db.Model(&log).Update("route_binding_id", binding.ID).Error; err != nil {
		t.Fatalf("set usage route binding: %v", err)
	}

	service := NewService(db)
	summary, err := service.Summary(context.Background(), ListFilter{ProviderID: strconv.FormatUint(uint64(routeCred.ID), 10)})
	if err != nil {
		t.Fatalf("Summary(route provider) returned error: %v", err)
	}
	if summary.Totals.Records != 1 || summary.Totals.Cost != 1.5 {
		t.Fatalf("route provider summary = %+v, want one matching usage row", summary.Totals)
	}
	legacySummary, err := service.Summary(context.Background(), ListFilter{ProviderID: strconv.FormatUint(uint64(legacyCred.ID), 10)})
	if err != nil {
		t.Fatalf("Summary(legacy provider) returned error: %v", err)
	}
	if legacySummary.Totals.Records != 0 {
		t.Fatalf("legacy provider summary records = %d, want route binding credential to take precedence", legacySummary.Totals.Records)
	}
}

func TestSummaryDoesNotFilterProviderByLegacyModelConfig(t *testing.T) {
	db := testutil.OpenSQLite(t, "adminusage-no-legacy-provider-filter.db",
		&persistencemodel.User{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.UsageLog{},
	)
	now := time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)
	user := createUsageUser(t, db, "alice")
	credential := createUsageCredential(t, db, "legacy-provider")
	entry := createUsageCatalogEntry(t, db, "gpt-4o", "provider-gpt-4o", "GPT 4o")
	createUsageLog(t, db, user.ID, entry.ID, &entry.ID, "text", 100, 200, 0, 0, 1.5, now)

	service := NewService(db)
	summary, err := service.Summary(context.Background(), ListFilter{ProviderID: strconv.FormatUint(uint64(credential.ID), 10)})
	if err != nil {
		t.Fatalf("Summary(legacy provider) returned error: %v", err)
	}
	if summary.Totals.Records != 0 {
		t.Fatalf("legacy model config provider summary records = %d, want 0 without route binding", summary.Totals.Records)
	}
}

type fakeUsageReporter struct {
	page    providercontract.AIGatewayUsageLogPage
	summary providercontract.AIGatewayUsageSummary
	filters []providercontract.AIGatewayUsageLogFilter
}

func (f *fakeUsageReporter) ListGatewayUsageLogs(_ context.Context, filter providercontract.AIGatewayUsageLogFilter) (providercontract.AIGatewayUsageLogPage, error) {
	f.filters = append(f.filters, filter)
	return f.page, nil
}

func (f *fakeUsageReporter) ExportGatewayUsageLogs(_ context.Context, filter providercontract.AIGatewayUsageLogFilter, _ int) ([]providercontract.AIGatewayUsageLog, error) {
	f.filters = append(f.filters, filter)
	return f.page.Items, nil
}

func (f *fakeUsageReporter) SummarizeGatewayUsage(_ context.Context, filter providercontract.AIGatewayUsageLogFilter) (providercontract.AIGatewayUsageSummary, error) {
	f.filters = append(f.filters, filter)
	return f.summary, nil
}

func createUsageUser(t *testing.T, db *gorm.DB, username string) persistencemodel.User {
	t.Helper()
	user := persistencemodel.User{Username: username, PasswordHash: "hash", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user %q: %v", username, err)
	}
	return user
}

func createUsageCredential(t *testing.T, db *gorm.DB, name string) persistencemodel.AICredential {
	t.Helper()
	credential := persistencemodel.AICredential{AdapterType: "openai_compat", DisplayName: name, IsEnabled: true}
	if err := db.Create(&credential).Error; err != nil {
		t.Fatalf("create credential %q: %v", name, err)
	}
	return credential
}

func createUsageCatalogEntry(t *testing.T, db *gorm.DB, publicModelID string, providerModelID string, displayName string) persistencemodel.AIModelCatalogEntry {
	t.Helper()
	entry := persistencemodel.AIModelCatalogEntry{PublicModelID: publicModelID, ProviderModelID: providerModelID, DisplayName: displayName, IsEnabled: true}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry %q: %v", publicModelID, err)
	}
	return entry
}

func createUsageRouteBinding(t *testing.T, db *gorm.DB, catalogEntryID uint, credentialID uint) persistencemodel.AIModelRouteBinding {
	t.Helper()
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID: catalogEntryID,
		SourceType:     persistencemodel.ModelRouteSourceLocalProvider,
		CredentialID:   &credentialID,
		IsEnabled:      true,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	return binding
}

func createUsageLog(t *testing.T, db *gorm.DB, userID uint, modelConfigID uint, catalogEntryID *uint, operation string, inputTokens int, outputTokens int, durationSec int, imageCount int, cost float64, createdAt time.Time) persistencemodel.UsageLog {
	t.Helper()
	log := persistencemodel.UsageLog{
		UserID:                userID,
		RuntimeModelID:        modelConfigID,
		AIModelCatalogEntryID: catalogEntryID,
		OperationType:         operation,
		InputTokens:           inputTokens,
		OutputTokens:          outputTokens,
		DurationSec:           durationSec,
		ImageCount:            imageCount,
		Cost:                  cost,
	}
	if err := db.Create(&log).Error; err != nil {
		t.Fatalf("create usage log: %v", err)
	}
	if err := db.Model(&log).Updates(map[string]any{"created_at": createdAt, "updated_at": createdAt}).Error; err != nil {
		t.Fatalf("set usage timestamp: %v", err)
	}
	return log
}

func uintPtr(value uint) *uint {
	return &value
}

func setUsageRouteBinding(t *testing.T, db *gorm.DB, log persistencemodel.UsageLog, routeBindingID uint) {
	t.Helper()
	if err := db.Model(&log).Update("route_binding_id", routeBindingID).Error; err != nil {
		t.Fatalf("set usage route binding: %v", err)
	}
}

func setUsageGatewayKey(t *testing.T, db *gorm.DB, log persistencemodel.UsageLog, gatewayKeyID uint) {
	t.Helper()
	if err := db.Model(&log).Update("gateway_api_key_id", gatewayKeyID).Error; err != nil {
		t.Fatalf("set usage gateway key: %v", err)
	}
}

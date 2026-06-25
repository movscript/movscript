package ai

import (
	"context"
	"fmt"
	"testing"
	"time"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestAIServiceUsageGovernorContractSettlesReservation(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-usage-governor-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	seedEnterpriseUsageWallet(t, db, 7)
	createTextProviderVariant(t, db, 1, "Usage provider")
	usageEntry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: "usage-writer",
		DisplayName:   "Usage Writer",
		IsEnabled:     true,
		Capabilities:  CapabilityText,
	}
	if err := db.Create(&usageEntry).Error; err != nil {
		t.Fatalf("create usage catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: usageEntry.ID,
		SourceType:     persistencemodel.ModelRouteSourceNewAPI,
		RouteGroup:     "default",
		IsEnabled:      true,
		CapacityWeight: 1,
	}).Error; err != nil {
		t.Fatalf("create usage route binding: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	estimate, err := service.EstimateTextGatewayUsage(context.Background(), providercontract.AIGatewayRouteRequest{
		ModelID:    "usage-writer",
		Capability: CapabilityText,
	}, providercontract.TextRequest{
		Messages:  []providercontract.Message{{Role: "user", Content: "hello"}},
		MaxTokens: 8,
	})
	if err != nil {
		t.Fatalf("EstimateTextGatewayUsage() error = %v", err)
	}
	if estimate.OperationType != "text" || estimate.InputTokens <= 0 || estimate.OutputTokens != 8 {
		t.Fatalf("estimate = %#v, want text usage with request tokens", estimate)
	}

	orgID := uint(11)
	projectID := uint(22)
	gatewayKeyID := uint(33)
	reservation, err := service.ReserveGatewayUsage(context.Background(), providercontract.AIUsageReserveRequest{
		UserID:         7,
		CatalogEntryID: usageEntry.ID,
		Estimate: providercontract.AIUsageEstimate{
			OperationType: "text",
			InputTokens:   10,
			OutputTokens:  5,
			Cost:          1.25,
		},
		Context: providercontract.AIUsageContext{
			OrgID:           &orgID,
			ProjectID:       &projectID,
			GatewayAPIKeyID: &gatewayKeyID,
		},
	})
	if err != nil {
		t.Fatalf("ReserveGatewayUsage() error = %v", err)
	}
	if reservation.ID == 0 || reservation.Status != ReservationStatusReserved || reservation.EstimatedCost != 1.25 {
		t.Fatalf("reservation = %#v, want reserved estimate", reservation)
	}

	jobID := uint(44)
	if err := service.SetGatewayReservationJob(context.Background(), providercontract.AIUsageJobBindingRequest{
		ReservationID: reservation.ID,
		JobID:         jobID,
	}); err != nil {
		t.Fatalf("SetGatewayReservationJob() error = %v", err)
	}

	if err := service.SettleGatewayUsage(context.Background(), providercontract.AIUsageSettleRequest{
		UserID:         7,
		CatalogEntryID: usageEntry.ID,
		Estimate: providercontract.AIUsageEstimate{
			OperationType: "text",
			InputTokens:   12,
			OutputTokens:  6,
			Cost:          1.5,
		},
		Context: providercontract.AIUsageContext{
			OrgID:           &orgID,
			ProjectID:       &projectID,
			GatewayAPIKeyID: &gatewayKeyID,
			ReservationID:   &reservation.ID,
		},
	}); err != nil {
		t.Fatalf("SettleGatewayUsage() error = %v", err)
	}

	var stored persistencemodel.UsageReservation
	if err := db.First(&stored, reservation.ID).Error; err != nil {
		t.Fatalf("load reservation: %v", err)
	}
	if stored.Status != ReservationStatusSettled || stored.ActualCost != 1.5 || stored.UsageLogID == nil {
		t.Fatalf("stored reservation = %#v, want settled with usage log", stored)
	}
	if stored.JobID == nil || *stored.JobID != jobID {
		t.Fatalf("stored job id = %v, want %d", stored.JobID, jobID)
	}

	var usage persistencemodel.UsageLog
	if err := db.First(&usage, *stored.UsageLogID).Error; err != nil {
		t.Fatalf("load usage log: %v", err)
	}
	if usage.UserID != 7 || usage.ProjectID == nil || *usage.ProjectID != projectID || usage.InputTokens != 12 || usage.OutputTokens != 6 {
		t.Fatalf("usage = %#v, want settled request context and token counts", usage)
	}
}

func TestAIServiceUsageGovernorEstimateUsesCatalogRouteWithoutLegacyModelConfigTable(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-usage-governor-catalog-route-estimate.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	if db.Migrator().HasTable("ai_model_configs") || db.Migrator().HasTable(&persistencemodel.AICredential{}) {
		t.Fatal("catalog route usage estimate test should not create legacy provider tables")
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: "writer",
		DisplayName:   "Writer",
		IsEnabled:     true,
		Capabilities:  CapabilityText,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceNewAPI,
		RouteGroup:     "default",
		IsEnabled:      true,
		CapacityWeight: 1,
	}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	estimate, err := service.EstimateTextGatewayUsage(context.Background(), providercontract.AIGatewayRouteRequest{
		ModelID:    "writer",
		Capability: CapabilityText,
	}, providercontract.TextRequest{
		Messages:  []providercontract.Message{{Role: "user", Content: "hello"}},
		MaxTokens: 100,
	})
	if err != nil {
		t.Fatalf("EstimateTextGatewayUsage(catalog route) error = %v", err)
	}
	if estimate.OperationType != "text" || estimate.InputTokens <= 0 || estimate.OutputTokens != 100 {
		t.Fatalf("estimate = %#v, want text estimate from catalog route", estimate)
	}
	if estimate.Cost != 0 {
		t.Fatalf("estimate cost = %v, want zero cost usage estimate", estimate.Cost)
	}
}

func TestAIServiceUsageGovernorContractReleasesReservation(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-usage-release-contract.db",
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	seedEnterpriseUsageWallet(t, db, 7)
	service := NewAIService(db, NewRegistry(db, nil))

	reservation, err := service.ReserveGatewayUsage(context.Background(), providercontract.AIUsageReserveRequest{
		UserID:         7,
		CatalogEntryID: 1,
		Estimate: providercontract.AIUsageEstimate{
			OperationType: "image",
			ImageCount:    1,
			Cost:          0.75,
		},
	})
	if err != nil {
		t.Fatalf("ReserveGatewayUsage() error = %v", err)
	}

	if err := service.ReleaseGatewayUsageReservation(context.Background(), providercontract.AIUsageReleaseRequest{
		ReservationID: reservation.ID,
		Reason:        "cancelled",
	}); err != nil {
		t.Fatalf("ReleaseGatewayUsageReservation() error = %v", err)
	}

	var stored persistencemodel.UsageReservation
	if err := db.First(&stored, reservation.ID).Error; err != nil {
		t.Fatalf("load reservation: %v", err)
	}
	if stored.Status != ReservationStatusReleased || stored.ReleaseReason != "cancelled" {
		t.Fatalf("stored reservation = %#v, want released cancellation", stored)
	}
}

func seedEnterpriseUsageWallet(t *testing.T, db *gorm.DB, userID uint) {
	t.Helper()
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS user_quota (
		id integer PRIMARY KEY AUTOINCREMENT,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		user_id integer NOT NULL,
		balance real DEFAULT 0
	)`).Error; err != nil {
		t.Fatalf("create user_quota table: %v", err)
	}
	if err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_quota_user_id ON user_quota(user_id)`).Error; err != nil {
		t.Fatalf("create user_quota user index: %v", err)
	}
	if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_user_quota_deleted_at ON user_quota(deleted_at)`).Error; err != nil {
		t.Fatalf("create user_quota deleted index: %v", err)
	}
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
		id integer PRIMARY KEY AUTOINCREMENT,
		created_at datetime,
		updated_at datetime,
		deleted_at datetime,
		entry_id text NOT NULL,
		user_id integer NOT NULL,
		org_id integer,
		scope text DEFAULT 'personal',
		delta real NOT NULL,
		balance real NOT NULL,
		reason text NOT NULL,
		ref_type text,
		ref_id text
	)`).Error; err != nil {
		t.Fatalf("create wallet_ledger_entries table: %v", err)
	}
	if err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_entries_entry_id ON wallet_ledger_entries(entry_id)`).Error; err != nil {
		t.Fatalf("create wallet ledger entry index: %v", err)
	}
	if err := db.Exec(`INSERT INTO user_quota (created_at, updated_at, user_id, balance) VALUES (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, 1000)`, userID).Error; err != nil {
		t.Fatalf("seed user_quota: %v", err)
	}
}

func TestAIServiceGovernancePolicyContractEvaluatesBudgetedRoute(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-governance-policy-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	createCatalogRouteVariantWithCost(t, db, 40, "Expensive provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-expensive", 20, 10, 0, CapabilityText)
	createCatalogRouteVariantWithCost(t, db, 41, "Budget provider", AdapterOpenAICompat, "gpt-5.2", "gpt-5.2-budget", 1, 1, 0, CapabilityText)
	service := NewAIService(db, NewRegistry(db, nil))

	decision, err := service.EvaluateGatewayGovernance(context.Background(), providercontract.AIGatewayGovernanceRequest{
		UserID: 7,
		Route: providercontract.AIGatewayRouteRequest{
			ModelID:    "gpt-5.2",
			Capability: CapabilityText,
			EstimatedUsage: providercontract.AIUsageEstimate{
				OperationType: CapabilityText,
				InputTokens:   1_000_000,
			},
		},
	})
	if err != nil {
		t.Fatalf("EvaluateGatewayGovernance() error = %v", err)
	}
	if !decision.Allowed || decision.Route.ProviderModelID != "gpt-5.2-expensive" || decision.Route.SelectionReason != "catalog_model_id" {
		t.Fatalf("decision = %#v, want allowed highest-priority provider route", decision)
	}
}

func TestAIServiceCallAuditorContractRecordsGatewayCall(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-call-auditor-contract.db",
		&persistencemodel.AdminSetting{},
		&persistencemodel.LLMCallLog{},
	)
	service := NewAIService(db, NewRegistry(db, nil))
	orgID := uint(11)
	projectID := uint(22)
	catalogEntryID := uint(33)
	routeBindingID := uint(44)

	err := service.RecordGatewayCall(context.Background(), providercontract.AIGatewayCallAuditInput{
		UserID: 7,
		Context: providercontract.AIUsageContext{
			OrgID:                 &orgID,
			ProjectID:             &projectID,
			AIModelCatalogEntryID: &catalogEntryID,
			RouteBindingID:        &routeBindingID,
		},
		CredentialID:   2,
		Provider:       "local",
		OperationType:  "text",
		PromptName:     "draft",
		RequestModel:   "gpt-5.2",
		RequestPayload: map[string]any{"messages": []string{"hello"}},
		Response: &providercontract.TextResponse{
			Content: "ok",
			Usage: providercontract.TokenUsage{
				InputTokens:       3,
				OutputTokens:      2,
				CachedInputTokens: 1,
				ReasoningTokens:   4,
			},
			Debug: &providercontract.DebugCallResult{ModelID: "provider-gpt-5.2"},
		},
		StartedAt:     time.Now().Add(-20 * time.Millisecond),
		RetentionDays: 3,
	})
	if err != nil {
		t.Fatalf("RecordGatewayCall() error = %v", err)
	}

	var log persistencemodel.LLMCallLog
	if err := db.First(&log).Error; err != nil {
		t.Fatalf("load call log: %v", err)
	}
	if log.UserID != 7 || log.Provider != "local" || log.Status != "success" || log.ResponseModel != "provider-gpt-5.2" {
		t.Fatalf("call log = %#v, want provider success with response model", log)
	}
	if log.InputTokens != 3 || log.OutputTokens != 2 || log.CachedInputTokens != 1 || log.ReasoningTokens != 4 {
		t.Fatalf("token usage = input:%d output:%d cached:%d reasoning:%d, want 3/2/1/4", log.InputTokens, log.OutputTokens, log.CachedInputTokens, log.ReasoningTokens)
	}
	if log.RetentionDays != 3 || log.ExpiresAt == nil {
		t.Fatalf("retention = %d expires_at:%v, want explicit retention", log.RetentionDays, log.ExpiresAt)
	}
	if log.AIModelCatalogEntryID == nil || *log.AIModelCatalogEntryID != catalogEntryID {
		t.Fatalf("catalog entry id = %v, want %d", log.AIModelCatalogEntryID, catalogEntryID)
	}
	if log.RouteBindingID == nil || *log.RouteBindingID != routeBindingID {
		t.Fatalf("route binding id = %v, want %d", log.RouteBindingID, routeBindingID)
	}
}

func TestAIServiceCallAuditorRecordsCatalogRouteRuntimeModelID(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-call-auditor-catalog-route.db",
		&persistencemodel.AdminSetting{},
		&persistencemodel.LLMCallLog{},
	)
	service := NewAIService(db, NewRegistry(db, nil))
	catalogEntryID := uint(33)
	routeBindingID := uint(44)

	err := service.RecordGatewayCall(context.Background(), providercontract.AIGatewayCallAuditInput{
		UserID: 7,
		Context: providercontract.AIUsageContext{
			AIModelCatalogEntryID: &catalogEntryID,
			RouteBindingID:        &routeBindingID,
		},
		CredentialID:   2,
		Provider:       "new_api",
		OperationType:  "text",
		RequestModel:   "gpt-5.2",
		ResponseModel:  "gpt-5.2",
		RequestPayload: map[string]any{"messages": []string{"hello"}},
		Response:       &providercontract.TextResponse{Content: "ok"},
	})
	if err != nil {
		t.Fatalf("RecordGatewayCall() error = %v", err)
	}

	var log persistencemodel.LLMCallLog
	if err := db.First(&log).Error; err != nil {
		t.Fatalf("load call log: %v", err)
	}
	if log.AIModelCatalogEntryID == nil || *log.AIModelCatalogEntryID != catalogEntryID {
		t.Fatalf("catalog entry id = %v, want %d", log.AIModelCatalogEntryID, catalogEntryID)
	}
	if log.RouteBindingID == nil || *log.RouteBindingID != routeBindingID {
		t.Fatalf("route binding id = %v, want %d", log.RouteBindingID, routeBindingID)
	}
	if log.RuntimeModelID != catalogEntryID {
		t.Fatalf("compatibility runtime model id = %d, want catalog entry id %d", log.RuntimeModelID, catalogEntryID)
	}
}

func TestAIServiceHealthProbeContractPingsProviderAndListsRuntimeHealth(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-health-probe-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	cred := persistencemodel.AICredential{
		Model:       gorm.Model{ID: 1},
		AdapterType: AdapterLocal,
		DisplayName: "Local provider",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		Model:         gorm.Model{ID: 2},
		PublicModelID: "writer",
		DisplayName:   "Writer",
		IsEnabled:     true,
		Capabilities:  CapabilityText,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceLocalProvider,
		CredentialID:   &cred.ID,
		IsEnabled:      true,
		Priority:       10,
		CapacityWeight: 1,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	probe, err := service.ProbeGatewayProvider(context.Background(), providercontract.AIGatewayProviderProbeRequest{
		ProviderID: fmt.Sprintf("local_provider:%d", cred.ID),
	})
	if err != nil {
		t.Fatalf("ProbeGatewayProvider() error = %v", err)
	}
	if !probe.Success || probe.Health.Status != providercontract.HealthStatusOK || probe.Health.Adapter != AdapterLocal {
		t.Fatalf("probe = %#v, want successful local provider ping", probe)
	}

	health, err := service.ListGatewayRuntimeHealth(context.Background())
	if err != nil {
		t.Fatalf("ListGatewayRuntimeHealth() error = %v", err)
	}
	if len(health) != 1 || health[0].ProviderName != "Local provider" || health[0].CatalogEntryID != entry.ID || health[0].RouteBindingID != binding.ID {
		t.Fatalf("runtime health = %#v, want catalog route health", health)
	}
}

func TestAIServiceHealthProbeUsesCatalogRouteWithoutLegacyModelConfigTable(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-health-probe-catalog-route.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	if db.Migrator().HasTable("ai_model_configs") {
		t.Fatal("catalog route probe test should not create legacy ai_model_configs")
	}
	cred := persistencemodel.AICredential{
		AdapterType: AdapterLocal,
		DisplayName: "Local catalog provider",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: "writer",
		DisplayName:   "Writer",
		IsEnabled:     true,
		Capabilities:  CapabilityText,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     persistencemodel.ModelRouteSourceLocalProvider,
		CredentialID:   &cred.ID,
		IsEnabled:      true,
		Priority:       10,
		CapacityWeight: 1,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	probe, err := service.ProbeGatewayProvider(context.Background(), providercontract.AIGatewayProviderProbeRequest{
		Route: providercontract.AIGatewayRouteRequest{
			ModelID:    "writer",
			Capability: CapabilityText,
		},
	})
	if err != nil {
		t.Fatalf("ProbeGatewayProvider(catalog route) error = %v", err)
	}
	if !probe.Success || probe.Health.Status != providercontract.HealthStatusOK || probe.Health.Adapter != AdapterLocal {
		t.Fatalf("probe = %#v, want successful catalog route local provider ping", probe)
	}
	if len(probe.Health.Capabilities) != 1 || probe.Health.Capabilities[0] != CapabilityText {
		t.Fatalf("probe capabilities = %#v, want catalog route text capability", probe.Health.Capabilities)
	}
}

func TestAIServiceHealthProbeDoesNotUseLegacyModelConfigRoute(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-health-probe-no-legacy-route.db",
		&persistencemodel.AICredential{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: AdapterLocal,
		DisplayName: "Legacy local provider",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	probe, err := service.ProbeGatewayProvider(context.Background(), providercontract.AIGatewayProviderProbeRequest{
		Route: providercontract.AIGatewayRouteRequest{Capability: CapabilityText},
	})
	if err != nil {
		t.Fatalf("ProbeGatewayProvider(legacy route) returned hard error = %v", err)
	}
	if probe.Success {
		t.Fatalf("probe = %#v, want legacy model config route rejected", probe)
	}
}

func TestAIServiceRuntimeHealthUsesCatalogRoutesWithoutLegacyModelConfigTable(t *testing.T) {
	resetFailoverTestState()
	db := testutil.OpenSQLite(t, "ai-health-catalog-routes.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	if db.Migrator().HasTable("ai_model_configs") {
		t.Fatal("catalog route health test should not create legacy ai_model_configs")
	}
	cred := persistencemodel.AICredential{
		AdapterType: AdapterOpenAICompat,
		DisplayName: "Local catalog provider",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	localEntry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: "writer",
		DisplayName:   "Writer",
		IsEnabled:     true,
		Capabilities:  CapabilityText,
	}
	newAPIEntry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: "priority-writer",
		DisplayName:   "Priority Writer",
		IsEnabled:     true,
		Capabilities:  CapabilityText,
	}
	if err := db.Create(&localEntry).Error; err != nil {
		t.Fatalf("create local entry: %v", err)
	}
	if err := db.Create(&newAPIEntry).Error; err != nil {
		t.Fatalf("create new-api entry: %v", err)
	}
	localBinding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  localEntry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderModelID: "provider-writer-v2",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		Priority:        5,
		CapacityWeight:  2,
		MaxConcurrency:  3,
	}
	newAPIBinding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  newAPIEntry.ID,
		SourceType:      persistencemodel.ModelRouteSourceNewAPI,
		RouteGroup:      "priority",
		ProviderModelID: "newapi-writer-v2",
		IsEnabled:       true,
		Priority:        10,
		CapacityWeight:  4,
		MaxConcurrency:  0,
	}
	if err := db.Create(&localBinding).Error; err != nil {
		t.Fatalf("create local binding: %v", err)
	}
	if err := db.Create(&newAPIBinding).Error; err != nil {
		t.Fatalf("create new-api binding: %v", err)
	}
	finishAttempt := beginRuntimeProviderAttempt(newAPIEntry.ID)
	finishAttempt(nil)
	service := NewAIService(db, NewRegistry(db, nil))

	health, err := service.ListGatewayRuntimeHealth(context.Background())
	if err != nil {
		t.Fatalf("ListGatewayRuntimeHealth() error = %v", err)
	}
	if len(health) != 2 {
		t.Fatalf("runtime health = %#v, want two catalog route bindings", health)
	}
	if health[0].CatalogEntryID != newAPIEntry.ID || health[0].RouteBindingID != newAPIBinding.ID || health[0].ModelID != "priority-writer" || health[0].ModelDefID != "newapi-writer-v2" {
		t.Fatalf("new-api health = %#v, want catalog route row first by priority", health[0])
	}
	if health[0].AdapterType != persistencemodel.ModelRouteSourceNewAPI || health[0].ProviderName != "priority" || health[0].CapacityWeight != 4 || health[0].Successes != 1 {
		t.Fatalf("new-api health metadata = %#v, want route group/source/capacity/state", health[0])
	}
	if health[1].CatalogEntryID != localEntry.ID || health[1].RouteBindingID != localBinding.ID || health[1].AdapterType != AdapterOpenAICompat || health[1].ProviderName != "Local catalog provider" {
		t.Fatalf("local provider health = %#v, want credential-backed catalog route", health[1])
	}
	if health[1].CapacityWeight != 2 || health[1].MaxConcurrency != 3 || !health[1].IsEnabled {
		t.Fatalf("local provider capacity = %#v, want binding capacity and enabled state", health[1])
	}
}

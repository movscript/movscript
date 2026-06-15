package ai

import (
	"context"
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
		&persistencemodel.AIModelConfig{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	seedEnterpriseUsageWallet(t, db, 7)
	createTextProviderVariant(t, db, 1, "Usage provider")
	service := NewAIService(db, NewRegistry(db, nil))

	estimate, err := service.EstimateTextGatewayUsage(context.Background(), 1, providercontract.TextRequest{
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
		UserID:        7,
		ModelConfigID: 1,
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
		UserID:        7,
		ModelConfigID: 1,
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

func TestAIServiceUsageGovernorContractReleasesReservation(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-usage-release-contract.db",
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	seedEnterpriseUsageWallet(t, db, 7)
	service := NewAIService(db, NewRegistry(db, nil))

	reservation, err := service.ReserveGatewayUsage(context.Background(), providercontract.AIUsageReserveRequest{
		UserID:        7,
		ModelConfigID: 1,
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
		&persistencemodel.AIModelConfig{},
	)
	createProviderVariantWithAdapterAndCost(t, db, 40, "Expensive provider", AdapterOpenAICompat, "gpt-5.2", 20, 10, 0, CapabilityText)
	createProviderVariantWithAdapterAndCost(t, db, 41, "Budget provider", AdapterOpenAICompat, "gpt-5.2", 1, 1, 0, CapabilityText)
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
			MaxEstimatedCost: 2,
		},
	})
	if err != nil {
		t.Fatalf("EvaluateGatewayGovernance() error = %v", err)
	}
	if !decision.Allowed || decision.Route.ModelConfigID != 41 || decision.EstimatedCost != 1 {
		t.Fatalf("decision = %#v, want allowed budget provider route", decision)
	}

	decision, err = service.EvaluateGatewayGovernance(context.Background(), providercontract.AIGatewayGovernanceRequest{
		UserID: 7,
		Route: providercontract.AIGatewayRouteRequest{
			ModelID:    "gpt-5.2",
			Capability: CapabilityText,
			EstimatedUsage: providercontract.AIUsageEstimate{
				OperationType: CapabilityText,
				InputTokens:   1_000_000,
			},
			MaxEstimatedCost: 0.5,
		},
	})
	if err != nil {
		t.Fatalf("EvaluateGatewayGovernance() denied error = %v", err)
	}
	if decision.Allowed || decision.Reason == "" {
		t.Fatalf("decision = %#v, want denied budget decision", decision)
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

	err := service.RecordGatewayCall(context.Background(), providercontract.AIGatewayCallAuditInput{
		UserID:         7,
		Context:        providercontract.AIUsageContext{OrgID: &orgID, ProjectID: &projectID},
		ModelConfigID:  1,
		CredentialID:   2,
		Provider:       "new-api",
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
	if log.UserID != 7 || log.Provider != "new-api" || log.Status != "success" || log.ResponseModel != "provider-gpt-5.2" {
		t.Fatalf("call log = %#v, want provider success with response model", log)
	}
	if log.InputTokens != 3 || log.OutputTokens != 2 || log.CachedInputTokens != 1 || log.ReasoningTokens != 4 {
		t.Fatalf("token usage = input:%d output:%d cached:%d reasoning:%d, want 3/2/1/4", log.InputTokens, log.OutputTokens, log.CachedInputTokens, log.ReasoningTokens)
	}
	if log.RetentionDays != 3 || log.ExpiresAt == nil {
		t.Fatalf("retention = %d expires_at:%v, want explicit retention", log.RetentionDays, log.ExpiresAt)
	}
}

func TestAIServiceHealthProbeContractPingsProviderAndListsRuntimeHealth(t *testing.T) {
	db := testutil.OpenSQLite(t, "ai-health-probe-contract.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
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
	cfg := persistencemodel.AIModelConfig{
		Model:              gorm.Model{ID: 2},
		CredentialID:       cred.ID,
		ModelDefID:         "gpt-5.2",
		CustomCapabilities: CapabilityText,
		IsEnabled:          true,
		Priority:           10,
	}
	if err := db.Create(&cfg).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}
	service := NewAIService(db, NewRegistry(db, nil))

	probe, err := service.ProbeGatewayProvider(context.Background(), providercontract.AIGatewayProviderProbeRequest{
		CredentialID: cred.ID,
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
	if len(health) != 1 || health[0].ModelConfigID != cfg.ID || health[0].ProviderName != "Local provider" {
		t.Fatalf("runtime health = %#v, want local provider model config", health)
	}
}

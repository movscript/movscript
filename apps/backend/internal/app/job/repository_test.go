package job

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestGormRepositoryRetryPersistsDomainTransitionZeroValues(t *testing.T) {
	db := openJobRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	outputID := uint(9)
	past := time.Unix(10, 0).UTC()
	row := model.Job{
		UserID:              1,
		RuntimeModelID:      2,
		JobType:             domainjob.CapabilityImage,
		Title:               "参考生图-1234",
		Status:              domainjob.StatusFailed,
		AttemptCount:        2,
		MaxAttempts:         0,
		NextRunAt:           nil,
		Prompt:              "draw",
		OutputResourceID:    &outputID,
		ProviderTaskID:      "task",
		ProviderTaskKind:    "image",
		ProviderTaskStatus:  "failed",
		ProviderTaskHistory: "history",
		ErrorMsg:            "failed",
		LockedBy:            "worker",
		LeaseUntil:          &past,
		LastHeartbeatAt:     &past,
		FinishedAt:          &past,
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}
	job := domainjob.JobFromModel(row)

	updated, err := repo.Retry(context.Background(), &job, "manual retry requested")
	if err != nil {
		t.Fatalf("Retry() error = %v", err)
	}

	var stored model.Job
	if err := db.First(&stored, row.ID).Error; err != nil {
		t.Fatalf("load stored job: %v", err)
	}
	if stored.Status != domainjob.StatusPending || stored.AttemptCount != 0 || stored.MaxAttempts != domainjob.DefaultMaxAttempts {
		t.Fatalf("unexpected stored retry counters: %+v", stored)
	}
	if stored.Title != row.Title {
		t.Fatalf("title = %q, want %q", stored.Title, row.Title)
	}
	if stored.ErrorMsg != "" || stored.OutputResourceID != nil || stored.ProviderTaskID != "" || stored.ProviderTaskHistory != "" {
		t.Fatalf("provider fields were not cleared: %+v", stored)
	}
	if stored.NextRunAt == nil || stored.FinishedAt != nil || stored.LeaseUntil != nil || stored.LockedBy != "" {
		t.Fatalf("retry timing/lease fields were not reset: %+v", stored)
	}
	if updated.ExecutionState != string(domainjob.StateRetryScheduled) || stored.ExecutionState != string(domainjob.StateRetryScheduled) {
		t.Fatalf("execution state = updated %q stored %q", updated.ExecutionState, stored.ExecutionState)
	}
	var trace []domainjob.StateTraceEntry
	if err := json.Unmarshal([]byte(stored.StateTrace), &trace); err != nil {
		t.Fatal(err)
	}
	if len(trace) != 1 || trace[0].State != domainjob.StateRetryScheduled || trace[0].Message != "manual retry requested" {
		t.Fatalf("unexpected state trace: %+v", trace)
	}
}

func TestGormRepositoryDeleteCancelsPendingAndDeletesFinished(t *testing.T) {
	db := openJobRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	reservationID := uint(44)
	pending := model.Job{
		UserID:             1,
		RuntimeModelID:     2,
		JobType:            domainjob.CapabilityImage,
		Title:              "参考生图-5678",
		Status:             domainjob.StatusPending,
		Prompt:             "draw",
		UsageReservationID: &reservationID,
	}
	finished := model.Job{
		UserID:         1,
		RuntimeModelID: 2,
		JobType:        domainjob.CapabilityImage,
		Title:          "参考生图-9012",
		Status:         domainjob.StatusSucceeded,
		Prompt:         "draw",
	}
	if err := db.Create(&pending).Error; err != nil {
		t.Fatalf("create pending job: %v", err)
	}
	if err := db.Create(&finished).Error; err != nil {
		t.Fatalf("create finished job: %v", err)
	}

	_, releaseReservation, err := repo.Delete(context.Background(), pending.ID, 1, nil)
	if err != nil {
		t.Fatalf("Delete(pending) error = %v", err)
	}
	if !releaseReservation {
		t.Fatal("Delete(pending) releaseReservation = false, want true")
	}
	var storedPending model.Job
	if err := db.First(&storedPending, pending.ID).Error; err != nil {
		t.Fatalf("load pending job: %v", err)
	}
	if storedPending.Status != domainjob.StatusCancelled || storedPending.ErrorMsg != "cancelled by user" || storedPending.FinishedAt == nil {
		t.Fatalf("pending job was not cancelled: %+v", storedPending)
	}

	_, releaseReservation, err = repo.Delete(context.Background(), finished.ID, 1, nil)
	if err != nil {
		t.Fatalf("Delete(finished) error = %v", err)
	}
	if releaseReservation {
		t.Fatal("Delete(finished) releaseReservation = true, want false")
	}
	var count int64
	if err := db.Unscoped().Model(&model.Job{}).Where("id = ? AND deleted_at IS NOT NULL", finished.ID).Count(&count).Error; err != nil {
		t.Fatalf("count deleted finished job: %v", err)
	}
	if count != 1 {
		t.Fatalf("soft-deleted finished jobs = %d, want 1", count)
	}
}

func TestServiceEnqueueGenerationPreservesConflictSuggestedFix(t *testing.T) {
	db := openJobRepositoryTestDB(t)
	cred := model.AICredential{
		AdapterType: ai.AdapterVolcen,
		DisplayName: "Volcen",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := model.AIModelCatalogEntry{
		PublicModelID: "seedance-conflict-test",
		DisplayName:   "Seedance Conflict Test",
		IsEnabled:     true,
		Capabilities:  ai.CapabilityVideo,
		PricingMode:   string(ai.PricingPerSecond),
		SupportedParams: `[
			{"key":"duration","type":"number","conflicts_with":["frames"]},
			{"key":"frames","type":"number"}
		]`,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&model.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      model.ModelRouteSourceLocalProvider,
		ProviderModelID: "seedance-conflict-provider",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		CapacityWeight:  1,
	}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}

	svc := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))
	_, err := svc.EnqueueGeneration(context.Background(), EnqueueInput{
		UserID:      1,
		ModelID:     entry.PublicModelID,
		JobType:     ai.CapabilityVideo,
		Prompt:      "make a shot",
		ExtraParams: `{"frames":29}`,
		Duration:    5,
	})
	if err == nil {
		t.Fatal("expected generation param conflict error")
	}
	var validationErr *ai.ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ai.ValidationError, got %T: %v", err, err)
	}
	if validationErr.Code != "INVALID_PARAMETER_COMBINATION" || validationErr.Field != "duration" {
		t.Fatalf("unexpected validation error: %#v", validationErr)
	}
	value, ok := validationErr.SuggestedFix["frames"]
	if !ok || value != nil {
		t.Fatalf("expected frames suggested fix to be nil for removal, got %#v", validationErr.SuggestedFix)
	}
}

func TestServiceEnqueueGenerationUsesCatalogRouteWithoutLegacyModelConfig(t *testing.T) {
	db := openJobRepositoryTestDB(t)
	defaultEntry := model.AIModelCatalogEntry{
		PublicModelID:   "image-fast",
		DisplayName:     "Image Fast Default",
		IsEnabled:       true,
		Capabilities:    ai.CapabilityImage,
		PricingMode:     string(ai.PricingPerImage),
		CreditsPerImage: 2,
	}
	if err := db.Create(&defaultEntry).Error; err != nil {
		t.Fatalf("create default catalog entry: %v", err)
	}
	entry := model.AIModelCatalogEntry{
		PublicModelID:   "image-fast",
		DisplayName:     "Image Fast",
		IsEnabled:       true,
		Capabilities:    ai.CapabilityImage,
		PricingMode:     string(ai.PricingPerImage),
		CreditsPerImage: 2,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&model.AIModelRouteBinding{
		CatalogEntryID:  defaultEntry.ID,
		SourceType:      model.ModelRouteSourceNewAPI,
		RouteGroup:      "default",
		ProviderModelID: "provider-image-default",
		IsEnabled:       true,
		Priority:        10,
		CapacityWeight:  1,
	}).Error; err != nil {
		t.Fatalf("create default route binding: %v", err)
	}
	priorityBinding := model.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      model.ModelRouteSourceNewAPI,
		RouteGroup:      "priority",
		ProviderModelID: "provider-image-v2",
		IsEnabled:       true,
		Priority:        1,
		CapacityWeight:  1,
	}
	if err := db.Create(&priorityBinding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}

	svc := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))
	ctx := ai.WithProviderRouteGroup(context.Background(), "priority")
	job, err := svc.EnqueueGeneration(ctx, EnqueueInput{
		UserID:  1,
		ModelID: "image-fast",
		JobType: ai.CapabilityImage,
		Prompt:  "draw",
	})
	if err != nil {
		t.Fatalf("EnqueueGeneration() error = %v", err)
	}
	if job.RuntimeModelID != entry.ID {
		t.Fatalf("job runtime model id = %d, want catalog entry id %d", job.RuntimeModelID, entry.ID)
	}
	if job.AIModelCatalogEntryID == nil || *job.AIModelCatalogEntryID != entry.ID {
		t.Fatalf("job catalog entry id = %v, want %d", job.AIModelCatalogEntryID, entry.ID)
	}
	if job.RouteBindingID == nil || *job.RouteBindingID != priorityBinding.ID {
		t.Fatalf("job route binding id = %v, want %d", job.RouteBindingID, priorityBinding.ID)
	}
	if job.RouteGroup != "priority" {
		t.Fatalf("job route group = %q, want priority", job.RouteGroup)
	}
	if !strings.Contains(job.RequestContext, "provider-image-v2") || !strings.Contains(job.RequestContext, model.ModelRouteSourceNewAPI) {
		t.Fatalf("request context = %s, want provider model and new-api source", job.RequestContext)
	}
}

func TestGormRepositoryResponseLookupsUsesCatalogWithoutLegacyProviderTables(t *testing.T) {
	db := testutil.OpenSQLite(t, "job_repository_catalog_only.db", &model.Job{}, &model.RawResource{}, &model.AIModelCatalogEntry{})
	repo := &gormRepository{db: db}
	entry := model.AIModelCatalogEntry{
		PublicModelID: "image-fast",
		DisplayName:   "Image Fast",
		IsEnabled:     true,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if db.Migrator().HasTable("ai_model_configs") || db.Migrator().HasTable(&model.AICredential{}) {
		t.Fatal("catalog-only lookup test should not create legacy provider tables")
	}

	lookups, err := repo.ResponseLookups(context.Background(), nil, []uint{entry.ID})
	if err != nil {
		t.Fatalf("ResponseLookups() error = %v", err)
	}
	catalog, ok := lookups.CatalogEntriesByID[entry.ID]
	if !ok {
		t.Fatalf("catalog lookup missing entry %d", entry.ID)
	}
	if catalog.PublicModelID != "image-fast" {
		t.Fatalf("catalog lookup = %#v", catalog)
	}
}

func TestBuildResponsesUsesOnlyExplicitCatalogEntryID(t *testing.T) {
	db := testutil.OpenSQLite(t, "job_response_catalog_explicit.db", &model.Job{}, &model.RawResource{}, &model.AIModelCatalogEntry{})
	entry := model.AIModelCatalogEntry{
		PublicModelID: "image-fast",
		DisplayName:   "Image Fast",
		IsEnabled:     true,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	svc := NewService(db)
	explicitCatalogID := entry.ID

	responses := svc.BuildResponses(context.Background(), []domainjob.Job{
		{
			ID:             1,
			UserID:         1,
			RuntimeModelID: 99,
			JobType:        ai.CapabilityImage,
			Status:         domainjob.StatusPending,
			Prompt:         "legacy",
		},
		{
			ID:                    2,
			UserID:                1,
			RuntimeModelID:        99,
			AIModelCatalogEntryID: &explicitCatalogID,
			JobType:               ai.CapabilityImage,
			Status:                domainjob.StatusPending,
			Prompt:                "explicit",
		},
	}, nil)

	if len(responses) != 2 {
		t.Fatalf("responses len = %d, want 2", len(responses))
	}
	if responses[0].ModelDisplay != "" || responses[0].ModelIdentifier != "" || responses[0].ModelID != "" {
		t.Fatalf("legacy runtime model fallback populated model fields: %#v", responses[0])
	}
	if responses[1].ModelDisplay != "Image Fast" || responses[1].ModelIdentifier != "image-fast" || responses[1].ModelID != "image-fast" {
		t.Fatalf("explicit catalog entry response = %#v", responses[1])
	}
}

func TestGormRepositoryLoadInputResourcesRejectsLegacySharedPersonalResource(t *testing.T) {
	db := openJobRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	resource := model.RawResource{
		OwnerID: 2,
		Type:    "image",
		Name:    "private.png",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	_, err := repo.LoadInputResources(context.Background(), []uint{resource.ID}, 1, nil)
	if !errors.Is(err, ErrResourceOutsideOrg) {
		t.Fatalf("LoadInputResources(private) error = %v, want ErrResourceOutsideOrg", err)
	}

	if err := db.Model(&resource).Update("is_shared", true).Error; err != nil {
		t.Fatalf("share resource: %v", err)
	}
	if _, err := repo.LoadInputResources(context.Background(), []uint{resource.ID}, 1, nil); !errors.Is(err, ErrResourceOutsideOrg) {
		t.Fatalf("LoadInputResources(legacy shared resource) error = %v, want ErrResourceOutsideOrg", err)
	}
}

func TestGormRepositoryLoadInputResourcesAllowsTeamResourceWithoutSharing(t *testing.T) {
	db := openJobRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	org := model.Organization{Name: "Studio", Slug: "studio"}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	resource := model.RawResource{
		OwnerID: 2,
		OrgID:   &org.ID,
		Type:    "image",
		Name:    "team.png",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	if _, err := repo.LoadInputResources(context.Background(), []uint{resource.ID}, 1, &org.ID); err != nil {
		t.Fatalf("LoadInputResources(team resource) error = %v", err)
	}
	if _, err := repo.LoadInputResources(context.Background(), []uint{resource.ID}, 1, nil); !errors.Is(err, ErrResourceOutsideOrg) {
		t.Fatalf("LoadInputResources(personal workspace) error = %v, want ErrResourceOutsideOrg", err)
	}
}

func openJobRepositoryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "job_repository.db", &model.Job{}, &model.Organization{}, &model.RawResource{}, &model.ResourceFolder{}, &model.AICredential{}, &model.AIModelCatalogEntry{}, &model.AIModelRouteBinding{}, &model.UsageReservation{}, &model.UsageLog{})
}

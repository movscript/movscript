package job

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
	domainresourcefolder "github.com/movscript/movscript/internal/domain/resource/folder"
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
		ModelConfigID:       2,
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
		ModelConfigID:      2,
		JobType:            domainjob.CapabilityImage,
		Title:              "参考生图-5678",
		Status:             domainjob.StatusPending,
		Prompt:             "draw",
		UsageReservationID: &reservationID,
	}
	finished := model.Job{
		UserID:        1,
		ModelConfigID: 2,
		JobType:       domainjob.CapabilityImage,
		Title:         "参考生图-9012",
		Status:        domainjob.StatusSucceeded,
		Prompt:        "draw",
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
	cfg := model.AIModelConfig{
		CredentialID:       cred.ID,
		ModelDefID:         "seedance-conflict-test",
		IsEnabled:          true,
		CustomDisplayName:  "Seedance Conflict Test",
		CustomCapabilities: ai.CapabilityVideo,
		CustomPricingMode:  string(ai.PricingPerSecond),
		CustomSupportedParams: `{
			"allow":["duration","frames"],
			"override":{
				"duration":{"conflicts_with":["frames"]}
			}
		}`,
	}
	if err := db.Create(&cfg).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}

	svc := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))
	_, err := svc.EnqueueGeneration(context.Background(), EnqueueInput{
		UserID:        1,
		ModelConfigID: cfg.ID,
		JobType:       ai.CapabilityVideo,
		Prompt:        "make a shot",
		ExtraParams:   `{"frames":29}`,
		Duration:      5,
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

func TestGormRepositoryLoadInputResourcesRequiresVisibilityGrant(t *testing.T) {
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
	if _, err := repo.LoadInputResources(context.Background(), []uint{resource.ID}, 1, nil); err != nil {
		t.Fatalf("LoadInputResources(shared resource) error = %v", err)
	}
}

func TestGormRepositoryLoadInputResourcesAllowsFolderPermission(t *testing.T) {
	db := openJobRepositoryTestDB(t)
	repo := &gormRepository{db: db}
	folder := model.ResourceFolder{OwnerID: 2, Name: "Shared Work"}
	if err := db.Create(&folder).Error; err != nil {
		t.Fatalf("create folder: %v", err)
	}
	resource := model.RawResource{
		OwnerID:  2,
		FolderID: &folder.ID,
		Type:     "image",
		Name:     "folder-private.png",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	permission := model.ResourceFolderPermission{
		FolderID:   folder.ID,
		UserID:     1,
		Permission: domainresourcefolder.PermissionRead,
	}
	if err := db.Create(&permission).Error; err != nil {
		t.Fatalf("create folder permission: %v", err)
	}

	if _, err := repo.LoadInputResources(context.Background(), []uint{resource.ID}, 1, nil); err != nil {
		t.Fatalf("LoadInputResources(folder permission) error = %v", err)
	}
}

func openJobRepositoryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "job_repository.db", &model.Job{}, &model.RawResource{}, &model.ResourceFolder{}, &model.ResourceFolderPermission{}, &model.AICredential{}, &model.AIModelConfig{})
}

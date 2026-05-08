package job

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
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
		Status:             domainjob.StatusPending,
		Prompt:             "draw",
		UsageReservationID: &reservationID,
	}
	finished := model.Job{
		UserID:        1,
		ModelConfigID: 2,
		JobType:       domainjob.CapabilityImage,
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

func openJobRepositoryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "job_repository.db")), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.Job{}, &model.RawResource{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

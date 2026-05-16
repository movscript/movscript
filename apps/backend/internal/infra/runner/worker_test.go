package runner

import (
	"bytes"
	"context"
	"errors"
	"log"
	"strings"
	"testing"
	"time"

	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

func TestCallProviderWithTimeout(t *testing.T) {
	start := time.Now()
	_, err := callProviderWithTimeout(context.Background(), 20*time.Millisecond, func(ctx context.Context) (string, error) {
		<-ctx.Done()
		return "", ctx.Err()
	})
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected DeadlineExceeded, got %v", err)
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("timeout took too long: %s", elapsed)
	}
}

func TestRetryDelayCaps(t *testing.T) {
	if retryDelay(1) != 10*time.Second {
		t.Fatalf("attempt 1 delay = %s", retryDelay(1))
	}
	if retryDelay(99) != 5*time.Minute {
		t.Fatalf("attempt 99 delay = %s", retryDelay(99))
	}
}

func TestClaimLocalJobWritesWorkerLease(t *testing.T) {
	db := openJobRunnerTestDB(t)
	job := model.Job{
		UserID:        1,
		ModelConfigID: 1,
		JobType:       ai.CapabilityImage,
		Status:        StatusPending,
		MaxAttempts:   3,
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}

	worker := NewWorker(db, nil, nil, nil)
	worker.workerID = "worker-a"

	var claimed model.Job
	if err := worker.claimLocalJob(&claimed); err != nil {
		t.Fatalf("claim job: %v", err)
	}
	if claimed.ID != job.ID {
		t.Fatalf("claimed job id = %d, want %d", claimed.ID, job.ID)
	}
	if claimed.Status != StatusRunning {
		t.Fatalf("claimed status = %q", claimed.Status)
	}
	if claimed.LockedBy != worker.workerID {
		t.Fatalf("locked_by = %q, want %q", claimed.LockedBy, worker.workerID)
	}
	if claimed.LeaseUntil == nil || !claimed.LeaseUntil.After(time.Now()) {
		t.Fatalf("lease_until was not set in the future: %v", claimed.LeaseUntil)
	}
	if claimed.AttemptCount != 1 {
		t.Fatalf("attempt_count = %d, want 1", claimed.AttemptCount)
	}
}

func TestClaimLocalProviderPollDoesNotIncrementAttempt(t *testing.T) {
	db := openJobRunnerTestDB(t)
	job := model.Job{
		UserID:         1,
		ModelConfigID:  1,
		JobType:        ai.CapabilityVideo,
		Status:         StatusPending,
		AttemptCount:   1,
		MaxAttempts:    3,
		ProviderTaskID: "provider-task-1",
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}

	worker := NewWorker(db, nil, nil, nil)
	worker.workerID = "worker-a"

	var claimed model.Job
	if err := worker.claimLocalJob(&claimed); err != nil {
		t.Fatalf("claim job: %v", err)
	}
	if claimed.AttemptCount != 1 {
		t.Fatalf("attempt_count = %d, want provider poll to keep 1", claimed.AttemptCount)
	}
}

func TestClaimLocalJobEmptyQueueDoesNotLogRecordNotFound(t *testing.T) {
	var logs bytes.Buffer
	db := openJobRunnerTestDBWithLogger(t, gormlogger.New(log.New(&logs, "", 0), gormlogger.Config{
		LogLevel:                  gormlogger.Warn,
		IgnoreRecordNotFoundError: false,
	}))
	worker := NewWorker(db, nil, nil, nil)

	var claimed model.Job
	if err := worker.claimLocalJob(&claimed); err != nil {
		t.Fatalf("claim empty queue: %v", err)
	}
	if claimed.ID != 0 {
		t.Fatalf("claimed job id = %d, want 0", claimed.ID)
	}

	output := logs.String()
	if strings.Contains(output, "record not found") {
		t.Fatalf("claim empty queue logged record not found: %s", output)
	}
}

func TestRenewLeaseOnlyForOwningWorker(t *testing.T) {
	db := openJobRunnerTestDB(t)
	now := time.Now()
	oldLease := now.Add(-time.Minute)
	job := model.Job{
		UserID:        1,
		ModelConfigID: 1,
		JobType:       ai.CapabilityImage,
		Status:        StatusRunning,
		MaxAttempts:   3,
		LockedBy:      "worker-a",
		LeaseUntil:    &oldLease,
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}

	other := NewWorker(db, nil, nil, nil)
	other.workerID = "worker-b"
	rows, err := other.renewLease(job.ID)
	if err != nil {
		t.Fatalf("renew by non-owner: %v", err)
	}
	if rows != 0 {
		t.Fatalf("non-owner renewed %d rows, want 0", rows)
	}

	owner := NewWorker(db, nil, nil, nil)
	owner.workerID = "worker-a"
	rows, err = owner.renewLease(job.ID)
	if err != nil {
		t.Fatalf("renew by owner: %v", err)
	}
	if rows != 1 {
		t.Fatalf("owner renewed %d rows, want 1", rows)
	}

	var reloaded model.Job
	if err := db.First(&reloaded, job.ID).Error; err != nil {
		t.Fatalf("reload job: %v", err)
	}
	if reloaded.LeaseUntil == nil || !reloaded.LeaseUntil.After(now) {
		t.Fatalf("lease_until was not renewed: %v", reloaded.LeaseUntil)
	}
}

func TestRequeueStaleRunningJobsClearsExpiredLease(t *testing.T) {
	db := openJobRunnerTestDB(t)
	expiredLease := time.Now().Add(-time.Minute)
	job := model.Job{
		UserID:        1,
		ModelConfigID: 1,
		JobType:       ai.CapabilityImage,
		Status:        StatusRunning,
		AttemptCount:  1,
		MaxAttempts:   3,
		LockedBy:      "dead-worker",
		LeaseUntil:    &expiredLease,
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}

	worker := NewWorker(db, nil, nil, nil)
	worker.requeueStaleRunningJobs(context.Background())

	var reloaded model.Job
	if err := db.First(&reloaded, job.ID).Error; err != nil {
		t.Fatalf("reload job: %v", err)
	}
	if reloaded.Status != StatusPending {
		t.Fatalf("status = %q, want pending", reloaded.Status)
	}
	if reloaded.LockedBy != "" {
		t.Fatalf("locked_by = %q, want empty", reloaded.LockedBy)
	}
	if reloaded.LeaseUntil != nil {
		t.Fatalf("lease_until = %v, want nil", reloaded.LeaseUntil)
	}
}

func openJobRunnerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return openJobRunnerTestDBWithLogger(t, nil)
}

func openJobRunnerTestDBWithLogger(t *testing.T, gormLogger gormlogger.Interface) *gorm.DB {
	t.Helper()
	config := &gorm.Config{}
	if gormLogger != nil {
		config.Logger = gormLogger
	}
	return testutil.OpenSQLiteWithConfig(t, "runner.db", config, &model.Job{})
}

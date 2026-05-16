package handler

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	domainjob "github.com/movscript/movscript/internal/domain/job"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestAdminJobActionsWriteAuditLogs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestJobActionRouter(t)

	failedJob := seedJob(t, db, persistencemodel.Job{
		UserID:        7,
		ModelConfigID: 11,
		JobType:       domainjob.CapabilityImage,
		Status:        domainjob.StatusFailed,
		AttemptCount:  1,
		MaxAttempts:   3,
		Prompt:        "Generate a poster",
		ErrorMsg:      "provider failed",
	})
	deleteJob := seedJob(t, db, persistencemodel.Job{
		UserID:        8,
		ModelConfigID: 12,
		JobType:       domainjob.CapabilityImage,
		Status:        domainjob.StatusSucceeded,
		MaxAttempts:   3,
		Prompt:        "Generate another poster",
	})

	retryReq := httptest.NewRequest(http.MethodPost, "/admin/debug/jobs/"+strconv.FormatUint(uint64(failedJob.ID), 10)+"/retry", nil)
	retryRes := httptest.NewRecorder()

	router.ServeHTTP(retryRes, retryReq)

	if retryRes.Code != http.StatusOK {
		t.Fatalf("expected admin retry to succeed, got %d: %s", retryRes.Code, retryRes.Body.String())
	}
	if countAuditAction(t, db, "job.admin_retried") != 1 {
		t.Fatalf("expected retry audit log")
	}
	var retried persistencemodel.Job
	if err := db.First(&retried, failedJob.ID).Error; err != nil {
		t.Fatalf("load retried job: %v", err)
	}
	if retried.Status != domainjob.StatusPending {
		t.Fatalf("retried status = %s, want pending", retried.Status)
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/admin/debug/jobs/"+strconv.FormatUint(uint64(deleteJob.ID), 10), nil)
	deleteRes := httptest.NewRecorder()

	router.ServeHTTP(deleteRes, deleteReq)

	if deleteRes.Code != http.StatusNoContent {
		t.Fatalf("expected admin delete to succeed, got %d: %s", deleteRes.Code, deleteRes.Body.String())
	}
	if countAuditAction(t, db, "job.admin_deleted") != 1 {
		t.Fatalf("expected delete audit log")
	}
	var deletedCount int64
	if err := db.Unscoped().Model(&persistencemodel.Job{}).Where("id = ? AND deleted_at IS NOT NULL", deleteJob.ID).Count(&deletedCount).Error; err != nil {
		t.Fatalf("count deleted job: %v", err)
	}
	if deletedCount != 1 {
		t.Fatalf("deleted job count = %d, want 1", deletedCount)
	}
}

func TestAdminJobActionMissingDoesNotWriteAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestJobActionRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/admin/debug/jobs/99/retry", nil)
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusNotFound {
		t.Fatalf("expected missing admin retry to return 404, got %d: %s", res.Code, res.Body.String())
	}
	if countAuditAction(t, db, "job.admin_retried") != 0 {
		t.Fatalf("expected no retry audit log for failed action")
	}
}

func newTestJobActionRouter(t *testing.T) (*gin.Engine, *gorm.DB) {
	t.Helper()
	db := testutil.OpenSQLite(t, "handler-job-actions.db", &persistencemodel.Job{}, &persistencemodel.AuditLog{})
	h := NewJobHandler(db.Session(&gorm.Session{SkipHooks: true}), nil)

	router := gin.New()
	router.POST("/admin/debug/jobs/:id/retry", h.AdminRetry)
	router.DELETE("/admin/debug/jobs/:id", h.AdminDelete)
	return router, db
}

func seedJob(t *testing.T, db *gorm.DB, job persistencemodel.Job) persistencemodel.Job {
	t.Helper()
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("seed job: %v", err)
	}
	return job
}

package shotreference

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	domainshotreference "github.com/movscript/movscript/internal/domain/shotreference"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestUploadAndAnalyzePersistsSearchableShotReference(t *testing.T) {
	db := testutil.OpenSQLite(t, "shot-reference.db", &model.User{}, &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{})
	service := NewService(db, fakeShotStorage{}, nil)
	duration := 9.2

	created, err := service.UploadAndAnalyze(context.Background(), UploadInput{
		UserID:      7,
		Filename:    "slow_push_reveal.mp4",
		MimeType:    "video/mp4",
		Size:        12,
		Data:        []byte("video-bytes"),
		DurationSec: &duration,
		Width:       1920,
		Height:      1080,
	})
	if err != nil {
		t.Fatalf("upload and analyze: %v", err)
	}
	if created.Resource == nil {
		t.Fatalf("created reference missing resource")
	}
	if created.Group == nil {
		t.Fatalf("created reference missing group")
	}
	if created.Resource.URL != "/api/v1/resources/1/file" {
		t.Fatalf("resource url = %q", created.Resource.URL)
	}
	if created.ExecutionDetails.AspectRatio != "16:9" {
		t.Fatalf("aspect ratio = %q, want 16:9", created.ExecutionDetails.AspectRatio)
	}
	if !containsString(created.Intent, "reveal_information") || !containsString(created.Pattern, "slow_push_in") {
		t.Fatalf("unexpected analysis: intent=%v pattern=%v", created.Intent, created.Pattern)
	}
	if created.VisualAnalysis.CameraMovement.Type != "push_in" {
		t.Fatalf("camera movement = %q, want push_in", created.VisualAnalysis.CameraMovement.Type)
	}
	if created.NarrativeFunction.Primary != "delayed_reveal" {
		t.Fatalf("narrative primary = %q, want delayed_reveal", created.NarrativeFunction.Primary)
	}
	if created.ReusablePattern.Principle == "" || !strings.Contains(created.SearchIndex.SearchText, "delayed reveal") {
		t.Fatalf("missing reusable/search schema: pattern=%+v search=%q", created.ReusablePattern, created.SearchIndex.SearchText)
	}

	page, err := service.List(context.Background(), domainshotreference.ListInput{UserID: 7, Query: "reveal slow_push", Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("list shot references: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != created.ID {
		t.Fatalf("search page = %+v, want created reference", page)
	}
	page, err = service.List(context.Background(), domainshotreference.ListInput{UserID: 7, Query: "角色发现真相前", Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("list shot references by natural-language query: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != created.ID {
		t.Fatalf("natural-language search page = %+v, want created reference", page)
	}
}

func TestDeleteRemovesShotReferenceButKeepsResource(t *testing.T) {
	db := testutil.OpenSQLite(t, "shot-reference-delete.db", &model.User{}, &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{})
	service := NewService(db, fakeShotStorage{}, nil)

	created, err := service.UploadAndAnalyze(context.Background(), UploadInput{
		UserID:   7,
		Filename: "delete_me.mp4",
		MimeType: "video/mp4",
		Size:     12,
		Data:     []byte("video-bytes"),
	})
	if err != nil {
		t.Fatalf("upload and analyze: %v", err)
	}
	if err := service.Delete(context.Background(), created.ID, domainshotreference.ListInput{UserID: 7}); err != nil {
		t.Fatalf("delete shot reference: %v", err)
	}
	page, err := service.List(context.Background(), domainshotreference.ListInput{UserID: 7, Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	if page.Total != 0 || len(page.Items) != 0 {
		t.Fatalf("page after delete = %+v, want empty", page)
	}
	var resourceCount int64
	if err := db.Model(&model.RawResource{}).Count(&resourceCount).Error; err != nil {
		t.Fatalf("count resources: %v", err)
	}
	if resourceCount != 1 {
		t.Fatalf("resource count = %d, want original resource retained", resourceCount)
	}
	if err := service.Delete(context.Background(), created.ID, domainshotreference.ListInput{UserID: 7}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second delete error = %v, want not found", err)
	}
}

func TestUploadAndAnalyzeRejectsNonVideoBeforeResourceCreate(t *testing.T) {
	db := testutil.OpenSQLite(t, "shot-reference-invalid.db", &model.User{}, &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{})
	service := NewService(db, fakeShotStorage{}, nil)

	_, err := service.UploadAndAnalyze(context.Background(), UploadInput{
		UserID:   7,
		Filename: "poster.png",
		MimeType: "image/png",
		Size:     12,
		Data:     []byte("image"),
	})
	if err == nil {
		t.Fatalf("expected non-video upload to fail")
	}
	var stageErr StageError
	if !errors.As(err, &stageErr) || stageErr.Stage != StageValidateVideo {
		t.Fatalf("stage error = %#v, want %s", err, StageValidateVideo)
	}
	var count int64
	if err := db.Model(&model.RawResource{}).Count(&count).Error; err != nil {
		t.Fatalf("count resources: %v", err)
	}
	if count != 0 {
		t.Fatalf("resource count = %d, want 0", count)
	}
}

func TestCreateFromResourceAppendsToExistingGroup(t *testing.T) {
	db := testutil.OpenSQLite(t, "shot-reference-group.db", &model.User{}, &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{})
	service := NewService(db, fakeShotStorage{}, nil)

	duration := 9.2
	created, err := service.UploadAndAnalyze(context.Background(), UploadInput{
		UserID:      7,
		Filename:    "group_base.mp4",
		MimeType:    "video/mp4",
		Size:        12,
		Data:        []byte("video-bytes"),
		DurationSec: &duration,
	})
	if err != nil {
		t.Fatalf("seed group: %v", err)
	}
	if created.GroupID == nil {
		t.Fatalf("seed reference missing group id")
	}

	references, err := service.CreateFromResource(context.Background(), CreateFromResourceInput{
		UserID:      7,
		ResourceID:  created.ResourceID,
		GroupID:     created.GroupID,
		DurationSec: &duration,
		Shots: []domainshotreference.UpdateInput{
			{Title: strPtr("shot a")},
			{Title: strPtr("shot b")},
		},
	})
	if err != nil {
		t.Fatalf("append to existing group: %v", err)
	}
	if len(references) != 2 {
		t.Fatalf("reference count = %d, want 2", len(references))
	}
	for i, reference := range references {
		if reference.GroupID == nil || *reference.GroupID != *created.GroupID {
			t.Fatalf("reference %d group id = %v, want %d", i, reference.GroupID, *created.GroupID)
		}
		wantOrder := 2 + i
		if reference.Order != wantOrder {
			t.Fatalf("reference %d order = %d, want %d", i, reference.Order, wantOrder)
		}
	}
}

func TestNextGroupOrderUsesPostgresSafeOrderIdentifier(t *testing.T) {
	db := testutil.OpenPostgresDryRun(t)
	sql := db.ToSQL(func(tx *gorm.DB) *gorm.DB {
		var maxOrder int
		return tx.Model(&model.ShotReference{}).
			Select(shotReferenceMaxGroupOrderSQL).
			Where("group_id = ?", 12).
			Where("org_id IS NULL AND owner_id = ?", 7).
			Scan(&maxOrder)
	})
	if strings.Contains(sql, "`order`") {
		t.Fatalf("next group order sql uses mysql quoting: %s", sql)
	}
	if !strings.Contains(sql, `max("order")`) {
		t.Fatalf("next group order sql = %s, want quoted order identifier", sql)
	}
}

func TestCreateFromResourceUsesManualGroupTitle(t *testing.T) {
	db := testutil.OpenSQLite(t, "shot-reference-manual-group-title.db", &model.User{}, &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{})
	service := NewService(db, fakeShotStorage{}, nil)

	duration := 7.5
	created, err := service.UploadAndAnalyze(context.Background(), UploadInput{
		UserID:      7,
		Filename:    "source_clip.mp4",
		MimeType:    "video/mp4",
		Size:        12,
		Data:        []byte("video-bytes"),
		DurationSec: &duration,
	})
	if err != nil {
		t.Fatalf("seed resource: %v", err)
	}

	references, err := service.CreateFromResource(context.Background(), CreateFromResourceInput{
		UserID:      7,
		ResourceID:  created.ResourceID,
		GroupTitle:  "雨夜楼道",
		DurationSec: &duration,
		Shots: []domainshotreference.UpdateInput{
			{Title: strPtr("shot a")},
		},
	})
	if err != nil {
		t.Fatalf("create manual group: %v", err)
	}
	if len(references) != 1 {
		t.Fatalf("reference count = %d, want 1", len(references))
	}
	if references[0].Group == nil || references[0].Group.Title != "雨夜楼道" {
		t.Fatalf("group title = %#v, want manual title", references[0].Group)
	}
}

func TestUpdatePersistsManualProfessionalAnnotationFields(t *testing.T) {
	db := testutil.OpenSQLite(t, "shot-reference-manual-fields.db", &model.User{}, &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{})
	service := NewService(db, fakeShotStorage{}, nil)

	created, err := service.UploadAndAnalyze(context.Background(), UploadInput{
		UserID:   7,
		Filename: "manual_fields.mp4",
		MimeType: "video/mp4",
		Size:     12,
		Data:     []byte("video-bytes"),
	})
	if err != nil {
		t.Fatalf("upload and analyze: %v", err)
	}

	updated, err := service.Update(context.Background(), created.ID, domainshotreference.ListInput{UserID: 7}, domainshotreference.UpdateInput{
		VisualAnalysis: domainshotreference.VisualAnalysis{
			ShotSize: "extreme_close_up",
			CameraMovement: domainshotreference.MovementAnalysis{
				Type:      "locked_off",
				Stability: "tripod",
			},
		},
		VisualAnalysisSet: true,
		NarrativeFunction: domainshotreference.NarrativeFunction{
			Primary:          "realization",
			InformationState: "new_information_lands",
		},
		NarrativeFunctionSet: true,
		ReusablePattern: domainshotreference.ReusablePattern{
			PatternIDs: []string{"reaction_close_up"},
			Principle:  "Hold on the face until the decision becomes readable.",
		},
		ReusablePatternSet: true,
	})
	if err != nil {
		t.Fatalf("update manual fields: %v", err)
	}
	if updated.VisualAnalysis.ShotSize != "extreme_close_up" {
		t.Fatalf("shot size = %q, want manual value", updated.VisualAnalysis.ShotSize)
	}
	if updated.NarrativeFunction.Primary != "realization" {
		t.Fatalf("narrative primary = %q, want realization", updated.NarrativeFunction.Primary)
	}
	if updated.ReusablePattern.Principle != "Hold on the face until the decision becomes readable." {
		t.Fatalf("principle = %q", updated.ReusablePattern.Principle)
	}

	page, err := service.List(context.Background(), domainshotreference.ListInput{UserID: 7, Query: "realization extreme_close_up", Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("search updated fields: %v", err)
	}
	if page.Total != 1 || page.Items[0].ID != created.ID {
		t.Fatalf("search page = %+v, want updated reference", page)
	}
}

type fakeShotStorage struct{}

func (fakeShotStorage) Put(context.Context, string, io.Reader, int64, string) error {
	return nil
}

func (fakeShotStorage) Delete(context.Context, string) error {
	return nil
}

func (fakeShotStorage) DirectURL(context.Context, string) (string, error) {
	return "", nil
}

func (fakeShotStorage) GetObject(context.Context, string, int64, int64) (io.ReadCloser, int64, string, error) {
	return io.NopCloser(strings.NewReader("")), 0, "", nil
}

func (fakeShotStorage) Backend() string {
	return "fake"
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func strPtr(value string) *string {
	return &value
}

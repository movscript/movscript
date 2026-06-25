package shotreference

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	domainshotreference "github.com/movscript/movscript/internal/domain/shotreference"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

var _ providercontract.VectorIndexProvider = (*LocalVectorIndexProvider)(nil)

func TestUploadAndAnalyzePersistsSearchableShotReference(t *testing.T) {
	db := testutil.OpenSQLite(t, "shot-reference.db", &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{}, &model.ShotVectorDocument{})
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
	vectorResults, err := service.SearchVectorDocuments(context.Background(), domainshotreference.VectorSearchRequest{
		Query:  "delayed reveal",
		Locale: "zh-CN",
		TopK:   3,
	})
	if err != nil {
		t.Fatalf("search vector documents: %v", err)
	}
	if len(vectorResults) == 0 || vectorResults[0].Document.ReferenceID != created.ID {
		t.Fatalf("vector results = %+v, want created reference", vectorResults)
	}
	stats, err := service.VectorStats(context.Background())
	if err != nil {
		t.Fatalf("vector stats: %v", err)
	}
	if stats.Documents == 0 || stats.EmbeddedDocuments != stats.Documents || stats.ByEmbeddingModel[localEmbeddingModel] != stats.Documents {
		t.Fatalf("vector stats = %+v, want embedded documents with model %q", stats, localEmbeddingModel)
	}
	if stats.SourceReferences != 1 || stats.References != 1 || stats.UnindexedReferences != 0 || stats.OrphanReferences != 0 || stats.IndexCoverage != 1 {
		t.Fatalf("vector coverage stats = %+v, want complete coverage", stats)
	}
	if err := db.Unscoped().Where("reference_id = ?", created.ID).Delete(&model.ShotVectorDocument{}).Error; err != nil {
		t.Fatalf("delete vector documents before reindex: %v", err)
	}
	reindexed, err := service.ReindexVectorDocuments(context.Background(), domainshotreference.ListInput{UserID: 7})
	if err != nil {
		t.Fatalf("reindex vector documents: %v", err)
	}
	if reindexed != 1 {
		t.Fatalf("reindexed = %d, want 1", reindexed)
	}
	vectorResults, err = service.SearchVectorDocuments(context.Background(), domainshotreference.VectorSearchRequest{
		Query:  "delayed reveal",
		Locale: "zh-CN",
		TopK:   3,
	})
	if err != nil {
		t.Fatalf("search vector documents after reindex: %v", err)
	}
	if len(vectorResults) == 0 || vectorResults[0].Document.ReferenceID != created.ID {
		t.Fatalf("vector results after reindex = %+v, want created reference", vectorResults)
	}
	if err := db.Create(&model.ShotVectorDocument{
		DocumentID:  "orphan:999:zh-CN:combined",
		ReferenceID: 999,
		SourceID:    "orphan",
		Locale:      "zh-CN",
		Kind:        "combined",
		Text:        "stale orphan document",
		Metadata:    "{}",
	}).Error; err != nil {
		t.Fatalf("create orphan vector document: %v", err)
	}
	stats, err = service.VectorStats(context.Background())
	if err != nil {
		t.Fatalf("vector stats with orphan: %v", err)
	}
	if stats.OrphanReferences != 1 {
		t.Fatalf("orphan references = %d, want 1 in stats %+v", stats.OrphanReferences, stats)
	}
	adminReindexed, err := service.AdminReindexVectorDocuments(context.Background())
	if err != nil {
		t.Fatalf("admin reindex vector documents: %v", err)
	}
	if adminReindexed != 1 {
		t.Fatalf("admin reindexed = %d, want 1", adminReindexed)
	}
	var orphanCount int64
	if err := db.Model(&model.ShotVectorDocument{}).Where("reference_id = ?", 999).Count(&orphanCount).Error; err != nil {
		t.Fatalf("count orphan vector documents: %v", err)
	}
	if orphanCount != 0 {
		t.Fatalf("orphan vector documents = %d, want 0", orphanCount)
	}
	stats, err = service.VectorStats(context.Background())
	if err != nil {
		t.Fatalf("vector stats after admin reindex: %v", err)
	}
	if stats.OrphanReferences != 0 || stats.UnindexedReferences != 0 || stats.IndexCoverage != 1 {
		t.Fatalf("vector stats after admin reindex = %+v, want healthy index", stats)
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
	page, err = service.List(context.Background(), domainshotreference.ListInput{UserID: 7, Query: "气氛慢慢变紧", Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("list shot references by localized alias query: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != created.ID {
		t.Fatalf("localized alias search page = %+v, want created reference", page)
	}
}

func TestLocalVectorIndexProviderAdaptsProviderContract(t *testing.T) {
	db := testutil.OpenSQLite(t, "shot-reference-provider-vector-index.db", &model.ShotVectorDocument{})
	provider := NewLocalVectorIndexProvider(db)

	if err := provider.Upsert(context.Background(), providercontract.VectorDocument{
		ID:        "default:42:zh-CN:combined",
		Namespace: "default",
		SourceID:  "default",
		Locale:    "zh-CN",
		Kind:      "combined",
		Text:      "slow push delayed reveal",
		Metadata:  map[string]any{"reference_id": float64(42), "visual_facets": []any{"push_in"}},
	}); err != nil {
		t.Fatalf("provider upsert: %v", err)
	}

	results, err := provider.Search(context.Background(), providercontract.VectorSearchRequest{
		Query:  "delayed reveal",
		Locale: "zh-CN",
		TopK:   1,
	})
	if err != nil {
		t.Fatalf("provider search: %v", err)
	}
	if len(results) != 1 || results[0].Document.ID != "default:42:zh-CN:combined" || results[0].Document.SourceID != "default" {
		t.Fatalf("provider search results = %+v, want adapted vector document", results)
	}
	stats, err := provider.Stats(context.Background())
	if err != nil {
		t.Fatalf("provider stats: %v", err)
	}
	if stats.Documents != 1 || stats.EmbeddingModels[localEmbeddingModel] != 1 {
		t.Fatalf("provider stats = %+v, want one local embedded document", stats)
	}
	if err := provider.Delete(context.Background(), providercontract.VectorDocumentRef{ID: "default:42:zh-CN:combined"}); err != nil {
		t.Fatalf("provider delete: %v", err)
	}
	results, err = provider.Search(context.Background(), providercontract.VectorSearchRequest{Query: "delayed reveal", Locale: "zh-CN"})
	if err != nil {
		t.Fatalf("provider search after delete: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("provider search after delete = %+v, want empty", results)
	}
}

func TestSearchTranslatesLocalizedQueryToCanonicalTags(t *testing.T) {
	db := testutil.OpenSQLite(t, "shot-reference-localized-search.db", &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{}, &model.ShotVectorDocument{})
	service := NewService(db, fakeShotStorage{}, nil)
	duration := 9.2

	reveal, err := service.UploadAndAnalyze(context.Background(), UploadInput{
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
		t.Fatalf("upload reveal reference: %v", err)
	}
	otherDuration := 2.0
	other, err := service.UploadAndAnalyze(context.Background(), UploadInput{
		UserID:      7,
		Filename:    "office_reference.mp4",
		MimeType:    "video/mp4",
		Size:        12,
		Data:        []byte("video-bytes"),
		DurationSec: &otherDuration,
		Width:       1920,
		Height:      1080,
	})
	if err != nil {
		t.Fatalf("upload other reference: %v", err)
	}

	page, err := service.List(context.Background(), domainshotreference.ListInput{UserID: 7, Query: "角色发现真相前，镜头慢慢靠近脸", Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("localized vector search: %v", err)
	}
	if page.Total == 0 || len(page.Items) == 0 {
		t.Fatalf("localized vector search returned no results")
	}
	if page.Items[0].ID != reveal.ID {
		t.Fatalf("first result = %d, want reveal reference %d; other=%d page=%+v", page.Items[0].ID, reveal.ID, other.ID, page)
	}

	page, err = service.List(context.Background(), domainshotreference.ListInput{UserID: 7, Query: "气氛慢慢变紧", Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("localized tension search: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != reveal.ID {
		t.Fatalf("localized tension page = %+v, want only reveal reference", page)
	}
}

func TestDeleteRemovesShotReferenceButKeepsResource(t *testing.T) {
	db := testutil.OpenSQLite(t, "shot-reference-delete.db", &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{}, &model.ShotVectorDocument{})
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
	var vectorCount int64
	if err := db.Model(&model.ShotVectorDocument{}).Where("reference_id = ?", created.ID).Count(&vectorCount).Error; err != nil {
		t.Fatalf("count vector documents: %v", err)
	}
	if vectorCount != 0 {
		t.Fatalf("vector document count = %d, want deleted vectors", vectorCount)
	}
	if err := service.Delete(context.Background(), created.ID, domainshotreference.ListInput{UserID: 7}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second delete error = %v, want not found", err)
	}
}

func TestUploadAndAnalyzeRejectsNonVideoBeforeResourceCreate(t *testing.T) {
	db := testutil.OpenSQLite(t, "shot-reference-invalid.db", &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{}, &model.ShotVectorDocument{})
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
	db := testutil.OpenSQLite(t, "shot-reference-group.db", &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{}, &model.ShotVectorDocument{})
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

func TestCreateGroupThenAppendShotsAndReadDetail(t *testing.T) {
	db := testutil.OpenSQLite(t, "shot-reference-group-detail.db", &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{}, &model.ShotVectorDocument{})
	service := NewService(db, fakeShotStorage{}, nil)

	created, err := service.UploadAndAnalyze(context.Background(), UploadInput{
		UserID:   7,
		Filename: "source_clip.mp4",
		MimeType: "video/mp4",
		Size:     12,
		Data:     []byte("video-bytes"),
	})
	if err != nil {
		t.Fatalf("seed resource: %v", err)
	}

	group, err := service.CreateGroup(context.Background(), CreateGroupInput{
		UserID:      7,
		ResourceID:  created.ResourceID,
		Title:       "复刻镜头组",
		CutStrategy: "scene_detection",
	})
	if err != nil {
		t.Fatalf("create group: %v", err)
	}
	detail, err := service.GetGroupDetail(context.Background(), group.ID, domainshotreference.ListInput{UserID: 7})
	if err != nil {
		t.Fatalf("read empty group detail: %v", err)
	}
	if detail.Info.Title != "复刻镜头组" || detail.Count != 0 || len(detail.Shots) != 0 {
		t.Fatalf("empty group detail = %+v", detail)
	}

	startA := 0.0
	endA := 2.4
	startB := 2.4
	endB := 4.8
	shots, err := service.CreateFromResource(context.Background(), CreateFromResourceInput{
		UserID:     7,
		ResourceID: created.ResourceID,
		GroupID:    &group.ID,
		Shots: []domainshotreference.UpdateInput{
			{Title: strPtr("shot a"), StartSec: &startA, StartSecSet: true, EndSec: &endA, EndSecSet: true},
			{Title: strPtr("shot b"), StartSec: &startB, StartSecSet: true, EndSec: &endB, EndSecSet: true},
		},
	})
	if err != nil {
		t.Fatalf("append shots: %v", err)
	}
	if len(shots) != 2 {
		t.Fatalf("created shots = %d, want 2", len(shots))
	}

	detail, err = service.GetGroupDetail(context.Background(), group.ID, domainshotreference.ListInput{UserID: 7})
	if err != nil {
		t.Fatalf("read populated group detail: %v", err)
	}
	if detail.Count != 2 || len(detail.Shots) != 2 {
		t.Fatalf("populated group detail count = %+v", detail)
	}
	if detail.Shots[0].Title != "shot a" || detail.Shots[1].Title != "shot b" {
		t.Fatalf("shot order = %q, %q", detail.Shots[0].Title, detail.Shots[1].Title)
	}
	if detail.Shots[0].StartSec == nil || *detail.Shots[0].StartSec != startA || detail.Shots[1].EndSec == nil || *detail.Shots[1].EndSec != endB {
		t.Fatalf("shot ranges = %+v", detail.Shots)
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
	db := testutil.OpenSQLite(t, "shot-reference-manual-group-title.db", &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{}, &model.ShotVectorDocument{})
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
	db := testutil.OpenSQLite(t, "shot-reference-manual-fields.db", &model.RawResource{}, &model.ShotReferenceGroup{}, &model.ShotReference{}, &model.ShotVectorDocument{})
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
	vectorResults, err := service.SearchVectorDocuments(context.Background(), domainshotreference.VectorSearchRequest{
		Query:   "extreme_close_up realization",
		Locale:  "zh-CN",
		Filters: map[string][]string{"visual": []string{"extreme_close_up"}},
		TopK:    5,
	})
	if err != nil {
		t.Fatalf("search updated vector documents: %v", err)
	}
	if len(vectorResults) == 0 || vectorResults[0].Document.ReferenceID != created.ID {
		t.Fatalf("updated vector results = %+v, want updated reference", vectorResults)
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

func (fakeShotStorage) Health(context.Context) providercontract.ProviderHealth {
	return providercontract.ProviderHealth{
		Type:     providercontract.TypeBlobStorage,
		Adapter:  "fake",
		Assembly: providercontract.AssemblyStartup,
		Status:   providercontract.HealthStatusOK,
	}
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

package mediastream

import (
	"context"
	"errors"
	"io"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/storage"
	"github.com/movscript/movscript/internal/testutil"
)

func TestMediaStreamUploadPersistsManifestAndSegments(t *testing.T) {
	db := testutil.OpenSQLite(t, "media-stream-artifacts.db", &model.MediaStreamArtifact{}, &model.Project{}, &model.RawResource{})
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	service := NewService(db, store)
	project := model.Project{Name: "Preview Project", OwnerID: 7}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	resource := model.RawResource{OwnerID: 7, Type: "video", Name: "source.mp4", FilePath: "stored:source", StorageBackend: store.Backend(), StorageKey: "source", MimeType: "video/mp4"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create source resource: %v", err)
	}

	artifact, segments, err := service.Upload(context.Background(), UploadInput{
		UserID:           7,
		ProjectID:        uintPtr(project.ID),
		SourceResourceID: uintPtr(resource.ID),
		Title:            "Preview stream",
		ManifestName:     "preview.m3u8",
		ManifestData:     []byte("#EXTM3U\n#EXTINF:1,\nsegment-00000.ts\n"),
		Segments: []SegmentInput{{
			Name: "segment-00000.ts",
			Data: []byte("segment"),
		}},
		DurationMs: 1000,
		Width:      1920,
		Height:     1080,
	})
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if artifact.ID == 0 {
		t.Fatal("artifact ID was not assigned")
	}
	if artifact.OwnerID != 7 || artifact.ProjectID == nil || *artifact.ProjectID != project.ID || artifact.SourceResourceID == nil || *artifact.SourceResourceID != resource.ID {
		t.Fatalf("unexpected artifact ownership/provenance: %#v", artifact)
	}
	if len(segments) != 1 || segments[0].Name != "segment-00000.ts" || segments[0].MimeType != "video/mp2t" {
		t.Fatalf("segments = %#v", segments)
	}

	manifest, err := service.OpenManifest(context.Background(), artifact.ID, 7, nil)
	if err != nil {
		t.Fatalf("open manifest: %v", err)
	}
	manifestBytes, _ := io.ReadAll(manifest.Body)
	_ = manifest.Body.Close()
	if string(manifestBytes) != "#EXTM3U\n#EXTINF:1,\nsegment-00000.ts\n" {
		t.Fatalf("manifest = %q", string(manifestBytes))
	}
	if manifest.ContentType != "application/vnd.apple.mpegurl" {
		t.Fatalf("manifest content type = %q", manifest.ContentType)
	}

	segment, err := service.OpenSegment(context.Background(), artifact.ID, "segment-00000.ts", 7, nil)
	if err != nil {
		t.Fatalf("open segment: %v", err)
	}
	segmentBytes, _ := io.ReadAll(segment.Body)
	_ = segment.Body.Close()
	if string(segmentBytes) != "segment" {
		t.Fatalf("segment = %q", string(segmentBytes))
	}
	if segment.ContentType != "video/mp2t" {
		t.Fatalf("segment content type = %q", segment.ContentType)
	}
}

func TestMediaStreamUploadValidatesProjectSourceAndDerivativeScope(t *testing.T) {
	db := testutil.OpenSQLite(t, "media-stream-artifacts-scope.db", &model.MediaStreamArtifact{}, &model.Project{}, &model.RawResource{}, &model.ResourceDerivative{})
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	service := NewService(db, store)
	orgID := uint(5)
	otherOrgID := uint(6)
	project := model.Project{Name: "Team Project", OwnerID: 7, OrgID: &orgID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	source := model.RawResource{OwnerID: 8, OrgID: &orgID, Type: "video", Name: "team.mp4", FilePath: "stored:team", StorageBackend: store.Backend(), StorageKey: "team", MimeType: "video/mp4"}
	if err := db.Create(&source).Error; err != nil {
		t.Fatalf("create source: %v", err)
	}
	derivative := model.ResourceDerivative{OutputResourceID: source.ID, Operation: "timeline_render", InputResourceIDs: "[]", Params: "{}"}
	if err := db.Create(&derivative).Error; err != nil {
		t.Fatalf("create derivative: %v", err)
	}

	if _, _, err := service.Upload(context.Background(), validUploadInput(7, &orgID, project.ID, source.ID, derivative.ID)); err != nil {
		t.Fatalf("valid upload rejected: %v", err)
	}

	otherProject := model.Project{Name: "Other Project", OwnerID: 9, OrgID: &otherOrgID}
	if err := db.Create(&otherProject).Error; err != nil {
		t.Fatalf("create other project: %v", err)
	}
	if _, _, err := service.Upload(context.Background(), validUploadInput(7, &orgID, otherProject.ID, source.ID, derivative.ID)); !errors.Is(err, ErrForbidden) {
		t.Fatalf("cross-org project err = %v, want ErrForbidden", err)
	}

	otherSource := model.RawResource{OwnerID: 9, OrgID: &otherOrgID, Type: "video", Name: "other.mp4", FilePath: "stored:other", StorageBackend: store.Backend(), StorageKey: "other", MimeType: "video/mp4"}
	if err := db.Create(&otherSource).Error; err != nil {
		t.Fatalf("create other source: %v", err)
	}
	if _, _, err := service.Upload(context.Background(), validUploadInput(7, &orgID, project.ID, otherSource.ID, 0)); !errors.Is(err, ErrForbidden) {
		t.Fatalf("cross-org source err = %v, want ErrForbidden", err)
	}

	otherDerivative := model.ResourceDerivative{OutputResourceID: otherSource.ID, Operation: "timeline_render", InputResourceIDs: "[]", Params: "{}"}
	if err := db.Create(&otherDerivative).Error; err != nil {
		t.Fatalf("create other derivative: %v", err)
	}
	input := validUploadInput(7, &orgID, project.ID, source.ID, otherDerivative.ID)
	if _, _, err := service.Upload(context.Background(), input); !errors.Is(err, ErrInvalidProvenance) {
		t.Fatalf("mismatched derivative err = %v, want ErrInvalidProvenance", err)
	}
}

func TestMediaStreamUploadRejectsManifestReferencesMissingSegments(t *testing.T) {
	db := testutil.OpenSQLite(t, "media-stream-artifacts-invalid.db", &model.MediaStreamArtifact{})
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	service := NewService(db, store)

	_, _, err = service.Upload(context.Background(), UploadInput{
		UserID:       7,
		ManifestName: "preview.m3u8",
		ManifestData: []byte("#EXTM3U\n#EXTINF:1,\nmissing.ts\n"),
		Segments: []SegmentInput{{
			Name: "segment-00000.ts",
			Data: []byte("segment"),
		}},
	})
	if !errors.Is(err, ErrInvalidManifest) {
		t.Fatalf("error = %v, want ErrInvalidManifest", err)
	}
}

func TestMediaStreamUploadAcceptsFmp4InitMapAndSegments(t *testing.T) {
	db := testutil.OpenSQLite(t, "media-stream-artifacts-fmp4.db", &model.MediaStreamArtifact{})
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	service := NewService(db, store)

	artifact, segments, err := service.Upload(context.Background(), UploadInput{
		UserID:       7,
		ManifestName: "preview.m3u8",
		ManifestData: []byte("#EXTM3U\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:1,\nsegment-00000.m4s\n"),
		Segments: []SegmentInput{
			{Name: "init.mp4", Data: []byte("init")},
			{Name: "segment-00000.m4s", Data: []byte("segment")},
		},
	})
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if artifact.ID == 0 {
		t.Fatal("artifact ID was not assigned")
	}
	if len(segments) != 2 || segments[0].Name != "init.mp4" || segments[0].MimeType != "video/mp4" || segments[1].Name != "segment-00000.m4s" || segments[1].MimeType != "video/iso.segment" {
		t.Fatalf("segments = %#v", segments)
	}
	init, err := service.OpenSegment(context.Background(), artifact.ID, "init.mp4", 7, nil)
	if err != nil {
		t.Fatalf("open init: %v", err)
	}
	initBytes, _ := io.ReadAll(init.Body)
	_ = init.Body.Close()
	if string(initBytes) != "init" {
		t.Fatalf("init = %q", string(initBytes))
	}
}

func TestMediaStreamUploadAcceptsVariantPlaylists(t *testing.T) {
	db := testutil.OpenSQLite(t, "media-stream-artifacts-variant-playlists.db", &model.MediaStreamArtifact{})
	baseStore, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	store := directURLStorage{FileSystemStorage: baseStore}
	service := NewService(db, store)

	artifact, segments, err := service.Upload(context.Background(), UploadInput{
		UserID:       7,
		ManifestName: "master.m3u8",
		ManifestData: []byte("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1128000,RESOLUTION=640x360\n360p.m3u8\n"),
		Segments: []SegmentInput{
			{Name: "360p.m3u8", Data: []byte("#EXTM3U\n#EXT-X-MAP:URI=\"360p-init.mp4\"\n#EXTINF:1,\n360p-segment-00000.m4s\n")},
			{Name: "360p-init.mp4", Data: []byte("init")},
			{Name: "360p-segment-00000.m4s", Data: []byte("segment")},
		},
	})
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if len(segments) != 3 || segments[0].Name != "360p.m3u8" || segments[0].MimeType != "application/vnd.apple.mpegurl" {
		t.Fatalf("segments = %#v", segments)
	}
	variant, err := service.OpenSegment(context.Background(), artifact.ID, "360p.m3u8", 7, nil)
	if err != nil {
		t.Fatalf("open variant playlist: %v", err)
	}
	variantBytes, _ := io.ReadAll(variant.Body)
	_ = variant.Body.Close()
	if variant.ContentType != "application/vnd.apple.mpegurl" || !strings.Contains(string(variantBytes), "360p-segment-00000.m4s") {
		t.Fatalf("unexpected variant playlist response: contentType=%q body=%q", variant.ContentType, string(variantBytes))
	}
	presigned, err := service.OpenPresignedManifest(context.Background(), artifact.ID, 7, nil, func(segment SegmentDescriptor) string {
		return "https://app.test/segments/" + segment.Name
	})
	if err != nil {
		t.Fatalf("open presigned manifest: %v", err)
	}
	presignedBytes, _ := io.ReadAll(presigned.Body)
	_ = presigned.Body.Close()
	body := string(presignedBytes)
	if !strings.Contains(body, "https://app.test/segments/360p.m3u8") || strings.Contains(body, "https://cdn.test/") {
		t.Fatalf("master playlist should use backend fallback for child playlists:\n%s", body)
	}
}

func TestMediaStreamUploadRejectsVariantPlaylistMissingSegments(t *testing.T) {
	db := testutil.OpenSQLite(t, "media-stream-artifacts-invalid-variant-playlists.db", &model.MediaStreamArtifact{})
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	service := NewService(db, store)

	_, _, err = service.Upload(context.Background(), UploadInput{
		UserID:       7,
		ManifestName: "master.m3u8",
		ManifestData: []byte("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1128000\n360p.m3u8\n"),
		Segments: []SegmentInput{
			{Name: "360p.m3u8", Data: []byte("#EXTM3U\n#EXTINF:1,\nmissing.m4s\n")},
			{Name: "360p-segment-00000.m4s", Data: []byte("segment")},
		},
	})
	if !errors.Is(err, ErrInvalidManifest) {
		t.Fatalf("error = %v, want ErrInvalidManifest", err)
	}
}

func TestMediaStreamPresignedManifestRewritesInitMapAndSegments(t *testing.T) {
	db := testutil.OpenSQLite(t, "media-stream-artifacts-presigned.db", &model.MediaStreamArtifact{})
	baseStore, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	store := directURLStorage{FileSystemStorage: baseStore}
	service := NewService(db, store)

	artifact, _, err := service.Upload(context.Background(), UploadInput{
		UserID:       7,
		ManifestName: "preview.m3u8",
		ManifestData: []byte("#EXTM3U\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:1,\nsegment-00000.m4s\n"),
		Segments: []SegmentInput{
			{Name: "init.mp4", Data: []byte("init")},
			{Name: "segment-00000.m4s", Data: []byte("segment")},
		},
	})
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	manifest, err := service.OpenPresignedManifest(context.Background(), artifact.ID, 7, nil, nil)
	if err != nil {
		t.Fatalf("open presigned manifest: %v", err)
	}
	data, _ := io.ReadAll(manifest.Body)
	_ = manifest.Body.Close()
	body := string(data)
	if !strings.Contains(body, `#EXT-X-MAP:URI="https://cdn.test/`) || !strings.Contains(body, "https://cdn.test/") || strings.Contains(body, "\nsegment-00000.m4s") {
		t.Fatalf("presigned manifest was not rewritten:\n%s", body)
	}
}

func TestMediaStreamCleanupExpiredDeletesObjectsAndSoftDeletesRecords(t *testing.T) {
	db := testutil.OpenSQLite(t, "media-stream-artifacts-cleanup.db", &model.MediaStreamArtifact{})
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	service := NewService(db, store)
	now := time.Now().UTC()
	expiredAt := now.Add(-time.Minute)
	activeExpiresAt := now.Add(time.Hour)

	expired, _, err := service.Upload(context.Background(), UploadInput{
		UserID:       7,
		ManifestName: "expired.m3u8",
		ManifestData: []byte("#EXTM3U\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:1,\nsegment-00000.m4s\n"),
		Segments: []SegmentInput{
			{Name: "init.mp4", Data: []byte("init")},
			{Name: "segment-00000.m4s", Data: []byte("segment")},
		},
		ExpiresAt: &expiredAt,
	})
	if err != nil {
		t.Fatalf("upload expired: %v", err)
	}
	active, _, err := service.Upload(context.Background(), UploadInput{
		UserID:       7,
		ManifestName: "active.m3u8",
		ManifestData: []byte("#EXTM3U\n#EXTINF:1,\nsegment-00000.ts\n"),
		Segments: []SegmentInput{{
			Name: "segment-00000.ts",
			Data: []byte("segment"),
		}},
		ExpiresAt: &activeExpiresAt,
	})
	if err != nil {
		t.Fatalf("upload active: %v", err)
	}
	if _, err := service.OpenManifest(context.Background(), expired.ID, 7, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired open err = %v, want ErrNotFound", err)
	}

	dryRun, err := service.CleanupExpired(context.Background(), CleanupExpiredInput{Now: now, DryRun: true})
	if err != nil {
		t.Fatalf("dry run cleanup: %v", err)
	}
	if dryRun.Candidates != 1 || dryRun.Deleted != 0 || dryRun.ObjectsDeleted != 0 || dryRun.FreedBytes != int64(len("init")+len("segment")) {
		t.Fatalf("unexpected dry run result: %+v", dryRun)
	}
	object, _, _, err := store.GetObject(context.Background(), expired.ManifestStorageKey, -1, -1)
	if err != nil {
		t.Fatalf("dry run deleted manifest: %v", err)
	}
	_ = object.Close()

	result, err := service.CleanupExpired(context.Background(), CleanupExpiredInput{Now: now})
	if err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	if result.Candidates != 1 || result.Deleted != 1 || result.ObjectsDeleted != 3 || result.FreedBytes != int64(len("init")+len("segment")) {
		t.Fatalf("unexpected cleanup result: %+v", result)
	}
	if object, _, _, err := store.GetObject(context.Background(), expired.ManifestStorageKey, -1, -1); err == nil {
		_ = object.Close()
		t.Fatal("expected expired manifest object to be deleted")
	}
	activeObject, err := service.OpenManifest(context.Background(), active.ID, 7, nil)
	if err != nil {
		t.Fatalf("active manifest should still open: %v", err)
	}
	_ = activeObject.Body.Close()

	var deleted model.MediaStreamArtifact
	if err := db.Unscoped().First(&deleted, expired.ID).Error; err != nil {
		t.Fatalf("load deleted artifact: %v", err)
	}
	if !deleted.DeletedAt.Valid || deleted.Status != "expired" {
		t.Fatalf("expired artifact was not soft deleted with status expired: %#v", deleted)
	}
}

func TestMediaStreamCleanupLoopDeletesExpiredArtifacts(t *testing.T) {
	db := testutil.OpenSQLite(t, "media-stream-artifacts-cleanup-loop.db", &model.MediaStreamArtifact{})
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	service := NewService(db, store)
	now := time.Now().UTC()
	expiredAt := now.Add(-time.Minute)
	expired, _, err := service.Upload(context.Background(), UploadInput{
		UserID:       7,
		ManifestName: "expired.m3u8",
		ManifestData: []byte("#EXTM3U\n#EXTINF:1,\nsegment-00000.ts\n"),
		Segments: []SegmentInput{{
			Name: "segment-00000.ts",
			Data: []byte("segment"),
		}},
		ExpiresAt: &expiredAt,
	})
	if err != nil {
		t.Fatalf("upload expired: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	results := make(chan CleanupExpiredResult, 1)
	go service.RunExpiredCleanupLoop(ctx, CleanupLoopOptions{
		Interval: 5 * time.Millisecond,
		Limit:    10,
		Now:      func() time.Time { return now },
		OnResult: func(result CleanupExpiredResult) {
			select {
			case results <- result:
			default:
			}
		},
	})
	select {
	case result := <-results:
		if result.Deleted != 1 || result.ObjectsDeleted != 2 {
			t.Fatalf("unexpected cleanup loop result: %+v", result)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for cleanup loop")
	}
	if _, err := service.OpenManifest(context.Background(), expired.ID, 7, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired stream should not open after cleanup: %v", err)
	}
}

func uintPtr(value uint) *uint {
	return &value
}

func validUploadInput(userID uint, orgID *uint, projectID uint, sourceResourceID uint, derivativeID uint) UploadInput {
	input := UploadInput{
		UserID:           userID,
		OrgID:            orgID,
		ProjectID:        uintPtr(projectID),
		SourceResourceID: uintPtr(sourceResourceID),
		ManifestName:     "preview.m3u8",
		ManifestData:     []byte("#EXTM3U\n#EXTINF:1,\nsegment-00000.ts\n"),
		Segments: []SegmentInput{{
			Name: "segment-00000.ts",
			Data: []byte("segment"),
		}},
	}
	if derivativeID != 0 {
		input.SourceDerivativeID = uintPtr(derivativeID)
	}
	return input
}

type directURLStorage struct {
	*storage.FileSystemStorage
}

func (s directURLStorage) DirectURL(_ context.Context, key string) (string, error) {
	return "https://cdn.test/" + url.PathEscape(key), nil
}

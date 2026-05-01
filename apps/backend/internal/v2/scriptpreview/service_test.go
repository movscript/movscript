package scriptpreview

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestServiceSaveDraftNormalizesTimeline(t *testing.T) {
	svc := NewService()
	svc.now = func() time.Time {
		return time.Date(2026, 5, 1, 9, 30, 0, 0, time.FixedZone("CST", 8*60*60))
	}

	resp, err := svc.SaveDraft(7, SaveDraftRequest{
		DraftPayload: DraftPayload{
			SourceText: "  A\nB  ",
			ScriptVersion: ScriptVersionDraft{
				Title:      "预演草稿 1",
				SourceType: "script",
			},
			StoryboardRows: []StoryboardRow{
				{Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
				{Title: "反转", Body: "B", DurationSeconds: 5, Status: "需补素材"},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDraft returned error: %v", err)
	}
	if resp.Draft.ProjectID != 7 {
		t.Fatalf("project id = %d, want 7", resp.Draft.ProjectID)
	}
	if len(resp.Draft.PreviewTimeline) != 2 {
		t.Fatalf("timeline len = %d, want 2", len(resp.Draft.PreviewTimeline))
	}
	if got := resp.Draft.PreviewTimeline[1].StartSeconds; got != 8 {
		t.Fatalf("second item start = %v, want 8", got)
	}
	if resp.Status != "draft" {
		t.Fatalf("status = %q, want draft", resp.Status)
	}
}

func TestServiceSaveAndLoadLatestDraftSnapshot(t *testing.T) {
	store := newMemoryDraftStore()
	svc := NewServiceWithStore(store)
	svc.now = func() time.Time {
		return time.Date(2026, 5, 1, 10, 15, 0, 0, time.FixedZone("CST", 8*60*60))
	}

	saved, err := svc.SaveDraft(7, SaveDraftRequest{
		DraftPayload: DraftPayload{
			SourceText: "雨夜巷口，林夏回头。",
			ScriptVersion: ScriptVersionDraft{
				DraftID:    "draft-fixed",
				Title:      "雨夜预演",
				SourceType: "brief",
			},
			StoryboardRows: []StoryboardRow{
				{ClientID: "row-1", Title: "回头", Body: "林夏在雨中回头", DurationSeconds: 9, Status: "可预演"},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDraft returned error: %v", err)
	}

	loaded, err := svc.GetLatestDraft(7)
	if err != nil {
		t.Fatalf("GetLatestDraft returned error: %v", err)
	}
	if !loaded.Found || loaded.Draft == nil {
		t.Fatal("expected latest draft to be found")
	}
	if loaded.Draft.DraftID != saved.DraftID {
		t.Fatalf("draft id = %q, want %q", loaded.Draft.DraftID, saved.DraftID)
	}
	if loaded.Draft.SavedAt != saved.SavedAt {
		t.Fatalf("saved at = %q, want %q", loaded.Draft.SavedAt, saved.SavedAt)
	}
	if loaded.Draft.Draft.SourceText != "雨夜巷口，林夏回头。" {
		t.Fatalf("source text = %q", loaded.Draft.Draft.SourceText)
	}
	if len(loaded.Draft.Draft.StoryboardRows) != 1 {
		t.Fatalf("storyboard row len = %d, want 1", len(loaded.Draft.Draft.StoryboardRows))
	}
	if loaded.Draft.Draft.PreviewTimeline[0].EndSeconds != 9 {
		t.Fatalf("timeline end = %v, want 9", loaded.Draft.Draft.PreviewTimeline[0].EndSeconds)
	}
}

func TestServiceGetLatestDraftReturnsNotFoundShape(t *testing.T) {
	svc := NewServiceWithStore(newMemoryDraftStore())

	resp, err := svc.GetLatestDraft(9)
	if err != nil {
		t.Fatalf("GetLatestDraft returned error: %v", err)
	}
	if resp.Found {
		t.Fatal("expected found=false when project has no draft")
	}
	if resp.Draft != nil {
		t.Fatal("expected draft to be nil when project has no draft")
	}
}

func TestServiceAnalyzeBuildsSuggestions(t *testing.T) {
	svc := NewService()
	resp, err := svc.Analyze(1, AnalyzeRequest{
		DraftID:    "draft-1",
		SourceText: "第一段\n\n第二段",
	})
	if err != nil {
		t.Fatalf("Analyze returned error: %v", err)
	}
	if len(resp.Sections) != 2 {
		t.Fatalf("sections len = %d, want 2", len(resp.Sections))
	}
	if len(resp.Suggestions) != 2 {
		t.Fatalf("suggestions len = %d, want 2", len(resp.Suggestions))
	}
	if resp.Suggestions[0].AdoptionIntent != "append_storyboard_row" {
		t.Fatalf("adoption intent = %q", resp.Suggestions[0].AdoptionIntent)
	}
}

func TestServiceAnalyzePersistsCandidatesIntoDraftSnapshot(t *testing.T) {
	store := newMemoryDraftStore()
	svc := NewServiceWithStore(store)
	svc.now = func() time.Time {
		return time.Date(2026, 5, 1, 11, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	}
	_, err := svc.SaveDraft(1, SaveDraftRequest{
		DraftPayload: DraftPayload{
			SourceText: "第一段",
			ScriptVersion: ScriptVersionDraft{
				DraftID: "draft-1",
				Title:   "候选草稿",
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDraft returned error: %v", err)
	}

	_, err = svc.Analyze(1, AnalyzeRequest{
		DraftID:    "draft-1",
		SourceText: "第一段",
	})
	if err != nil {
		t.Fatalf("Analyze returned error: %v", err)
	}

	loaded, err := svc.GetLatestDraft(1)
	if err != nil {
		t.Fatalf("GetLatestDraft returned error: %v", err)
	}
	if loaded.Draft.Draft.AnalysisCandidates == nil {
		t.Fatal("expected analysis candidates to be restored from draft snapshot")
	}
	if len(loaded.Draft.Draft.AnalysisCandidates.Suggestions) != 1 {
		t.Fatalf("suggestion len = %d, want 1", len(loaded.Draft.Draft.AnalysisCandidates.Suggestions))
	}
}

func TestServiceGeneratePreviewCreatesAssetGaps(t *testing.T) {
	svc := NewService()
	resp, err := svc.GeneratePreview(1, GeneratePreviewRequest{
		DraftID: "draft-1",
		StoryboardRows: []StoryboardRow{
			{ClientID: "01", Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
			{ClientID: "02", Title: "冲突", Body: "B", DurationSeconds: 6, Status: "需补素材"},
		},
	})
	if err != nil {
		t.Fatalf("GeneratePreview returned error: %v", err)
	}
	if len(resp.KeyframeCandidates) != 2 {
		t.Fatalf("candidate len = %d, want 2", len(resp.KeyframeCandidates))
	}
	if len(resp.AssetGaps) != 1 {
		t.Fatalf("asset gap len = %d, want 1", len(resp.AssetGaps))
	}
	if resp.PreviewTimeline[1].Status != "needs_asset" {
		t.Fatalf("second timeline status = %q", resp.PreviewTimeline[1].Status)
	}
}

func TestServiceGeneratePreviewPersistsCandidatesIntoDraftSnapshot(t *testing.T) {
	store := newMemoryDraftStore()
	svc := NewServiceWithStore(store)
	svc.now = func() time.Time {
		return time.Date(2026, 5, 1, 11, 30, 0, 0, time.FixedZone("CST", 8*60*60))
	}
	_, err := svc.SaveDraft(1, SaveDraftRequest{
		DraftPayload: DraftPayload{
			SourceText: "第一段",
			ScriptVersion: ScriptVersionDraft{
				DraftID: "draft-1",
				Title:   "预演草稿",
			},
			StoryboardRows: []StoryboardRow{
				{ClientID: "01", Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDraft returned error: %v", err)
	}

	_, err = svc.GeneratePreview(1, GeneratePreviewRequest{
		DraftID: "draft-1",
		StoryboardRows: []StoryboardRow{
			{ClientID: "01", Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
		},
	})
	if err != nil {
		t.Fatalf("GeneratePreview returned error: %v", err)
	}

	loaded, err := svc.GetLatestDraft(1)
	if err != nil {
		t.Fatalf("GetLatestDraft returned error: %v", err)
	}
	if loaded.Draft.Draft.PreviewCandidates == nil {
		t.Fatal("expected preview candidates to be restored from draft snapshot")
	}
	if len(loaded.Draft.Draft.PreviewCandidates.KeyframeCandidates) != 1 {
		t.Fatalf("keyframe candidate len = %d, want 1", len(loaded.Draft.Draft.PreviewCandidates.KeyframeCandidates))
	}
	if loaded.Draft.Draft.PreviewTimeline[0].EndSeconds != 8 {
		t.Fatalf("timeline end = %v, want 8", loaded.Draft.Draft.PreviewTimeline[0].EndSeconds)
	}
}

type memoryDraftStore struct {
	snapshots map[uint]map[string]DraftSnapshot
}

func newMemoryDraftStore() *memoryDraftStore {
	return &memoryDraftStore{snapshots: map[uint]map[string]DraftSnapshot{}}
}

func (s *memoryDraftStore) SaveDraftSnapshot(_ context.Context, snapshot DraftSnapshot) error {
	if s.snapshots[snapshot.ProjectID] == nil {
		s.snapshots[snapshot.ProjectID] = map[string]DraftSnapshot{}
	}
	s.snapshots[snapshot.ProjectID][snapshot.DraftID] = snapshot
	return nil
}

func (s *memoryDraftStore) GetDraftSnapshot(_ context.Context, projectID uint, draftID string) (DraftSnapshot, error) {
	snapshots := s.snapshots[projectID]
	if snapshots == nil {
		return DraftSnapshot{}, ErrDraftNotFound
	}
	snapshot, ok := snapshots[draftID]
	if !ok {
		return DraftSnapshot{}, ErrDraftNotFound
	}
	if snapshot.SnapshotJSON == "bad-json" {
		return DraftSnapshot{}, errors.New("bad fixture")
	}
	return snapshot, nil
}

func (s *memoryDraftStore) GetLatestDraftSnapshot(_ context.Context, projectID uint) (DraftSnapshot, error) {
	snapshots := s.snapshots[projectID]
	if len(snapshots) == 0 {
		return DraftSnapshot{}, ErrDraftNotFound
	}
	var snapshot DraftSnapshot
	for _, item := range snapshots {
		snapshot = item
	}
	if snapshot.SnapshotJSON == "bad-json" {
		return DraftSnapshot{}, errors.New("bad fixture")
	}
	return snapshot, nil
}

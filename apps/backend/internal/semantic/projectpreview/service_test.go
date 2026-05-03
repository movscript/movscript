package projectpreview

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

func analysisRequest(draftID string, texts ...string) AnalyzeRequest {
	req := AnalyzeRequest{
		DraftID:     draftID,
		GeneratedAt: time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC).Format(time.RFC3339),
		Status:      "succeeded",
	}
	for i, text := range texts {
		order := i + 1
		segmentID := fmt.Sprintf("segment-%03d", order)
		question := fmt.Sprintf("第 %d 段的情绪转折是否需要用户确认？", order)
		req.Segments = append(req.Segments, SegmentResult{
			ClientID:        segmentID,
			Order:           order,
			Title:           text,
			Summary:         text,
			SourceRange:     fmt.Sprintf("line:%d", order),
			Confidence:      0.78,
			ConfirmQuestion: question,
		})
		req.ConfirmQuestions = append(req.ConfirmQuestions, question)
		req.Suggestions = append(req.Suggestions, StoryboardSuggestion{
			ClientID:        fmt.Sprintf("suggestion-%03d", order),
			SourceSegmentID: segmentID,
			Order:           order,
			Title:           text,
			Body:            text,
			DurationSeconds: 8,
			Status:          "待确认",
			AdoptionIntent:  "append_storyboard_row",
			AdoptionStatus:  "pending",
		})
	}
	return req
}

func previewRequest(draftID string, rows []StoryboardRow) GeneratePreviewRequest {
	req := GeneratePreviewRequest{
		DraftID:        draftID,
		StoryboardRows: rows,
		GeneratedAt:    time.Date(2026, 5, 1, 10, 30, 0, 0, time.UTC).Format(time.RFC3339),
		Status:         "succeeded",
	}
	var cursor float64
	for i, row := range rows {
		order := i + 1
		candidateID := fmt.Sprintf("keyframe-%03d", order)
		status := "候选"
		timelineStatus := "draft"
		if row.Status == "需补素材" {
			status = "待补素材"
			timelineStatus = "needs_asset"
			req.AssetGaps = append(req.AssetGaps, AssetGap{
				ClientID:              fmt.Sprintf("asset-gap-%03d", order),
				StoryboardRowClientID: row.ClientID,
				Name:                  fmt.Sprintf("第 %d 段参考素材", order),
				Description:           row.Title,
				Priority:              "normal",
				Status:                "missing",
			})
		}
		if row.Status == "可预演" {
			timelineStatus = "playable"
		}
		req.KeyframeCandidates = append(req.KeyframeCandidates, KeyframeCandidate{
			ClientID:       candidateID,
			StoryboardRow:  row.ClientID,
			Prompt:         fmt.Sprintf("外部生成关键帧：%s", row.Body),
			VisualAnchor:   row.Title,
			Status:         status,
			DecisionStatus: "pending",
		})
		req.PreviewTimeline = append(req.PreviewTimeline, PreviewTimelineItem{
			ClientID:                  fmt.Sprintf("timeline-%03d", order),
			StoryboardRowClientID:     row.ClientID,
			KeyframeCandidateClientID: candidateID,
			Order:                     order,
			StartSeconds:              cursor,
			DurationSeconds:           row.DurationSeconds,
			EndSeconds:                cursor + row.DurationSeconds,
			Label:                     row.Title,
			Status:                    timelineStatus,
			ConfirmationStatus:        "pending",
		})
		cursor += row.DurationSeconds
	}
	return req
}

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

func TestServiceAnalyzeStoresProvidedSuggestions(t *testing.T) {
	svc := NewService()
	resp, err := svc.Analyze(1, analysisRequest("draft-1", "第一段", "第二段"))
	if err != nil {
		t.Fatalf("Analyze returned error: %v", err)
	}
	if len(resp.Segments) != 2 {
		t.Fatalf("segments len = %d, want 2", len(resp.Segments))
	}
	if len(resp.Suggestions) != 2 {
		t.Fatalf("suggestions len = %d, want 2", len(resp.Suggestions))
	}
	if resp.Suggestions[0].AdoptionIntent != "append_storyboard_row" {
		t.Fatalf("adoption intent = %q", resp.Suggestions[0].AdoptionIntent)
	}
}

func TestServiceAnalyzeRejectsMissingCandidates(t *testing.T) {
	svc := NewService()
	_, err := svc.Analyze(1, AnalyzeRequest{
		DraftID:    "draft-1",
		SourceText: "第一段",
	})
	if err == nil {
		t.Fatal("expected Analyze to require externally provided candidates")
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

	_, err = svc.Analyze(1, analysisRequest("draft-1", "第一段"))
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

func TestServiceGeneratePreviewStoresProvidedAssetGaps(t *testing.T) {
	svc := NewService()
	resp, err := svc.GeneratePreview(1, previewRequest("draft-1", []StoryboardRow{
		{ClientID: "01", Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
		{ClientID: "02", Title: "冲突", Body: "B", DurationSeconds: 6, Status: "需补素材"},
	}))
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

func TestServiceGeneratePreviewRejectsMissingCandidates(t *testing.T) {
	svc := NewService()
	_, err := svc.GeneratePreview(1, GeneratePreviewRequest{
		DraftID: "draft-1",
		StoryboardRows: []StoryboardRow{
			{ClientID: "01", Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
		},
	})
	if err == nil {
		t.Fatal("expected GeneratePreview to require externally provided candidates")
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

	_, err = svc.GeneratePreview(1, previewRequest("draft-1", []StoryboardRow{
		{ClientID: "01", Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
	}))
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

func TestServiceAcceptStoryboardSuggestionPersistsDecisionAndRows(t *testing.T) {
	store := newMemoryDraftStore()
	svc := NewServiceWithStore(store)
	svc.now = func() time.Time {
		return time.Date(2026, 5, 1, 12, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	}
	_, err := svc.SaveDraft(1, SaveDraftRequest{
		DraftPayload: DraftPayload{
			SourceText: "第一段",
			ScriptVersion: ScriptVersionDraft{
				DraftID: "draft-1",
				Title:   "采纳草稿",
			},
			StoryboardRows: []StoryboardRow{
				{ClientID: "01", Title: "已有片段", Body: "A", DurationSeconds: 8, Status: "待确认"},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDraft returned error: %v", err)
	}
	_, err = svc.Analyze(1, analysisRequest("draft-1", "新增建议"))
	if err != nil {
		t.Fatalf("Analyze returned error: %v", err)
	}

	resp, err := svc.AcceptStoryboardSuggestion(1, StoryboardSuggestionDecisionRequest{
		DraftID:            "draft-1",
		SuggestionClientID: "suggestion-001",
	})
	if err != nil {
		t.Fatalf("AcceptStoryboardSuggestion returned error: %v", err)
	}
	if len(resp.Draft.StoryboardRows) != 2 {
		t.Fatalf("storyboard row len = %d, want 2", len(resp.Draft.StoryboardRows))
	}
	if resp.Draft.StoryboardRows[1].Title != "新增建议" {
		t.Fatalf("accepted row title = %q", resp.Draft.StoryboardRows[1].Title)
	}
	if got := resp.Draft.AnalysisCandidates.Suggestions[0].AdoptionStatus; got != "accepted" {
		t.Fatalf("adoption status = %q, want accepted", got)
	}

	loaded, err := svc.GetLatestDraft(1)
	if err != nil {
		t.Fatalf("GetLatestDraft returned error: %v", err)
	}
	if len(loaded.Draft.Draft.StoryboardRows) != 2 {
		t.Fatalf("loaded storyboard row len = %d, want 2", len(loaded.Draft.Draft.StoryboardRows))
	}
	if got := loaded.Draft.Draft.AnalysisCandidates.Suggestions[0].AdoptionStatus; got != "accepted" {
		t.Fatalf("loaded adoption status = %q, want accepted", got)
	}
}

func TestServiceRejectStoryboardSuggestionPersistsDecisionWithoutAppending(t *testing.T) {
	store := newMemoryDraftStore()
	svc := NewServiceWithStore(store)
	_, err := svc.SaveDraft(1, SaveDraftRequest{
		DraftPayload: DraftPayload{
			SourceText: "第一段",
			ScriptVersion: ScriptVersionDraft{
				DraftID: "draft-1",
				Title:   "拒绝草稿",
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDraft returned error: %v", err)
	}
	_, err = svc.Analyze(1, analysisRequest("draft-1", "不采用建议"))
	if err != nil {
		t.Fatalf("Analyze returned error: %v", err)
	}

	resp, err := svc.RejectStoryboardSuggestion(1, StoryboardSuggestionDecisionRequest{
		DraftID:            "draft-1",
		SuggestionClientID: "suggestion-001",
	})
	if err != nil {
		t.Fatalf("RejectStoryboardSuggestion returned error: %v", err)
	}
	if len(resp.Draft.StoryboardRows) != 0 {
		t.Fatalf("storyboard row len = %d, want 0", len(resp.Draft.StoryboardRows))
	}
	if got := resp.Draft.AnalysisCandidates.Suggestions[0].AdoptionStatus; got != "rejected" {
		t.Fatalf("adoption status = %q, want rejected", got)
	}

	_, err = svc.AcceptStoryboardSuggestion(1, StoryboardSuggestionDecisionRequest{
		DraftID:            "draft-1",
		SuggestionClientID: "suggestion-001",
	})
	if err == nil {
		t.Fatal("expected accepting a rejected suggestion to fail")
	}
}

func TestServiceAcceptKeyframeCandidatePersistsDecisionAndTimeline(t *testing.T) {
	store := newMemoryDraftStore()
	svc := NewServiceWithStore(store)
	_, err := svc.SaveDraft(1, SaveDraftRequest{
		DraftPayload: DraftPayload{
			SourceText: "第一段",
			ScriptVersion: ScriptVersionDraft{
				DraftID: "draft-1",
				Title:   "关键帧草稿",
			},
			StoryboardRows: []StoryboardRow{
				{ClientID: "01", Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDraft returned error: %v", err)
	}
	_, err = svc.GeneratePreview(1, previewRequest("draft-1", []StoryboardRow{
		{ClientID: "01", Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
	}))
	if err != nil {
		t.Fatalf("GeneratePreview returned error: %v", err)
	}

	resp, err := svc.AcceptKeyframeCandidate(1, KeyframeCandidateDecisionRequest{
		DraftID:                   "draft-1",
		KeyframeCandidateClientID: "keyframe-001",
	})
	if err != nil {
		t.Fatalf("AcceptKeyframeCandidate returned error: %v", err)
	}
	if got := resp.Draft.PreviewCandidates.KeyframeCandidates[0].DecisionStatus; got != "accepted" {
		t.Fatalf("decision status = %q, want accepted", got)
	}
	if got := resp.Draft.PreviewCandidates.PreviewTimeline[0].ConfirmationStatus; got != "accepted" {
		t.Fatalf("timeline confirmation status = %q, want accepted", got)
	}

	loaded, err := svc.GetLatestDraft(1)
	if err != nil {
		t.Fatalf("GetLatestDraft returned error: %v", err)
	}
	if got := loaded.Draft.Draft.PreviewCandidates.KeyframeCandidates[0].DecisionStatus; got != "accepted" {
		t.Fatalf("loaded decision status = %q, want accepted", got)
	}
}

func TestServiceRejectKeyframeCandidatePersistsDecision(t *testing.T) {
	store := newMemoryDraftStore()
	svc := NewServiceWithStore(store)
	_, err := svc.SaveDraft(1, SaveDraftRequest{
		DraftPayload: DraftPayload{
			SourceText: "第一段",
			ScriptVersion: ScriptVersionDraft{
				DraftID: "draft-1",
				Title:   "关键帧拒绝草稿",
			},
			StoryboardRows: []StoryboardRow{
				{ClientID: "01", Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDraft returned error: %v", err)
	}
	_, err = svc.GeneratePreview(1, previewRequest("draft-1", []StoryboardRow{
		{ClientID: "01", Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
	}))
	if err != nil {
		t.Fatalf("GeneratePreview returned error: %v", err)
	}

	resp, err := svc.RejectKeyframeCandidate(1, KeyframeCandidateDecisionRequest{
		DraftID:                   "draft-1",
		KeyframeCandidateClientID: "keyframe-001",
	})
	if err != nil {
		t.Fatalf("RejectKeyframeCandidate returned error: %v", err)
	}
	if got := resp.Draft.PreviewCandidates.KeyframeCandidates[0].DecisionStatus; got != "rejected" {
		t.Fatalf("decision status = %q, want rejected", got)
	}
	if got := resp.Draft.PreviewCandidates.PreviewTimeline[0].ConfirmationStatus; got != "rejected" {
		t.Fatalf("timeline confirmation status = %q, want rejected", got)
	}

	_, err = svc.AcceptKeyframeCandidate(1, KeyframeCandidateDecisionRequest{
		DraftID:                   "draft-1",
		KeyframeCandidateClientID: "keyframe-001",
	})
	if err == nil {
		t.Fatal("expected accepting a rejected keyframe candidate to fail")
	}
}

func TestServiceAcceptAndResolveAssetGapPersistsStatus(t *testing.T) {
	store := newMemoryDraftStore()
	svc := NewServiceWithStore(store)
	_, err := svc.SaveDraft(1, SaveDraftRequest{
		DraftPayload: DraftPayload{
			SourceText: "第一段",
			ScriptVersion: ScriptVersionDraft{
				DraftID: "draft-1",
				Title:   "素材草稿",
			},
			StoryboardRows: []StoryboardRow{
				{ClientID: "01", Title: "需要素材", Body: "A", DurationSeconds: 8, Status: "需补素材"},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDraft returned error: %v", err)
	}
	_, err = svc.GeneratePreview(1, previewRequest("draft-1", []StoryboardRow{
		{ClientID: "01", Title: "需要素材", Body: "A", DurationSeconds: 8, Status: "需补素材"},
	}))
	if err != nil {
		t.Fatalf("GeneratePreview returned error: %v", err)
	}

	accepted, err := svc.AcceptAssetGap(1, AssetGapDecisionRequest{
		DraftID:          "draft-1",
		AssetGapClientID: "asset-gap-001",
	})
	if err != nil {
		t.Fatalf("AcceptAssetGap returned error: %v", err)
	}
	if got := accepted.Draft.PreviewCandidates.AssetGaps[0].Status; got != "accepted" {
		t.Fatalf("asset gap status = %q, want accepted", got)
	}

	resolved, err := svc.ResolveAssetGap(1, AssetGapDecisionRequest{
		DraftID:          "draft-1",
		AssetGapClientID: "asset-gap-001",
	})
	if err != nil {
		t.Fatalf("ResolveAssetGap returned error: %v", err)
	}
	if got := resolved.Draft.PreviewCandidates.AssetGaps[0].Status; got != "resolved" {
		t.Fatalf("asset gap status = %q, want resolved", got)
	}

	loaded, err := svc.GetLatestDraft(1)
	if err != nil {
		t.Fatalf("GetLatestDraft returned error: %v", err)
	}
	if got := loaded.Draft.Draft.PreviewCandidates.AssetGaps[0].Status; got != "resolved" {
		t.Fatalf("loaded asset gap status = %q, want resolved", got)
	}
}

func TestServiceRejectAssetGapPersistsStatusAndBlocksResolve(t *testing.T) {
	store := newMemoryDraftStore()
	svc := NewServiceWithStore(store)
	_, err := svc.SaveDraft(1, SaveDraftRequest{
		DraftPayload: DraftPayload{
			SourceText: "第一段",
			ScriptVersion: ScriptVersionDraft{
				DraftID: "draft-1",
				Title:   "素材拒绝草稿",
			},
			StoryboardRows: []StoryboardRow{
				{ClientID: "01", Title: "需要素材", Body: "A", DurationSeconds: 8, Status: "需补素材"},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDraft returned error: %v", err)
	}
	_, err = svc.GeneratePreview(1, previewRequest("draft-1", []StoryboardRow{
		{ClientID: "01", Title: "需要素材", Body: "A", DurationSeconds: 8, Status: "需补素材"},
	}))
	if err != nil {
		t.Fatalf("GeneratePreview returned error: %v", err)
	}

	resp, err := svc.RejectAssetGap(1, AssetGapDecisionRequest{
		DraftID:          "draft-1",
		AssetGapClientID: "asset-gap-001",
	})
	if err != nil {
		t.Fatalf("RejectAssetGap returned error: %v", err)
	}
	if got := resp.Draft.PreviewCandidates.AssetGaps[0].Status; got != "rejected" {
		t.Fatalf("asset gap status = %q, want rejected", got)
	}

	_, err = svc.ResolveAssetGap(1, AssetGapDecisionRequest{
		DraftID:          "draft-1",
		AssetGapClientID: "asset-gap-001",
	})
	if err == nil {
		t.Fatal("expected resolving a rejected asset gap to fail")
	}
}

func TestServiceConfirmPreviewPersistsPreviewState(t *testing.T) {
	store := newMemoryDraftStore()
	svc := NewServiceWithStore(store)
	svc.now = func() time.Time {
		return time.Date(2026, 5, 1, 13, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	}
	_, err := svc.SaveDraft(1, SaveDraftRequest{
		DraftPayload: DraftPayload{
			SourceText: "第一段",
			ScriptVersion: ScriptVersionDraft{
				DraftID: "draft-1",
				Title:   "预演确认草稿",
			},
			StoryboardRows: []StoryboardRow{
				{ClientID: "01", Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDraft returned error: %v", err)
	}
	_, err = svc.GeneratePreview(1, previewRequest("draft-1", []StoryboardRow{
		{ClientID: "01", Title: "开场", Body: "A", DurationSeconds: 8, Status: "可预演"},
	}))
	if err != nil {
		t.Fatalf("GeneratePreview returned error: %v", err)
	}
	_, err = svc.AcceptKeyframeCandidate(1, KeyframeCandidateDecisionRequest{
		DraftID:                   "draft-1",
		KeyframeCandidateClientID: "keyframe-001",
	})
	if err != nil {
		t.Fatalf("AcceptKeyframeCandidate returned error: %v", err)
	}

	resp, err := svc.ConfirmPreview(1, ConfirmPreviewRequest{DraftID: "draft-1"})
	if err != nil {
		t.Fatalf("ConfirmPreview returned error: %v", err)
	}
	if got := resp.Draft.PreviewStatus; got != "ready_for_production" {
		t.Fatalf("preview status = %q, want ready_for_production", got)
	}
	if resp.Draft.ConfirmedAt == "" {
		t.Fatal("expected confirmed_at to be recorded")
	}

	loaded, err := svc.GetLatestDraft(1)
	if err != nil {
		t.Fatalf("GetLatestDraft returned error: %v", err)
	}
	if got := loaded.Draft.Draft.PreviewStatus; got != "ready_for_production" {
		t.Fatalf("loaded preview status = %q, want ready_for_production", got)
	}
	if loaded.Draft.Draft.ConfirmedAt == "" {
		t.Fatal("expected confirmed_at to be restored")
	}
}

func TestServiceConfirmPreviewRejectsBlockedDraft(t *testing.T) {
	svc := NewServiceWithStore(newMemoryDraftStore())
	_, err := svc.SaveDraft(1, SaveDraftRequest{
		DraftPayload: DraftPayload{
			SourceText: "第一段",
			ScriptVersion: ScriptVersionDraft{
				DraftID: "draft-1",
				Title:   "阻塞草稿",
			},
			StoryboardRows: []StoryboardRow{
				{ClientID: "01", Title: "需要素材", Body: "A", DurationSeconds: 8, Status: "需补素材"},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDraft returned error: %v", err)
	}
	_, err = svc.GeneratePreview(1, previewRequest("draft-1", []StoryboardRow{
		{ClientID: "01", Title: "需要素材", Body: "A", DurationSeconds: 8, Status: "需补素材"},
	}))
	if err != nil {
		t.Fatalf("GeneratePreview returned error: %v", err)
	}

	_, err = svc.ConfirmPreview(1, ConfirmPreviewRequest{DraftID: "draft-1"})
	if err == nil {
		t.Fatal("expected preview confirmation to fail while asset gaps are blocking")
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

func (s *memoryDraftStore) GetLatestDraftSnapshotForProduction(_ context.Context, projectID uint, productionID uint) (DraftSnapshot, error) {
	snapshots := s.snapshots[projectID]
	if len(snapshots) == 0 {
		return DraftSnapshot{}, ErrDraftNotFound
	}
	var snapshot DraftSnapshot
	for _, item := range snapshots {
		if item.ProductionID != nil && *item.ProductionID == productionID {
			snapshot = item
		}
	}
	if snapshot.DraftID == "" {
		return DraftSnapshot{}, ErrDraftNotFound
	}
	if snapshot.SnapshotJSON == "bad-json" {
		return DraftSnapshot{}, errors.New("bad fixture")
	}
	return snapshot, nil
}

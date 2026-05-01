package scriptpreview

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type Service struct {
	now   func() time.Time
	store DraftStore
}

func NewService() *Service {
	return &Service{now: time.Now}
}

func NewServiceWithStore(store DraftStore) *Service {
	return &Service{now: time.Now, store: store}
}

type DraftPayload struct {
	SourceText         string                `json:"source_text"`
	ScriptVersionID    *uint                 `json:"script_version_id,omitempty"`
	ScriptVersion      ScriptVersionDraft    `json:"script_version"`
	StoryboardRows     []StoryboardRow       `json:"storyboard_rows"`
	PreviewTimeline    []PreviewTimelineIn   `json:"preview_timeline"`
	PreviewStatus      string                `json:"preview_status,omitempty"`
	ConfirmedAt        string                `json:"confirmed_at,omitempty"`
	AnalysisCandidates *AnalysisCandidates   `json:"analysis_candidates,omitempty"`
	PreviewCandidates  *PreviewCandidateData `json:"preview_candidates,omitempty"`
}

type ScriptVersionDraft struct {
	DraftID    string `json:"draft_id"`
	Title      string `json:"title"`
	SourceType string `json:"source_type"`
}

type StoryboardRow struct {
	ClientID        string  `json:"client_id"`
	Order           int     `json:"order"`
	Title           string  `json:"title"`
	Body            string  `json:"body"`
	DurationSeconds float64 `json:"duration_seconds"`
	Status          string  `json:"status"`
}

type PreviewTimelineIn struct {
	ClientID        string  `json:"client_id"`
	Order           int     `json:"order"`
	StartSeconds    float64 `json:"start_seconds"`
	EndSeconds      float64 `json:"end_seconds"`
	DurationSeconds float64 `json:"duration_seconds"`
}

type SaveDraftRequest struct {
	DraftPayload
}

type GetLatestDraftResponse struct {
	Found bool               `json:"found"`
	Draft *SaveDraftResponse `json:"draft,omitempty"`
}

type SaveDraftResponse struct {
	DraftID              string               `json:"draft_id"`
	ScriptVersionID      *uint                `json:"script_version_id"`
	StoryboardRevisionID string               `json:"storyboard_revision_id"`
	PreviewTimelineID    string               `json:"preview_timeline_id"`
	SavedAt              string               `json:"saved_at"`
	Status               string               `json:"status"`
	NextActions          []string             `json:"next_actions"`
	Draft                DraftPayloadResponse `json:"draft"`
}

type DraftPayloadResponse struct {
	ProjectID          uint                  `json:"project_id"`
	SourceText         string                `json:"source_text"`
	ScriptVersionID    *uint                 `json:"script_version_id,omitempty"`
	ScriptVersion      ScriptVersionDraft    `json:"script_version"`
	StoryboardRows     []StoryboardRow       `json:"storyboard_rows"`
	PreviewTimeline    []PreviewTimelineIn   `json:"preview_timeline"`
	PreviewStatus      string                `json:"preview_status,omitempty"`
	ConfirmedAt        string                `json:"confirmed_at,omitempty"`
	AnalysisCandidates *AnalysisCandidates   `json:"analysis_candidates,omitempty"`
	PreviewCandidates  *PreviewCandidateData `json:"preview_candidates,omitempty"`
}

type AnalyzeRequest struct {
	DraftID        string          `json:"draft_id"`
	SourceText     string          `json:"source_text"`
	StoryboardRows []StoryboardRow `json:"storyboard_rows"`
}

type AnalyzeResponse struct {
	DraftID          string                 `json:"draft_id"`
	GeneratedAt      string                 `json:"generated_at"`
	Sections         []ScriptSectionResult  `json:"sections"`
	ConfirmQuestions []string               `json:"confirm_questions"`
	Suggestions      []StoryboardSuggestion `json:"storyboard_suggestions"`
	Status           string                 `json:"status"`
}

type AnalysisCandidates struct {
	GeneratedAt      string                 `json:"generated_at"`
	Sections         []ScriptSectionResult  `json:"sections"`
	ConfirmQuestions []string               `json:"confirm_questions"`
	Suggestions      []StoryboardSuggestion `json:"storyboard_suggestions"`
	Status           string                 `json:"status"`
}

type ScriptSectionResult struct {
	ClientID        string  `json:"client_id"`
	Order           int     `json:"order"`
	Title           string  `json:"title"`
	Summary         string  `json:"summary"`
	SourceRange     string  `json:"source_range"`
	Confidence      float64 `json:"confidence"`
	ConfirmQuestion string  `json:"confirm_question"`
}

type StoryboardSuggestion struct {
	ClientID        string  `json:"client_id"`
	SourceSectionID string  `json:"source_section_id"`
	Order           int     `json:"order"`
	Title           string  `json:"title"`
	Body            string  `json:"body"`
	DurationSeconds float64 `json:"duration_seconds"`
	Status          string  `json:"status"`
	AdoptionIntent  string  `json:"adoption_intent"`
	AdoptionStatus  string  `json:"adoption_status,omitempty"`
}

type StoryboardSuggestionDecisionRequest struct {
	DraftID            string `json:"draft_id"`
	SuggestionClientID string `json:"suggestion_client_id"`
}

type GeneratePreviewRequest struct {
	DraftID        string          `json:"draft_id"`
	StoryboardRows []StoryboardRow `json:"storyboard_rows"`
}

type GeneratePreviewResponse struct {
	DraftID            string                `json:"draft_id"`
	GeneratedAt        string                `json:"generated_at"`
	KeyframeCandidates []KeyframeCandidate   `json:"keyframe_candidates"`
	PreviewTimeline    []PreviewTimelineItem `json:"preview_timeline"`
	AssetGaps          []AssetGap            `json:"asset_gaps"`
	Status             string                `json:"status"`
}

type ConfirmPreviewRequest struct {
	DraftID string `json:"draft_id"`
}

type PreviewCandidateData struct {
	GeneratedAt        string                `json:"generated_at"`
	KeyframeCandidates []KeyframeCandidate   `json:"keyframe_candidates"`
	PreviewTimeline    []PreviewTimelineItem `json:"preview_timeline"`
	AssetGaps          []AssetGap            `json:"asset_gaps"`
	Status             string                `json:"status"`
}

type KeyframeCandidate struct {
	ClientID       string `json:"client_id"`
	StoryboardRow  string `json:"storyboard_row_client_id"`
	Prompt         string `json:"prompt"`
	VisualAnchor   string `json:"visual_anchor"`
	Status         string `json:"status"`
	DecisionStatus string `json:"decision_status,omitempty"`
}

type PreviewTimelineItem struct {
	ClientID                  string  `json:"client_id"`
	StoryboardRowClientID     string  `json:"storyboard_row_client_id"`
	KeyframeCandidateClientID string  `json:"keyframe_candidate_client_id,omitempty"`
	Order                     int     `json:"order"`
	StartSeconds              float64 `json:"start_seconds"`
	DurationSeconds           float64 `json:"duration_seconds"`
	EndSeconds                float64 `json:"end_seconds"`
	Label                     string  `json:"label"`
	Status                    string  `json:"status"`
	ConfirmationStatus        string  `json:"confirmation_status,omitempty"`
}

type AssetGap struct {
	ClientID              string `json:"client_id"`
	StoryboardRowClientID string `json:"storyboard_row_client_id"`
	Name                  string `json:"name"`
	Description           string `json:"description"`
	Priority              string `json:"priority"`
	Status                string `json:"status"`
}

type KeyframeCandidateDecisionRequest struct {
	DraftID                   string `json:"draft_id"`
	KeyframeCandidateClientID string `json:"keyframe_candidate_client_id"`
}

type AssetGapDecisionRequest struct {
	DraftID          string `json:"draft_id"`
	AssetGapClientID string `json:"asset_gap_client_id"`
}

func (s *Service) SaveDraft(projectID uint, req SaveDraftRequest) (SaveDraftResponse, error) {
	return s.SaveDraftWithContext(context.Background(), projectID, req)
}

func (s *Service) SaveDraftWithContext(ctx context.Context, projectID uint, req SaveDraftRequest) (SaveDraftResponse, error) {
	if projectID == 0 {
		return SaveDraftResponse{}, fmt.Errorf("project id is required")
	}
	req.SourceText = strings.TrimSpace(req.SourceText)
	req.ScriptVersion.Title = fallback(req.ScriptVersion.Title, "预演草稿")
	req.ScriptVersion.SourceType = fallback(req.ScriptVersion.SourceType, "script")
	if req.ScriptVersion.DraftID == "" {
		req.ScriptVersion.DraftID = fmt.Sprintf("draft-%d", s.now().Unix())
	}
	req.StoryboardRows = normalizeRows(req.StoryboardRows)
	if len(req.PreviewTimeline) == 0 {
		req.PreviewTimeline = buildTimelineInput(req.StoryboardRows)
	}
	savedAt := s.now().Format(time.RFC3339)

	resp := SaveDraftResponse{
		DraftID:              req.ScriptVersion.DraftID,
		ScriptVersionID:      req.ScriptVersionID,
		StoryboardRevisionID: fmt.Sprintf("%s-storyboard", req.ScriptVersion.DraftID),
		PreviewTimelineID:    fmt.Sprintf("%s-preview", req.ScriptVersion.DraftID),
		SavedAt:              savedAt,
		Status:               "draft",
		NextActions:          []string{"analyze_script_to_sections", "generate_keyframes_for_preview"},
		Draft: DraftPayloadResponse{
			ProjectID:          projectID,
			SourceText:         req.SourceText,
			ScriptVersionID:    req.ScriptVersionID,
			ScriptVersion:      req.ScriptVersion,
			StoryboardRows:     req.StoryboardRows,
			PreviewTimeline:    req.PreviewTimeline,
			PreviewStatus:      fallback(req.PreviewStatus, "draft"),
			ConfirmedAt:        req.ConfirmedAt,
			AnalysisCandidates: req.AnalysisCandidates,
			PreviewCandidates:  req.PreviewCandidates,
		},
	}
	if s.store != nil {
		snapshotJSON, err := json.Marshal(resp.Draft)
		if err != nil {
			return SaveDraftResponse{}, fmt.Errorf("encode draft snapshot: %w", err)
		}
		if err := s.store.SaveDraftSnapshot(ctx, DraftSnapshot{
			ProjectID:            projectID,
			ScriptVersionID:      resp.ScriptVersionID,
			DraftID:              resp.DraftID,
			Title:                resp.Draft.ScriptVersion.Title,
			SourceType:           resp.Draft.ScriptVersion.SourceType,
			SourceText:           resp.Draft.SourceText,
			Status:               resp.Status,
			PreviewStatus:        fallback(resp.Draft.PreviewStatus, "draft"),
			ConfirmedAt:          resp.Draft.ConfirmedAt,
			StoryboardRevisionID: resp.StoryboardRevisionID,
			PreviewTimelineID:    resp.PreviewTimelineID,
			SnapshotJSON:         string(snapshotJSON),
			DurationSec:          timelineDuration(resp.Draft.PreviewTimeline),
			SavedAt:              resp.SavedAt,
		}); err != nil {
			return SaveDraftResponse{}, fmt.Errorf("save draft snapshot: %w", err)
		}
	}
	return resp, nil
}

func (s *Service) GetLatestDraft(projectID uint) (GetLatestDraftResponse, error) {
	return s.GetLatestDraftWithContext(context.Background(), projectID)
}

func (s *Service) GetLatestDraftWithContext(ctx context.Context, projectID uint) (GetLatestDraftResponse, error) {
	if projectID == 0 {
		return GetLatestDraftResponse{}, fmt.Errorf("project id is required")
	}
	if s.store == nil {
		return GetLatestDraftResponse{Found: false}, nil
	}
	snapshot, err := s.store.GetLatestDraftSnapshot(ctx, projectID)
	if err != nil {
		if err == ErrDraftNotFound {
			return GetLatestDraftResponse{Found: false}, nil
		}
		return GetLatestDraftResponse{}, fmt.Errorf("load latest draft snapshot: %w", err)
	}
	var draft DraftPayloadResponse
	if err := json.Unmarshal([]byte(snapshot.SnapshotJSON), &draft); err != nil {
		return GetLatestDraftResponse{}, fmt.Errorf("decode draft snapshot: %w", err)
	}
	draft.ProjectID = projectID
	if draft.ScriptVersionID == nil {
		draft.ScriptVersionID = snapshot.ScriptVersionID
	}
	if draft.ScriptVersion.DraftID == "" {
		draft.ScriptVersion.DraftID = snapshot.DraftID
	}
	if draft.ScriptVersion.Title == "" {
		draft.ScriptVersion.Title = snapshot.Title
	}
	if draft.ScriptVersion.SourceType == "" {
		draft.ScriptVersion.SourceType = snapshot.SourceType
	}
	resp := SaveDraftResponse{
		DraftID:              snapshot.DraftID,
		ScriptVersionID:      draft.ScriptVersionID,
		StoryboardRevisionID: snapshot.StoryboardRevisionID,
		PreviewTimelineID:    snapshot.PreviewTimelineID,
		SavedAt:              snapshot.SavedAt,
		Status:               fallback(snapshot.Status, "draft"),
		NextActions:          deriveNextActions(draft.PreviewStatus),
		Draft:                draft,
	}
	return GetLatestDraftResponse{Found: true, Draft: &resp}, nil
}

func (s *Service) ConfirmPreview(projectID uint, req ConfirmPreviewRequest) (SaveDraftResponse, error) {
	return s.ConfirmPreviewWithContext(context.Background(), projectID, req)
}

func (s *Service) ConfirmPreviewWithContext(ctx context.Context, projectID uint, req ConfirmPreviewRequest) (SaveDraftResponse, error) {
	if projectID == 0 {
		return SaveDraftResponse{}, fmt.Errorf("project id is required")
	}
	req.DraftID = strings.TrimSpace(req.DraftID)
	if req.DraftID == "" {
		return SaveDraftResponse{}, fmt.Errorf("draft id is required")
	}
	if s.store == nil {
		return SaveDraftResponse{}, fmt.Errorf("draft store is required")
	}

	return s.updateDraftSnapshotAndReturn(ctx, projectID, req.DraftID, func(draft *DraftPayloadResponse) error {
		if len(draft.StoryboardRows) == 0 {
			return fmt.Errorf("at least one storyboard row is required before confirming preview")
		}
		if draft.PreviewCandidates == nil && len(draft.PreviewTimeline) == 0 {
			return fmt.Errorf("at least one keyframe candidate or preview timeline item is required before confirming preview")
		}
		if hasBlockingAssetGap(draft.PreviewCandidates) {
			return fmt.Errorf("resolve or ignore blocking asset gaps before confirming preview")
		}
		if !hasAcceptedPreviewReadiness(draft.PreviewCandidates, draft.PreviewTimeline) {
			return fmt.Errorf("at least one accepted keyframe candidate or preview timeline item is required before confirming preview")
		}

		now := s.now().Format(time.RFC3339)
		draft.PreviewStatus = "ready_for_production"
		draft.ConfirmedAt = now
		return nil
	})
}

func (s *Service) Analyze(projectID uint, req AnalyzeRequest) (AnalyzeResponse, error) {
	return s.AnalyzeWithContext(context.Background(), projectID, req)
}

func (s *Service) AnalyzeWithContext(ctx context.Context, projectID uint, req AnalyzeRequest) (AnalyzeResponse, error) {
	if projectID == 0 {
		return AnalyzeResponse{}, fmt.Errorf("project id is required")
	}
	sourceLines := meaningfulLines(req.SourceText)
	if len(sourceLines) == 0 {
		for _, row := range req.StoryboardRows {
			if text := strings.TrimSpace(row.Body); text != "" {
				sourceLines = append(sourceLines, text)
			}
		}
	}
	if len(sourceLines) == 0 {
		return AnalyzeResponse{}, fmt.Errorf("source text or storyboard rows are required")
	}

	sections := make([]ScriptSectionResult, 0, len(sourceLines))
	suggestions := make([]StoryboardSuggestion, 0, len(sourceLines))
	questions := make([]string, 0, len(sourceLines))
	for i, line := range sourceLines {
		order := i + 1
		sectionID := fmt.Sprintf("section-%03d", order)
		title := summarizeTitle(line, order)
		question := fmt.Sprintf("第 %d 段的情绪转折是否需要用户确认？", order)
		sections = append(sections, ScriptSectionResult{
			ClientID:        sectionID,
			Order:           order,
			Title:           title,
			Summary:         line,
			SourceRange:     fmt.Sprintf("line:%d", order),
			Confidence:      0.78,
			ConfirmQuestion: question,
		})
		questions = append(questions, question)
		suggestions = append(suggestions, StoryboardSuggestion{
			ClientID:        fmt.Sprintf("suggestion-%03d", order),
			SourceSectionID: sectionID,
			Order:           order,
			Title:           title,
			Body:            line,
			DurationSeconds: 6 + float64(order%3)*2,
			Status:          "待确认",
			AdoptionIntent:  "append_storyboard_row",
			AdoptionStatus:  "pending",
		})
	}

	resp := AnalyzeResponse{
		DraftID:          req.DraftID,
		GeneratedAt:      s.now().Format(time.RFC3339),
		Sections:         sections,
		ConfirmQuestions: questions,
		Suggestions:      suggestions,
		Status:           "succeeded",
	}
	if err := s.saveAnalysisCandidates(ctx, projectID, resp); err != nil {
		return AnalyzeResponse{}, err
	}
	return resp, nil
}

func (s *Service) AcceptStoryboardSuggestion(projectID uint, req StoryboardSuggestionDecisionRequest) (SaveDraftResponse, error) {
	return s.AcceptStoryboardSuggestionWithContext(context.Background(), projectID, req)
}

func (s *Service) AcceptStoryboardSuggestionWithContext(ctx context.Context, projectID uint, req StoryboardSuggestionDecisionRequest) (SaveDraftResponse, error) {
	if projectID == 0 {
		return SaveDraftResponse{}, fmt.Errorf("project id is required")
	}
	req.DraftID = strings.TrimSpace(req.DraftID)
	req.SuggestionClientID = strings.TrimSpace(req.SuggestionClientID)
	if req.DraftID == "" {
		return SaveDraftResponse{}, fmt.Errorf("draft id is required")
	}
	if req.SuggestionClientID == "" {
		return SaveDraftResponse{}, fmt.Errorf("suggestion client id is required")
	}
	if s.store == nil {
		return SaveDraftResponse{}, fmt.Errorf("draft store is required")
	}

	return s.updateDraftSnapshotAndReturn(ctx, projectID, req.DraftID, func(draft *DraftPayloadResponse) error {
		if draft.AnalysisCandidates == nil {
			return fmt.Errorf("analysis candidates are required before accepting suggestion")
		}
		for i := range draft.AnalysisCandidates.Suggestions {
			suggestion := &draft.AnalysisCandidates.Suggestions[i]
			if suggestion.ClientID != req.SuggestionClientID {
				continue
			}
			if suggestion.AdoptionStatus == "rejected" {
				return fmt.Errorf("suggestion has already been rejected")
			}
			if suggestion.AdoptionStatus != "accepted" {
				draft.StoryboardRows = append(draft.StoryboardRows, StoryboardRow{
					ClientID:        nextStoryboardRowID(draft.StoryboardRows),
					Order:           len(draft.StoryboardRows) + 1,
					Title:           suggestion.Title,
					Body:            suggestion.Body,
					DurationSeconds: suggestion.DurationSeconds,
					Status:          suggestion.Status,
				})
				suggestion.AdoptionStatus = "accepted"
			}
			draft.StoryboardRows = normalizeRows(draft.StoryboardRows)
			draft.PreviewTimeline = buildTimelineInput(draft.StoryboardRows)
			draft.PreviewCandidates = nil
			return nil
		}
		return fmt.Errorf("storyboard suggestion not found")
	})
}

func (s *Service) RejectStoryboardSuggestion(projectID uint, req StoryboardSuggestionDecisionRequest) (SaveDraftResponse, error) {
	return s.RejectStoryboardSuggestionWithContext(context.Background(), projectID, req)
}

func (s *Service) RejectStoryboardSuggestionWithContext(ctx context.Context, projectID uint, req StoryboardSuggestionDecisionRequest) (SaveDraftResponse, error) {
	if projectID == 0 {
		return SaveDraftResponse{}, fmt.Errorf("project id is required")
	}
	req.DraftID = strings.TrimSpace(req.DraftID)
	req.SuggestionClientID = strings.TrimSpace(req.SuggestionClientID)
	if req.DraftID == "" {
		return SaveDraftResponse{}, fmt.Errorf("draft id is required")
	}
	if req.SuggestionClientID == "" {
		return SaveDraftResponse{}, fmt.Errorf("suggestion client id is required")
	}
	if s.store == nil {
		return SaveDraftResponse{}, fmt.Errorf("draft store is required")
	}

	return s.updateDraftSnapshotAndReturn(ctx, projectID, req.DraftID, func(draft *DraftPayloadResponse) error {
		if draft.AnalysisCandidates == nil {
			return fmt.Errorf("analysis candidates are required before rejecting suggestion")
		}
		for i := range draft.AnalysisCandidates.Suggestions {
			suggestion := &draft.AnalysisCandidates.Suggestions[i]
			if suggestion.ClientID != req.SuggestionClientID {
				continue
			}
			if suggestion.AdoptionStatus == "accepted" {
				return fmt.Errorf("suggestion has already been accepted")
			}
			suggestion.AdoptionStatus = "rejected"
			return nil
		}
		return fmt.Errorf("storyboard suggestion not found")
	})
}

func (s *Service) GeneratePreview(projectID uint, req GeneratePreviewRequest) (GeneratePreviewResponse, error) {
	return s.GeneratePreviewWithContext(context.Background(), projectID, req)
}

func (s *Service) GeneratePreviewWithContext(ctx context.Context, projectID uint, req GeneratePreviewRequest) (GeneratePreviewResponse, error) {
	if projectID == 0 {
		return GeneratePreviewResponse{}, fmt.Errorf("project id is required")
	}
	rows := normalizeRows(req.StoryboardRows)
	if len(rows) == 0 {
		return GeneratePreviewResponse{}, fmt.Errorf("storyboard rows are required")
	}

	candidates := make([]KeyframeCandidate, 0, len(rows))
	timeline := make([]PreviewTimelineItem, 0, len(rows))
	gaps := make([]AssetGap, 0)
	var cursor float64
	for i, row := range rows {
		order := i + 1
		candidateID := fmt.Sprintf("keyframe-%03d", order)
		status := "候选"
		if row.Status == "需补素材" {
			status = "待补素材"
			gaps = append(gaps, AssetGap{
				ClientID:              fmt.Sprintf("asset-gap-%03d", order),
				StoryboardRowClientID: row.ClientID,
				Name:                  fmt.Sprintf("第 %d 段参考素材", order),
				Description:           fallback(row.Title, "未命名片段"),
				Priority:              "normal",
				Status:                "missing",
			})
		}
		candidates = append(candidates, KeyframeCandidate{
			ClientID:       candidateID,
			StoryboardRow:  row.ClientID,
			Prompt:         buildPrompt(row),
			VisualAnchor:   fmt.Sprintf("%s的关键画面", fallback(row.Title, "片段")),
			Status:         status,
			DecisionStatus: "pending",
		})
		duration := row.DurationSeconds
		timeline = append(timeline, PreviewTimelineItem{
			ClientID:                  fmt.Sprintf("timeline-%03d", order),
			StoryboardRowClientID:     row.ClientID,
			KeyframeCandidateClientID: candidateID,
			Order:                     order,
			StartSeconds:              cursor,
			DurationSeconds:           duration,
			EndSeconds:                cursor + duration,
			Label:                     fallback(row.Title, fmt.Sprintf("片段 %d", order)),
			Status:                    previewStatus(row.Status),
			ConfirmationStatus:        "pending",
		})
		cursor += duration
	}

	resp := GeneratePreviewResponse{
		DraftID:            req.DraftID,
		GeneratedAt:        s.now().Format(time.RFC3339),
		KeyframeCandidates: candidates,
		PreviewTimeline:    timeline,
		AssetGaps:          gaps,
		Status:             "succeeded",
	}
	if err := s.savePreviewCandidates(ctx, projectID, resp); err != nil {
		return GeneratePreviewResponse{}, err
	}
	return resp, nil
}

func (s *Service) AcceptKeyframeCandidate(projectID uint, req KeyframeCandidateDecisionRequest) (SaveDraftResponse, error) {
	return s.AcceptKeyframeCandidateWithContext(context.Background(), projectID, req)
}

func (s *Service) AcceptKeyframeCandidateWithContext(ctx context.Context, projectID uint, req KeyframeCandidateDecisionRequest) (SaveDraftResponse, error) {
	if projectID == 0 {
		return SaveDraftResponse{}, fmt.Errorf("project id is required")
	}
	req.DraftID = strings.TrimSpace(req.DraftID)
	req.KeyframeCandidateClientID = strings.TrimSpace(req.KeyframeCandidateClientID)
	if req.DraftID == "" {
		return SaveDraftResponse{}, fmt.Errorf("draft id is required")
	}
	if req.KeyframeCandidateClientID == "" {
		return SaveDraftResponse{}, fmt.Errorf("keyframe candidate client id is required")
	}
	if s.store == nil {
		return SaveDraftResponse{}, fmt.Errorf("draft store is required")
	}

	return s.updateDraftSnapshotAndReturn(ctx, projectID, req.DraftID, func(draft *DraftPayloadResponse) error {
		if draft.PreviewCandidates == nil {
			return fmt.Errorf("preview candidates are required before accepting keyframe candidate")
		}
		for i := range draft.PreviewCandidates.KeyframeCandidates {
			candidate := &draft.PreviewCandidates.KeyframeCandidates[i]
			if candidate.ClientID != req.KeyframeCandidateClientID {
				continue
			}
			if candidate.DecisionStatus == "rejected" {
				return fmt.Errorf("keyframe candidate has already been rejected")
			}
			candidate.DecisionStatus = "accepted"
			markTimelineKeyframeDecision(draft.PreviewCandidates.PreviewTimeline, req.KeyframeCandidateClientID, "accepted")
			return nil
		}
		return fmt.Errorf("keyframe candidate not found")
	})
}

func (s *Service) RejectKeyframeCandidate(projectID uint, req KeyframeCandidateDecisionRequest) (SaveDraftResponse, error) {
	return s.RejectKeyframeCandidateWithContext(context.Background(), projectID, req)
}

func (s *Service) RejectKeyframeCandidateWithContext(ctx context.Context, projectID uint, req KeyframeCandidateDecisionRequest) (SaveDraftResponse, error) {
	if projectID == 0 {
		return SaveDraftResponse{}, fmt.Errorf("project id is required")
	}
	req.DraftID = strings.TrimSpace(req.DraftID)
	req.KeyframeCandidateClientID = strings.TrimSpace(req.KeyframeCandidateClientID)
	if req.DraftID == "" {
		return SaveDraftResponse{}, fmt.Errorf("draft id is required")
	}
	if req.KeyframeCandidateClientID == "" {
		return SaveDraftResponse{}, fmt.Errorf("keyframe candidate client id is required")
	}
	if s.store == nil {
		return SaveDraftResponse{}, fmt.Errorf("draft store is required")
	}

	return s.updateDraftSnapshotAndReturn(ctx, projectID, req.DraftID, func(draft *DraftPayloadResponse) error {
		if draft.PreviewCandidates == nil {
			return fmt.Errorf("preview candidates are required before rejecting keyframe candidate")
		}
		for i := range draft.PreviewCandidates.KeyframeCandidates {
			candidate := &draft.PreviewCandidates.KeyframeCandidates[i]
			if candidate.ClientID != req.KeyframeCandidateClientID {
				continue
			}
			if candidate.DecisionStatus == "accepted" {
				return fmt.Errorf("keyframe candidate has already been accepted")
			}
			candidate.DecisionStatus = "rejected"
			markTimelineKeyframeDecision(draft.PreviewCandidates.PreviewTimeline, req.KeyframeCandidateClientID, "rejected")
			return nil
		}
		return fmt.Errorf("keyframe candidate not found")
	})
}

func (s *Service) AcceptAssetGap(projectID uint, req AssetGapDecisionRequest) (SaveDraftResponse, error) {
	return s.AcceptAssetGapWithContext(context.Background(), projectID, req)
}

func (s *Service) AcceptAssetGapWithContext(ctx context.Context, projectID uint, req AssetGapDecisionRequest) (SaveDraftResponse, error) {
	return s.updateAssetGapDecision(ctx, projectID, req, "accepted")
}

func (s *Service) ResolveAssetGap(projectID uint, req AssetGapDecisionRequest) (SaveDraftResponse, error) {
	return s.ResolveAssetGapWithContext(context.Background(), projectID, req)
}

func (s *Service) ResolveAssetGapWithContext(ctx context.Context, projectID uint, req AssetGapDecisionRequest) (SaveDraftResponse, error) {
	return s.updateAssetGapDecision(ctx, projectID, req, "resolved")
}

func (s *Service) RejectAssetGap(projectID uint, req AssetGapDecisionRequest) (SaveDraftResponse, error) {
	return s.RejectAssetGapWithContext(context.Background(), projectID, req)
}

func (s *Service) RejectAssetGapWithContext(ctx context.Context, projectID uint, req AssetGapDecisionRequest) (SaveDraftResponse, error) {
	return s.updateAssetGapDecision(ctx, projectID, req, "rejected")
}

func (s *Service) updateAssetGapDecision(ctx context.Context, projectID uint, req AssetGapDecisionRequest, nextStatus string) (SaveDraftResponse, error) {
	if projectID == 0 {
		return SaveDraftResponse{}, fmt.Errorf("project id is required")
	}
	req.DraftID = strings.TrimSpace(req.DraftID)
	req.AssetGapClientID = strings.TrimSpace(req.AssetGapClientID)
	if req.DraftID == "" {
		return SaveDraftResponse{}, fmt.Errorf("draft id is required")
	}
	if req.AssetGapClientID == "" {
		return SaveDraftResponse{}, fmt.Errorf("asset gap client id is required")
	}
	if s.store == nil {
		return SaveDraftResponse{}, fmt.Errorf("draft store is required")
	}

	return s.updateDraftSnapshotAndReturn(ctx, projectID, req.DraftID, func(draft *DraftPayloadResponse) error {
		if draft.PreviewCandidates == nil {
			return fmt.Errorf("preview candidates are required before updating asset gap")
		}
		for i := range draft.PreviewCandidates.AssetGaps {
			gap := &draft.PreviewCandidates.AssetGaps[i]
			if gap.ClientID != req.AssetGapClientID {
				continue
			}
			switch nextStatus {
			case "accepted":
				if gap.Status == "rejected" {
					return fmt.Errorf("asset gap has already been rejected")
				}
				if gap.Status != "resolved" {
					gap.Status = "accepted"
				}
			case "resolved":
				if gap.Status == "rejected" {
					return fmt.Errorf("asset gap has already been rejected")
				}
				gap.Status = "resolved"
			case "rejected":
				if gap.Status == "resolved" {
					return fmt.Errorf("asset gap has already been resolved")
				}
				gap.Status = "rejected"
			default:
				return fmt.Errorf("unsupported asset gap status")
			}
			return nil
		}
		return fmt.Errorf("asset gap not found")
	})
}

func (s *Service) saveAnalysisCandidates(ctx context.Context, projectID uint, resp AnalyzeResponse) error {
	if s.store == nil {
		return nil
	}
	if strings.TrimSpace(resp.DraftID) == "" {
		return fmt.Errorf("draft id is required")
	}
	return s.updateDraftSnapshot(ctx, projectID, resp.DraftID, func(draft *DraftPayloadResponse) {
		draft.AnalysisCandidates = &AnalysisCandidates{
			GeneratedAt:      resp.GeneratedAt,
			Sections:         resp.Sections,
			ConfirmQuestions: resp.ConfirmQuestions,
			Suggestions:      resp.Suggestions,
			Status:           resp.Status,
		}
	})
}

func (s *Service) savePreviewCandidates(ctx context.Context, projectID uint, resp GeneratePreviewResponse) error {
	if s.store == nil {
		return nil
	}
	if strings.TrimSpace(resp.DraftID) == "" {
		return fmt.Errorf("draft id is required")
	}
	return s.updateDraftSnapshot(ctx, projectID, resp.DraftID, func(draft *DraftPayloadResponse) {
		draft.PreviewTimeline = previewTimelineItemsToInput(resp.PreviewTimeline)
		draft.PreviewCandidates = &PreviewCandidateData{
			GeneratedAt:        resp.GeneratedAt,
			KeyframeCandidates: resp.KeyframeCandidates,
			PreviewTimeline:    resp.PreviewTimeline,
			AssetGaps:          resp.AssetGaps,
			Status:             resp.Status,
		}
	})
}

func (s *Service) updateDraftSnapshot(ctx context.Context, projectID uint, draftID string, mutate func(*DraftPayloadResponse)) error {
	snapshot, err := s.store.GetDraftSnapshot(ctx, projectID, draftID)
	if err != nil {
		if err == ErrDraftNotFound {
			return fmt.Errorf("saved draft is required before writing candidates")
		}
		return fmt.Errorf("load draft snapshot: %w", err)
	}
	var draft DraftPayloadResponse
	if err := json.Unmarshal([]byte(snapshot.SnapshotJSON), &draft); err != nil {
		return fmt.Errorf("decode draft snapshot: %w", err)
	}
	draft.ProjectID = projectID
	mutate(&draft)
	snapshotJSON, err := json.Marshal(draft)
	if err != nil {
		return fmt.Errorf("encode draft snapshot: %w", err)
	}
	snapshot.SnapshotJSON = string(snapshotJSON)
	snapshot.DurationSec = timelineDuration(draft.PreviewTimeline)
	return s.store.SaveDraftSnapshot(ctx, snapshot)
}

func (s *Service) updateDraftSnapshotAndReturn(ctx context.Context, projectID uint, draftID string, mutate func(*DraftPayloadResponse) error) (SaveDraftResponse, error) {
	snapshot, err := s.store.GetDraftSnapshot(ctx, projectID, draftID)
	if err != nil {
		if err == ErrDraftNotFound {
			return SaveDraftResponse{}, fmt.Errorf("saved draft is required before updating draft candidates")
		}
		return SaveDraftResponse{}, fmt.Errorf("load draft snapshot: %w", err)
	}
	var draft DraftPayloadResponse
	if err := json.Unmarshal([]byte(snapshot.SnapshotJSON), &draft); err != nil {
		return SaveDraftResponse{}, fmt.Errorf("decode draft snapshot: %w", err)
	}
	draft.ProjectID = projectID
	if draft.ScriptVersionID == nil {
		draft.ScriptVersionID = snapshot.ScriptVersionID
	}
	if draft.ScriptVersion.DraftID == "" {
		draft.ScriptVersion.DraftID = snapshot.DraftID
	}
	if err := mutate(&draft); err != nil {
		return SaveDraftResponse{}, err
	}
	snapshotJSON, err := json.Marshal(draft)
	if err != nil {
		return SaveDraftResponse{}, fmt.Errorf("encode draft snapshot: %w", err)
	}
	snapshot.Title = fallback(draft.ScriptVersion.Title, snapshot.Title)
	snapshot.ScriptVersionID = draft.ScriptVersionID
	snapshot.SourceType = fallback(draft.ScriptVersion.SourceType, snapshot.SourceType)
	snapshot.SourceText = draft.SourceText
	snapshot.PreviewStatus = fallback(draft.PreviewStatus, snapshot.PreviewStatus)
	snapshot.ConfirmedAt = draft.ConfirmedAt
	snapshot.SnapshotJSON = string(snapshotJSON)
	snapshot.DurationSec = timelineDuration(draft.PreviewTimeline)
	snapshot.SavedAt = s.now().Format(time.RFC3339)
	if err := s.store.SaveDraftSnapshot(ctx, snapshot); err != nil {
		return SaveDraftResponse{}, fmt.Errorf("save draft snapshot: %w", err)
	}
	return saveDraftResponseFromSnapshot(projectID, snapshot, draft), nil
}

func saveDraftResponseFromSnapshot(projectID uint, snapshot DraftSnapshot, draft DraftPayloadResponse) SaveDraftResponse {
	draft.ProjectID = projectID
	if draft.ScriptVersionID == nil {
		draft.ScriptVersionID = snapshot.ScriptVersionID
	}
	if draft.ScriptVersion.DraftID == "" {
		draft.ScriptVersion.DraftID = snapshot.DraftID
	}
	if draft.ScriptVersion.Title == "" {
		draft.ScriptVersion.Title = snapshot.Title
	}
	if draft.ScriptVersion.SourceType == "" {
		draft.ScriptVersion.SourceType = snapshot.SourceType
	}
	return SaveDraftResponse{
		DraftID:              snapshot.DraftID,
		ScriptVersionID:      draft.ScriptVersionID,
		StoryboardRevisionID: snapshot.StoryboardRevisionID,
		PreviewTimelineID:    snapshot.PreviewTimelineID,
		SavedAt:              snapshot.SavedAt,
		Status:               fallback(snapshot.Status, "draft"),
		NextActions:          deriveNextActions(draft.PreviewStatus),
		Draft:                draft,
	}
}

func normalizeRows(rows []StoryboardRow) []StoryboardRow {
	out := make([]StoryboardRow, 0, len(rows))
	for i, row := range rows {
		order := i + 1
		if row.Order > 0 {
			order = row.Order
		}
		row.ClientID = fallback(row.ClientID, fmt.Sprintf("%02d", order))
		row.Order = order
		row.Title = strings.TrimSpace(row.Title)
		row.Body = strings.TrimSpace(row.Body)
		row.Status = fallback(row.Status, "待确认")
		if row.DurationSeconds <= 0 {
			row.DurationSeconds = 6
		}
		out = append(out, row)
	}
	return out
}

func buildTimelineInput(rows []StoryboardRow) []PreviewTimelineIn {
	items := make([]PreviewTimelineIn, 0, len(rows))
	var cursor float64
	for _, row := range rows {
		items = append(items, PreviewTimelineIn{
			ClientID:        row.ClientID,
			Order:           row.Order,
			StartSeconds:    cursor,
			EndSeconds:      cursor + row.DurationSeconds,
			DurationSeconds: row.DurationSeconds,
		})
		cursor += row.DurationSeconds
	}
	return items
}

func nextStoryboardRowID(rows []StoryboardRow) string {
	return fmt.Sprintf("%02d", len(rows)+1)
}

func markTimelineKeyframeDecision(items []PreviewTimelineItem, keyframeCandidateClientID string, decisionStatus string) {
	for i := range items {
		if items[i].KeyframeCandidateClientID == keyframeCandidateClientID {
			items[i].ConfirmationStatus = decisionStatus
		}
	}
}

func previewTimelineItemsToInput(items []PreviewTimelineItem) []PreviewTimelineIn {
	out := make([]PreviewTimelineIn, 0, len(items))
	for _, item := range items {
		out = append(out, PreviewTimelineIn{
			ClientID:        item.StoryboardRowClientID,
			Order:           item.Order,
			StartSeconds:    item.StartSeconds,
			EndSeconds:      item.EndSeconds,
			DurationSeconds: item.DurationSeconds,
		})
	}
	return out
}

func hasAcceptedPreviewReadiness(data *PreviewCandidateData, timeline []PreviewTimelineIn) bool {
	if data == nil {
		return false
	}
	for _, candidate := range data.KeyframeCandidates {
		if candidate.DecisionStatus == "accepted" {
			return true
		}
	}
	return len(timeline) > 0
}

func hasBlockingAssetGap(data *PreviewCandidateData) bool {
	if data == nil {
		return false
	}
	for _, gap := range data.AssetGaps {
		if gap.Status == "missing" || gap.Status == "accepted" {
			return true
		}
	}
	return false
}

func deriveNextActions(previewStatus string) []string {
	if previewStatus == "ready_for_production" {
		return []string{"enter_content_production"}
	}
	return []string{"analyze_script_to_sections", "generate_keyframes_for_preview"}
}

func timelineDuration(items []PreviewTimelineIn) float64 {
	var duration float64
	for _, item := range items {
		if item.EndSeconds > duration {
			duration = item.EndSeconds
			continue
		}
		if item.StartSeconds+item.DurationSeconds > duration {
			duration = item.StartSeconds + item.DurationSeconds
		}
	}
	return duration
}

func meaningfulLines(text string) []string {
	lines := strings.Split(text, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}

func summarizeTitle(text string, order int) string {
	text = strings.TrimSpace(text)
	runes := []rune(text)
	if len(runes) > 14 {
		text = string(runes[:14])
	}
	return fallback(text, fmt.Sprintf("剧本节 %d", order))
}

func buildPrompt(row StoryboardRow) string {
	body := fallback(row.Body, row.Title)
	return fmt.Sprintf("为「%s」生成预演关键帧：%s", fallback(row.Title, "未命名片段"), body)
}

func previewStatus(rowStatus string) string {
	if rowStatus == "需补素材" {
		return "needs_asset"
	}
	if rowStatus == "可预演" {
		return "playable"
	}
	return "draft"
}

func fallback(value string, fallbackValue string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallbackValue
	}
	return value
}

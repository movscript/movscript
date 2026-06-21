package decision

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	domaindecision "github.com/movscript/movscript/internal/domain/decision"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

const (
	ProjectDataScopeUser = "user"
	ProjectDataScopeOrg  = "org"

	ProjectDataStatusActive   = "active"
	ProjectDataStatusArchived = "archived"
)

type ProjectDataService struct {
	db *gorm.DB
}

func NewProjectDataService(db *gorm.DB) *ProjectDataService {
	return &ProjectDataService{db: db}
}

type ProjectDataScopeInput struct {
	ScopeKind string
	ScopeID   string
}

type ProjectDataSpaceInput struct {
	ProjectDataScopeInput
	ProjectUID string
	Title      string
	ActorID    *uint
}

type ProjectDataTargetInput struct {
	ProjectDataSpaceInput
	TargetKind string
	TargetRef  string
}

type ProjectDataQueryTargetsInput struct {
	ProjectDataSpaceInput
	TargetKind string
	TargetRefs []string
}

type ProjectDataReplaceCandidatesInput struct {
	ProjectDataTargetInput
	Candidates []json.RawMessage
}

type ProjectDataUpsertCandidateInput struct {
	ProjectDataTargetInput
	Candidate json.RawMessage
}

type ProjectDataSelectInput struct {
	ProjectDataTargetInput
	CandidateID       string
	ResourceID        *uint
	AcceptedInputHash string
	StalePolicy       string
	Reason            string
	SelectedAt        string
	SelectedBy        *uint
	Metadata          json.RawMessage
}

type ProjectDataSpaceSummary struct {
	ID             uint       `json:"id"`
	ScopeKind      string     `json:"scope_kind"`
	ScopeID        string     `json:"scope_id"`
	ProjectUID     string     `json:"project_uid"`
	Title          string     `json:"title,omitempty"`
	Status         string     `json:"status"`
	DecisionCount  int64      `json:"decision_count"`
	CandidateCount int64      `json:"candidate_count"`
	SelectionCount int64      `json:"selection_count"`
	CreatedBy      *uint      `json:"created_by,omitempty"`
	UpdatedBy      *uint      `json:"updated_by,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	LastDecisionAt *time.Time `json:"last_decision_at,omitempty"`
}

type ProjectDataDecisionContext struct {
	ID                 uint              `json:"id"`
	ProjectDataSpaceID uint              `json:"project_data_space_id"`
	ScopeKind          string            `json:"scope_kind"`
	ScopeID            string            `json:"scope_id"`
	ProjectUID         string            `json:"project_uid"`
	TargetKind         string            `json:"target_kind"`
	TargetRef          string            `json:"target_ref"`
	Candidates         []json.RawMessage `json:"candidates"`
	Selection          json.RawMessage   `json:"selection,omitempty"`
	Status             string            `json:"status"`
	CreatedBy          *uint             `json:"created_by,omitempty"`
	UpdatedBy          *uint             `json:"updated_by,omitempty"`
	CreatedAt          time.Time         `json:"created_at"`
	UpdatedAt          time.Time         `json:"updated_at"`
}

func (s *ProjectDataService) ListSpaces(ctx context.Context, input ProjectDataScopeInput) ([]ProjectDataSpaceSummary, error) {
	scope, err := normalizeProjectDataScope(input)
	if err != nil {
		return nil, err
	}
	var rows []persistencemodel.ProjectDataSpace
	if err := s.db.WithContext(ctx).
		Where("scope_kind = ? AND scope_id = ?", scope.ScopeKind, scope.ScopeID).
		Order("updated_at DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]ProjectDataSpaceSummary, 0, len(rows))
	for _, row := range rows {
		summary := ProjectDataSpaceSummary{
			ID:         row.ID,
			ScopeKind:  row.ScopeKind,
			ScopeID:    row.ScopeID,
			ProjectUID: row.ProjectUID,
			Title:      row.Title,
			Status:     row.Status,
			CreatedBy:  row.CreatedBy,
			UpdatedBy:  row.UpdatedBy,
			CreatedAt:  row.CreatedAt,
			UpdatedAt:  row.UpdatedAt,
		}
		if err := s.attachSpaceStats(ctx, &summary); err != nil {
			return nil, err
		}
		out = append(out, summary)
	}
	return out, nil
}

func (s *ProjectDataService) EnsureSpace(ctx context.Context, input ProjectDataSpaceInput) (ProjectDataSpaceSummary, error) {
	space, err := s.ensureSpace(ctx, input)
	if err != nil {
		return ProjectDataSpaceSummary{}, err
	}
	summary := ProjectDataSpaceSummary{
		ID:         space.ID,
		ScopeKind:  space.ScopeKind,
		ScopeID:    space.ScopeID,
		ProjectUID: space.ProjectUID,
		Title:      space.Title,
		Status:     space.Status,
		CreatedBy:  space.CreatedBy,
		UpdatedBy:  space.UpdatedBy,
		CreatedAt:  space.CreatedAt,
		UpdatedAt:  space.UpdatedAt,
	}
	if err := s.attachSpaceStats(ctx, &summary); err != nil {
		return ProjectDataSpaceSummary{}, err
	}
	return summary, nil
}

func (s *ProjectDataService) Get(ctx context.Context, input ProjectDataTargetInput) (ProjectDataDecisionContext, error) {
	target, err := normalizeProjectDataTarget(input)
	if err != nil {
		return ProjectDataDecisionContext{}, err
	}
	space, err := s.findSpace(ctx, target.ProjectDataSpaceInput)
	if err != nil {
		return ProjectDataDecisionContext{}, err
	}
	var row persistencemodel.ProjectDataDecisionContext
	if err := s.db.WithContext(ctx).
		Where("project_data_space_id = ? AND target_kind = ? AND target_ref = ?", space.ID, target.TargetKind, target.TargetRef).
		First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectDataDecisionContext{}, ErrDecisionNotFound
		}
		return ProjectDataDecisionContext{}, err
	}
	return projectDataDecisionFromModel(space, row), nil
}

func (s *ProjectDataService) Query(ctx context.Context, input ProjectDataQueryTargetsInput) ([]ProjectDataDecisionContext, error) {
	query, err := normalizeProjectDataQueryTargets(input)
	if err != nil {
		return nil, err
	}
	if len(query.TargetRefs) == 0 {
		return []ProjectDataDecisionContext{}, nil
	}
	space, err := s.findSpace(ctx, query.ProjectDataSpaceInput)
	if err != nil {
		return nil, err
	}
	var rows []persistencemodel.ProjectDataDecisionContext
	if err := s.db.WithContext(ctx).
		Where("project_data_space_id = ? AND target_kind = ? AND target_ref IN ?", space.ID, query.TargetKind, query.TargetRefs).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]ProjectDataDecisionContext, 0, len(rows))
	for _, row := range rows {
		out = append(out, projectDataDecisionFromModel(space, row))
	}
	return out, nil
}

func (s *ProjectDataService) ReplaceCandidates(ctx context.Context, input ProjectDataReplaceCandidatesInput) (ProjectDataDecisionContext, error) {
	target, err := normalizeProjectDataTarget(input.ProjectDataTargetInput)
	if err != nil {
		return ProjectDataDecisionContext{}, err
	}
	candidates := make([]json.RawMessage, 0, len(input.Candidates))
	for _, candidate := range input.Candidates {
		normalized, err := normalizeCandidate(candidate)
		if err != nil {
			return ProjectDataDecisionContext{}, err
		}
		candidates = append(candidates, normalized)
	}
	return s.upsertDecision(ctx, projectDataUpsertContextInput{
		ProjectDataTargetInput: target,
		Candidates:             candidates,
		ActorID:                input.ActorID,
	})
}

func (s *ProjectDataService) UpsertCandidate(ctx context.Context, input ProjectDataUpsertCandidateInput) (ProjectDataDecisionContext, error) {
	target, err := normalizeProjectDataTarget(input.ProjectDataTargetInput)
	if err != nil {
		return ProjectDataDecisionContext{}, err
	}
	candidate, err := normalizeCandidate(input.Candidate)
	if err != nil {
		return ProjectDataDecisionContext{}, err
	}
	candidateIDValue, err := candidateID(candidate)
	if err != nil {
		return ProjectDataDecisionContext{}, err
	}
	current, err := s.Get(ctx, target)
	if err != nil && !errors.Is(err, ErrDecisionNotFound) {
		return ProjectDataDecisionContext{}, err
	}
	candidates := append([]json.RawMessage(nil), current.Candidates...)
	replaced := false
	for i := range candidates {
		existingID, _ := candidateID(candidates[i])
		if existingID == candidateIDValue {
			candidates[i] = candidate
			replaced = true
			break
		}
	}
	if !replaced {
		candidates = append(candidates, candidate)
	}
	return s.upsertDecision(ctx, projectDataUpsertContextInput{
		ProjectDataTargetInput: target,
		Candidates:             candidates,
		Selection:              current.Selection,
		ActorID:                input.ActorID,
	})
}

func (s *ProjectDataService) Select(ctx context.Context, input ProjectDataSelectInput) (ProjectDataDecisionContext, error) {
	target, err := normalizeProjectDataTarget(input.ProjectDataTargetInput)
	if err != nil {
		return ProjectDataDecisionContext{}, err
	}
	if input.ResourceID != nil && *input.ResourceID == 0 {
		return ProjectDataDecisionContext{}, ErrInvalidSelection
	}
	if strings.TrimSpace(input.CandidateID) == "" && input.ResourceID == nil {
		return ProjectDataDecisionContext{}, ErrInvalidSelection
	}
	current, err := s.Get(ctx, target)
	if err != nil {
		return ProjectDataDecisionContext{}, err
	}
	if strings.TrimSpace(input.CandidateID) != "" && !hasCandidate(current.Candidates, input.CandidateID) {
		return ProjectDataDecisionContext{}, ErrCandidateNotFound
	}
	selection, err := buildSelection(SelectInput{
		CandidateID:       input.CandidateID,
		ResourceID:        input.ResourceID,
		AcceptedInputHash: input.AcceptedInputHash,
		StalePolicy:       input.StalePolicy,
		Reason:            input.Reason,
		SelectedAt:        input.SelectedAt,
		SelectedBy:        input.SelectedBy,
		Metadata:          input.Metadata,
	})
	if err != nil {
		return ProjectDataDecisionContext{}, err
	}
	return s.upsertDecision(ctx, projectDataUpsertContextInput{
		ProjectDataTargetInput: target,
		Candidates:             current.Candidates,
		Selection:              selection,
		ActorID:                input.ActorID,
	})
}

func (s *ProjectDataService) ClearSelection(ctx context.Context, input ProjectDataTargetInput, actorID *uint) (ProjectDataDecisionContext, error) {
	target, err := normalizeProjectDataTarget(input)
	if err != nil {
		return ProjectDataDecisionContext{}, err
	}
	current, err := s.Get(ctx, target)
	if err != nil {
		return ProjectDataDecisionContext{}, err
	}
	return s.upsertDecision(ctx, projectDataUpsertContextInput{
		ProjectDataTargetInput: target,
		Candidates:             current.Candidates,
		Selection:              nil,
		ActorID:                actorID,
	})
}

type projectDataUpsertContextInput struct {
	ProjectDataTargetInput
	Candidates []json.RawMessage
	Selection  json.RawMessage
	ActorID    *uint
}

func (s *ProjectDataService) upsertDecision(ctx context.Context, input projectDataUpsertContextInput) (ProjectDataDecisionContext, error) {
	var space persistencemodel.ProjectDataSpace
	var row persistencemodel.ProjectDataDecisionContext
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		space, err = ensureProjectDataSpaceWithDB(ctx, tx, input.ProjectDataSpaceInput)
		if err != nil {
			return err
		}
		lookupErr := tx.
			Where("project_data_space_id = ? AND target_kind = ? AND target_ref = ?", space.ID, input.TargetKind, input.TargetRef).
			First(&row).Error
		if lookupErr != nil && !errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			return lookupErr
		}
		candidatesJSON, err := json.Marshal(input.Candidates)
		if err != nil {
			return err
		}
		selectionJSON := "{}"
		status := domaindecision.StatusOpen
		if len(input.Selection) > 0 {
			selectionJSON = string(input.Selection)
			status = domaindecision.StatusSelected
		}
		if errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			if err := tx.Model(&persistencemodel.ProjectDataDecisionContext{}).Create(map[string]any{
				"project_data_space_id": space.ID,
				"target_kind":           input.TargetKind,
				"target_ref":            input.TargetRef,
				"candidates_json":       string(candidatesJSON),
				"selection_json":        selectionJSON,
				"status":                status,
				"created_by":            input.ActorID,
				"updated_by":            input.ActorID,
			}).Error; err != nil {
				return err
			}
			return tx.
				Where("project_data_space_id = ? AND target_kind = ? AND target_ref = ?", space.ID, input.TargetKind, input.TargetRef).
				First(&row).Error
		}
		if err := tx.Model(&persistencemodel.ProjectDataDecisionContext{}).
			Where("id = ?", row.ID).
			Updates(map[string]any{
				"candidates_json": string(candidatesJSON),
				"selection_json":  selectionJSON,
				"status":          status,
				"updated_by":      input.ActorID,
			}).Error; err != nil {
			return err
		}
		return tx.First(&row, row.ID).Error
	}); err != nil {
		return ProjectDataDecisionContext{}, err
	}
	return projectDataDecisionFromModel(space, row), nil
}

func (s *ProjectDataService) ensureSpace(ctx context.Context, input ProjectDataSpaceInput) (persistencemodel.ProjectDataSpace, error) {
	return ensureProjectDataSpaceWithDB(ctx, s.db, input)
}

func (s *ProjectDataService) findSpace(ctx context.Context, input ProjectDataSpaceInput) (persistencemodel.ProjectDataSpace, error) {
	normalized, err := normalizeProjectDataSpace(input)
	if err != nil {
		return persistencemodel.ProjectDataSpace{}, err
	}
	var row persistencemodel.ProjectDataSpace
	if err := s.db.WithContext(ctx).
		Where("scope_kind = ? AND scope_id = ? AND project_uid = ?", normalized.ScopeKind, normalized.ScopeID, normalized.ProjectUID).
		First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return persistencemodel.ProjectDataSpace{}, ErrDecisionNotFound
		}
		return persistencemodel.ProjectDataSpace{}, err
	}
	return row, nil
}

func ensureProjectDataSpaceWithDB(ctx context.Context, db *gorm.DB, input ProjectDataSpaceInput) (persistencemodel.ProjectDataSpace, error) {
	normalized, err := normalizeProjectDataSpace(input)
	if err != nil {
		return persistencemodel.ProjectDataSpace{}, err
	}
	var row persistencemodel.ProjectDataSpace
	lookupErr := db.WithContext(ctx).
		Where("scope_kind = ? AND scope_id = ? AND project_uid = ?", normalized.ScopeKind, normalized.ScopeID, normalized.ProjectUID).
		First(&row).Error
	if lookupErr != nil && !errors.Is(lookupErr, gorm.ErrRecordNotFound) {
		return persistencemodel.ProjectDataSpace{}, lookupErr
	}
	if errors.Is(lookupErr, gorm.ErrRecordNotFound) {
		row = persistencemodel.ProjectDataSpace{
			ScopeKind:  normalized.ScopeKind,
			ScopeID:    normalized.ScopeID,
			ProjectUID: normalized.ProjectUID,
			Title:      normalized.Title,
			Status:     ProjectDataStatusActive,
			CreatedBy:  normalized.ActorID,
			UpdatedBy:  normalized.ActorID,
		}
		if err := db.WithContext(ctx).Create(&row).Error; err != nil {
			return persistencemodel.ProjectDataSpace{}, err
		}
		return row, nil
	}
	updates := map[string]any{
		"updated_by": normalized.ActorID,
	}
	if normalized.Title != "" && normalized.Title != row.Title {
		updates["title"] = normalized.Title
	}
	if row.Status == "" {
		updates["status"] = ProjectDataStatusActive
	}
	if err := db.WithContext(ctx).Model(&persistencemodel.ProjectDataSpace{}).
		Where("id = ?", row.ID).
		Updates(updates).Error; err != nil {
		return persistencemodel.ProjectDataSpace{}, err
	}
	if err := db.WithContext(ctx).First(&row, row.ID).Error; err != nil {
		return persistencemodel.ProjectDataSpace{}, err
	}
	return row, nil
}

func (s *ProjectDataService) attachSpaceStats(ctx context.Context, summary *ProjectDataSpaceSummary) error {
	type statsRow struct {
		DecisionCount  int64
		SelectionCount int64
	}
	var stats statsRow
	if err := s.db.WithContext(ctx).
		Model(&persistencemodel.ProjectDataDecisionContext{}).
		Select("COUNT(*) AS decision_count, COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS selection_count", domaindecision.StatusSelected).
		Where("project_data_space_id = ?", summary.ID).
		Scan(&stats).Error; err != nil {
		return err
	}
	var latest persistencemodel.ProjectDataDecisionContext
	if err := s.db.WithContext(ctx).
		Where("project_data_space_id = ?", summary.ID).
		Order("updated_at DESC").
		First(&latest).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	var candidates []string
	if err := s.db.WithContext(ctx).
		Model(&persistencemodel.ProjectDataDecisionContext{}).
		Where("project_data_space_id = ?", summary.ID).
		Pluck("candidates_json", &candidates).Error; err != nil {
		return err
	}
	var candidateCount int64
	for _, raw := range candidates {
		candidateCount += int64(len(decodeProjectDataRawArray(raw)))
	}
	summary.DecisionCount = stats.DecisionCount
	summary.SelectionCount = stats.SelectionCount
	summary.CandidateCount = candidateCount
	if latest.ID != 0 {
		summary.LastDecisionAt = &latest.UpdatedAt
	}
	return nil
}

func normalizeProjectDataScope(input ProjectDataScopeInput) (ProjectDataScopeInput, error) {
	scope := ProjectDataScopeInput{
		ScopeKind: strings.ToLower(strings.TrimSpace(input.ScopeKind)),
		ScopeID:   strings.TrimSpace(input.ScopeID),
	}
	if scope.ScopeKind == "" {
		scope.ScopeKind = ProjectDataScopeUser
	}
	if scope.ScopeKind != ProjectDataScopeUser && scope.ScopeKind != ProjectDataScopeOrg {
		return ProjectDataScopeInput{}, ErrInvalidTarget
	}
	if scope.ScopeID == "" {
		return ProjectDataScopeInput{}, ErrInvalidTarget
	}
	return scope, nil
}

func normalizeProjectDataSpace(input ProjectDataSpaceInput) (ProjectDataSpaceInput, error) {
	scope, err := normalizeProjectDataScope(input.ProjectDataScopeInput)
	if err != nil {
		return ProjectDataSpaceInput{}, err
	}
	out := ProjectDataSpaceInput{
		ProjectDataScopeInput: scope,
		ProjectUID:            strings.TrimSpace(input.ProjectUID),
		Title:                 strings.TrimSpace(input.Title),
		ActorID:               input.ActorID,
	}
	if out.ProjectUID == "" {
		return ProjectDataSpaceInput{}, ErrInvalidTarget
	}
	return out, nil
}

func normalizeProjectDataTarget(input ProjectDataTargetInput) (ProjectDataTargetInput, error) {
	space, err := normalizeProjectDataSpace(input.ProjectDataSpaceInput)
	if err != nil {
		return ProjectDataTargetInput{}, err
	}
	out := ProjectDataTargetInput{
		ProjectDataSpaceInput: space,
		TargetKind:            strings.TrimSpace(input.TargetKind),
		TargetRef:             strings.TrimSpace(input.TargetRef),
	}
	if out.TargetKind == "" || out.TargetRef == "" {
		return ProjectDataTargetInput{}, ErrInvalidTarget
	}
	return out, nil
}

func normalizeProjectDataQueryTargets(input ProjectDataQueryTargetsInput) (ProjectDataQueryTargetsInput, error) {
	space, err := normalizeProjectDataSpace(input.ProjectDataSpaceInput)
	if err != nil {
		return ProjectDataQueryTargetsInput{}, err
	}
	out := ProjectDataQueryTargetsInput{
		ProjectDataSpaceInput: space,
		TargetKind:            strings.TrimSpace(input.TargetKind),
		TargetRefs:            make([]string, 0, len(input.TargetRefs)),
	}
	if out.TargetKind == "" {
		return ProjectDataQueryTargetsInput{}, ErrInvalidTarget
	}
	seen := map[string]struct{}{}
	for _, ref := range input.TargetRefs {
		normalized := strings.TrimSpace(ref)
		if normalized == "" {
			return ProjectDataQueryTargetsInput{}, ErrInvalidTarget
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		out.TargetRefs = append(out.TargetRefs, normalized)
	}
	return out, nil
}

func projectDataDecisionFromModel(space persistencemodel.ProjectDataSpace, row persistencemodel.ProjectDataDecisionContext) ProjectDataDecisionContext {
	return ProjectDataDecisionContext{
		ID:                 row.ID,
		ProjectDataSpaceID: row.ProjectDataSpaceID,
		ScopeKind:          space.ScopeKind,
		ScopeID:            space.ScopeID,
		ProjectUID:         space.ProjectUID,
		TargetKind:         row.TargetKind,
		TargetRef:          row.TargetRef,
		Candidates:         decodeProjectDataRawArray(row.CandidatesJSON),
		Selection:          decodeProjectDataRawObject(row.SelectionJSON),
		Status:             row.Status,
		CreatedBy:          row.CreatedBy,
		UpdatedBy:          row.UpdatedBy,
		CreatedAt:          row.CreatedAt,
		UpdatedAt:          row.UpdatedAt,
	}
}

func decodeProjectDataRawArray(value string) []json.RawMessage {
	var out []json.RawMessage
	if err := json.Unmarshal([]byte(value), &out); err != nil || out == nil {
		return []json.RawMessage{}
	}
	return out
}

func decodeProjectDataRawObject(value string) json.RawMessage {
	var raw json.RawMessage
	if err := json.Unmarshal([]byte(value), &raw); err != nil {
		return nil
	}
	if string(raw) == "{}" || string(raw) == "null" {
		return nil
	}
	return raw
}

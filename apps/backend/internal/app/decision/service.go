package decision

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	domaindecision "github.com/movscript/movscript/internal/domain/decision"
	"gorm.io/gorm"
)

var (
	ErrInvalidTarget     = errors.New("invalid decision target")
	ErrInvalidCandidate  = errors.New("invalid decision candidate")
	ErrInvalidSelection  = errors.New("invalid decision selection")
	ErrDecisionNotFound  = errors.New("decision context not found")
	ErrCandidateNotFound = errors.New("decision candidate not found")
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type TargetInput struct {
	ProjectID  uint
	TargetKind string
	TargetRef  string
}

type ReplaceCandidatesInput struct {
	TargetInput
	Candidates []json.RawMessage
	ActorID    *uint
}

type UpsertCandidateInput struct {
	TargetInput
	Candidate json.RawMessage
	ActorID   *uint
}

type SelectInput struct {
	TargetInput
	CandidateID       string
	ResourceID        *uint
	AcceptedInputHash string
	StalePolicy       string
	Reason            string
	SelectedAt        string
	SelectedBy        *uint
	Metadata          json.RawMessage
	ActorID           *uint
}

func (s *Service) Get(ctx context.Context, input TargetInput) (domaindecision.Context, error) {
	target, err := normalizeTarget(input)
	if err != nil {
		return domaindecision.Context{}, err
	}
	return s.repo.Get(ctx, target)
}

func (s *Service) ReplaceCandidates(ctx context.Context, input ReplaceCandidatesInput) (domaindecision.Context, error) {
	target, err := normalizeTarget(input.TargetInput)
	if err != nil {
		return domaindecision.Context{}, err
	}
	candidates := make([]json.RawMessage, 0, len(input.Candidates))
	for _, candidate := range input.Candidates {
		normalized, err := normalizeCandidate(candidate)
		if err != nil {
			return domaindecision.Context{}, err
		}
		candidates = append(candidates, normalized)
	}
	return s.repo.Upsert(ctx, upsertContextInput{
		TargetInput: target,
		Candidates:  candidates,
		ActorID:     input.ActorID,
	})
}

func (s *Service) UpsertCandidate(ctx context.Context, input UpsertCandidateInput) (domaindecision.Context, error) {
	target, err := normalizeTarget(input.TargetInput)
	if err != nil {
		return domaindecision.Context{}, err
	}
	candidate, err := normalizeCandidate(input.Candidate)
	if err != nil {
		return domaindecision.Context{}, err
	}
	candidateIDValue, err := candidateID(candidate)
	if err != nil {
		return domaindecision.Context{}, err
	}
	current, err := s.repo.Get(ctx, target)
	if err != nil && !errors.Is(err, ErrDecisionNotFound) {
		return domaindecision.Context{}, err
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
	return s.repo.Upsert(ctx, upsertContextInput{
		TargetInput: target,
		Candidates:  candidates,
		Selection:   current.Selection,
		ActorID:     input.ActorID,
	})
}

func (s *Service) Select(ctx context.Context, input SelectInput) (domaindecision.Context, error) {
	target, err := normalizeTarget(input.TargetInput)
	if err != nil {
		return domaindecision.Context{}, err
	}
	if input.ResourceID != nil && *input.ResourceID == 0 {
		return domaindecision.Context{}, ErrInvalidSelection
	}
	if strings.TrimSpace(input.CandidateID) == "" && input.ResourceID == nil {
		return domaindecision.Context{}, ErrInvalidSelection
	}
	current, err := s.repo.Get(ctx, target)
	if err != nil {
		return domaindecision.Context{}, err
	}
	if strings.TrimSpace(input.CandidateID) != "" && !hasCandidate(current.Candidates, input.CandidateID) {
		return domaindecision.Context{}, ErrCandidateNotFound
	}
	selection, err := buildSelection(input)
	if err != nil {
		return domaindecision.Context{}, err
	}
	return s.repo.Upsert(ctx, upsertContextInput{
		TargetInput: target,
		Candidates:  current.Candidates,
		Selection:   selection,
		ActorID:     input.ActorID,
	})
}

func (s *Service) ClearSelection(ctx context.Context, input TargetInput, actorID *uint) (domaindecision.Context, error) {
	target, err := normalizeTarget(input)
	if err != nil {
		return domaindecision.Context{}, err
	}
	current, err := s.repo.Get(ctx, target)
	if err != nil {
		return domaindecision.Context{}, err
	}
	return s.repo.Upsert(ctx, upsertContextInput{
		TargetInput: target,
		Candidates:  current.Candidates,
		Selection:   nil,
		ActorID:     actorID,
	})
}

func normalizeTarget(input TargetInput) (TargetInput, error) {
	target := TargetInput{
		ProjectID:  input.ProjectID,
		TargetKind: strings.TrimSpace(input.TargetKind),
		TargetRef:  strings.TrimSpace(input.TargetRef),
	}
	if target.ProjectID == 0 || target.TargetKind == "" || target.TargetRef == "" {
		return TargetInput{}, ErrInvalidTarget
	}
	return target, nil
}

func normalizeCandidate(candidate json.RawMessage) (json.RawMessage, error) {
	if len(candidate) == 0 || !json.Valid(candidate) {
		return nil, ErrInvalidCandidate
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(candidate, &object); err != nil || object == nil {
		return nil, ErrInvalidCandidate
	}
	if _, err := candidateID(candidate); err != nil {
		return nil, err
	}
	normalized, err := json.Marshal(object)
	if err != nil {
		return nil, ErrInvalidCandidate
	}
	return normalized, nil
}

func candidateID(candidate json.RawMessage) (string, error) {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(candidate, &object); err != nil || object == nil {
		return "", ErrInvalidCandidate
	}
	raw, ok := object["id"]
	if !ok {
		return "", ErrInvalidCandidate
	}
	var stringID string
	if err := json.Unmarshal(raw, &stringID); err == nil && strings.TrimSpace(stringID) != "" {
		return strings.TrimSpace(stringID), nil
	}
	var numberID json.Number
	if err := json.Unmarshal(raw, &numberID); err == nil && strings.TrimSpace(numberID.String()) != "" {
		return strings.TrimSpace(numberID.String()), nil
	}
	return "", ErrInvalidCandidate
}

func hasCandidate(candidates []json.RawMessage, id string) bool {
	id = strings.TrimSpace(id)
	for _, candidate := range candidates {
		candidateID, err := candidateID(candidate)
		if err == nil && candidateID == id {
			return true
		}
	}
	return false
}

func buildSelection(input SelectInput) (json.RawMessage, error) {
	selectedAt := strings.TrimSpace(input.SelectedAt)
	if selectedAt == "" {
		selectedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	selection := domaindecision.CandidateSelection{
		CandidateID:       strings.TrimSpace(input.CandidateID),
		ResourceID:        input.ResourceID,
		AcceptedInputHash: strings.TrimSpace(input.AcceptedInputHash),
		StalePolicy:       strings.TrimSpace(input.StalePolicy),
		Reason:            strings.TrimSpace(input.Reason),
		SelectedAt:        selectedAt,
		SelectedBy:        input.SelectedBy,
		Metadata:          nil,
	}
	if selection.Reason == "" {
		selection.Reason = "selected"
	}
	if selection.StalePolicy == "" {
		selection.StalePolicy = "strict"
	}
	if len(input.Metadata) > 0 {
		if !json.Valid(input.Metadata) {
			return nil, ErrInvalidSelection
		}
		selection.Metadata = input.Metadata
	}
	raw, err := json.Marshal(selection)
	if err != nil {
		return nil, ErrInvalidSelection
	}
	return raw, nil
}

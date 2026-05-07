package script

import (
	"context"
	"errors"
	"fmt"

	dto "github.com/movscript/movscript/internal/app/dto"
	domainscript "github.com/movscript/movscript/internal/domain/script"
	"github.com/movscript/movscript/internal/infra/cache"
)

var (
	ErrNotFound    = errors.New("script not found")
	ErrVersionSync = errors.New("script version sync failed")
)

type Service struct {
	repo  repository
	cache cache.Cache
}

type ListFilter struct {
	ProjectID  uint
	Type       string
	AssigneeID string
}

type CreateInput struct {
	ProjectID   uint
	AuthorID    uint
	CreatedByID *uint
	Script      dto.ScriptInput
}

type UpdateInput struct {
	ID          uint
	UpdatedByID *uint
	Script      dto.ScriptInput
}

type PatchInput struct {
	ID          uint
	UpdatedByID *uint
	Body        map[string]any
}

func (s *Service) List(ctx context.Context, filter ListFilter) ([]domainscript.ScriptSnapshot, error) {
	return s.repo.ListScripts(ctx, filter)
}

func (s *Service) Create(ctx context.Context, input CreateInput) (domainscript.ScriptSnapshot, error) {
	item := scriptSnapshotFromInput(input.Script)
	item.ProjectID = input.ProjectID
	NormalizeDefaults(&item)
	item.AuthorID = input.AuthorID
	if err := s.repo.CreateScript(ctx, &item); err != nil {
		return item, err
	}
	if err := s.ensureInitialVersion(ctx, &item, input.CreatedByID); err != nil {
		return item, wrapVersionSync(err)
	}
	s.bumpProgressVersion(ctx, item.ProjectID)
	return item, nil
}

func (s *Service) Get(ctx context.Context, id uint) (domainscript.ScriptSnapshot, error) {
	return s.repo.GetScript(ctx, id)
}

func (s *Service) Update(ctx context.Context, input UpdateInput) (domainscript.ScriptSnapshot, error) {
	item, err := s.Get(ctx, input.ID)
	if err != nil {
		return item, err
	}
	projectID := item.ProjectID
	next := scriptSnapshotFromInput(input.Script)
	next.ID = item.ID
	next.ProjectID = projectID
	next.CreatedAt = item.CreatedAt
	item.ProjectID = projectID
	item = next
	NormalizeDefaults(&item)
	if err := s.repo.SaveScript(ctx, &item); err != nil {
		return item, err
	}
	if err := s.ensureInitialVersion(ctx, &item, input.UpdatedByID); err != nil {
		return item, wrapVersionSync(err)
	}
	s.bumpProgressVersion(ctx, item.ProjectID)
	return item, nil
}

func (s *Service) Delete(ctx context.Context, id uint) error {
	projectID, err := s.repo.DeleteScript(ctx, id)
	if err != nil {
		return err
	}
	s.bumpProgressVersion(ctx, projectID)
	return nil
}

func (s *Service) Patch(ctx context.Context, input PatchInput) (domainscript.ScriptSnapshot, error) {
	item, err := s.Get(ctx, input.ID)
	if err != nil {
		return item, err
	}
	next := item
	if scriptType, ok := input.Body["script_type"].(string); ok {
		next.ScriptType = scriptType
	}
	NormalizeDefaults(&next)
	updates := dto.ScriptPatchUpdates(input.Body)
	if len(updates) > 0 {
		if err := s.repo.PatchScript(ctx, &item, updates); err != nil {
			return item, err
		}
	}
	item, err = s.repo.GetScript(ctx, item.ID)
	if err != nil {
		return item, err
	}
	if err := s.ensureInitialVersion(ctx, &item, input.UpdatedByID); err != nil {
		return item, wrapVersionSync(err)
	}
	s.bumpProgressVersion(ctx, item.ProjectID)
	return item, nil
}

func (s *Service) bumpProgressVersion(ctx context.Context, projectID uint) {
	if projectID == 0 {
		return
	}
	_, _ = s.cache.BumpVersion(ctx, fmt.Sprintf("project:%d:progress", projectID))
}

func NormalizeDefaults(item *domainscript.ScriptSnapshot) {
	domainscript.NormalizeDefaults(item)
}

func (s *Service) ensureInitialVersion(ctx context.Context, item *domainscript.ScriptSnapshot, createdByID *uint) error {
	if item == nil || item.ID == 0 {
		return nil
	}
	version, found, err := s.repo.FindInitialVersion(ctx, item.ProjectID, item.ID)
	if err != nil {
		return err
	}
	if found {
		updates := map[string]any{
			"title":       item.Title,
			"source_type": item.SourceType,
			"content":     item.Content,
			"raw_source":  item.RawSource,
			"summary":     item.Summary,
		}
		if version.Status == "" {
			updates["status"] = domainscript.ScriptVersionStatusActive
		}
		return s.repo.UpdateScriptVersionWithRelations(ctx, &version, updates)
	}
	domainVersion := domainscript.NewInitialVersion(*item, createdByID)
	return s.repo.CreateScriptVersionWithRelations(ctx, &domainVersion)
}

func wrapVersionSync(err error) error {
	if err == nil {
		return nil
	}
	return errors.Join(ErrVersionSync, err)
}

func scriptSnapshotFromInput(input dto.ScriptInput) domainscript.ScriptSnapshot {
	return domainscript.ScriptSnapshot{
		Title:                  input.Title,
		Description:            input.Description,
		Content:                input.Content,
		RawSource:              input.RawSource,
		ScriptType:             input.ScriptType,
		SourceType:             input.SourceType,
		Version:                input.Version,
		ParentScriptID:         input.ParentScriptID,
		AssigneeID:             input.AssigneeID,
		Summary:                input.Summary,
		Characters:             input.Characters,
		CharacterRelationships: input.CharacterRelationships,
		CoreSettings:           input.CoreSettings,
		Background:             input.Background,
		ScenesDesc:             input.ScenesDesc,
		Hook:                   input.Hook,
		PlotSummary:            input.PlotSummary,
		ScriptPoints:           input.ScriptPoints,
		PlannedSceneCount:      input.PlannedSceneCount,
		PlannedCharacterCount:  input.PlannedCharacterCount,
		TimeText:               input.TimeText,
		LocationText:           input.LocationText,
		StructuredCharacters:   input.StructuredCharacters,
		PlotBeats:              input.PlotBeats,
		Atmosphere:             input.Atmosphere,
		StructureJSON:          input.StructureJSON,
		EntityCandidates:       input.EntityCandidates,
		RelationshipCandidates: input.RelationshipCandidates,
		Order:                  input.Order,
	}
}

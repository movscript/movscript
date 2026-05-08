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
	patch := scriptPatchSpecFromBody(dto.ScriptPatchUpdates(input.Body))
	if !patch.Empty() {
		if err := s.repo.PatchScript(ctx, &item, patch); err != nil {
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
		return s.repo.UpdateScriptVersionWithRelations(ctx, &version, domainscript.InitialVersionSync(*item, version))
	}
	domainVersion := domainscript.NewInitialVersion(*item, createdByID)
	return s.repo.CreateScriptVersionWithRelations(ctx, &domainVersion)
}

func scriptPatchSpecFromBody(body map[string]any) domainscript.ScriptPatchSpec {
	var spec domainscript.ScriptPatchSpec
	if value, ok := body["title"].(string); ok {
		spec.Title = &value
	}
	if value, ok := body["description"].(string); ok {
		spec.Description = &value
	}
	if value, ok := body["content"].(string); ok {
		spec.Content = &value
	}
	if value, ok := body["raw_source"].(string); ok {
		spec.RawSource = &value
	}
	if value, ok := body["script_type"].(string); ok {
		spec.ScriptType = &value
	}
	if value, ok := body["source_type"].(string); ok {
		spec.SourceType = &value
	}
	if value, ok := intFromPatch(body["version"]); ok {
		spec.Version = &value
	}
	if value, ok := optionalUintFromPatch(body["parent_script_id"]); ok {
		spec.ParentScriptID = &value
	}
	if value, ok := optionalUintFromPatch(body["assignee_id"]); ok {
		spec.AssigneeID = &value
	}
	if value, ok := body["summary"].(string); ok {
		spec.Summary = &value
	}
	if value, ok := body["characters"].(string); ok {
		spec.Characters = &value
	}
	if value, ok := body["character_relationships"].(string); ok {
		spec.CharacterRelationships = &value
	}
	if value, ok := body["core_settings"].(string); ok {
		spec.CoreSettings = &value
	}
	if value, ok := body["background"].(string); ok {
		spec.Background = &value
	}
	if value, ok := body["scenes_desc"].(string); ok {
		spec.ScenesDesc = &value
	}
	if value, ok := body["hook"].(string); ok {
		spec.Hook = &value
	}
	if value, ok := body["plot_summary"].(string); ok {
		spec.PlotSummary = &value
	}
	if value, ok := body["script_points"].(string); ok {
		spec.ScriptPoints = &value
	}
	if value, ok := intFromPatch(body["planned_scene_count"]); ok {
		spec.PlannedSceneCount = &value
	}
	if value, ok := body["time_text"].(string); ok {
		spec.TimeText = &value
	}
	if value, ok := body["location_text"].(string); ok {
		spec.LocationText = &value
	}
	if value, ok := body["structured_characters"].(string); ok {
		spec.StructuredCharacters = &value
	}
	if value, ok := body["plot_beats"].(string); ok {
		spec.PlotBeats = &value
	}
	if value, ok := body["atmosphere"].(string); ok {
		spec.Atmosphere = &value
	}
	if value, ok := body["structure_json"].(string); ok {
		spec.StructureJSON = &value
	}
	if value, ok := body["entity_candidates"].(string); ok {
		spec.EntityCandidates = &value
	}
	if value, ok := body["relationship_candidates"].(string); ok {
		spec.RelationshipCandidates = &value
	}
	if value, ok := intFromPatch(body["order"]); ok {
		spec.Order = &value
	}
	return spec
}

func intFromPatch(value any) (int, bool) {
	switch typed := value.(type) {
	case int:
		return typed, true
	case int64:
		return int(typed), true
	case float64:
		return int(typed), true
	default:
		return 0, false
	}
}

func optionalUintFromPatch(value any) (*uint, bool) {
	switch typed := value.(type) {
	case nil:
		return nil, true
	case uint:
		v := typed
		return &v, true
	case int:
		if typed < 0 {
			return nil, false
		}
		v := uint(typed)
		return &v, true
	case int64:
		if typed < 0 {
			return nil, false
		}
		v := uint(typed)
		return &v, true
	case float64:
		if typed < 0 {
			return nil, false
		}
		v := uint(typed)
		return &v, true
	default:
		return nil, false
	}
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

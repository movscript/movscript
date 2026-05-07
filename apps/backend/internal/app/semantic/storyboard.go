package semantic

import (
	"context"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

type StoryboardScriptFilter struct {
	ProjectID       uint
	ScriptVersionID uint
	Status          string
}

type StoryboardScriptInput struct {
	ScriptVersionID *uint  `json:"script_version_id"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	Status          string `json:"status"`
	IsPrimary       bool   `json:"is_primary"`
	MetadataJSON    string `json:"metadata_json"`
}

type StoryboardVersionFilter struct {
	ProjectID          uint
	StoryboardScriptID uint
	Status             string
}

type StoryboardVersionInput struct {
	StoryboardScriptID uint   `json:"storyboard_script_id" binding:"required"`
	ParentVersionID    *uint  `json:"parent_version_id"`
	VersionNumber      int    `json:"version_number"`
	Title              string `json:"title"`
	Source             string `json:"source"`
	Status             string `json:"status"`
	SnapshotJSON       string `json:"snapshot_json"`
	MetadataJSON       string `json:"metadata_json"`
}

type StoryboardVersionPatchInput struct {
	ParentVersionID *uint  `json:"parent_version_id"`
	Title           string `json:"title"`
	Source          string `json:"source"`
	Status          string `json:"status"`
	SnapshotJSON    string `json:"snapshot_json"`
	MetadataJSON    string `json:"metadata_json"`
}

type StoryboardLineFilter struct {
	ProjectID           uint
	StoryboardScriptID  uint
	StoryboardVersionID uint
	Status              string
}

type StoryboardLineInput struct {
	StoryboardScriptID  uint    `json:"storyboard_script_id" binding:"required"`
	StoryboardVersionID *uint   `json:"storyboard_version_id"`
	SegmentID           *uint   `json:"segment_id"`
	SceneMomentID       *uint   `json:"scene_moment_id"`
	Order               int     `json:"order"`
	Kind                string  `json:"kind"`
	Title               string  `json:"title"`
	Description         string  `json:"description"`
	Dialogue            string  `json:"dialogue"`
	VisualIntent        string  `json:"visual_intent"`
	DurationSec         float64 `json:"duration_sec"`
	Status              string  `json:"status"`
	MetadataJSON        string  `json:"metadata_json"`
}

func (s *Service) ListStoryboardScripts(ctx context.Context, filter StoryboardScriptFilter) ([]domainsemantic.StoryboardScript, error) {
	return s.repo.ListStoryboardScripts(ctx, filter)
}

func (s *Service) CreateStoryboardScript(ctx context.Context, projectID uint, input StoryboardScriptInput) (domainsemantic.StoryboardScript, error) {
	if input.ScriptVersionID != nil {
		if err := s.ensureScriptVersionInProject(ctx, projectID, *input.ScriptVersionID); err != nil {
			return domainsemantic.StoryboardScript{}, err
		}
	}
	item := domainsemantic.NewStoryboardScript(domainsemantic.StoryboardScriptSpec{
		ProjectID:       projectID,
		ScriptVersionID: input.ScriptVersionID,
		Name:            input.Name,
		Description:     input.Description,
		Status:          input.Status,
		IsPrimary:       input.IsPrimary,
		MetadataJSON:    input.MetadataJSON,
	})
	return s.repo.CreateStoryboardScript(ctx, item)
}

func (s *Service) PatchStoryboardScript(ctx context.Context, projectID uint, id string, input StoryboardScriptInput) (domainsemantic.StoryboardScript, error) {
	item, err := s.repo.LoadStoryboardScript(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if input.ScriptVersionID != nil {
		if err := s.ensureScriptVersionInProject(ctx, projectID, *input.ScriptVersionID); err != nil {
			return item, err
		}
	}
	return s.repo.PatchStoryboardScript(ctx, item, compactUpdates(map[string]any{
		"script_version_id": input.ScriptVersionID,
		"name":              input.Name,
		"description":       input.Description,
		"status":            input.Status,
		"is_primary":        &input.IsPrimary,
		"metadata_json":     input.MetadataJSON,
	}))
}

func (s *Service) ListStoryboardVersions(ctx context.Context, filter StoryboardVersionFilter) ([]domainsemantic.StoryboardVersion, error) {
	return s.repo.ListStoryboardVersions(ctx, filter)
}

func (s *Service) CreateStoryboardVersion(ctx context.Context, projectID uint, input StoryboardVersionInput) (domainsemantic.StoryboardVersion, error) {
	if err := s.ensureOwnerInProject(ctx, projectID, "storyboard_script", input.StoryboardScriptID); err != nil {
		return domainsemantic.StoryboardVersion{}, err
	}
	versionNumber := input.VersionNumber
	if versionNumber == 0 {
		versionNumber = s.nextStoryboardVersionNumber(ctx, projectID, input.StoryboardScriptID)
	}
	item := domainsemantic.NewStoryboardVersion(domainsemantic.StoryboardVersionSpec{
		ProjectID:          projectID,
		StoryboardScriptID: input.StoryboardScriptID,
		ParentVersionID:    input.ParentVersionID,
		VersionNumber:      versionNumber,
		Title:              input.Title,
		Source:             input.Source,
		Status:             input.Status,
		SnapshotJSON:       input.SnapshotJSON,
		MetadataJSON:       input.MetadataJSON,
	})
	return s.repo.CreateStoryboardVersion(ctx, item)
}

func (s *Service) PatchStoryboardVersion(ctx context.Context, projectID uint, id string, input StoryboardVersionPatchInput) (domainsemantic.StoryboardVersion, error) {
	item, err := s.repo.LoadStoryboardVersion(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	return s.repo.PatchStoryboardVersion(ctx, item, compactUpdates(map[string]any{
		"parent_version_id": input.ParentVersionID,
		"title":             input.Title,
		"source":            input.Source,
		"status":            input.Status,
		"snapshot_json":     input.SnapshotJSON,
		"metadata_json":     input.MetadataJSON,
	}))
}

func (s *Service) ListStoryboardLines(ctx context.Context, filter StoryboardLineFilter) ([]domainsemantic.StoryboardLine, error) {
	return s.repo.ListStoryboardLines(ctx, filter)
}

func (s *Service) CreateStoryboardLine(ctx context.Context, projectID uint, input StoryboardLineInput) (domainsemantic.StoryboardLine, error) {
	if err := s.validateStoryboardLineOwners(ctx, projectID, input); err != nil {
		return domainsemantic.StoryboardLine{}, err
	}
	item := storyboardLineFromInput(projectID, input)
	return s.repo.CreateStoryboardLine(ctx, item)
}

func (s *Service) PatchStoryboardLine(ctx context.Context, projectID uint, id string, input StoryboardLineInput) (domainsemantic.StoryboardLine, error) {
	item, err := s.repo.LoadStoryboardLine(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateStoryboardLineOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	return s.repo.PatchStoryboardLine(ctx, item, compactUpdates(map[string]any{
		"storyboard_script_id":  input.StoryboardScriptID,
		"storyboard_version_id": input.StoryboardVersionID,
		"segment_id":            input.SegmentID,
		"scene_moment_id":       input.SceneMomentID,
		"order":                 input.Order,
		"kind":                  input.Kind,
		"title":                 input.Title,
		"description":           input.Description,
		"dialogue":              input.Dialogue,
		"visual_intent":         input.VisualIntent,
		"duration_sec":          input.DurationSec,
		"status":                input.Status,
		"metadata_json":         input.MetadataJSON,
	}))
}

func (s *Service) validateStoryboardLineOwners(ctx context.Context, projectID uint, input StoryboardLineInput) error {
	if err := s.ensureOwnerInProject(ctx, projectID, "storyboard_script", input.StoryboardScriptID); err != nil {
		return err
	}
	if err := s.validateScopedOwner(ctx, projectID, "storyboard_version", input.StoryboardVersionID); err != nil {
		return err
	}
	if err := s.validateScopedOwner(ctx, projectID, "segment", input.SegmentID); err != nil {
		return err
	}
	if err := s.validateScopedOwner(ctx, projectID, "scene_moment", input.SceneMomentID); err != nil {
		return err
	}
	return nil
}

func storyboardLineFromInput(projectID uint, input StoryboardLineInput) domainsemantic.StoryboardLine {
	return domainsemantic.NewStoryboardLine(domainsemantic.StoryboardLineSpec{
		ProjectID:           projectID,
		StoryboardScriptID:  input.StoryboardScriptID,
		StoryboardVersionID: input.StoryboardVersionID,
		SegmentID:           input.SegmentID,
		SceneMomentID:       input.SceneMomentID,
		Order:               input.Order,
		Kind:                input.Kind,
		Title:               input.Title,
		Description:         input.Description,
		Dialogue:            input.Dialogue,
		VisualIntent:        input.VisualIntent,
		DurationSec:         input.DurationSec,
		Status:              input.Status,
		MetadataJSON:        input.MetadataJSON,
	})
}

func (s *Service) nextStoryboardVersionNumber(ctx context.Context, projectID uint, storyboardScriptID uint) int {
	return s.repo.NextStoryboardVersionNumber(ctx, projectID, storyboardScriptID)
}

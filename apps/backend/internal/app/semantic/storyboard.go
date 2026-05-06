package semantic

import (
	"context"
	"strconv"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
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

func (s *Service) ListStoryboardScripts(ctx context.Context, filter StoryboardScriptFilter) ([]model.StoryboardScript, error) {
	items := make([]model.StoryboardScript, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ScriptVersionID > 0 {
		q = q.Where("script_version_id = ?", filter.ScriptVersionID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("is_primary desc, id desc").Find(&items).Error
	return items, err
}

func (s *Service) CreateStoryboardScript(ctx context.Context, projectID uint, input StoryboardScriptInput) (model.StoryboardScript, error) {
	if input.ScriptVersionID != nil {
		if err := s.ensureScriptVersionInProject(ctx, projectID, *input.ScriptVersionID); err != nil {
			return model.StoryboardScript{}, err
		}
	}
	item := model.StoryboardScript{
		ProjectID:       projectID,
		ScriptVersionID: input.ScriptVersionID,
		Name:            fallbackString(input.Name, "Storyboard Script"),
		Description:     input.Description,
		Status:          fallbackString(input.Status, "draft"),
		IsPrimary:       input.IsPrimary,
		MetadataJSON:    input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchStoryboardScript(ctx context.Context, projectID uint, id string, input StoryboardScriptInput) (model.StoryboardScript, error) {
	var item model.StoryboardScript
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if input.ScriptVersionID != nil {
		if err := s.ensureScriptVersionInProject(ctx, projectID, *input.ScriptVersionID); err != nil {
			return item, err
		}
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"script_version_id": input.ScriptVersionID,
		"name":              input.Name,
		"description":       input.Description,
		"status":            input.Status,
		"is_primary":        &input.IsPrimary,
		"metadata_json":     input.MetadataJSON,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListStoryboardVersions(ctx context.Context, filter StoryboardVersionFilter) ([]model.StoryboardVersion, error) {
	items := make([]model.StoryboardVersion, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.StoryboardScriptID > 0 {
		q = q.Where("storyboard_script_id = ?", filter.StoryboardScriptID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("storyboard_script_id, version_number desc, id desc").Find(&items).Error
	return items, err
}

func (s *Service) CreateStoryboardVersion(ctx context.Context, projectID uint, input StoryboardVersionInput) (model.StoryboardVersion, error) {
	if err := s.ensureOwnerInProject(ctx, projectID, "storyboard_script", input.StoryboardScriptID); err != nil {
		return model.StoryboardVersion{}, err
	}
	versionNumber := input.VersionNumber
	if versionNumber == 0 {
		versionNumber = s.nextStoryboardVersionNumber(ctx, projectID, input.StoryboardScriptID)
	}
	item := model.StoryboardVersion{
		ProjectID:          projectID,
		StoryboardScriptID: input.StoryboardScriptID,
		ParentVersionID:    input.ParentVersionID,
		VersionNumber:      versionNumber,
		Title:              fallbackString(input.Title, "Storyboard v"+strconv.Itoa(versionNumber)),
		Source:             fallbackString(input.Source, "manual"),
		Status:             fallbackString(input.Status, "draft"),
		SnapshotJSON:       input.SnapshotJSON,
		MetadataJSON:       input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchStoryboardVersion(ctx context.Context, projectID uint, id string, input StoryboardVersionPatchInput) (model.StoryboardVersion, error) {
	var item model.StoryboardVersion
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"parent_version_id": input.ParentVersionID,
		"title":             input.Title,
		"source":            input.Source,
		"status":            input.Status,
		"snapshot_json":     input.SnapshotJSON,
		"metadata_json":     input.MetadataJSON,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListStoryboardLines(ctx context.Context, filter StoryboardLineFilter) ([]model.StoryboardLine, error) {
	items := make([]model.StoryboardLine, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.StoryboardScriptID > 0 {
		q = q.Where("storyboard_script_id = ?", filter.StoryboardScriptID)
	}
	if filter.StoryboardVersionID > 0 {
		q = q.Where("storyboard_version_id = ?", filter.StoryboardVersionID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order(`storyboard_script_id, storyboard_version_id, "order", id`).Find(&items).Error
	return items, err
}

func (s *Service) CreateStoryboardLine(ctx context.Context, projectID uint, input StoryboardLineInput) (model.StoryboardLine, error) {
	if err := s.validateStoryboardLineOwners(ctx, projectID, input); err != nil {
		return model.StoryboardLine{}, err
	}
	item := storyboardLineFromInput(projectID, input)
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchStoryboardLine(ctx context.Context, projectID uint, id string, input StoryboardLineInput) (model.StoryboardLine, error) {
	var item model.StoryboardLine
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateStoryboardLineOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
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
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
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

func storyboardLineFromInput(projectID uint, input StoryboardLineInput) model.StoryboardLine {
	return model.StoryboardLine{
		ProjectID:           projectID,
		StoryboardScriptID:  input.StoryboardScriptID,
		StoryboardVersionID: input.StoryboardVersionID,
		SegmentID:           input.SegmentID,
		SceneMomentID:       input.SceneMomentID,
		Order:               input.Order,
		Kind:                fallbackString(input.Kind, "beat"),
		Title:               input.Title,
		Description:         input.Description,
		Dialogue:            input.Dialogue,
		VisualIntent:        input.VisualIntent,
		DurationSec:         input.DurationSec,
		Status:              fallbackString(input.Status, "draft"),
		MetadataJSON:        input.MetadataJSON,
	}
}

func (s *Service) nextStoryboardVersionNumber(ctx context.Context, projectID uint, storyboardScriptID uint) int {
	var maxVersion int
	s.db.WithContext(ctx).
		Model(&model.StoryboardVersion{}).
		Where("project_id = ? AND storyboard_script_id = ?", projectID, storyboardScriptID).
		Select("COALESCE(MAX(version_number), 0)").
		Scan(&maxVersion)
	return maxVersion + 1
}

package semantic

import (
	"context"
	"errors"
	"strings"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

func (s *Service) ListScriptVersions(ctx context.Context, filter ScriptVersionFilter) ([]model.ScriptVersion, error) {
	items := make([]model.ScriptVersion, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ScriptID > 0 {
		q = q.Where("script_id = ?", filter.ScriptID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("script_id, version_number desc, id desc").Find(&items).Error
	return items, err
}

func (s *Service) CreateScriptVersion(ctx context.Context, projectID uint, input CreateScriptVersionInput, createdByID *uint) (model.ScriptVersion, error) {
	var script model.Script
	if err := s.db.WithContext(ctx).Select("id, project_id, title, raw_source, content").First(&script, input.ScriptID).Error; err != nil || script.ProjectID != projectID {
		if err == nil {
			err = ErrScriptNotFound
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			err = ErrScriptNotFound
		}
		return model.ScriptVersion{}, err
	}

	item := model.ScriptVersion{
		ProjectID:       projectID,
		ScriptID:        input.ScriptID,
		ParentVersionID: input.ParentVersionID,
		VersionNumber:   input.VersionNumber,
		Title:           fallbackString(input.Title, script.Title),
		SourceType:      fallbackString(input.SourceType, "raw"),
		Content:         fallbackString(input.Content, script.Content),
		RawSource:       fallbackString(input.RawSource, script.RawSource),
		Summary:         input.Summary,
		Status:          fallbackString(input.Status, "draft"),
		CreatedByID:     createdByID,
	}
	if item.VersionNumber == 0 {
		item.VersionNumber = s.nextScriptVersionNumber(ctx, projectID, input.ScriptID)
	}
	if err := s.db.WithContext(ctx).Create(&item).Error; err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchScriptVersion(ctx context.Context, projectID uint, id string, input PatchScriptVersionInput) (model.ScriptVersion, error) {
	var item model.ScriptVersion
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	updates := compactUpdates(map[string]any{
		"title":             input.Title,
		"source_type":       input.SourceType,
		"content":           input.Content,
		"raw_source":        input.RawSource,
		"summary":           input.Summary,
		"status":            input.Status,
		"parent_version_id": input.ParentVersionID,
	})
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) nextScriptVersionNumber(ctx context.Context, projectID uint, scriptID uint) int {
	var maxVersion int
	s.db.WithContext(ctx).
		Model(&model.ScriptVersion{}).
		Where("project_id = ? AND script_id = ?", projectID, scriptID).
		Select("COALESCE(MAX(version_number), 0)").
		Scan(&maxVersion)
	return maxVersion + 1
}

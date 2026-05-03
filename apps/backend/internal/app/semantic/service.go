package semantic

import (
	"context"
	"errors"
	"strings"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("semantic item not found")
var ErrScriptNotFound = errors.New("script not found")
var ErrOwnerNotFound = errors.New("semantic owner not found")
var ErrOwnerWrongProject = errors.New("semantic owner does not belong to project")
var ErrOwnerInvalidType = errors.New("semantic owner type is invalid")
var ErrTextBlockNotFound = errors.New("production text block not found")
var ErrSegmentProductionMismatch = errors.New("segment production does not match text block production")

type Service struct {
	db *gorm.DB
}

type ErrInvalidInput struct {
	Err error
}

type ErrForbidden struct {
	Message string
}

func (e ErrForbidden) Error() string {
	if strings.TrimSpace(e.Message) == "" {
		return "forbidden"
	}
	return e.Message
}

func (e ErrInvalidInput) Error() string {
	if e.Err == nil {
		return "invalid semantic input"
	}
	return e.Err.Error()
}

func (e ErrInvalidInput) Unwrap() error {
	return e.Err
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type RelationFilter struct {
	ProjectID  uint
	Category   string
	Type       string
	SourceType string
	SourceID   uint
	TargetType string
	TargetID   uint
	Status     string
}

type ScriptVersionFilter struct {
	ProjectID uint
	ScriptID  uint
	Status    string
}

type CreateScriptVersionInput struct {
	ScriptID        uint   `json:"script_id" binding:"required"`
	ParentVersionID *uint  `json:"parent_version_id"`
	VersionNumber   int    `json:"version_number"`
	Title           string `json:"title"`
	SourceType      string `json:"source_type"`
	Content         string `json:"content"`
	RawSource       string `json:"raw_source"`
	Summary         string `json:"summary"`
	Status          string `json:"status"`
}

type PatchScriptVersionInput struct {
	ParentVersionID *uint  `json:"parent_version_id"`
	Title           string `json:"title"`
	SourceType      string `json:"source_type"`
	Content         string `json:"content"`
	RawSource       string `json:"raw_source"`
	Summary         string `json:"summary"`
	Status          string `json:"status"`
}

type SegmentFilter struct {
	ProjectID    uint
	ProductionID uint
	TextBlockID  uint
	Status       string
}

type CreateSegmentInput struct {
	ProductionID    *uint  `json:"production_id"`
	TextBlockID     *uint  `json:"text_block_id"`
	ParentSegmentID *uint  `json:"parent_segment_id"`
	Kind            string `json:"kind"`
	Order           int    `json:"order"`
	Title           string `json:"title"`
	Summary         string `json:"summary"`
	Content         string `json:"content"`
	Status          string `json:"status"`
	MetadataJSON    string `json:"metadata_json"`
}

type PatchSegmentInput struct {
	ProductionID    *uint  `json:"production_id"`
	TextBlockID     *uint  `json:"text_block_id"`
	ParentSegmentID *uint  `json:"parent_segment_id"`
	Kind            string `json:"kind"`
	Order           int    `json:"order"`
	Title           string `json:"title"`
	Summary         string `json:"summary"`
	Content         string `json:"content"`
	Status          string `json:"status"`
	MetadataJSON    string `json:"metadata_json"`
}

type ProductionTextBlockFilter struct {
	ProjectID    uint
	ProductionID uint
	Status       string
}

type CreateProductionTextBlockInput struct {
	ProductionID  uint   `json:"production_id" binding:"required"`
	ParentBlockID *uint  `json:"parent_block_id"`
	Kind          string `json:"kind"`
	Order         int    `json:"order"`
	Title         string `json:"title"`
	Content       string `json:"content"`
	Summary       string `json:"summary"`
	SourceType    string `json:"source_type"`
	Status        string `json:"status"`
	MetadataJSON  string `json:"metadata_json"`
}

type PatchProductionTextBlockInput struct {
	ProductionID  *uint  `json:"production_id"`
	ParentBlockID *uint  `json:"parent_block_id"`
	Kind          string `json:"kind"`
	Order         int    `json:"order"`
	Title         string `json:"title"`
	Content       string `json:"content"`
	Summary       string `json:"summary"`
	SourceType    string `json:"source_type"`
	Status        string `json:"status"`
	MetadataJSON  string `json:"metadata_json"`
}

type SceneMomentFilter struct {
	ProjectID uint
	SegmentID uint
}

type CreateSceneMomentInput struct {
	SegmentID     *uint  `json:"segment_id"`
	Order         int    `json:"order"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	TimeText      string `json:"time_text"`
	LocationText  string `json:"location_text"`
	ConditionText string `json:"condition_text"`
	ActionText    string `json:"action_text"`
	Mood          string `json:"mood"`
	Status        string `json:"status"`
	MetadataJSON  string `json:"metadata_json"`
}

type PatchSceneMomentInput struct {
	SegmentID     *uint  `json:"segment_id"`
	Order         int    `json:"order"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	TimeText      string `json:"time_text"`
	LocationText  string `json:"location_text"`
	ConditionText string `json:"condition_text"`
	ActionText    string `json:"action_text"`
	Mood          string `json:"mood"`
	Status        string `json:"status"`
	MetadataJSON  string `json:"metadata_json"`
}

type ProductionFilter struct {
	ProjectID  uint
	Status     string
	SourceType string
}

type ProductionInput struct {
	ScriptVersionID   *uint  `json:"script_version_id"`
	PreviewTimelineID *uint  `json:"preview_timeline_id"`
	Name              string `json:"name"`
	Description       string `json:"description"`
	Status            string `json:"status"`
	SourceType        string `json:"source_type"`
	OwnerLabel        string `json:"owner_label"`
	Progress          int    `json:"progress"`
	MetadataJSON      string `json:"metadata_json"`
}

type ContentUnitFilter struct {
	ProjectID     uint
	ProductionID  uint
	SegmentID     uint
	SceneMomentID uint
}

type ContentUnitInput struct {
	ProductionID     *uint   `json:"production_id"`
	SegmentID        *uint   `json:"segment_id"`
	SceneMomentID    *uint   `json:"scene_moment_id"`
	Kind             string  `json:"kind"`
	Order            int     `json:"order"`
	Title            string  `json:"title"`
	Description      string  `json:"description"`
	Prompt           string  `json:"prompt"`
	DurationSec      float64 `json:"duration_sec"`
	ShotSize         string  `json:"shot_size"`
	CameraAngle      string  `json:"camera_angle"`
	CameraHeight     string  `json:"camera_height"`
	CameraMotion     string  `json:"camera_motion"`
	MotionIntensity  string  `json:"motion_intensity"`
	CameraSpeed      string  `json:"camera_speed"`
	Lens             string  `json:"lens"`
	FocalLength      string  `json:"focal_length"`
	FocusSubject     string  `json:"focus_subject"`
	CompositionStart string  `json:"composition_start"`
	CompositionEnd   string  `json:"composition_end"`
	Stabilization    string  `json:"stabilization"`
	CameraParamsJSON string  `json:"camera_params_json"`
	CameraNotes      string  `json:"camera_notes"`
	Status           string  `json:"status"`
	MetadataJSON     string  `json:"metadata_json"`
}

type KeyframeFilter struct {
	ProjectID     uint
	ProductionID  uint
	SceneMomentID uint
	ContentUnitID uint
}

type KeyframeInput struct {
	ProductionID  *uint  `json:"production_id"`
	SceneMomentID *uint  `json:"scene_moment_id"`
	ContentUnitID *uint  `json:"content_unit_id"`
	ResourceID    *uint  `json:"resource_id"`
	CanvasID      *uint  `json:"canvas_id"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Prompt        string `json:"prompt"`
	Order         int    `json:"order"`
	Status        string `json:"status"`
	MetadataJSON  string `json:"metadata_json"`
}

type PreviewTimelineFilter struct {
	ProjectID    uint
	ProductionID uint
}

type PreviewTimelineInput struct {
	ProductionID    *uint   `json:"production_id"`
	ScriptVersionID *uint   `json:"script_version_id"`
	Name            string  `json:"name"`
	Status          string  `json:"status"`
	DurationSec     float64 `json:"duration_sec"`
	IsPrimary       bool    `json:"is_primary"`
	MetadataJSON    string  `json:"metadata_json"`
}

type PreviewTimelineItemFilter struct {
	ProjectID         uint
	PreviewTimelineID uint
	Status            string
}

type PreviewTimelineItemInput struct {
	PreviewTimelineID uint    `json:"preview_timeline_id"`
	SegmentID         *uint   `json:"segment_id"`
	SceneMomentID     *uint   `json:"scene_moment_id"`
	ContentUnitID     *uint   `json:"content_unit_id"`
	KeyframeID        *uint   `json:"keyframe_id"`
	Kind              string  `json:"kind"`
	Order             int     `json:"order"`
	StartSec          float64 `json:"start_sec"`
	DurationSec       float64 `json:"duration_sec"`
	Label             string  `json:"label"`
	Status            string  `json:"status"`
	MetadataJSON      string  `json:"metadata_json"`
}

func (s *Service) ListRelations(ctx context.Context, filter RelationFilter) ([]model.EntityRelation, error) {
	items := make([]model.EntityRelation, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if category := strings.TrimSpace(filter.Category); category != "" {
		q = q.Where("category = ?", category)
	}
	if relationType := strings.TrimSpace(filter.Type); relationType != "" {
		q = q.Where("type = ?", relationType)
	}
	if sourceType := strings.TrimSpace(filter.SourceType); sourceType != "" {
		q = q.Where("source_type = ?", sourceType)
	}
	if filter.SourceID > 0 {
		q = q.Where("source_id = ?", filter.SourceID)
	}
	if targetType := strings.TrimSpace(filter.TargetType); targetType != "" {
		q = q.Where("target_type = ?", targetType)
	}
	if filter.TargetID > 0 {
		q = q.Where("target_id = ?", filter.TargetID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("category, type, source_type, source_id, \"order\", target_type, target_id, id").Find(&items).Error
	return items, err
}

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

func (s *Service) ListSegments(ctx context.Context, filter SegmentFilter) ([]model.Segment, error) {
	items := make([]model.Segment, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if filter.TextBlockID > 0 {
		q = q.Where("text_block_id = ?", filter.TextBlockID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order(`production_id, text_block_id, "order", id`).Find(&items).Error
	return items, err
}

func (s *Service) CreateSegment(ctx context.Context, projectID uint, input CreateSegmentInput) (model.Segment, error) {
	productionID, textBlockID, err := s.resolveSegmentOwners(ctx, projectID, input.ProductionID, input.TextBlockID)
	if err != nil {
		return model.Segment{}, err
	}
	item := model.Segment{
		ProjectID:       projectID,
		ProductionID:    productionID,
		TextBlockID:     textBlockID,
		ParentSegmentID: input.ParentSegmentID,
		Kind:            fallbackString(input.Kind, "section"),
		Order:           input.Order,
		Title:           input.Title,
		Summary:         input.Summary,
		Content:         input.Content,
		Status:          fallbackString(input.Status, "draft"),
		MetadataJSON:    input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchSegment(ctx context.Context, projectID uint, id string, input PatchSegmentInput) (model.Segment, error) {
	var item model.Segment
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	updates := compactUpdates(map[string]any{
		"parent_segment_id": input.ParentSegmentID,
		"kind":              input.Kind,
		"order":             input.Order,
		"title":             input.Title,
		"summary":           input.Summary,
		"content":           input.Content,
		"status":            input.Status,
		"metadata_json":     input.MetadataJSON,
	})
	if input.TextBlockID != nil || input.ProductionID != nil {
		productionID, textBlockID, err := s.resolveSegmentOwners(ctx, projectID, input.ProductionID, input.TextBlockID)
		if err != nil {
			return item, err
		}
		if productionID != nil {
			updates["production_id"] = *productionID
		}
		if textBlockID != nil {
			updates["text_block_id"] = *textBlockID
		}
	}
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListProductionTextBlocks(ctx context.Context, filter ProductionTextBlockFilter) ([]model.ProductionTextBlock, error) {
	items := make([]model.ProductionTextBlock, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order(`production_id, "order", id`).Find(&items).Error
	return items, err
}

func (s *Service) CreateProductionTextBlock(ctx context.Context, projectID uint, input CreateProductionTextBlockInput) (model.ProductionTextBlock, error) {
	if err := s.ensureProductionInProject(ctx, projectID, input.ProductionID); err != nil {
		return model.ProductionTextBlock{}, err
	}
	if input.ParentBlockID != nil {
		if err := s.ensureProductionTextBlockInProject(ctx, projectID, *input.ParentBlockID); err != nil {
			return model.ProductionTextBlock{}, err
		}
	}
	item := model.ProductionTextBlock{
		ProjectID:     projectID,
		ProductionID:  input.ProductionID,
		ParentBlockID: input.ParentBlockID,
		Kind:          fallbackString(input.Kind, "section"),
		Order:         input.Order,
		Title:         input.Title,
		Content:       input.Content,
		Summary:       input.Summary,
		SourceType:    fallbackString(input.SourceType, "manual"),
		Status:        fallbackString(input.Status, "draft"),
		MetadataJSON:  input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchProductionTextBlock(ctx context.Context, projectID uint, id string, input PatchProductionTextBlockInput) (model.ProductionTextBlock, error) {
	var item model.ProductionTextBlock
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if input.ProductionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *input.ProductionID); err != nil {
			return item, err
		}
	}
	if input.ParentBlockID != nil {
		if err := s.ensureProductionTextBlockInProject(ctx, projectID, *input.ParentBlockID); err != nil {
			return item, err
		}
	}
	updates := compactUpdates(map[string]any{
		"parent_block_id": input.ParentBlockID,
		"kind":            input.Kind,
		"order":           input.Order,
		"title":           input.Title,
		"content":         input.Content,
		"summary":         input.Summary,
		"source_type":     input.SourceType,
		"status":          input.Status,
		"metadata_json":   input.MetadataJSON,
	})
	if input.ProductionID != nil {
		updates["production_id"] = *input.ProductionID
	}
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListSceneMoments(ctx context.Context, filter SceneMomentFilter) ([]model.SceneMoment, error) {
	items := make([]model.SceneMoment, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.SegmentID > 0 {
		q = q.Where("segment_id = ?", filter.SegmentID)
	}
	err := q.Order(`segment_id, "order", id`).Find(&items).Error
	return items, err
}

func (s *Service) CreateSceneMoment(ctx context.Context, projectID uint, input CreateSceneMomentInput) (model.SceneMoment, error) {
	if input.SegmentID != nil {
		if err := s.ensureSegmentInProject(ctx, projectID, *input.SegmentID); err != nil {
			return model.SceneMoment{}, err
		}
	}
	item := model.SceneMoment{
		ProjectID:     projectID,
		SegmentID:     input.SegmentID,
		Order:         input.Order,
		Title:         input.Title,
		Description:   input.Description,
		TimeText:      input.TimeText,
		LocationText:  input.LocationText,
		ConditionText: input.ConditionText,
		ActionText:    input.ActionText,
		Mood:          input.Mood,
		Status:        fallbackString(input.Status, "draft"),
		MetadataJSON:  input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchSceneMoment(ctx context.Context, projectID uint, id string, input PatchSceneMomentInput) (model.SceneMoment, error) {
	var item model.SceneMoment
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if input.SegmentID != nil {
		if err := s.ensureSegmentInProject(ctx, projectID, *input.SegmentID); err != nil {
			return item, err
		}
	}
	updates := compactUpdates(map[string]any{
		"segment_id":     input.SegmentID,
		"order":          input.Order,
		"title":          input.Title,
		"description":    input.Description,
		"time_text":      input.TimeText,
		"location_text":  input.LocationText,
		"condition_text": input.ConditionText,
		"action_text":    input.ActionText,
		"mood":           input.Mood,
		"status":         input.Status,
		"metadata_json":  input.MetadataJSON,
	})
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListProductions(ctx context.Context, filter ProductionFilter) ([]model.Production, error) {
	items := make([]model.Production, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if sourceType := strings.TrimSpace(filter.SourceType); sourceType != "" {
		q = q.Where("source_type = ?", sourceType)
	}
	err := q.Order("updated_at desc, id desc").Find(&items).Error
	return items, err
}

func (s *Service) CreateProduction(ctx context.Context, projectID uint, input ProductionInput) (model.Production, error) {
	if err := s.validateProductionOwners(ctx, projectID, input.ScriptVersionID, input.PreviewTimelineID); err != nil {
		return model.Production{}, err
	}
	item := model.Production{
		ProjectID:         projectID,
		ScriptVersionID:   input.ScriptVersionID,
		PreviewTimelineID: input.PreviewTimelineID,
		Name:              input.Name,
		Description:       input.Description,
		Status:            fallbackString(input.Status, "planning"),
		SourceType:        fallbackString(input.SourceType, "direct"),
		OwnerLabel:        fallbackString(input.OwnerLabel, "导演组"),
		Progress:          input.Progress,
		MetadataJSON:      input.MetadataJSON,
	}
	if item.Name == "" {
		item.Name = "未命名制作"
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchProduction(ctx context.Context, projectID uint, id string, input ProductionInput) (model.Production, error) {
	var item model.Production
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateProductionOwners(ctx, projectID, input.ScriptVersionID, input.PreviewTimelineID); err != nil {
		return item, err
	}
	updates := compactUpdates(map[string]any{
		"script_version_id":   input.ScriptVersionID,
		"preview_timeline_id": input.PreviewTimelineID,
		"name":                input.Name,
		"description":         input.Description,
		"status":              input.Status,
		"source_type":         input.SourceType,
		"owner_label":         input.OwnerLabel,
		"progress":            input.Progress,
		"metadata_json":       input.MetadataJSON,
	})
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListContentUnits(ctx context.Context, filter ContentUnitFilter) ([]model.ContentUnit, error) {
	items := make([]model.ContentUnit, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if filter.SegmentID > 0 {
		q = q.Where("segment_id = ?", filter.SegmentID)
	}
	if filter.SceneMomentID > 0 {
		q = q.Where("scene_moment_id = ?", filter.SceneMomentID)
	}
	err := q.Order(`segment_id, scene_moment_id, "order", id`).Find(&items).Error
	return items, err
}

func (s *Service) CreateContentUnit(ctx context.Context, projectID uint, input ContentUnitInput) (model.ContentUnit, error) {
	if err := s.validateContentUnitOwners(ctx, projectID, input.ProductionID, input.SegmentID, input.SceneMomentID); err != nil {
		return model.ContentUnit{}, err
	}
	item := contentUnitFromInput(projectID, input)
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchContentUnit(ctx context.Context, projectID uint, id string, input ContentUnitInput) (model.ContentUnit, error) {
	var item model.ContentUnit
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateContentUnitOwners(ctx, projectID, input.ProductionID, input.SegmentID, input.SceneMomentID); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, contentUnitUpdates(input)); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListKeyframes(ctx context.Context, filter KeyframeFilter) ([]model.Keyframe, error) {
	items := make([]model.Keyframe, 0)
	q := s.db.WithContext(ctx).Preload("Resource").Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if filter.SceneMomentID > 0 {
		q = q.Where("scene_moment_id = ?", filter.SceneMomentID)
	}
	if filter.ContentUnitID > 0 {
		q = q.Where("content_unit_id = ?", filter.ContentUnitID)
	}
	err := q.Order(`content_unit_id, scene_moment_id, "order", id`).Find(&items).Error
	return items, err
}

func (s *Service) CreateKeyframe(ctx context.Context, projectID uint, input KeyframeInput) (model.Keyframe, error) {
	if err := s.validateKeyframeOwners(ctx, projectID, input.ProductionID, input.SceneMomentID, input.ContentUnitID); err != nil {
		return model.Keyframe{}, err
	}
	item := model.Keyframe{
		ProjectID:     projectID,
		ProductionID:  input.ProductionID,
		SceneMomentID: input.SceneMomentID,
		ContentUnitID: input.ContentUnitID,
		ResourceID:    input.ResourceID,
		CanvasID:      input.CanvasID,
		Title:         input.Title,
		Description:   input.Description,
		Prompt:        input.Prompt,
		Order:         input.Order,
		Status:        fallbackString(input.Status, "generated"),
		MetadataJSON:  input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchKeyframe(ctx context.Context, projectID uint, id string, input KeyframeInput) (model.Keyframe, error) {
	var item model.Keyframe
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateKeyframeOwners(ctx, projectID, input.ProductionID, input.SceneMomentID, input.ContentUnitID); err != nil {
		return item, err
	}
	updates := compactUpdates(map[string]any{
		"production_id":   input.ProductionID,
		"scene_moment_id": input.SceneMomentID,
		"content_unit_id": input.ContentUnitID,
		"resource_id":     input.ResourceID,
		"canvas_id":       input.CanvasID,
		"title":           input.Title,
		"description":     input.Description,
		"prompt":          input.Prompt,
		"order":           input.Order,
		"status":          input.Status,
		"metadata_json":   input.MetadataJSON,
	})
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListPreviewTimelines(ctx context.Context, filter PreviewTimelineFilter) ([]model.PreviewTimeline, error) {
	items := make([]model.PreviewTimeline, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	err := q.Order("is_primary desc, id desc").Find(&items).Error
	return items, err
}

func (s *Service) CreatePreviewTimeline(ctx context.Context, projectID uint, input PreviewTimelineInput) (model.PreviewTimeline, error) {
	if err := s.validatePreviewTimelineOwners(ctx, projectID, input.ProductionID); err != nil {
		return model.PreviewTimeline{}, err
	}
	item := model.PreviewTimeline{
		ProjectID:       projectID,
		ProductionID:    input.ProductionID,
		ScriptVersionID: input.ScriptVersionID,
		Name:            fallbackString(input.Name, "Preview"),
		Status:          fallbackString(input.Status, "draft"),
		DurationSec:     input.DurationSec,
		IsPrimary:       input.IsPrimary,
		MetadataJSON:    input.MetadataJSON,
	}
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchPreviewTimeline(ctx context.Context, projectID uint, id string, input PreviewTimelineInput) (model.PreviewTimeline, error) {
	var item model.PreviewTimeline
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validatePreviewTimelineOwners(ctx, projectID, input.ProductionID); err != nil {
		return item, err
	}
	updates := compactUpdates(map[string]any{
		"production_id":     input.ProductionID,
		"script_version_id": input.ScriptVersionID,
		"name":              input.Name,
		"status":            input.Status,
		"duration_sec":      input.DurationSec,
		"is_primary":        &input.IsPrimary,
		"metadata_json":     input.MetadataJSON,
	})
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListPreviewTimelineItems(ctx context.Context, filter PreviewTimelineItemFilter) ([]model.PreviewTimelineItem, error) {
	items := make([]model.PreviewTimelineItem, 0)
	q := s.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.PreviewTimelineID > 0 {
		q = q.Where("preview_timeline_id = ?", filter.PreviewTimelineID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	order := `preview_timeline_id, "order", id`
	if filter.PreviewTimelineID > 0 {
		order = `"order", id`
	}
	err := q.Order(order).Find(&items).Error
	return items, err
}

func (s *Service) CreatePreviewTimelineItem(ctx context.Context, projectID uint, timelineID uint, input PreviewTimelineItemInput) (model.PreviewTimelineItem, error) {
	if timelineID == 0 {
		timelineID = input.PreviewTimelineID
	}
	if err := s.ensurePreviewTimelineInProject(ctx, projectID, timelineID); err != nil {
		return model.PreviewTimelineItem{}, err
	}
	item := previewTimelineItemFromInput(projectID, timelineID, input)
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchPreviewTimelineItem(ctx context.Context, projectID uint, id string, timelineID uint, input PreviewTimelineItemInput) (model.PreviewTimelineItem, error) {
	var item model.PreviewTimelineItem
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if timelineID > 0 {
		if item.PreviewTimelineID != timelineID {
			return item, ErrNotFound
		}
	} else {
		timelineID = input.PreviewTimelineID
		if err := s.ensurePreviewTimelineInProject(ctx, projectID, timelineID); err != nil {
			return item, err
		}
	}
	updates := previewTimelineItemUpdates(input)
	if timelineID > 0 && input.PreviewTimelineID > 0 {
		updates["preview_timeline_id"] = timelineID
	}
	if err := s.PatchItem(ctx, &item, updates); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) LoadProjectItem(ctx context.Context, projectID uint, item any, id string) error {
	if err := s.db.WithContext(ctx).Where("project_id = ?", projectID).First(item, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (s *Service) CreateItem(ctx context.Context, item any) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		return model.SyncCoreEntityRelations(tx, item)
	})
}

func (s *Service) PatchItem(ctx context.Context, item any, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(item).Updates(updates).Error; err != nil {
			return err
		}
		return model.SyncCoreEntityRelations(tx, item)
	})
}

func (s *Service) ReloadItem(ctx context.Context, item any) error {
	return s.db.WithContext(ctx).First(item).Error
}

func (s *Service) DeleteItem(ctx context.Context, item any) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(item).Error; err != nil {
			return err
		}
		return model.DeleteCoreEntityRelations(tx, item)
	})
}

func (s *Service) resolveSegmentOwners(ctx context.Context, projectID uint, productionID *uint, textBlockID *uint) (*uint, *uint, error) {
	if productionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *productionID); err != nil {
			return nil, nil, err
		}
	}
	if textBlockID == nil {
		return productionID, nil, nil
	}

	var block model.ProductionTextBlock
	if err := s.db.WithContext(ctx).Select("id, project_id, production_id").First(&block, *textBlockID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, ErrTextBlockNotFound
		}
		return nil, nil, err
	}
	if block.ProjectID != projectID {
		return nil, nil, ErrOwnerWrongProject
	}
	if productionID != nil && *productionID != block.ProductionID {
		return nil, nil, ErrSegmentProductionMismatch
	}
	resolvedProductionID := block.ProductionID
	return &resolvedProductionID, textBlockID, nil
}

func (s *Service) ensureProductionInProject(ctx context.Context, projectID uint, productionID uint) error {
	if productionID == 0 {
		return ErrOwnerNotFound
	}
	var production model.Production
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&production, productionID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if production.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) ensureProductionTextBlockInProject(ctx context.Context, projectID uint, blockID uint) error {
	if blockID == 0 {
		return ErrOwnerNotFound
	}
	var block model.ProductionTextBlock
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&block, blockID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if block.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) ensureSegmentInProject(ctx context.Context, projectID uint, segmentID uint) error {
	if segmentID == 0 {
		return ErrOwnerNotFound
	}
	var segment model.Segment
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&segment, segmentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if segment.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) validateProductionOwners(ctx context.Context, projectID uint, scriptVersionID *uint, previewTimelineID *uint) error {
	if scriptVersionID != nil {
		if err := s.ensureScriptVersionInProject(ctx, projectID, *scriptVersionID); err != nil {
			return err
		}
	}
	if previewTimelineID != nil {
		if err := s.ensurePreviewTimelineInProject(ctx, projectID, *previewTimelineID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateContentUnitOwners(ctx context.Context, projectID uint, productionID *uint, segmentID *uint, sceneMomentID *uint) error {
	if productionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *productionID); err != nil {
			return err
		}
	}
	if segmentID != nil {
		if err := s.ensureSegmentInProject(ctx, projectID, *segmentID); err != nil {
			return err
		}
	}
	if sceneMomentID != nil {
		if err := s.ensureSceneMomentInProject(ctx, projectID, *sceneMomentID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateKeyframeOwners(ctx context.Context, projectID uint, productionID *uint, sceneMomentID *uint, contentUnitID *uint) error {
	if productionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *productionID); err != nil {
			return err
		}
	}
	if sceneMomentID != nil {
		if err := s.ensureSceneMomentInProject(ctx, projectID, *sceneMomentID); err != nil {
			return err
		}
	}
	if contentUnitID != nil {
		if err := s.ensureContentUnitInProject(ctx, projectID, *contentUnitID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validatePreviewTimelineOwners(ctx context.Context, projectID uint, productionID *uint) error {
	if productionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *productionID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) EnsurePreviewTimelineInProject(ctx context.Context, projectID uint, previewTimelineID uint) error {
	return s.ensurePreviewTimelineInProject(ctx, projectID, previewTimelineID)
}

func (s *Service) ensureScriptVersionInProject(ctx context.Context, projectID uint, scriptVersionID uint) error {
	if scriptVersionID == 0 {
		return ErrOwnerNotFound
	}
	var item model.ScriptVersion
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, scriptVersionID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) ensurePreviewTimelineInProject(ctx context.Context, projectID uint, previewTimelineID uint) error {
	if previewTimelineID == 0 {
		return ErrOwnerNotFound
	}
	var item model.PreviewTimeline
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, previewTimelineID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) ensureSceneMomentInProject(ctx context.Context, projectID uint, sceneMomentID uint) error {
	if sceneMomentID == 0 {
		return ErrOwnerNotFound
	}
	var item model.SceneMoment
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, sceneMomentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) ensureContentUnitInProject(ctx context.Context, projectID uint, contentUnitID uint) error {
	if contentUnitID == 0 {
		return ErrOwnerNotFound
	}
	var item model.ContentUnit
	if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, contentUnitID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if item.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func contentUnitFromInput(projectID uint, input ContentUnitInput) model.ContentUnit {
	return model.ContentUnit{
		ProjectID:        projectID,
		ProductionID:     input.ProductionID,
		SegmentID:        input.SegmentID,
		SceneMomentID:    input.SceneMomentID,
		Kind:             fallbackString(input.Kind, "shot"),
		Order:            input.Order,
		Title:            input.Title,
		Description:      input.Description,
		Prompt:           input.Prompt,
		DurationSec:      input.DurationSec,
		ShotSize:         input.ShotSize,
		CameraAngle:      input.CameraAngle,
		CameraHeight:     input.CameraHeight,
		CameraMotion:     input.CameraMotion,
		MotionIntensity:  input.MotionIntensity,
		CameraSpeed:      input.CameraSpeed,
		Lens:             input.Lens,
		FocalLength:      input.FocalLength,
		FocusSubject:     input.FocusSubject,
		CompositionStart: input.CompositionStart,
		CompositionEnd:   input.CompositionEnd,
		Stabilization:    input.Stabilization,
		CameraParamsJSON: input.CameraParamsJSON,
		CameraNotes:      input.CameraNotes,
		Status:           fallbackString(input.Status, "draft"),
		MetadataJSON:     input.MetadataJSON,
	}
}

func contentUnitUpdates(input ContentUnitInput) map[string]any {
	return compactUpdates(map[string]any{
		"production_id":      input.ProductionID,
		"segment_id":         input.SegmentID,
		"scene_moment_id":    input.SceneMomentID,
		"kind":               input.Kind,
		"order":              input.Order,
		"title":              input.Title,
		"description":        input.Description,
		"prompt":             input.Prompt,
		"duration_sec":       input.DurationSec,
		"shot_size":          input.ShotSize,
		"camera_angle":       input.CameraAngle,
		"camera_height":      input.CameraHeight,
		"camera_motion":      input.CameraMotion,
		"motion_intensity":   input.MotionIntensity,
		"camera_speed":       input.CameraSpeed,
		"lens":               input.Lens,
		"focal_length":       input.FocalLength,
		"focus_subject":      input.FocusSubject,
		"composition_start":  input.CompositionStart,
		"composition_end":    input.CompositionEnd,
		"stabilization":      input.Stabilization,
		"camera_params_json": input.CameraParamsJSON,
		"camera_notes":       input.CameraNotes,
		"status":             input.Status,
		"metadata_json":      input.MetadataJSON,
	})
}

func previewTimelineItemFromInput(projectID uint, timelineID uint, input PreviewTimelineItemInput) model.PreviewTimelineItem {
	return model.PreviewTimelineItem{
		ProjectID:         projectID,
		PreviewTimelineID: timelineID,
		SegmentID:         input.SegmentID,
		SceneMomentID:     input.SceneMomentID,
		ContentUnitID:     input.ContentUnitID,
		KeyframeID:        input.KeyframeID,
		Kind:              fallbackString(input.Kind, "keyframe"),
		Order:             input.Order,
		StartSec:          input.StartSec,
		DurationSec:       input.DurationSec,
		Label:             input.Label,
		Status:            fallbackString(input.Status, "draft"),
		MetadataJSON:      input.MetadataJSON,
	}
}

func previewTimelineItemUpdates(input PreviewTimelineItemInput) map[string]any {
	return compactUpdates(map[string]any{
		"segment_id":      input.SegmentID,
		"scene_moment_id": input.SceneMomentID,
		"content_unit_id": input.ContentUnitID,
		"keyframe_id":     input.KeyframeID,
		"kind":            input.Kind,
		"order":           input.Order,
		"start_sec":       input.StartSec,
		"duration_sec":    input.DurationSec,
		"label":           input.Label,
		"status":          input.Status,
		"metadata_json":   input.MetadataJSON,
	})
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

func fallbackString(value string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func compactUpdates(values map[string]any) map[string]any {
	updates := map[string]any{}
	for key, value := range values {
		switch v := value.(type) {
		case string:
			if strings.TrimSpace(v) == "" {
				continue
			}
		case *uint:
			if v == nil {
				continue
			}
		case nil:
			continue
		}
		updates[key] = value
	}
	return updates
}

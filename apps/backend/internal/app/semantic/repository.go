package semantic

import (
	"context"
	"errors"
	"strings"

	"github.com/movscript/movscript/internal/app/entityrelation"
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

type repository interface {
	ListRelations(ctx context.Context, filter RelationFilter) ([]model.EntityRelation, error)
	ListScriptVersions(ctx context.Context, filter ScriptVersionFilter) ([]model.ScriptVersion, error)
	LoadScriptForProject(ctx context.Context, projectID uint, scriptID uint) (model.Script, error)
	CreateScriptVersion(ctx context.Context, projectID uint, input CreateScriptVersionInput, createdByID *uint) (model.ScriptVersion, error)
	NextScriptVersionNumber(ctx context.Context, projectID uint, scriptID uint) int
	ListSegments(ctx context.Context, filter SegmentFilter) ([]model.Segment, error)
	ListProductionTextBlocks(ctx context.Context, filter ProductionTextBlockFilter) ([]model.ProductionTextBlock, error)
	ListSceneMoments(ctx context.Context, filter SceneMomentFilter) ([]model.SceneMoment, error)
	ResolveSegmentOwners(ctx context.Context, projectID uint, productionID *uint, textBlockID *uint) (*uint, *uint, error)
	ListProductions(ctx context.Context, filter ProductionFilter) ([]model.Production, error)
	ListContentUnits(ctx context.Context, filter ContentUnitFilter) ([]model.ContentUnit, error)
	ListKeyframes(ctx context.Context, filter KeyframeFilter) ([]model.Keyframe, error)
	ListPreviewTimelines(ctx context.Context, filter PreviewTimelineFilter) ([]model.PreviewTimeline, error)
	ListPreviewTimelineItems(ctx context.Context, filter PreviewTimelineItemFilter) ([]model.PreviewTimelineItem, error)
	ListStoryboardScripts(ctx context.Context, filter StoryboardScriptFilter) ([]model.StoryboardScript, error)
	ListStoryboardVersions(ctx context.Context, filter StoryboardVersionFilter) ([]model.StoryboardVersion, error)
	ListStoryboardLines(ctx context.Context, filter StoryboardLineFilter) ([]model.StoryboardLine, error)
	NextStoryboardVersionNumber(ctx context.Context, projectID uint, storyboardScriptID uint) int
	ListWorkItems(ctx context.Context, filter WorkItemFilter) ([]model.WorkItem, error)
	ListWorkReviews(ctx context.Context, filter WorkReviewFilter) ([]model.WorkReview, error)
	ListWorkDependencies(ctx context.Context, filter WorkDependencyFilter) ([]model.WorkDependency, error)
	LoadProjectItem(ctx context.Context, projectID uint, item any, id string) error
	CreateItem(ctx context.Context, item any) error
	PatchItem(ctx context.Context, item any, updates map[string]any) error
	ReloadItem(ctx context.Context, item any) error
	DeleteItem(ctx context.Context, item any) error
	EnsureProductionInProject(ctx context.Context, projectID uint, productionID uint) error
	EnsureProductionTextBlockInProject(ctx context.Context, projectID uint, blockID uint) error
	EnsureSegmentInProject(ctx context.Context, projectID uint, segmentID uint) error
	EnsureScriptVersionInProject(ctx context.Context, projectID uint, scriptVersionID uint) error
	EnsurePreviewTimelineInProject(ctx context.Context, projectID uint, previewTimelineID uint) error
	EnsureSceneMomentInProject(ctx context.Context, projectID uint, sceneMomentID uint) error
	EnsureContentUnitInProject(ctx context.Context, projectID uint, contentUnitID uint) error
	EnsureUserInProject(ctx context.Context, projectID uint, userID uint) error
	EnsureJobInProject(ctx context.Context, projectID uint, jobID uint) error
}

type gormRepository struct {
	db *gorm.DB
}

func newRepository(db *gorm.DB) repository {
	return &gormRepository{db: db}
}

func (r *gormRepository) ListRelations(ctx context.Context, filter RelationFilter) ([]model.EntityRelation, error) {
	items := make([]model.EntityRelation, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
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
	if source := strings.TrimSpace(filter.Source); source != "" {
		q = q.Where("source = ?", source)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("category, type, source_type, source_id, \"order\", target_type, target_id, id").Find(&items).Error
	return items, err
}

func (r *gormRepository) ListScriptVersions(ctx context.Context, filter ScriptVersionFilter) ([]model.ScriptVersion, error) {
	items := make([]model.ScriptVersion, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ScriptID > 0 {
		q = q.Where("script_id = ?", filter.ScriptID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("script_id, version_number desc, id desc").Find(&items).Error
	return items, err
}

func (r *gormRepository) LoadScriptForProject(ctx context.Context, projectID uint, scriptID uint) (model.Script, error) {
	var script model.Script
	if err := r.db.WithContext(ctx).Select("id, project_id, title, raw_source, content").First(&script, scriptID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return script, ErrScriptNotFound
		}
		return script, err
	}
	if script.ProjectID != projectID {
		return script, ErrScriptNotFound
	}
	return script, nil
}

func (r *gormRepository) LoadProjectItem(ctx context.Context, projectID uint, item any, id string) error {
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).First(item, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

func (r *gormRepository) CreateItem(ctx context.Context, item any) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Create(item).Error; err != nil {
			return err
		}
		return entityrelation.SyncCoreEntityRelations(tx, item)
	})
}

func (r *gormRepository) PatchItem(ctx context.Context, item any, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Model(item).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.First(item).Error; err != nil {
			return err
		}
		if err := tx.Save(item).Error; err != nil {
			return err
		}
		return entityrelation.SyncCoreEntityRelations(tx, item)
	})
}

func (r *gormRepository) ReloadItem(ctx context.Context, item any) error {
	return r.db.WithContext(ctx).First(item).Error
}

func (r *gormRepository) DeleteItem(ctx context.Context, item any) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tx = tx.Session(&gorm.Session{SkipHooks: true})
		if err := tx.Delete(item).Error; err != nil {
			return err
		}
		return entityrelation.DeleteCoreEntityRelations(tx, item)
	})
}

func (r *gormRepository) CreateScriptVersion(ctx context.Context, projectID uint, input CreateScriptVersionInput, createdByID *uint) (model.ScriptVersion, error) {
	script, err := r.LoadScriptForProject(ctx, projectID, input.ScriptID)
	if err != nil {
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
		item.VersionNumber = r.NextScriptVersionNumber(ctx, projectID, input.ScriptID)
	}
	if err := r.db.WithContext(ctx).Create(&item).Error; err != nil {
		return item, err
	}
	return item, nil
}

func (r *gormRepository) NextScriptVersionNumber(ctx context.Context, projectID uint, scriptID uint) int {
	var maxVersion int
	r.db.WithContext(ctx).
		Model(&model.ScriptVersion{}).
		Where("project_id = ? AND script_id = ?", projectID, scriptID).
		Select("COALESCE(MAX(version_number), 0)").
		Scan(&maxVersion)
	return maxVersion + 1
}

func (r *gormRepository) ListSegments(ctx context.Context, filter SegmentFilter) ([]model.Segment, error) {
	items := make([]model.Segment, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
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

func (r *gormRepository) ListProductionTextBlocks(ctx context.Context, filter ProductionTextBlockFilter) ([]model.ProductionTextBlock, error) {
	items := make([]model.ProductionTextBlock, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order(`production_id, "order", id`).Find(&items).Error
	return items, err
}

func (r *gormRepository) ListSceneMoments(ctx context.Context, filter SceneMomentFilter) ([]model.SceneMoment, error) {
	items := make([]model.SceneMoment, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.SegmentID > 0 {
		q = q.Where("segment_id = ?", filter.SegmentID)
	}
	err := q.Order(`segment_id, "order", id`).Find(&items).Error
	return items, err
}

func (r *gormRepository) ResolveSegmentOwners(ctx context.Context, projectID uint, productionID *uint, textBlockID *uint) (*uint, *uint, error) {
	if productionID != nil {
		if err := r.EnsureProductionInProject(ctx, projectID, *productionID); err != nil {
			return nil, nil, err
		}
	}
	if textBlockID == nil {
		return productionID, nil, nil
	}

	var block model.ProductionTextBlock
	if err := r.db.WithContext(ctx).Select("id, project_id, production_id").First(&block, *textBlockID).Error; err != nil {
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

func (r *gormRepository) EnsureProductionInProject(ctx context.Context, projectID uint, productionID uint) error {
	if productionID == 0 {
		return ErrOwnerNotFound
	}
	var production model.Production
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&production, productionID).Error; err != nil {
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

func (r *gormRepository) EnsureProductionTextBlockInProject(ctx context.Context, projectID uint, blockID uint) error {
	if blockID == 0 {
		return ErrOwnerNotFound
	}
	var block model.ProductionTextBlock
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&block, blockID).Error; err != nil {
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

func (r *gormRepository) EnsureSegmentInProject(ctx context.Context, projectID uint, segmentID uint) error {
	if segmentID == 0 {
		return ErrOwnerNotFound
	}
	var segment model.Segment
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&segment, segmentID).Error; err != nil {
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

func (r *gormRepository) EnsureScriptVersionInProject(ctx context.Context, projectID uint, scriptVersionID uint) error {
	if scriptVersionID == 0 {
		return ErrOwnerNotFound
	}
	var item model.ScriptVersion
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, scriptVersionID).Error; err != nil {
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

func (r *gormRepository) EnsurePreviewTimelineInProject(ctx context.Context, projectID uint, previewTimelineID uint) error {
	if previewTimelineID == 0 {
		return ErrOwnerNotFound
	}
	var item model.PreviewTimeline
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, previewTimelineID).Error; err != nil {
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

func (r *gormRepository) EnsureSceneMomentInProject(ctx context.Context, projectID uint, sceneMomentID uint) error {
	if sceneMomentID == 0 {
		return ErrOwnerNotFound
	}
	var item model.SceneMoment
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, sceneMomentID).Error; err != nil {
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

func (r *gormRepository) EnsureContentUnitInProject(ctx context.Context, projectID uint, contentUnitID uint) error {
	if contentUnitID == 0 {
		return ErrOwnerNotFound
	}
	var item model.ContentUnit
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&item, contentUnitID).Error; err != nil {
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

func (r *gormRepository) EnsureUserInProject(ctx context.Context, projectID uint, userID uint) error {
	if userID == 0 {
		return ErrInvalidInput{Err: errors.New("user id is required")}
	}
	var count int64
	r.db.WithContext(ctx).Model(&model.Project{}).Where("id = ? AND owner_id = ?", projectID, userID).Count(&count)
	if count > 0 {
		return nil
	}
	r.db.WithContext(ctx).Model(&model.ProjectMember{}).Where("project_id = ? AND user_id = ?", projectID, userID).Count(&count)
	if count == 0 {
		return ErrInvalidInput{Err: errors.New("执行成员不属于当前项目")}
	}
	return nil
}

func (r *gormRepository) EnsureJobInProject(ctx context.Context, projectID uint, jobID uint) error {
	if jobID == 0 {
		return ErrInvalidInput{Err: errors.New("source job id is required")}
	}
	var job model.Job
	if err := r.db.WithContext(ctx).Select("id, project_id").First(&job, jobID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrOwnerNotFound
		}
		return err
	}
	if job.ProjectID == nil || *job.ProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (r *gormRepository) ListProductions(ctx context.Context, filter ProductionFilter) ([]model.Production, error) {
	items := make([]model.Production, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if sourceType := strings.TrimSpace(filter.SourceType); sourceType != "" {
		q = q.Where("source_type = ?", sourceType)
	}
	err := q.Order("updated_at desc, id desc").Find(&items).Error
	return items, err
}

func (r *gormRepository) ListContentUnits(ctx context.Context, filter ContentUnitFilter) ([]model.ContentUnit, error) {
	items := make([]model.ContentUnit, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
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

func (r *gormRepository) ListKeyframes(ctx context.Context, filter KeyframeFilter) ([]model.Keyframe, error) {
	items := make([]model.Keyframe, 0)
	q := r.db.WithContext(ctx).Preload("Resource").Where("project_id = ?", filter.ProjectID)
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

func (r *gormRepository) ListPreviewTimelines(ctx context.Context, filter PreviewTimelineFilter) ([]model.PreviewTimeline, error) {
	items := make([]model.PreviewTimeline, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	err := q.Order("is_primary desc, id desc").Find(&items).Error
	return items, err
}

func (r *gormRepository) ListPreviewTimelineItems(ctx context.Context, filter PreviewTimelineItemFilter) ([]model.PreviewTimelineItem, error) {
	items := make([]model.PreviewTimelineItem, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
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

func (r *gormRepository) ListStoryboardScripts(ctx context.Context, filter StoryboardScriptFilter) ([]model.StoryboardScript, error) {
	items := make([]model.StoryboardScript, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.ScriptVersionID > 0 {
		q = q.Where("script_version_id = ?", filter.ScriptVersionID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("is_primary desc, id desc").Find(&items).Error
	return items, err
}

func (r *gormRepository) ListStoryboardVersions(ctx context.Context, filter StoryboardVersionFilter) ([]model.StoryboardVersion, error) {
	items := make([]model.StoryboardVersion, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.StoryboardScriptID > 0 {
		q = q.Where("storyboard_script_id = ?", filter.StoryboardScriptID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("storyboard_script_id, version_number desc, id desc").Find(&items).Error
	return items, err
}

func (r *gormRepository) ListStoryboardLines(ctx context.Context, filter StoryboardLineFilter) ([]model.StoryboardLine, error) {
	items := make([]model.StoryboardLine, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
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

func (r *gormRepository) NextStoryboardVersionNumber(ctx context.Context, projectID uint, storyboardScriptID uint) int {
	var maxVersion int
	r.db.WithContext(ctx).
		Model(&model.StoryboardVersion{}).
		Where("project_id = ? AND storyboard_script_id = ?", projectID, storyboardScriptID).
		Select("COALESCE(MAX(version_number), 0)").
		Scan(&maxVersion)
	return maxVersion + 1
}

func (r *gormRepository) ListWorkItems(ctx context.Context, filter WorkItemFilter) ([]model.WorkItem, error) {
	items := make([]model.WorkItem, 0)
	q := r.db.WithContext(ctx).Preload("Assignee").Where("project_id = ?", filter.ProjectID)
	if filter.ProductionID > 0 {
		q = q.Where("production_id = ?", filter.ProductionID)
	}
	if targetType := strings.TrimSpace(filter.TargetType); targetType != "" {
		q = q.Where("target_type = ?", targetType)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("status, priority desc, id desc").Find(&items).Error
	return items, err
}

func (r *gormRepository) ListWorkReviews(ctx context.Context, filter WorkReviewFilter) ([]model.WorkReview, error) {
	items := make([]model.WorkReview, 0)
	q := r.db.WithContext(ctx).Preload("Reviewer").Where("project_id = ?", filter.ProjectID)
	if filter.WorkItemID > 0 {
		q = q.Where("work_item_id = ?", filter.WorkItemID)
	}
	if status := strings.TrimSpace(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("work_item_id, id desc").Find(&items).Error
	return items, err
}

func (r *gormRepository) ListWorkDependencies(ctx context.Context, filter WorkDependencyFilter) ([]model.WorkDependency, error) {
	items := make([]model.WorkDependency, 0)
	q := r.db.WithContext(ctx).Where("project_id = ?", filter.ProjectID)
	if filter.WorkItemID > 0 {
		q = q.Where("work_item_id = ?", filter.WorkItemID)
	}
	err := q.Order("work_item_id, id").Find(&items).Error
	return items, err
}

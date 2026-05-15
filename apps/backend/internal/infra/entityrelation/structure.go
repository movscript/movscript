package entityrelation

import "gorm.io/gorm"

func syncScriptVersionRelations(tx *gorm.DB, item *ScriptVersion) error {
	if err := deleteTargetEntityRelations(tx, "script_version", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeHasVersion, EntityRelationTypeDerivedFrom)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "script",
		SourceID:   item.ScriptID,
		TargetType: "script_version",
		TargetID:   item.ID,
		Category:   EntityRelationCategoryStructure,
		Type:       EntityRelationTypeHasVersion,
		Order:      item.VersionNumber,
		Status:     relationStatus(item.Status),
	}}
	if item.ParentVersionID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "script_version",
			SourceID:   item.ID,
			TargetType: "script_version",
			TargetID:   *item.ParentVersionID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeDerivedFrom,
			Order:      item.VersionNumber,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncScriptBlockRelations(tx *gorm.DB, item *ScriptBlock) error {
	if err := deleteTargetEntityRelations(tx, "script_block", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "script_version",
		SourceID:   item.ScriptVersionID,
		TargetType: "script_block",
		TargetID:   item.ID,
		Category:   EntityRelationCategoryStructure,
		Type:       EntityRelationTypeContains,
		Order:      item.Order,
		Status:     relationStatus(item.Status),
	}}
	if item.ParentBlockID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "script_block",
			SourceID:   *item.ParentBlockID,
			TargetType: "script_block",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncProductionRelations(tx *gorm.DB, item *Production) error {
	if err := deleteSourceEntityRelations(tx, "production", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeDerivedFrom, EntityRelationTypeUsesPreview)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 2)
	if item.ScriptVersionID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "production",
			SourceID:   item.ID,
			TargetType: "script_version",
			TargetID:   *item.ScriptVersionID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeDerivedFrom,
			Status:     relationStatus(item.Status),
		})
	}
	if item.PreviewTimelineID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "production",
			SourceID:   item.ID,
			TargetType: "preview_timeline",
			TargetID:   *item.PreviewTimelineID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeUsesPreview,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncProductionTextBlockRelations(tx *gorm.DB, item *ProductionTextBlock) error {
	if err := deleteTargetEntityRelations(tx, "production_text_block", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "production",
		SourceID:   item.ProductionID,
		TargetType: "production_text_block",
		TargetID:   item.ID,
		Category:   EntityRelationCategoryStructure,
		Type:       EntityRelationTypeContains,
		Order:      item.Order,
		Status:     relationStatus(item.Status),
	}}
	if item.ParentBlockID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "production_text_block",
			SourceID:   *item.ParentBlockID,
			TargetType: "production_text_block",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncSegmentRelations(tx *gorm.DB, item *Segment) error {
	if err := deleteTargetEntityRelations(tx, "segment", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "segment", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeBasedOn)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 3)
	if item.ProductionID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "production",
			SourceID:   *item.ProductionID,
			TargetType: "segment",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	if item.ParentSegmentID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "segment",
			SourceID:   *item.ParentSegmentID,
			TargetType: "segment",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	if item.ScriptBlockID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "segment",
			SourceID:   item.ID,
			TargetType: "script_block",
			TargetID:   *item.ScriptBlockID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeBasedOn,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncSceneMomentRelations(tx *gorm.DB, item *SceneMoment) error {
	if err := deleteTargetEntityRelations(tx, "scene_moment", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "scene_moment", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeBasedOn)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 2)
	if item.SegmentID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "segment",
			SourceID:   *item.SegmentID,
			TargetType: "scene_moment",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	if item.ScriptBlockID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "scene_moment",
			SourceID:   item.ID,
			TargetType: "script_block",
			TargetID:   *item.ScriptBlockID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeBasedOn,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncContentUnitRelations(tx *gorm.DB, item *ContentUnit) error {
	if err := deleteTargetEntityRelations(tx, "content_unit", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "content_unit", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeBasedOn)); err != nil {
		return err
	}
	if err := deleteTargetEntityRelations(tx, "content_unit", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeCompilesTo)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 4)
	if item.SegmentID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "segment",
			SourceID:   *item.SegmentID,
			TargetType: "content_unit",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	if item.SceneMomentID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "content_unit",
			SourceID:   item.ID,
			TargetType: "scene_moment",
			TargetID:   *item.SceneMomentID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeBasedOn,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	if item.StoryboardLineID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "storyboard_line",
			SourceID:   *item.StoryboardLineID,
			TargetType: "content_unit",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeCompilesTo,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	if item.ScriptBlockID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "content_unit",
			SourceID:   item.ID,
			TargetType: "script_block",
			TargetID:   *item.ScriptBlockID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeBasedOn,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncStoryboardScriptRelations(tx *gorm.DB, item *StoryboardScript) error {
	if err := deleteSourceEntityRelations(tx, "storyboard_script", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeBasedOn)); err != nil {
		return err
	}
	if item.ScriptVersionID == nil {
		return nil
	}
	return syncEntityRelations(tx, nil, []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "storyboard_script",
		SourceID:   item.ID,
		TargetType: "script_version",
		TargetID:   *item.ScriptVersionID,
		Category:   EntityRelationCategoryStructure,
		Type:       EntityRelationTypeBasedOn,
		Status:     relationStatus(item.Status),
	}})
}

func syncStoryboardVersionRelations(tx *gorm.DB, item *StoryboardVersion) error {
	if err := deleteTargetEntityRelations(tx, "storyboard_version", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeHasVersion, EntityRelationTypeDerivedFrom)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "storyboard_script",
		SourceID:   item.StoryboardScriptID,
		TargetType: "storyboard_version",
		TargetID:   item.ID,
		Category:   EntityRelationCategoryStructure,
		Type:       EntityRelationTypeHasVersion,
		Order:      item.VersionNumber,
		Status:     relationStatus(item.Status),
	}}
	if item.ParentVersionID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "storyboard_version",
			SourceID:   item.ID,
			TargetType: "storyboard_version",
			TargetID:   *item.ParentVersionID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeDerivedFrom,
			Order:      item.VersionNumber,
			Status:     relationStatus(item.Status),
		})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncStoryboardLineRelations(tx *gorm.DB, item *StoryboardLine) error {
	if err := deleteTargetEntityRelations(tx, "storyboard_line", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "storyboard_line", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeBasedOn)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{
		ProjectID:  item.ProjectID,
		SourceType: "storyboard_script",
		SourceID:   item.StoryboardScriptID,
		TargetType: "storyboard_line",
		TargetID:   item.ID,
		Category:   EntityRelationCategoryStructure,
		Type:       EntityRelationTypeContains,
		Order:      item.Order,
		Status:     relationStatus(item.Status),
	}}
	if item.StoryboardVersionID != nil {
		seeds = append(seeds, entityRelationSeed{
			ProjectID:  item.ProjectID,
			SourceType: "storyboard_version",
			SourceID:   *item.StoryboardVersionID,
			TargetType: "storyboard_line",
			TargetID:   item.ID,
			Category:   EntityRelationCategoryStructure,
			Type:       EntityRelationTypeContains,
			Order:      item.Order,
			Status:     relationStatus(item.Status),
		})
	}
	if item.SegmentID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "storyboard_line", SourceID: item.ID, TargetType: "segment", TargetID: *item.SegmentID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeBasedOn, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.SceneMomentID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "storyboard_line", SourceID: item.ID, TargetType: "scene_moment", TargetID: *item.SceneMomentID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeBasedOn, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.ScriptBlockID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "storyboard_line", SourceID: item.ID, TargetType: "script_block", TargetID: *item.ScriptBlockID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeBasedOn, Order: item.Order, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncKeyframeRelations(tx *gorm.DB, item *Keyframe) error {
	if err := deleteTargetEntityRelations(tx, "keyframe", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeHasKeyframe)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "keyframe", item.ID, EntityRelationCategoryAsset, relationTypeList(EntityRelationTypeUsesResource)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 3)
	if item.SceneMomentID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "scene_moment", SourceID: *item.SceneMomentID, TargetType: "keyframe", TargetID: item.ID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeHasKeyframe, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.ContentUnitID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "content_unit", SourceID: *item.ContentUnitID, TargetType: "keyframe", TargetID: item.ID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeHasKeyframe, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.ResourceID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "keyframe", SourceID: item.ID, TargetType: "raw_resource", TargetID: *item.ResourceID, Category: EntityRelationCategoryAsset, Type: EntityRelationTypeUsesResource, Order: item.Order, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncPreviewTimelineRelations(tx *gorm.DB, item *PreviewTimeline) error {
	if err := deleteSourceEntityRelations(tx, "preview_timeline", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeDerivedFrom)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 2)
	if item.ProductionID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "preview_timeline", SourceID: item.ID, TargetType: "production", TargetID: *item.ProductionID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeDerivedFrom, Status: relationStatus(item.Status)})
	}
	if item.ScriptVersionID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "preview_timeline", SourceID: item.ID, TargetType: "script_version", TargetID: *item.ScriptVersionID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeDerivedFrom, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func syncPreviewTimelineItemRelations(tx *gorm.DB, item *PreviewTimelineItem) error {
	if err := deleteTargetEntityRelations(tx, "preview_timeline_item", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "preview_timeline_item", item.ID, EntityRelationCategoryStructure, relationTypeList(EntityRelationTypeRepresents, EntityRelationTypeUses)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{ProjectID: item.ProjectID, SourceType: "preview_timeline", SourceID: item.PreviewTimelineID, TargetType: "preview_timeline_item", TargetID: item.ID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeContains, Order: item.Order, Status: relationStatus(item.Status)}}
	if item.SegmentID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "preview_timeline_item", SourceID: item.ID, TargetType: "segment", TargetID: *item.SegmentID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeRepresents, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.SceneMomentID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "preview_timeline_item", SourceID: item.ID, TargetType: "scene_moment", TargetID: *item.SceneMomentID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeRepresents, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.ContentUnitID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "preview_timeline_item", SourceID: item.ID, TargetType: "content_unit", TargetID: *item.ContentUnitID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeRepresents, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.KeyframeID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "preview_timeline_item", SourceID: item.ID, TargetType: "keyframe", TargetID: *item.KeyframeID, Category: EntityRelationCategoryStructure, Type: EntityRelationTypeUses, Order: item.Order, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

package model

import "gorm.io/gorm"

func (item *DeliveryVersion) AfterSave(tx *gorm.DB) error {
	return syncDeliveryVersionRelations(tx, item)
}

func syncDeliveryVersionRelations(tx *gorm.DB, item *DeliveryVersion) error {
	if err := deleteSourceEntityRelations(tx, "delivery_version", item.ID, EntityRelationCategoryDelivery, relationTypeList(EntityRelationTypeDerivedFrom)); err != nil {
		return err
	}
	seeds := make([]entityRelationSeed, 0, 2)
	if item.ProductionID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "delivery_version", SourceID: item.ID, TargetType: "production", TargetID: *item.ProductionID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeDerivedFrom, Status: relationStatus(item.Status)})
	}
	if item.PreviewTimelineID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "delivery_version", SourceID: item.ID, TargetType: "preview_timeline", TargetID: *item.PreviewTimelineID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeDerivedFrom, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *DeliveryVersion) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "delivery_version", item.ID)
}

func (item *DeliveryTimelineItem) AfterSave(tx *gorm.DB) error {
	return syncDeliveryTimelineItemRelations(tx, item)
}

func syncDeliveryTimelineItemRelations(tx *gorm.DB, item *DeliveryTimelineItem) error {
	if err := deleteTargetEntityRelations(tx, "delivery_timeline_item", item.ID, EntityRelationCategoryDelivery, relationTypeList(EntityRelationTypeContains)); err != nil {
		return err
	}
	if err := deleteSourceEntityRelations(tx, "delivery_timeline_item", item.ID, EntityRelationCategoryDelivery, relationTypeList(EntityRelationTypeUses, EntityRelationTypeUsesResource)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{ProjectID: item.ProjectID, SourceType: "delivery_version", SourceID: item.DeliveryVersionID, TargetType: "delivery_timeline_item", TargetID: item.ID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeContains, Order: item.Order, Status: relationStatus(item.Status)}}
	if item.ContentUnitID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "delivery_timeline_item", SourceID: item.ID, TargetType: "content_unit", TargetID: *item.ContentUnitID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeUses, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.AssetSlotID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "delivery_timeline_item", SourceID: item.ID, TargetType: "asset_slot", TargetID: *item.AssetSlotID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeUses, Order: item.Order, Status: relationStatus(item.Status)})
	}
	if item.ResourceID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "delivery_timeline_item", SourceID: item.ID, TargetType: "raw_resource", TargetID: *item.ResourceID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeUsesResource, Order: item.Order, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *DeliveryTimelineItem) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "delivery_timeline_item", item.ID)
}

func (item *ExportRecord) AfterSave(tx *gorm.DB) error {
	return syncExportRecordRelations(tx, item)
}

func syncExportRecordRelations(tx *gorm.DB, item *ExportRecord) error {
	if err := deleteSourceEntityRelations(tx, "export_record", item.ID, EntityRelationCategoryDelivery, relationTypeList(EntityRelationTypeExports, EntityRelationTypeProduces)); err != nil {
		return err
	}
	seeds := []entityRelationSeed{{ProjectID: item.ProjectID, SourceType: "export_record", SourceID: item.ID, TargetType: "delivery_version", TargetID: item.DeliveryVersionID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeExports, Status: relationStatus(item.Status)}}
	if item.ResourceID != nil {
		seeds = append(seeds, entityRelationSeed{ProjectID: item.ProjectID, SourceType: "export_record", SourceID: item.ID, TargetType: "raw_resource", TargetID: *item.ResourceID, Category: EntityRelationCategoryDelivery, Type: EntityRelationTypeProduces, Status: relationStatus(item.Status)})
	}
	return syncEntityRelations(tx, nil, seeds)
}

func (item *ExportRecord) AfterDelete(tx *gorm.DB) error {
	return deleteEntityRelations(tx, "export_record", item.ID)
}

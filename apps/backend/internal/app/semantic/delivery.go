package semantic

import (
	"context"
	"strings"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

type DeliveryVersionFilter struct {
	ProjectID    uint
	ProductionID uint
}

type DeliveryVersionInput struct {
	ProductionID      *uint   `json:"production_id"`
	PreviewTimelineID *uint   `json:"preview_timeline_id"`
	Name              string  `json:"name"`
	Description       string  `json:"description"`
	Status            string  `json:"status"`
	IsPrimary         bool    `json:"is_primary"`
	DurationSec       float64 `json:"duration_sec"`
	MetadataJSON      string  `json:"metadata_json"`
}

type DeliveryTimelineItemFilter struct {
	ProjectID         uint
	DeliveryVersionID uint
	Status            string
}

type DeliveryTimelineItemInput struct {
	DeliveryVersionID uint    `json:"delivery_version_id" binding:"required"`
	ContentUnitID     *uint   `json:"content_unit_id"`
	AssetSlotID       *uint   `json:"asset_slot_id"`
	ResourceID        *uint   `json:"resource_id"`
	Kind              string  `json:"kind"`
	Order             int     `json:"order"`
	StartSec          float64 `json:"start_sec"`
	DurationSec       float64 `json:"duration_sec"`
	Label             string  `json:"label"`
	Status            string  `json:"status"`
	MetadataJSON      string  `json:"metadata_json"`
}

type ExportRecordFilter struct {
	ProjectID         uint
	DeliveryVersionID uint
	Status            string
}

type ExportRecordInput struct {
	DeliveryVersionID uint   `json:"delivery_version_id" binding:"required"`
	ResourceID        *uint  `json:"resource_id"`
	Status            string `json:"status"`
	Format            string `json:"format"`
	Preset            string `json:"preset"`
	Error             string `json:"error"`
	MetadataJSON      string `json:"metadata_json"`
}

type CanvasOutputFilter struct {
	ProjectID uint
	CanvasID  uint
	OwnerType string
	Status    string
}

type CanvasOutputInput struct {
	CanvasID     uint   `json:"canvas_id" binding:"required"`
	CanvasRunID  *uint  `json:"canvas_run_id"`
	CanvasNodeID string `json:"canvas_node_id"`
	PortID       string `json:"port_id" binding:"required"`
	OwnerType    string `json:"owner_type" binding:"required"`
	OwnerID      uint   `json:"owner_id" binding:"required"`
	OutputType   string `json:"output_type"`
	ResourceID   *uint  `json:"resource_id"`
	TargetField  string `json:"target_field"`
	ValueJSON    string `json:"value_json"`
	Status       string `json:"status"`
	MetadataJSON string `json:"metadata_json"`
}

func (s *Service) ListDeliveryVersions(ctx context.Context, filter DeliveryVersionFilter) ([]domainsemantic.DeliveryVersion, error) {
	if filter.ProductionID > 0 {
		return s.listDeliveryVersionsFromRelations(ctx, filter)
	}
	return s.repo.ListDeliveryVersions(ctx, filter)
}

func (s *Service) listDeliveryVersionsFromRelations(ctx context.Context, filter DeliveryVersionFilter) ([]domainsemantic.DeliveryVersion, error) {
	ids, err := s.relatedSourceIDs(ctx, deliveryDerivedFromTargetFilter(filter.ProjectID, "production", filter.ProductionID), "delivery_version")
	if err != nil {
		return nil, err
	}
	versions := make([]domainsemantic.DeliveryVersion, 0, len(ids))
	for _, id := range ids {
		version, err := s.repo.LoadDeliveryVersion(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		versions = append(versions, version)
	}
	return versions, nil
}

func (s *Service) CreateDeliveryVersion(ctx context.Context, projectID uint, input DeliveryVersionInput) (domainsemantic.DeliveryVersion, error) {
	if input.ProductionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *input.ProductionID); err != nil {
			return domainsemantic.DeliveryVersion{}, err
		}
	}
	item := domainsemantic.NewDeliveryVersion(domainsemantic.DeliveryVersionSpec{
		ProjectID:         projectID,
		ProductionID:      input.ProductionID,
		PreviewTimelineID: input.PreviewTimelineID,
		Name:              input.Name,
		Description:       input.Description,
		Status:            input.Status,
		IsPrimary:         input.IsPrimary,
		DurationSec:       input.DurationSec,
		MetadataJSON:      input.MetadataJSON,
	})
	var created domainsemantic.DeliveryVersion
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateDeliveryVersion(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertDeliveryVersionRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchDeliveryVersion(ctx context.Context, projectID uint, id string, input DeliveryVersionInput) (domainsemantic.DeliveryVersion, error) {
	item, err := s.repo.LoadDeliveryVersion(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if input.ProductionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *input.ProductionID); err != nil {
			return item, err
		}
	}
	patch := domainsemantic.DeliveryVersionPatch{
		ProductionID:      input.ProductionID,
		PreviewTimelineID: input.PreviewTimelineID,
		Name:              input.Name,
		Description:       input.Description,
		Status:            input.Status,
		IsPrimary:         input.IsPrimary,
		DurationSec:       input.DurationSec,
		MetadataJSON:      input.MetadataJSON,
	}
	var patched domainsemantic.DeliveryVersion
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchDeliveryVersion(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertDeliveryVersionRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertDeliveryVersionRelations(ctx context.Context, item domainsemantic.DeliveryVersion) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryDelivery,
		Type:      domainrelation.TypeDerivedFrom,
		Source:    domainrelation.NewEntityRef("delivery_version", item.ID),
	}); err != nil {
		return err
	}
	if item.ProductionID != nil {
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("delivery_version", item.ID),
			Target:    domainrelation.NewEntityRef("production", *item.ProductionID),
			Category:  domainrelation.CategoryDelivery,
			Type:      domainrelation.TypeDerivedFrom,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	if item.PreviewTimelineID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("delivery_version", item.ID),
			Target:    domainrelation.NewEntityRef("preview_timeline", *item.PreviewTimelineID),
			Category:  domainrelation.CategoryDelivery,
			Type:      domainrelation.TypeDerivedFrom,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

func (s *Service) ListDeliveryTimelineItems(ctx context.Context, filter DeliveryTimelineItemFilter) ([]domainsemantic.DeliveryTimelineItem, error) {
	if filter.DeliveryVersionID > 0 {
		return s.listDeliveryTimelineItemsFromRelations(ctx, filter)
	}
	return s.repo.ListDeliveryTimelineItems(ctx, filter)
}

func (s *Service) listDeliveryTimelineItemsFromRelations(ctx context.Context, filter DeliveryTimelineItemFilter) ([]domainsemantic.DeliveryTimelineItem, error) {
	ids, err := s.relatedTargetIDs(ctx, deliveryContainsFilter(filter.ProjectID, "delivery_version", filter.DeliveryVersionID), "delivery_timeline_item")
	if err != nil {
		return nil, err
	}
	items := make([]domainsemantic.DeliveryTimelineItem, 0, len(ids))
	for _, id := range ids {
		item, err := s.repo.LoadDeliveryTimelineItem(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(filter.Status) != "" && item.Status != strings.TrimSpace(filter.Status) {
			continue
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Service) CreateDeliveryTimelineItem(ctx context.Context, projectID uint, input DeliveryTimelineItemInput) (domainsemantic.DeliveryTimelineItem, error) {
	if err := s.validateDeliveryTimelineItemOwners(ctx, projectID, input); err != nil {
		return domainsemantic.DeliveryTimelineItem{}, err
	}
	item := domainsemantic.NewDeliveryTimelineItem(domainsemantic.DeliveryTimelineItemSpec{
		ProjectID:         projectID,
		DeliveryVersionID: input.DeliveryVersionID,
		ContentUnitID:     input.ContentUnitID,
		AssetSlotID:       input.AssetSlotID,
		ResourceID:        input.ResourceID,
		Kind:              input.Kind,
		Order:             input.Order,
		StartSec:          input.StartSec,
		DurationSec:       input.DurationSec,
		Label:             input.Label,
		Status:            input.Status,
		MetadataJSON:      input.MetadataJSON,
	})
	var created domainsemantic.DeliveryTimelineItem
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateDeliveryTimelineItem(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertDeliveryTimelineItemRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchDeliveryTimelineItem(ctx context.Context, projectID uint, id string, input DeliveryTimelineItemInput) (domainsemantic.DeliveryTimelineItem, error) {
	item, err := s.repo.LoadDeliveryTimelineItem(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateDeliveryTimelineItemOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	patch := domainsemantic.DeliveryTimelineItemPatch{
		DeliveryVersionID: input.DeliveryVersionID,
		ContentUnitID:     input.ContentUnitID,
		AssetSlotID:       input.AssetSlotID,
		ResourceID:        input.ResourceID,
		Kind:              input.Kind,
		Order:             input.Order,
		StartSec:          input.StartSec,
		DurationSec:       input.DurationSec,
		Label:             input.Label,
		Status:            input.Status,
		MetadataJSON:      input.MetadataJSON,
	}
	var patched domainsemantic.DeliveryTimelineItem
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchDeliveryTimelineItem(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertDeliveryTimelineItemRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertDeliveryTimelineItemRelations(ctx context.Context, item domainsemantic.DeliveryTimelineItem) error {
	if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
		ProjectID: item.ProjectID,
		Category:  domainrelation.CategoryDelivery,
		Type:      domainrelation.TypeContains,
		Target:    domainrelation.NewEntityRef("delivery_timeline_item", item.ID),
	}); err != nil {
		return err
	}
	for _, edgeType := range []string{domainrelation.TypeUses, domainrelation.TypeUsesResource} {
		if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
			ProjectID: item.ProjectID,
			Category:  domainrelation.CategoryDelivery,
			Type:      edgeType,
			Source:    domainrelation.NewEntityRef("delivery_timeline_item", item.ID),
		}); err != nil {
			return err
		}
	}
	if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("delivery_version", item.DeliveryVersionID),
		Target:    domainrelation.NewEntityRef("delivery_timeline_item", item.ID),
		Category:  domainrelation.CategoryDelivery,
		Type:      domainrelation.TypeContains,
		Order:     item.Order,
		Status:    semanticRelationStatus(item.Status),
	}); err != nil {
		return err
	}
	for _, target := range []struct {
		entityType string
		id         *uint
		edgeType   string
	}{
		{entityType: "content_unit", id: item.ContentUnitID, edgeType: domainrelation.TypeUses},
		{entityType: "asset_slot", id: item.AssetSlotID, edgeType: domainrelation.TypeUses},
		{entityType: "raw_resource", id: item.ResourceID, edgeType: domainrelation.TypeUsesResource},
	} {
		if target.id == nil {
			continue
		}
		if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("delivery_timeline_item", item.ID),
			Target:    domainrelation.NewEntityRef(target.entityType, *target.id),
			Category:  domainrelation.CategoryDelivery,
			Type:      target.edgeType,
			Order:     item.Order,
			Status:    semanticRelationStatus(item.Status),
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) ListExportRecords(ctx context.Context, filter ExportRecordFilter) ([]domainsemantic.ExportRecord, error) {
	if filter.DeliveryVersionID > 0 {
		return s.listExportRecordsFromRelations(ctx, filter)
	}
	return s.repo.ListExportRecords(ctx, filter)
}

func (s *Service) listExportRecordsFromRelations(ctx context.Context, filter ExportRecordFilter) ([]domainsemantic.ExportRecord, error) {
	ids, err := s.relatedSourceIDs(ctx, deliveryExportsTargetFilter(filter.ProjectID, filter.DeliveryVersionID), "export_record")
	if err != nil {
		return nil, err
	}
	records := make([]domainsemantic.ExportRecord, 0, len(ids))
	for _, id := range ids {
		record, err := s.repo.LoadExportRecord(ctx, filter.ProjectID, entityIDString(id))
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(filter.Status) != "" && record.Status != strings.TrimSpace(filter.Status) {
			continue
		}
		records = append(records, record)
	}
	return records, nil
}

func (s *Service) CreateExportRecord(ctx context.Context, projectID uint, input ExportRecordInput) (domainsemantic.ExportRecord, error) {
	if err := s.validateExportRecordOwners(ctx, projectID, input); err != nil {
		return domainsemantic.ExportRecord{}, err
	}
	item := domainsemantic.NewExportRecord(domainsemantic.ExportRecordSpec{
		ProjectID:         projectID,
		DeliveryVersionID: input.DeliveryVersionID,
		ResourceID:        input.ResourceID,
		Status:            input.Status,
		Format:            input.Format,
		Preset:            input.Preset,
		Error:             input.Error,
		MetadataJSON:      input.MetadataJSON,
	})
	var created domainsemantic.ExportRecord
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateExportRecord(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertExportRecordRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchExportRecord(ctx context.Context, projectID uint, id string, input ExportRecordInput) (domainsemantic.ExportRecord, error) {
	item, err := s.repo.LoadExportRecord(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateExportRecordOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	patch := domainsemantic.ExportRecordPatch{
		DeliveryVersionID: input.DeliveryVersionID,
		ResourceID:        input.ResourceID,
		Status:            input.Status,
		Format:            input.Format,
		Preset:            input.Preset,
		Error:             input.Error,
		MetadataJSON:      input.MetadataJSON,
	}
	var patched domainsemantic.ExportRecord
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchExportRecord(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertExportRecordRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertExportRecordRelations(ctx context.Context, item domainsemantic.ExportRecord) error {
	for _, edgeType := range []string{domainrelation.TypeExports, domainrelation.TypeProduces} {
		if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
			ProjectID: item.ProjectID,
			Category:  domainrelation.CategoryDelivery,
			Type:      edgeType,
			Source:    domainrelation.NewEntityRef("export_record", item.ID),
		}); err != nil {
			return err
		}
	}
	if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("export_record", item.ID),
		Target:    domainrelation.NewEntityRef("delivery_version", item.DeliveryVersionID),
		Category:  domainrelation.CategoryDelivery,
		Type:      domainrelation.TypeExports,
		Status:    semanticRelationStatus(item.Status),
	}); err != nil {
		return err
	}
	if item.ResourceID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("export_record", item.ID),
			Target:    domainrelation.NewEntityRef("raw_resource", *item.ResourceID),
			Category:  domainrelation.CategoryDelivery,
			Type:      domainrelation.TypeProduces,
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

func (s *Service) ListCanvasOutputs(ctx context.Context, filter CanvasOutputFilter) ([]domainsemantic.CanvasOutput, error) {
	return s.repo.ListCanvasOutputs(ctx, filter)
}

func (s *Service) CreateCanvasOutput(ctx context.Context, projectID uint, input CanvasOutputInput) (domainsemantic.CanvasOutput, error) {
	if err := s.validateCanvasOutputOwners(ctx, projectID, input); err != nil {
		return domainsemantic.CanvasOutput{}, err
	}
	item := domainsemantic.NewCanvasOutput(domainsemantic.CanvasOutputSpec{
		ProjectID:    projectID,
		CanvasID:     input.CanvasID,
		CanvasRunID:  input.CanvasRunID,
		CanvasNodeID: input.CanvasNodeID,
		PortID:       input.PortID,
		OwnerType:    input.OwnerType,
		OwnerID:      input.OwnerID,
		OutputType:   input.OutputType,
		ResourceID:   input.ResourceID,
		TargetField:  input.TargetField,
		ValueJSON:    input.ValueJSON,
		Status:       input.Status,
		MetadataJSON: input.MetadataJSON,
	})
	var created domainsemantic.CanvasOutput
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		created, err = txSvc.repo.CreateCanvasOutput(ctx, item)
		if err != nil {
			return err
		}
		return txSvc.upsertCanvasOutputRelations(ctx, created)
	})
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) PatchCanvasOutput(ctx context.Context, projectID uint, id string, input CanvasOutputInput) (domainsemantic.CanvasOutput, error) {
	item, err := s.repo.LoadCanvasOutput(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if err := s.validateCanvasOutputOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	patch := domainsemantic.CanvasOutputPatch{
		CanvasID:     input.CanvasID,
		CanvasRunID:  input.CanvasRunID,
		CanvasNodeID: input.CanvasNodeID,
		PortID:       input.PortID,
		OwnerType:    input.OwnerType,
		OwnerID:      input.OwnerID,
		OutputType:   input.OutputType,
		ResourceID:   input.ResourceID,
		TargetField:  input.TargetField,
		ValueJSON:    input.ValueJSON,
		Status:       input.Status,
		MetadataJSON: input.MetadataJSON,
	}
	var patched domainsemantic.CanvasOutput
	err = s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		patched, err = txSvc.repo.PatchCanvasOutput(ctx, item, patch)
		if err != nil {
			return err
		}
		return txSvc.upsertCanvasOutputRelations(ctx, patched)
	})
	if err != nil {
		return patched, err
	}
	return patched, nil
}

func (s *Service) upsertCanvasOutputRelations(ctx context.Context, item domainsemantic.CanvasOutput) error {
	for _, edgeType := range []string{domainrelation.TypeAppliesTo, domainrelation.TypeProduces} {
		if err := s.relations.ExpireEdges(ctx, relationapp.EdgeFilter{
			ProjectID: item.ProjectID,
			Category:  domainrelation.CategoryWorkflow,
			Type:      edgeType,
			Source:    domainrelation.NewEntityRef("canvas_output", item.ID),
		}); err != nil {
			return err
		}
	}
	if err := s.upsertRelationEdge(ctx, relationapp.EdgeInput{
		ProjectID: item.ProjectID,
		Source:    domainrelation.NewEntityRef("canvas_output", item.ID),
		Target:    domainrelation.NewEntityRef(item.OwnerType, item.OwnerID),
		Category:  domainrelation.CategoryWorkflow,
		Type:      domainrelation.TypeAppliesTo,
		Label:     strings.TrimSpace(item.OutputType),
		Status:    semanticRelationStatus(item.Status),
	}); err != nil {
		return err
	}
	if item.ResourceID != nil {
		return s.upsertRelationEdge(ctx, relationapp.EdgeInput{
			ProjectID: item.ProjectID,
			Source:    domainrelation.NewEntityRef("canvas_output", item.ID),
			Target:    domainrelation.NewEntityRef("raw_resource", *item.ResourceID),
			Category:  domainrelation.CategoryWorkflow,
			Type:      domainrelation.TypeProduces,
			Label:     strings.TrimSpace(item.OutputType),
			Status:    semanticRelationStatus(item.Status),
		})
	}
	return nil
}

func (s *Service) validateDeliveryTimelineItemOwners(ctx context.Context, projectID uint, input DeliveryTimelineItemInput) error {
	if err := s.ensureOwnerInProject(ctx, projectID, "delivery_version", input.DeliveryVersionID); err != nil {
		return err
	}
	if err := s.validateScopedOwner(ctx, projectID, "content_unit", input.ContentUnitID); err != nil {
		return err
	}
	if err := s.validateScopedOwner(ctx, projectID, "asset_slot", input.AssetSlotID); err != nil {
		return err
	}
	if err := s.validateScopedOwner(ctx, projectID, "resource", input.ResourceID); err != nil {
		return err
	}
	return nil
}

func (s *Service) validateExportRecordOwners(ctx context.Context, projectID uint, input ExportRecordInput) error {
	if err := s.ensureOwnerInProject(ctx, projectID, "delivery_version", input.DeliveryVersionID); err != nil {
		return err
	}
	return s.validateScopedOwner(ctx, projectID, "resource", input.ResourceID)
}

func (s *Service) validateCanvasOutputOwners(ctx context.Context, projectID uint, input CanvasOutputInput) error {
	if err := s.ensureOwnerInProject(ctx, projectID, "canvas", input.CanvasID); err != nil {
		return err
	}
	if err := s.ensureOwnerInProject(ctx, projectID, input.OwnerType, input.OwnerID); err != nil {
		return err
	}
	if err := s.validateScopedOwner(ctx, projectID, "canvas_run", input.CanvasRunID); err != nil {
		return err
	}
	if err := s.validateScopedOwner(ctx, projectID, "resource", input.ResourceID); err != nil {
		return err
	}
	return nil
}

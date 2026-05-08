package semantic

import (
	"context"

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
	return s.repo.ListDeliveryVersions(ctx, filter)
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
	return s.repo.CreateDeliveryVersion(ctx, item)
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
	return s.repo.PatchDeliveryVersion(ctx, item, patch)
}

func (s *Service) ListDeliveryTimelineItems(ctx context.Context, filter DeliveryTimelineItemFilter) ([]domainsemantic.DeliveryTimelineItem, error) {
	return s.repo.ListDeliveryTimelineItems(ctx, filter)
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
	return s.repo.CreateDeliveryTimelineItem(ctx, item)
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
	return s.repo.PatchDeliveryTimelineItem(ctx, item, patch)
}

func (s *Service) ListExportRecords(ctx context.Context, filter ExportRecordFilter) ([]domainsemantic.ExportRecord, error) {
	return s.repo.ListExportRecords(ctx, filter)
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
	return s.repo.CreateExportRecord(ctx, item)
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
	return s.repo.PatchExportRecord(ctx, item, patch)
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
	return s.repo.CreateCanvasOutput(ctx, item)
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
	return s.repo.PatchCanvasOutput(ctx, item, patch)
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

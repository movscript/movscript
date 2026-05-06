package semantic

import (
	"context"

	"github.com/movscript/movscript/internal/domain/model"
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

func (s *Service) ListDeliveryVersions(ctx context.Context, filter DeliveryVersionFilter) ([]model.DeliveryVersion, error) {
	return s.repo.ListDeliveryVersions(ctx, filter)
}

func (s *Service) CreateDeliveryVersion(ctx context.Context, projectID uint, input DeliveryVersionInput) (model.DeliveryVersion, error) {
	if input.ProductionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *input.ProductionID); err != nil {
			return model.DeliveryVersion{}, err
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
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchDeliveryVersion(ctx context.Context, projectID uint, id string, input DeliveryVersionInput) (model.DeliveryVersion, error) {
	var item model.DeliveryVersion
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if input.ProductionID != nil {
		if err := s.ensureProductionInProject(ctx, projectID, *input.ProductionID); err != nil {
			return item, err
		}
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"production_id":       input.ProductionID,
		"preview_timeline_id": input.PreviewTimelineID,
		"name":                input.Name,
		"description":         input.Description,
		"status":              input.Status,
		"is_primary":          &input.IsPrimary,
		"duration_sec":        input.DurationSec,
		"metadata_json":       input.MetadataJSON,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListDeliveryTimelineItems(ctx context.Context, filter DeliveryTimelineItemFilter) ([]model.DeliveryTimelineItem, error) {
	return s.repo.ListDeliveryTimelineItems(ctx, filter)
}

func (s *Service) CreateDeliveryTimelineItem(ctx context.Context, projectID uint, input DeliveryTimelineItemInput) (model.DeliveryTimelineItem, error) {
	if err := s.validateDeliveryTimelineItemOwners(ctx, projectID, input); err != nil {
		return model.DeliveryTimelineItem{}, err
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
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchDeliveryTimelineItem(ctx context.Context, projectID uint, id string, input DeliveryTimelineItemInput) (model.DeliveryTimelineItem, error) {
	var item model.DeliveryTimelineItem
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateDeliveryTimelineItemOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"delivery_version_id": input.DeliveryVersionID,
		"content_unit_id":     input.ContentUnitID,
		"asset_slot_id":       input.AssetSlotID,
		"resource_id":         input.ResourceID,
		"kind":                input.Kind,
		"order":               input.Order,
		"start_sec":           input.StartSec,
		"duration_sec":        input.DurationSec,
		"label":               input.Label,
		"status":              input.Status,
		"metadata_json":       input.MetadataJSON,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListExportRecords(ctx context.Context, filter ExportRecordFilter) ([]model.ExportRecord, error) {
	return s.repo.ListExportRecords(ctx, filter)
}

func (s *Service) CreateExportRecord(ctx context.Context, projectID uint, input ExportRecordInput) (model.ExportRecord, error) {
	if err := s.validateExportRecordOwners(ctx, projectID, input); err != nil {
		return model.ExportRecord{}, err
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
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchExportRecord(ctx context.Context, projectID uint, id string, input ExportRecordInput) (model.ExportRecord, error) {
	var item model.ExportRecord
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateExportRecordOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"delivery_version_id": input.DeliveryVersionID,
		"resource_id":         input.ResourceID,
		"status":              input.Status,
		"format":              input.Format,
		"preset":              input.Preset,
		"error":               input.Error,
		"metadata_json":       input.MetadataJSON,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) ListCanvasOutputs(ctx context.Context, filter CanvasOutputFilter) ([]model.CanvasOutput, error) {
	return s.repo.ListCanvasOutputs(ctx, filter)
}

func (s *Service) CreateCanvasOutput(ctx context.Context, projectID uint, input CanvasOutputInput) (model.CanvasOutput, error) {
	if err := s.validateCanvasOutputOwners(ctx, projectID, input); err != nil {
		return model.CanvasOutput{}, err
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
	if err := s.CreateItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
}

func (s *Service) PatchCanvasOutput(ctx context.Context, projectID uint, id string, input CanvasOutputInput) (model.CanvasOutput, error) {
	var item model.CanvasOutput
	if err := s.LoadProjectItem(ctx, projectID, &item, id); err != nil {
		return item, err
	}
	if err := s.validateCanvasOutputOwners(ctx, projectID, input); err != nil {
		return item, err
	}
	if err := s.PatchItem(ctx, &item, compactUpdates(map[string]any{
		"canvas_id":      input.CanvasID,
		"canvas_run_id":  input.CanvasRunID,
		"canvas_node_id": input.CanvasNodeID,
		"port_id":        input.PortID,
		"owner_type":     input.OwnerType,
		"owner_id":       input.OwnerID,
		"output_type":    input.OutputType,
		"resource_id":    input.ResourceID,
		"target_field":   input.TargetField,
		"value_json":     input.ValueJSON,
		"status":         input.Status,
		"metadata_json":  input.MetadataJSON,
	})); err != nil {
		return item, err
	}
	if err := s.ReloadItem(ctx, &item); err != nil {
		return item, err
	}
	return item, nil
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

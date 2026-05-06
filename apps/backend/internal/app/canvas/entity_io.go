package canvas

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/domain/workflow"
)

func (h *Service) completeEntityWriteTask(ctx context.Context, task *model.CanvasTask, node *model.CanvasNode, nd nodeData, cv model.Canvas, portInputs canvasPortInputMap, user *model.User) map[string]canvasPortValue {
	h.db.Model(task).Update("status", "running")
	kind, entityID := nd.ResolvedEntity()
	if kind == "" || entityID == 0 {
		h.failTask(task, node, nd, "entity node is missing entity reference")
		return nil
	}
	if err := ValidateCanvasProductionEntityWrite(kind, portInputs); err != nil {
		h.failTask(task, node, nd, err.Error())
		return nil
	}

	values := h.entityPortValuesFromCanvasInputs(ctx, kind, portInputs)
	var runID uint
	if task.CanvasRunID != nil {
		runID = *task.CanvasRunID
	}
	result, err := h.entityIO.WritePorts(ctx, kind, entityID, values, workflow.EntityWriteMeta{
		CanvasID:   cv.ID,
		RunID:      runID,
		NodeID:     node.NodeID,
		UserID:     user.ID,
		ProjectID:  cv.ProjectID,
		SourceType: "canvas",
	})
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return nil
	}
	updates := map[string]any{"status": "done"}
	if result.PrimaryResourceID != nil {
		updates["resource_id"] = *result.PrimaryResourceID
	}
	h.db.Model(task).Updates(updates)
	if result.PrimaryResourceID != nil {
		h.attachGeneratedAssetSlotCandidate(ctx, cv, runID, user.ID, kind, entityID, *result.PrimaryResourceID)
	}
	nd.Status = "done"
	nd.ResourceID = result.PrimaryResourceID
	nd.TaskID = &task.ID
	h.updateRunStatus(task.CanvasRunID)
	outputs := h.resolveEntityNodeOutputs(ctx, user, nd)
	if len(outputs) == 0 && result.PrimaryResourceID != nil {
		value := canvasruntime.PortValueFromResource(result.PrimaryResourceID, "resource")
		outputs = map[string]canvasPortValue{
			"":       value,
			"result": value,
		}
	}
	h.updateTaskOutputValues(task, outputs)
	return outputs
}

func ValidateCanvasProductionEntityWrite(kind string, portInputs canvasPortInputMap) error {
	if kind != "asset_slot" && kind != "content_unit" {
		return fmt.Errorf("canvas can only write production media to asset_slot or content_unit entities")
	}
	for handle := range portInputs {
		portID := strings.TrimSpace(handle)
		if portID == "" {
			continue
		}
		field, ok := workflow.EntityFieldForPort(kind, portID)
		if !ok || !field.Workflow.Writable {
			return fmt.Errorf("canvas port %q is not a production write port for %s", portID, kind)
		}
		if !canvasProductionWritePort(kind, field.Workflow.PortID) {
			return fmt.Errorf("canvas port %q is not a production media write port for %s", portID, kind)
		}
	}
	return nil
}

func canvasProductionWritePort(kind string, portID string) bool {
	switch kind {
	case "asset_slot":
		switch portID {
		case "result", "image", "video", "audio", "reference", "resource_id", "locked_asset_slot_id", "candidates", "candidate_item":
			return true
		}
	case "content_unit":
		switch portID {
		case "result", "image", "video", "audio":
			return true
		}
	}
	return false
}

func (h *Service) attachGeneratedAssetSlotCandidate(ctx context.Context, cv model.Canvas, runID uint, userID uint, kind string, entityID uint, resourceID uint) {
	if h == nil || h.db == nil || cv.ProjectID == nil || kind != "asset_slot" || entityID == 0 || resourceID == 0 {
		return
	}
	var candidateSlot model.AssetSlot
	if err := h.db.First(&candidateSlot, entityID).Error; err != nil || candidateSlot.ProjectID != *cv.ProjectID {
		return
	}
	if candidateSlot.ResourceID == nil {
		candidateSlot.ResourceID = &resourceID
	}
	if candidateSlot.Status == "" || candidateSlot.Status == "missing" {
		candidateSlot.Status = "candidate"
	}
	_ = h.db.Save(&candidateSlot).Error
	if candidateSlot.OwnerType != "asset_slot" || candidateSlot.OwnerID == nil || *candidateSlot.OwnerID == 0 {
		return
	}
	var sourceSlot model.AssetSlot
	if err := h.db.First(&sourceSlot, *candidateSlot.OwnerID).Error; err != nil || sourceSlot.ProjectID != *cv.ProjectID {
		return
	}
	sourceID := runID
	var existing model.AssetSlotCandidate
	err := h.db.
		Where("project_id = ? AND asset_slot_id = ? AND candidate_asset_slot_id = ?", *cv.ProjectID, sourceSlot.ID, candidateSlot.ID).
		First(&existing).Error
	if err != nil {
		_ = h.db.Create(&model.AssetSlotCandidate{
			ProjectID:            *cv.ProjectID,
			AssetSlotID:          sourceSlot.ID,
			CandidateAssetSlotID: candidateSlot.ID,
			SourceType:           "canvas",
			SourceID:             &sourceID,
			Status:               "candidate",
			Note:                 "由素材灵感画布写回",
		}).Error
	} else {
		updates := map[string]any{"source_type": "canvas", "source_id": runID}
		if existing.Status == "" || existing.Status == "pending" {
			updates["status"] = "candidate"
		}
		if updates["status"] == "candidate" {
			existing.Status = "candidate"
		}
		existing.SourceType = "canvas"
		existing.SourceID = &sourceID
		_ = h.db.Save(&existing).Error
	}
	var existingBinding model.ResourceBinding
	if err := h.db.
		Where("project_id = ? AND resource_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND version = ?", *cv.ProjectID, resourceID, "asset_slot", candidateSlot.ID, "output", "result", 1).
		First(&existingBinding).Error; err != nil {
		_ = h.createBinding(ctx, model.ResourceBinding{
			ProjectID:    *cv.ProjectID,
			ResourceID:   resourceID,
			OwnerType:    "asset_slot",
			OwnerID:      candidateSlot.ID,
			Role:         "output",
			Slot:         "result",
			Status:       "selected",
			SourceType:   "canvas",
			SourceID:     &sourceID,
			IsPrimary:    true,
			MetadataJSON: fmt.Sprintf(`{"canvas_id":%d,"canvas_run_id":%d,"canvas_node_id":%q}`, cv.ID, runID, "asset-slot-target"),
			CreatedByID:  &userID,
		})
	}
}

func (h *Service) entityPortValuesFromCanvasInputs(ctx context.Context, kind string, portInputs canvasPortInputMap) map[string]workflow.EntityPortValue {
	values := map[string]workflow.EntityPortValue{}
	for handle, portValues := range portInputs {
		handle = strings.TrimSpace(handle)
		if handle == "" {
			continue
		}
		field, ok := workflow.EntityFieldForPort(kind, handle)
		if !ok {
			values[handle] = workflow.EntityPortValue{Type: "resource", ResourceIDs: uintValuesFromPortValues(portValues)}
			continue
		}
		value := workflow.EntityPortValue{
			Type:        field.ValueType,
			ResourceIDs: uintValuesFromPortValues(portValues),
		}
		texts := h.readCanvasTextValues(ctx, portValues)
		if text := strings.Join(texts, "\n\n"); strings.TrimSpace(text) != "" {
			value.Text = text
		}
		for _, portValue := range portValues {
			if portValue.JSON != nil {
				value.JSON = portValue.JSON
			}
			if portValue.Number != nil {
				value.Number = portValue.Number
			}
			if portValue.Boolean != nil {
				value.Boolean = portValue.Boolean
			}
		}
		values[handle] = value
	}
	return values
}

func uintValuesFromPortValues(values []canvasPortValue) []uint {
	ids := make([]uint, 0, len(values))
	seen := map[uint]bool{}
	for _, value := range values {
		ptr := value.ResourceID
		if ptr == nil || *ptr == 0 || seen[*ptr] {
			continue
		}
		seen[*ptr] = true
		ids = append(ids, *ptr)
	}
	return ids
}

func (h *Service) resolveEntityNodeOutputs(ctx context.Context, user *model.User, nd nodeData) map[string]canvasPortValue {
	kind, entityID := nd.ResolvedEntity()
	if kind == "" || entityID == 0 {
		return nil
	}
	outputs := map[string]canvasPortValue{}
	values, err := h.entityIO.ReadPorts(ctx, kind, entityID)
	if err != nil {
		return nil
	}
	for handle, value := range values {
		handle = strings.TrimSpace(handle)
		if handle == "" {
			continue
		}
		if len(value.ResourceIDs) > 0 {
			rid := value.ResourceIDs[0]
			portValue := canvasruntime.PortValueFromResource(&rid, value.Type)
			outputs[handle] = portValue
			if canvasruntime.PortValueEmpty(outputs[""]) {
				outputs[""] = portValue
			}
			continue
		}
		portValue := entityPortValueToCanvasPortValue(value)
		if canvasruntime.PortValueEmpty(portValue) {
			continue
		}
		outputs[handle] = portValue
		if canvasruntime.PortValueEmpty(outputs[""]) {
			outputs[""] = portValue
		}
	}
	_ = user
	return outputs
}

func entityPortValueToCanvasPortValue(value workflow.EntityPortValue) canvasPortValue {
	valueType := strings.TrimSpace(value.Type)
	if valueType == "" {
		valueType = "text"
	}
	portValue := canvasPortValue{Type: valueType}
	switch valueType {
	case "json":
		if value.JSON != nil {
			portValue.JSON = value.JSON
		} else if strings.TrimSpace(value.Text) != "" {
			var decoded any
			if err := json.Unmarshal([]byte(value.Text), &decoded); err == nil {
				portValue.JSON = decoded
			} else {
				portValue.Text = value.Text
			}
		}
	case "number":
		if value.Number != nil {
			portValue.Number = value.Number
		} else if strings.TrimSpace(value.Text) != "" {
			if n, err := strconv.ParseFloat(strings.TrimSpace(value.Text), 64); err == nil {
				portValue.Number = &n
			} else {
				portValue.Text = value.Text
			}
		}
	case "boolean":
		if value.Boolean != nil {
			portValue.Boolean = value.Boolean
		} else if strings.TrimSpace(value.Text) != "" {
			if b, err := strconv.ParseBool(strings.TrimSpace(value.Text)); err == nil {
				portValue.Boolean = &b
			} else {
				portValue.Text = value.Text
			}
		}
	default:
		portValue.Text = value.Text
	}
	return portValue
}

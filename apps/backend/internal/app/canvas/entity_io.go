package canvas

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/movscript/movscript/internal/app/workflowio"
	"github.com/movscript/movscript/internal/domain/canvasruntime"
	domainresourcebinding "github.com/movscript/movscript/internal/domain/resourcebinding"
	domainworkflow "github.com/movscript/movscript/internal/domain/workflow"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func (h *Service) completeEntityWriteTask(ctx context.Context, task *persistencemodel.CanvasTask, node *persistencemodel.CanvasNode, nd nodeData, cv persistencemodel.Canvas, portInputs canvasPortInputMap, user *persistencemodel.User) map[string]canvasPortValue {
	_ = h.canvasRepo().UpdateTask(ctx, task, canvasruntime.StartCanvasTask(task, &nd))
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
	result, err := h.entityIO.WritePorts(ctx, kind, entityID, values, workflowio.EntityWriteMeta{
		CanvasID:   cv.ID,
		RunID:      runID,
		NodeID:     node.NodeID,
		UserID:     user.ID,
		ProjectID:  cv.ProjectID,
		SourceType: domainresourcebinding.SourceTypeCanvas,
	})
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return nil
	}
	_ = h.canvasRepo().UpdateTask(ctx, task, canvasruntime.CompleteCanvasTask(task, &nd, result.PrimaryResourceID))
	if result.PrimaryResourceID != nil {
		h.attachGeneratedAssetSlotCandidate(ctx, cv, runID, user.ID, kind, entityID, *result.PrimaryResourceID)
	}
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
	if kind != domainworkflow.EntityKindAssetSlot && kind != domainworkflow.EntityKindContentUnit {
		return fmt.Errorf("canvas can only write production media to asset_slot or content_unit entities")
	}
	for handle := range portInputs {
		portID := strings.TrimSpace(handle)
		if portID == "" {
			continue
		}
		field, ok := workflowio.EntityFieldForPort(kind, portID)
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
	case domainworkflow.EntityKindAssetSlot:
		switch portID {
		case "result", "image", "video", "audio", "reference", "resource_id", "locked_asset_slot_id", "candidates", "candidate_item":
			return true
		}
	case domainworkflow.EntityKindContentUnit:
		switch portID {
		case "result", "image", "video", "audio":
			return true
		}
	}
	return false
}

func (h *Service) attachGeneratedAssetSlotCandidate(ctx context.Context, cv persistencemodel.Canvas, runID uint, userID uint, kind string, entityID uint, resourceID uint) {
	if h == nil || cv.ProjectID == nil || kind != domainworkflow.EntityKindAssetSlot || entityID == 0 || resourceID == 0 {
		return
	}
	_ = h.canvasRepo().attachGeneratedAssetSlotCandidate(ctx, attachGeneratedAssetSlotCandidateInput{
		CanvasID:      cv.ID,
		CanvasRunID:   runID,
		ProjectID:     *cv.ProjectID,
		UserID:        userID,
		EntityKind:    kind,
		EntityID:      entityID,
		ResourceID:    resourceID,
		BindingSlot:   "result",
		BindingMeta:   fmt.Sprintf(`{"canvas_id":%d,"canvas_run_id":%d,"canvas_node_id":%q}`, cv.ID, runID, "asset-slot-target"),
		CandidateNote: "由素材灵感画布写回",
	})
}

func (h *Service) entityPortValuesFromCanvasInputs(ctx context.Context, kind string, portInputs canvasPortInputMap) map[string]workflowio.EntityPortValue {
	values := map[string]workflowio.EntityPortValue{}
	for handle, portValues := range portInputs {
		handle = strings.TrimSpace(handle)
		if handle == "" {
			continue
		}
		field, ok := workflowio.EntityFieldForPort(kind, handle)
		if !ok {
			values[handle] = workflowio.EntityPortValue{Type: "resource", ResourceIDs: uintValuesFromPortValues(portValues)}
			continue
		}
		value := workflowio.EntityPortValue{
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

func (h *Service) resolveEntityNodeOutputs(ctx context.Context, user *persistencemodel.User, nd nodeData) map[string]canvasPortValue {
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

func entityPortValueToCanvasPortValue(value workflowio.EntityPortValue) canvasPortValue {
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

package canvas

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func (h *Service) ExecuteCanvasNode(ctx context.Context, userID uint, cv canvasruntime.Canvas, node canvasruntime.CanvasNode, task *canvasruntime.CanvasTask, inputs canvasPortInputMap) map[string]canvasPortValue {
	var taskModel *persistencemodel.CanvasTask
	if task != nil {
		row := task.ToModel()
		taskModel = &row
	}
	nodeModel := node.ToModel()
	return h.executeCanvasNodeModel(ctx, &persistencemodel.User{Model: gorm.Model{ID: userID}}, cv.ToModel(), &nodeModel, taskModel, inputs)
}

func (h *Service) executeCanvasNodeModel(ctx context.Context, user *persistencemodel.User, cv persistencemodel.Canvas, node *persistencemodel.CanvasNode, task *persistencemodel.CanvasTask, inputs canvasPortInputMap) map[string]canvasPortValue {
	var nd nodeData
	if err := json.Unmarshal([]byte(node.Data), &nd); err != nil {
		if task != nil {
			h.failTask(task, node, nd, "invalid node data")
		}
		return nil
	}
	if task != nil {
		h.updateTaskInputValues(task, inputs)
	}

	if node.Type == "input" {
		value := firstCanvasInputValue(inputs)
		if canvasruntime.PortValueEmpty(value) {
			value = canvasruntime.StaticNodePortValue(node, nd)
		}
		outputs := map[string]canvasPortValue{"value": value, "": value}
		if task != nil {
			h.completeInlineValueTask(task, node, nd, outputs)
		}
		return outputs
	}

	if node.Type == "output" {
		outputValue := firstCanvasInputValue(inputs)
		if canvasruntime.PortValueEmpty(outputValue) {
			if task != nil {
				_ = h.updateTaskRow(ctx, task, canvasruntime.StartCanvasTask(task, &nd))
				h.failTask(task, node, nd, "output node has no upstream value")
			}
			return nil
		}
		outputs := map[string]canvasPortValue{"value": outputValue, "": outputValue}
		if task != nil {
			h.completeInlineValueTask(task, node, nd, outputs)
		}
		return outputs
	}

	if node.Type == "resource_sink" {
		if task == nil {
			return nil
		}
		outputValue := firstCanvasInputValue(inputs)
		if canvasruntime.PortValueEmpty(outputValue) {
			_ = h.updateTaskRow(ctx, task, canvasruntime.StartCanvasTask(task, &nd))
			h.failTask(task, node, nd, "resource sink has no upstream value")
			return nil
		}
		return h.completeResourceSinkTask(ctx, task, node, nd, user, outputValue)
	}

	if canvasruntime.IsCanvasEntityNode(node.Type) {
		if len(inputs) > 0 {
			if task == nil {
				return nil
			}
			return h.completeEntityWriteTask(ctx, task, node, nd, cv, inputs, user)
		}
		outputs := h.resolveEntityNodeOutputs(ctx, user, nd)
		if len(outputs) == 0 {
			if task != nil {
				h.failTask(task, node, nd, "entity node has no readable output")
			}
			return nil
		}
		if task != nil {
			h.completeInlineValueTask(task, node, nd, outputs)
		}
		return outputs
	}

	if nd.Source != "ai" && nd.ExecutableSpec == nil {
		outputs := h.staticNodeOutputs(ctx, node, nd)
		if len(outputs) == 0 {
			if task != nil {
				h.failTask(task, node, nd, "node has no runnable output")
			}
			return nil
		}
		if task != nil {
			h.completeInlineValueTask(task, node, nd, outputs)
		}
		return outputs
	}

	if task == nil {
		return nil
	}

	h.applyPromptPortInputs(ctx, &nd, inputs)
	if nd.ExecutableSpec == nil {
		promptOptionalTypes := map[string]bool{
			"motion_imitation": true,
			"canvas":           true,
		}
		if nd.Prompt == "" && !promptOptionalTypes[node.Type] {
			h.failTask(task, node, nd, "prompt is required")
			return nil
		}
	}
	if node.Type == "canvas" && nd.ExecutableSpec == nil {
		_ = h.updateTaskRow(ctx, task, canvasruntime.StartCanvasTask(task, &nd))
		return h.completeCanvasReferenceTask(ctx, task, node, nd, user, inputs)
	}

	h.executeTask(user, node, task, nd, inputs)

	if updated, err := h.canvasRepo().FindTask(ctx, task.ID); err == nil && updated.Status == canvasruntime.CanvasTaskStatusDone {
		if outputs := canvasruntime.DecodePortOutputs(updated.OutputValues); len(outputs) > 0 {
			return outputs
		}
		if updated.ResourceID != nil {
			value := canvasruntime.PortValueFromResource(updated.ResourceID, canvasruntime.DefaultPortValueTypeForNode(node.Type, nd))
			outputs := map[string]canvasPortValue{
				canvasruntime.DefaultSourceHandleForNode(node.Type, nd): value,
				"": value,
			}
			h.updateTaskOutputValues(task, outputs)
			return outputs
		}
	}
	return nil
}

func (h *Service) completeInlineValueTask(task *persistencemodel.CanvasTask, node *persistencemodel.CanvasNode, nd nodeData, outputs map[string]canvasPortValue) {
	_ = h.updateTaskRow(context.Background(), task, canvasruntime.StartCanvasTask(task, &nd))
	h.updateTaskOutputValues(task, outputs)
	primary := firstCanvasOutputResource(outputs)
	updates := canvasruntime.CompleteCanvasTask(task, &nd, primary)
	_ = h.updateTaskRow(context.Background(), task, updates)
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *Service) CollectSingleNodeInputs(ctx context.Context, userID uint, cv canvasruntime.Canvas, nodeID string, overrides map[string]canvasPortValue) (canvasPortInputMap, error) {
	return h.collectSingleNodeInputsModel(ctx, &persistencemodel.User{Model: gorm.Model{ID: userID}}, cv.ToModel(), nodeID, overrides)
}

func (h *Service) collectSingleNodeInputsModel(ctx context.Context, user *persistencemodel.User, cv persistencemodel.Canvas, nodeID string, overrides map[string]canvasPortValue) (canvasPortInputMap, error) {
	inputs := canvasPortInputMap{}
	connectedHandles := map[string]bool{}
	nodeMap := map[string]*persistencemodel.CanvasNode{}
	for i := range cv.Nodes {
		nodeMap[cv.Nodes[i].NodeID] = &cv.Nodes[i]
	}
	targetNode := nodeMap[nodeID]
	for _, edge := range cv.Edges {
		if edge.Target != nodeID {
			continue
		}
		source := nodeMap[edge.Source]
		if source == nil {
			continue
		}
		value, ok := h.latestCanvasNodeOutputValue(ctx, user, cv, source, edge.SourceHandle)
		if !ok {
			return nil, fmt.Errorf("upstream node %q has no output for port %q", edge.Source, edge.SourceHandle)
		}
		handle := strings.TrimSpace(edge.TargetHandle)
		if handle == "" {
			handle = "input"
		}
		connectedHandles[handle] = true
		inputs[handle] = append(inputs[handle], value)
		inputs[""] = append(inputs[""], value)
	}
	for handle, value := range overrides {
		handle = strings.TrimSpace(handle)
		if handle == "" {
			continue
		}
		if connectedHandles[handle] {
			continue
		}
		value.Normalize()
		if canvasruntime.PortValueEmpty(value) {
			continue
		}
		inputs[handle] = append(inputs[handle], value)
		inputs[""] = append(inputs[""], value)
	}
	if targetNode != nil {
		var nd nodeData
		_ = json.Unmarshal([]byte(targetNode.Data), &nd)
		for _, port := range nd.InputPorts {
			handle := strings.TrimSpace(port.ID)
			if handle == "" || !port.Required {
				continue
			}
			if !canvasruntime.PortValuesPresent(inputs[handle]) {
				return nil, fmt.Errorf("required input %q is missing", handle)
			}
		}
	}
	return inputs, nil
}

func (h *Service) latestCanvasNodeOutputValue(ctx context.Context, user *persistencemodel.User, cv persistencemodel.Canvas, node *persistencemodel.CanvasNode, sourceHandle string) (canvasPortValue, bool) {
	handle := strings.TrimSpace(sourceHandle)
	var nd nodeData
	_ = json.Unmarshal([]byte(node.Data), &nd)
	if handle == "" {
		handle = canvasruntime.DefaultSourceHandleForNode(node.Type, nd)
	}

	if h.canvasRepo() != nil {
		if task, ok, err := h.canvasRepo().LatestDoneTaskForNode(ctx, node.ID); err == nil && ok {
			outputs := canvasruntime.DecodePortOutputs(task.OutputValues)
			if len(outputs) > 0 {
				for _, key := range []string{handle, "", canvasruntime.DefaultSourceHandleForNode(node.Type, nd), "result", "value"} {
					if value, ok := outputs[key]; ok && !canvasruntime.PortValueEmpty(value) {
						return value, true
					}
				}
				for _, value := range outputs {
					if !canvasruntime.PortValueEmpty(value) {
						return value, true
					}
				}
			}
			if task.ResourceID != nil {
				return canvasruntime.PortValueFromResource(task.ResourceID, canvasruntime.DefaultPortValueTypeForNode(node.Type, nd)), true
			}
		}
	}

	if canvasruntime.IsCanvasEntityNode(node.Type) {
		outputs := h.resolveEntityNodeOutputs(ctx, user, nd)
		for _, key := range []string{handle, "", "result"} {
			if value, ok := outputs[key]; ok && !canvasruntime.PortValueEmpty(value) {
				return value, true
			}
		}
		for _, value := range outputs {
			if !canvasruntime.PortValueEmpty(value) {
				return value, true
			}
		}
	}

	outputs := h.staticNodeOutputs(ctx, node, nd)
	if value, ok := outputs[handle]; ok && !canvasruntime.PortValueEmpty(value) {
		return value, true
	}
	if value, ok := outputs[""]; ok && !canvasruntime.PortValueEmpty(value) {
		return value, true
	}
	for _, value := range outputs {
		if !canvasruntime.PortValueEmpty(value) {
			return value, true
		}
	}
	_ = cv
	return canvasPortValue{}, false
}

func (h *Service) staticNodeOutputs(_ context.Context, node *persistencemodel.CanvasNode, nd nodeData) map[string]canvasPortValue {
	outputs := map[string]canvasPortValue{}
	handle := canvasruntime.DefaultSourceHandleForNode(node.Type, nd)
	set := func(port string, value canvasPortValue) {
		value.Normalize()
		if canvasruntime.PortValueEmpty(value) {
			return
		}
		if strings.TrimSpace(port) == "" {
			port = handle
		}
		outputs[port] = value
		outputs[""] = value
	}
	value := canvasruntime.StaticNodePortValue(node, nd)
	if !canvasruntime.PortValueEmpty(value) {
		set(handle, value)
	}
	return outputs
}

func (h *Service) ExecuteSingleWorkflowNode(userID uint, cv canvasruntime.Canvas, node canvasruntime.CanvasNode, task canvasruntime.CanvasTask, inputs canvasPortInputMap) {
	nodeModel := node.ToModel()
	taskModel := task.ToModel()
	h.executeSingleWorkflowNodeModel(&persistencemodel.User{Model: gorm.Model{ID: userID}}, cv.ToModel(), &nodeModel, &taskModel, inputs)
}

func (h *Service) executeSingleWorkflowNodeModel(user *persistencemodel.User, cv persistencemodel.Canvas, node *persistencemodel.CanvasNode, task *persistencemodel.CanvasTask, inputs canvasPortInputMap) {
	h.executeCanvasNodeModel(context.Background(), user, cv, node, task, inputs)
}

func firstCanvasInputValue(inputs canvasPortInputMap) canvasPortValue {
	for _, value := range inputs[""] {
		if !canvasruntime.PortValueEmpty(value) {
			return value
		}
	}
	for _, values := range inputs {
		for _, value := range values {
			if !canvasruntime.PortValueEmpty(value) {
				return value
			}
		}
	}
	return canvasPortValue{}
}

func firstCanvasOutputValue(outputs map[string]canvasPortValue) canvasPortValue {
	for _, key := range []string{"", "value", "result"} {
		if value, ok := outputs[key]; ok && !canvasruntime.PortValueEmpty(value) {
			return value
		}
	}
	for _, value := range outputs {
		if !canvasruntime.PortValueEmpty(value) {
			return value
		}
	}
	return canvasPortValue{}
}

func RegisterWorkflowOutput(outputs map[string]canvasPortValue, node *canvasruntime.CanvasNode, nd nodeData, nodeOutputs map[string]canvasPortValue) {
	if outputs == nil || node == nil {
		return
	}
	value := firstCanvasOutputValue(nodeOutputs)
	if canvasruntime.PortValueEmpty(value) {
		return
	}
	registerCanvasReferenceOutput(outputs, node.NodeID, value)
	registerCanvasReferenceOutput(outputs, nd.ParamName, value)
	for _, port := range nd.OutputPorts {
		registerCanvasReferenceOutput(outputs, port.ID, value)
	}
}

func firstCanvasOutputResource(outputs map[string]canvasPortValue) *uint {
	for _, key := range []string{"", "result", "value"} {
		if value := outputs[key]; value.ResourceID != nil {
			return value.ResourceID
		}
	}
	for _, value := range outputs {
		if value.ResourceID != nil {
			return value.ResourceID
		}
	}
	return nil
}

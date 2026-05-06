package canvas

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
)

func (h *Service) completeCanvasReferenceTask(ctx context.Context, task *model.CanvasTask, node *model.CanvasNode, nd nodeData, user *model.User, inputs canvasPortInputMap) map[string]canvasPortValue {
	outputs, primaryOutput, err := h.executeCanvasReferenceOutputs(ctx, nd, user, inputs)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return nil
	}

	_ = h.canvasRepo().UpdateTask(ctx, task, canvasruntime.CompleteCanvasTask(task, &nd, primaryOutput))
	h.updateTaskOutputValues(task, outputs)
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
	return outputs
}

func (h *Service) executeCanvasReferenceOutputs(ctx context.Context, nd nodeData, user *model.User, inputs canvasPortInputMap) (map[string]canvasPortValue, *uint, error) {
	ref, err := h.loadReferencedWorkflowCanvas(nd, user)
	if err != nil {
		return nil, nil, err
	}
	if len(inputs) == 0 {
		if outputs, primaryOutput, err := h.resolveCanvasReferenceOutputs(ref, nd); err == nil {
			return outputs, primaryOutput, nil
		}
	}
	run, err := h.executeReferencedWorkflowRun(ctx, user, ref, nd, inputs)
	if err != nil {
		return nil, nil, err
	}
	return h.outputsForReferencedWorkflowRun(ref, nd, run.ID)
}

func (h *Service) loadReferencedWorkflowCanvas(nd nodeData, user *model.User) (model.Canvas, error) {
	if nd.ReferencedCanvasID == nil || *nd.ReferencedCanvasID == 0 {
		return model.Canvas{}, fmt.Errorf("referenced workflow canvas is required")
	}
	ref, err := h.canvasRepo().GetCanvas(context.Background(), fmt.Sprint(*nd.ReferencedCanvasID))
	if err != nil {
		return model.Canvas{}, fmt.Errorf("referenced canvas not found")
	}
	if ref.OwnerID != user.ID && ref.Visibility != "public" {
		return model.Canvas{}, fmt.Errorf("referenced canvas is not accessible")
	}
	if ref.CanvasType != "workflow" {
		return model.Canvas{}, fmt.Errorf("only workflow canvases can be referenced")
	}
	return ref, nil
}

func (h *Service) resolveCanvasReferenceOutputs(ref model.Canvas, nd nodeData) (map[string]canvasPortValue, *uint, error) {
	latestRun, err := h.canvasRepo().LatestCompletedRun(context.Background(), ref.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("referenced workflow has no completed run")
	}
	return h.outputsForReferencedWorkflowRun(ref, nd, latestRun.ID)
}

func (h *Service) executeReferencedWorkflowRun(ctx context.Context, user *model.User, ref model.Canvas, nd nodeData, inputs canvasPortInputMap) (model.CanvasRun, error) {
	plan, err := canvasruntime.BuildExecutionPlan(ref)
	if err != nil {
		return model.CanvasRun{}, fmt.Errorf("cycle detected in referenced workflow")
	}
	inputValues := h.CanvasReferenceInputValues(ref, nd, inputs)
	if err := canvasruntime.ValidateRequiredInputs(ref, inputValues); err != nil {
		return model.CanvasRun{}, err
	}
	now := time.Now()
	run := canvasruntime.NewCanvasRun(ref, inputValues, now)
	if err := h.createCanvasRunWithRelations(&run); err != nil {
		return model.CanvasRun{}, err
	}

	for _, taskPlan := range plan.Tasks {
		node := taskPlan.Node
		if node == nil {
			continue
		}
		task := canvasruntime.NewCanvasTask(*node, &run.ID, "")
		if err := h.canvasRepo().CreateTask(ctx, &task); err != nil {
			return run, err
		}
	}

	h.executeWorkflowRunWithContext(ctx, user, ref.ID, run.ID, plan.Order)
	if run, err = h.canvasRepo().FindCanvasRun(ctx, run.ID); err != nil {
		return run, err
	}
	if run.Status != canvasruntime.CanvasRunStatusDone {
		if strings.TrimSpace(run.Error) != "" {
			return run, fmt.Errorf("referenced workflow failed: %s", run.Error)
		}
		return run, fmt.Errorf("referenced workflow failed")
	}
	return run, nil
}

func (h *Service) CanvasReferenceInputValues(ref model.Canvas, nd nodeData, inputs canvasPortInputMap) map[string]canvasPortValue {
	values := map[string]canvasPortValue{}
	inputNodeIDs := map[string]bool{}
	paramNameToNodeID := map[string]string{}
	inputNodeOrder := []string{}
	for _, refNode := range ref.Nodes {
		if refNode.Type != "input" {
			continue
		}
		inputNodeIDs[refNode.NodeID] = true
		inputNodeOrder = append(inputNodeOrder, refNode.NodeID)
		var refNodeData nodeData
		_ = json.Unmarshal([]byte(refNode.Data), &refNodeData)
		if name := strings.TrimSpace(refNodeData.ParamName); name != "" {
			paramNameToNodeID[name] = refNode.NodeID
		}
	}
	if len(inputNodeOrder) == 1 {
		if value, ok := firstNonEmptyCanvasPortValue(inputs["input"]); ok {
			values[inputNodeOrder[0]] = value
		} else if value, ok := firstNonEmptyCanvasPortValue(inputs[""]); ok {
			values[inputNodeOrder[0]] = value
		}
	}

	for handle, portValues := range inputs {
		handle = strings.TrimSpace(handle)
		if handle == "" {
			continue
		}
		value, ok := firstNonEmptyCanvasPortValue(portValues)
		if !ok {
			continue
		}
		if inputNodeIDs[handle] {
			values[handle] = value
			continue
		}
		if nodeID := paramNameToNodeID[handle]; nodeID != "" {
			values[nodeID] = value
		}
	}
	for _, port := range nd.InputPorts {
		handle := strings.TrimSpace(port.ID)
		if handle == "" {
			continue
		}
		if value, ok := values[handle]; ok && !canvasruntime.PortValueEmpty(value) {
			continue
		}
		if nodeID := paramNameToNodeID[handle]; nodeID != "" {
			if value, ok := values[nodeID]; ok && !canvasruntime.PortValueEmpty(value) {
				continue
			}
		}
		value, ok := firstNonEmptyCanvasPortValue(inputs[handle])
		if !ok {
			continue
		}
		if inputNodeIDs[handle] {
			values[handle] = value
		} else if nodeID := paramNameToNodeID[handle]; nodeID != "" {
			values[nodeID] = value
		}
	}
	return values
}

func firstNonEmptyCanvasPortValue(values []canvasPortValue) (canvasPortValue, bool) {
	for _, value := range values {
		value.Normalize()
		if !canvasruntime.PortValueEmpty(value) {
			return value, true
		}
	}
	return canvasPortValue{}, false
}

func (h *Service) outputsForReferencedWorkflowRun(ref model.Canvas, nd nodeData, runID uint) (map[string]canvasPortValue, *uint, error) {
	if run, ok, err := h.canvasRepo().FindRunInCanvas(context.Background(), ref.ID, runID); err == nil && ok {
		if outputs, primaryOutput := h.canvasReferenceOutputsFromRun(run, nd); len(outputs) > 0 {
			return outputs, primaryOutput, nil
		}
	}

	var outputNodes []model.CanvasNode
	for _, node := range ref.Nodes {
		if node.Type == "output" {
			outputNodes = append(outputNodes, node)
		}
	}
	if len(outputNodes) == 0 {
		if nodes, err := h.canvasRepo().ListOutputNodes(context.Background(), ref.ID); err == nil {
			outputNodes = nodes
		}
	}

	outputNodeIDs := make([]uint, 0, len(outputNodes))
	if len(outputNodes) > 0 {
		for _, outputNode := range outputNodes {
			outputNodeIDs = append(outputNodeIDs, outputNode.ID)
		}
	}
	refTasks, _ := h.canvasRepo().ListTasksForRunAndNodes(context.Background(), runID, outputNodeIDs)

	outputs := map[string]canvasPortValue{}
	var primaryOutput *uint
	if len(outputNodes) > 0 {
		taskByNodeID := make(map[uint]model.CanvasTask, len(refTasks))
		for _, refTask := range refTasks {
			taskByNodeID[refTask.CanvasNodeID] = refTask
		}
		for _, outputNode := range outputNodes {
			refTask, ok := taskByNodeID[outputNode.ID]
			if !ok {
				continue
			}
			var outputData nodeData
			_ = json.Unmarshal([]byte(outputNode.Data), &outputData)
			value := canvasReferenceTaskOutputValue(refTask, outputNode, outputData)
			if canvasruntime.PortValueEmpty(value) {
				continue
			}
			registerCanvasReferenceOutput(outputs, outputNode.NodeID, value)
			registerCanvasReferenceOutput(outputs, outputData.ParamName, value)
			if primaryOutput == nil && value.ResourceID != nil {
				primaryOutput = value.ResourceID
			}
		}
	} else if len(refTasks) > 0 {
		value := canvasReferenceTaskOutputValue(refTasks[0], model.CanvasNode{}, nodeData{})
		if !canvasruntime.PortValueEmpty(value) {
			registerCanvasReferenceOutput(outputs, "result", value)
			primaryOutput = value.ResourceID
		}
	}

	if len(outputs) == 0 {
		return nil, nil, fmt.Errorf("referenced workflow run has no output")
	}
	for _, port := range nd.OutputPorts {
		handle := strings.TrimSpace(port.ID)
		if handle == "" {
			continue
		}
		if value, ok := outputs[handle]; ok && !canvasruntime.PortValueEmpty(value) {
			outputs[""] = value
			return outputs, primaryOutput, nil
		}
	}
	if value, ok := outputs[""]; ok && !canvasruntime.PortValueEmpty(value) {
		return outputs, primaryOutput, nil
	}
	for _, value := range outputs {
		outputs[""] = value
		break
	}
	return outputs, primaryOutput, nil
}

func (h *Service) canvasReferenceOutputsFromRun(run model.CanvasRun, nd nodeData) (map[string]canvasPortValue, *uint) {
	runOutputs := canvasruntime.DecodePortOutputs(run.OutputValues)
	if len(runOutputs) == 0 {
		return nil, nil
	}
	outputs := map[string]canvasPortValue{}
	var primaryOutput *uint
	for key, value := range runOutputs {
		if canvasruntime.PortValueEmpty(value) {
			continue
		}
		registerCanvasReferenceOutput(outputs, key, value)
		if primaryOutput == nil && value.ResourceID != nil {
			primaryOutput = value.ResourceID
		}
	}
	for _, port := range nd.OutputPorts {
		handle := strings.TrimSpace(port.ID)
		if handle == "" {
			continue
		}
		if value, ok := outputs[handle]; ok && !canvasruntime.PortValueEmpty(value) {
			outputs[""] = value
			return outputs, primaryOutput
		}
	}
	if value, ok := outputs[""]; ok && !canvasruntime.PortValueEmpty(value) {
		return outputs, primaryOutput
	}
	for _, value := range outputs {
		if !canvasruntime.PortValueEmpty(value) {
			outputs[""] = value
			break
		}
	}
	return outputs, primaryOutput
}

func canvasReferenceTaskOutputValue(task model.CanvasTask, node model.CanvasNode, nd nodeData) canvasPortValue {
	outputs := canvasruntime.DecodePortOutputs(task.OutputValues)
	for _, key := range []string{"", "value", "result", canvasruntime.DefaultSourceHandleForNode(node.Type, nd)} {
		if value, ok := outputs[key]; ok && !canvasruntime.PortValueEmpty(value) {
			return value
		}
	}
	for _, value := range outputs {
		if !canvasruntime.PortValueEmpty(value) {
			return value
		}
	}
	if task.ResourceID != nil {
		return canvasruntime.PortValueFromResource(task.ResourceID, canvasruntime.DefaultPortValueTypeForNode(node.Type, nd))
	}
	return canvasPortValue{}
}

func registerCanvasReferenceOutput(outputs map[string]canvasPortValue, handle string, value canvasPortValue) {
	handle = strings.TrimSpace(handle)
	if handle == "" || canvasruntime.PortValueEmpty(value) {
		return
	}
	outputs[handle] = value
}

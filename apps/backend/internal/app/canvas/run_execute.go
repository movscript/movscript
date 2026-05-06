package canvas

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
)

func (h *Service) ExecuteWorkflowRun(user *model.User, canvasID uint, runID uint, order []string) {
	h.executeWorkflowRunWithContext(context.Background(), user, canvasID, runID, order)
}

func (h *Service) executeWorkflowRunWithContext(ctx context.Context, user *model.User, canvasID uint, runID uint, order []string) {
	var run model.CanvasRun
	if err := h.db.First(&run, runID).Error; err != nil {
		finishedAt := time.Now()
		h.db.Model(&model.CanvasRun{}).Where("id = ?", runID).Updates(map[string]any{"status": "failed", "error": "run not found", "finished_at": &finishedAt})
		return
	}

	cv, snapshotErr := canvasruntime.CanvasFromRunSnapshot(canvasID, run.GraphSnapshot)
	if snapshotErr != nil {
		if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, canvasID).Error; err != nil {
			finishedAt := time.Now()
			h.db.Model(&model.CanvasRun{}).Where("id = ?", runID).Updates(map[string]any{"status": "failed", "error": "canvas not found", "finished_at": &finishedAt})
			return
		}
	}

	upstream := map[string][]model.CanvasEdge{}
	for _, e := range cv.Edges {
		upstream[e.Target] = append(upstream[e.Target], e)
	}
	nodeMap := map[string]*model.CanvasNode{}
	for i := range cv.Nodes {
		nodeMap[cv.Nodes[i].NodeID] = &cv.Nodes[i]
	}
	var runTasks []model.CanvasTask
	h.db.Where("canvas_run_id = ?", runID).Order("id asc").Find(&runTasks)
	taskMap := map[string]*model.CanvasTask{}
	for i := range runTasks {
		if strings.TrimSpace(runTasks[i].NodeID) == "" {
			continue
		}
		taskMap[runTasks[i].NodeID] = &runTasks[i]
	}
	inputValues := canvasruntime.DecodeRunInputValues(run.InputValues)
	workflowOutputs := canvasruntime.DecodePortOutputs(run.OutputValues)
	if workflowOutputs == nil {
		workflowOutputs = map[string]canvasPortValue{}
	}

	produced := map[string]map[string]canvasPortValue{}
	setProduced := func(nodeID string, handle string, value canvasPortValue) {
		value.Normalize()
		if canvasruntime.PortValueEmpty(value) {
			return
		}
		if produced[nodeID] == nil {
			produced[nodeID] = map[string]canvasPortValue{}
		}
		handle = strings.TrimSpace(handle)
		if handle == "" {
			handle = "result"
		}
		produced[nodeID][handle] = value
		produced[nodeID][""] = value
	}
	valueForEdge := func(edge model.CanvasEdge) (canvasPortValue, bool) {
		byHandle := produced[edge.Source]
		if len(byHandle) == 0 {
			return canvasPortValue{}, false
		}
		if edge.SourceHandle != "" {
			if value, ok := byHandle[edge.SourceHandle]; ok && !canvasruntime.PortValueEmpty(value) {
				return value, true
			}
		}
		value, ok := byHandle[""]
		return value, ok && !canvasruntime.PortValueEmpty(value)
	}
	portInputsForNode := func(nodeID string) canvasPortInputMap {
		inputs := canvasPortInputMap{}
		for _, edge := range upstream[nodeID] {
			value, ok := valueForEdge(edge)
			if !ok {
				continue
			}
			handle := strings.TrimSpace(edge.TargetHandle)
			if handle == "" {
				handle = "input"
			}
			inputs[handle] = append(inputs[handle], value)
			inputs[""] = append(inputs[""], value)
		}
		return inputs
	}
	for _, nid := range order {
		node := nodeMap[nid]
		if node == nil {
			continue
		}
		task := taskMap[nid]
		portInputs := portInputsForNode(nid)
		if node.Type == "input" {
			if value, ok := inputValues[nid]; ok {
				portInputs["value"] = append(portInputs["value"], value)
				portInputs[""] = append(portInputs[""], value)
			}
		}
		outputs := h.ExecuteCanvasNode(ctx, user, cv, node, task, portInputs)
		if node.Type == "output" {
			var nd nodeData
			_ = json.Unmarshal([]byte(node.Data), &nd)
			RegisterWorkflowOutput(workflowOutputs, node, nd, outputs)
		}
		for handle, value := range outputs {
			setProduced(nid, handle, value)
		}
	}
	if len(workflowOutputs) > 0 {
		if err := h.persistWorkflowOutputsToResources(ctx, user, cv, runID, workflowOutputs); err != nil {
			finishedAt := time.Now()
			run.Status = "failed"
			run.Error = err.Error()
			run.FinishedAt = &finishedAt
			_ = h.db.Save(&run).Error
			return
		}
	}
	if raw := canvasruntime.MarshalPortOutputs(workflowOutputs); raw != "" {
		run.OutputValues = raw
		_ = h.db.Save(&run).Error
	}
	h.updateRunStatus(&run.ID)
}

package canvasservice

import (
	"bytes"
	"context"
	cryptorand "crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/canvasruntime"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/workflow"
	"gorm.io/gorm"
)

type nodeData = canvasruntime.NodeData
type canvasPortValue = canvasruntime.PortValue
type canvasPortInputMap = canvasruntime.PortInputMap

func normalizeCanvasTaskForResponse(dbTask *model.CanvasTask, nodeType string) {
	if dbTask == nil {
		return
	}
	outputs := canvasruntime.DecodePortOutputs(dbTask.OutputValues)
	if len(outputs) > 0 || dbTask.ResourceID == nil {
		return
	}
	valueType := canvasruntime.DefaultPortValueTypeForNode(canvasruntime.FirstNonEmptyString(dbTask.NodeType, nodeType), nodeData{})
	value := canvasruntime.PortValueFromResource(dbTask.ResourceID, valueType)
	handle := canvasruntime.DefaultSourceHandle(canvasruntime.FirstNonEmptyString(dbTask.NodeType, nodeType))
	outputs = map[string]canvasPortValue{
		handle:   value,
		"result": value,
		"value":  value,
	}
	dbTask.OutputValues = canvasruntime.MarshalPortOutputs(outputs)
}

func NormalizeCanvasTaskForResponse(dbTask *model.CanvasTask, nodeType string) {
	normalizeCanvasTaskForResponse(dbTask, nodeType)
}

func (h *Service) StartNode(ctx context.Context, user *model.User, cv model.Canvas, node model.CanvasNode, inputValues map[string]canvasPortValue) (model.CanvasTask, error) {
	inputs, err := h.CollectSingleNodeInputs(ctx, user, cv, node.NodeID, inputValues)
	if err != nil {
		return model.CanvasTask{}, err
	}
	task := model.CanvasTask{
		CanvasNodeID: node.ID,
		NodeID:       node.NodeID,
		NodeLabel:    node.Label,
		NodeType:     node.Type,
		Status:       "pending",
		InputValues:  canvasruntime.MarshalPortInputs(inputs),
	}
	if err := h.db.Create(&task).Error; err != nil {
		return model.CanvasTask{}, err
	}
	go h.ExecuteSingleWorkflowNode(user, cv, &node, &task, inputs)
	return task, nil
}

func (h *Service) StartCanvasRun(user *model.User, cv model.Canvas, inputValues map[string]canvasPortValue) (model.CanvasRun, []model.CanvasTask, error) {
	plan, err := canvasruntime.BuildExecutionPlan(cv)
	if err != nil {
		return model.CanvasRun{}, nil, err
	}
	if err := canvasruntime.ValidateRequiredInputs(cv, inputValues); err != nil {
		return model.CanvasRun{}, nil, err
	}
	snapshot, snapshotHash, snapshotNodeCount, snapshotEdgeCount := canvasruntime.BuildRunSnapshot(cv)

	rawInputValues := "{}"
	if inputValues != nil {
		if b, err := json.Marshal(inputValues); err == nil {
			rawInputValues = string(b)
		}
	}
	now := time.Now()
	run := model.CanvasRun{
		CanvasID:          cv.ID,
		Status:            "running",
		InputValues:       rawInputValues,
		GraphSnapshot:     snapshot,
		SnapshotHash:      snapshotHash,
		SnapshotNodeCount: snapshotNodeCount,
		SnapshotEdgeCount: snapshotEdgeCount,
		StartedAt:         &now,
	}
	if err := h.db.Create(&run).Error; err != nil {
		return model.CanvasRun{}, nil, err
	}

	tasks := make([]model.CanvasTask, 0, len(plan.Tasks))
	for _, taskPlan := range plan.Tasks {
		node := taskPlan.Node
		if node == nil {
			continue
		}
		task := model.CanvasTask{
			CanvasNodeID: node.ID,
			CanvasRunID:  &run.ID,
			NodeID:       node.NodeID,
			NodeLabel:    node.Label,
			NodeType:     node.Type,
			Status:       "pending",
		}
		if err := h.db.Create(&task).Error; err != nil {
			return run, tasks, err
		}
		tasks = append(tasks, task)
	}

	if len(tasks) == 0 {
		finishedAt := time.Now()
		if err := h.db.Model(&run).Updates(map[string]any{"status": "done", "finished_at": &finishedAt}).Error; err != nil {
			return run, tasks, err
		}
		run.Status = "done"
		run.FinishedAt = &finishedAt
	} else {
		go h.ExecuteWorkflowRun(user, cv.ID, run.ID, plan.Order)
	}
	run.Tasks = tasks
	return run, tasks, nil
}

func (h *Service) LazyBackfillCanvasTaskOutputs(task *model.CanvasTask, nodeType string) {
	if task == nil || strings.TrimSpace(task.OutputValues) != "" || task.ResourceID == nil {
		return
	}
	normalizeCanvasTaskForResponse(task, nodeType)
	if strings.TrimSpace(task.OutputValues) != "" {
		h.db.Model(task).Update("output_values", task.OutputValues)
	}
}

func (h *Service) updateTaskInputValues(task *model.CanvasTask, inputs canvasPortInputMap) {
	if task == nil {
		return
	}
	if raw := canvasruntime.MarshalPortInputs(inputs); raw != "" {
		h.db.Model(task).Update("input_values", raw)
		task.InputValues = raw
	}
}

func (h *Service) updateTaskOutputValues(task *model.CanvasTask, outputs map[string]canvasPortValue) {
	if task == nil {
		return
	}
	if raw := canvasruntime.MarshalPortOutputs(outputs); raw != "" {
		h.db.Model(task).Update("output_values", raw)
		task.OutputValues = raw
	}
}

func (h *Service) ExecuteWorkflowRun(user *model.User, canvasID uint, runID uint, order []string) {
	h.executeWorkflowRunWithContext(context.Background(), user, canvasID, runID, order)
}

func (h *Service) executeWorkflowRunWithContext(ctx context.Context, user *model.User, canvasID uint, runID uint, order []string) {
	var run model.CanvasRun
	if err := h.db.First(&run, runID).Error; err != nil {
		finishedAt := time.Now()
		h.db.Model(&model.CanvasRun{}).Where("id = ?", runID).Updates(map[string]any{
			"status":      "failed",
			"error":       "run not found",
			"finished_at": &finishedAt,
		})
		return
	}

	cv, snapshotErr := canvasruntime.CanvasFromRunSnapshot(canvasID, run.GraphSnapshot)
	if snapshotErr != nil {
		if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, canvasID).Error; err != nil {
			finishedAt := time.Now()
			h.db.Model(&model.CanvasRun{}).Where("id = ?", runID).Updates(map[string]any{
				"status":      "failed",
				"error":       "canvas not found",
				"finished_at": &finishedAt,
			})
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
			h.db.Model(&model.CanvasRun{}).Where("id = ?", runID).Updates(map[string]any{
				"status":      "failed",
				"error":       err.Error(),
				"finished_at": &finishedAt,
			})
			return
		}
	}
	if raw := canvasruntime.MarshalPortOutputs(workflowOutputs); raw != "" {
		h.db.Model(&model.CanvasRun{}).Where("id = ?", runID).Update("output_values", raw)
	}
	h.updateRunStatus(&runID)
}

func (h *Service) persistWorkflowOutputsToResources(ctx context.Context, user *model.User, cv model.Canvas, runID uint, outputs map[string]canvasPortValue) error {
	if h == nil || user == nil || len(outputs) == 0 {
		return nil
	}
	keys := make([]string, 0, len(outputs))
	for key := range outputs {
		if strings.TrimSpace(key) != "" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	persistedByFingerprint := map[string]*uint{}
	for _, key := range keys {
		value := outputs[key]
		value.Normalize()
		if canvasruntime.PortValueEmpty(value) {
			continue
		}
		if value.ResourceID == nil || *value.ResourceID == 0 {
			fingerprint := canvasPortValuePersistenceFingerprint(value)
			if rid := persistedByFingerprint[fingerprint]; rid != nil {
				value.ResourceID = rid
			} else {
				data, mimeType, ext, err := canvasPortValueResourcePayload(value)
				if err != nil {
					return fmt.Errorf("persist workflow output %q: %w", key, err)
				}
				name := canvasWorkflowOutputResourceName(cv, runID, key, value, ext)
				resource, err := h.createCanvasResourceFromBytes(ctx, user.ID, name, data, mimeType)
				if err != nil {
					return fmt.Errorf("persist workflow output %q: %w", key, err)
				}
				value.ResourceID = &resource.ID
				persistedByFingerprint[fingerprint] = &resource.ID
			}
		}
		outputs[key] = value
		h.bindWorkflowOutputResource(cv, runID, user.ID, key, value)
		h.attachWorkflowOutputTargets(cv, runID, user.ID, key, value)
	}
	return nil
}

func canvasPortValuePersistenceFingerprint(value canvasPortValue) string {
	value.Normalize()
	raw, _ := json.Marshal(value)
	return string(raw)
}

func canvasWorkflowOutputResourceName(cv model.Canvas, runID uint, key string, value canvasPortValue, ext string) string {
	base := canvasruntime.FirstNonEmptyString(cv.Name, "workflow")
	key = strings.Trim(regexp.MustCompile(`[^a-zA-Z0-9._-]+`).ReplaceAllString(key, "_"), "._-")
	base = strings.Trim(regexp.MustCompile(`[^a-zA-Z0-9._-]+`).ReplaceAllString(base, "_"), "._-")
	if base == "" {
		base = "workflow"
	}
	if key == "" {
		key = "output"
	}
	if ext == "" {
		switch value.Type {
		case "json":
			ext = "json"
		case "image":
			ext = "png"
		case "video":
			ext = "mp4"
		case "audio":
			ext = "mp3"
		default:
			ext = "txt"
		}
	}
	return fmt.Sprintf("%s_run_%d_%s.%s", base, runID, key, ext)
}

func (h *Service) bindWorkflowOutputResource(cv model.Canvas, runID uint, userID uint, key string, value canvasPortValue) {
	if h == nil || h.db == nil || cv.ProjectID == nil || value.ResourceID == nil || *value.ResourceID == 0 {
		return
	}
	metadata, _ := json.Marshal(map[string]any{
		"canvas_id":     cv.ID,
		"canvas_run_id": runID,
		"output_key":    key,
		"value_type":    value.Type,
	})
	sourceID := runID
	binding := model.ResourceBinding{
		ProjectID:    *cv.ProjectID,
		ResourceID:   *value.ResourceID,
		OwnerType:    "canvas",
		OwnerID:      cv.ID,
		Role:         "output",
		Slot:         key,
		Status:       "selected",
		SourceType:   "canvas",
		SourceID:     &sourceID,
		MetadataJSON: string(metadata),
		CreatedByID:  &userID,
	}
	_ = h.createBinding(binding)
}

func (h *Service) attachWorkflowOutputTargets(cv model.Canvas, runID uint, userID uint, key string, value canvasPortValue) {
	if h == nil || h.db == nil || cv.ProjectID == nil || value.ResourceID == nil || *value.ResourceID == 0 {
		return
	}
	var targets []model.CanvasOutput
	if err := h.db.
		Where("project_id = ? AND canvas_id = ? AND port_id = ? AND output_type = ? AND status IN ?", *cv.ProjectID, cv.ID, key, "candidate", []string{"pending", "attached"}).
		Find(&targets).Error; err != nil {
		return
	}
	if len(targets) == 0 && key == "value" {
		_ = h.db.
			Where("project_id = ? AND canvas_id = ? AND canvas_node_id = ? AND output_type = ? AND status IN ?", *cv.ProjectID, cv.ID, "final-output", "candidate", []string{"pending", "attached"}).
			Find(&targets).Error
	}
	if len(targets) == 0 && key == "final_output" {
		_ = h.db.
			Where("project_id = ? AND canvas_id = ? AND canvas_node_id = ? AND output_type = ? AND status IN ?", *cv.ProjectID, cv.ID, "final-output", "candidate", []string{"pending", "attached"}).
			Find(&targets).Error
	}
	if len(targets) == 0 {
		return
	}
	for _, target := range targets {
		if target.OwnerType != "asset_slot" || target.OwnerID == 0 {
			continue
		}
		h.attachAssetSlotCandidateOutput(cv, runID, userID, target, value)
	}
}

func (h *Service) attachAssetSlotCandidateOutput(cv model.Canvas, runID uint, userID uint, target model.CanvasOutput, value canvasPortValue) {
	if cv.ProjectID == nil || value.ResourceID == nil || *value.ResourceID == 0 {
		return
	}
	var sourceSlot model.AssetSlot
	if err := h.db.First(&sourceSlot, target.OwnerID).Error; err != nil || sourceSlot.ProjectID != *cv.ProjectID {
		return
	}
	name := strings.TrimSpace(sourceSlot.Name)
	if name == "" {
		name = fmt.Sprintf("素材位 #%d", sourceSlot.ID)
	}
	var candidateSlot model.AssetSlot
	err := h.db.
		Where("project_id = ? AND owner_type = ? AND owner_id = ? AND resource_id = ?", *cv.ProjectID, "asset_slot", sourceSlot.ID, *value.ResourceID).
		Order("id asc").
		First(&candidateSlot).Error
	if err != nil {
		candidateSlot = model.AssetSlot{
			ProjectID:                *cv.ProjectID,
			ProductionID:             sourceSlot.ProductionID,
			CreativeReferenceID:      sourceSlot.CreativeReferenceID,
			CreativeReferenceStateID: sourceSlot.CreativeReferenceStateID,
			OwnerType:                "asset_slot",
			OwnerID:                  &sourceSlot.ID,
			Kind:                     canvasruntime.FirstNonEmptyString(sourceSlot.Kind, value.Type, "image"),
			Name:                     name + " · 生成候选",
			Description:              canvasruntime.FirstNonEmptyString(sourceSlot.Description, sourceSlot.PromptHint),
			SlotKey:                  sourceSlot.SlotKey,
			PromptHint:               sourceSlot.PromptHint,
			Status:                   "candidate",
			Priority:                 canvasruntime.FirstNonEmptyString(sourceSlot.Priority, "normal"),
			ResourceID:               value.ResourceID,
			MetadataJSON:             canvasOutputMetadataJSON(cv.ID, runID, target, value),
		}
		if err := h.db.Create(&candidateSlot).Error; err != nil {
			return
		}
	}
	sourceID := runID
	var existingBinding model.ResourceBinding
	if err := h.db.
		Where("project_id = ? AND resource_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND version = ?", *cv.ProjectID, *value.ResourceID, "asset_slot", candidateSlot.ID, "output", target.PortID, 1).
		First(&existingBinding).Error; err != nil {
		_ = h.createBinding(model.ResourceBinding{
			ProjectID:    *cv.ProjectID,
			ResourceID:   *value.ResourceID,
			OwnerType:    "asset_slot",
			OwnerID:      candidateSlot.ID,
			Role:         "output",
			Slot:         target.PortID,
			Status:       "selected",
			SourceType:   "canvas",
			SourceID:     &sourceID,
			IsPrimary:    true,
			MetadataJSON: canvasOutputMetadataJSON(cv.ID, runID, target, value),
			CreatedByID:  &userID,
		})
	}
	var existing model.AssetSlotCandidate
	err = h.db.
		Where("project_id = ? AND asset_slot_id = ? AND candidate_asset_slot_id = ?", *cv.ProjectID, sourceSlot.ID, candidateSlot.ID).
		First(&existing).Error
	if err != nil {
		existing = model.AssetSlotCandidate{
			ProjectID:            *cv.ProjectID,
			AssetSlotID:          sourceSlot.ID,
			CandidateAssetSlotID: candidateSlot.ID,
			SourceType:           "canvas",
			SourceID:             &runID,
			Status:               "candidate",
			Note:                 "由素材生成画布写回",
		}
		_ = h.db.Create(&existing).Error
	} else {
		updates := map[string]any{"source_type": "canvas", "source_id": runID}
		if existing.Status == "" || existing.Status == "pending" {
			updates["status"] = "candidate"
		}
		_ = h.db.Model(&existing).Updates(updates).Error
		_ = model.SyncCoreEntityRelations(h.db, &existing)
	}
	raw, _ := json.Marshal(value)
	runIDPtr := runID
	_ = h.db.Model(&model.CanvasOutput{}).Where("id = ?", target.ID).Updates(map[string]any{
		"canvas_run_id": runIDPtr,
		"resource_id":   *value.ResourceID,
		"value_json":    string(raw),
		"status":        "attached",
	}).Error
	var updatedTarget model.CanvasOutput
	if err := h.db.First(&updatedTarget, target.ID).Error; err == nil {
		_ = model.SyncCoreEntityRelations(h.db, &updatedTarget)
	}
}

func canvasOutputMetadataJSON(canvasID uint, runID uint, target model.CanvasOutput, value canvasPortValue) string {
	raw, _ := json.Marshal(map[string]any{
		"canvas_id":        canvasID,
		"canvas_run_id":    runID,
		"canvas_output_id": target.ID,
		"source_port":      target.PortID,
		"value_type":       value.Type,
	})
	return string(raw)
}

func (h *Service) ExecuteCanvasNode(ctx context.Context, user *model.User, cv model.Canvas, node *model.CanvasNode, task *model.CanvasTask, inputs canvasPortInputMap) map[string]canvasPortValue {
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
				h.db.Model(task).Update("status", "running")
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
			h.db.Model(task).Update("status", "running")
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
		h.db.Model(task).Update("status", "running")
		return h.completeCanvasReferenceTask(ctx, task, node, nd, user, inputs)
	}

	h.executeTask(user, node, task, nd, inputs)

	var updated model.CanvasTask
	if err := h.db.First(&updated, task.ID).Error; err == nil && updated.Status == "done" {
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

func (h *Service) completeInlineValueTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, outputs map[string]canvasPortValue) {
	h.db.Model(task).Update("status", "running")
	h.updateTaskOutputValues(task, outputs)
	primary := firstCanvasOutputResource(outputs)
	updates := map[string]any{"status": "done"}
	if primary != nil {
		updates["resource_id"] = *primary
		nd.ResourceID = primary
	} else {
		nd.ResourceID = nil
	}
	h.db.Model(task).Updates(updates)
	nd.Status = "done"
	nd.TaskID = &task.ID
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *Service) CollectSingleNodeInputs(ctx context.Context, user *model.User, cv model.Canvas, nodeID string, overrides map[string]canvasPortValue) (canvasPortInputMap, error) {
	inputs := canvasPortInputMap{}
	connectedHandles := map[string]bool{}
	nodeMap := map[string]*model.CanvasNode{}
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

func (h *Service) latestCanvasNodeOutputValue(ctx context.Context, user *model.User, cv model.Canvas, node *model.CanvasNode, sourceHandle string) (canvasPortValue, bool) {
	handle := strings.TrimSpace(sourceHandle)
	var nd nodeData
	_ = json.Unmarshal([]byte(node.Data), &nd)
	if handle == "" {
		handle = canvasruntime.DefaultSourceHandleForNode(node.Type, nd)
	}

	if h.db != nil {
		var task model.CanvasTask
		if err := h.db.Where("canvas_node_id = ? AND status = ?", node.ID, "done").Order("id desc").First(&task).Error; err == nil {
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

func (h *Service) staticNodeOutputs(_ context.Context, node *model.CanvasNode, nd nodeData) map[string]canvasPortValue {
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

func (h *Service) ExecuteSingleWorkflowNode(user *model.User, cv model.Canvas, node *model.CanvasNode, task *model.CanvasTask, inputs canvasPortInputMap) {
	h.ExecuteCanvasNode(context.Background(), user, cv, node, task, inputs)
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

func RegisterWorkflowOutput(outputs map[string]canvasPortValue, node *model.CanvasNode, nd nodeData, nodeOutputs map[string]canvasPortValue) {
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

func (h *Service) executeTask(user *model.User, node *model.CanvasNode, task *model.CanvasTask, nd nodeData, portInputs canvasPortInputMap) {
	h.db.Model(task).Update("status", "running")
	nd.Status = "running"
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	resolvedPrompt, mentionIDs := resolveCanvasMentions(nd.Prompt)
	nd.Prompt = resolvedPrompt
	if len(mentionIDs) > 0 {
		nd.InputResourceIDs = append(nd.InputResourceIDs, mentionIDs...)
	}

	upstreamResources := portInputs.Flatten()
	var resultURL, mimeType, resType string
	imageData, videoData := h.loadCanvasInputResources(ctx, nd, upstreamResources)

	if nd.ExecutableSpec != nil {
		h.executeExecutableSpec(ctx, user, node, task, nd, portInputs)
		return
	}

	if node.Type == "canvas" {
		h.completeCanvasReferenceTask(ctx, task, node, nd, user, portInputs)
		return
	}

	switch node.Type {
	case "text":
		if nd.ModelDbID == 0 {
			h.failTask(task, node, nd, "no model selected for this node")
			return
		}
		textReq := ai.TextRequest{
			Messages:  []ai.Message{{Role: "user", Content: nd.Prompt}},
			MaxTokens: ai.DefaultTextMaxTokens,
		}
		if _, err := h.svc.PreflightText(nd.ModelDbID, &textReq); err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		resp, err := h.svc.CallText(ctx, user.ID, nd.ModelDbID, textReq)
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		h.completeInlineTextTask(task, node, nd, resp.Content)
		return

	case "image", "ref_image_gen", "multi_angle", "style_transfer":
		if nd.ModelDbID == 0 {
			h.failTask(task, node, nd, "no model selected for this node")
			return
		}
		resp, err := h.svc.CallImage(ctx, user.ID, nd.ModelDbID, ai.ImageRequest{
			Prompt:             nd.Prompt,
			N:                  1,
			InputImageDataList: imageData,
		})
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		if len(resp.URLs) == 0 {
			h.failTask(task, node, nd, "no image returned")
			return
		}
		resultURL, mimeType, resType = resp.URLs[0], "image/png", "image"

	case "video", "ref_video_gen", "motion_imitation":
		if nd.ModelDbID == 0 {
			h.failTask(task, node, nd, "no model selected for this node")
			return
		}
		videoReq := ai.VideoRequest{
			Prompt:             nd.Prompt,
			InputImageDataList: imageData,
		}
		if len(videoData) > 0 {
			videoReq.InputVideoData = &videoData[0]
		}
		resp, err := h.svc.CallVideo(ctx, user.ID, nd.ModelDbID, videoReq)
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		resultURL = resp.URL
		if resultURL == "" {
			resultURL = resp.TaskID // async providers return a task ID
		}
		mimeType, resType = "video/mp4", "video"

	case "audio":
		h.failTask(task, node, nd, "audio generation not yet supported")
		return

	default:
		h.failTask(task, node, nd, "unknown node type")
		return
	}

	r, err := h.createCanvasResourceFromSource(ctx, user.ID, fmt.Sprintf("generated_%s_%d.%s", resType, task.ID, canvasExtFromMime(mimeType)), resultURL, mimeType)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return
	}

	h.db.Model(task).Updates(map[string]any{"status": "done", "resource_id": r.ID})
	value := canvasruntime.PortValueFromResource(&r.ID, resType)
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		canvasruntime.DefaultSourceHandleForNode(node.Type, nd): value,
		"": value,
	})
	nd.Status = "done"
	nd.ResourceID = &r.ID
	nd.TaskID = &task.ID
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *Service) executeExecutableSpec(ctx context.Context, user *model.User, node *model.CanvasNode, task *model.CanvasTask, nd nodeData, portInputs canvasPortInputMap) {
	spec := nd.ExecutableSpec
	if spec == nil {
		h.failTask(task, node, nd, "missing executable spec")
		return
	}
	if spec.Executor == "plugin_http" {
		h.executeHTTPPluginSpec(ctx, user, node, task, nd, portInputs)
		return
	}
	if spec.Executor != "ai_model" {
		h.failTask(task, node, nd, "unsupported executable executor")
		return
	}
	modelDbID := spec.ModelDbID
	if modelDbID == 0 && strings.TrimSpace(spec.FeatureKey) != "" {
		resolvedID, _, err := h.svc.GetForFeature(spec.FeatureKey)
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		modelDbID = resolvedID
	}
	if modelDbID == 0 {
		h.failTask(task, node, nd, "no model selected for executable spec")
		return
	}

	specData := nodeData{
		InputResourceIDs: spec.InputResourceIDs,
	}
	upstreamResources := portInputs.Flatten()
	imageData, videoData := h.loadCanvasInputResources(ctx, specData, upstreamResources)
	prompt := strings.TrimSpace(spec.Prompt)
	if prompt == "" && spec.Params != nil {
		if v, ok := spec.Params["prompt"].(string); ok {
			prompt = strings.TrimSpace(v)
		}
	}
	params := spec.Params
	if params == nil {
		params = map[string]any{}
	}

	var resultURL, mimeType, resType string
	switch spec.Capability {
	case "text":
		if prompt == "" {
			h.failTask(task, node, nd, "prompt is required")
			return
		}
		maxTokens := intParam(params, "max_tokens", ai.DefaultTextMaxTokens)
		textReq := ai.TextRequest{
			Messages:    []ai.Message{{Role: "user", Content: prompt}},
			MaxTokens:   maxTokens,
			Temperature: float32(floatParam(params, "temperature", -1)),
			JSONMode:    boolParam(params, "json_mode", false),
			ExtraParams: params,
		}
		if _, err := h.svc.PreflightText(modelDbID, &textReq); err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		resp, err := h.svc.CallText(ctx, user.ID, modelDbID, textReq)
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		h.completeInlineTextTask(task, node, nd, resp.Content)
		return

	case "image", "image_edit":
		if prompt == "" {
			h.failTask(task, node, nd, "prompt is required")
			return
		}
		preflight, err := h.svc.PreflightGeneration(ai.GenerationPreflightRequest{
			ModelConfigID: modelDbID,
			OutputType:    spec.Capability,
			ExtraParams:   MarshalParamsForPreflight(params),
			AspectRatio:   spec.AspectRatio,
			ImageCount:    len(imageData),
		})
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		params = ai.NormalizeGenerationParams(preflight.NormalizedParams)
		seed := int64PtrParam(params, "seed")
		watermark := boolPtrParam(params, "watermark")
		resp, err := h.svc.CallImage(ctx, user.ID, modelDbID, ai.ImageRequest{
			Prompt:              prompt,
			N:                   intParam(params, "n", 1),
			Quality:             stringParam(params, "quality", ""),
			Size:                stringParam(params, "size", stringParam(params, "image_size", "")),
			Style:               stringParam(params, "style", ""),
			AspectRatio:         canvasruntime.FirstNonEmptyString(spec.AspectRatio, stringParam(params, "aspect_ratio", "")),
			Seed:                seed,
			GuidanceScale:       floatParam(params, "guidance_scale", 0),
			Watermark:           watermark,
			OutputFormat:        stringParam(params, "output_format", ""),
			SequentialMode:      stringParam(params, "sequential_image_generation", stringParam(params, "sequential_mode", "")),
			SequentialMaxImages: intParam(params, "max_images", intParam(params, "sequential_max_images", 0)),
			WebSearch:           boolParam(params, "web_search", false),
			OptimizePromptMode:  stringParam(params, "optimize_prompt_mode", ""),
			InputImageDataList:  imageData,
			EditOnly:            spec.Capability == "image_edit",
		})
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		if len(resp.URLs) == 0 {
			h.failTask(task, node, nd, "no image returned")
			return
		}
		resultURL, mimeType, resType = resp.URLs[0], "image/png", "image"

	case "video", "video_i2v", "video_v2v":
		if prompt == "" {
			h.failTask(task, node, nd, "prompt is required")
			return
		}
		duration := firstPositive(spec.Duration, intParam(params, "duration", 0))
		preflight, err := h.svc.PreflightGeneration(ai.GenerationPreflightRequest{
			ModelConfigID: modelDbID,
			OutputType:    spec.Capability,
			ExtraParams:   MarshalParamsForPreflight(params),
			AspectRatio:   spec.AspectRatio,
			Duration:      duration,
			ImageCount:    len(imageData),
			VideoCount:    len(videoData),
		})
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		params = ai.NormalizeGenerationParams(preflight.NormalizedParams)
		videoReq := ai.VideoRequest{
			Prompt:                prompt,
			InputImageDataList:    imageData,
			Duration:              duration,
			Frames:                intParam(params, "frames", 0),
			Seed:                  int64PtrParam(params, "seed"),
			Width:                 intParam(params, "width", 0),
			Height:                intParam(params, "height", 0),
			AspectRatio:           canvasruntime.FirstNonEmptyString(spec.AspectRatio, stringParam(params, "aspect_ratio", "")),
			Ratio:                 stringParam(params, "ratio", ""),
			Quality:               stringParam(params, "quality", ""),
			Size:                  stringParam(params, "size", stringParam(params, "image_size", "")),
			ResolutionName:        stringParam(params, "resolution", stringParam(params, "resolution_name", "")),
			Preset:                stringParam(params, "preset", ""),
			CameraFixed:           boolPtrParam(params, "camera_fixed"),
			Watermark:             boolPtrParam(params, "watermark"),
			GenerateAudio:         boolPtrParam(params, "generate_audio"),
			ReturnLastFrame:       boolPtrParam(params, "return_last_frame"),
			ServiceTier:           stringParam(params, "service_tier", ""),
			ExecutionExpiresAfter: intParam(params, "execution_expires_after", 0),
			Draft:                 boolPtrParam(params, "draft"),
			WebSearch:             boolParam(params, "web_search", false),
		}
		if len(videoData) > 0 {
			videoReq.InputVideoData = &videoData[0]
		}
		resp, err := h.svc.CallVideo(ctx, user.ID, modelDbID, videoReq)
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		resultURL = resp.URL
		if resultURL == "" {
			resultURL = resp.TaskID
		}
		mimeType, resType = "video/mp4", "video"

	default:
		h.failTask(task, node, nd, "unsupported executable capability")
		return
	}

	r, err := h.createCanvasResourceFromSource(ctx, user.ID, fmt.Sprintf("generated_%s_%d.%s", resType, task.ID, canvasExtFromMime(mimeType)), resultURL, mimeType)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return
	}

	h.db.Model(task).Updates(map[string]any{"status": "done", "resource_id": r.ID})
	value := canvasruntime.PortValueFromResource(&r.ID, resType)
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		canvasruntime.DefaultSourceHandleForNode(node.Type, nd): value,
		"": value,
	})
	nd.Status = "done"
	nd.ResourceID = &r.ID
	nd.TaskID = &task.ID
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func MarshalParamsForPreflight(params map[string]any) string {
	if len(params) == 0 {
		return ""
	}
	b, err := json.Marshal(params)
	if err != nil {
		return ""
	}
	return string(b)
}

type pluginHTTPRuntimeSpec struct {
	Kind     string `json:"kind"`
	Endpoint string `json:"endpoint"`
	Method   string `json:"method"`
	Timeout  int    `json:"timeout"`
}

func (h *Service) executeHTTPPluginSpec(ctx context.Context, user *model.User, node *model.CanvasNode, task *model.CanvasTask, nd nodeData, portInputs canvasPortInputMap) {
	spec := nd.ExecutableSpec
	if spec == nil || strings.TrimSpace(spec.PluginToolKey) == "" {
		h.failTask(task, node, nd, "plugin tool key is required")
		return
	}

	var tool model.PluginTool
	err := h.db.Preload("Plugin").
		Joins("JOIN plugins ON plugins.id = plugin_tools.plugin_id").
		Where("plugin_tools.tool_key = ? AND plugin_tools.enabled = ? AND plugins.enabled = ? AND plugins.deleted_at IS NULL", spec.PluginToolKey, true, true).
		First(&tool).Error
	if err != nil {
		h.failTask(task, node, nd, "plugin tool not found")
		return
	}
	if !tool.Plugin.Trusted {
		h.failTask(task, node, nd, "plugin_http executor requires a trusted plugin")
		return
	}

	var runtime pluginHTTPRuntimeSpec
	if err := json.Unmarshal([]byte(tool.Runtime), &runtime); err != nil {
		h.failTask(task, node, nd, "invalid plugin runtime")
		return
	}
	if runtime.Kind != "http" {
		h.failTask(task, node, nd, "plugin tool is not an http runtime")
		return
	}
	if strings.TrimSpace(runtime.Endpoint) == "" {
		h.failTask(task, node, nd, "plugin http endpoint is required")
		return
	}
	method := strings.ToUpper(strings.TrimSpace(runtime.Method))
	if method == "" {
		method = http.MethodPost
	}
	if method != http.MethodPost {
		h.failTask(task, node, nd, "plugin_http executor currently supports POST only")
		return
	}
	timeout := time.Duration(firstPositive(runtime.Timeout, 30)) * time.Second
	callCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	body, _ := json.Marshal(map[string]any{
		"tool_key":           tool.ToolKey,
		"plugin_key":         tool.Plugin.PluginKey,
		"params":             spec.Params,
		"inputs":             portInputs,
		"input_resource_ids": portInputs.Flatten(),
		"canvas_node_id":     node.NodeID,
		"task_id":            task.ID,
		"user_id":            user.ID,
	})
	req, err := http.NewRequestWithContext(callCtx, method, runtime.Endpoint, bytes.NewReader(body))
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		h.failTask(task, node, nd, fmt.Sprintf("plugin http runtime returned %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody))))
		return
	}

	outputs := PluginHTTPOutputs(respBody)
	if len(outputs) == 0 {
		h.failTask(task, node, nd, "plugin http runtime returned no outputs")
		return
	}
	h.completeInlineValueTask(task, node, nd, outputs)
}

func PluginHTTPOutputs(raw []byte) map[string]canvasPortValue {
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		text := strings.TrimSpace(string(raw))
		if text == "" {
			return nil
		}
		value := canvasPortValue{Type: "text", Text: text}
		return map[string]canvasPortValue{"result": value}
	}
	outputs := map[string]canvasPortValue{}
	if rawOutputs, ok := payload["outputs"].(map[string]any); ok {
		for handle, rawValue := range rawOutputs {
			value := canvasruntime.PortValueFromAny(rawValue)
			if !canvasruntime.PortValueEmpty(value) {
				outputs[handle] = value
			}
		}
	}
	if len(outputs) == 0 {
		for _, key := range []string{"result", "value", "data", "content"} {
			if rawValue, ok := payload[key]; ok {
				value := canvasruntime.PortValueFromAny(rawValue)
				if !canvasruntime.PortValueEmpty(value) {
					outputs["result"] = value
					break
				}
			}
		}
	}
	return outputs
}

func (h *Service) completeInlineTextTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, text string) {
	value := canvasPortValue{Type: "text", Text: text}
	h.db.Model(task).Update("status", "done")
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		canvasruntime.DefaultSourceHandleForNode(node.Type, nd): value,
		"": value,
	})
	nd.Status = "done"
	nd.ResourceID = nil
	nd.TaskID = &task.ID
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *Service) completeResourceSinkTask(ctx context.Context, task *model.CanvasTask, node *model.CanvasNode, nd nodeData, user *model.User, value canvasPortValue) map[string]canvasPortValue {
	h.db.Model(task).Update("status", "running")
	value.Normalize()
	if value.ResourceID != nil && *value.ResourceID > 0 {
		outputs := map[string]canvasPortValue{
			canvasruntime.DefaultSourceHandleForNode(node.Type, nd): value,
			"": value,
		}
		h.updateTaskOutputValues(task, outputs)
		h.db.Model(task).Updates(map[string]any{"status": "done", "resource_id": *value.ResourceID})
		nd.Status = "done"
		nd.ResourceID = value.ResourceID
		nd.TaskID = &task.ID
		if task.CanvasRunID == nil {
			h.updateNodeData(node, nd)
		}
		h.updateRunStatus(task.CanvasRunID)
		return outputs
	}

	data, mimeType, ext, err := canvasPortValueResourcePayload(value)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return nil
	}
	name := canvasResourceSinkName(node, nd, task.ID, ext)
	r, err := h.createCanvasResourceFromBytes(ctx, user.ID, name, data, mimeType)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return nil
	}
	outputValue := canvasruntime.PortValueFromResource(&r.ID, "resource")
	outputs := map[string]canvasPortValue{
		canvasruntime.DefaultSourceHandleForNode(node.Type, nd): outputValue,
		"": outputValue,
	}
	h.updateTaskOutputValues(task, outputs)
	h.db.Model(task).Updates(map[string]any{"status": "done", "resource_id": r.ID})
	nd.Status = "done"
	nd.ResourceID = &r.ID
	nd.TaskID = &task.ID
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
	return outputs
}

func canvasPortValueResourcePayload(value canvasPortValue) ([]byte, string, string, error) {
	value.Normalize()
	switch value.Type {
	case "json":
		data, err := json.MarshalIndent(value.JSON, "", "  ")
		if err != nil {
			return nil, "", "", fmt.Errorf("encode json resource: %w", err)
		}
		return data, "application/json", "json", nil
	case "number", "boolean", "text":
		text := canvasruntime.PortValueText(value)
		return []byte(text), "text/plain; charset=utf-8", "txt", nil
	default:
		text := canvasruntime.PortValueText(value)
		if strings.TrimSpace(text) == "" {
			return nil, "", "", fmt.Errorf("resource sink can only persist resource or inline text/json/number/boolean values")
		}
		return []byte(text), "text/plain; charset=utf-8", "txt", nil
	}
}

func canvasResourceSinkName(_ *model.CanvasNode, nd nodeData, taskID uint, ext string) string {
	if ext == "" {
		ext = "bin"
	}
	name := sanitizeCanvasResourceFileName(nd.ParamName)
	if name == "" {
		return fmt.Sprintf("resource_%s.%s", randomCanvasResourceNameToken(taskID), ext)
	}
	if filepath.Ext(name) != "" {
		return name
	}
	return fmt.Sprintf("%s.%s", name, ext)
}

func sanitizeCanvasResourceFileName(name string) string {
	name = strings.TrimSpace(filepath.Base(name))
	name = strings.Trim(regexp.MustCompile(`[^a-zA-Z0-9._-]+`).ReplaceAllString(name, "_"), "._-")
	return name
}

func randomCanvasResourceNameToken(taskID uint) string {
	var b [6]byte
	if _, err := cryptorand.Read(b[:]); err == nil {
		return hex.EncodeToString(b[:])
	}
	return fmt.Sprintf("%d_%d", taskID, time.Now().UnixNano())
}

func (h *Service) applyPromptPortInputs(ctx context.Context, nd *nodeData, portInputs canvasPortInputMap) {
	if nd == nil || len(portInputs) == 0 {
		return
	}
	promptTexts := h.readCanvasTextValues(ctx, portInputs["prompt"])
	if len(promptTexts) > 0 {
		if strings.TrimSpace(nd.Prompt) == "" {
			nd.Prompt = strings.Join(promptTexts, "\n\n")
		} else {
			nd.Prompt = strings.TrimSpace(nd.Prompt + "\n\n" + strings.Join(promptTexts, "\n\n"))
		}
	}
	if nd.ExecutableSpec != nil {
		specPrompt := strings.TrimSpace(nd.ExecutableSpec.Prompt)
		if len(promptTexts) > 0 {
			if specPrompt == "" {
				nd.ExecutableSpec.Prompt = strings.Join(promptTexts, "\n\n")
			} else {
				nd.ExecutableSpec.Prompt = strings.TrimSpace(specPrompt + "\n\n" + strings.Join(promptTexts, "\n\n"))
			}
		}
	}
}

func (h *Service) readCanvasTextValues(ctx context.Context, values []canvasPortValue) []string {
	if len(values) == 0 {
		return nil
	}
	texts := make([]string, 0, len(values))
	var resourcePtrs []*uint
	for _, value := range values {
		if text := strings.TrimSpace(canvasruntime.PortValueText(value)); text != "" {
			texts = append(texts, text)
			continue
		}
		if value.ResourceID != nil {
			resourcePtrs = append(resourcePtrs, value.ResourceID)
		}
	}
	texts = append(texts, h.readCanvasTextInputs(ctx, resourcePtrs)...)
	return texts
}

func (h *Service) readCanvasTextInputs(ctx context.Context, resourcePtrs []*uint) []string {
	if len(resourcePtrs) == 0 {
		return nil
	}
	ids := make([]uint, 0, len(resourcePtrs))
	seen := map[uint]bool{}
	for _, ptr := range resourcePtrs {
		if ptr == nil || *ptr == 0 || seen[*ptr] {
			continue
		}
		seen[*ptr] = true
		ids = append(ids, *ptr)
	}
	if len(ids) == 0 {
		return nil
	}
	var resources []model.RawResource
	if err := h.db.Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return nil
	}
	byID := make(map[uint]model.RawResource, len(resources))
	for _, r := range resources {
		byID[r.ID] = r
	}
	texts := make([]string, 0, len(ids))
	for _, id := range ids {
		r, ok := byID[id]
		if !ok {
			continue
		}
		if r.Type != "text" && !strings.HasPrefix(strings.ToLower(r.MimeType), "text/") {
			continue
		}
		data, _, err := h.readCanvasResourceBytes(ctx, r)
		if err != nil {
			continue
		}
		if text := strings.TrimSpace(string(data)); text != "" {
			texts = append(texts, text)
		}
	}
	return texts
}

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
		h.attachGeneratedAssetSlotCandidate(cv, runID, user.ID, kind, entityID, *result.PrimaryResourceID)
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

func (h *Service) attachGeneratedAssetSlotCandidate(cv model.Canvas, runID uint, userID uint, kind string, entityID uint, resourceID uint) {
	if h == nil || h.db == nil || cv.ProjectID == nil || kind != "asset_slot" || entityID == 0 || resourceID == 0 {
		return
	}
	var candidateSlot model.AssetSlot
	if err := h.db.First(&candidateSlot, entityID).Error; err != nil || candidateSlot.ProjectID != *cv.ProjectID {
		return
	}
	if candidateSlot.ResourceID == nil {
		_ = h.db.Model(&candidateSlot).Update("resource_id", resourceID).Error
	}
	if candidateSlot.Status == "" || candidateSlot.Status == "missing" {
		_ = h.db.Model(&candidateSlot).Update("status", "candidate").Error
	}
	_ = model.SyncCoreEntityRelations(h.db, &candidateSlot)
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
		_ = h.db.Model(&existing).Updates(updates).Error
		_ = model.SyncCoreEntityRelations(h.db, &existing)
	}
	var existingBinding model.ResourceBinding
	if err := h.db.
		Where("project_id = ? AND resource_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND version = ?", *cv.ProjectID, resourceID, "asset_slot", candidateSlot.ID, "output", "result", 1).
		First(&existingBinding).Error; err != nil {
		_ = h.createBinding(model.ResourceBinding{
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

func (h *Service) createCanvasResourceFromSource(ctx context.Context, ownerID uint, name string, source string, mimeType string) (*model.RawResource, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return nil, fmt.Errorf("generated result is empty")
	}
	var data []byte
	if strings.HasPrefix(source, "data:") {
		semi := strings.Index(source, ";")
		comma := strings.Index(source, ",")
		if semi < 0 || comma < 0 || comma <= semi {
			return nil, fmt.Errorf("malformed data URI")
		}
		mimeType = strings.TrimPrefix(source[:semi], "data:")
		decoded, err := base64.StdEncoding.DecodeString(source[comma+1:])
		if err != nil {
			return nil, fmt.Errorf("decode generated data: %w", err)
		}
		data = decoded
	} else if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
		if err != nil {
			return nil, fmt.Errorf("build generated result request: %w", err)
		}
		resp, err := (&http.Client{Timeout: 2 * time.Minute}).Do(req)
		if err != nil {
			return nil, fmt.Errorf("download generated result: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("download generated result returned %d", resp.StatusCode)
		}
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			mimeType = ct
		}
		data, err = io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("read generated result: %w", err)
		}
	} else {
		var err error
		data, err = os.ReadFile(source)
		if err != nil {
			return nil, fmt.Errorf("read generated result file: %w", err)
		}
	}
	return h.createCanvasResourceFromBytes(ctx, ownerID, name, data, mimeType)
}

func (h *Service) createCanvasResourceFromBytes(ctx context.Context, ownerID uint, name string, data []byte, mimeType string) (*model.RawResource, error) {
	if h.store == nil {
		return nil, fmt.Errorf("resource storage is not configured")
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	resType := mimeToType(mimeType, name)
	key := fmt.Sprintf("canvas/%d/%d_%s", ownerID, time.Now().UnixNano(), filepath.Base(name))
	r := model.RawResource{
		OwnerID:        ownerID,
		Type:           resType,
		Name:           name,
		MimeType:       mimeType,
		Size:           int64(len(data)),
		FilePath:       "pending",
		StorageBackend: h.store.Backend(),
		StorageKey:     key,
	}
	if err := h.db.Create(&r).Error; err != nil {
		return nil, fmt.Errorf("create resource record: %w", err)
	}
	if err := h.store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		h.db.Delete(&r)
		return nil, fmt.Errorf("store resource: %w", err)
	}
	h.db.Model(&r).Update("file_path", "stored:"+key)
	r.FilePath = "stored:" + key
	return &r, nil
}

func canvasExtFromMime(mimeType string) string {
	base := strings.TrimSpace(strings.Split(mimeType, ";")[0])
	if exts, err := mime.ExtensionsByType(base); err == nil && len(exts) > 0 {
		return strings.TrimPrefix(exts[0], ".")
	}
	switch mimeToType(base, "") {
	case "image":
		return "png"
	case "video":
		return "mp4"
	case "audio":
		return "mp3"
	case "text":
		return "txt"
	default:
		return "bin"
	}
}

func stringParam(params map[string]any, key string, fallback string) string {
	if params == nil {
		return fallback
	}
	if v, ok := params[key]; ok {
		switch value := v.(type) {
		case string:
			if strings.TrimSpace(value) != "" {
				return value
			}
		case fmt.Stringer:
			return value.String()
		}
	}
	return fallback
}

func intParam(params map[string]any, key string, fallback int) int {
	if params == nil {
		return fallback
	}
	if v, ok := params[key]; ok {
		switch value := v.(type) {
		case int:
			return value
		case int64:
			return int(value)
		case float64:
			return int(value)
		case json.Number:
			if n, err := value.Int64(); err == nil {
				return int(n)
			}
		case string:
			if n, err := strconv.Atoi(strings.TrimSpace(value)); err == nil {
				return n
			}
		}
	}
	return fallback
}

func floatParam(params map[string]any, key string, fallback float64) float64 {
	if params == nil {
		return fallback
	}
	if v, ok := params[key]; ok {
		switch value := v.(type) {
		case float64:
			return value
		case float32:
			return float64(value)
		case int:
			return float64(value)
		case json.Number:
			if n, err := value.Float64(); err == nil {
				return n
			}
		case string:
			if n, err := strconv.ParseFloat(strings.TrimSpace(value), 64); err == nil {
				return n
			}
		}
	}
	return fallback
}

func boolParam(params map[string]any, key string, fallback bool) bool {
	if params == nil {
		return fallback
	}
	if v, ok := params[key]; ok {
		switch value := v.(type) {
		case bool:
			return value
		case string:
			if b, err := strconv.ParseBool(strings.TrimSpace(value)); err == nil {
				return b
			}
		}
	}
	return fallback
}

func boolPtrParam(params map[string]any, key string) *bool {
	if params == nil {
		return nil
	}
	if _, ok := params[key]; !ok {
		return nil
	}
	value := boolParam(params, key, false)
	return &value
}

func int64PtrParam(params map[string]any, key string) *int64 {
	if params == nil {
		return nil
	}
	if _, ok := params[key]; !ok {
		return nil
	}
	value := int64(intParam(params, key, 0))
	return &value
}

func firstPositive(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func (h *Service) completeCanvasReferenceTask(ctx context.Context, task *model.CanvasTask, node *model.CanvasNode, nd nodeData, user *model.User, inputs canvasPortInputMap) map[string]canvasPortValue {
	outputs, primaryOutput, err := h.executeCanvasReferenceOutputs(ctx, nd, user, inputs)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return nil
	}

	updates := map[string]any{"status": "done"}
	if primaryOutput != nil {
		updates["resource_id"] = *primaryOutput
	}
	h.db.Model(task).Updates(updates)
	h.updateTaskOutputValues(task, outputs)
	nd.Status = "done"
	nd.ResourceID = primaryOutput
	nd.TaskID = &task.ID
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
	var ref model.Canvas
	if err := h.db.Preload("Nodes").Preload("Edges").First(&ref, *nd.ReferencedCanvasID).Error; err != nil {
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
	var latestRun model.CanvasRun
	if err := h.db.Where("canvas_id = ? AND status = ?", ref.ID, "done").Order("id desc").First(&latestRun).Error; err != nil {
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
	snapshot, snapshotHash, snapshotNodeCount, snapshotEdgeCount := canvasruntime.BuildRunSnapshot(ref)
	rawInputValues := "{}"
	if len(inputValues) > 0 {
		if b, err := json.Marshal(inputValues); err == nil {
			rawInputValues = string(b)
		}
	}
	now := time.Now()
	run := model.CanvasRun{
		CanvasID:          ref.ID,
		Status:            "running",
		InputValues:       rawInputValues,
		GraphSnapshot:     snapshot,
		SnapshotHash:      snapshotHash,
		SnapshotNodeCount: snapshotNodeCount,
		SnapshotEdgeCount: snapshotEdgeCount,
		StartedAt:         &now,
	}
	if err := h.db.Create(&run).Error; err != nil {
		return model.CanvasRun{}, err
	}

	for _, taskPlan := range plan.Tasks {
		node := taskPlan.Node
		if node == nil {
			continue
		}
		task := model.CanvasTask{
			CanvasNodeID: node.ID,
			CanvasRunID:  &run.ID,
			NodeID:       node.NodeID,
			NodeLabel:    node.Label,
			NodeType:     node.Type,
			Status:       "pending",
		}
		if err := h.db.Create(&task).Error; err != nil {
			return run, err
		}
	}

	h.executeWorkflowRunWithContext(ctx, user, ref.ID, run.ID, plan.Order)
	if err := h.db.First(&run, run.ID).Error; err != nil {
		return run, err
	}
	if run.Status != "done" {
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
	var run model.CanvasRun
	if err := h.db.Where("canvas_id = ? AND id = ?", ref.ID, runID).First(&run).Error; err == nil {
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
		h.db.Where("canvas_id = ? AND type = ?", ref.ID, "output").Order("id asc").Find(&outputNodes)
	}

	var refTasks []model.CanvasTask
	refTaskQuery := h.db.Where("canvas_run_id = ?", runID)
	if len(outputNodes) > 0 {
		outputNodeIDs := make([]uint, 0, len(outputNodes))
		for _, outputNode := range outputNodes {
			outputNodeIDs = append(outputNodeIDs, outputNode.ID)
		}
		refTaskQuery = refTaskQuery.Where("canvas_node_id IN ?", outputNodeIDs)
	}
	refTaskQuery.Order("id asc").Find(&refTasks)

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

func (h *Service) loadCanvasInputResources(ctx context.Context, nd nodeData, upstreamResources []*uint) (imageData, videoData []ai.MediaData) {
	ids := make([]uint, 0, len(nd.InputResourceIDs)+len(upstreamResources))
	seen := map[uint]bool{}
	for _, id := range nd.InputResourceIDs {
		if id == 0 || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	for _, ptr := range upstreamResources {
		if ptr == nil || *ptr == 0 || seen[*ptr] {
			continue
		}
		seen[*ptr] = true
		ids = append(ids, *ptr)
	}
	if len(ids) == 0 {
		return nil, nil
	}

	var resources []model.RawResource
	if err := h.db.Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return nil, nil
	}
	byID := make(map[uint]model.RawResource, len(resources))
	for _, r := range resources {
		byID[r.ID] = r
	}
	for _, id := range ids {
		r, ok := byID[id]
		if !ok {
			continue
		}
		data, mime, err := h.readCanvasResourceBytes(ctx, r)
		if err != nil || len(data) == 0 {
			continue
		}
		md := ai.MediaData{Bytes: data, MimeType: mime}
		switch r.Type {
		case "image":
			imageData = append(imageData, md)
		case "video":
			videoData = append(videoData, md)
		}
	}
	return imageData, videoData
}

func (h *Service) readCanvasResourceBytes(ctx context.Context, r model.RawResource) ([]byte, string, error) {
	mimeType := r.MimeType
	if r.StorageKey != "" && h.store != nil {
		rc, _, storedMime, err := h.store.GetObject(ctx, r.StorageKey, -1, -1)
		if err != nil {
			return nil, "", err
		}
		defer rc.Close()
		data, err := io.ReadAll(rc)
		if storedMime != "" {
			mimeType = storedMime
		}
		return data, mimeType, err
	}

	if strings.HasPrefix(r.FilePath, "data:") {
		semi := strings.Index(r.FilePath, ";")
		comma := strings.Index(r.FilePath, ",")
		if semi < 0 || comma < 0 || comma <= semi {
			return nil, "", fmt.Errorf("malformed data URI")
		}
		mimeType = strings.TrimPrefix(r.FilePath[:semi], "data:")
		data, err := base64.StdEncoding.DecodeString(r.FilePath[comma+1:])
		return data, mimeType, err
	}

	if strings.HasPrefix(r.FilePath, "http://") || strings.HasPrefix(r.FilePath, "https://") {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.FilePath, nil)
		if err != nil {
			return nil, "", err
		}
		resp, err := (&http.Client{Timeout: 2 * time.Minute}).Do(req)
		if err != nil {
			return nil, "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, "", fmt.Errorf("download resource returned %d", resp.StatusCode)
		}
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			mimeType = ct
		}
		data, err := io.ReadAll(resp.Body)
		return data, mimeType, err
	}

	if r.FilePath != "" {
		data, err := os.ReadFile(r.FilePath)
		return data, mimeType, err
	}
	return nil, "", fmt.Errorf("resource has no readable data")
}

func resolveCanvasMentions(prompt string) (string, []uint) {
	re := regexp.MustCompile(`@\[resource:(\d+)\]`)
	var order []uint
	seen := map[uint]int{}
	for _, sub := range re.FindAllStringSubmatch(prompt, -1) {
		id64, err := strconv.ParseUint(sub[1], 10, 64)
		if err != nil {
			continue
		}
		id := uint(id64)
		if _, ok := seen[id]; !ok {
			order = append(order, id)
			seen[id] = len(order)
		}
	}
	cleaned := re.ReplaceAllStringFunc(prompt, func(match string) string {
		sub := re.FindStringSubmatch(match)
		if len(sub) < 2 {
			return ""
		}
		id64, err := strconv.ParseUint(sub[1], 10, 64)
		if err != nil {
			return ""
		}
		return fmt.Sprintf("图片%d", seen[uint(id64)])
	})
	return strings.TrimSpace(cleaned), order
}

func (h *Service) failTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, errMsg string) {
	h.db.Model(task).Updates(map[string]any{"status": "failed", "error": errMsg})
	nd.Status = "failed"
	nd.Error = errMsg
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *Service) updateNodeData(node *model.CanvasNode, nd nodeData) {
	var existing map[string]any
	if err := json.Unmarshal([]byte(node.Data), &existing); err != nil || existing == nil {
		existing = map[string]any{}
	}
	var patch map[string]any
	b, _ := json.Marshal(nd)
	_ = json.Unmarshal(b, &patch)
	for k, v := range patch {
		existing[k] = v
	}
	b, _ = json.Marshal(existing)
	h.db.Model(node).Update("data", string(b))
	node.Data = string(b)
}

func (h *Service) updateRunStatus(runID *uint) {
	if runID == nil {
		return
	}
	var tasks []model.CanvasTask
	h.db.Where("canvas_run_id = ?", *runID).Find(&tasks)
	if len(tasks) == 0 {
		return
	}
	active := false
	failed := false
	for _, task := range tasks {
		switch task.Status {
		case "pending", "running":
			active = true
		case "failed":
			failed = true
		}
	}
	status := "done"
	updates := map[string]any{"status": status}
	if active {
		status = "running"
		updates["status"] = status
	} else {
		if failed {
			status = "failed"
			updates["status"] = status
			updates["error"] = CanvasRunTaskFailureSummary(tasks)
		}
		finishedAt := time.Now()
		updates["finished_at"] = &finishedAt
	}
	h.db.Model(&model.CanvasRun{}).Where("id = ?", *runID).Updates(updates)
}

func (h *Service) createBinding(binding model.ResourceBinding) error {
	if h == nil || h.db == nil {
		return fmt.Errorf("resource binding db is not configured")
	}
	if binding.Role == "" {
		binding.Role = "attachment"
	}
	if binding.Status == "" {
		binding.Status = "draft"
	}
	if binding.SourceType == "" {
		binding.SourceType = "manual"
	}
	if binding.Version <= 0 {
		binding.Version = 1
	}
	if binding.SortOrder == 0 {
		binding.SortOrder = h.nextSortOrder(binding.ProjectID, binding.OwnerType, binding.OwnerID, binding.Role, binding.Slot)
	}
	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&binding).Error; err != nil {
			return err
		}
		return model.SyncCoreEntityRelations(tx, &binding)
	}); err != nil {
		return err
	}
	if binding.IsPrimary {
		h.clearOtherPrimaryBindings(binding)
	}
	h.backfillAssetSlotResource(binding)
	return nil
}

func (h *Service) nextSortOrder(projectID uint, ownerType string, ownerID uint, role string, slot string) int {
	var maxOrder int
	h.db.Model(&model.ResourceBinding{}).
		Select("COALESCE(MAX(sort_order), 0)").
		Where("project_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ?", projectID, ownerType, ownerID, role, slot).
		Scan(&maxOrder)
	return maxOrder + 1
}

func (h *Service) clearOtherPrimaryBindings(binding model.ResourceBinding) {
	h.db.Model(&model.ResourceBinding{}).
		Where("id <> ? AND project_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ?",
			binding.ID, binding.ProjectID, binding.OwnerType, binding.OwnerID, binding.Role, binding.Slot).
		Update("is_primary", false)
}

func (h *Service) backfillAssetSlotResource(binding model.ResourceBinding) {
	if binding.OwnerType != "asset_slot" || binding.ResourceID == 0 {
		return
	}
	h.db.Model(&model.AssetSlot{}).
		Where("id = ? AND resource_id IS NULL", binding.OwnerID).
		Update("resource_id", binding.ResourceID)
}

func mimeToType(mimeType, filename string) string {
	switch {
	case strings.HasPrefix(mimeType, "image/"):
		return "image"
	case strings.HasPrefix(mimeType, "video/"):
		return "video"
	case strings.HasPrefix(mimeType, "audio/"):
		return "audio"
	case strings.HasPrefix(mimeType, "text/"):
		return "text"
	case mimeType == "application/json", mimeType == "application/xml", mimeType == "application/yaml", mimeType == "application/x-yaml":
		return "text"
	}
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif":
		return "image"
	case ".mp4", ".mov", ".avi", ".webm":
		return "video"
	case ".mp3", ".wav", ".ogg", ".aac", ".flac":
		return "audio"
	case ".txt", ".md", ".json", ".csv", ".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".xml", ".yaml", ".yml", ".log":
		return "text"
	}
	return "file"
}

func CanvasRunTaskFailureSummary(tasks []model.CanvasTask) string {
	failures := make([]string, 0)
	for _, task := range tasks {
		if task.Status != "failed" {
			continue
		}
		label := strings.TrimSpace(task.NodeLabel)
		if label == "" {
			label = strings.TrimSpace(task.NodeID)
		}
		if label == "" {
			label = fmt.Sprintf("task #%d", task.ID)
		}
		errMsg := strings.TrimSpace(task.Error)
		if errMsg == "" {
			errMsg = "unknown error"
		}
		if len(errMsg) > 240 {
			errMsg = errMsg[:240] + "..."
		}
		failures = append(failures, fmt.Sprintf("%s: %s", label, errMsg))
	}
	if len(failures) == 0 {
		return "one or more workflow tasks failed"
	}
	if len(failures) == 1 {
		return "workflow task failed: " + failures[0]
	}
	if len(failures) > 3 {
		remaining := len(failures) - 3
		failures = append(failures[:3], fmt.Sprintf("%d more failed", remaining))
	}
	return "workflow tasks failed: " + strings.Join(failures, "; ")
}

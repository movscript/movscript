package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
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

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/workflow"
)

type canvasRunSnapshot struct {
	Version    int                `json:"version"`
	CanvasID   uint               `json:"canvas_id"`
	CapturedAt time.Time          `json:"captured_at"`
	Nodes      []model.CanvasNode `json:"nodes"`
	Edges      []model.CanvasEdge `json:"edges"`
}

type canvasExecutionPlan struct {
	Order []string
	Tasks []canvasTaskPlan
}

type canvasTaskPlan struct {
	NodeID string
	Node   *model.CanvasNode
}

// nodeData mirrors the JSON stored in CanvasNode.Data.
type nodeData struct {
	Source             string                `json:"source"`
	ResourceID         *uint                 `json:"resourceId,omitempty"`
	ReferencedCanvasID *uint                 `json:"referencedCanvasId,omitempty"`
	Prompt             string                `json:"prompt,omitempty"`
	ProviderName       string                `json:"providerName,omitempty"`
	ModelID            string                `json:"modelId,omitempty"`
	ModelDbID          uint                  `json:"modelDbId,omitempty"` // AIModel primary key (preferred over ProviderName+ModelID)
	InputResourceIDs   []uint                `json:"inputResourceIds,omitempty"`
	Status             string                `json:"status,omitempty"`
	TaskID             *uint                 `json:"taskId,omitempty"`
	Error              string                `json:"error,omitempty"`
	TextContent        string                `json:"textContent,omitempty"`
	InputValue         string                `json:"inputValue,omitempty"`
	ParamName          string                `json:"paramName,omitempty"`
	ParamType          string                `json:"paramType,omitempty"`
	ExecutableSpec     *canvasExecutableSpec `json:"executableSpec,omitempty"`
	InputPorts         []canvasPortDef       `json:"inputPorts,omitempty"`
	OutputPorts        []canvasPortDef       `json:"outputPorts,omitempty"`
	EntityKind         string                `json:"entityKind,omitempty"`
	EntityID           *uint                 `json:"entityId,omitempty"`
	EntityTitle        string                `json:"entityTitle,omitempty"`
}

type canvasPortDef struct {
	ID          string   `json:"id"`
	Aliases     []string `json:"aliases,omitempty"`
	Label       string   `json:"label,omitempty"`
	LabelKey    string   `json:"labelKey,omitempty"`
	Type        string   `json:"type,omitempty"`
	Required    bool     `json:"required,omitempty"`
	MaxCount    int      `json:"maxCount,omitempty"`
	Deprecated  bool     `json:"deprecated,omitempty"`
	Description string   `json:"description,omitempty"`
}

type canvasExecutableSpec struct {
	Executor         string         `json:"executor"`
	Capability       string         `json:"capability"`
	FeatureKey       string         `json:"featureKey,omitempty"`
	ModelDbID        uint           `json:"modelDbId,omitempty"`
	PluginToolKey    string         `json:"pluginToolKey,omitempty"`
	Prompt           string         `json:"prompt,omitempty"`
	InputResourceIDs []uint         `json:"inputResourceIds,omitempty"`
	AspectRatio      string         `json:"aspectRatio,omitempty"`
	Duration         int            `json:"duration,omitempty"`
	Params           map[string]any `json:"params,omitempty"`
}

type canvasPortValue struct {
	Type       string   `json:"type"`
	ResourceID *uint    `json:"resource_id,omitempty"`
	Text       string   `json:"text,omitempty"`
	JSON       any      `json:"json,omitempty"`
	Number     *float64 `json:"number,omitempty"`
	Boolean    *bool    `json:"boolean,omitempty"`
}

func (v *canvasPortValue) UnmarshalJSON(data []byte) error {
	var raw any
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	switch value := raw.(type) {
	case nil:
		*v = canvasPortValue{}
	case string:
		*v = canvasPortValue{Type: "text", Text: value}
	case float64:
		*v = canvasPortValue{Type: "number", Number: &value}
	case bool:
		*v = canvasPortValue{Type: "boolean", Boolean: &value}
	case map[string]any:
		type alias canvasPortValue
		var decoded alias
		if err := json.Unmarshal(data, &decoded); err != nil {
			return err
		}
		*v = canvasPortValue(decoded)
		v.normalize()
	default:
		*v = canvasPortValue{Type: "json", JSON: value}
	}
	return nil
}

func (v *canvasPortValue) normalize() {
	v.Type = strings.TrimSpace(v.Type)
	if v.Type != "" {
		return
	}
	switch {
	case v.ResourceID != nil:
		v.Type = "resource"
	case v.JSON != nil:
		v.Type = "json"
	case v.Number != nil:
		v.Type = "number"
	case v.Boolean != nil:
		v.Type = "boolean"
	default:
		v.Type = "text"
	}
}

type canvasPortInputMap map[string][]canvasPortValue

func (m canvasPortInputMap) flatten() []*uint {
	var out []*uint
	seen := map[uint]bool{}
	for _, values := range m {
		for _, value := range values {
			if value.ResourceID == nil || *value.ResourceID == 0 || seen[*value.ResourceID] {
				continue
			}
			seen[*value.ResourceID] = true
			out = append(out, value.ResourceID)
		}
	}
	return out
}

func canvasPortValueFromResource(rid *uint, valueType string) canvasPortValue {
	if valueType == "" {
		valueType = "resource"
	}
	return canvasPortValue{Type: valueType, ResourceID: rid}
}

func canvasPortValueFromText(valueType string, text string) canvasPortValue {
	valueType = strings.TrimSpace(valueType)
	if valueType == "" {
		valueType = "text"
	}
	value := canvasPortValue{Type: valueType}
	switch valueType {
	case "json":
		var decoded any
		if err := json.Unmarshal([]byte(text), &decoded); err == nil {
			value.JSON = decoded
		} else {
			value.Text = text
		}
	case "number":
		if n, err := strconv.ParseFloat(strings.TrimSpace(text), 64); err == nil {
			value.Number = &n
		} else {
			value.Text = text
		}
	case "boolean":
		if b, err := strconv.ParseBool(strings.TrimSpace(text)); err == nil {
			value.Boolean = &b
		} else {
			value.Text = text
		}
	default:
		value.Text = text
	}
	return value
}

func canvasPortValueFromAny(value any) canvasPortValue {
	switch typed := value.(type) {
	case nil:
		return canvasPortValue{}
	case canvasPortValue:
		typed.normalize()
		return typed
	case string:
		return canvasPortValue{Type: "text", Text: typed}
	case float64:
		return canvasPortValue{Type: "number", Number: &typed}
	case bool:
		return canvasPortValue{Type: "boolean", Boolean: &typed}
	default:
		raw, err := json.Marshal(typed)
		if err != nil {
			return canvasPortValue{}
		}
		var portValue canvasPortValue
		if err := json.Unmarshal(raw, &portValue); err == nil {
			portValue.normalize()
			if !canvasPortValueEmpty(portValue) {
				return portValue
			}
		}
		var decoded any
		if err := json.Unmarshal(raw, &decoded); err == nil {
			return canvasPortValue{Type: "json", JSON: decoded}
		}
		return canvasPortValue{}
	}
}

func canvasPortValueText(value canvasPortValue) string {
	if value.Text != "" {
		return value.Text
	}
	if value.JSON != nil {
		if b, err := json.Marshal(value.JSON); err == nil {
			return string(b)
		}
	}
	if value.Number != nil {
		return strconv.FormatFloat(*value.Number, 'f', -1, 64)
	}
	if value.Boolean != nil {
		return strconv.FormatBool(*value.Boolean)
	}
	return ""
}

func canvasPortValueEmpty(value canvasPortValue) bool {
	return value.ResourceID == nil && value.Text == "" && value.JSON == nil && value.Number == nil && value.Boolean == nil
}

func marshalCanvasPortInputs(inputs canvasPortInputMap) string {
	if len(inputs) == 0 {
		return ""
	}
	payload := map[string][]canvasPortValue{}
	for handle, values := range inputs {
		if strings.TrimSpace(handle) == "" {
			continue
		}
		for _, value := range values {
			value.normalize()
			if canvasPortValueEmpty(value) {
				continue
			}
			payload[handle] = append(payload[handle], value)
		}
	}
	if len(payload) == 0 {
		return ""
	}
	b, _ := json.Marshal(payload)
	return string(b)
}

func marshalCanvasPortOutputs(outputs map[string]canvasPortValue) string {
	if len(outputs) == 0 {
		return ""
	}
	payload := map[string]canvasPortValue{}
	for handle, value := range outputs {
		handle = strings.TrimSpace(handle)
		if handle == "" {
			continue
		}
		value.normalize()
		if canvasPortValueEmpty(value) {
			continue
		}
		payload[handle] = value
	}
	if len(payload) == 0 {
		return ""
	}
	b, _ := json.Marshal(payload)
	return string(b)
}

func decodeCanvasPortOutputs(raw string) map[string]canvasPortValue {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var payload map[string]canvasPortValue
	if err := json.Unmarshal([]byte(raw), &payload); err == nil {
		return payload
	}
	return nil
}

func decodeCanvasRunOutputValues(raw string) map[string]canvasPortValue {
	return decodeCanvasPortOutputs(raw)
}

func normalizeCanvasTaskForResponse(dbTask *model.CanvasTask, nodeType string) {
	if dbTask == nil {
		return
	}
	outputs := decodeCanvasPortOutputs(dbTask.OutputValues)
	if len(outputs) > 0 || dbTask.ResourceID == nil {
		return
	}
	valueType := defaultCanvasPortValueTypeForNode(firstNonEmptyString(dbTask.NodeType, nodeType), nodeData{})
	value := canvasPortValueFromResource(dbTask.ResourceID, valueType)
	handle := defaultCanvasSourceHandle(firstNonEmptyString(dbTask.NodeType, nodeType))
	outputs = map[string]canvasPortValue{
		handle:   value,
		"result": value,
		"value":  value,
	}
	dbTask.OutputValues = marshalCanvasPortOutputs(outputs)
}

func (h *CanvasHandler) lazyBackfillCanvasTaskOutputs(task *model.CanvasTask, nodeType string) {
	if task == nil || strings.TrimSpace(task.OutputValues) != "" || task.ResourceID == nil {
		return
	}
	normalizeCanvasTaskForResponse(task, nodeType)
	if strings.TrimSpace(task.OutputValues) != "" {
		h.db.Model(task).Update("output_values", task.OutputValues)
	}
}

func decodeCanvasRunInputValues(raw string) map[string]canvasPortValue {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var values map[string]canvasPortValue
	if err := json.Unmarshal([]byte(raw), &values); err == nil {
		return values
	}
	var legacy map[string]string
	if err := json.Unmarshal([]byte(raw), &legacy); err != nil {
		return nil
	}
	values = map[string]canvasPortValue{}
	for nodeID, text := range legacy {
		values[nodeID] = canvasPortValue{Type: "text", Text: text}
	}
	return values
}

func (h *CanvasHandler) updateTaskInputValues(task *model.CanvasTask, inputs canvasPortInputMap) {
	if task == nil {
		return
	}
	if raw := marshalCanvasPortInputs(inputs); raw != "" {
		h.db.Model(task).Update("input_values", raw)
		task.InputValues = raw
	}
}

func (h *CanvasHandler) updateTaskOutputValues(task *model.CanvasTask, outputs map[string]canvasPortValue) {
	if task == nil {
		return
	}
	if raw := marshalCanvasPortOutputs(outputs); raw != "" {
		h.db.Model(task).Update("output_values", raw)
		task.OutputValues = raw
	}
}

// RunNode executes one canvas node by resolving its input ports from upstream outputs.
func (h *CanvasHandler) RunNode(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "canvas not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	var node model.CanvasNode
	if err := h.db.Where("canvas_id = ? AND node_id = ?", cv.ID, c.Param("nodeId")).First(&node).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	var req struct {
		InputValues map[string]canvasPortValue `json:"input_values"`
	}
	_ = c.ShouldBindJSON(&req)

	inputs, err := h.collectSingleNodeInputs(context.Background(), user, cv, node.NodeID, req.InputValues)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	task := model.CanvasTask{
		CanvasNodeID: node.ID,
		NodeID:       node.NodeID,
		NodeLabel:    node.Label,
		NodeType:     node.Type,
		Status:       "pending",
		InputValues:  marshalCanvasPortInputs(inputs),
	}
	h.db.Create(&task)
	go h.executeSingleWorkflowNode(user, cv, &node, &task, inputs)
	c.JSON(http.StatusAccepted, task)
}

// RunCanvas starts one workflow run and executes all AI nodes in topological order.
func (h *CanvasHandler) RunCanvas(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	if cv.CanvasType != "workflow" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only workflow canvases can create run records"})
		return
	}
	var req struct {
		InputValues map[string]canvasPortValue `json:"input_values"`
	}
	_ = c.ShouldBindJSON(&req)

	plan, err := buildCanvasExecutionPlan(cv)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cycle detected in canvas"})
		return
	}
	if err := validateCanvasRequiredInputs(cv, req.InputValues); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	snapshot, snapshotHash, snapshotNodeCount, snapshotEdgeCount := buildCanvasRunSnapshot(cv)

	inputValues := "{}"
	if req.InputValues != nil {
		if b, err := json.Marshal(req.InputValues); err == nil {
			inputValues = string(b)
		}
	}
	now := time.Now()
	run := model.CanvasRun{
		CanvasID:          cv.ID,
		Status:            "running",
		InputValues:       inputValues,
		GraphSnapshot:     snapshot,
		SnapshotHash:      snapshotHash,
		SnapshotNodeCount: snapshotNodeCount,
		SnapshotEdgeCount: snapshotEdgeCount,
		StartedAt:         &now,
	}
	h.db.Create(&run)

	var tasks []model.CanvasTask
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
		h.db.Create(&task)
		tasks = append(tasks, task)
	}

	if len(tasks) == 0 {
		finishedAt := time.Now()
		h.db.Model(&run).Updates(map[string]any{"status": "done", "finished_at": &finishedAt})
		run.Status = "done"
		run.FinishedAt = &finishedAt
	} else {
		go h.executeWorkflowRun(user, cv.ID, run.ID, plan.Order)
	}
	run.Tasks = tasks
	c.JSON(http.StatusAccepted, gin.H{"run": run, "tasks": tasks})
}

func (h *CanvasHandler) executeWorkflowRun(user *model.User, canvasID uint, runID uint, order []string) {
	h.executeWorkflowRunWithContext(context.Background(), user, canvasID, runID, order)
}

func (h *CanvasHandler) executeWorkflowRunWithContext(ctx context.Context, user *model.User, canvasID uint, runID uint, order []string) {
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

	cv, snapshotErr := canvasFromRunSnapshot(canvasID, run.GraphSnapshot)
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
	inputValues := decodeCanvasRunInputValues(run.InputValues)
	workflowOutputs := decodeCanvasRunOutputValues(run.OutputValues)
	if workflowOutputs == nil {
		workflowOutputs = map[string]canvasPortValue{}
	}

	produced := map[string]map[string]canvasPortValue{}
	setProduced := func(nodeID string, handle string, value canvasPortValue) {
		value.normalize()
		if canvasPortValueEmpty(value) {
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
			if value, ok := byHandle[edge.SourceHandle]; ok && !canvasPortValueEmpty(value) {
				return value, true
			}
		}
		value, ok := byHandle[""]
		return value, ok && !canvasPortValueEmpty(value)
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
		outputs := h.executeCanvasNode(ctx, user, cv, node, task, portInputs)
		if node.Type == "output" {
			var nd nodeData
			_ = json.Unmarshal([]byte(node.Data), &nd)
			registerWorkflowOutput(workflowOutputs, node, nd, outputs)
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
	if raw := marshalCanvasPortOutputs(workflowOutputs); raw != "" {
		h.db.Model(&model.CanvasRun{}).Where("id = ?", runID).Update("output_values", raw)
	}
	h.updateRunStatus(&runID)
}

func (h *CanvasHandler) persistWorkflowOutputsToResources(ctx context.Context, user *model.User, cv model.Canvas, runID uint, outputs map[string]canvasPortValue) error {
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
		value.normalize()
		if canvasPortValueEmpty(value) {
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
	}
	return nil
}

func canvasPortValuePersistenceFingerprint(value canvasPortValue) string {
	value.normalize()
	raw, _ := json.Marshal(value)
	return string(raw)
}

func canvasWorkflowOutputResourceName(cv model.Canvas, runID uint, key string, value canvasPortValue, ext string) string {
	base := firstNonEmptyString(cv.Name, "workflow")
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

func (h *CanvasHandler) bindWorkflowOutputResource(cv model.Canvas, runID uint, userID uint, key string, value canvasPortValue) {
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
	_ = NewResourceBindingHandler(h.db).createBinding(binding)
}

func buildCanvasExecutionPlan(cv model.Canvas) (canvasExecutionPlan, error) {
	order, err := topoSort(cv.Nodes, cv.Edges)
	if err != nil {
		return canvasExecutionPlan{}, err
	}
	nodeMap := map[string]*model.CanvasNode{}
	for i := range cv.Nodes {
		nodeMap[cv.Nodes[i].NodeID] = &cv.Nodes[i]
	}
	plan := canvasExecutionPlan{Order: order}
	for _, nid := range order {
		node := nodeMap[nid]
		if !canvasNodeRequiresWorkflowTask(cv, node) {
			continue
		}
		plan.Tasks = append(plan.Tasks, canvasTaskPlan{NodeID: nid, Node: node})
	}
	return plan, nil
}

func canvasNodeRequiresWorkflowTask(cv model.Canvas, node *model.CanvasNode) bool {
	if node == nil {
		return false
	}
	if isCanvasEntityNode(node.Type) && hasCanvasEntityInputs(cv.Edges, node.NodeID) {
		return true
	}
	if node.Type == "output" {
		return true
	}
	if node.Type == "resource_sink" {
		return true
	}
	var nd nodeData
	_ = json.Unmarshal([]byte(node.Data), &nd)
	return nd.Source == "ai" || nd.ExecutableSpec != nil
}

func (h *CanvasHandler) executeCanvasNode(ctx context.Context, user *model.User, cv model.Canvas, node *model.CanvasNode, task *model.CanvasTask, inputs canvasPortInputMap) map[string]canvasPortValue {
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
		if canvasPortValueEmpty(value) {
			value = staticCanvasNodePortValue(node, nd)
		}
		outputs := map[string]canvasPortValue{"value": value, "": value}
		if task != nil {
			h.completeInlineValueTask(task, node, nd, outputs)
		}
		return outputs
	}

	if node.Type == "output" {
		outputValue := firstCanvasInputValue(inputs)
		if canvasPortValueEmpty(outputValue) {
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
		if canvasPortValueEmpty(outputValue) {
			h.db.Model(task).Update("status", "running")
			h.failTask(task, node, nd, "resource sink has no upstream value")
			return nil
		}
		return h.completeResourceSinkTask(ctx, task, node, nd, user, outputValue)
	}

	if isCanvasEntityNode(node.Type) {
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
		if outputs := decodeCanvasPortOutputs(updated.OutputValues); len(outputs) > 0 {
			return outputs
		}
		if updated.ResourceID != nil {
			value := canvasPortValueFromResource(updated.ResourceID, defaultCanvasPortValueTypeForNode(node.Type, nd))
			outputs := map[string]canvasPortValue{
				defaultCanvasSourceHandleForNode(node.Type, nd): value,
				"": value,
			}
			h.updateTaskOutputValues(task, outputs)
			return outputs
		}
	}
	return nil
}

func (h *CanvasHandler) completeInlineValueTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, outputs map[string]canvasPortValue) {
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

func buildCanvasRunSnapshot(cv model.Canvas) (string, string, int, int) {
	snapshot := canvasRunSnapshot{
		Version:    1,
		CanvasID:   cv.ID,
		CapturedAt: time.Now(),
		Nodes:      cv.Nodes,
		Edges:      cv.Edges,
	}
	b, err := json.Marshal(snapshot)
	if err != nil {
		return "", "", len(cv.Nodes), len(cv.Edges)
	}
	hashPayload, _ := json.Marshal(struct {
		Nodes []model.CanvasNode `json:"nodes"`
		Edges []model.CanvasEdge `json:"edges"`
	}{Nodes: cv.Nodes, Edges: cv.Edges})
	sum := sha256.Sum256(hashPayload)
	return string(b), hex.EncodeToString(sum[:]), len(cv.Nodes), len(cv.Edges)
}

func canvasFromRunSnapshot(canvasID uint, raw string) (model.Canvas, error) {
	if strings.TrimSpace(raw) == "" {
		return model.Canvas{}, fmt.Errorf("empty snapshot")
	}
	var snapshot canvasRunSnapshot
	if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
		return model.Canvas{}, err
	}
	cv := model.Canvas{Nodes: snapshot.Nodes, Edges: snapshot.Edges}
	cv.ID = canvasID
	return cv, nil
}

func (h *CanvasHandler) collectSingleNodeInputs(ctx context.Context, user *model.User, cv model.Canvas, nodeID string, overrides map[string]canvasPortValue) (canvasPortInputMap, error) {
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
		value.normalize()
		if canvasPortValueEmpty(value) {
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
			if !canvasPortValuesPresent(inputs[handle]) {
				return nil, fmt.Errorf("required input %q is missing", handle)
			}
		}
	}
	return inputs, nil
}

func canvasPortValuesPresent(values []canvasPortValue) bool {
	for _, value := range values {
		if !canvasPortValueEmpty(value) {
			return true
		}
	}
	return false
}

func validateCanvasRequiredInputs(cv model.Canvas, inputValues map[string]canvasPortValue) error {
	incoming := map[string]map[string]bool{}
	for _, edge := range cv.Edges {
		handle := strings.TrimSpace(edge.TargetHandle)
		if handle == "" {
			handle = "input"
		}
		if incoming[edge.Target] == nil {
			incoming[edge.Target] = map[string]bool{}
		}
		incoming[edge.Target][handle] = true
	}
	for i := range cv.Nodes {
		node := &cv.Nodes[i]
		var nd nodeData
		if err := json.Unmarshal([]byte(node.Data), &nd); err != nil {
			return fmt.Errorf("node %q has invalid data", node.NodeID)
		}
		for _, port := range nd.InputPorts {
			handle := strings.TrimSpace(port.ID)
			if handle == "" || !port.Required {
				continue
			}
			if incoming[node.NodeID][handle] {
				continue
			}
			if node.Type == "input" {
				if value, ok := inputValues[node.NodeID]; ok {
					value.normalize()
					if !canvasPortValueEmpty(value) {
						continue
					}
				}
				if !canvasPortValueEmpty(staticCanvasNodePortValue(node, nd)) {
					continue
				}
			}
			return fmt.Errorf("node %q required input %q is missing", node.NodeID, handle)
		}
	}
	return nil
}

func (h *CanvasHandler) latestCanvasNodeOutputValue(ctx context.Context, user *model.User, cv model.Canvas, node *model.CanvasNode, sourceHandle string) (canvasPortValue, bool) {
	handle := strings.TrimSpace(sourceHandle)
	var nd nodeData
	_ = json.Unmarshal([]byte(node.Data), &nd)
	if handle == "" {
		handle = defaultCanvasSourceHandleForNode(node.Type, nd)
	}

	if h.db != nil {
		var task model.CanvasTask
		if err := h.db.Where("canvas_node_id = ? AND status = ?", node.ID, "done").Order("id desc").First(&task).Error; err == nil {
			outputs := decodeCanvasPortOutputs(task.OutputValues)
			if len(outputs) > 0 {
				for _, key := range []string{handle, "", defaultCanvasSourceHandleForNode(node.Type, nd), "result", "value"} {
					if value, ok := outputs[key]; ok && !canvasPortValueEmpty(value) {
						return value, true
					}
				}
				for _, value := range outputs {
					if !canvasPortValueEmpty(value) {
						return value, true
					}
				}
			}
			if task.ResourceID != nil {
				return canvasPortValueFromResource(task.ResourceID, defaultCanvasPortValueTypeForNode(node.Type, nd)), true
			}
		}
	}

	if isCanvasEntityNode(node.Type) {
		outputs := h.resolveEntityNodeOutputs(ctx, user, nd)
		for _, key := range []string{handle, "", "result"} {
			if value, ok := outputs[key]; ok && !canvasPortValueEmpty(value) {
				return value, true
			}
		}
		for _, value := range outputs {
			if !canvasPortValueEmpty(value) {
				return value, true
			}
		}
	}

	outputs := h.staticNodeOutputs(ctx, node, nd)
	if value, ok := outputs[handle]; ok && !canvasPortValueEmpty(value) {
		return value, true
	}
	if value, ok := outputs[""]; ok && !canvasPortValueEmpty(value) {
		return value, true
	}
	for _, value := range outputs {
		if !canvasPortValueEmpty(value) {
			return value, true
		}
	}
	_ = cv
	return canvasPortValue{}, false
}

func (h *CanvasHandler) staticNodeOutputs(_ context.Context, node *model.CanvasNode, nd nodeData) map[string]canvasPortValue {
	outputs := map[string]canvasPortValue{}
	handle := defaultCanvasSourceHandleForNode(node.Type, nd)
	set := func(port string, value canvasPortValue) {
		value.normalize()
		if canvasPortValueEmpty(value) {
			return
		}
		if strings.TrimSpace(port) == "" {
			port = handle
		}
		outputs[port] = value
		outputs[""] = value
	}
	value := staticCanvasNodePortValue(node, nd)
	if !canvasPortValueEmpty(value) {
		set(handle, value)
	}
	return outputs
}

func (h *CanvasHandler) executeSingleWorkflowNode(user *model.User, cv model.Canvas, node *model.CanvasNode, task *model.CanvasTask, inputs canvasPortInputMap) {
	h.executeCanvasNode(context.Background(), user, cv, node, task, inputs)
}

func firstCanvasInputValue(inputs canvasPortInputMap) canvasPortValue {
	for _, value := range inputs[""] {
		if !canvasPortValueEmpty(value) {
			return value
		}
	}
	for _, values := range inputs {
		for _, value := range values {
			if !canvasPortValueEmpty(value) {
				return value
			}
		}
	}
	return canvasPortValue{}
}

func firstCanvasOutputValue(outputs map[string]canvasPortValue) canvasPortValue {
	for _, key := range []string{"", "value", "result"} {
		if value, ok := outputs[key]; ok && !canvasPortValueEmpty(value) {
			return value
		}
	}
	for _, value := range outputs {
		if !canvasPortValueEmpty(value) {
			return value
		}
	}
	return canvasPortValue{}
}

func registerWorkflowOutput(outputs map[string]canvasPortValue, node *model.CanvasNode, nd nodeData, nodeOutputs map[string]canvasPortValue) {
	if outputs == nil || node == nil {
		return
	}
	value := firstCanvasOutputValue(nodeOutputs)
	if canvasPortValueEmpty(value) {
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

func isCanvasEntityNode(nodeType string) bool {
	return nodeType == "entity_card"
}

func hasCanvasEntityInputs(edges []model.CanvasEdge, nodeID string) bool {
	for _, edge := range edges {
		if edge.Target == nodeID {
			return true
		}
	}
	return false
}

// ListRuns returns workflow runs for a canvas, newest first.
func (h *CanvasHandler) ListRuns(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "canvas not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var runs []model.CanvasRun
	q := h.db.Model(&model.CanvasRun{}).Where("canvas_id = ?", cv.ID)
	if status := strings.TrimSpace(c.Query("status")); status != "" && status != "all" {
		q = q.Where("status = ?", status)
	}

	pageMode := c.Query("page") != "" || c.Query("page_size") != ""
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	var total int64
	q.Count(&total)
	q.Omit("graph_snapshot").Order("id desc")
	if pageMode {
		q.Limit(pageSize).Offset((page - 1) * pageSize).Find(&runs)
		c.JSON(http.StatusOK, gin.H{"total": total, "items": runs, "page": page, "page_size": pageSize})
		return
	}
	q.Limit(20).Find(&runs)
	c.JSON(http.StatusOK, runs)
}

// GetRun returns one workflow run and its tasks.
func (h *CanvasHandler) GetRun(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "canvas not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var run model.CanvasRun
	if err := h.db.Where("canvas_id = ? AND id = ?", cv.ID, c.Param("runId")).Preload("Tasks.Resource").First(&run).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not found"})
		return
	}
	for i := range run.Tasks {
		if run.Tasks[i].Resource != nil {
			run.Tasks[i].Resource.URL = resourceURL(c, run.Tasks[i].Resource.ID)
		}
	}
	c.JSON(http.StatusOK, run)
}

// ListRunTasks returns tasks belonging to one workflow run.
func (h *CanvasHandler) ListRunTasks(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "canvas not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var run model.CanvasRun
	if err := h.db.Where("canvas_id = ? AND id = ?", cv.ID, c.Param("runId")).First(&run).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not found"})
		return
	}
	var tasks []model.CanvasTask
	h.db.Where("canvas_run_id = ?", run.ID).Preload("Resource").Order("id asc").Find(&tasks)
	for i := range tasks {
		h.lazyBackfillCanvasTaskOutputs(&tasks[i], tasks[i].NodeType)
		if tasks[i].Resource != nil {
			tasks[i].Resource.URL = resourceURL(c, tasks[i].Resource.ID)
		}
	}
	c.JSON(http.StatusOK, tasks)
}

// ListEntityWriteAudits returns entity write audit records visible to the current canvas owner.
func (h *CanvasHandler) ListEntityWriteAudits(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	canvasTable := h.db.NamingStrategy.TableName("Canvas")
	q := h.db.Model(&model.CanvasEntityWriteAudit{}).
		Joins("JOIN "+canvasTable+" ON "+canvasTable+".id = canvas_entity_write_audits.canvas_id").
		Where(canvasTable+".owner_id = ?", user.ID)

	if value, ok, err := optionalUintQuery(c, "canvas_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		q = q.Where("canvas_entity_write_audits.canvas_id = ?", value)
	}
	if value, ok, err := optionalUintQuery(c, "run_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		q = q.Where("canvas_entity_write_audits.canvas_run_id = ?", value)
	}
	if value, ok, err := optionalUintQuery(c, "canvas_run_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		q = q.Where("canvas_entity_write_audits.canvas_run_id = ?", value)
	}
	if entityKind := strings.TrimSpace(c.Query("entity_kind")); entityKind != "" {
		q = q.Where("canvas_entity_write_audits.entity_kind = ?", entityKind)
	}
	if value, ok, err := optionalUintQuery(c, "entity_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		q = q.Where("canvas_entity_write_audits.entity_id = ?", value)
	}
	if value, ok, err := optionalUintQuery(c, "user_id"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	} else if ok {
		q = q.Where("canvas_entity_write_audits.user_id = ?", value)
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 200 {
		pageSize = 50
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var audits []model.CanvasEntityWriteAudit
	if err := q.Order("canvas_entity_write_audits.id desc").Limit(pageSize).Offset((page - 1) * pageSize).Find(&audits).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"total": total, "items": audits, "page": page, "page_size": pageSize})
}

func optionalUintQuery(c *gin.Context, key string) (uint, bool, error) {
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return 0, false, nil
	}
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, false, fmt.Errorf("%s must be an unsigned integer", key)
	}
	return uint(value), true, nil
}

// GetNodeTask returns the latest CanvasTask for a given node.
func (h *CanvasHandler) GetNodeTask(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var node model.CanvasNode
	if err := h.db.Where("canvas_id = ? AND node_id = ?", c.Param("id"), c.Param("nodeId")).First(&node).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	var task model.CanvasTask
	if err := h.db.Where("canvas_node_id = ?", node.ID).Order("id desc").First(&task).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no task"})
		return
	}
	if task.ResourceID != nil {
		var resource model.RawResource
		if err := h.db.First(&resource, *task.ResourceID).Error; err == nil {
			resource.URL = resourceURL(c, resource.ID)
			task.Resource = &resource
		}
	}
	h.lazyBackfillCanvasTaskOutputs(&task, node.Type)
	c.JSON(http.StatusOK, task)
}

// ListNodeTasks returns all CanvasTasks for a given node, newest first.
func (h *CanvasHandler) ListNodeTasks(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var node model.CanvasNode
	if err := h.db.Where("canvas_id = ? AND node_id = ?", c.Param("id"), c.Param("nodeId")).First(&node).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	var tasks []model.CanvasTask
	h.db.Where("canvas_node_id = ?", node.ID).Preload("Resource").Order("id desc").Find(&tasks)
	// Populate resource URLs
	for i := range tasks {
		h.lazyBackfillCanvasTaskOutputs(&tasks[i], node.Type)
		if tasks[i].Resource != nil {
			tasks[i].Resource.URL = resourceURL(c, tasks[i].Resource.ID)
		}
	}
	c.JSON(http.StatusOK, tasks)
}

func (h *CanvasHandler) executeTask(user *model.User, node *model.CanvasNode, task *model.CanvasTask, nd nodeData, portInputs canvasPortInputMap) {
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

	upstreamResources := portInputs.flatten()
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
		resp, err := h.svc.CallText(ctx, user.ID, nd.ModelDbID, ai.TextRequest{
			Messages:  []ai.Message{{Role: "user", Content: nd.Prompt}},
			MaxTokens: 2048,
		})
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
	value := canvasPortValueFromResource(&r.ID, resType)
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		defaultCanvasSourceHandleForNode(node.Type, nd): value,
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

func (h *CanvasHandler) executeExecutableSpec(ctx context.Context, user *model.User, node *model.CanvasNode, task *model.CanvasTask, nd nodeData, portInputs canvasPortInputMap) {
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
	upstreamResources := portInputs.flatten()
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
		maxTokens := intParam(params, "max_tokens", 2048)
		resp, err := h.svc.CallText(ctx, user.ID, modelDbID, ai.TextRequest{
			Messages:    []ai.Message{{Role: "user", Content: prompt}},
			MaxTokens:   maxTokens,
			ExtraParams: params,
		})
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
		seed := int64PtrParam(params, "seed")
		watermark := boolPtrParam(params, "watermark")
		resp, err := h.svc.CallImage(ctx, user.ID, modelDbID, ai.ImageRequest{
			Prompt:              prompt,
			N:                   intParam(params, "n", 1),
			Quality:             stringParam(params, "quality", ""),
			Size:                stringParam(params, "size", stringParam(params, "image_size", "")),
			Style:               stringParam(params, "style", ""),
			AspectRatio:         spec.AspectRatio,
			Seed:                seed,
			GuidanceScale:       floatParam(params, "guidance_scale", 0),
			Watermark:           watermark,
			OutputFormat:        stringParam(params, "output_format", ""),
			SequentialMode:      stringParam(params, "sequential_mode", ""),
			SequentialMaxImages: intParam(params, "sequential_max_images", 0),
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
		videoReq := ai.VideoRequest{
			Prompt:                prompt,
			InputImageDataList:    imageData,
			Duration:              firstPositive(spec.Duration, intParam(params, "duration", 0)),
			Frames:                intParam(params, "frames", 0),
			Seed:                  int64PtrParam(params, "seed"),
			Width:                 intParam(params, "width", 0),
			Height:                intParam(params, "height", 0),
			AspectRatio:           spec.AspectRatio,
			Ratio:                 stringParam(params, "ratio", ""),
			Quality:               stringParam(params, "quality", ""),
			Size:                  stringParam(params, "size", ""),
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
	value := canvasPortValueFromResource(&r.ID, resType)
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		defaultCanvasSourceHandleForNode(node.Type, nd): value,
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

type pluginHTTPRuntimeSpec struct {
	Kind     string `json:"kind"`
	Endpoint string `json:"endpoint"`
	Method   string `json:"method"`
	Timeout  int    `json:"timeout"`
}

func (h *CanvasHandler) executeHTTPPluginSpec(ctx context.Context, user *model.User, node *model.CanvasNode, task *model.CanvasTask, nd nodeData, portInputs canvasPortInputMap) {
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
		"input_resource_ids": portInputs.flatten(),
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

	outputs := pluginHTTPOutputs(respBody)
	if len(outputs) == 0 {
		h.failTask(task, node, nd, "plugin http runtime returned no outputs")
		return
	}
	h.completeInlineValueTask(task, node, nd, outputs)
}

func pluginHTTPOutputs(raw []byte) map[string]canvasPortValue {
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
			value := canvasPortValueFromAny(rawValue)
			if !canvasPortValueEmpty(value) {
				outputs[handle] = value
			}
		}
	}
	if len(outputs) == 0 {
		for _, key := range []string{"result", "value", "data", "content"} {
			if rawValue, ok := payload[key]; ok {
				value := canvasPortValueFromAny(rawValue)
				if !canvasPortValueEmpty(value) {
					outputs["result"] = value
					break
				}
			}
		}
	}
	return outputs
}

func (h *CanvasHandler) completeInlineTextTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, text string) {
	value := canvasPortValue{Type: "text", Text: text}
	h.db.Model(task).Update("status", "done")
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		defaultCanvasSourceHandleForNode(node.Type, nd): value,
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

func (h *CanvasHandler) completeResourceSinkTask(ctx context.Context, task *model.CanvasTask, node *model.CanvasNode, nd nodeData, user *model.User, value canvasPortValue) map[string]canvasPortValue {
	h.db.Model(task).Update("status", "running")
	value.normalize()
	if value.ResourceID != nil && *value.ResourceID > 0 {
		outputs := map[string]canvasPortValue{
			defaultCanvasSourceHandleForNode(node.Type, nd): value,
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
	outputValue := canvasPortValueFromResource(&r.ID, firstNonEmptyString(nd.ParamType, "resource"))
	outputs := map[string]canvasPortValue{
		defaultCanvasSourceHandleForNode(node.Type, nd): outputValue,
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
	value.normalize()
	switch value.Type {
	case "json":
		data, err := json.MarshalIndent(value.JSON, "", "  ")
		if err != nil {
			return nil, "", "", fmt.Errorf("encode json resource: %w", err)
		}
		return data, "application/json", "json", nil
	case "number", "boolean", "text":
		text := canvasPortValueText(value)
		return []byte(text), "text/plain; charset=utf-8", "txt", nil
	default:
		text := canvasPortValueText(value)
		if strings.TrimSpace(text) == "" {
			return nil, "", "", fmt.Errorf("resource sink can only persist resource or inline text/json/number/boolean values")
		}
		return []byte(text), "text/plain; charset=utf-8", "txt", nil
	}
}

func canvasResourceSinkName(node *model.CanvasNode, nd nodeData, taskID uint, ext string) string {
	base := firstNonEmptyString(nd.ParamName, node.Label, node.NodeID, "canvas_output")
	base = strings.Trim(regexp.MustCompile(`[^a-zA-Z0-9._-]+`).ReplaceAllString(base, "_"), "._-")
	if base == "" {
		base = "canvas_output"
	}
	if ext == "" {
		ext = "bin"
	}
	return fmt.Sprintf("%s_%d.%s", base, taskID, ext)
}

func defaultCanvasSourceHandle(nodeType string) string {
	switch nodeType {
	case "input", "output":
		return "value"
	case "resource_sink":
		return "resource"
	case "text", "text_gen":
		return "text"
	case "image", "ref_image_gen":
		return "image"
	case "video", "ref_video_gen", "motion_imitation":
		return "video"
	case "audio":
		return "audio"
	case "multi_angle":
		return "multi_angle_image"
	case "style_transfer":
		return "styled_image"
	default:
		return "result"
	}
}

func defaultCanvasSourceHandleForNode(nodeType string, nd nodeData) string {
	for _, port := range nd.OutputPorts {
		if strings.TrimSpace(port.ID) != "" {
			return strings.TrimSpace(port.ID)
		}
	}
	return defaultCanvasSourceHandle(nodeType)
}

func defaultCanvasPortValueTypeForNode(nodeType string, nd nodeData) string {
	for _, port := range nd.OutputPorts {
		if strings.TrimSpace(port.Type) != "" {
			return strings.TrimSpace(port.Type)
		}
	}
	switch nodeType {
	case "text", "text_gen", "input":
		return "text"
	case "output":
		return firstNonEmptyString(nd.ParamType, "resource")
	case "resource_sink":
		return "resource"
	case "image", "ref_image_gen", "multi_angle", "style_transfer":
		return "image"
	case "video", "ref_video_gen", "motion_imitation":
		return "video"
	case "audio":
		return "audio"
	default:
		return "resource"
	}
}

func staticCanvasNodePortValue(node *model.CanvasNode, nd nodeData) canvasPortValue {
	valueType := defaultCanvasPortValueTypeForNode(node.Type, nd)
	if nd.ResourceID != nil {
		return canvasPortValueFromResource(nd.ResourceID, valueType)
	}
	switch node.Type {
	case "input":
		return canvasPortValueFromText(firstNonEmptyString(nd.ParamType, valueType, "text"), nd.InputValue)
	case "text":
		return canvasPortValueFromText(valueType, nd.TextContent)
	default:
		return canvasPortValue{}
	}
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func (h *CanvasHandler) applyPromptPortInputs(ctx context.Context, nd *nodeData, portInputs canvasPortInputMap) {
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

func (h *CanvasHandler) readCanvasTextValues(ctx context.Context, values []canvasPortValue) []string {
	if len(values) == 0 {
		return nil
	}
	texts := make([]string, 0, len(values))
	var resourcePtrs []*uint
	for _, value := range values {
		if text := strings.TrimSpace(canvasPortValueText(value)); text != "" {
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

func (h *CanvasHandler) readCanvasTextInputs(ctx context.Context, resourcePtrs []*uint) []string {
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

func (h *CanvasHandler) completeEntityWriteTask(ctx context.Context, task *model.CanvasTask, node *model.CanvasNode, nd nodeData, cv model.Canvas, portInputs canvasPortInputMap, user *model.User) map[string]canvasPortValue {
	h.db.Model(task).Update("status", "running")
	kind, entityID := nd.resolvedEntity()
	if kind == "" || entityID == 0 {
		h.failTask(task, node, nd, "entity node is missing entity reference")
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
	nd.Status = "done"
	nd.ResourceID = result.PrimaryResourceID
	nd.TaskID = &task.ID
	h.updateRunStatus(task.CanvasRunID)
	outputs := h.resolveEntityNodeOutputs(ctx, user, nd)
	if len(outputs) == 0 && result.PrimaryResourceID != nil {
		value := canvasPortValueFromResource(result.PrimaryResourceID, "resource")
		outputs = map[string]canvasPortValue{
			"":       value,
			"result": value,
		}
	}
	h.updateTaskOutputValues(task, outputs)
	return outputs
}

func (h *CanvasHandler) entityPortValuesFromCanvasInputs(ctx context.Context, kind string, portInputs canvasPortInputMap) map[string]workflow.EntityPortValue {
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

func (h *CanvasHandler) resolveEntityNodeOutputs(ctx context.Context, user *model.User, nd nodeData) map[string]canvasPortValue {
	kind, entityID := nd.resolvedEntity()
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
			portValue := canvasPortValueFromResource(&rid, value.Type)
			outputs[handle] = portValue
			if canvasPortValueEmpty(outputs[""]) {
				outputs[""] = portValue
			}
			continue
		}
		portValue := entityPortValueToCanvasPortValue(value)
		if canvasPortValueEmpty(portValue) {
			continue
		}
		outputs[handle] = portValue
		if canvasPortValueEmpty(outputs[""]) {
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

func (nd nodeData) resolvedEntity() (string, uint) {
	kind := strings.TrimSpace(nd.EntityKind)
	id := nd.EntityID
	if id == nil {
		return kind, 0
	}
	return kind, *id
}

func (h *CanvasHandler) createCanvasResourceFromSource(ctx context.Context, ownerID uint, name string, source string, mimeType string) (*model.RawResource, error) {
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

func (h *CanvasHandler) createCanvasResourceFromBytes(ctx context.Context, ownerID uint, name string, data []byte, mimeType string) (*model.RawResource, error) {
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

func (h *CanvasHandler) completeCanvasReferenceTask(ctx context.Context, task *model.CanvasTask, node *model.CanvasNode, nd nodeData, user *model.User, inputs canvasPortInputMap) map[string]canvasPortValue {
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

func (h *CanvasHandler) executeCanvasReferenceOutputs(ctx context.Context, nd nodeData, user *model.User, inputs canvasPortInputMap) (map[string]canvasPortValue, *uint, error) {
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

func (h *CanvasHandler) loadReferencedWorkflowCanvas(nd nodeData, user *model.User) (model.Canvas, error) {
	if nd.ReferencedCanvasID == nil || *nd.ReferencedCanvasID == 0 {
		return model.Canvas{}, fmt.Errorf("referenced workflow canvas is required")
	}
	var ref model.Canvas
	if err := h.db.Preload("Nodes").Preload("Edges").First(&ref, *nd.ReferencedCanvasID).Error; err != nil {
		return model.Canvas{}, fmt.Errorf("referenced canvas not found")
	}
	if ref.OwnerID != user.ID {
		return model.Canvas{}, fmt.Errorf("referenced canvas is not accessible")
	}
	if ref.CanvasType != "workflow" {
		return model.Canvas{}, fmt.Errorf("only workflow canvases can be referenced")
	}
	return ref, nil
}

func (h *CanvasHandler) resolveCanvasReferenceOutputs(ref model.Canvas, nd nodeData) (map[string]canvasPortValue, *uint, error) {
	var latestRun model.CanvasRun
	if err := h.db.Where("canvas_id = ? AND status = ?", ref.ID, "done").Order("id desc").First(&latestRun).Error; err != nil {
		return nil, nil, fmt.Errorf("referenced workflow has no completed run")
	}
	return h.outputsForReferencedWorkflowRun(ref, nd, latestRun.ID)
}

func (h *CanvasHandler) executeReferencedWorkflowRun(ctx context.Context, user *model.User, ref model.Canvas, nd nodeData, inputs canvasPortInputMap) (model.CanvasRun, error) {
	plan, err := buildCanvasExecutionPlan(ref)
	if err != nil {
		return model.CanvasRun{}, fmt.Errorf("cycle detected in referenced workflow")
	}
	inputValues := h.canvasReferenceInputValues(ref, nd, inputs)
	if err := validateCanvasRequiredInputs(ref, inputValues); err != nil {
		return model.CanvasRun{}, err
	}
	snapshot, snapshotHash, snapshotNodeCount, snapshotEdgeCount := buildCanvasRunSnapshot(ref)
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

func (h *CanvasHandler) canvasReferenceInputValues(ref model.Canvas, nd nodeData, inputs canvasPortInputMap) map[string]canvasPortValue {
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
		if value, ok := values[handle]; ok && !canvasPortValueEmpty(value) {
			continue
		}
		if nodeID := paramNameToNodeID[handle]; nodeID != "" {
			if value, ok := values[nodeID]; ok && !canvasPortValueEmpty(value) {
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
		value.normalize()
		if !canvasPortValueEmpty(value) {
			return value, true
		}
	}
	return canvasPortValue{}, false
}

func (h *CanvasHandler) outputsForReferencedWorkflowRun(ref model.Canvas, nd nodeData, runID uint) (map[string]canvasPortValue, *uint, error) {
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
			if canvasPortValueEmpty(value) {
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
		if !canvasPortValueEmpty(value) {
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
		if value, ok := outputs[handle]; ok && !canvasPortValueEmpty(value) {
			outputs[""] = value
			return outputs, primaryOutput, nil
		}
	}
	if value, ok := outputs[""]; ok && !canvasPortValueEmpty(value) {
		return outputs, primaryOutput, nil
	}
	for _, value := range outputs {
		outputs[""] = value
		break
	}
	return outputs, primaryOutput, nil
}

func (h *CanvasHandler) canvasReferenceOutputsFromRun(run model.CanvasRun, nd nodeData) (map[string]canvasPortValue, *uint) {
	runOutputs := decodeCanvasRunOutputValues(run.OutputValues)
	if len(runOutputs) == 0 {
		return nil, nil
	}
	outputs := map[string]canvasPortValue{}
	var primaryOutput *uint
	for key, value := range runOutputs {
		if canvasPortValueEmpty(value) {
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
		if value, ok := outputs[handle]; ok && !canvasPortValueEmpty(value) {
			outputs[""] = value
			return outputs, primaryOutput
		}
	}
	if value, ok := outputs[""]; ok && !canvasPortValueEmpty(value) {
		return outputs, primaryOutput
	}
	for _, value := range outputs {
		if !canvasPortValueEmpty(value) {
			outputs[""] = value
			break
		}
	}
	return outputs, primaryOutput
}

func canvasReferenceTaskOutputValue(task model.CanvasTask, node model.CanvasNode, nd nodeData) canvasPortValue {
	outputs := decodeCanvasPortOutputs(task.OutputValues)
	for _, key := range []string{"", "value", "result", defaultCanvasSourceHandleForNode(node.Type, nd)} {
		if value, ok := outputs[key]; ok && !canvasPortValueEmpty(value) {
			return value
		}
	}
	for _, value := range outputs {
		if !canvasPortValueEmpty(value) {
			return value
		}
	}
	if task.ResourceID != nil {
		return canvasPortValueFromResource(task.ResourceID, defaultCanvasPortValueTypeForNode(node.Type, nd))
	}
	return canvasPortValue{}
}

func registerCanvasReferenceOutput(outputs map[string]canvasPortValue, handle string, value canvasPortValue) {
	handle = strings.TrimSpace(handle)
	if handle == "" || canvasPortValueEmpty(value) {
		return
	}
	outputs[handle] = value
}

func (h *CanvasHandler) loadCanvasInputResources(ctx context.Context, nd nodeData, upstreamResources []*uint) (imageData, videoData []ai.MediaData) {
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

func (h *CanvasHandler) readCanvasResourceBytes(ctx context.Context, r model.RawResource) ([]byte, string, error) {
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

func (h *CanvasHandler) failTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, errMsg string) {
	h.db.Model(task).Updates(map[string]any{"status": "failed", "error": errMsg})
	nd.Status = "failed"
	nd.Error = errMsg
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *CanvasHandler) updateNodeData(node *model.CanvasNode, nd nodeData) {
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

func (h *CanvasHandler) updateRunStatus(runID *uint) {
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
			updates["error"] = canvasRunTaskFailureSummary(tasks)
		}
		finishedAt := time.Now()
		updates["finished_at"] = &finishedAt
	}
	h.db.Model(&model.CanvasRun{}).Where("id = ?", *runID).Updates(updates)
}

func canvasRunTaskFailureSummary(tasks []model.CanvasTask) string {
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

// topoSort returns node IDs in topological order; returns error if a cycle exists.
func topoSort(nodes []model.CanvasNode, edges []model.CanvasEdge) ([]string, error) {
	inDegree := map[string]int{}
	adj := map[string][]string{}
	for _, n := range nodes {
		inDegree[n.NodeID] = 0
	}
	for _, e := range edges {
		adj[e.Source] = append(adj[e.Source], e.Target)
		inDegree[e.Target]++
	}
	queue := []string{}
	for _, n := range nodes {
		if inDegree[n.NodeID] == 0 {
			queue = append(queue, n.NodeID)
		}
	}
	var order []string
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		order = append(order, cur)
		for _, next := range adj[cur] {
			inDegree[next]--
			if inDegree[next] == 0 {
				queue = append(queue, next)
			}
		}
	}
	if len(order) != len(nodes) {
		return nil, fmt.Errorf("cycle")
	}
	return order, nil
}

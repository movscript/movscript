package canvasruntime

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type RunSnapshot struct {
	Version    int          `json:"version"`
	CanvasID   uint         `json:"canvas_id"`
	CapturedAt time.Time    `json:"captured_at"`
	Nodes      []CanvasNode `json:"nodes"`
	Edges      []CanvasEdge `json:"edges"`
}

type ExecutionPlan struct {
	Order []string
	Tasks []TaskPlan
}

type TaskPlan struct {
	NodeID string
	Node   *CanvasNode
}

type CanvasGraph struct {
	Canvas Canvas
	Nodes  []CanvasNode
	Edges  []CanvasEdge
}

// NodeData mirrors the JSON stored in CanvasNode.Data.
type NodeData struct {
	Source             string          `json:"source"`
	ResourceID         *uint           `json:"resourceId,omitempty"`
	ReferencedCanvasID *uint           `json:"referencedCanvasId,omitempty"`
	Prompt             string          `json:"prompt,omitempty"`
	ProviderName       string          `json:"providerName,omitempty"`
	ModelID            string          `json:"modelId,omitempty"`
	ModelDbID          uint            `json:"modelDbId,omitempty"`
	InputResourceIDs   []uint          `json:"inputResourceIds,omitempty"`
	Status             string          `json:"status,omitempty"`
	TaskID             *uint           `json:"taskId,omitempty"`
	Error              string          `json:"error,omitempty"`
	TextContent        string          `json:"textContent,omitempty"`
	InputValue         string          `json:"inputValue,omitempty"`
	ParamName          string          `json:"paramName,omitempty"`
	ParamType          string          `json:"paramType,omitempty"`
	ExecutableSpec     *ExecutableSpec `json:"executableSpec,omitempty"`
	InputPorts         []PortDef       `json:"inputPorts,omitempty"`
	OutputPorts        []PortDef       `json:"outputPorts,omitempty"`
	EntityKind         string          `json:"entityKind,omitempty"`
	EntityID           *uint           `json:"entityId,omitempty"`
	EntityTitle        string          `json:"entityTitle,omitempty"`
}

type PortDef struct {
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

type ExecutableSpec struct {
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

type PortValue struct {
	Type       string   `json:"type"`
	ResourceID *uint    `json:"resource_id,omitempty"`
	Text       string   `json:"text,omitempty"`
	JSON       any      `json:"json,omitempty"`
	Number     *float64 `json:"number,omitempty"`
	Boolean    *bool    `json:"boolean,omitempty"`
}

func (v *PortValue) UnmarshalJSON(data []byte) error {
	var raw any
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	switch value := raw.(type) {
	case nil:
		*v = PortValue{}
	case string:
		*v = PortValue{Type: "text", Text: value}
	case float64:
		*v = PortValue{Type: "number", Number: &value}
	case bool:
		*v = PortValue{Type: "boolean", Boolean: &value}
	case map[string]any:
		type alias PortValue
		var decoded alias
		if err := json.Unmarshal(data, &decoded); err != nil {
			return err
		}
		*v = PortValue(decoded)
		v.Normalize()
	default:
		*v = PortValue{Type: "json", JSON: value}
	}
	return nil
}

func (v *PortValue) Normalize() {
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

type PortInputMap map[string][]PortValue

func (m PortInputMap) Flatten() []*uint {
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

func PortValueFromResource(rid *uint, valueType string) PortValue {
	if valueType == "" {
		valueType = "resource"
	}
	return PortValue{Type: valueType, ResourceID: rid}
}

func PortValueFromText(valueType string, text string) PortValue {
	valueType = strings.TrimSpace(valueType)
	if valueType == "" {
		valueType = "text"
	}
	value := PortValue{Type: valueType}
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

func PortValueFromAny(value any) PortValue {
	switch typed := value.(type) {
	case nil:
		return PortValue{}
	case PortValue:
		typed.Normalize()
		return typed
	case string:
		return PortValue{Type: "text", Text: typed}
	case float64:
		return PortValue{Type: "number", Number: &typed}
	case bool:
		return PortValue{Type: "boolean", Boolean: &typed}
	default:
		raw, err := json.Marshal(typed)
		if err != nil {
			return PortValue{}
		}
		var portValue PortValue
		if err := json.Unmarshal(raw, &portValue); err == nil {
			portValue.Normalize()
			if !PortValueEmpty(portValue) {
				return portValue
			}
		}
		var decoded any
		if err := json.Unmarshal(raw, &decoded); err == nil {
			return PortValue{Type: "json", JSON: decoded}
		}
		return PortValue{}
	}
}

func PortValueText(value PortValue) string {
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

func PortValueEmpty(value PortValue) bool {
	return value.ResourceID == nil && value.Text == "" && value.JSON == nil && value.Number == nil && value.Boolean == nil
}

func MarshalPortInputs(inputs PortInputMap) string {
	if len(inputs) == 0 {
		return ""
	}
	payload := map[string][]PortValue{}
	for handle, values := range inputs {
		if strings.TrimSpace(handle) == "" {
			continue
		}
		for _, value := range values {
			value.Normalize()
			if PortValueEmpty(value) {
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

func MarshalPortOutputs(outputs map[string]PortValue) string {
	if len(outputs) == 0 {
		return ""
	}
	payload := map[string]PortValue{}
	for handle, value := range outputs {
		handle = strings.TrimSpace(handle)
		if handle == "" {
			continue
		}
		value.Normalize()
		if PortValueEmpty(value) {
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

func DecodePortOutputs(raw string) map[string]PortValue {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var payload map[string]PortValue
	if err := json.Unmarshal([]byte(raw), &payload); err == nil {
		return payload
	}
	return nil
}

func DecodeRunInputValues(raw string) map[string]PortValue {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var values map[string]PortValue
	if err := json.Unmarshal([]byte(raw), &values); err == nil {
		return values
	}
	var legacy map[string]string
	if err := json.Unmarshal([]byte(raw), &legacy); err != nil {
		return nil
	}
	values = map[string]PortValue{}
	for nodeID, text := range legacy {
		values[nodeID] = PortValue{Type: "text", Text: text}
	}
	return values
}

func BuildRunSnapshot(cv CanvasGraph) (string, string, int, int) {
	snapshot := RunSnapshot{
		Version:    1,
		CanvasID:   cv.Canvas.ID,
		CapturedAt: time.Now(),
		Nodes:      cv.Nodes,
		Edges:      cv.Edges,
	}
	b, err := json.Marshal(snapshot)
	if err != nil {
		return "", "", len(cv.Nodes), len(cv.Edges)
	}
	hashPayload, _ := json.Marshal(struct {
		Nodes []CanvasNode `json:"nodes"`
		Edges []CanvasEdge `json:"edges"`
	}{Nodes: cv.Nodes, Edges: cv.Edges})
	sum := sha256.Sum256(hashPayload)
	return string(b), hex.EncodeToString(sum[:]), len(cv.Nodes), len(cv.Edges)
}

func CanvasGraphFromRunSnapshot(canvasID uint, raw string) (CanvasGraph, error) {
	if strings.TrimSpace(raw) == "" {
		return CanvasGraph{}, fmt.Errorf("empty snapshot")
	}
	var snapshot RunSnapshot
	if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
		return CanvasGraph{}, err
	}
	cv := CanvasGraph{Canvas: Canvas{ID: canvasID}, Nodes: snapshot.Nodes, Edges: snapshot.Edges}
	return cv, nil
}

func BuildGraphExecutionPlan(cv CanvasGraph) (ExecutionPlan, error) {
	order, err := TopoSort(cv.Nodes, cv.Edges)
	if err != nil {
		return ExecutionPlan{}, err
	}
	nodeMap := map[string]*CanvasNode{}
	for i := range cv.Nodes {
		nodeMap[cv.Nodes[i].NodeID] = &cv.Nodes[i]
	}
	plan := ExecutionPlan{Order: order}
	for _, nid := range order {
		node := nodeMap[nid]
		if !GraphNodeRequiresWorkflowTask(cv, node) {
			continue
		}
		plan.Tasks = append(plan.Tasks, TaskPlan{NodeID: nid, Node: node})
	}
	return plan, nil
}

func GraphNodeRequiresWorkflowTask(cv CanvasGraph, node *CanvasNode) bool {
	if node == nil {
		return false
	}
	if IsCanvasEntityNode(node.Type) && HasCanvasEntityInputs(cv.Edges, node.NodeID) {
		return true
	}
	if node.Type == "output" {
		return true
	}
	if node.Type == "resource_sink" {
		return true
	}
	var nd NodeData
	_ = json.Unmarshal([]byte(node.Data), &nd)
	return nd.Source == "ai" || nd.ExecutableSpec != nil
}

func IsCanvasEntityNode(nodeType string) bool {
	return nodeType == "entity_card"
}

func HasCanvasEntityInputs(edges []CanvasEdge, nodeID string) bool {
	for _, edge := range edges {
		if edge.Target == nodeID {
			return true
		}
	}
	return false
}

func ValidateGraphRequiredInputs(cv CanvasGraph, inputValues map[string]PortValue) error {
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
		var nd NodeData
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
					value.Normalize()
					if !PortValueEmpty(value) {
						continue
					}
				}
				if !PortValueEmpty(StaticGraphNodePortValue(node, nd)) {
					continue
				}
			}
			return fmt.Errorf("node %q required input %q is missing", node.NodeID, handle)
		}
	}
	return nil
}

func PortValuesPresent(values []PortValue) bool {
	for _, value := range values {
		if !PortValueEmpty(value) {
			return true
		}
	}
	return false
}

func DefaultSourceHandle(nodeType string) string {
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

func DefaultSourceHandleForNode(nodeType string, nd NodeData) string {
	for _, port := range nd.OutputPorts {
		if strings.TrimSpace(port.ID) != "" {
			return strings.TrimSpace(port.ID)
		}
	}
	return DefaultSourceHandle(nodeType)
}

func DefaultPortValueTypeForNode(nodeType string, nd NodeData) string {
	for _, port := range nd.OutputPorts {
		if strings.TrimSpace(port.Type) != "" {
			return strings.TrimSpace(port.Type)
		}
	}
	switch nodeType {
	case "text", "text_gen", "input":
		return "text"
	case "output":
		return FirstNonEmptyString(nd.ParamType, "resource")
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

func StaticGraphNodePortValue(node *CanvasNode, nd NodeData) PortValue {
	valueType := DefaultPortValueTypeForNode(node.Type, nd)
	if nd.ResourceID != nil {
		return PortValueFromResource(nd.ResourceID, valueType)
	}
	switch node.Type {
	case "input":
		return PortValueFromText(FirstNonEmptyString(nd.ParamType, valueType, "text"), nd.InputValue)
	case "text":
		return PortValueFromText(valueType, nd.TextContent)
	default:
		return PortValue{}
	}
}

func FirstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func (nd NodeData) ResolvedEntity() (string, uint) {
	kind := strings.TrimSpace(nd.EntityKind)
	id := nd.EntityID
	if id == nil {
		return kind, 0
	}
	return kind, *id
}

// TopoSort returns node IDs in topological order; returns error if a cycle exists.
func TopoSort(nodes []CanvasNode, edges []CanvasEdge) ([]string, error) {
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

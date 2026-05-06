package workflowmarket

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
)

type PortDef = canvasruntime.PortDef

type TemplateDef struct {
	Key         string         `json:"key"`
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Category    string         `json:"category,omitempty"`
	Tags        []string       `json:"tags,omitempty"`
	Inputs      []PortDef      `json:"inputs,omitempty"`
	Outputs     []PortDef      `json:"outputs,omitempty"`
	Nodes       []TemplateNode `json:"nodes,omitempty"`
	Edges       []TemplateEdge `json:"edges,omitempty"`
}

type TemplateNode struct {
	NodeID string
	Type   string
	Label  string
	PosX   float64
	PosY   float64
	Data   map[string]any
}

type TemplateEdge struct {
	EdgeID       string
	Source       string
	Target       string
	SourceHandle string
	TargetHandle string
}

type MarketItem struct {
	Source      string     `json:"source"`
	CanvasID    uint       `json:"canvas_id,omitempty"`
	Key         string     `json:"key"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	Category    string     `json:"category,omitempty"`
	Tags        []string   `json:"tags,omitempty"`
	Inputs      []PortDef  `json:"inputs,omitempty"`
	Outputs     []PortDef  `json:"outputs,omitempty"`
	OwnerID     uint       `json:"owner_id,omitempty"`
	NodeCount   int        `json:"node_count,omitempty"`
	EdgeCount   int        `json:"edge_count,omitempty"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
}

func TemplateCanvas(ownerID uint, tpl TemplateDef, name string, projectID *uint, stage string) model.Canvas {
	tagsRaw, _ := json.Marshal(tpl.Tags)
	return model.Canvas{
		OwnerID:      ownerID,
		Name:         name,
		Description:  tpl.Description,
		CanvasType:   "workflow",
		ProjectID:    projectID,
		Stage:        stage,
		Visibility:   "private",
		WorkflowKey:  "template:" + tpl.Key,
		WorkflowTags: string(tagsRaw),
	}
}

func BuiltinTemplates() []TemplateDef {
	return []TemplateDef{
		{
			Key:         "text-generation",
			Name:        "Text Generation",
			Description: "Reusable prompt-to-text workflow with one text input and one text output.",
			Category:    "generation",
			Tags:        []string{"text", "ai", "starter"},
			Inputs:      []PortDef{{ID: "prompt", Label: "Prompt", Type: "text", Required: true}},
			Outputs:     []PortDef{{ID: "text", Label: "Text", Type: "text"}},
			Nodes: []TemplateNode{
				{NodeID: "input-prompt", Type: "input", Label: "Prompt", PosX: 80, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "prompt", "paramType": "text", "inputValue": ""}},
				{NodeID: "generate-text", Type: "text", Label: "Generate Text", PosX: 340, PosY: 160, Data: map[string]any{"source": "ai", "prompt": "", "inputPorts": []PortDef{{ID: "prompt", Label: "Prompt", Type: "text", Required: true}}, "outputPorts": []PortDef{{ID: "text", Label: "Text", Type: "text"}}}},
				{NodeID: "output-text", Type: "output", Label: "Text Output", PosX: 620, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "text", "paramType": "text"}},
			},
			Edges: []TemplateEdge{
				{EdgeID: "prompt-to-text", Source: "input-prompt", Target: "generate-text", SourceHandle: "value", TargetHandle: "prompt"},
				{EdgeID: "text-to-output", Source: "generate-text", Target: "output-text", SourceHandle: "text", TargetHandle: "value"},
			},
		},
		{
			Key:         "image-generation",
			Name:        "Image Generation",
			Description: "Reusable prompt-to-image workflow with a typed image output.",
			Category:    "generation",
			Tags:        []string{"image", "ai", "starter"},
			Inputs:      []PortDef{{ID: "prompt", Label: "Prompt", Type: "text", Required: true}},
			Outputs:     []PortDef{{ID: "image", Label: "Image", Type: "image"}},
			Nodes: []TemplateNode{
				{NodeID: "input-prompt", Type: "input", Label: "Prompt", PosX: 80, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "prompt", "paramType": "text", "inputValue": ""}},
				{NodeID: "generate-image", Type: "image", Label: "Generate Image", PosX: 340, PosY: 160, Data: map[string]any{"source": "ai", "prompt": "", "inputPorts": []PortDef{{ID: "prompt", Label: "Prompt", Type: "text", Required: true}}, "outputPorts": []PortDef{{ID: "image", Label: "Image", Type: "image"}}}},
				{NodeID: "output-image", Type: "output", Label: "Image Output", PosX: 620, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "image", "paramType": "image"}},
			},
			Edges: []TemplateEdge{
				{EdgeID: "prompt-to-image", Source: "input-prompt", Target: "generate-image", SourceHandle: "value", TargetHandle: "prompt"},
				{EdgeID: "image-to-output", Source: "generate-image", Target: "output-image", SourceHandle: "image", TargetHandle: "value"},
			},
		},
		{
			Key:         "input-output",
			Name:        "Input Output",
			Description: "Minimal workflow shell for plugin authors to fork into custom reusable flows.",
			Category:    "utility",
			Tags:        []string{"starter", "utility"},
			Inputs:      []PortDef{{ID: "input", Label: "Input", Type: "text"}},
			Outputs:     []PortDef{{ID: "output", Label: "Output", Type: "resource"}},
			Nodes: []TemplateNode{
				{NodeID: "input", Type: "input", Label: "Input", PosX: 120, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "input", "paramType": "text", "inputValue": ""}},
				{NodeID: "output", Type: "output", Label: "Output", PosX: 460, PosY: 160, Data: map[string]any{"source": "manual", "paramName": "output", "paramType": "resource"}},
			},
			Edges: []TemplateEdge{{EdgeID: "input-output", Source: "input", Target: "output", SourceHandle: "value", TargetHandle: "value"}},
		},
	}
}

func FindTemplate(key string) (TemplateDef, bool) {
	key = strings.TrimSpace(key)
	for _, tpl := range BuiltinTemplates() {
		if tpl.Key == key {
			return tpl, true
		}
	}
	return TemplateDef{}, false
}

func TemplateNodesForCanvas(canvasID uint, defs []TemplateNode) []model.CanvasNode {
	nodes := make([]model.CanvasNode, 0, len(defs))
	for _, def := range defs {
		raw, _ := json.Marshal(def.Data)
		nodes = append(nodes, model.CanvasNode{
			CanvasID: canvasID,
			NodeID:   def.NodeID,
			Type:     def.Type,
			Label:    def.Label,
			PosX:     def.PosX,
			PosY:     def.PosY,
			Data:     string(raw),
		})
	}
	return nodes
}

func TemplateEdgesForCanvas(canvasID uint, defs []TemplateEdge) []model.CanvasEdge {
	edges := make([]model.CanvasEdge, 0, len(defs))
	for _, def := range defs {
		edges = append(edges, model.CanvasEdge{
			CanvasID:     canvasID,
			EdgeID:       def.EdgeID,
			Source:       def.Source,
			Target:       def.Target,
			SourceHandle: def.SourceHandle,
			TargetHandle: def.TargetHandle,
		})
	}
	return edges
}

func TemplateMarketItem(tpl TemplateDef) MarketItem {
	return MarketItem{
		Source:      "template",
		Key:         "template:" + tpl.Key,
		Name:        tpl.Name,
		Description: tpl.Description,
		Category:    tpl.Category,
		Tags:        tpl.Tags,
		Inputs:      tpl.Inputs,
		Outputs:     tpl.Outputs,
		NodeCount:   len(tpl.Nodes),
		EdgeCount:   len(tpl.Edges),
	}
}

func PublicCanvasMarketItem(cv model.Canvas) MarketItem {
	key := strings.TrimSpace(cv.WorkflowKey)
	if key == "" {
		key = fmt.Sprintf("canvas:%d", cv.ID)
	}
	return MarketItem{
		Source:      "public",
		CanvasID:    cv.ID,
		Key:         key,
		Name:        cv.Name,
		Description: cv.Description,
		Tags:        DecodeTags(cv.WorkflowTags),
		Inputs:      CanvasWorkflowInputs(cv),
		Outputs:     CanvasWorkflowOutputs(cv),
		OwnerID:     cv.OwnerID,
		NodeCount:   len(cv.Nodes),
		EdgeCount:   len(cv.Edges),
		PublishedAt: cv.PublishedAt,
	}
}

func CanvasWorkflowInputs(cv model.Canvas) []PortDef {
	ports := make([]PortDef, 0)
	for _, node := range cv.Nodes {
		if node.Type != "input" {
			continue
		}
		var nd canvasruntime.NodeData
		_ = json.Unmarshal([]byte(node.Data), &nd)
		id := strings.TrimSpace(nd.ParamName)
		if id == "" {
			id = node.NodeID
		}
		ports = append(ports, PortDef{ID: id, Label: node.Label, Type: firstNonEmptyString(nd.ParamType, "text")})
	}
	return ports
}

func CanvasWorkflowOutputs(cv model.Canvas) []PortDef {
	ports := make([]PortDef, 0)
	for _, node := range cv.Nodes {
		if node.Type != "output" {
			continue
		}
		var nd canvasruntime.NodeData
		_ = json.Unmarshal([]byte(node.Data), &nd)
		id := strings.TrimSpace(nd.ParamName)
		if id == "" {
			id = node.NodeID
		}
		ports = append(ports, PortDef{ID: id, Label: node.Label, Type: firstNonEmptyString(nd.ParamType, "resource")})
	}
	return ports
}

func MarketItemMatches(item MarketItem, query string) bool {
	if query == "" {
		return true
	}
	haystack := strings.ToLower(strings.Join(append([]string{item.Key, item.Name, item.Description, item.Category}, item.Tags...), " "))
	return strings.Contains(haystack, query)
}

func CleanTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	seen := map[string]bool{}
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		out = append(out, tag)
	}
	return out
}

func DecodeTags(raw string) []string {
	var tags []string
	if err := json.Unmarshal([]byte(raw), &tags); err != nil {
		return nil
	}
	return CleanTags(tags)
}

func ValidWorkflowKey(key string) bool {
	return strings.TrimSpace(key) != "" && !strings.ContainsAny(key, " \t\r\n/\\")
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

package plugin

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const ManifestSchemaVersion = "movscript.plugin.v1"

type Manifest struct {
	Schema        string         `json:"schema,omitempty"`
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	Version       string         `json:"version"`
	Description   string         `json:"description,omitempty"`
	Main          string         `json:"main,omitempty"`
	Compatibility Compatibility  `json:"compatibility,omitempty"`
	Permissions   []string       `json:"permissions,omitempty"`
	Contributes   Contributions  `json:"contributes"`
	Runtime       *RuntimeSpec   `json:"runtime,omitempty"`
	Raw           map[string]any `json:"-"`
}

type Compatibility struct {
	Movscript string `json:"movscript,omitempty"`
}

type Contributions struct {
	Tools       []ToolContribution       `json:"tools,omitempty"`
	Cards       []CardContribution       `json:"cards,omitempty"`
	CanvasNodes []CanvasNodeContribution `json:"canvasNodes,omitempty"`
	Workflows   []WorkflowContribution   `json:"workflows,omitempty"`
	Commands    []CommandContribution    `json:"commands,omitempty"`
}

type ToolContribution struct {
	ID           string          `json:"id"`
	Title        string          `json:"title"`
	Description  string          `json:"description,omitempty"`
	InputSchema  json.RawMessage `json:"inputSchema,omitempty"`
	OutputSchema json.RawMessage `json:"outputSchema,omitempty"`
	Permissions  []string        `json:"permissions,omitempty"`
	Runtime      *RuntimeSpec    `json:"runtime,omitempty"`
}

type CardContribution struct {
	ID          string          `json:"id"`
	Title       string          `json:"title,omitempty"`
	Tool        string          `json:"tool,omitempty"`
	View        string          `json:"view,omitempty"`
	Schema      json.RawMessage `json:"schema,omitempty"`
	Description string          `json:"description,omitempty"`
}

type CanvasPortDef struct {
	ID          string `json:"id"`
	Label       string `json:"label,omitempty"`
	Type        string `json:"type"`
	Required    bool   `json:"required,omitempty"`
	MaxCount    int    `json:"maxCount,omitempty"`
	Description string `json:"description,omitempty"`
}

func (p *CanvasPortDef) UnmarshalJSON(raw []byte) error {
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		p.ID = strings.TrimSpace(text)
		p.Type = inferCanvasPortType(p.ID)
		return nil
	}
	type portAlias CanvasPortDef
	var item portAlias
	if err := json.Unmarshal(raw, &item); err != nil {
		return err
	}
	*p = CanvasPortDef(item)
	p.ID = strings.TrimSpace(p.ID)
	p.Type = strings.TrimSpace(p.Type)
	if p.Type == "" {
		p.Type = inferCanvasPortType(p.ID)
	}
	return nil
}

type CanvasNodeContribution struct {
	Type        string          `json:"type"`
	Title       string          `json:"title"`
	Description string          `json:"description,omitempty"`
	Tool        string          `json:"tool,omitempty"`
	Workflow    string          `json:"workflow,omitempty"`
	Inputs      []CanvasPortDef `json:"inputs,omitempty"`
	Outputs     []CanvasPortDef `json:"outputs,omitempty"`
	Card        string          `json:"card,omitempty"`
	Icon        string          `json:"icon,omitempty"`
	Category    string          `json:"category,omitempty"`
	DefaultData json.RawMessage `json:"defaultData,omitempty"`
}

type WorkflowContribution struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Description string          `json:"description,omitempty"`
	WorkflowKey string          `json:"workflowKey,omitempty"`
	Version     string          `json:"version,omitempty"`
	Inputs      []CanvasPortDef `json:"inputs,omitempty"`
	Outputs     []CanvasPortDef `json:"outputs,omitempty"`
	Tags        []string        `json:"tags,omitempty"`
}

type CommandContribution struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Tool  string `json:"tool,omitempty"`
}

type RuntimeSpec struct {
	Kind     string          `json:"kind"`               // none | http
	Endpoint string          `json:"endpoint,omitempty"` // for kind=http
	Method   string          `json:"method,omitempty"`
	Timeout  int             `json:"timeout,omitempty"` // seconds
	Config   json.RawMessage `json:"config,omitempty"`
}

func ParseManifest(raw []byte) (*Manifest, string, error) {
	var m Manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, "", err
	}
	var rawMap map[string]any
	if err := json.Unmarshal(raw, &rawMap); err == nil {
		m.Raw = rawMap
	}
	if err := ValidateManifest(&m); err != nil {
		return nil, "", err
	}
	normalized, err := json.MarshalIndent(m.Raw, "", "  ")
	if err != nil || len(normalized) == 0 {
		normalized, _ = json.MarshalIndent(m, "", "  ")
	}
	return &m, string(normalized), nil
}

func ValidateManifest(m *Manifest) error {
	if m == nil {
		return errors.New("manifest is required")
	}
	if strings.TrimSpace(m.ID) == "" {
		return errors.New("manifest id is required")
	}
	if strings.ContainsAny(m.ID, " \t\r\n/\\") {
		return fmt.Errorf("manifest id %q must not contain whitespace or path separators", m.ID)
	}
	if strings.TrimSpace(m.Name) == "" {
		return errors.New("manifest name is required")
	}
	if strings.TrimSpace(m.Version) == "" {
		return errors.New("manifest version is required")
	}
	seenTools := map[string]bool{}
	for _, tool := range m.Contributes.Tools {
		if strings.TrimSpace(tool.ID) == "" {
			return errors.New("tool id is required")
		}
		if seenTools[tool.ID] {
			return fmt.Errorf("duplicate tool id %q", tool.ID)
		}
		seenTools[tool.ID] = true
		if strings.TrimSpace(tool.Title) == "" {
			return fmt.Errorf("tool %q title is required", tool.ID)
		}
		rt := effectiveRuntime(m.Runtime, tool.Runtime)
		_ = rt
	}
	seenCards := map[string]bool{}
	for _, card := range m.Contributes.Cards {
		if strings.TrimSpace(card.ID) == "" {
			return errors.New("card id is required")
		}
		if seenCards[card.ID] {
			return fmt.Errorf("duplicate card id %q", card.ID)
		}
		seenCards[card.ID] = true
		if card.Tool != "" && !seenTools[card.Tool] {
			return fmt.Errorf("card %q references unknown tool %q", card.ID, card.Tool)
		}
	}
	seenWorkflows := map[string]bool{}
	for _, wf := range m.Contributes.Workflows {
		if strings.TrimSpace(wf.ID) == "" {
			return errors.New("workflow id is required")
		}
		if seenWorkflows[wf.ID] {
			return fmt.Errorf("duplicate workflow id %q", wf.ID)
		}
		seenWorkflows[wf.ID] = true
		if strings.TrimSpace(wf.Title) == "" {
			return fmt.Errorf("workflow %q title is required", wf.ID)
		}
		if strings.TrimSpace(wf.WorkflowKey) == "" {
			return fmt.Errorf("workflow %q workflowKey is required", wf.ID)
		}
		if strings.ContainsAny(wf.WorkflowKey, " \t\r\n/\\") {
			return fmt.Errorf("workflow %q workflowKey must not contain whitespace or path separators", wf.ID)
		}
		if err := validateCanvasPorts(wf.ID, "workflow input", wf.Inputs); err != nil {
			return err
		}
		if err := validateCanvasPorts(wf.ID, "workflow output", wf.Outputs); err != nil {
			return err
		}
	}
	seenNodes := map[string]bool{}
	for _, node := range m.Contributes.CanvasNodes {
		if strings.TrimSpace(node.Type) == "" {
			return errors.New("canvas node type is required")
		}
		if seenNodes[node.Type] {
			return fmt.Errorf("duplicate canvas node type %q", node.Type)
		}
		seenNodes[node.Type] = true
		if strings.TrimSpace(node.Title) == "" {
			return fmt.Errorf("canvas node %q title is required", node.Type)
		}
		if node.Tool != "" && !seenTools[node.Tool] {
			return fmt.Errorf("canvas node %q references unknown tool %q", node.Type, node.Tool)
		}
		if node.Workflow != "" && !seenWorkflows[node.Workflow] {
			return fmt.Errorf("canvas node %q references unknown workflow %q", node.Type, node.Workflow)
		}
		if err := validateCanvasPorts(node.Type, "input", node.Inputs); err != nil {
			return err
		}
		if err := validateCanvasPorts(node.Type, "output", node.Outputs); err != nil {
			return err
		}
	}
	return nil
}

func validateCanvasPorts(nodeType, direction string, ports []CanvasPortDef) error {
	seen := map[string]bool{}
	for _, port := range ports {
		if strings.TrimSpace(port.ID) == "" {
			return fmt.Errorf("canvas node %q %s port id is required", nodeType, direction)
		}
		if seen[port.ID] {
			return fmt.Errorf("canvas node %q has duplicate %s port %q", nodeType, direction, port.ID)
		}
		seen[port.ID] = true
		if !isCanvasPortType(port.Type) {
			return fmt.Errorf("canvas node %q %s port %q has unsupported type %q", nodeType, direction, port.ID, port.Type)
		}
		if port.MaxCount < 0 {
			return fmt.Errorf("canvas node %q %s port %q maxCount must be >= 0", nodeType, direction, port.ID)
		}
	}
	return nil
}

func inferCanvasPortType(id string) string {
	if isCanvasPortType(id) {
		return id
	}
	return "resource"
}

func isCanvasPortType(value string) bool {
	switch value {
	case "text", "image", "video", "audio", "resource", "json", "number", "boolean":
		return true
	default:
		return false
	}
}

func ToolKey(pluginID, toolID string) string {
	return pluginID + "." + toolID
}

func effectiveRuntime(pluginRuntime, toolRuntime *RuntimeSpec) RuntimeSpec {
	if toolRuntime != nil {
		rt := *toolRuntime
		if rt.Kind == "" {
			rt.Kind = "none"
		}
		return rt
	}
	if pluginRuntime != nil {
		rt := *pluginRuntime
		if rt.Kind == "" {
			rt.Kind = "none"
		}
		return rt
	}
	return RuntimeSpec{Kind: "none"}
}

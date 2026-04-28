package pluginkit

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

type CanvasNodeContribution struct {
	Type        string          `json:"type"`
	Title       string          `json:"title"`
	Description string          `json:"description,omitempty"`
	Tool        string          `json:"tool,omitempty"`
	Inputs      []string        `json:"inputs,omitempty"`
	Outputs     []string        `json:"outputs,omitempty"`
	Card        string          `json:"card,omitempty"`
	Icon        string          `json:"icon,omitempty"`
	Category    string          `json:"category,omitempty"`
	DefaultData json.RawMessage `json:"defaultData,omitempty"`
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
	}
	return nil
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

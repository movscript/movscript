package plugin

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestManifestAcceptsWorkflowContributions(t *testing.T) {
	manifest := &Manifest{
		ID:      "com.example.workflow-user",
		Name:    "Workflow User",
		Version: "0.1.0",
		Contributes: Contributions{
			Workflows: []WorkflowContribution{
				{
					ID:          "image-flow",
					Title:       "Image Flow",
					WorkflowKey: "template:image-generation",
					Inputs:      []CanvasPortDef{{ID: "prompt", Type: "text", Required: true}},
					Outputs:     []CanvasPortDef{{ID: "image", Type: "image"}},
				},
			},
			CanvasNodes: []CanvasNodeContribution{
				{Type: "com.example.workflow-user.image-flow", Title: "Image Flow", Workflow: "image-flow"},
			},
		},
	}

	if err := ValidateManifest(manifest); err != nil {
		t.Fatalf("expected workflow contribution manifest to validate, got %v", err)
	}
}

func TestManifestRejectsUnknownWorkflowReference(t *testing.T) {
	manifest := &Manifest{
		ID:      "com.example.workflow-user",
		Name:    "Workflow User",
		Version: "0.1.0",
		Contributes: Contributions{
			CanvasNodes: []CanvasNodeContribution{
				{Type: "com.example.workflow-user.missing", Title: "Missing", Workflow: "missing-flow"},
			},
		},
	}

	err := ValidateManifest(manifest)
	if err == nil {
		t.Fatal("expected unknown workflow reference to be rejected")
	}
}

func TestManifestAcceptsPluginSkillContributions(t *testing.T) {
	manifest := &Manifest{
		ID:      "com.example.directors",
		Name:    "Director Skills",
		Version: "0.1.0",
		Contributes: Contributions{
			Skills: []PluginSkillContribution{
				{
					Path:    "plugin-skills/director-jiangwen",
					Kind:    "persona",
					Load:    "on_demand",
					Scope:   "run",
					Tags:    []string{"director"},
					Aliases: []string{"姜文"},
				},
			},
		},
	}

	if err := ValidateManifest(manifest); err != nil {
		t.Fatalf("expected plugin skill contribution manifest to validate, got %v", err)
	}
}

func TestManifestRejectsUnsafePluginSkillPath(t *testing.T) {
	manifest := &Manifest{
		ID:      "com.example.directors",
		Name:    "Director Skills",
		Version: "0.1.0",
		Contributes: Contributions{
			Skills: []PluginSkillContribution{
				{Path: "../outside", Kind: "persona"},
			},
		},
	}

	err := ValidateManifest(manifest)
	if err == nil {
		t.Fatal("expected unsafe agent skill path to be rejected")
	}
}

func TestManifestAcceptsLegacyPluginSkillField(t *testing.T) {
	legacySkillsKey := strings.Join([]string{"agent", "Skills"}, "")
	raw, err := json.Marshal(map[string]any{
		"id":      "com.example.directors",
		"name":    "Director Skills",
		"version": "0.1.0",
		"contributes": map[string]any{
			legacySkillsKey: []map[string]string{{"path": "plugin-skills/director-jiangwen"}},
		},
	})
	if err != nil {
		t.Fatalf("expected legacy skill field fixture to marshal, got %v", err)
	}
	var manifest Manifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatalf("expected legacy skill field to unmarshal, got %v", err)
	}
	if len(manifest.Contributes.Skills) != 1 {
		t.Fatalf("expected one skill contribution, got %d", len(manifest.Contributes.Skills))
	}
	if err := ValidateManifest(&manifest); err != nil {
		t.Fatalf("expected legacy skill contribution manifest to validate, got %v", err)
	}
}

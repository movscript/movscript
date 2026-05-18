package plugin

import "testing"

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

func TestManifestAcceptsAgentSkillContributions(t *testing.T) {
	manifest := &Manifest{
		ID:      "com.example.directors",
		Name:    "Director Skills",
		Version: "0.1.0",
		Contributes: Contributions{
			AgentSkills: []AgentSkillContribution{
				{
					Path:    "agent-skills/director-jiangwen",
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
		t.Fatalf("expected agent skill contribution manifest to validate, got %v", err)
	}
}

func TestManifestRejectsUnsafeAgentSkillPath(t *testing.T) {
	manifest := &Manifest{
		ID:      "com.example.directors",
		Name:    "Director Skills",
		Version: "0.1.0",
		Contributes: Contributions{
			AgentSkills: []AgentSkillContribution{
				{Path: "../outside", Kind: "persona"},
			},
		},
	}

	err := ValidateManifest(manifest)
	if err == nil {
		t.Fatal("expected unsafe agent skill path to be rejected")
	}
}

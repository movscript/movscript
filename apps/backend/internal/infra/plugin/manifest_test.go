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

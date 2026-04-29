package workflow

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/model"
)

func TestEntityFieldUpdatesUseSchemaStorageMapping(t *testing.T) {
	updates := entityFieldUpdates("script", map[string]EntityPortValue{
		"title":    {Type: "text", Text: "New title"},
		"settings": {Type: "json", JSON: map[string]any{"world": "near future"}},
		"result":   {Type: "resource", ResourceIDs: []uint{7}},
	})

	if got := updates["title"]; got != "New title" {
		t.Fatalf("expected title update, got %#v", got)
	}
	if got := updates["core_settings"]; got != `{"world":"near future"}` {
		t.Fatalf("expected settings to map to core_settings JSON text, got %#v", got)
	}
	if _, ok := updates["result"]; ok {
		t.Fatalf("resource binding port should not produce field update: %#v", updates)
	}
}

func TestNormalizeEntityPortValuesCanonicalizesAliases(t *testing.T) {
	values, err := NormalizeEntityPortValues("script", map[string]EntityPortValue{
		"core_settings": {Type: "json", JSON: map[string]any{"world": "near future"}},
	})
	if err != nil {
		t.Fatalf("expected alias normalization to succeed: %v", err)
	}
	if _, ok := values["core_settings"]; ok {
		t.Fatalf("expected semantic core_settings field to normalize away, got %#v", values)
	}
	if value, ok := values["settings"]; !ok || value.JSON == nil {
		t.Fatalf("expected canonical settings workflow port value, got %#v", values)
	}
}

func TestEntityFieldUpdatesPreserveShotPromptCompatibility(t *testing.T) {
	updates := entityFieldUpdates("shot", map[string]EntityPortValue{
		"prompt": {Type: "text", Text: "final camera prompt"},
	})

	if got := updates["prompt"]; got != "final camera prompt" {
		t.Fatalf("expected prompt update, got %#v", got)
	}
	if got := updates["final_prompt"]; got != "final camera prompt" {
		t.Fatalf("expected final_prompt compatibility update, got %#v", got)
	}
}

func TestEntitySchemasExposeVersionAndLayoutMetadata(t *testing.T) {
	schema, ok := EntitySchemaForKind("storyboard")
	if !ok {
		t.Fatal("expected storyboard schema")
	}
	if schema.SchemaVersion != EntitySchemaVersion {
		t.Fatalf("expected schema version %d, got %d", EntitySchemaVersion, schema.SchemaVersion)
	}
	if schema.Layout.Variant == "" {
		t.Fatal("expected schema layout metadata")
	}
	field, ok := EntityFieldForPort("storyboard", "shots")
	if !ok {
		t.Fatal("expected storyboard shots related-list field")
	}
	if !field.Readonly || field.Control != "related_entity_list" || field.Layout.NestedKind != "shot" {
		t.Fatalf("expected readonly related shots field, got %#v", field)
	}
	if schema.Projection != "workflow" || schema.Compatibility.CurrentVersion != EntitySchemaVersion {
		t.Fatalf("expected workflow projection compatibility metadata, got %#v", schema.Compatibility)
	}
}

func TestEntitySchemasExposeMigrationMetadata(t *testing.T) {
	shot, ok := EntitySchemaForKind("shot")
	if !ok {
		t.Fatal("expected shot schema")
	}
	var dualWrite EntityMigration
	for _, migration := range shot.Compatibility.Migrations {
		if migration.Kind == "dual_write" && migration.FromFieldID == "prompt" && migration.ToFieldID == "final_prompt" {
			dualWrite = migration
			break
		}
	}
	if dualWrite.Kind == "" {
		t.Fatalf("expected shot prompt dual-write migration metadata, got %#v", shot.Compatibility.Migrations)
	}

	script, ok := EntitySchemaForKind("script")
	if !ok {
		t.Fatal("expected script schema")
	}
	var alias EntityMigration
	for _, migration := range script.Compatibility.Migrations {
		if migration.Kind == "field_alias" && migration.FromFieldID == "settings" && migration.ToFieldID == "core_settings" {
			alias = migration
			break
		}
	}
	if alias.Kind == "" {
		t.Fatalf("expected script settings alias migration metadata, got %#v", script.Compatibility.Migrations)
	}
}

func TestEntitySchemaMigrationReportIncludesActions(t *testing.T) {
	report, err := EntitySchemaMigrationReportForKind("shot")
	if err != nil {
		t.Fatalf("expected migration report: %v", err)
	}
	if report.Kind != "shot" || report.CurrentVersion != EntitySchemaVersion {
		t.Fatalf("unexpected migration report header: %#v", report)
	}
	found := false
	for _, action := range report.Actions {
		if action.Kind == "dual_write" && action.FromFieldID == "prompt" && action.ToFieldID == "final_prompt" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected shot dual-write action, got %#v", report.Actions)
	}
}

func TestEntityWorkflowSchemaIsProjectedFromSemanticSchema(t *testing.T) {
	semantic, ok := EntitySemanticSchemaForKind("asset")
	if !ok {
		t.Fatal("expected asset semantic schema")
	}
	if semantic.SchemaVersion != EntitySemanticSchemaVersion {
		t.Fatalf("expected semantic schema version %d, got %d", EntitySemanticSchemaVersion, semantic.SchemaVersion)
	}

	var semanticImage EntitySemanticField
	for _, section := range semantic.Sections {
		for _, field := range section.Fields {
			if field.ID == "image" {
				semanticImage = field
			}
		}
	}
	if semanticImage.ID == "" {
		t.Fatal("expected asset image semantic field")
	}
	if !semanticImage.IO.Readable || !semanticImage.IO.Writable {
		t.Fatalf("expected semantic io to describe field capability, got %#v", semanticImage.IO)
	}
	if semanticImage.Control != "resource_picker" {
		t.Fatalf("expected primary media field to use resource picker, got %q", semanticImage.Control)
	}
	if EntityWorkflowPortID(semanticImage) != "image" {
		t.Fatalf("expected image workflow port projection, got %q", EntityWorkflowPortID(semanticImage))
	}

	workflow, ok := EntitySchemaForKind("asset")
	if !ok {
		t.Fatal("expected asset workflow schema")
	}
	var workflowImage EntitySchemaField
	for _, section := range workflow.Sections {
		for _, field := range section.Fields {
			if field.ID == "image" {
				workflowImage = field
			}
		}
	}
	if workflowImage.Workflow.PortID != "image" || workflowImage.Workflow.MaxCount != 1 {
		t.Fatalf("expected workflow field to be projected from semantic field, got %#v", workflowImage.Workflow)
	}
}

func TestSemanticSchemaDistinguishesResourceGalleryAndComputedFields(t *testing.T) {
	script, ok := EntitySemanticSchemaForKind("script")
	if !ok {
		t.Fatal("expected script semantic schema")
	}
	var result EntitySemanticField
	for _, section := range script.Sections {
		for _, field := range section.Fields {
			if field.ID == "result" {
				result = field
			}
		}
	}
	if result.Control != "resource_gallery" || result.Binding == nil || !result.Binding.Multiple {
		t.Fatalf("expected multi-resource result gallery, got %#v", result)
	}

	episode, ok := EntitySemanticSchemaForKind("episode")
	if !ok {
		t.Fatal("expected episode semantic schema")
	}
	var scriptBody EntitySemanticField
	for _, section := range episode.Sections {
		for _, field := range section.Fields {
			if field.ID == "script" {
				scriptBody = field
			}
		}
	}
	if scriptBody.Control != "computed" || !scriptBody.Readonly || scriptBody.IO.Writable || scriptBody.Storage != nil {
		t.Fatalf("expected episode script to be a computed detail field, got %#v", scriptBody)
	}
}

func TestValidateEntityPortValuesRejectsReadonlyPort(t *testing.T) {
	err := validateEntityPortValues("episode", map[string]EntityPortValue{
		"script": {Type: "text", Text: "read-only script body"},
	})
	if err == nil || !strings.Contains(err.Error(), "not writable") {
		t.Fatalf("expected readonly port error, got %v", err)
	}
}

func TestValidateEntityPortValuesRejectsTypeMismatch(t *testing.T) {
	err := validateEntityPortValues("shot", map[string]EntityPortValue{
		"video": {Type: "text", Text: "not a resource"},
	})
	if err == nil || !strings.Contains(err.Error(), "expects video") {
		t.Fatalf("expected type mismatch error, got %v", err)
	}
}

func TestValidateEntityPortValuesRejectsMaxCount(t *testing.T) {
	err := validateEntityPortValues("asset", map[string]EntityPortValue{
		"image": {Type: "image", ResourceIDs: []uint{1, 2}},
	})
	if err == nil || !strings.Contains(err.Error(), "allows at most 1 values") {
		t.Fatalf("expected maxCount error, got %v", err)
	}
}

func TestValidateEntityReadPortsRejectsUnknownPort(t *testing.T) {
	err := ValidateEntityReadPorts("shot", []string{"prompt", "missing"})
	if err == nil || !strings.Contains(err.Error(), `unknown port "missing"`) {
		t.Fatalf("expected unknown read port error, got %v", err)
	}
}

func TestEpisodeScriptPortIsComputedReadOnly(t *testing.T) {
	field, ok := EntityFieldForPort("episode", "script")
	if !ok {
		t.Fatal("expected episode script port")
	}
	if !field.Workflow.Readable || field.Workflow.Writable {
		t.Fatalf("expected computed script port to be read-only, got %#v", field.Workflow)
	}
	if field.Storage != nil {
		t.Fatalf("episode script should not map to an episodes table column: %#v", field.Storage)
	}
}

func TestBuildEntityWriteAuditsCapturesPortContext(t *testing.T) {
	audits := buildEntityWriteAudits(
		"storyboard",
		9,
		map[string]EntityPortValue{
			"description": {Type: "text", Text: "new description"},
			"image":       {Type: "image", ResourceIDs: []uint{77}},
		},
		map[string]EntityPortValue{
			"description": {Type: "text", Text: "old description"},
		},
		map[string][]uint{
			"image": {101, 102},
		},
		EntityWriteMeta{CanvasID: 1, RunID: 2, NodeID: "node-a", UserID: 3},
	)

	if len(audits) != 2 {
		t.Fatalf("expected two audits, got %d", len(audits))
	}

	byPort := map[string]model.CanvasEntityWriteAudit{}
	for i := range audits {
		audit := audits[i]
		if audit.CanvasID != 1 || audit.CanvasRunID != 2 || audit.CanvasNodeID != "node-a" || audit.UserID != 3 {
			t.Fatalf("audit context was not preserved: %#v", audit)
		}
		if audit.EntityKind != "storyboard" || audit.EntityID != 9 {
			t.Fatalf("entity context was not preserved: %#v", audit)
		}
		byPort[audit.PortID] = audit
	}

	descriptionAudit, ok := byPort["description"]
	if !ok {
		t.Fatalf("missing description audit: %#v", audits)
	}
	assertAuditPayload(t, descriptionAudit.OldValueJSON, "text", "old description", nil)
	assertAuditPayload(t, descriptionAudit.NewValueJSON, "text", "new description", nil)
	if descriptionAudit.ResourceBindingIDs != "null" {
		t.Fatalf("expected null binding ids for text field, got %s", descriptionAudit.ResourceBindingIDs)
	}

	imageAudit, ok := byPort["image"]
	if !ok {
		t.Fatalf("missing image audit: %#v", audits)
	}
	assertAuditPayload(t, imageAudit.OldValueJSON, "", "", nil)
	assertAuditPayload(t, imageAudit.NewValueJSON, "image", "", []float64{77})
	if imageAudit.ResourceBindingIDs != "[101,102]" {
		t.Fatalf("expected resource binding ids, got %s", imageAudit.ResourceBindingIDs)
	}
}

func assertAuditPayload(t *testing.T, raw string, wantType string, wantText string, wantResourceIDs []float64) {
	t.Helper()
	if raw == "" {
		if wantType == "" && wantText == "" && len(wantResourceIDs) == 0 {
			return
		}
		t.Fatalf("expected audit payload, got empty")
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("invalid audit payload %q: %v", raw, err)
	}
	if got := payload["type"]; got != wantType {
		t.Fatalf("expected type %q, got %#v in %s", wantType, got, raw)
	}
	if wantText != "" {
		if got := payload["text"]; got != wantText {
			t.Fatalf("expected text %q, got %#v in %s", wantText, got, raw)
		}
	}
	if wantResourceIDs != nil {
		got, ok := payload["resource_ids"].([]any)
		if !ok {
			t.Fatalf("expected resource_ids in %s", raw)
		}
		if len(got) != len(wantResourceIDs) {
			t.Fatalf("expected %d resource ids, got %d in %s", len(wantResourceIDs), len(got), raw)
		}
		for i, want := range wantResourceIDs {
			if got[i] != want {
				t.Fatalf("expected resource id %.0f at %d, got %#v in %s", want, i, got[i], raw)
			}
		}
	}
}

package workflow

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"testing"

	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestEntityFieldUpdatesUseSchemaStorageMapping(t *testing.T) {
	updates := entityFieldUpdates("script", map[string]EntityPortValue{
		"title":  {Type: "text", Text: "New title"},
		"hook":   {Type: "text", Text: "Opening conflict"},
		"result": {Type: "resource", ResourceIDs: []uint{7}},
	})

	if got := updates["title"]; got != "New title" {
		t.Fatalf("expected title update, got %#v", got)
	}
	if got := updates["hook"]; got != "Opening conflict" {
		t.Fatalf("expected hook update, got %#v", got)
	}
	if _, ok := updates["result"]; ok {
		t.Fatalf("resource binding port should not produce field update: %#v", updates)
	}
}

func TestEntityFieldUpdatesUseResourceIDForNumberPort(t *testing.T) {
	updates := entityFieldUpdates("asset_slot", map[string]EntityPortValue{
		"resource_id": {Type: "number", ResourceIDs: []uint{42}},
	})

	if got := updates["resource_id"]; got != uint(42) {
		t.Fatalf("expected resource_id update from resource port value, got %#v", got)
	}
}

func TestNormalizeEntityPortValuesKeepsCanonicalField(t *testing.T) {
	values, err := NormalizeEntityPortValues("script", map[string]EntityPortValue{
		"core_settings": {Type: "json", JSON: json.RawMessage(`{"world":"near future"}`)},
	})
	if err != nil {
		t.Fatalf("expected normalization to succeed: %v", err)
	}
	if value, ok := values["core_settings"]; !ok || value.JSON == nil {
		t.Fatalf("expected canonical core_settings value, got %#v", values)
	}
}

func TestEntitySchemasExposeVersionAndLayoutMetadata(t *testing.T) {
	schema, ok := EntitySchemaForKind("asset_slot")
	if !ok {
		t.Fatal("expected asset_slot schema")
	}
	if schema.SchemaVersion != EntitySchemaVersion {
		t.Fatalf("expected schema version %d, got %d", EntitySchemaVersion, schema.SchemaVersion)
	}
	if schema.Layout.Variant == "" {
		t.Fatal("expected schema layout metadata")
	}
	field, ok := EntityFieldForPort("asset_slot", "image")
	if !ok {
		t.Fatal("expected asset_slot image field")
	}
	if field.Workflow.MaxCount != 1 || field.Control != "resource_picker" {
		t.Fatalf("expected single primary image field, got %#v", field)
	}
	if schema.Projection != "workflow" || schema.Compatibility.CurrentVersion != EntitySchemaVersion {
		t.Fatalf("expected workflow projection compatibility metadata, got %#v", schema.Compatibility)
	}
}

func TestEntityWorkflowSchemaIsProjectedFromSemanticSchema(t *testing.T) {
	semantic, ok := EntitySemanticSchemaForKind("asset_slot")
	if !ok {
		t.Fatal("expected asset_slot semantic schema")
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
		t.Fatal("expected asset_slot image semantic field")
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

	workflow, ok := EntitySchemaForKind("asset_slot")
	if !ok {
		t.Fatal("expected asset_slot workflow schema")
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

func TestSemanticSchemaDistinguishesResourceGalleryAndPrimaryMediaFields(t *testing.T) {
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

	slot, ok := EntitySemanticSchemaForKind("asset_slot")
	if !ok {
		t.Fatal("expected asset_slot semantic schema")
	}
	var image EntitySemanticField
	for _, section := range slot.Sections {
		for _, field := range section.Fields {
			if field.ID == "image" {
				image = field
			}
		}
	}
	if image.Control != "resource_picker" || image.Binding == nil || image.Binding.Multiple {
		t.Fatalf("expected asset_slot image to be a single resource picker, got %#v", image)
	}
}

func TestValidateEntityPortValuesRejectsReadonlyPort(t *testing.T) {
	err := validateEntityPortValues("script", map[string]EntityPortValue{
		"background": {Type: "text", Text: "read-only background"},
	})
	if err == nil || !strings.Contains(err.Error(), "not writable") {
		t.Fatalf("expected readonly port error, got %v", err)
	}
}

func TestProductionEntitySchemasOnlyWriteMediaPorts(t *testing.T) {
	for _, tc := range []struct {
		kind       string
		readonly   string
		writePorts []string
	}{
		{kind: "asset_slot", readonly: "prompt_hint", writePorts: []string{"result", "image", "video", "audio", "reference", "resource_id", "locked_asset_slot_id", "candidates", "candidate_item"}},
		{kind: "content_unit", readonly: "prompt", writePorts: []string{"result", "image", "video", "audio"}},
		{kind: "segment", readonly: "summary", writePorts: nil},
		{kind: "scene_moment", readonly: "description", writePorts: nil},
		{kind: "creative_reference", readonly: "description", writePorts: nil},
	} {
		field, ok := EntityFieldForPort(tc.kind, tc.readonly)
		if !ok {
			t.Fatalf("expected %s.%s field", tc.kind, tc.readonly)
		}
		if !field.Workflow.Readable || field.Workflow.Writable {
			t.Fatalf("expected %s.%s to be read-only, got %#v", tc.kind, tc.readonly, field.Workflow)
		}
		for _, portID := range tc.writePorts {
			field, ok := EntityFieldForPort(tc.kind, portID)
			if !ok {
				t.Fatalf("expected %s.%s field", tc.kind, portID)
			}
			if !field.Workflow.Writable {
				t.Fatalf("expected %s.%s to be writable, got %#v", tc.kind, portID, field.Workflow)
			}
		}
	}
}

func TestScriptCharacterArchivePortsAreReadonlyDeprecated(t *testing.T) {
	for _, portID := range []string{"character_profiles", "character_relationships", "core_settings", "background", "scenes_desc"} {
		field, ok := EntityFieldForPort("script", portID)
		if !ok {
			t.Fatalf("expected script port %q", portID)
		}
		if !field.Deprecated || !field.Readonly || !field.Workflow.Readable || field.Workflow.Writable {
			t.Fatalf("expected %q to be readonly deprecated, got %#v", portID, field)
		}
		err := validateEntityPortValues("script", map[string]EntityPortValue{
			portID: {Type: "json", JSON: json.RawMessage(`[{"name":"old"}]`)},
		})
		if err == nil || !strings.Contains(err.Error(), "not writable") {
			t.Fatalf("expected readonly port error for %q, got %v", portID, err)
		}
	}
}

func TestValidateEntityPortValuesRejectsTypeMismatch(t *testing.T) {
	err := validateEntityPortValues("asset_slot", map[string]EntityPortValue{
		"image": {Type: "text", Text: "not a resource"},
	})
	if err == nil || !strings.Contains(err.Error(), "expects image") {
		t.Fatalf("expected type mismatch error, got %v", err)
	}
}

func TestValidateEntityPortValuesRejectsMaxCount(t *testing.T) {
	err := validateEntityPortValues("asset_slot", map[string]EntityPortValue{
		"image": {Type: "image", ResourceIDs: []uint{1, 2}},
	})
	if err == nil || !strings.Contains(err.Error(), "allows at most 1 values") {
		t.Fatalf("expected maxCount error, got %v", err)
	}
}

func TestValidateEntityReadPortsRejectsUnknownPort(t *testing.T) {
	err := ValidateEntityReadPorts("asset_slot", []string{"prompt", "missing"})
	if err == nil || !strings.Contains(err.Error(), `unknown port "prompt"`) {
		t.Fatalf("expected unknown read port error, got %v", err)
	}
}

func TestResolveEntityPortSelectionCanonicalizesPorts(t *testing.T) {
	selection, err := resolveEntityPortSelection("script", []string{"core_settings", "title"})
	if err != nil {
		t.Fatalf("expected selection to resolve, got %v", err)
	}
	if len(selection) != 2 {
		t.Fatalf("expected two canonical ports, got %#v", selection)
	}
	if _, ok := selection["core_settings"]; !ok {
		t.Fatalf("expected core_settings to resolve, got %#v", selection)
	}
}

func TestEntityTableNameSupportsContentUnit(t *testing.T) {
	table, ok := entityTableName("content_unit")
	if !ok {
		t.Fatal("expected content_unit table name")
	}
	if table != "content_units" {
		t.Fatalf("expected content_units table, got %q", table)
	}
}

func TestBuildEntityWriteAuditsCapturesPortContext(t *testing.T) {
	audits := buildEntityWriteAudits(
		"asset_slot",
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

	byPort := map[string]canvasdomain.EntityWriteAudit{}
	for i := range audits {
		audit := audits[i]
		if audit.CanvasID != 1 || audit.CanvasRunID != 2 || audit.CanvasNodeID != "node-a" || audit.UserID != 3 {
			t.Fatalf("audit context was not preserved: %#v", audit)
		}
		if audit.EntityKind != "asset_slot" || audit.EntityID != 9 {
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

func TestWritePortsSyncsAssetCandidateRelationsWithoutHooks(t *testing.T) {
	db := newWorkflowIOTestDB(t)
	ctx := context.Background()
	ownerID := uint(77)
	slot := model.AssetSlot{
		ProjectID: 1,
		OwnerType: "content_unit",
		OwnerID:   &ownerID,
		Kind:      "image",
		Name:      "Hero still",
		Status:    "missing",
	}
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "candidate.png", FilePath: "/tmp/candidate.png"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&slot).Error; err != nil {
		t.Fatalf("create slot: %v", err)
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	svc := NewEntityIOService(db.Session(&gorm.Session{SkipHooks: true}))
	result, err := svc.WritePorts(ctx, "asset_slot", slot.ID, map[string]EntityPortValue{
		"candidates": {Type: "image", ResourceIDs: []uint{resource.ID}},
	}, EntityWriteMeta{ProjectID: uintPtr(1), SourceType: "canvas", CanvasID: 9, RunID: 10, NodeID: "node-a", UserID: 2})
	if err != nil {
		t.Fatalf("write ports: %v", err)
	}
	if len(result.BindingIDs) != 1 {
		t.Fatalf("expected one resource binding, got %#v", result.BindingIDs)
	}

	var candidate model.AssetSlotCandidate
	if err := db.First(&candidate, "asset_slot_id = ?", slot.ID).Error; err != nil {
		t.Fatalf("expected candidate row: %v", err)
	}
	assertRelationExists(t, db,
		"asset_slot", candidate.CandidateAssetSlotID,
		"asset_slot", slot.ID,
		model.EntityRelationTypeCandidateFor,
	)
	assertRelationExists(t, db,
		"asset_slot", candidate.CandidateAssetSlotID,
		"raw_resource", resource.ID,
		model.EntityRelationTypeUsesResource,
	)
	assertRelationWithMetadataExists(t, db, "resource_binding_id", result.BindingIDs[0])
}

func TestWriteAndReadContentUnitGeneratedMediaBindings(t *testing.T) {
	db := newWorkflowIOTestDB(t)
	ctx := context.Background()
	projectID := uint(1)
	unit := model.ContentUnit{
		ProjectID: projectID,
		Kind:      "shot",
		Title:     "开场镜头",
		Status:    "draft",
	}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}
	resource1 := model.RawResource{OwnerID: 1, Type: "image", Name: "frame-a.png", FilePath: "/tmp/frame-a.png"}
	resource2 := model.RawResource{OwnerID: 1, Type: "video", Name: "frame-b.mp4", FilePath: "/tmp/frame-b.mp4"}
	if err := db.Create(&resource1).Error; err != nil {
		t.Fatalf("create resource1: %v", err)
	}
	if err := db.Create(&resource2).Error; err != nil {
		t.Fatalf("create resource2: %v", err)
	}

	svc := NewEntityIOService(db.Session(&gorm.Session{SkipHooks: true}))
	if _, err := svc.WritePorts(ctx, "content_unit", unit.ID, map[string]EntityPortValue{
		"generated_media": {Type: "resource", ResourceIDs: []uint{resource1.ID, resource2.ID}},
	}, EntityWriteMeta{ProjectID: uintPtr(projectID), SourceType: "job", UserID: 2}); err != nil {
		t.Fatalf("write content unit generated media: %v", err)
	}

	portValues, err := svc.ReadPorts(ctx, "content_unit", unit.ID)
	if err != nil {
		t.Fatalf("read content unit ports: %v", err)
	}
	generated := portValues["generated_media"]
	if len(generated.ResourceIDs) != 2 {
		t.Fatalf("expected two generated media bindings, got %#v", generated.ResourceIDs)
	}

	detail, err := svc.ReadDetailValues(ctx, "content_unit", unit.ID)
	if err != nil {
		t.Fatalf("read content unit detail: %v", err)
	}
	items, ok := detail.Values["generated_media"].([]map[string]any)
	if !ok {
		t.Fatalf("expected generated_media related list, got %#v", detail.Values["generated_media"])
	}
	if len(items) != 2 {
		t.Fatalf("expected two generated media items, got %#v", items)
	}
}

func TestAttachAssetSlotCandidateSyncsRelationsWithoutHooks(t *testing.T) {
	db := newWorkflowIOTestDB(t)
	ctx := context.Background()
	ownerID := uint(88)
	slot := model.AssetSlot{
		ProjectID: 1,
		OwnerType: "content_unit",
		OwnerID:   &ownerID,
		Kind:      "image",
		Name:      "Primary slot",
		Status:    "missing",
	}
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "attached.png", FilePath: "/tmp/attached.png"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&slot).Error; err != nil {
		t.Fatalf("create slot: %v", err)
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	svc := NewEntityIOService(db.Session(&gorm.Session{SkipHooks: true}))
	result, err := svc.AttachAssetSlotCandidate(ctx, AttachAssetSlotCandidateInput{
		ProjectID:   1,
		AssetSlotID: slot.ID,
		ResourceID:  resource.ID,
		SourceType:  "canvas",
		CanvasID:    9,
		RunID:       10,
		NodeID:      "node-a",
		UserID:      2,
		Score:       0.8,
		Note:        "good candidate",
	})
	if err != nil {
		t.Fatalf("attach candidate: %v", err)
	}
	if result.AssetSlot.Status != "candidate" {
		t.Fatalf("expected source slot status candidate, got %q", result.AssetSlot.Status)
	}
	assertRelationExists(t, db,
		"asset_slot", result.CandidateSlot.ID,
		"asset_slot", slot.ID,
		model.EntityRelationTypeCandidateFor,
	)
	assertRelationWithMetadataExists(t, db, "asset_slot_candidate_id", result.Candidate.ID)
	assertRelationWithMetadataExists(t, db, "resource_binding_id", result.ResourceBinding.ID)
}

func TestAttachAssetSlotCandidateDefaultsManualSourceWithoutCanvasContext(t *testing.T) {
	db := newWorkflowIOTestDB(t)
	ctx := context.Background()
	ownerID := uint(88)
	slot := model.AssetSlot{
		ProjectID: 1,
		OwnerType: "content_unit",
		OwnerID:   &ownerID,
		Kind:      "image",
		Name:      "Primary slot",
		Status:    "missing",
	}
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "attached.png", FilePath: "/tmp/attached.png"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&slot).Error; err != nil {
		t.Fatalf("create slot: %v", err)
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	svc := NewEntityIOService(db.Session(&gorm.Session{SkipHooks: true}))
	result, err := svc.AttachAssetSlotCandidate(ctx, AttachAssetSlotCandidateInput{
		ProjectID:   1,
		AssetSlotID: slot.ID,
		ResourceID:  resource.ID,
		UserID:      2,
	})
	if err != nil {
		t.Fatalf("attach candidate: %v", err)
	}
	if result.Candidate.SourceType != "manual" {
		t.Fatalf("candidate source type = %q, want manual", result.Candidate.SourceType)
	}
	if result.ResourceBinding.SourceType != "manual" {
		t.Fatalf("binding source type = %q, want manual", result.ResourceBinding.SourceType)
	}
}

func newWorkflowIOTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "workflow.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	},
		&model.EntityRelation{},
		&model.AssetSlot{},
		&model.AssetSlotCandidate{},
		&model.ContentUnit{},
		&model.ResourceBinding{},
		&model.RawResource{},
		&model.CanvasEntityWriteAudit{},
	)
}

func assertRelationExists(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) {
	t.Helper()
	var count int64
	if err := db.Model(&model.EntityRelation{}).
		Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND type = ?", sourceType, sourceID, targetType, targetID, relationType).
		Count(&count).Error; err != nil {
		t.Fatalf("count relation: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected relation %s:%d -> %s:%d type %s, got %d", sourceType, sourceID, targetType, targetID, relationType, count)
	}
}

func assertRelationWithMetadataExists(t *testing.T, db *gorm.DB, marker string, id uint) {
	t.Helper()
	var count int64
	if err := db.Model(&model.EntityRelation{}).
		Where("metadata_json LIKE ?", `%`+marker+`":`+strconv.FormatUint(uint64(id), 10)+`%`).
		Count(&count).Error; err != nil {
		t.Fatalf("count relation metadata: %v", err)
	}
	if count == 0 {
		t.Fatalf("expected relation metadata marker %s=%d", marker, id)
	}
}

func uintPtr(value uint) *uint {
	return &value
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

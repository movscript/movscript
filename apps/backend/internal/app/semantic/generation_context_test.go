package semantic

import (
	"context"
	"errors"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestBuildGenerationContextForContentUnit(t *testing.T) {
	db := newGenerationContextTestDB(t)
	projectID := uint(1)
	production := model.Production{
		ProjectID:  projectID,
		Name:       "Demo",
		Status:     "planning",
		SourceType: "direct",
	}
	if err := db.Create(&production).Error; err != nil {
		t.Fatalf("create production: %v", err)
	}
	segment := model.Segment{
		ProjectID:    projectID,
		ProductionID: &production.ID,
		Kind:         "setup",
		Title:        "Opening",
		Status:       "confirmed",
	}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	sceneMoment := model.SceneMoment{
		ProjectID:    projectID,
		SegmentID:    &segment.ID,
		Title:        "Rainy street",
		LocationText: "便利店门口",
		ActionText:   "角色发现线索",
		Status:       "confirmed",
	}
	if err := db.Create(&sceneMoment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}
	script := model.Script{ProjectID: projectID, Title: "Pilot", Content: "INT. SHOP - NIGHT\n手机屏幕亮起。", RawSource: "INT. SHOP - NIGHT\n手机屏幕亮起。", AuthorID: 1}
	if err := db.Create(&script).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	version := model.ScriptVersion{
		ProjectID:     projectID,
		ScriptID:      script.ID,
		VersionNumber: 1,
		Title:         "Pilot v1",
		SourceType:    "raw",
		Content:       script.Content,
		RawSource:     script.RawSource,
		Status:        "active",
	}
	if err := db.Create(&version).Error; err != nil {
		t.Fatalf("create script version: %v", err)
	}
	scriptBlock := model.ScriptBlock{
		ProjectID:       projectID,
		ScriptID:        script.ID,
		ScriptVersionID: version.ID,
		Order:           1,
		Kind:            "action",
		Content:         "手机屏幕亮起。",
		StartLine:       2,
		EndLine:         2,
		StartChar:       0,
		EndChar:         7,
		Status:          "active",
	}
	if err := db.Create(&scriptBlock).Error; err != nil {
		t.Fatalf("create script block: %v", err)
	}
	contentUnit := model.ContentUnit{
		ProjectID:     projectID,
		ProductionID:  &production.ID,
		SegmentID:     &segment.ID,
		SceneMomentID: &sceneMoment.ID,
		ScriptBlockID: &scriptBlock.ID,
		Kind:          "shot",
		Title:         "手机特写",
		Prompt:        "手机屏幕亮起",
		Status:        "confirmed",
	}
	if err := db.Create(&contentUnit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}
	ref := model.CreativeReference{
		ProjectID:   projectID,
		Kind:        "character",
		Name:        "林夏",
		Importance:  "main",
		Status:      "confirmed",
		ProfileJSON: "{}",
		TagsJSON:    "[]",
	}
	if err := db.Create(&ref).Error; err != nil {
		t.Fatalf("create creative reference: %v", err)
	}
	state := model.CreativeReferenceState{
		ProjectID:           projectID,
		CreativeReferenceID: ref.ID,
		ScopeType:           "scene_moment",
		ScopeID:             &sceneMoment.ID,
		Name:                "雨夜状态",
		VisualNotes:         "湿发，深色外套",
		Status:              "confirmed",
	}
	if err := db.Create(&state).Error; err != nil {
		t.Fatalf("create creative state: %v", err)
	}
	usage := model.CreativeReferenceUsage{
		ProjectID:                projectID,
		OwnerType:                "scene_moment",
		OwnerID:                  sceneMoment.ID,
		CreativeReferenceID:      ref.ID,
		CreativeReferenceStateID: &state.ID,
		Role:                     "protagonist",
		Source:                   "manual",
		Status:                   "confirmed",
	}
	if err := db.Create(&usage).Error; err != nil {
		t.Fatalf("create usage: %v", err)
	}
	resource := model.RawResource{
		OwnerID:        1,
		Type:           "image",
		Name:           "character.png",
		FilePath:       "/tmp/character.png",
		MimeType:       "image/png",
		StorageBackend: "local",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	slot := model.AssetSlot{
		ProjectID:           projectID,
		ProductionID:        &production.ID,
		OwnerType:           "content_unit",
		OwnerID:             &contentUnit.ID,
		Kind:                "image",
		Name:                "角色参考",
		Status:              "locked",
		Priority:            "high",
		ResourceID:          &resource.ID,
		CreativeReferenceID: &ref.ID,
	}
	if err := db.Create(&slot).Error; err != nil {
		t.Fatalf("create asset slot: %v", err)
	}
	referenceSlot := model.AssetSlot{
		ProjectID:                projectID,
		ProductionID:             &production.ID,
		OwnerType:                "creative_reference_state",
		OwnerID:                  &state.ID,
		Kind:                     "image",
		Name:                     "角色状态参考",
		Status:                   "locked",
		Priority:                 "normal",
		ResourceID:               &resource.ID,
		CreativeReferenceID:      &ref.ID,
		CreativeReferenceStateID: &state.ID,
	}
	if err := db.Create(&referenceSlot).Error; err != nil {
		t.Fatalf("create reference asset slot: %v", err)
	}
	keyframe := model.Keyframe{
		ProjectID:     projectID,
		ProductionID:  &production.ID,
		SceneMomentID: &sceneMoment.ID,
		ContentUnitID: &contentUnit.ID,
		ResourceID:    &resource.ID,
		Title:         "候选首帧",
		Status:        "candidate",
	}
	if err := db.Create(&keyframe).Error; err != nil {
		t.Fatalf("create keyframe: %v", err)
	}

	got, err := NewService(db).BuildGenerationContext(context.Background(), projectID, GenerationContextRequest{
		TargetType: "content_unit",
		TargetID:   contentUnit.ID,
		Intent:     "video",
	})
	if err != nil {
		t.Fatalf("build generation context: %v", err)
	}
	if got.Target.ContentUnit.ID != contentUnit.ID || got.Intent != "video" {
		t.Fatalf("unexpected target context: %+v", got.Target)
	}
	if got.Production == nil || got.Production.ID != production.ID {
		t.Fatalf("missing production: %+v", got.Production)
	}
	if got.Segment == nil || got.Segment.ID != segment.ID {
		t.Fatalf("missing segment: %+v", got.Segment)
	}
	if got.SceneMoment == nil || got.SceneMoment.ID != sceneMoment.ID {
		t.Fatalf("missing scene moment: %+v", got.SceneMoment)
	}
	if got.ScriptBlock == nil || got.ScriptBlock.ID != scriptBlock.ID || got.ScriptBlock.Content != scriptBlock.Content || got.ScriptBlock.StartLine != scriptBlock.StartLine || got.ScriptBlock.EndLine != scriptBlock.EndLine {
		t.Fatalf("missing script block source: %+v", got.ScriptBlock)
	}
	if len(got.CreativeReferences) != 1 || got.CreativeReferences[0].Reference == nil || got.CreativeReferences[0].Reference.ID != ref.ID || got.CreativeReferences[0].State == nil || got.CreativeReferences[0].State.ID != state.ID {
		t.Fatalf("unexpected creative references: %+v", got.CreativeReferences)
	}
	if len(got.AssetSlots) != 2 {
		t.Fatalf("unexpected asset slots: %+v", got.AssetSlots)
	}
	gotSlots := map[uint]bool{}
	for _, item := range got.AssetSlots {
		if item.Resource == nil || item.Resource.ID != resource.ID {
			t.Fatalf("asset slot missing resource: %+v", item)
		}
		gotSlots[item.ID] = true
	}
	if !gotSlots[slot.ID] || !gotSlots[referenceSlot.ID] {
		t.Fatalf("missing expected asset slots: %+v", got.AssetSlots)
	}
	if len(got.Keyframes) != 1 || got.Keyframes[0].ID != keyframe.ID || got.Keyframes[0].Resource == nil || got.Keyframes[0].Resource.ID != resource.ID {
		t.Fatalf("unexpected keyframes: %+v", got.Keyframes)
	}
	if len(got.Constraints.WriteTargets) == 0 {
		t.Fatalf("missing write targets: %+v", got.Constraints)
	}
	if !containsString(got.Constraints.ReadOnlyEntities, "script_block") {
		t.Fatalf("script block must be read-only source context: %+v", got.Constraints)
	}
}

func TestBuildGenerationContextReturnsDebuggableNotFoundError(t *testing.T) {
	db := newGenerationContextTestDB(t)
	_, err := NewService(db).BuildGenerationContext(context.Background(), 2, GenerationContextRequest{
		TargetType: "content_unit",
		TargetID:   7,
		Intent:     "video",
	})
	if err == nil {
		t.Fatal("expected generation context error")
	}
	var contextErr GenerationContextError
	if !errors.As(err, &contextErr) {
		t.Fatalf("expected GenerationContextError, got %T %[1]v", err)
	}
	if contextErr.Code != "GENERATION_CONTEXT_ENTITY_NOT_FOUND" {
		t.Fatalf("code = %q, want GENERATION_CONTEXT_ENTITY_NOT_FOUND", contextErr.Code)
	}
	if contextErr.Step != "load_target" || contextErr.ProjectID != 2 || contextErr.EntityType != "content_unit" || contextErr.EntityID != 7 {
		t.Fatalf("unexpected debug payload: %+v", contextErr)
	}
	if contextErr.Message == "" || contextErr.Cause == "" {
		t.Fatalf("missing readable error fields: %+v", contextErr)
	}
}

func newGenerationContextTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:generation_context?mode=memory&cache=shared"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&model.Production{},
		&model.Script{},
		&model.ScriptVersion{},
		&model.ScriptBlock{},
		&model.Segment{},
		&model.SceneMoment{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.CreativeReference{},
		&model.CreativeReferenceState{},
		&model.CreativeReferenceUsage{},
		&model.AssetSlot{},
		&model.RawResource{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

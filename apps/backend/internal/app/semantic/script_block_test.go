package semantic

import (
	"context"
	"errors"
	"strconv"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestCreateScriptBlockPersistsSourceRelations(t *testing.T) {
	db := newScriptBlockTestDB(t)
	service := NewService(db)
	script, version := seedScriptBlockTestScript(t, db, 1)

	block, err := service.CreateScriptBlock(context.Background(), 1, CreateScriptBlockInput{
		ScriptID:        script.ID,
		ScriptVersionID: version.ID,
		Kind:            "dialogue",
		Speaker:         "Ada",
		Content:         "ignored client copy",
		StartLine:       3,
		EndLine:         3,
		Status:          "active",
	})
	if err != nil {
		t.Fatalf("create script block: %v", err)
	}
	if block.Content != "Ada: We have to move now." || block.StartChar != 0 || block.EndChar != len([]rune("Ada: We have to move now.")) {
		t.Fatalf("script block source was not derived from version: %+v", block)
	}

	var relation model.EntityRelation
	if err := db.Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND type = ?",
		"script_version", version.ID, "script_block", block.ID, model.EntityRelationTypeContains,
	).First(&relation).Error; err != nil {
		t.Fatalf("load script block relation: %v", err)
	}
	if relation.Order != block.Order || relation.Status != "confirmed" {
		t.Fatalf("unexpected relation: %+v", relation)
	}
}

func TestCreateScriptBlockRejectsMismatchedScriptVersion(t *testing.T) {
	db := newScriptBlockTestDB(t)
	service := NewService(db)
	_, version := seedScriptBlockTestScript(t, db, 1)
	otherScript := model.Script{ProjectID: 1, Title: "Other", AuthorID: 1}
	if err := db.Create(&otherScript).Error; err != nil {
		t.Fatalf("create other script: %v", err)
	}

	_, err := service.CreateScriptBlock(context.Background(), 1, CreateScriptBlockInput{
		ScriptID:        otherScript.ID,
		ScriptVersionID: version.ID,
		Content:         "mismatched",
		StartLine:       1,
		EndLine:         1,
	})
	if !errors.Is(err, ErrOwnerWrongProject) {
		t.Fatalf("error = %v, want ErrOwnerWrongProject", err)
	}
}

func TestCreateScriptBlockExtractsPreciseSelectionFromVersion(t *testing.T) {
	db := newScriptBlockTestDB(t)
	service := NewService(db)
	script, version := seedScriptBlockTestScript(t, db, 1)

	block, err := service.CreateScriptBlock(context.Background(), 1, CreateScriptBlockInput{
		ScriptID:        script.ID,
		ScriptVersionID: version.ID,
		Kind:            "action",
		Content:         "wrong client text",
		StartLine:       2,
		EndLine:         3,
		StartChar:       3,
		EndChar:         8,
		Status:          "active",
	})
	if err != nil {
		t.Fatalf("create precise script block: %v", err)
	}
	if block.Content != "shop.\nAda: We " {
		t.Fatalf("content = %q, want precise version slice", block.Content)
	}
	if block.StartLine != 2 || block.EndLine != 3 || block.StartChar != 3 || block.EndChar != 8 {
		t.Fatalf("unexpected source anchor: %+v", block)
	}
}

func TestCreateScriptBlockRejectsOutOfRangeAnchor(t *testing.T) {
	db := newScriptBlockTestDB(t)
	service := NewService(db)
	script, version := seedScriptBlockTestScript(t, db, 1)

	_, err := service.CreateScriptBlock(context.Background(), 1, CreateScriptBlockInput{
		ScriptID:        script.ID,
		ScriptVersionID: version.ID,
		Content:         "outside",
		StartLine:       99,
		EndLine:         99,
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("error = %v, want ErrInvalidInput", err)
	}
}

func TestPatchScriptBlockKeepsSourceAnchorImmutable(t *testing.T) {
	db := newScriptBlockTestDB(t)
	service := NewService(db)
	script, version := seedScriptBlockTestScript(t, db, 1)
	block, err := service.CreateScriptBlock(context.Background(), 1, CreateScriptBlockInput{
		ScriptID:        script.ID,
		ScriptVersionID: version.ID,
		Kind:            "action",
		Content:         "Original source text.",
		StartLine:       2,
		EndLine:         2,
		StartChar:       0,
		EndChar:         8,
		Status:          "active",
	})
	if err != nil {
		t.Fatalf("create script block: %v", err)
	}

	patched, err := service.PatchScriptBlock(context.Background(), 1, strconv.FormatUint(uint64(block.ID), 10), PatchScriptBlockInput{
		Kind:      "dialogue",
		Speaker:   "Ada",
		Content:   "Changed source text.",
		StartLine: 30,
		EndLine:   40,
		StartChar: 10,
		EndChar:   20,
		Status:    "draft",
	})
	if err != nil {
		t.Fatalf("patch script block: %v", err)
	}
	if patched.Kind != "dialogue" || patched.Speaker != "Ada" || patched.Status != "draft" {
		t.Fatalf("editable annotations were not updated: %+v", patched)
	}
	if patched.Content != block.Content || patched.StartLine != block.StartLine || patched.EndLine != block.EndLine || patched.StartChar != block.StartChar || patched.EndChar != block.EndChar {
		t.Fatalf("source anchor changed: got %+v want content %q lines %d-%d chars %d-%d", patched, block.Content, block.StartLine, block.EndLine, block.StartChar, block.EndChar)
	}
}

func TestScriptBlockCannotBeDeletedByKind(t *testing.T) {
	db := newScriptBlockTestDB(t)
	service := NewService(db)
	script, version := seedScriptBlockTestScript(t, db, 1)
	block, err := service.CreateScriptBlock(context.Background(), 1, CreateScriptBlockInput{
		ScriptID:        script.ID,
		ScriptVersionID: version.ID,
		Content:         "Stable source text.",
		StartLine:       4,
		EndLine:         4,
	})
	if err != nil {
		t.Fatalf("create script block: %v", err)
	}

	err = service.DeleteItemByKind(context.Background(), 1, "script_block", strconv.FormatUint(uint64(block.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("DeleteItemByKind() error = %v, want ErrForbidden", err)
	}

	var count int64
	if err := db.Model(&model.ScriptBlock{}).Where("id = ?", block.ID).Count(&count).Error; err != nil {
		t.Fatalf("count script blocks: %v", err)
	}
	if count != 1 {
		t.Fatalf("script blocks after delete = %d, want 1", count)
	}
}

func TestListScriptBlockUsagesReturnsDirectDownstreamBindings(t *testing.T) {
	db := newScriptBlockTestDB(t)
	service := NewService(db)
	script, version := seedScriptBlockTestScript(t, db, 1)
	block, err := service.CreateScriptBlock(context.Background(), 1, CreateScriptBlockInput{
		ScriptID:        script.ID,
		ScriptVersionID: version.ID,
		StartLine:       2,
		EndLine:         2,
		Status:          "active",
	})
	if err != nil {
		t.Fatalf("create script block: %v", err)
	}
	otherBlock, err := service.CreateScriptBlock(context.Background(), 1, CreateScriptBlockInput{
		ScriptID:        script.ID,
		ScriptVersionID: version.ID,
		StartLine:       3,
		EndLine:         3,
		Status:          "active",
	})
	if err != nil {
		t.Fatalf("create other script block: %v", err)
	}

	segment := model.Segment{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Beat", Status: "draft"}
	otherSegment := model.Segment{ProjectID: 1, ScriptBlockID: &otherBlock.ID, Title: "Other", Status: "draft"}
	moment := model.SceneMoment{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Moment", Status: "draft"}
	unit := model.ContentUnit{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	if err := db.Create(&otherSegment).Error; err != nil {
		t.Fatalf("create other segment: %v", err)
	}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}

	usages, err := service.ListScriptBlockUsages(context.Background(), 1, strconv.FormatUint(uint64(block.ID), 10))
	if err != nil {
		t.Fatalf("list script block usages: %v", err)
	}
	if len(usages.Segments) != 1 || usages.Segments[0].ID != segment.ID {
		t.Fatalf("segments = %+v, want only segment %d", usages.Segments, segment.ID)
	}
	if len(usages.SceneMoments) != 1 || usages.SceneMoments[0].ID != moment.ID {
		t.Fatalf("scene moments = %+v, want moment %d", usages.SceneMoments, moment.ID)
	}
	if len(usages.ContentUnits) != 1 || usages.ContentUnits[0].ID != unit.ID {
		t.Fatalf("content units = %+v, want unit %d", usages.ContentUnits, unit.ID)
	}
}

func TestListScriptBlockUsageMapGroupsByVersionBlocks(t *testing.T) {
	db := newScriptBlockTestDB(t)
	service := NewService(db)
	script, version := seedScriptBlockTestScript(t, db, 1)
	firstBlock, err := service.CreateScriptBlock(context.Background(), 1, CreateScriptBlockInput{
		ScriptID:        script.ID,
		ScriptVersionID: version.ID,
		StartLine:       2,
		EndLine:         2,
		Status:          "active",
	})
	if err != nil {
		t.Fatalf("create first script block: %v", err)
	}
	secondBlock, err := service.CreateScriptBlock(context.Background(), 1, CreateScriptBlockInput{
		ScriptID:        script.ID,
		ScriptVersionID: version.ID,
		StartLine:       3,
		EndLine:         3,
		Status:          "active",
	})
	if err != nil {
		t.Fatalf("create second script block: %v", err)
	}
	segment := model.Segment{ProjectID: 1, ScriptBlockID: &firstBlock.ID, Title: "Beat", Status: "draft"}
	moment := model.SceneMoment{ProjectID: 1, ScriptBlockID: &secondBlock.ID, Title: "Moment", Status: "draft"}
	unit := model.ContentUnit{ProjectID: 1, ScriptBlockID: &secondBlock.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}

	usages, err := service.ListScriptBlockUsageMap(context.Background(), 1, version.ID)
	if err != nil {
		t.Fatalf("list usage map: %v", err)
	}
	first := usages[firstBlock.ID]
	if len(first.Segments) != 1 || first.Segments[0].ID != segment.ID || len(first.SceneMoments) != 0 || len(first.ContentUnits) != 0 {
		t.Fatalf("first block usages = %+v", first)
	}
	second := usages[secondBlock.ID]
	if len(second.Segments) != 0 || len(second.SceneMoments) != 1 || second.SceneMoments[0].ID != moment.ID || len(second.ContentUnits) != 1 || second.ContentUnits[0].ID != unit.ID {
		t.Fatalf("second block usages = %+v", second)
	}
}

func newScriptBlockTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "script-block.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	}, &model.EntityRelation{}, &model.Script{}, &model.ScriptVersion{}, &model.ScriptBlock{}, &model.Segment{}, &model.SceneMoment{}, &model.ContentUnit{}, &model.StoryboardScript{}, &model.StoryboardVersion{})
}

func seedScriptBlockTestScript(t *testing.T, db *gorm.DB, projectID uint) (model.Script, model.ScriptVersion) {
	t.Helper()
	content := "INT. SHOP - NIGHT\nAt shop.\nAda: We have to move now.\nStable source text."
	script := model.Script{ProjectID: projectID, Title: "Pilot", Content: content, RawSource: content, AuthorID: 1}
	if err := db.Create(&script).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	version := model.ScriptVersion{
		ProjectID:     projectID,
		ScriptID:      script.ID,
		VersionNumber: 1,
		Title:         script.Title,
		SourceType:    "raw",
		Content:       script.Content,
		RawSource:     script.RawSource,
		Status:        "active",
	}
	if err := db.Create(&version).Error; err != nil {
		t.Fatalf("create script version: %v", err)
	}
	return script, version
}

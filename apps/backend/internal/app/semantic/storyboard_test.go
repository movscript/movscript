package semantic

import (
	"context"
	"errors"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCreateStoryboardLineCanReferenceScriptBlock(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, version, block := seedStoryboardScriptSource(t, db, 1)
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}

	line, err := service.CreateStoryboardLine(context.Background(), 1, StoryboardLineInput{
		StoryboardScriptID: storyboardScript.ID,
		ScriptBlockID:      &block.ID,
		Title:              "Phone clue",
		Kind:               "shot",
		Status:             "candidate",
	})
	if err != nil {
		t.Fatalf("create storyboard line: %v", err)
	}
	if line.ScriptBlockID == nil || *line.ScriptBlockID != block.ID {
		t.Fatalf("storyboard line script block id = %v, want %d", line.ScriptBlockID, block.ID)
	}

	items, err := service.ListStoryboardLines(context.Background(), StoryboardLineFilter{ProjectID: 1, ScriptBlockID: block.ID})
	if err != nil {
		t.Fatalf("list storyboard lines: %v", err)
	}
	if len(items) != 1 || items[0].ID != line.ID {
		t.Fatalf("storyboard lines = %+v, want only line %d", items, line.ID)
	}
	assertSemanticRelationExists(t, db, "storyboard_line", line.ID, "script_block", block.ID, model.EntityRelationTypeBasedOn)
}

func TestCreateStoryboardLineInheritsScriptBlockFromSceneMoment(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, version, segmentBlock := seedStoryboardScriptSource(t, db, 1)
	momentBlock := model.ScriptBlock{
		ProjectID:       1,
		ScriptID:        segmentBlock.ScriptID,
		ScriptVersionID: version.ID,
		Kind:            "action",
		Content:         "更具体的分镜来源。",
		StartLine:       1,
		EndLine:         1,
		Status:          "active",
	}
	if err := db.Create(&momentBlock).Error; err != nil {
		t.Fatalf("create moment script block: %v", err)
	}
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	segment := model.Segment{ProjectID: 1, ScriptBlockID: &segmentBlock.ID, Title: "Segment", Status: "confirmed"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	moment := model.SceneMoment{ProjectID: 1, SegmentID: &segment.ID, ScriptBlockID: &momentBlock.ID, Title: "Moment", Status: "confirmed"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}

	line, err := service.CreateStoryboardLine(context.Background(), 1, StoryboardLineInput{
		StoryboardScriptID: storyboardScript.ID,
		SegmentID:          &segment.ID,
		SceneMomentID:      &moment.ID,
		Title:              "Inherited line",
	})
	if err != nil {
		t.Fatalf("create storyboard line: %v", err)
	}
	if line.ScriptBlockID == nil || *line.ScriptBlockID != momentBlock.ID {
		t.Fatalf("storyboard line script block id = %v, want moment block %d", line.ScriptBlockID, momentBlock.ID)
	}
}

func TestCreateStoryboardLineRejectsSceneMomentFromDifferentSegment(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, version, firstBlock := seedStoryboardScriptSource(t, db, 1)
	secondBlock := model.ScriptBlock{ProjectID: 1, ScriptID: firstBlock.ScriptID, ScriptVersionID: firstBlock.ScriptVersionID, Kind: "action", Content: "另一段来源。", StartLine: 1, EndLine: 1, Status: "active"}
	if err := db.Create(&secondBlock).Error; err != nil {
		t.Fatalf("create second script block: %v", err)
	}
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	firstSegment := model.Segment{ProjectID: 1, ScriptBlockID: &firstBlock.ID, Title: "First", Status: "confirmed"}
	secondSegment := model.Segment{ProjectID: 1, ScriptBlockID: &secondBlock.ID, Title: "Second", Status: "confirmed"}
	if err := db.Create(&firstSegment).Error; err != nil {
		t.Fatalf("create first segment: %v", err)
	}
	if err := db.Create(&secondSegment).Error; err != nil {
		t.Fatalf("create second segment: %v", err)
	}
	moment := model.SceneMoment{ProjectID: 1, SegmentID: &firstSegment.ID, ScriptBlockID: &firstBlock.ID, Title: "Moment", Status: "confirmed"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}

	_, err := service.CreateStoryboardLine(context.Background(), 1, StoryboardLineInput{
		StoryboardScriptID: storyboardScript.ID,
		SegmentID:          &secondSegment.ID,
		SceneMomentID:      &moment.ID,
		Title:              "Mismatched line",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("CreateStoryboardLine() error = %v, want ErrInvalidInput", err)
	}
}

func TestCreateStoryboardLineRejectsScriptBlockFromDifferentScriptVersionThanSceneMoment(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, version, momentBlock := seedStoryboardScriptSource(t, db, 1)
	otherVersion := model.ScriptVersion{
		ProjectID:     1,
		ScriptID:      script.ID,
		VersionNumber: 2,
		Title:         "Pilot v2",
		SourceType:    "revised",
		Content:       "EXT. SHOP - DAY\n手机屏幕熄灭。",
		RawSource:     "EXT. SHOP - DAY\n手机屏幕熄灭。",
		Status:        "active",
	}
	if err := db.Create(&otherVersion).Error; err != nil {
		t.Fatalf("create other version: %v", err)
	}
	otherBlock := model.ScriptBlock{ProjectID: 1, ScriptID: script.ID, ScriptVersionID: otherVersion.ID, Kind: "action", Content: "手机屏幕熄灭。", StartLine: 2, EndLine: 2, Status: "active"}
	if err := db.Create(&otherBlock).Error; err != nil {
		t.Fatalf("create other block: %v", err)
	}
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	moment := model.SceneMoment{ProjectID: 1, ScriptBlockID: &momentBlock.ID, Title: "Moment", Status: "confirmed"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}

	_, err := service.CreateStoryboardLine(context.Background(), 1, StoryboardLineInput{
		StoryboardScriptID: storyboardScript.ID,
		SceneMomentID:      &moment.ID,
		ScriptBlockID:      &otherBlock.ID,
		Title:              "Cross-version line",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("CreateStoryboardLine() error = %v, want ErrInvalidInput", err)
	}
}

func TestPatchStoryboardLineInheritsScriptBlockFromNewSceneMoment(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, version, firstBlock := seedStoryboardScriptSource(t, db, 1)
	secondBlock := model.ScriptBlock{ProjectID: 1, ScriptID: firstBlock.ScriptID, ScriptVersionID: version.ID, Kind: "action", Content: "新的分镜来源。", StartLine: 1, EndLine: 1, Status: "active"}
	if err := db.Create(&secondBlock).Error; err != nil {
		t.Fatalf("create second script block: %v", err)
	}
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	firstMoment := model.SceneMoment{ProjectID: 1, ScriptBlockID: &firstBlock.ID, Title: "First", Status: "confirmed"}
	secondMoment := model.SceneMoment{ProjectID: 1, ScriptBlockID: &secondBlock.ID, Title: "Second", Status: "confirmed"}
	if err := db.Create(&firstMoment).Error; err != nil {
		t.Fatalf("create first scene moment: %v", err)
	}
	if err := db.Create(&secondMoment).Error; err != nil {
		t.Fatalf("create second scene moment: %v", err)
	}
	line := model.StoryboardLine{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, SceneMomentID: &firstMoment.ID, ScriptBlockID: &firstBlock.ID, Title: "Line", Status: "candidate"}
	if err := db.Create(&line).Error; err != nil {
		t.Fatalf("create storyboard line: %v", err)
	}

	patched, err := service.PatchStoryboardLine(context.Background(), 1, strconv.FormatUint(uint64(line.ID), 10), StoryboardLineInput{
		StoryboardScriptID: storyboardScript.ID,
		SceneMomentID:      &secondMoment.ID,
		Title:              "Moved line",
		Status:             "candidate",
	})
	if err != nil {
		t.Fatalf("patch storyboard line: %v", err)
	}
	if patched.ScriptBlockID == nil || *patched.ScriptBlockID != secondBlock.ID {
		t.Fatalf("patched storyboard line script block id = %v, want %d", patched.ScriptBlockID, secondBlock.ID)
	}
}

func TestPatchStoryboardLineRejectsSourceChangeAfterContentUnitCreated(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, version, firstBlock := seedStoryboardScriptSource(t, db, 1)
	secondBlock := model.ScriptBlock{ProjectID: 1, ScriptID: firstBlock.ScriptID, ScriptVersionID: version.ID, Kind: "action", Content: "新的分镜来源。", StartLine: 1, EndLine: 1, Status: "active"}
	if err := db.Create(&secondBlock).Error; err != nil {
		t.Fatalf("create second script block: %v", err)
	}
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	line := model.StoryboardLine{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, ScriptBlockID: &firstBlock.ID, Title: "Line", Status: "candidate"}
	if err := db.Create(&line).Error; err != nil {
		t.Fatalf("create storyboard line: %v", err)
	}
	unit := model.ContentUnit{ProjectID: 1, StoryboardLineID: &line.ID, ScriptBlockID: &firstBlock.ID, Title: "Compiled", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}

	_, err := service.PatchStoryboardLine(context.Background(), 1, strconv.FormatUint(uint64(line.ID), 10), StoryboardLineInput{
		StoryboardScriptID: storyboardScript.ID,
		ScriptBlockID:      &secondBlock.ID,
		Title:              "Moved line",
		Status:             "candidate",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchStoryboardLine() error = %v, want ErrInvalidInput", err)
	}

	var persisted model.StoryboardLine
	if err := db.First(&persisted, line.ID).Error; err != nil {
		t.Fatalf("load storyboard line: %v", err)
	}
	if persisted.ScriptBlockID == nil || *persisted.ScriptBlockID != firstBlock.ID {
		t.Fatalf("storyboard line script block changed to %v, want %d", persisted.ScriptBlockID, firstBlock.ID)
	}
}

func TestPatchStoryboardLineAllowsTextChangeAfterContentUnitCreated(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, version, block := seedStoryboardScriptSource(t, db, 1)
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	line := model.StoryboardLine{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, ScriptBlockID: &block.ID, Title: "Line", Status: "candidate"}
	if err := db.Create(&line).Error; err != nil {
		t.Fatalf("create storyboard line: %v", err)
	}
	unit := model.ContentUnit{ProjectID: 1, StoryboardLineID: &line.ID, ScriptBlockID: &block.ID, Title: "Compiled", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}

	patched, err := service.PatchStoryboardLine(context.Background(), 1, strconv.FormatUint(uint64(line.ID), 10), StoryboardLineInput{
		StoryboardScriptID: storyboardScript.ID,
		ScriptBlockID:      &block.ID,
		Title:              "Retitled line",
		Description:        "Updated description",
		Status:             "confirmed",
	})
	if err != nil {
		t.Fatalf("patch storyboard line: %v", err)
	}
	if patched.Title != "Retitled line" || patched.Description != "Updated description" || patched.Status != "confirmed" {
		t.Fatalf("patched storyboard line = %+v, want text/status updates", patched)
	}
	if patched.ScriptBlockID == nil || *patched.ScriptBlockID != block.ID {
		t.Fatalf("patched storyboard line script block id = %v, want %d", patched.ScriptBlockID, block.ID)
	}
}

func TestPatchStoryboardScriptAllowsSourceChangeBeforeDerivedItems(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, firstVersion, _ := seedStoryboardScriptSource(t, db, 1)
	secondVersion := model.ScriptVersion{
		ProjectID:     1,
		ScriptID:      script.ID,
		VersionNumber: 2,
		Title:         "Pilot v2",
		SourceType:    "revised",
		Content:       "EXT. SHOP - DAY\n手机屏幕熄灭。",
		RawSource:     "EXT. SHOP - DAY\n手机屏幕熄灭。",
		Status:        "active",
	}
	if err := db.Create(&secondVersion).Error; err != nil {
		t.Fatalf("create second script version: %v", err)
	}
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}

	patched, err := service.PatchStoryboardScript(context.Background(), 1, strconv.FormatUint(uint64(storyboardScript.ID), 10), StoryboardScriptInput{
		ScriptVersionID: &secondVersion.ID,
		Name:            "Storyboard v2",
		Status:          "draft",
	})
	if err != nil {
		t.Fatalf("PatchStoryboardScript() error = %v", err)
	}
	if patched.ScriptVersionID == nil || *patched.ScriptVersionID != secondVersion.ID {
		t.Fatalf("script version id = %v, want %d", patched.ScriptVersionID, secondVersion.ID)
	}
}

func TestPatchStoryboardScriptRejectsSourceChangeAfterVersionCreated(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, firstVersion, _ := seedStoryboardScriptSource(t, db, 1)
	secondVersion := model.ScriptVersion{
		ProjectID:     1,
		ScriptID:      script.ID,
		VersionNumber: 2,
		Title:         "Pilot v2",
		SourceType:    "revised",
		Content:       "EXT. SHOP - DAY\n手机屏幕熄灭。",
		RawSource:     "EXT. SHOP - DAY\n手机屏幕熄灭。",
		Status:        "active",
	}
	if err := db.Create(&secondVersion).Error; err != nil {
		t.Fatalf("create second script version: %v", err)
	}
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	storyboardVersion := model.StoryboardVersion{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, VersionNumber: 1, Title: "Storyboard v1", Source: "manual", Status: "active"}
	if err := db.Create(&storyboardVersion).Error; err != nil {
		t.Fatalf("create storyboard version: %v", err)
	}

	_, err := service.PatchStoryboardScript(context.Background(), 1, strconv.FormatUint(uint64(storyboardScript.ID), 10), StoryboardScriptInput{
		ScriptVersionID: &secondVersion.ID,
		Name:            "Moved source",
		Status:          "draft",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchStoryboardScript() error = %v, want ErrInvalidInput", err)
	}

	var persisted model.StoryboardScript
	if err := db.First(&persisted, storyboardScript.ID).Error; err != nil {
		t.Fatalf("load storyboard script: %v", err)
	}
	if persisted.ScriptVersionID == nil || *persisted.ScriptVersionID != firstVersion.ID {
		t.Fatalf("script version changed to %v, want %d", persisted.ScriptVersionID, firstVersion.ID)
	}
}

func TestPatchStoryboardScriptRejectsSourceChangeAfterLineCreatedButAllowsMetadata(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, firstVersion, block := seedStoryboardScriptSource(t, db, 1)
	secondVersion := model.ScriptVersion{
		ProjectID:     1,
		ScriptID:      script.ID,
		VersionNumber: 2,
		Title:         "Pilot v2",
		SourceType:    "revised",
		Content:       "EXT. SHOP - DAY\n手机屏幕熄灭。",
		RawSource:     "EXT. SHOP - DAY\n手机屏幕熄灭。",
		Status:        "active",
	}
	if err := db.Create(&secondVersion).Error; err != nil {
		t.Fatalf("create second script version: %v", err)
	}
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	line := model.StoryboardLine{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, ScriptBlockID: &block.ID, Title: "Line", Status: "candidate"}
	if err := db.Create(&line).Error; err != nil {
		t.Fatalf("create storyboard line: %v", err)
	}

	_, err := service.PatchStoryboardScript(context.Background(), 1, strconv.FormatUint(uint64(storyboardScript.ID), 10), StoryboardScriptInput{
		ScriptVersionID: &secondVersion.ID,
		Name:            "Moved source",
		Status:          "draft",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchStoryboardScript() error = %v, want ErrInvalidInput", err)
	}

	patched, err := service.PatchStoryboardScript(context.Background(), 1, strconv.FormatUint(uint64(storyboardScript.ID), 10), StoryboardScriptInput{
		ScriptVersionID: &firstVersion.ID,
		Name:            "Retitled storyboard",
		Description:     "Updated notes",
		Status:          "active",
	})
	if err != nil {
		t.Fatalf("PatchStoryboardScript() metadata error = %v", err)
	}
	if patched.Name != "Retitled storyboard" || patched.Description != "Updated notes" || patched.Status != "active" {
		t.Fatalf("patched storyboard script = %+v, want metadata updates", patched)
	}
	if patched.ScriptVersionID == nil || *patched.ScriptVersionID != firstVersion.ID {
		t.Fatalf("script version id = %v, want %d", patched.ScriptVersionID, firstVersion.ID)
	}
}

func TestStoryboardVersionIsImmutableAfterCreate(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, version, _ := seedStoryboardScriptSource(t, db, 1)
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	storyboardVersion := model.StoryboardVersion{
		ProjectID:          1,
		StoryboardScriptID: storyboardScript.ID,
		VersionNumber:      1,
		Title:              "Storyboard v1",
		Source:             "manual",
		Status:             "active",
		SnapshotJSON:       `{"lines":[]}`,
	}
	if err := db.Create(&storyboardVersion).Error; err != nil {
		t.Fatalf("create storyboard version: %v", err)
	}

	_, err := service.PatchStoryboardVersion(context.Background(), 1, strconv.FormatUint(uint64(storyboardVersion.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("PatchStoryboardVersion() error = %v, want ErrForbidden", err)
	}

	var persisted model.StoryboardVersion
	if err := db.First(&persisted, storyboardVersion.ID).Error; err != nil {
		t.Fatalf("load storyboard version: %v", err)
	}
	if persisted.Title != storyboardVersion.Title || persisted.Status != storyboardVersion.Status || persisted.SnapshotJSON != storyboardVersion.SnapshotJSON {
		t.Fatalf("storyboard version changed despite immutable rule: %+v", persisted)
	}
}

func TestCreateStoryboardVersionAssignsVersionNumberServerSide(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	_, scriptVersion, _ := seedStoryboardScriptSource(t, db, 1)
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &scriptVersion.ID, Name: "Storyboard", Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	first := model.StoryboardVersion{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, VersionNumber: 1, Title: "First v1", Source: "manual", Status: "active"}
	if err := db.Create(&first).Error; err != nil {
		t.Fatalf("create storyboard version: %v", err)
	}

	created, err := service.CreateStoryboardVersion(context.Background(), 1, StoryboardVersionInput{
		StoryboardScriptID: storyboardScript.ID,
		Title:              "Next",
		Status:             "active",
	})
	if err != nil {
		t.Fatalf("CreateStoryboardVersion() error = %v", err)
	}
	if created.VersionNumber != 2 {
		t.Fatalf("version number = %d, want server-assigned 2", created.VersionNumber)
	}
}

func TestStoryboardVersionCannotBeDeletedByKind(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, version, _ := seedStoryboardScriptSource(t, db, 1)
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	storyboardVersion := model.StoryboardVersion{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, VersionNumber: 1, Title: "Storyboard v1", Source: "manual", Status: "active"}
	if err := db.Create(&storyboardVersion).Error; err != nil {
		t.Fatalf("create storyboard version: %v", err)
	}

	err := service.DeleteItemByKind(context.Background(), 1, "storyboard_version", strconv.FormatUint(uint64(storyboardVersion.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("DeleteItemByKind() error = %v, want ErrForbidden", err)
	}

	var count int64
	if err := db.Model(&model.StoryboardVersion{}).Where("id = ?", storyboardVersion.ID).Count(&count).Error; err != nil {
		t.Fatalf("count storyboard versions: %v", err)
	}
	if count != 1 {
		t.Fatalf("storyboard versions after delete = %d, want 1", count)
	}
}

func TestCreateStoryboardVersionRejectsParentFromDifferentScript(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	_, scriptVersion, _ := seedStoryboardScriptSource(t, db, 1)
	firstScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &scriptVersion.ID, Name: "First", Status: "draft"}
	secondScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &scriptVersion.ID, Name: "Second", Status: "draft"}
	if err := db.Create(&firstScript).Error; err != nil {
		t.Fatalf("create first storyboard script: %v", err)
	}
	if err := db.Create(&secondScript).Error; err != nil {
		t.Fatalf("create second storyboard script: %v", err)
	}
	parent := model.StoryboardVersion{ProjectID: 1, StoryboardScriptID: firstScript.ID, VersionNumber: 1, Title: "First v1", Source: "manual", Status: "active"}
	if err := db.Create(&parent).Error; err != nil {
		t.Fatalf("create parent storyboard version: %v", err)
	}

	_, err := service.CreateStoryboardVersion(context.Background(), 1, StoryboardVersionInput{
		StoryboardScriptID: secondScript.ID,
		ParentVersionID:    &parent.ID,
		Title:              "Second v2",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("CreateStoryboardVersion() error = %v, want ErrInvalidInput", err)
	}
}

func TestCreateStoryboardLineRejectsVersionFromDifferentStoryboardScript(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	_, scriptVersion, _ := seedStoryboardScriptSource(t, db, 1)
	firstScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &scriptVersion.ID, Name: "First", Status: "draft"}
	secondScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &scriptVersion.ID, Name: "Second", Status: "draft"}
	if err := db.Create(&firstScript).Error; err != nil {
		t.Fatalf("create first storyboard script: %v", err)
	}
	if err := db.Create(&secondScript).Error; err != nil {
		t.Fatalf("create second storyboard script: %v", err)
	}
	storyboardVersion := model.StoryboardVersion{ProjectID: 1, StoryboardScriptID: firstScript.ID, VersionNumber: 1, Title: "First v1", Source: "manual", Status: "active"}
	if err := db.Create(&storyboardVersion).Error; err != nil {
		t.Fatalf("create storyboard version: %v", err)
	}

	_, err := service.CreateStoryboardLine(context.Background(), 1, StoryboardLineInput{
		StoryboardScriptID:  secondScript.ID,
		StoryboardVersionID: &storyboardVersion.ID,
		Title:               "Mismatched line",
	})
	if !errors.Is(err, ErrOwnerWrongProject) {
		t.Fatalf("CreateStoryboardLine() error = %v, want ErrOwnerWrongProject", err)
	}
}

func TestDeleteStoryboardScriptRejectsDownstreamItems(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, version, block := seedStoryboardScriptSource(t, db, 1)
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	storyboardVersion := model.StoryboardVersion{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, Title: "v1", Status: "draft"}
	if err := db.Create(&storyboardVersion).Error; err != nil {
		t.Fatalf("create storyboard version: %v", err)
	}
	line := model.StoryboardLine{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, ScriptBlockID: &block.ID, Title: "Line", Status: "confirmed"}
	if err := db.Create(&line).Error; err != nil {
		t.Fatalf("create storyboard line: %v", err)
	}

	err := service.DeleteItemByKind(context.Background(), 1, "storyboard_script", strconv.FormatUint(uint64(storyboardScript.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("DeleteItemByKind() error = %v, want ErrForbidden", err)
	}

	var count int64
	if err := db.Model(&model.StoryboardScript{}).Where("id = ?", storyboardScript.ID).Count(&count).Error; err != nil {
		t.Fatalf("count storyboard script: %v", err)
	}
	if count != 1 {
		t.Fatalf("storyboard script count = %d, want 1", count)
	}
}

func newStoryboardTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "storyboard.db")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&model.EntityRelation{},
		&model.Script{},
		&model.ScriptVersion{},
		&model.ScriptBlock{},
		&model.Segment{},
		&model.SceneMoment{},
		&model.StoryboardScript{},
		&model.StoryboardVersion{},
		&model.StoryboardLine{},
		&model.ContentUnit{},
		&model.AssetSlot{},
	); err != nil {
		t.Fatalf("migrate storyboard db: %v", err)
	}
	return db
}

func seedStoryboardScriptSource(t *testing.T, db *gorm.DB, projectID uint) (model.Script, model.ScriptVersion, model.ScriptBlock) {
	t.Helper()
	content := "INT. SHOP - NIGHT\n手机屏幕亮起。"
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
	block := model.ScriptBlock{
		ProjectID:       projectID,
		ScriptID:        script.ID,
		ScriptVersionID: version.ID,
		Kind:            "action",
		Content:         "手机屏幕亮起。",
		StartLine:       2,
		EndLine:         2,
		Status:          "active",
	}
	if err := db.Create(&block).Error; err != nil {
		t.Fatalf("create script block: %v", err)
	}
	return script, version, block
}

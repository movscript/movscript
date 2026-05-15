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

func TestCreateContentUnitInheritsScriptBlockFromSegment(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	script, version, block := seedContentUnitScriptSource(t, db, 1)
	segment := model.Segment{
		ProjectID:     1,
		ScriptBlockID: &block.ID,
		Kind:          "dramatic_function",
		Title:         "Opening",
		Status:        "confirmed",
	}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}

	unit, err := service.CreateContentUnit(context.Background(), 1, ContentUnitInput{
		SegmentID: &segment.ID,
		Kind:      "shot",
		Title:     "Phone close-up",
		Status:    "candidate",
	})
	if err != nil {
		t.Fatalf("create content unit: %v", err)
	}
	if unit.ScriptBlockID == nil || *unit.ScriptBlockID != block.ID {
		t.Fatalf("content unit script block id = %v, want %d; script %d version %d", unit.ScriptBlockID, block.ID, script.ID, version.ID)
	}
}

func TestCreateContentUnitInheritsScriptBlockFromSceneMomentSegment(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, _, block := seedContentUnitScriptSource(t, db, 1)
	segment := model.Segment{
		ProjectID:     1,
		ScriptBlockID: &block.ID,
		Kind:          "dramatic_function",
		Title:         "Opening",
		Status:        "confirmed",
	}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	moment := model.SceneMoment{
		ProjectID: 1,
		SegmentID: &segment.ID,
		Title:     "Phone clue",
		Status:    "confirmed",
	}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}

	unit, err := service.CreateContentUnit(context.Background(), 1, ContentUnitInput{
		SceneMomentID: &moment.ID,
		Kind:          "shot",
		Title:         "Phone close-up",
		Status:        "candidate",
	})
	if err != nil {
		t.Fatalf("create content unit: %v", err)
	}
	if unit.ScriptBlockID == nil || *unit.ScriptBlockID != block.ID {
		t.Fatalf("content unit script block id = %v, want %d", unit.ScriptBlockID, block.ID)
	}
}

func TestCreateSceneMomentInheritsScriptBlockFromSegment(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, _, block := seedContentUnitScriptSource(t, db, 1)
	segment := model.Segment{
		ProjectID:     1,
		ScriptBlockID: &block.ID,
		Kind:          "dramatic_function",
		Title:         "Opening",
		Status:        "confirmed",
	}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}

	moment, err := service.CreateSceneMoment(context.Background(), 1, CreateSceneMomentInput{
		SegmentID: &segment.ID,
		Title:     "Phone clue",
		Status:    "confirmed",
	})
	if err != nil {
		t.Fatalf("create scene moment: %v", err)
	}
	if moment.ScriptBlockID == nil || *moment.ScriptBlockID != block.ID {
		t.Fatalf("scene moment script block id = %v, want %d", moment.ScriptBlockID, block.ID)
	}
}

func TestCreateContentUnitPrefersSceneMomentScriptBlock(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, version, segmentBlock := seedContentUnitScriptSource(t, db, 1)
	momentBlock := model.ScriptBlock{
		ProjectID:       1,
		ScriptID:        segmentBlock.ScriptID,
		ScriptVersionID: version.ID,
		Kind:            "dialogue",
		Content:         "更精确的情节来源。",
		StartLine:       1,
		EndLine:         1,
		Status:          "active",
	}
	if err := db.Create(&momentBlock).Error; err != nil {
		t.Fatalf("create moment script block: %v", err)
	}
	segment := model.Segment{
		ProjectID:     1,
		ScriptBlockID: &segmentBlock.ID,
		Kind:          "dramatic_function",
		Title:         "Opening",
		Status:        "confirmed",
	}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	moment := model.SceneMoment{
		ProjectID:     1,
		SegmentID:     &segment.ID,
		ScriptBlockID: &momentBlock.ID,
		Title:         "Phone clue",
		Status:        "confirmed",
	}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}

	unit, err := service.CreateContentUnit(context.Background(), 1, ContentUnitInput{
		SceneMomentID: &moment.ID,
		Kind:          "shot",
		Title:         "Phone close-up",
		Status:        "candidate",
	})
	if err != nil {
		t.Fatalf("create content unit: %v", err)
	}
	if unit.ScriptBlockID == nil || *unit.ScriptBlockID != momentBlock.ID {
		t.Fatalf("content unit script block id = %v, want moment block %d", unit.ScriptBlockID, momentBlock.ID)
	}
}

func TestCreateContentUnitRejectsSceneMomentFromDifferentSegment(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, _, firstBlock := seedContentUnitScriptSource(t, db, 1)
	secondBlock := model.ScriptBlock{
		ProjectID:       1,
		ScriptID:        firstBlock.ScriptID,
		ScriptVersionID: firstBlock.ScriptVersionID,
		Kind:            "action",
		Content:         "另一段来源。",
		StartLine:       1,
		EndLine:         1,
		Status:          "active",
	}
	if err := db.Create(&secondBlock).Error; err != nil {
		t.Fatalf("create second script block: %v", err)
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

	_, err := service.CreateContentUnit(context.Background(), 1, ContentUnitInput{
		SegmentID:     &secondSegment.ID,
		SceneMomentID: &moment.ID,
		Title:         "Mismatched content unit",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("CreateContentUnit() error = %v, want ErrInvalidInput", err)
	}
}

func TestCreateSceneMomentRejectsScriptBlockFromDifferentScriptVersionThanSegment(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	script, _, segmentBlock := seedContentUnitScriptSource(t, db, 1)
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
	otherBlock := model.ScriptBlock{
		ProjectID:       1,
		ScriptID:        script.ID,
		ScriptVersionID: otherVersion.ID,
		Kind:            "action",
		Content:         "手机屏幕熄灭。",
		StartLine:       2,
		EndLine:         2,
		Status:          "active",
	}
	if err := db.Create(&otherBlock).Error; err != nil {
		t.Fatalf("create other block: %v", err)
	}
	segment := model.Segment{ProjectID: 1, ScriptBlockID: &segmentBlock.ID, Title: "Segment", Status: "confirmed"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}

	_, err := service.CreateSceneMoment(context.Background(), 1, CreateSceneMomentInput{
		SegmentID:     &segment.ID,
		ScriptBlockID: &otherBlock.ID,
		Title:         "Cross-version moment",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("CreateSceneMoment() error = %v, want ErrInvalidInput", err)
	}
}

func TestCreateContentUnitRejectsScriptBlockFromDifferentScriptVersionThanSceneMoment(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	script, _, momentBlock := seedContentUnitScriptSource(t, db, 1)
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
	otherBlock := model.ScriptBlock{
		ProjectID:       1,
		ScriptID:        script.ID,
		ScriptVersionID: otherVersion.ID,
		Kind:            "action",
		Content:         "手机屏幕熄灭。",
		StartLine:       2,
		EndLine:         2,
		Status:          "active",
	}
	if err := db.Create(&otherBlock).Error; err != nil {
		t.Fatalf("create other block: %v", err)
	}
	moment := model.SceneMoment{ProjectID: 1, ScriptBlockID: &momentBlock.ID, Title: "Moment", Status: "confirmed"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}

	_, err := service.CreateContentUnit(context.Background(), 1, ContentUnitInput{
		SceneMomentID: &moment.ID,
		ScriptBlockID: &otherBlock.ID,
		Title:         "Cross-version content unit",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("CreateContentUnit() error = %v, want ErrInvalidInput", err)
	}
}

func TestPatchSceneMomentInheritsScriptBlockFromNewSegment(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, version, firstBlock := seedContentUnitScriptSource(t, db, 1)
	secondBlock := model.ScriptBlock{ProjectID: 1, ScriptID: firstBlock.ScriptID, ScriptVersionID: version.ID, Kind: "action", Content: "新的来源。", StartLine: 1, EndLine: 1, Status: "active"}
	if err := db.Create(&secondBlock).Error; err != nil {
		t.Fatalf("create second script block: %v", err)
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

	patched, err := service.PatchSceneMoment(context.Background(), 1, strconv.FormatUint(uint64(moment.ID), 10), PatchSceneMomentInput{
		SegmentID: &secondSegment.ID,
		Title:     "Moved moment",
	})
	if err != nil {
		t.Fatalf("patch scene moment: %v", err)
	}
	if patched.ScriptBlockID == nil || *patched.ScriptBlockID != secondBlock.ID {
		t.Fatalf("patched scene moment script block id = %v, want %d", patched.ScriptBlockID, secondBlock.ID)
	}
}

func TestPatchSegmentRejectsSourceChangeAfterSceneMoments(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, version, firstBlock := seedContentUnitScriptSource(t, db, 1)
	secondBlock := model.ScriptBlock{ProjectID: 1, ScriptID: firstBlock.ScriptID, ScriptVersionID: version.ID, Kind: "action", Content: "新的来源。", StartLine: 1, EndLine: 1, Status: "active"}
	if err := db.Create(&secondBlock).Error; err != nil {
		t.Fatalf("create second script block: %v", err)
	}
	segment := model.Segment{ProjectID: 1, ScriptBlockID: &firstBlock.ID, Title: "Segment", Status: "confirmed"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	moment := model.SceneMoment{ProjectID: 1, SegmentID: &segment.ID, ScriptBlockID: &firstBlock.ID, Title: "Moment", Status: "confirmed"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}

	_, err := service.PatchSegment(context.Background(), 1, strconv.FormatUint(uint64(segment.ID), 10), PatchSegmentInput{
		ScriptBlockID: &secondBlock.ID,
		Title:         "Moved segment",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchSegment() error = %v, want ErrInvalidInput", err)
	}

	var persisted model.Segment
	if err := db.First(&persisted, segment.ID).Error; err != nil {
		t.Fatalf("load segment: %v", err)
	}
	if persisted.ScriptBlockID == nil || *persisted.ScriptBlockID != firstBlock.ID {
		t.Fatalf("segment script block changed to %v, want %d", persisted.ScriptBlockID, firstBlock.ID)
	}
}

func TestPatchSegmentAllowsMetadataAfterSceneMoments(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, _, block := seedContentUnitScriptSource(t, db, 1)
	segment := model.Segment{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Segment", Status: "draft"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	moment := model.SceneMoment{ProjectID: 1, SegmentID: &segment.ID, ScriptBlockID: &block.ID, Title: "Moment", Status: "confirmed"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}

	patched, err := service.PatchSegment(context.Background(), 1, strconv.FormatUint(uint64(segment.ID), 10), PatchSegmentInput{
		Title:   "Renamed segment",
		Summary: "Updated summary",
		Status:  "confirmed",
	})
	if err != nil {
		t.Fatalf("PatchSegment() error = %v", err)
	}
	if patched.Title != "Renamed segment" || patched.Summary != "Updated summary" || patched.Status != "confirmed" {
		t.Fatalf("patched segment = %+v, want metadata updates", patched)
	}
	if patched.ScriptBlockID == nil || *patched.ScriptBlockID != block.ID {
		t.Fatalf("script block id = %v, want %d", patched.ScriptBlockID, block.ID)
	}
}

func TestSourceLockStatusReportsSegmentLockedFields(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, _, block := seedContentUnitScriptSource(t, db, 1)
	segment := model.Segment{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Segment", Status: "confirmed"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	moment := model.SceneMoment{ProjectID: 1, SegmentID: &segment.ID, ScriptBlockID: &block.ID, Title: "Moment", Status: "confirmed"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}

	status, err := service.SourceLockStatus(context.Background(), 1, "segments", strconv.FormatUint(uint64(segment.ID), 10))
	if err != nil {
		t.Fatalf("SourceLockStatus() error = %v", err)
	}
	if !status.Locked {
		t.Fatalf("source lock status not locked: %+v", status)
	}
	assertStringSliceContains(t, status.LockedFields, "script_block_id")
	assertStringSliceContains(t, status.LockedFields, "production_id")
	if len(status.Reasons) != 1 || status.Reasons[0].EntityKind != "scene_moment" || status.Reasons[0].Count != 1 {
		t.Fatalf("source lock reasons = %+v, want one scene_moment reason", status.Reasons)
	}
}

func TestDeleteSegmentRejectsDownstreamSceneMoments(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, _, block := seedContentUnitScriptSource(t, db, 1)
	segment := model.Segment{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Segment", Status: "confirmed"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	moment := model.SceneMoment{ProjectID: 1, SegmentID: &segment.ID, ScriptBlockID: &block.ID, Title: "Moment", Status: "confirmed"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}

	err := service.DeleteItemByKind(context.Background(), 1, "segment", strconv.FormatUint(uint64(segment.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("DeleteItemByKind() error = %v, want ErrForbidden", err)
	}

	var count int64
	if err := db.Model(&model.Segment{}).Where("id = ?", segment.ID).Count(&count).Error; err != nil {
		t.Fatalf("count segment: %v", err)
	}
	if count != 1 {
		t.Fatalf("segment count = %d, want 1", count)
	}
}

func TestPatchSceneMomentRejectsSourceChangeAfterContentUnits(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, version, firstBlock := seedContentUnitScriptSource(t, db, 1)
	secondBlock := model.ScriptBlock{ProjectID: 1, ScriptID: firstBlock.ScriptID, ScriptVersionID: version.ID, Kind: "action", Content: "新的来源。", StartLine: 1, EndLine: 1, Status: "active"}
	if err := db.Create(&secondBlock).Error; err != nil {
		t.Fatalf("create second script block: %v", err)
	}
	moment := model.SceneMoment{ProjectID: 1, ScriptBlockID: &firstBlock.ID, Title: "Moment", Status: "confirmed"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}
	unit := model.ContentUnit{ProjectID: 1, SceneMomentID: &moment.ID, ScriptBlockID: &firstBlock.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}

	_, err := service.PatchSceneMoment(context.Background(), 1, strconv.FormatUint(uint64(moment.ID), 10), PatchSceneMomentInput{
		ScriptBlockID: &secondBlock.ID,
		Title:         "Moved moment",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchSceneMoment() error = %v, want ErrInvalidInput", err)
	}

	var persisted model.SceneMoment
	if err := db.First(&persisted, moment.ID).Error; err != nil {
		t.Fatalf("load scene moment: %v", err)
	}
	if persisted.ScriptBlockID == nil || *persisted.ScriptBlockID != firstBlock.ID {
		t.Fatalf("scene moment script block changed to %v, want %d", persisted.ScriptBlockID, firstBlock.ID)
	}
}

func TestDeleteSceneMomentRejectsDownstreamContentUnits(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, _, block := seedContentUnitScriptSource(t, db, 1)
	moment := model.SceneMoment{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Moment", Status: "confirmed"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}
	unit := model.ContentUnit{ProjectID: 1, SceneMomentID: &moment.ID, ScriptBlockID: &block.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}

	err := service.DeleteItemByKind(context.Background(), 1, "scene_moment", strconv.FormatUint(uint64(moment.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("DeleteItemByKind() error = %v, want ErrForbidden", err)
	}

	var count int64
	if err := db.Model(&model.SceneMoment{}).Where("id = ?", moment.ID).Count(&count).Error; err != nil {
		t.Fatalf("count scene moment: %v", err)
	}
	if count != 1 {
		t.Fatalf("scene moment count = %d, want 1", count)
	}
}

func TestPatchSceneMomentAllowsMetadataAfterContentUnits(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, _, block := seedContentUnitScriptSource(t, db, 1)
	moment := model.SceneMoment{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Moment", Status: "draft"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}
	unit := model.ContentUnit{ProjectID: 1, SceneMomentID: &moment.ID, ScriptBlockID: &block.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}

	patched, err := service.PatchSceneMoment(context.Background(), 1, strconv.FormatUint(uint64(moment.ID), 10), PatchSceneMomentInput{
		Title:       "Renamed moment",
		Description: "Updated description",
		Status:      "confirmed",
	})
	if err != nil {
		t.Fatalf("PatchSceneMoment() error = %v", err)
	}
	if patched.Title != "Renamed moment" || patched.Description != "Updated description" || patched.Status != "confirmed" {
		t.Fatalf("patched scene moment = %+v, want metadata updates", patched)
	}
	if patched.ScriptBlockID == nil || *patched.ScriptBlockID != block.ID {
		t.Fatalf("script block id = %v, want %d", patched.ScriptBlockID, block.ID)
	}
}

func TestSourceLockStatusReportsUnlockedSceneMoment(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, _, block := seedContentUnitScriptSource(t, db, 1)
	moment := model.SceneMoment{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Moment", Status: "draft"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}

	status, err := service.SourceLockStatus(context.Background(), 1, "scene-moments", strconv.FormatUint(uint64(moment.ID), 10))
	if err != nil {
		t.Fatalf("SourceLockStatus() error = %v", err)
	}
	if status.Locked || len(status.LockedFields) != 0 || len(status.Reasons) != 0 {
		t.Fatalf("source lock status = %+v, want unlocked", status)
	}
}

func TestPatchContentUnitInheritsScriptBlockFromNewSceneMoment(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, version, firstBlock := seedContentUnitScriptSource(t, db, 1)
	secondBlock := model.ScriptBlock{ProjectID: 1, ScriptID: firstBlock.ScriptID, ScriptVersionID: version.ID, Kind: "action", Content: "新的来源。", StartLine: 1, EndLine: 1, Status: "active"}
	if err := db.Create(&secondBlock).Error; err != nil {
		t.Fatalf("create second script block: %v", err)
	}
	firstMoment := model.SceneMoment{ProjectID: 1, ScriptBlockID: &firstBlock.ID, Title: "First moment", Status: "confirmed"}
	secondMoment := model.SceneMoment{ProjectID: 1, ScriptBlockID: &secondBlock.ID, Title: "Second moment", Status: "confirmed"}
	if err := db.Create(&firstMoment).Error; err != nil {
		t.Fatalf("create first scene moment: %v", err)
	}
	if err := db.Create(&secondMoment).Error; err != nil {
		t.Fatalf("create second scene moment: %v", err)
	}
	unit := model.ContentUnit{ProjectID: 1, SceneMomentID: &firstMoment.ID, ScriptBlockID: &firstBlock.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}

	patched, err := service.PatchContentUnit(context.Background(), 1, strconv.FormatUint(uint64(unit.ID), 10), ContentUnitInput{
		SceneMomentID: &secondMoment.ID,
		Title:         "Moved unit",
	})
	if err != nil {
		t.Fatalf("patch content unit: %v", err)
	}
	if patched.ScriptBlockID == nil || *patched.ScriptBlockID != secondBlock.ID {
		t.Fatalf("patched content unit script block id = %v, want %d", patched.ScriptBlockID, secondBlock.ID)
	}
}

func TestPatchContentUnitRejectsSourceChangeAfterKeyframes(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, version, firstBlock := seedContentUnitScriptSource(t, db, 1)
	secondBlock := model.ScriptBlock{ProjectID: 1, ScriptID: firstBlock.ScriptID, ScriptVersionID: version.ID, Kind: "action", Content: "新的来源。", StartLine: 1, EndLine: 1, Status: "active"}
	if err := db.Create(&secondBlock).Error; err != nil {
		t.Fatalf("create second script block: %v", err)
	}
	unit := model.ContentUnit{ProjectID: 1, ScriptBlockID: &firstBlock.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}
	keyframe := model.Keyframe{ProjectID: 1, ContentUnitID: &unit.ID, Title: "Keyframe", Status: "candidate"}
	if err := db.Create(&keyframe).Error; err != nil {
		t.Fatalf("create keyframe: %v", err)
	}

	_, err := service.PatchContentUnit(context.Background(), 1, strconv.FormatUint(uint64(unit.ID), 10), ContentUnitInput{
		ScriptBlockID: &secondBlock.ID,
		Title:         "Moved unit",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchContentUnit() error = %v, want ErrInvalidInput", err)
	}

	var persisted model.ContentUnit
	if err := db.First(&persisted, unit.ID).Error; err != nil {
		t.Fatalf("load content unit: %v", err)
	}
	if persisted.ScriptBlockID == nil || *persisted.ScriptBlockID != firstBlock.ID {
		t.Fatalf("content unit script block changed to %v, want %d", persisted.ScriptBlockID, firstBlock.ID)
	}
}

func TestPatchContentUnitAllowsMetadataAfterKeyframes(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, _, block := seedContentUnitScriptSource(t, db, 1)
	unit := model.ContentUnit{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}
	keyframe := model.Keyframe{ProjectID: 1, ContentUnitID: &unit.ID, Title: "Keyframe", Status: "candidate"}
	if err := db.Create(&keyframe).Error; err != nil {
		t.Fatalf("create keyframe: %v", err)
	}

	patched, err := service.PatchContentUnit(context.Background(), 1, strconv.FormatUint(uint64(unit.ID), 10), ContentUnitInput{
		Title:       "Renamed unit",
		Description: "Updated description",
		Prompt:      "Updated prompt",
		Status:      "confirmed",
	})
	if err != nil {
		t.Fatalf("PatchContentUnit() error = %v", err)
	}
	if patched.Title != "Renamed unit" || patched.Description != "Updated description" || patched.Prompt != "Updated prompt" || patched.Status != "confirmed" {
		t.Fatalf("patched content unit = %+v, want metadata updates", patched)
	}
	if patched.ScriptBlockID == nil || *patched.ScriptBlockID != block.ID {
		t.Fatalf("script block id = %v, want %d", patched.ScriptBlockID, block.ID)
	}
}

func TestSourceLockStatusReportsContentUnitLockedFields(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, _, block := seedContentUnitScriptSource(t, db, 1)
	unit := model.ContentUnit{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}
	slot := model.AssetSlot{ProjectID: 1, OwnerType: "content_unit", OwnerID: &unit.ID, Name: "Required image", Status: "missing"}
	if err := db.Create(&slot).Error; err != nil {
		t.Fatalf("create asset slot: %v", err)
	}

	status, err := service.SourceLockStatus(context.Background(), 1, "content-units", strconv.FormatUint(uint64(unit.ID), 10))
	if err != nil {
		t.Fatalf("SourceLockStatus() error = %v", err)
	}
	if !status.Locked {
		t.Fatalf("source lock status not locked: %+v", status)
	}
	assertStringSliceContains(t, status.LockedFields, "script_block_id")
	assertStringSliceContains(t, status.LockedFields, "scene_moment_id")
	if len(status.Reasons) != 1 || status.Reasons[0].EntityKind != "asset_slot" || status.Reasons[0].Count != 1 {
		t.Fatalf("source lock reasons = %+v, want one asset_slot reason", status.Reasons)
	}
}

func TestDeleteContentUnitRejectsDownstreamKeyframes(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	_, _, block := seedContentUnitScriptSource(t, db, 1)
	unit := model.ContentUnit{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}
	keyframe := model.Keyframe{ProjectID: 1, ContentUnitID: &unit.ID, Title: "Keyframe", Status: "candidate"}
	if err := db.Create(&keyframe).Error; err != nil {
		t.Fatalf("create keyframe: %v", err)
	}

	err := service.DeleteItemByKind(context.Background(), 1, "content_unit", strconv.FormatUint(uint64(unit.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("DeleteItemByKind() error = %v, want ErrForbidden", err)
	}

	var count int64
	if err := db.Model(&model.ContentUnit{}).Where("id = ?", unit.ID).Count(&count).Error; err != nil {
		t.Fatalf("count content unit: %v", err)
	}
	if count != 1 {
		t.Fatalf("content unit count = %d, want 1", count)
	}
}

func TestCreateContentUnitFromStoryboardLineInheritsStableSourceAndRelations(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	script, version, block := seedContentUnitScriptSource(t, db, 1)
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	segment := model.Segment{ProjectID: 1, ScriptBlockID: &block.ID, Title: "Segment", Status: "confirmed"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	moment := model.SceneMoment{ProjectID: 1, SegmentID: &segment.ID, ScriptBlockID: &block.ID, Title: "Moment", Status: "confirmed"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create scene moment: %v", err)
	}
	line := model.StoryboardLine{
		ProjectID:          1,
		StoryboardScriptID: storyboardScript.ID,
		SegmentID:          &segment.ID,
		SceneMomentID:      &moment.ID,
		ScriptBlockID:      &block.ID,
		Kind:               "shot",
		Title:              "Phone clue",
		Description:        "A precise shot.",
		VisualIntent:       "Tight phone close-up.",
		DurationSec:        3.5,
		Status:             "confirmed",
	}
	if err := db.Create(&line).Error; err != nil {
		t.Fatalf("create storyboard line: %v", err)
	}

	unit, err := service.CreateContentUnitFromStoryboardLine(context.Background(), 1, strconv.FormatUint(uint64(line.ID), 10), ContentUnitInput{})
	if err != nil {
		t.Fatalf("create content unit from storyboard line: %v", err)
	}
	if unit.StoryboardLineID == nil || *unit.StoryboardLineID != line.ID {
		t.Fatalf("storyboard line id = %v, want %d", unit.StoryboardLineID, line.ID)
	}
	if unit.SegmentID == nil || *unit.SegmentID != segment.ID {
		t.Fatalf("segment id = %v, want %d", unit.SegmentID, segment.ID)
	}
	if unit.SceneMomentID == nil || *unit.SceneMomentID != moment.ID {
		t.Fatalf("scene moment id = %v, want %d", unit.SceneMomentID, moment.ID)
	}
	if unit.ScriptBlockID == nil || *unit.ScriptBlockID != block.ID {
		t.Fatalf("script block id = %v, want %d", unit.ScriptBlockID, block.ID)
	}
	if unit.Kind != "shot" {
		t.Fatalf("content unit kind = %q, want shot", unit.Kind)
	}
	if unit.Title != line.Title || unit.Description != line.Description || unit.Prompt != line.VisualIntent || unit.DurationSec != line.DurationSec {
		t.Fatalf("content unit did not inherit storyboard line fields: %+v", unit)
	}
	assertSemanticRelationExists(t, db, "storyboard_line", line.ID, "content_unit", unit.ID, model.EntityRelationTypeCompilesTo)
	assertSemanticRelationExists(t, db, "content_unit", unit.ID, "script_block", block.ID, model.EntityRelationTypeBasedOn)
}

func TestCreateContentUnitFromStoryboardLineRejectsMismatchedScriptBlock(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	script, version, block := seedContentUnitScriptSource(t, db, 1)
	otherBlock := model.ScriptBlock{ProjectID: 1, ScriptID: script.ID, ScriptVersionID: version.ID, Kind: "action", Content: "另一段来源。", StartLine: 1, EndLine: 1, Status: "active"}
	if err := db.Create(&otherBlock).Error; err != nil {
		t.Fatalf("create other script block: %v", err)
	}
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	line := model.StoryboardLine{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, ScriptBlockID: &block.ID, Title: "Line", Status: "confirmed"}
	if err := db.Create(&line).Error; err != nil {
		t.Fatalf("create storyboard line: %v", err)
	}

	_, err := service.CreateContentUnitFromStoryboardLine(context.Background(), 1, strconv.FormatUint(uint64(line.ID), 10), ContentUnitInput{
		ScriptBlockID: &otherBlock.ID,
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("CreateContentUnitFromStoryboardLine() error = %v, want ErrInvalidInput", err)
	}
}

func TestCreateContentUnitFromStoryboardLineMapsStoryboardKind(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	script, version, _ := seedContentUnitScriptSource(t, db, 1)
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	line := model.StoryboardLine{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, Kind: "caption", Title: "Caption line", Status: "confirmed"}
	if err := db.Create(&line).Error; err != nil {
		t.Fatalf("create storyboard line: %v", err)
	}

	unit, err := service.CreateContentUnitFromStoryboardLine(context.Background(), 1, strconv.FormatUint(uint64(line.ID), 10), ContentUnitInput{})
	if err != nil {
		t.Fatalf("create content unit from storyboard line: %v", err)
	}
	if unit.Kind != "caption_card" {
		t.Fatalf("content unit kind = %q, want caption_card", unit.Kind)
	}
}

func TestPatchContentUnitKeepsExistingStoryboardLineLink(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	script, version, block := seedContentUnitScriptSource(t, db, 1)
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	line := model.StoryboardLine{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, ScriptBlockID: &block.ID, Title: "Line", VisualIntent: "Original prompt.", Status: "confirmed"}
	if err := db.Create(&line).Error; err != nil {
		t.Fatalf("create storyboard line: %v", err)
	}
	unit := model.ContentUnit{ProjectID: 1, StoryboardLineID: &line.ID, ScriptBlockID: &block.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}

	patched, err := service.PatchContentUnit(context.Background(), 1, strconv.FormatUint(uint64(unit.ID), 10), ContentUnitInput{
		Title:  "Updated unit",
		Prompt: "Updated prompt.",
	})
	if err != nil {
		t.Fatalf("PatchContentUnit() error = %v", err)
	}
	if patched.StoryboardLineID == nil || *patched.StoryboardLineID != line.ID {
		t.Fatalf("storyboard line id = %v, want %d", patched.StoryboardLineID, line.ID)
	}
	if patched.Title != "Updated unit" || patched.Prompt != "Updated prompt." {
		t.Fatalf("patch fields not applied: %+v", patched)
	}
}

func TestPatchContentUnitRejectsChangingStoryboardLineLink(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	script, version, block := seedContentUnitScriptSource(t, db, 1)
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	firstLine := model.StoryboardLine{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, ScriptBlockID: &block.ID, Title: "First", Status: "confirmed"}
	secondLine := model.StoryboardLine{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, ScriptBlockID: &block.ID, Title: "Second", Status: "confirmed"}
	if err := db.Create(&firstLine).Error; err != nil {
		t.Fatalf("create first storyboard line: %v", err)
	}
	if err := db.Create(&secondLine).Error; err != nil {
		t.Fatalf("create second storyboard line: %v", err)
	}
	unit := model.ContentUnit{ProjectID: 1, StoryboardLineID: &firstLine.ID, ScriptBlockID: &block.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}

	_, err := service.PatchContentUnit(context.Background(), 1, strconv.FormatUint(uint64(unit.ID), 10), ContentUnitInput{
		StoryboardLineID: &secondLine.ID,
		Title:            "Wrong line",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchContentUnit() error = %v, want ErrInvalidInput", err)
	}
}

func TestPatchContentUnitRejectsScriptBlockChangeWhenLinkedToStoryboardLine(t *testing.T) {
	db := newContentUnitTestDB(t)
	service := NewService(db)
	script, version, block := seedContentUnitScriptSource(t, db, 1)
	otherBlock := model.ScriptBlock{ProjectID: 1, ScriptID: script.ID, ScriptVersionID: version.ID, Kind: "action", Content: "另一段来源。", StartLine: 1, EndLine: 1, Status: "active"}
	if err := db.Create(&otherBlock).Error; err != nil {
		t.Fatalf("create other script block: %v", err)
	}
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	line := model.StoryboardLine{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, ScriptBlockID: &block.ID, Title: "Line", Status: "confirmed"}
	if err := db.Create(&line).Error; err != nil {
		t.Fatalf("create storyboard line: %v", err)
	}
	unit := model.ContentUnit{ProjectID: 1, StoryboardLineID: &line.ID, ScriptBlockID: &block.ID, Title: "Unit", Status: "draft"}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatalf("create content unit: %v", err)
	}

	_, err := service.PatchContentUnit(context.Background(), 1, strconv.FormatUint(uint64(unit.ID), 10), ContentUnitInput{
		ScriptBlockID: &otherBlock.ID,
		Title:         "Wrong source",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchContentUnit() error = %v, want ErrInvalidInput", err)
	}

	var persisted model.ContentUnit
	if err := db.First(&persisted, unit.ID).Error; err != nil {
		t.Fatalf("load content unit: %v", err)
	}
	if persisted.ScriptBlockID == nil || *persisted.ScriptBlockID != block.ID {
		t.Fatalf("content unit script block changed to %v, want %d", persisted.ScriptBlockID, block.ID)
	}
}

func newContentUnitTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "content-unit.db")), &gorm.Config{
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
		&model.Keyframe{},
		&model.AssetSlot{},
		&model.PreviewTimelineItem{},
		&model.WorkItem{},
		&model.DeliveryTimelineItem{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func seedContentUnitScriptSource(t *testing.T, db *gorm.DB, projectID uint) (model.Script, model.ScriptVersion, model.ScriptBlock) {
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

func assertStringSliceContains(t *testing.T, values []string, expected string) {
	t.Helper()
	for _, value := range values {
		if value == expected {
			return
		}
	}
	t.Fatalf("%q not found in %v", expected, values)
}

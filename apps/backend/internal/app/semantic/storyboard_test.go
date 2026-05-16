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

func TestPatchStoryboardScriptAllowsSourceChangeBeforeDerivedItems(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, firstVersion, _ := seedStoryboardScriptSource(t, db, 1)
	secondVersion := model.ScriptVersion{ProjectID: 1, ScriptID: script.ID, VersionNumber: 2, Title: "Pilot v2", SourceType: "revised", Content: "EXT. SHOP - DAY\n手机屏幕熄灭。", RawSource: "EXT. SHOP - DAY\n手机屏幕熄灭。", Status: "active"}
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
	secondVersion := model.ScriptVersion{ProjectID: 1, ScriptID: script.ID, VersionNumber: 2, Title: "Pilot v2", SourceType: "revised", Content: "EXT. SHOP - DAY\n手机屏幕熄灭。", RawSource: "EXT. SHOP - DAY\n手机屏幕熄灭。", Status: "active"}
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
	syncSemanticTestRelations(t, db, &storyboardVersion)

	_, err := service.PatchStoryboardScript(context.Background(), 1, strconv.FormatUint(uint64(storyboardScript.ID), 10), StoryboardScriptInput{
		ScriptVersionID: &secondVersion.ID,
		Name:            "Moved source",
		Status:          "draft",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchStoryboardScript() error = %v, want ErrInvalidInput", err)
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
	storyboardVersion := model.StoryboardVersion{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, VersionNumber: 1, Title: "Storyboard v1", Source: "manual", Status: "active", SnapshotJSON: `{"units":[]}`}
	if err := db.Create(&storyboardVersion).Error; err != nil {
		t.Fatalf("create storyboard version: %v", err)
	}

	_, err := service.PatchStoryboardVersion(context.Background(), 1, strconv.FormatUint(uint64(storyboardVersion.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("PatchStoryboardVersion() error = %v, want ErrForbidden", err)
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

func TestDeleteStoryboardScriptRejectsDownstreamVersions(t *testing.T) {
	db := newStoryboardTestDB(t)
	service := NewService(db)
	script, version, _ := seedStoryboardScriptSource(t, db, 1)
	storyboardScript := model.StoryboardScript{ProjectID: 1, ScriptVersionID: &version.ID, Name: script.Title, Status: "draft"}
	if err := db.Create(&storyboardScript).Error; err != nil {
		t.Fatalf("create storyboard script: %v", err)
	}
	storyboardVersion := model.StoryboardVersion{ProjectID: 1, StoryboardScriptID: storyboardScript.ID, Title: "v1", Status: "draft"}
	if err := db.Create(&storyboardVersion).Error; err != nil {
		t.Fatalf("create storyboard version: %v", err)
	}
	syncSemanticTestRelations(t, db, &storyboardVersion)

	err := service.DeleteItemByKind(context.Background(), 1, "storyboard_script", strconv.FormatUint(uint64(storyboardScript.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("DeleteItemByKind() error = %v, want ErrForbidden", err)
	}
}

func newStoryboardTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "storyboard.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	},
		&model.EntityRelation{},
		&model.Script{},
		&model.ScriptVersion{},
		&model.ScriptBlock{},
		&model.Segment{},
		&model.SceneMoment{},
		&model.StoryboardScript{},
		&model.StoryboardVersion{},
		&model.ContentUnit{},
		&model.AssetSlot{},
	)
}

func seedStoryboardScriptSource(t *testing.T, db *gorm.DB, projectID uint) (model.Script, model.ScriptVersion, model.ScriptBlock) {
	t.Helper()
	content := "INT. SHOP - NIGHT\n手机屏幕亮起。"
	script := model.Script{ProjectID: projectID, Title: "Pilot", Content: content, RawSource: content, AuthorID: 1}
	if err := db.Create(&script).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	version := model.ScriptVersion{ProjectID: projectID, ScriptID: script.ID, VersionNumber: 1, Title: script.Title, SourceType: "raw", Content: script.Content, RawSource: script.RawSource, Status: "active"}
	if err := db.Create(&version).Error; err != nil {
		t.Fatalf("create script version: %v", err)
	}
	block := model.ScriptBlock{ProjectID: projectID, ScriptID: script.ID, ScriptVersionID: version.ID, Kind: "action", Content: "手机屏幕亮起。", StartLine: 2, EndLine: 2, Status: "active"}
	if err := db.Create(&block).Error; err != nil {
		t.Fatalf("create script block: %v", err)
	}
	return script, version, block
}

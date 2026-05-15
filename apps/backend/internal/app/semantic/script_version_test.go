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

func TestScriptVersionIsImmutableAfterCreate(t *testing.T) {
	db := newScriptVersionTestDB(t)
	service := NewService(db)
	script, version := seedScriptVersionTestScript(t, db, 1)

	_, err := service.PatchScriptVersion(context.Background(), 1, strconv.FormatUint(uint64(version.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("PatchScriptVersion() error = %v, want ErrForbidden", err)
	}

	var persisted model.ScriptVersion
	if err := db.First(&persisted, version.ID).Error; err != nil {
		t.Fatalf("load script version: %v", err)
	}
	if persisted.Title != version.Title || persisted.Content != version.Content || persisted.Status != version.Status {
		t.Fatalf("version changed despite immutable rule: %+v, original script id %d", persisted, script.ID)
	}
}

func TestScriptVersionCannotBeDeletedByKind(t *testing.T) {
	db := newScriptVersionTestDB(t)
	service := NewService(db)
	_, version := seedScriptVersionTestScript(t, db, 1)

	err := service.DeleteItemByKind(context.Background(), 1, "script_version", strconv.FormatUint(uint64(version.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("DeleteItemByKind() error = %v, want ErrForbidden", err)
	}

	var count int64
	if err := db.Model(&model.ScriptVersion{}).Where("id = ?", version.ID).Count(&count).Error; err != nil {
		t.Fatalf("count script versions: %v", err)
	}
	if count != 1 {
		t.Fatalf("script versions after delete = %d, want 1", count)
	}
}

func TestScriptVersionModelRejectsDirectUpdateAndDelete(t *testing.T) {
	db := newScriptVersionTestDB(t)
	_, version := seedScriptVersionTestScript(t, db, 1)

	if err := db.Model(&version).Update("title", "mutated").Error; err == nil {
		t.Fatal("direct script version update succeeded, want immutable error")
	}
	if err := db.Delete(&version).Error; err == nil {
		t.Fatal("direct script version delete succeeded, want immutable error")
	}

	var persisted model.ScriptVersion
	if err := db.First(&persisted, version.ID).Error; err != nil {
		t.Fatalf("load script version: %v", err)
	}
	if persisted.Title != version.Title {
		t.Fatalf("title changed to %q, want %q", persisted.Title, version.Title)
	}
}

func TestListScriptVersionLinesUsesImmutableVersionSource(t *testing.T) {
	db := newScriptVersionTestDB(t)
	service := NewService(db)
	_, version := seedScriptVersionTestScript(t, db, 1)

	lines, err := service.ListScriptVersionLines(context.Background(), 1, strconv.FormatUint(uint64(version.ID), 10))
	if err != nil {
		t.Fatalf("list script version lines: %v", err)
	}
	if len(lines) != 3 {
		t.Fatalf("line count = %d, want 3: %+v", len(lines), lines)
	}
	if lines[0].LineNumber != 1 || lines[0].Content != "INT. SHOP - NIGHT" || lines[0].StartChar != 0 || lines[0].EndChar != len([]rune(lines[0].Content)) {
		t.Fatalf("unexpected first line: %+v", lines[0])
	}
	if lines[1].LineNumber != 2 || lines[1].Content != "手机屏幕亮起。" || lines[1].EndChar != len([]rune("手机屏幕亮起。")) {
		t.Fatalf("unexpected unicode line: %+v", lines[1])
	}
	if lines[2].LineNumber != 3 || lines[2].Content != "CUT TO BLACK." {
		t.Fatalf("unexpected CRLF normalized line: %+v", lines[2])
	}
}

func TestCreateScriptVersionAcceptsParentFromSameScript(t *testing.T) {
	db := newScriptVersionTestDB(t)
	service := NewService(db)
	script, version := seedScriptVersionTestScript(t, db, 1)

	created, err := service.CreateScriptVersion(context.Background(), 1, CreateScriptVersionInput{
		ScriptID:        script.ID,
		ParentVersionID: &version.ID,
		Title:           "Pilot revised",
		Content:         "Revised draft",
		Status:          "active",
	}, nil)
	if err != nil {
		t.Fatalf("CreateScriptVersion() error = %v", err)
	}
	if created.ParentVersionID == nil || *created.ParentVersionID != version.ID {
		t.Fatalf("parent version id = %v, want %d", created.ParentVersionID, version.ID)
	}
	if created.VersionNumber != 2 {
		t.Fatalf("version number = %d, want 2", created.VersionNumber)
	}
}

func TestCreateScriptVersionAssignsVersionNumberServerSide(t *testing.T) {
	db := newScriptVersionTestDB(t)
	service := NewService(db)
	script, _ := seedScriptVersionTestScript(t, db, 1)

	created, err := service.CreateScriptVersion(context.Background(), 1, CreateScriptVersionInput{
		ScriptID: script.ID,
		Title:    "Client requested number",
		Content:  "Server assigned number",
		Status:   "active",
	}, nil)
	if err != nil {
		t.Fatalf("CreateScriptVersion() error = %v", err)
	}
	if created.VersionNumber != 2 {
		t.Fatalf("version number = %d, want server-assigned 2", created.VersionNumber)
	}
}

func TestCreateScriptVersionRejectsParentFromDifferentScript(t *testing.T) {
	db := newScriptVersionTestDB(t)
	service := NewService(db)
	script, _ := seedScriptVersionTestScript(t, db, 1)
	_, otherVersion := seedScriptVersionTestScriptWithTitle(t, db, 1, "Other")

	_, err := service.CreateScriptVersion(context.Background(), 1, CreateScriptVersionInput{
		ScriptID:        script.ID,
		ParentVersionID: &otherVersion.ID,
		Title:           "Invalid child",
		Content:         "Wrong chain",
		Status:          "active",
	}, nil)
	if !errors.Is(err, ErrOwnerWrongProject) {
		t.Fatalf("CreateScriptVersion() error = %v, want ErrOwnerWrongProject", err)
	}
}

func newScriptVersionTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "script-version.db")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.EntityRelation{}, &model.Script{}, &model.ScriptVersion{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func seedScriptVersionTestScript(t *testing.T, db *gorm.DB, projectID uint) (model.Script, model.ScriptVersion) {
	return seedScriptVersionTestScriptWithTitle(t, db, projectID, "Pilot")
}

func seedScriptVersionTestScriptWithTitle(t *testing.T, db *gorm.DB, projectID uint, title string) (model.Script, model.ScriptVersion) {
	t.Helper()
	content := "INT. SHOP - NIGHT\r\n手机屏幕亮起。\r\nCUT TO BLACK."
	script := model.Script{ProjectID: projectID, Title: title, Content: content, RawSource: "raw", AuthorID: 1}
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

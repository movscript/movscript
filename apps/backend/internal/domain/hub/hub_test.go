package hub

import (
	"testing"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

func TestSlugifyAndSafeFilename(t *testing.T) {
	if got := Slugify("Hello World 2026"); got != "hello-world-2026" {
		t.Fatalf("slug = %q", got)
	}
	if got := SafeFilename(`"bad/name".movpkg`, "fallback.movpkg"); got != "name.movpkg" {
		t.Fatalf("filename = %q", got)
	}
}

func TestEncodeDecodeTags(t *testing.T) {
	raw := EncodeTags([]string{" ai ", "", "starter", "ai"})
	tags := DecodeTags(raw)
	if len(tags) != 2 || tags[0] != "ai" || tags[1] != "starter" {
		t.Fatalf("tags = %#v", tags)
	}
}

func TestToPackageFormatsFields(t *testing.T) {
	now := time.Unix(10, 0).UTC()
	row := model.HubPackage{
		Model:         gorm.Model{CreatedAt: now, UpdatedAt: now},
		PackageID:     "pkg-1",
		Title:         "Title",
		Kind:          KindPlugin,
		Downloads:     42,
		FileSizeBytes: 2048,
		Status:        StatusPublished,
	}
	item := ToPackage(row)
	if item.FileSize != "2.0 KB" || item.InstallCommand != "mov hub install pkg-1" || item.UpdatedAt != "1970-01-01" {
		t.Fatalf("unexpected package: %+v", item)
	}
}

func TestNewDraftPackageDefaults(t *testing.T) {
	row := NewDraftPackage("my-package", CreateDraftInput{
		Title:           " My Package ",
		Tags:            []string{"ai", "ai"},
		FileName:        "../unsafe.movpkg",
		StagingProvider: "local",
		StagingKey:      "hub/staging/key",
	})
	if row.Title != "My Package" || row.Kind != KindPlugin || row.Status != StatusPending {
		t.Fatalf("unexpected draft row: %+v", row)
	}
	if row.FileName != "unsafe.movpkg" || row.ContentType != "application/octet-stream" {
		t.Fatalf("unexpected file defaults: %+v", row)
	}
}

func TestApplyPatchAndPublish(t *testing.T) {
	row := model.HubPackage{Status: StatusPending, Signal: "待审核"}
	status := StatusTakenDown
	note := " needs review "
	now := time.Unix(20, 0).UTC()
	ApplyPatch(&row, "reviewer", PatchInput{Status: &status, ReviewNote: &note}, now)
	if row.Status != StatusTakenDown || row.TakenDownAt == nil || row.ReviewNote != "needs review" {
		t.Fatalf("unexpected patched row: %+v", row)
	}
	ApplyPublish(&row, "publisher", " ok ", "local", "public/key", now)
	if row.Status != StatusPublished || row.Signal != "社区验证" || row.TakenDownAt != nil || row.PublicKey != "public/key" {
		t.Fatalf("unexpected published row: %+v", row)
	}
}

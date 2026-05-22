package binding

import (
	"context"
	"errors"
	"strconv"
	"testing"

	domainbinding "github.com/movscript/movscript/internal/domain/resource/binding"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestNormalizeOwnerTypeAndRole(t *testing.T) {
	if got := NormalizeOwnerType("Creative-Reference "); got != "creative_reference" {
		t.Fatalf("owner type = %q, want creative_reference", got)
	}
	if got := NormalizeRole(" Source "); got != "source" {
		t.Fatalf("role = %q, want source", got)
	}
}

func TestNormalizeCreateInputDefaults(t *testing.T) {
	input := CreateInput{
		ProjectID:  1,
		ResourceID: 2,
		OwnerType:  "Asset-Slot",
		OwnerID:    3,
	}
	normalizeCreateInput(&input)

	if input.OwnerType != "asset_slot" {
		t.Fatalf("owner type = %q, want asset_slot", input.OwnerType)
	}
	if input.Role != "attachment" {
		t.Fatalf("role = %q, want attachment", input.Role)
	}
	if input.Version != 1 {
		t.Fatalf("version = %d, want 1", input.Version)
	}
	if input.Status != "draft" {
		t.Fatalf("status = %q, want draft", input.Status)
	}
	if input.SourceType != "manual" {
		t.Fatalf("source type = %q, want manual", input.SourceType)
	}
}

func TestValidateCreateInputRejectsUnknownOwner(t *testing.T) {
	input := CreateInput{
		ProjectID:  1,
		ResourceID: 2,
		OwnerType:  "unknown",
		OwnerID:    3,
		Role:       "attachment",
		Version:    1,
		Status:     "draft",
		SourceType: "manual",
	}
	if err := validateCreateInput(input); err != ErrOwnerInvalidType {
		t.Fatalf("error = %v, want ErrOwnerInvalidType", err)
	}
}

func TestBuildUpdatesNormalizesMutableFields(t *testing.T) {
	role := "Final"
	slot := " poster "
	version := 0
	status := "Approved"
	sourceType := "Canvas"
	metadata := " {} "

	updates, err := buildUpdates(UpdateInput{
		Role:         &role,
		Slot:         &slot,
		Version:      &version,
		Status:       &status,
		SourceType:   &sourceType,
		MetadataJSON: &metadata,
	})
	if err != nil {
		t.Fatal(err)
	}
	columns := bindingUpdateColumns(updates)
	if columns["role"] != "final" || columns["slot"] != "poster" || columns["version"] != 1 {
		t.Fatalf("unexpected normalized role/slot/version: %#v", columns)
	}
	if columns["status"] != "approved" || columns["source_type"] != "canvas" || columns["metadata_json"] != "{}" {
		t.Fatalf("unexpected normalized status/source/metadata: %#v", columns)
	}
}

func TestBuildUpdatesRejectsInvalidStatus(t *testing.T) {
	status := "pending"
	if _, err := buildUpdates(UpdateInput{Status: &status}); err != ErrInvalidInput {
		t.Fatalf("error = %v, want ErrInvalidInput", err)
	}
}

func TestCreateAndDeleteBindingSyncsRelationsWithoutAdoptingAssetSlotResource(t *testing.T) {
	db := newResourceBindingTestDB(t)
	ctx := context.Background()
	slot := model.AssetSlot{
		ProjectID: 1,
		Kind:      "image",
		Name:      "Hero image",
		Status:    "missing",
	}
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "hero.png", FilePath: "/tmp/hero.png"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&slot).Error; err != nil {
		t.Fatalf("create slot: %v", err)
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	svc := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	canvasBinding := model.ResourceBinding{
		ProjectID:  1,
		ResourceID: resource.ID,
		OwnerType:  "canvas",
		OwnerID:    42,
		Role:       "output",
		Slot:       "image",
		Status:     "selected",
		SourceType: "manual",
	}
	createdCanvasBinding, err := svc.CreateBinding(ctx, domainbinding.BindingFromModel(canvasBinding))
	if err != nil {
		t.Fatalf("create canvas binding: %v", err)
	}
	assertResourceBindingRelationExists(t, db, "resource_binding_id", createdCanvasBinding.ID)
	if err := svc.Delete(ctx, createdCanvasBinding.ID); err != nil {
		t.Fatalf("delete canvas binding: %v", err)
	}
	assertResourceBindingRelationMissing(t, db, "resource_binding_id", createdCanvasBinding.ID)

	binding := model.ResourceBinding{
		ProjectID:  1,
		ResourceID: resource.ID,
		OwnerType:  "asset_slot",
		OwnerID:    slot.ID,
		Role:       "output",
		Slot:       "image",
		Status:     "selected",
		SourceType: "manual",
		IsPrimary:  true,
	}
	createdBinding, err := svc.CreateBinding(ctx, domainbinding.BindingFromModel(binding))
	if err != nil {
		t.Fatalf("create binding: %v", err)
	}

	var updatedSlot model.AssetSlot
	if err := db.First(&updatedSlot, slot.ID).Error; err != nil {
		t.Fatalf("reload slot: %v", err)
	}
	if updatedSlot.ResourceID != nil {
		t.Fatalf("asset slot resource_id was directly backfilled: %+v", updatedSlot)
	}
	assertResourceBindingEdgeExists(t, db, "asset_slot", slot.ID, "raw_resource", resource.ID, model.EntityRelationTypeUsesResource)

	if err := svc.Delete(ctx, createdBinding.ID); err != nil {
		t.Fatalf("delete binding: %v", err)
	}
	if err := db.First(&updatedSlot, slot.ID).Error; err != nil {
		t.Fatalf("reload slot after delete: %v", err)
	}
	if updatedSlot.ResourceID != nil {
		t.Fatalf("asset slot resource_id changed during binding delete: %+v", updatedSlot)
	}
	assertResourceBindingEdgeMissing(t, db, "asset_slot", slot.ID, "raw_resource", resource.ID, model.EntityRelationTypeUsesResource)
}

func TestCreateRejectsResourceOutsideCurrentOrg(t *testing.T) {
	db := newResourceBindingTestDB(t)
	ctx := context.Background()
	userID := uint(7)
	orgA := model.Organization{Name: "Org A", Slug: "org-a"}
	orgB := model.Organization{Name: "Org B", Slug: "org-b"}
	if err := db.Create(&orgA).Error; err != nil {
		t.Fatalf("create org A: %v", err)
	}
	if err := db.Create(&orgB).Error; err != nil {
		t.Fatalf("create org B: %v", err)
	}
	project := model.Project{Name: "Team project", OwnerID: userID, OrgID: &orgB.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	slot := model.AssetSlot{ProjectID: project.ID, Kind: "image", Name: "Poster"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&slot).Error; err != nil {
		t.Fatalf("create slot: %v", err)
	}
	resource := model.RawResource{OwnerID: userID, OrgID: &orgA.ID, Type: "image", Name: "other-org.png", FilePath: "/tmp/other-org.png", IsShared: true}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	svc := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	_, _, err := svc.Create(ctx, CreateInput{
		ProjectID:  project.ID,
		ResourceID: resource.ID,
		OwnerType:  "asset_slot",
		OwnerID:    slot.ID,
	}, userID, &orgB.ID)
	if !errors.Is(err, ErrResourceForbidden) {
		t.Fatalf("error = %v, want ErrResourceForbidden", err)
	}
}

func TestCreateAllowsTeamResourceWithoutSharing(t *testing.T) {
	db := newResourceBindingTestDB(t)
	ctx := context.Background()
	userID := uint(7)
	org := model.Organization{Name: "Team", Slug: "team"}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := model.Project{Name: "Team project", OwnerID: userID, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	slot := model.AssetSlot{ProjectID: project.ID, Kind: "image", Name: "Poster"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&slot).Error; err != nil {
		t.Fatalf("create slot: %v", err)
	}
	resource := model.RawResource{OwnerID: 99, OrgID: &org.ID, Type: "image", Name: "team.png", FilePath: "/tmp/team.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	svc := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	binding, created, err := svc.Create(ctx, CreateInput{
		ProjectID:  project.ID,
		ResourceID: resource.ID,
		OwnerType:  "asset_slot",
		OwnerID:    slot.ID,
	}, userID, &org.ID)
	if err != nil {
		t.Fatalf("create team resource binding: %v", err)
	}
	if !created || binding.ID == 0 {
		t.Fatalf("expected created binding, got created=%v binding=%+v", created, binding)
	}
}

func TestCreateAdoptsOwnedPersonalResourceIntoTeam(t *testing.T) {
	db := newResourceBindingTestDB(t)
	ctx := context.Background()
	userID := uint(8)
	org := model.Organization{Name: "Team", Slug: "team-adopt"}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := model.Project{Name: "Team project", OwnerID: userID, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	slot := model.AssetSlot{ProjectID: project.ID, Kind: "image", Name: "Poster"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&slot).Error; err != nil {
		t.Fatalf("create slot: %v", err)
	}
	resource := model.RawResource{OwnerID: userID, Type: "image", Name: "personal-draft.png", FilePath: "/tmp/personal-draft.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	svc := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	if _, _, err := svc.Create(ctx, CreateInput{
		ProjectID:  project.ID,
		ResourceID: resource.ID,
		OwnerType:  "asset_slot",
		OwnerID:    slot.ID,
	}, userID, &org.ID); err != nil {
		t.Fatalf("create adopted binding: %v", err)
	}
	var stored model.RawResource
	if err := db.First(&stored, resource.ID).Error; err != nil {
		t.Fatalf("reload resource: %v", err)
	}
	if stored.OrgID == nil || *stored.OrgID != org.ID {
		t.Fatalf("resource was not adopted into team org: %+v", stored)
	}
	if stored.OwnerID != userID {
		t.Fatalf("resource creator changed: owner_id=%d want %d", stored.OwnerID, userID)
	}
}

func TestCreateAllowsProjectLevelBindingForProjectShare(t *testing.T) {
	db := newResourceBindingTestDB(t)
	ctx := context.Background()
	userID := uint(8)
	org := model.Organization{Name: "Team", Slug: "team-project-share"}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := model.Project{Name: "Team project", OwnerID: userID, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	resource := model.RawResource{OwnerID: userID, Type: "image", Name: "style.png", FilePath: "/tmp/style.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	svc := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	binding, created, err := svc.Create(ctx, CreateInput{
		ProjectID:  project.ID,
		ResourceID: resource.ID,
		OwnerType:  "project",
		OwnerID:    project.ID,
		Role:       "reference",
		Status:     "selected",
		SourceType: "manual",
	}, userID, &org.ID)
	if err != nil {
		t.Fatalf("create project binding: %v", err)
	}
	if !created || binding.OwnerType != "project" || binding.OwnerID != project.ID {
		t.Fatalf("unexpected project binding: created=%v binding=%+v", created, binding)
	}
	var stored model.RawResource
	if err := db.First(&stored, resource.ID).Error; err != nil {
		t.Fatalf("reload resource: %v", err)
	}
	if stored.OrgID == nil || *stored.OrgID != org.ID {
		t.Fatalf("project-shared resource was not adopted into team org: %+v", stored)
	}
}

func TestCreateAllowsLegacyPersonalResourceInPersonalOrg(t *testing.T) {
	db := newResourceBindingTestDB(t)
	ctx := context.Background()
	userID := uint(8)
	org := model.Organization{Name: "Personal", Slug: "personal", IsPersonal: true}
	if err := db.Create(&org).Error; err != nil {
		t.Fatalf("create org: %v", err)
	}
	project := model.Project{Name: "Personal project", OwnerID: userID, OrgID: &org.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	slot := model.AssetSlot{ProjectID: project.ID, Kind: "image", Name: "Cover"}
	if err := db.Session(&gorm.Session{SkipHooks: true}).Create(&slot).Error; err != nil {
		t.Fatalf("create slot: %v", err)
	}
	resource := model.RawResource{OwnerID: userID, Type: "image", Name: "legacy.png", FilePath: "/tmp/legacy.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	svc := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	binding, created, err := svc.Create(ctx, CreateInput{
		ProjectID:  project.ID,
		ResourceID: resource.ID,
		OwnerType:  "asset_slot",
		OwnerID:    slot.ID,
	}, userID, &org.ID)
	if err != nil {
		t.Fatalf("create binding: %v", err)
	}
	if !created || binding.ID == 0 {
		t.Fatalf("expected created binding, got created=%v binding=%+v", created, binding)
	}
}

func TestUpdateAndDeleteRequireBindingProjectInCurrentOrg(t *testing.T) {
	db := newResourceBindingTestDB(t)
	ctx := context.Background()
	userID := uint(9)
	orgA := model.Organization{Name: "Org A", Slug: "org-a"}
	orgB := model.Organization{Name: "Org B", Slug: "org-b"}
	if err := db.Create(&orgA).Error; err != nil {
		t.Fatalf("create org A: %v", err)
	}
	if err := db.Create(&orgB).Error; err != nil {
		t.Fatalf("create org B: %v", err)
	}
	project := model.Project{Name: "Org A project", OwnerID: userID, OrgID: &orgA.ID}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	resource := model.RawResource{OwnerID: userID, OrgID: &orgA.ID, Type: "image", Name: "org-a.png", FilePath: "/tmp/org-a.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	binding := model.ResourceBinding{ProjectID: project.ID, ResourceID: resource.ID, OwnerType: "asset_slot", OwnerID: 1, Role: "attachment", Status: "draft", SourceType: "manual", Version: 1}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create binding: %v", err)
	}

	svc := NewService(db.Session(&gorm.Session{SkipHooks: true}))
	status := "selected"
	if _, err := svc.Update(ctx, binding.ID, UpdateInput{Status: &status}, &orgB.ID); !errors.Is(err, ErrOwnerWrongProject) {
		t.Fatalf("update error = %v, want ErrOwnerWrongProject", err)
	}
	if err := svc.Delete(ctx, binding.ID, &orgB.ID); !errors.Is(err, ErrOwnerWrongProject) {
		t.Fatalf("delete error = %v, want ErrOwnerWrongProject", err)
	}
}

func newResourceBindingTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "resource_binding.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	},
		&model.EntityRelation{},
		&model.Organization{},
		&model.Project{},
		&model.AssetSlot{},
		&model.ResourceBinding{},
		&model.RawResource{},
	)
}

func assertResourceBindingRelationExists(t *testing.T, db *gorm.DB, marker string, id uint) {
	t.Helper()
	var count int64
	if err := db.Model(&model.EntityRelation{}).
		Where("metadata_json LIKE ?", `%`+marker+`":`+strconv.FormatUint(uint64(id), 10)+`%`).
		Where("valid_to IS NULL").
		Count(&count).Error; err != nil {
		t.Fatalf("count relation metadata: %v", err)
	}
	if count == 0 {
		t.Fatalf("expected relation metadata marker %s=%d", marker, id)
	}
}

func assertResourceBindingRelationMissing(t *testing.T, db *gorm.DB, marker string, id uint) {
	t.Helper()
	var count int64
	if err := db.Model(&model.EntityRelation{}).
		Where("metadata_json LIKE ?", `%`+marker+`":`+strconv.FormatUint(uint64(id), 10)+`%`).
		Where("valid_to IS NULL").
		Count(&count).Error; err != nil {
		t.Fatalf("count relation metadata: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected relation metadata marker %s=%d to be missing, got %d", marker, id, count)
	}
}

func assertResourceBindingEdgeExists(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) {
	t.Helper()
	if countResourceBindingEdges(t, db, sourceType, sourceID, targetType, targetID, relationType) == 0 {
		t.Fatalf("expected relation %s:%d -> %s:%d type %s", sourceType, sourceID, targetType, targetID, relationType)
	}
}

func assertResourceBindingEdgeMissing(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) {
	t.Helper()
	if count := countResourceBindingEdges(t, db, sourceType, sourceID, targetType, targetID, relationType); count != 0 {
		t.Fatalf("expected relation %s:%d -> %s:%d type %s to be missing, got %d", sourceType, sourceID, targetType, targetID, relationType, count)
	}
}

func countResourceBindingEdges(t *testing.T, db *gorm.DB, sourceType string, sourceID uint, targetType string, targetID uint, relationType string) int64 {
	t.Helper()
	var count int64
	if err := db.Model(&model.EntityRelation{}).
		Where("source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND type = ?", sourceType, sourceID, targetType, targetID, relationType).
		Where("valid_to IS NULL").
		Count(&count).Error; err != nil {
		t.Fatalf("count relation: %v", err)
	}
	return count
}

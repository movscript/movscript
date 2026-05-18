package semantic

import (
	"context"
	"errors"
	"strconv"
	"testing"

	"github.com/movscript/movscript/internal/app/coregraph"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestPatchProductionAllowsSourceChangeBeforeDerivedItems(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	_, firstVersion, secondVersion := seedProductionScriptVersions(t, db, 1)
	production := model.Production{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: "Production", SourceType: "script", Status: "planning"}
	if err := db.Create(&production).Error; err != nil {
		t.Fatalf("create production: %v", err)
	}

	patched, err := service.PatchProduction(context.Background(), 1, strconv.FormatUint(uint64(production.ID), 10), ProductionInput{
		ScriptVersionID: &secondVersion.ID,
		Name:            "Production v2",
		SourceType:      "script",
		Status:          "planning",
	})
	if err != nil {
		t.Fatalf("PatchProduction() error = %v", err)
	}
	if patched.ScriptVersionID == nil || *patched.ScriptVersionID != secondVersion.ID {
		t.Fatalf("script version id = %v, want %d", patched.ScriptVersionID, secondVersion.ID)
	}
}

func TestPatchProductionRejectsSourceChangeAfterDerivedItems(t *testing.T) {
	cases := []struct {
		name string
		seed func(t *testing.T, db *gorm.DB, production model.Production)
	}{
		{
			name: "production text block",
			seed: func(t *testing.T, db *gorm.DB, production model.Production) {
				t.Helper()
				block := model.ProductionTextBlock{ProjectID: production.ProjectID, ProductionID: production.ID, Title: "Brief", Content: "Locked source", Status: "active"}
				if err := db.Create(&block).Error; err != nil {
					t.Fatalf("create production text block: %v", err)
				}
				syncSemanticTestRelations(t, db, &block)
			},
		},
		{
			name: "segment",
			seed: func(t *testing.T, db *gorm.DB, production model.Production) {
				t.Helper()
				segment := model.Segment{ProjectID: production.ProjectID, ProductionID: &production.ID, Title: "Segment", Status: "confirmed"}
				if err := db.Create(&segment).Error; err != nil {
					t.Fatalf("create segment: %v", err)
				}
				syncSemanticTestRelations(t, db, &segment)
			},
		},
		{
			name: "content unit",
			seed: func(t *testing.T, db *gorm.DB, production model.Production) {
				t.Helper()
				unit := model.ContentUnit{ProjectID: production.ProjectID, ProductionID: &production.ID, Title: "Unit", Status: "draft"}
				if err := db.Create(&unit).Error; err != nil {
					t.Fatalf("create content unit: %v", err)
				}
				syncSemanticTestRelations(t, db, &unit)
			},
		},
		{
			name: "keyframe",
			seed: func(t *testing.T, db *gorm.DB, production model.Production) {
				t.Helper()
				keyframe := model.Keyframe{ProjectID: production.ProjectID, ProductionID: &production.ID, Title: "Keyframe", Status: "candidate"}
				if err := db.Create(&keyframe).Error; err != nil {
					t.Fatalf("create keyframe: %v", err)
				}
				syncSemanticTestRelations(t, db, &keyframe)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := newProductionTestDB(t)
			service := NewService(db)
			_, firstVersion, secondVersion := seedProductionScriptVersions(t, db, 1)
			production := model.Production{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: "Production", SourceType: "script", Status: "planning"}
			if err := db.Create(&production).Error; err != nil {
				t.Fatalf("create production: %v", err)
			}
			tc.seed(t, db, production)

			_, err := service.PatchProduction(context.Background(), 1, strconv.FormatUint(uint64(production.ID), 10), ProductionInput{
				ScriptVersionID: &secondVersion.ID,
				Name:            "Moved source",
				SourceType:      "script",
				Status:          "planning",
			})
			var invalid ErrInvalidInput
			if !errors.As(err, &invalid) {
				t.Fatalf("PatchProduction() error = %v, want ErrInvalidInput", err)
			}

			var persisted model.Production
			if err := db.First(&persisted, production.ID).Error; err != nil {
				t.Fatalf("load production: %v", err)
			}
			if persisted.ScriptVersionID == nil || *persisted.ScriptVersionID != firstVersion.ID {
				t.Fatalf("script version changed to %v, want %d", persisted.ScriptVersionID, firstVersion.ID)
			}
		})
	}
}

func TestPatchProductionAllowsMetadataAfterDerivedItems(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	_, firstVersion, _ := seedProductionScriptVersions(t, db, 1)
	production := model.Production{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: "Production", SourceType: "script", Status: "planning"}
	if err := db.Create(&production).Error; err != nil {
		t.Fatalf("create production: %v", err)
	}
	segment := model.Segment{ProjectID: 1, ProductionID: &production.ID, Title: "Segment", Status: "confirmed"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	syncSemanticTestRelations(t, db, &segment)

	patched, err := service.PatchProduction(context.Background(), 1, strconv.FormatUint(uint64(production.ID), 10), ProductionInput{
		ScriptVersionID: &firstVersion.ID,
		Name:            "Renamed production",
		Description:     "Updated description",
		SourceType:      "script",
		Status:          "producing",
		Progress:        35,
	})
	if err != nil {
		t.Fatalf("PatchProduction() error = %v", err)
	}
	if patched.Name != "Renamed production" || patched.Description != "Updated description" || patched.Status != "producing" || patched.Progress != 35 {
		t.Fatalf("patched production = %+v, want metadata updates", patched)
	}
	if patched.ScriptVersionID == nil || *patched.ScriptVersionID != firstVersion.ID {
		t.Fatalf("script version id = %v, want %d", patched.ScriptVersionID, firstVersion.ID)
	}
}

func TestDeleteProductionRejectsDownstreamItems(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	_, firstVersion, _ := seedProductionScriptVersions(t, db, 1)
	production := model.Production{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: "Production", SourceType: "script", Status: "planning"}
	if err := db.Create(&production).Error; err != nil {
		t.Fatalf("create production: %v", err)
	}
	segment := model.Segment{ProjectID: 1, ProductionID: &production.ID, Title: "Segment", Status: "confirmed"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	syncSemanticTestRelations(t, db, &segment)

	err := service.DeleteItemByKind(context.Background(), 1, "production", strconv.FormatUint(uint64(production.ID), 10))
	var forbidden ErrForbidden
	if !errors.As(err, &forbidden) {
		t.Fatalf("DeleteItemByKind() error = %v, want ErrForbidden", err)
	}

	var count int64
	if err := db.Model(&model.Production{}).Where("id = ?", production.ID).Count(&count).Error; err != nil {
		t.Fatalf("count production: %v", err)
	}
	if count != 1 {
		t.Fatalf("production count = %d, want 1", count)
	}
}

func TestDeleteProductionWithoutDownstreamItemsSucceeds(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	_, firstVersion, _ := seedProductionScriptVersions(t, db, 1)
	production := model.Production{ProjectID: 1, ScriptVersionID: &firstVersion.ID, Name: "Production", SourceType: "script", Status: "planning"}
	if err := db.Create(&production).Error; err != nil {
		t.Fatalf("create production: %v", err)
	}

	if err := service.DeleteItemByKind(context.Background(), 1, "production", strconv.FormatUint(uint64(production.ID), 10)); err != nil {
		t.Fatalf("DeleteItemByKind() error = %v", err)
	}

	var count int64
	if err := db.Model(&model.Production{}).Where("id = ?", production.ID).Count(&count).Error; err != nil {
		t.Fatalf("count production: %v", err)
	}
	if count != 0 {
		t.Fatalf("production count = %d, want 0", count)
	}
}

func TestCreateGeneratedKeyframeCandidateIsIdempotentForSameTargetAndResource(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "generated-keyframe.png", FilePath: "/tmp/generated-keyframe.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Hero frame",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	input := KeyframeInput{
		ResourceID:   &resource.ID,
		Title:        "Generated candidate",
		Description:  "Candidate description",
		Prompt:       "Candidate prompt",
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(target.ID), 10) + `}`,
	}

	first, err := service.CreateKeyframe(ctx, 1, input)
	if err != nil {
		t.Fatalf("create first candidate: %v", err)
	}
	second, err := service.CreateKeyframe(ctx, 1, input)
	if err != nil {
		t.Fatalf("create second candidate: %v", err)
	}
	if second.ID != first.ID {
		t.Fatalf("candidate id = %d, want reused %d", second.ID, first.ID)
	}
	var count int64
	if err := db.Model(&model.Keyframe{}).Where("project_id = ?", 1).Count(&count).Error; err != nil {
		t.Fatalf("count keyframes: %v", err)
	}
	if count != 2 {
		t.Fatalf("keyframe count = %d, want target plus one candidate", count)
	}
	if err := db.Model(&model.Keyframe{}).Where("id = ?", first.ID).Update("status", "rejected").Error; err != nil {
		t.Fatalf("reject candidate: %v", err)
	}
	reactivated, err := service.CreateKeyframe(ctx, 1, input)
	if err != nil {
		t.Fatalf("reactivate candidate: %v", err)
	}
	if reactivated.ID != first.ID || reactivated.Status != "candidate" {
		t.Fatalf("reactivated candidate = %#v, want same candidate with candidate status", reactivated)
	}
	if err := db.Model(&model.Keyframe{}).Where("project_id = ?", 1).Count(&count).Error; err != nil {
		t.Fatalf("count keyframes after reactivation: %v", err)
	}
	if count != 2 {
		t.Fatalf("keyframe count after reactivation = %d, want target plus one candidate", count)
	}
}

func TestCreateKeyframeRejectsDirectResourceAdoption(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "direct-keyframe.png", FilePath: "/tmp/direct-keyframe.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	_, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		ResourceID: &resource.ID,
		Title:      "Direct keyframe",
		Status:     "accepted",
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("CreateKeyframe() error = %v, want ErrInvalidInput", err)
	}
	if invalid.Err == nil || invalid.Err.Error() != "关键帧资源采纳必须通过候选采纳流程" {
		t.Fatalf("CreateKeyframe() invalid error = %v, want candidate-accept error", invalid.Err)
	}
	var count int64
	if err := db.Model(&model.Keyframe{}).Where("project_id = ?", 1).Count(&count).Error; err != nil {
		t.Fatalf("count keyframes: %v", err)
	}
	if count != 0 {
		t.Fatalf("keyframe count = %d, want 0", count)
	}
}

func TestCreateGeneratedKeyframeCandidateRejectsMissingResource(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Hero frame",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}

	_, err = service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:        "Generated candidate without resource",
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(target.ID), 10) + `}`,
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("CreateKeyframe() error = %v, want ErrInvalidInput", err)
	}
	if invalid.Err == nil || invalid.Err.Error() != "generated keyframe candidate requires resource" {
		t.Fatalf("CreateKeyframe() invalid error = %v, want missing resource error", invalid.Err)
	}
	var count int64
	if err := db.Model(&model.Keyframe{}).Where("project_id = ?", 1).Count(&count).Error; err != nil {
		t.Fatalf("count keyframes: %v", err)
	}
	if count != 1 {
		t.Fatalf("keyframe count = %d, want only target keyframe", count)
	}
}

func TestCreateGeneratedKeyframeCandidateRejectsUnknownResource(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Hero frame",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	missingResourceID := uint(999)

	_, err = service.CreateKeyframe(ctx, 1, KeyframeInput{
		ResourceID:   &missingResourceID,
		Title:        "Generated candidate with missing resource",
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(target.ID), 10) + `}`,
	})
	if !errors.Is(err, ErrOwnerNotFound) {
		t.Fatalf("CreateKeyframe() error = %v, want ErrOwnerNotFound", err)
	}
	var count int64
	if err := db.Model(&model.Keyframe{}).Where("project_id = ?", 1).Count(&count).Error; err != nil {
		t.Fatalf("count keyframes: %v", err)
	}
	if count != 1 {
		t.Fatalf("keyframe count = %d, want only target keyframe", count)
	}
}

func TestCreateGeneratedKeyframeCandidateRejectsDirectAcceptedStatus(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "generated-keyframe.png", FilePath: "/tmp/generated-keyframe.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Hero frame",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}

	_, err = service.CreateKeyframe(ctx, 1, KeyframeInput{
		ResourceID:   &resource.ID,
		Title:        "Generated candidate",
		Status:       domainsemantic.KeyframeStatusAccepted,
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(target.ID), 10) + `}`,
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("CreateKeyframe() error = %v, want ErrInvalidInput", err)
	}
	if invalid.Err == nil || invalid.Err.Error() != "generated keyframe candidate must be accepted through a work item" {
		t.Fatalf("CreateKeyframe() invalid error = %v, want direct accept error", invalid.Err)
	}
	var count int64
	if err := db.Model(&model.Keyframe{}).Where("project_id = ?", 1).Count(&count).Error; err != nil {
		t.Fatalf("count keyframes: %v", err)
	}
	if count != 1 {
		t.Fatalf("keyframe count = %d, want only target keyframe", count)
	}
}

func TestCreateGeneratedKeyframeCandidateRejectsCandidateTarget(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "generated-keyframe.png", FilePath: "/tmp/generated-keyframe.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Hero frame",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	firstCandidate, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		ResourceID:   &resource.ID,
		Title:        "Generated candidate",
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(target.ID), 10) + `}`,
	})
	if err != nil {
		t.Fatalf("create first candidate: %v", err)
	}

	_, err = service.CreateKeyframe(ctx, 1, KeyframeInput{
		ResourceID:   &resource.ID,
		Title:        "Nested candidate",
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(firstCandidate.ID), 10) + `}`,
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("CreateKeyframe() error = %v, want ErrInvalidInput", err)
	}
	var count int64
	if err := db.Model(&model.Keyframe{}).Where("project_id = ?", 1).Count(&count).Error; err != nil {
		t.Fatalf("count keyframes: %v", err)
	}
	if count != 2 {
		t.Fatalf("keyframe count = %d, want original target plus first candidate", count)
	}
}

func TestPatchKeyframeRejectsGeneratedCandidateMetadataWithoutResource(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Hero frame",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	subject, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Patch subject",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create patch subject: %v", err)
	}

	_, err = service.PatchKeyframe(ctx, 1, strconv.FormatUint(uint64(subject.ID), 10), KeyframeInput{
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(target.ID), 10) + `}`,
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchKeyframe() error = %v, want ErrInvalidInput", err)
	}
	if invalid.Err == nil || invalid.Err.Error() != "generated keyframe candidate requires resource" {
		t.Fatalf("PatchKeyframe() invalid error = %v, want missing resource error", invalid.Err)
	}
	var reloaded model.Keyframe
	if err := db.First(&reloaded, subject.ID).Error; err != nil {
		t.Fatalf("reload patch subject: %v", err)
	}
	if reloaded.MetadataJSON != "" || reloaded.ResourceID != nil {
		t.Fatalf("subject changed despite missing resource: %+v", reloaded)
	}
}

func TestPatchKeyframeRejectsGeneratedCandidateMetadataWithUnknownResource(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Hero frame",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	subject, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Patch subject",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create patch subject: %v", err)
	}
	missingResourceID := uint(999)

	_, err = service.PatchKeyframe(ctx, 1, strconv.FormatUint(uint64(subject.ID), 10), KeyframeInput{
		ResourceID:   &missingResourceID,
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(target.ID), 10) + `}`,
	})
	if !errors.Is(err, ErrOwnerNotFound) {
		t.Fatalf("PatchKeyframe() error = %v, want ErrOwnerNotFound", err)
	}
	var reloaded model.Keyframe
	if err := db.First(&reloaded, subject.ID).Error; err != nil {
		t.Fatalf("reload patch subject: %v", err)
	}
	if reloaded.MetadataJSON != "" || reloaded.ResourceID != nil {
		t.Fatalf("subject changed despite missing resource: %+v", reloaded)
	}
}

func TestPatchGeneratedKeyframeCandidateRejectsDirectAcceptedStatus(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "generated-keyframe.png", FilePath: "/tmp/generated-keyframe.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Hero frame",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	candidate, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		ResourceID:   &resource.ID,
		Title:        "Generated candidate",
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(target.ID), 10) + `}`,
	})
	if err != nil {
		t.Fatalf("create generated candidate: %v", err)
	}

	_, err = service.PatchKeyframe(ctx, 1, strconv.FormatUint(uint64(candidate.ID), 10), KeyframeInput{
		Status: domainsemantic.KeyframeStatusAccepted,
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchKeyframe() error = %v, want ErrInvalidInput", err)
	}
	if invalid.Err == nil || invalid.Err.Error() != "generated keyframe candidate must be accepted through a work item" {
		t.Fatalf("PatchKeyframe() invalid error = %v, want direct accept error", invalid.Err)
	}
	var reloaded model.Keyframe
	if err := db.First(&reloaded, candidate.ID).Error; err != nil {
		t.Fatalf("reload candidate: %v", err)
	}
	if reloaded.Status != "candidate" {
		t.Fatalf("candidate status = %q, want candidate", reloaded.Status)
	}
}

func TestPatchGeneratedKeyframeCandidateAllowsRejectedStatus(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "generated-keyframe.png", FilePath: "/tmp/generated-keyframe.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Hero frame",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	candidate, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		ResourceID:   &resource.ID,
		Title:        "Generated candidate",
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(target.ID), 10) + `}`,
	})
	if err != nil {
		t.Fatalf("create generated candidate: %v", err)
	}

	patched, err := service.PatchKeyframe(ctx, 1, strconv.FormatUint(uint64(candidate.ID), 10), KeyframeInput{
		ResourceID:   &resource.ID,
		Title:        candidate.Title,
		Status:       "rejected",
		MetadataJSON: candidate.MetadataJSON,
	})
	if err != nil {
		t.Fatalf("PatchKeyframe() reject candidate: %v", err)
	}
	if patched.Status != "rejected" || patched.MetadataJSON != candidate.MetadataJSON {
		t.Fatalf("patched candidate = %+v, want rejected generated candidate", patched)
	}
	var targetReloaded model.Keyframe
	if err := db.First(&targetReloaded, target.ID).Error; err != nil {
		t.Fatalf("reload target keyframe: %v", err)
	}
	if targetReloaded.ResourceID != nil || targetReloaded.Status != "draft" {
		t.Fatalf("target changed after rejecting candidate: %+v", targetReloaded)
	}
	decisions, err := service.ListCandidateDecisions(ctx, CandidateDecisionFilter{
		ProjectID:     1,
		CandidateType: domainsemantic.WorkItemTargetTypeKeyframe,
		CandidateID:   candidate.ID,
		Decision:      domainsemantic.CandidateDecisionReject,
		Status:        domainsemantic.CandidateDecisionStatusApplied,
	})
	if err != nil {
		t.Fatalf("list rejection decisions: %v", err)
	}
	if len(decisions) != 1 || decisions[0].TargetID == nil || *decisions[0].TargetID != target.ID {
		t.Fatalf("rejection decisions = %+v, want one decision applied to target", decisions)
	}
	reviewEvents, err := service.ListReviewEvents(ctx, ReviewEventFilter{
		ProjectID:   1,
		SubjectType: domainsemantic.WorkItemTargetTypeKeyframe,
		SubjectID:   target.ID,
		EventType:   domainsemantic.ReviewEventTypeApplied,
	})
	if err != nil {
		t.Fatalf("list rejection review events: %v", err)
	}
	if len(reviewEvents) != 1 || reviewEvents[0].ToStatus != domainsemantic.CandidateDecisionReject || metadataKeyframeCandidateID(reviewEvents[0].MetadataJSON) != candidate.ID {
		t.Fatalf("rejection review events = %+v, want one reject event for rejected candidate", reviewEvents)
	}
	_, err = service.PatchKeyframe(ctx, 1, strconv.FormatUint(uint64(candidate.ID), 10), KeyframeInput{
		ResourceID:   &resource.ID,
		Title:        candidate.Title,
		Status:       "rejected",
		MetadataJSON: candidate.MetadataJSON,
	})
	if err != nil {
		t.Fatalf("PatchKeyframe() reject candidate again: %v", err)
	}
	decisions, err = service.ListCandidateDecisions(ctx, CandidateDecisionFilter{
		ProjectID:     1,
		CandidateType: domainsemantic.WorkItemTargetTypeKeyframe,
		CandidateID:   candidate.ID,
		Decision:      domainsemantic.CandidateDecisionReject,
		Status:        domainsemantic.CandidateDecisionStatusApplied,
	})
	if err != nil {
		t.Fatalf("list rejection decisions after repeated reject: %v", err)
	}
	if len(decisions) != 1 {
		t.Fatalf("rejection decisions after repeated reject = %+v, want one idempotent decision", decisions)
	}
	reviewEvents, err = service.ListReviewEvents(ctx, ReviewEventFilter{
		ProjectID:   1,
		SubjectType: domainsemantic.WorkItemTargetTypeKeyframe,
		SubjectID:   target.ID,
		EventType:   domainsemantic.ReviewEventTypeApplied,
	})
	if err != nil {
		t.Fatalf("list rejection review events after repeated reject: %v", err)
	}
	if len(reviewEvents) != 1 {
		t.Fatalf("rejection review events after repeated reject = %+v, want one idempotent event", reviewEvents)
	}
}

func TestPatchGeneratedKeyframeCandidateRejectWithoutResourcePayloadKeepsResource(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "generated-keyframe.png", FilePath: "/tmp/generated-keyframe.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Hero frame",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	candidate, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		ResourceID:   &resource.ID,
		Title:        "Generated candidate",
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(target.ID), 10) + `}`,
	})
	if err != nil {
		t.Fatalf("create generated candidate: %v", err)
	}

	patched, err := service.PatchKeyframe(ctx, 1, strconv.FormatUint(uint64(candidate.ID), 10), KeyframeInput{
		Title:        candidate.Title,
		Status:       "rejected",
		MetadataJSON: candidate.MetadataJSON,
	})
	if err != nil {
		t.Fatalf("PatchKeyframe() reject candidate without resource payload: %v", err)
	}
	if patched.Status != "rejected" || patched.ResourceID == nil || *patched.ResourceID != resource.ID {
		t.Fatalf("patched candidate = %+v, want rejected candidate retaining resource %d", patched, resource.ID)
	}
	decisions, err := service.ListCandidateDecisions(ctx, CandidateDecisionFilter{
		ProjectID:     1,
		CandidateType: domainsemantic.WorkItemTargetTypeKeyframe,
		CandidateID:   candidate.ID,
		Decision:      domainsemantic.CandidateDecisionReject,
		Status:        domainsemantic.CandidateDecisionStatusApplied,
	})
	if err != nil {
		t.Fatalf("list rejection decisions: %v", err)
	}
	if len(decisions) != 1 || decisions[0].TargetID == nil || *decisions[0].TargetID != target.ID {
		t.Fatalf("rejection decisions = %+v, want one decision applied to target", decisions)
	}
}

func TestPatchGeneratedKeyframeCandidateRejectsUnknownResourceWithoutMetadataPayload(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "generated-keyframe.png", FilePath: "/tmp/generated-keyframe.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Hero frame",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	candidate, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		ResourceID:   &resource.ID,
		Title:        "Generated candidate",
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(target.ID), 10) + `}`,
	})
	if err != nil {
		t.Fatalf("create generated candidate: %v", err)
	}
	missingResourceID := uint(999)

	_, err = service.PatchKeyframe(ctx, 1, strconv.FormatUint(uint64(candidate.ID), 10), KeyframeInput{
		ResourceID: &missingResourceID,
		Status:     "rejected",
	})
	if !errors.Is(err, ErrOwnerNotFound) {
		t.Fatalf("PatchKeyframe() error = %v, want ErrOwnerNotFound", err)
	}
	var reloaded model.Keyframe
	if err := db.First(&reloaded, candidate.ID).Error; err != nil {
		t.Fatalf("reload candidate: %v", err)
	}
	if reloaded.ResourceID == nil || *reloaded.ResourceID != resource.ID || reloaded.Status != "candidate" {
		t.Fatalf("candidate changed despite unknown resource: %+v", reloaded)
	}
}

func TestPatchKeyframeRejectsInvalidGeneratedCandidateTarget(t *testing.T) {
	db := newProductionTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	resource := model.RawResource{OwnerID: 1, Type: "image", Name: "generated-keyframe.png", FilePath: "/tmp/generated-keyframe.png"}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	target, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Hero frame",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create target keyframe: %v", err)
	}
	candidate, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		ResourceID:   &resource.ID,
		Title:        "Generated candidate",
		Status:       "candidate",
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(target.ID), 10) + `}`,
	})
	if err != nil {
		t.Fatalf("create candidate: %v", err)
	}
	subject, err := service.CreateKeyframe(ctx, 1, KeyframeInput{
		Title:  "Patch subject",
		Status: "draft",
	})
	if err != nil {
		t.Fatalf("create patch subject: %v", err)
	}

	_, err = service.PatchKeyframe(ctx, 1, strconv.FormatUint(uint64(subject.ID), 10), KeyframeInput{
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(candidate.ID), 10) + `}`,
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchKeyframe() nested target error = %v, want ErrInvalidInput", err)
	}
	_, err = service.PatchKeyframe(ctx, 1, strconv.FormatUint(uint64(subject.ID), 10), KeyframeInput{
		MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":` + strconv.FormatUint(uint64(subject.ID), 10) + `}`,
	})
	if !errors.As(err, &invalid) {
		t.Fatalf("PatchKeyframe() self target error = %v, want ErrInvalidInput", err)
	}
}

func syncSemanticTestRelations(t *testing.T, db *gorm.DB, item any) {
	t.Helper()
	if err := coregraph.NewWriter(db).Write(context.Background(), item); err != nil {
		t.Fatalf("sync relations for %T: %v", item, err)
	}
}

func newProductionTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "production.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	},
		&model.EntityRelation{},
		&model.Script{},
		&model.ScriptVersion{},
		&model.Production{},
		&model.ProductionTextBlock{},
		&model.Segment{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.RawResource{},
		&model.PreviewTimeline{},
		&model.AssetSlot{},
		&model.WorkItem{},
		&model.CandidateDecision{},
		&model.ReviewEvent{},
		&model.DeliveryVersion{},
	)
}

func seedProductionScriptVersions(t *testing.T, db *gorm.DB, projectID uint) (model.Script, model.ScriptVersion, model.ScriptVersion) {
	t.Helper()
	content := "INT. SHOP - NIGHT\n手机屏幕亮起。"
	script := model.Script{ProjectID: projectID, Title: "Pilot", Content: content, RawSource: content, AuthorID: 1}
	if err := db.Create(&script).Error; err != nil {
		t.Fatalf("create script: %v", err)
	}
	firstVersion := model.ScriptVersion{
		ProjectID:     projectID,
		ScriptID:      script.ID,
		VersionNumber: 1,
		Title:         "Pilot v1",
		SourceType:    "raw",
		Content:       content,
		RawSource:     content,
		Status:        "active",
	}
	if err := db.Create(&firstVersion).Error; err != nil {
		t.Fatalf("create first script version: %v", err)
	}
	secondVersion := model.ScriptVersion{
		ProjectID:     projectID,
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
	return script, firstVersion, secondVersion
}

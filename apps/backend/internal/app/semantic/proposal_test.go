package semantic

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestApplyProductionProposalCreatesTreeInTopologyOrder(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createProposalTestProduction(t, db, 1)

	resp, err := service.ApplyProductionProposal(ctx, 1, ApplyProductionProposalRequest{
		Mode:          "snapshot",
		ProductionID:  production.ID,
		ProposalScope: "production",
		Proposal: &ProposalTree{Segments: []ProposalSegmentNode{{
			ClientID: "segment-1",
			Title:    "Opening",
			SceneMoments: []ProposalSceneMomentNode{{
				ClientID:     "scene-1",
				Title:        "Arrival",
				LocationText: "Apartment",
				ContentUnits: []ProposalContentUnitNode{{
					ClientID:    "shot-1",
					Title:       "Medium shot",
					Description: "Character enters.",
					Keyframes: []ProposalKeyframeNode{{
						ClientID:    "kf-shot-1",
						Title:       "Door reveal",
						Description: "Character appears in the doorway.",
						Prompt:      "medium shot, doorway reveal",
					}},
				}},
				Keyframes: []ProposalKeyframeNode{{
					ClientID:    "kf-scene-1",
					Title:       "Rainy exterior",
					Description: "Rain falls outside the apartment.",
				}},
				CreativeReferences: []ProposalCreativeRefNode{{
					ID:       ptrUint(seedProposalTestCreativeReference(t, db, 1).ID),
					ClientID: "ref-1",
					Name:     "Lin Xia",
					Kind:     "person",
					Role:     "protagonist",
					State: &ProposalCreativeRefState{
						Costume: "red coat",
						Emotion: "tense",
					},
				}},
				AssetSlots: []ProposalAssetSlotNode{{
					ClientID:    "slot-1",
					Name:        "Lin Xia reference",
					Kind:        "image",
					Description: "Character reference image.",
				}},
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply proposal: %v", err)
	}

	if resp.Counts.SegmentsCreated != 1 || resp.Counts.SceneMomentsCreated != 1 || resp.Counts.ContentUnitsCreated != 1 || resp.Counts.CreativeReferencesCreated != 0 || resp.Counts.CreativeReferenceUsages != 1 || resp.Counts.AssetSlotsCreated != 1 || resp.Counts.KeyframesCreated != 2 {
		t.Fatalf("unexpected counts: %+v", resp.Counts)
	}

	var unit model.ContentUnit
	if err := db.First(&unit).Error; err != nil {
		t.Fatalf("load content unit: %v", err)
	}
	if unit.ProductionID == nil || *unit.ProductionID != production.ID {
		t.Fatalf("content unit production id = %v, want %d", unit.ProductionID, production.ID)
	}
	if unit.SegmentID == nil || *unit.SegmentID == 0 {
		t.Fatalf("content unit segment id was not populated")
	}
	if unit.SceneMomentID == nil || *unit.SceneMomentID == 0 {
		t.Fatalf("content unit scene moment id was not populated")
	}

	var usage model.CreativeReferenceUsage
	if err := db.First(&usage).Error; err != nil {
		t.Fatalf("load creative reference usage: %v", err)
	}
	if usage.OwnerID == 0 || usage.CreativeReferenceID == 0 || usage.CreativeReferenceStateID == nil || *usage.CreativeReferenceStateID == 0 {
		t.Fatalf("creative reference usage was not fully linked: %+v", usage)
	}

	var keyframes []model.Keyframe
	if err := db.Order("content_unit_id, scene_moment_id, id").Find(&keyframes).Error; err != nil {
		t.Fatalf("load keyframes: %v", err)
	}
	if len(keyframes) != 2 {
		t.Fatalf("keyframe count = %d, want 2", len(keyframes))
	}
	if keyframes[0].ProductionID == nil || *keyframes[0].ProductionID != production.ID {
		t.Fatalf("keyframe production id = %v, want %d", keyframes[0].ProductionID, production.ID)
	}
	if keyframes[0].SceneMomentID == nil || *keyframes[0].SceneMomentID == 0 {
		t.Fatalf("keyframe scene moment id was not populated")
	}
	if keyframes[1].ContentUnitID == nil || *keyframes[1].ContentUnitID != unit.ID {
		t.Fatalf("content-unit keyframe content unit id = %v, want %d", keyframes[1].ContentUnitID, unit.ID)
	}
}

func TestApplyProductionProposalPersistsScriptBlockBindings(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createProposalTestProduction(t, db, 1)
	script, version, block := seedProposalTestScriptBlock(t, db, 1)

	resp, err := service.ApplyProductionProposal(ctx, 1, ApplyProductionProposalRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Proposal: &ProposalTree{Segments: []ProposalSegmentNode{{
			ClientID:      "segment-1",
			Title:         "Opening",
			ScriptBlockID: &block.ID,
			SceneMoments: []ProposalSceneMomentNode{{
				ClientID:      "scene-1",
				Title:         "Arrival",
				ScriptBlockID: &block.ID,
				ContentUnits: []ProposalContentUnitNode{{
					ClientID:      "shot-1",
					Title:         "Medium shot",
					Description:   "Character enters.",
					ScriptBlockID: &block.ID,
				}},
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply proposal: %v", err)
	}
	if len(resp.Segments) != 1 || resp.Segments[0].ScriptBlockID == nil || *resp.Segments[0].ScriptBlockID != block.ID {
		t.Fatalf("segment script block not persisted: %+v; script %d version %d", resp.Segments, script.ID, version.ID)
	}
	if len(resp.SceneMoments) != 1 || resp.SceneMoments[0].ScriptBlockID == nil || *resp.SceneMoments[0].ScriptBlockID != block.ID {
		t.Fatalf("scene moment script block not persisted: %+v", resp.SceneMoments)
	}
	if len(resp.ContentUnits) != 1 || resp.ContentUnits[0].ScriptBlockID == nil || *resp.ContentUnits[0].ScriptBlockID != block.ID {
		t.Fatalf("content unit script block not persisted: %+v", resp.ContentUnits)
	}
}

func TestApplyProductionProposalRejectsCreativeReferenceWithoutIDAndRollsBack(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createProposalTestProduction(t, db, 1)

	_, err := service.ApplyProductionProposal(ctx, 1, ApplyProductionProposalRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Proposal: &ProposalTree{Segments: []ProposalSegmentNode{{
			ClientID: "segment-1",
			Title:    "Opening",
			SceneMoments: []ProposalSceneMomentNode{{
				ClientID: "scene-1",
				Title:    "Arrival",
				CreativeReferences: []ProposalCreativeRefNode{{
					ClientID: "ref-missing",
					Name:     "Missing id",
				}},
			}},
		}}},
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("error = %v, want ErrInvalidInput", err)
	}

	var segments int64
	if err := db.Model(&model.Segment{}).Count(&segments).Error; err != nil {
		t.Fatalf("count segments: %v", err)
	}
	if segments != 0 {
		t.Fatalf("segments after rollback = %d, want 0", segments)
	}
}

func TestPreviewProductionProposalApplyRollsBack(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createProposalTestProduction(t, db, 1)

	resp, err := service.PreviewProductionProposalApply(ctx, 1, ApplyProductionProposalRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Proposal: &ProposalTree{Segments: []ProposalSegmentNode{{
			ClientID: "segment-preview",
			Title:    "Preview segment",
			SceneMoments: []ProposalSceneMomentNode{{
				ClientID: "scene-preview",
				Title:    "Preview scene",
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("preview proposal: %v", err)
	}
	if !resp.DryRun || resp.Status != "ok" || resp.WouldApply == nil {
		t.Fatalf("unexpected preview envelope: %+v", resp)
	}
	if resp.WouldApply.Counts.SegmentsCreated != 1 || resp.WouldApply.Counts.SceneMomentsCreated != 1 {
		t.Fatalf("unexpected preview counts: %+v", resp.WouldApply.Counts)
	}
	if len(resp.SemanticChanges) != 2 {
		t.Fatalf("semantic changes = %d, want 2: %+v", len(resp.SemanticChanges), resp.SemanticChanges)
	}
	if resp.SemanticChanges[0].Kind != "segment" || resp.SemanticChanges[1].Kind != "scene_moment" {
		t.Fatalf("unexpected semantic changes: %+v", resp.SemanticChanges)
	}
	if len(resp.Warnings) == 0 {
		t.Fatalf("expected preview warnings for sparse scene context")
	}

	var segments int64
	if err := db.Model(&model.Segment{}).Where("project_id = ?", 1).Count(&segments).Error; err != nil {
		t.Fatalf("count segments: %v", err)
	}
	if segments != 0 {
		t.Fatalf("segments after preview = %d, want 0", segments)
	}
	var moments int64
	if err := db.Model(&model.SceneMoment{}).Where("project_id = ?", 1).Count(&moments).Error; err != nil {
		t.Fatalf("count scene moments: %v", err)
	}
	if moments != 0 {
		t.Fatalf("scene moments after preview = %d, want 0", moments)
	}
}

func TestApplyProductionProposalSnapshotDeletesOmittedTree(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createProposalTestProduction(t, db, 1)
	keptSegment := model.Segment{ProjectID: 1, ProductionID: &production.ID, Title: "Kept segment", Status: "draft"}
	removedSegment := model.Segment{ProjectID: 1, ProductionID: &production.ID, Title: "Removed segment", Status: "draft"}
	if err := db.Create(&keptSegment).Error; err != nil {
		t.Fatalf("create kept segment: %v", err)
	}
	if err := db.Create(&removedSegment).Error; err != nil {
		t.Fatalf("create removed segment: %v", err)
	}
	keptMoment := model.SceneMoment{ProjectID: 1, SegmentID: &keptSegment.ID, Title: "Kept moment", Status: "draft"}
	removedMoment := model.SceneMoment{ProjectID: 1, SegmentID: &removedSegment.ID, Title: "Removed moment", Status: "draft"}
	if err := db.Create(&keptMoment).Error; err != nil {
		t.Fatalf("create kept moment: %v", err)
	}
	if err := db.Create(&removedMoment).Error; err != nil {
		t.Fatalf("create removed moment: %v", err)
	}
	reference := seedProposalTestCreativeReference(t, db, 1)
	removedUsage := model.CreativeReferenceUsage{
		ProjectID:           1,
		OwnerType:           "scene_moment",
		OwnerID:             removedMoment.ID,
		CreativeReferenceID: reference.ID,
		Role:                "character",
		Status:              "draft",
	}
	if err := db.Create(&removedUsage).Error; err != nil {
		t.Fatalf("create removed usage: %v", err)
	}

	_, err := service.ApplyProductionProposal(ctx, 1, ApplyProductionProposalRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Proposal: &ProposalTree{Segments: []ProposalSegmentNode{{
			ID:    &keptSegment.ID,
			Title: "Kept segment revised",
			SceneMoments: []ProposalSceneMomentNode{{
				ID:    &keptMoment.ID,
				Title: "Kept moment revised",
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply snapshot proposal: %v", err)
	}

	var removedSegmentCount int64
	if err := db.Model(&model.Segment{}).Where("id = ?", removedSegment.ID).Count(&removedSegmentCount).Error; err != nil {
		t.Fatalf("count removed segment: %v", err)
	}
	if removedSegmentCount != 0 {
		t.Fatalf("removed segment count = %d, want 0", removedSegmentCount)
	}
	var removedMomentCount int64
	if err := db.Model(&model.SceneMoment{}).Where("id = ?", removedMoment.ID).Count(&removedMomentCount).Error; err != nil {
		t.Fatalf("count removed moment: %v", err)
	}
	if removedMomentCount != 0 {
		t.Fatalf("removed moment count = %d, want 0", removedMomentCount)
	}
	var removedUsageCount int64
	if err := db.Model(&model.CreativeReferenceUsage{}).Where("id = ?", removedUsage.ID).Count(&removedUsageCount).Error; err != nil {
		t.Fatalf("count removed usage: %v", err)
	}
	if removedUsageCount != 0 {
		t.Fatalf("removed usage count = %d, want 0", removedUsageCount)
	}
}

func TestApplyProductionProposalRequiresProposal(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)
	production := createProposalTestProduction(t, db, 1)

	_, err := service.ApplyProductionProposal(context.Background(), 1, ApplyProductionProposalRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("error = %v, want ErrInvalidInput", err)
	}
}

func newProposalTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dbName := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	db, err := gorm.Open(sqlite.Open("file:"+dbName+"?mode=memory&cache=shared"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&model.EntityRelation{},
		&model.Project{},
		&model.Script{},
		&model.ScriptVersion{},
		&model.ScriptBlock{},
		&model.Production{},
		&model.Segment{},
		&model.SceneMoment{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.CreativeReference{},
		&model.CreativeReferenceState{},
		&model.CreativeReferenceUsage{},
		&model.CreativeRelationship{},
		&model.AssetSlot{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func createProposalTestProduction(t *testing.T, db *gorm.DB, projectID uint) model.Production {
	t.Helper()
	production := model.Production{
		ProjectID:  projectID,
		Name:       "Demo production",
		Status:     "planning",
		SourceType: "direct",
	}
	if err := db.Create(&production).Error; err != nil {
		t.Fatalf("create production: %v", err)
	}
	return production
}

func seedProposalTestScriptBlock(t *testing.T, db *gorm.DB, projectID uint) (model.Script, model.ScriptVersion, model.ScriptBlock) {
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

func seedProposalTestCreativeReference(t *testing.T, db *gorm.DB, projectID uint) model.CreativeReference {
	t.Helper()
	reference := model.CreativeReference{ProjectID: projectID, Name: "Lin Xia", Kind: "person", Status: "confirmed"}
	if err := db.Create(&reference).Error; err != nil {
		t.Fatalf("create creative reference: %v", err)
	}
	return reference
}

func ptrUint(value uint) *uint {
	return &value
}

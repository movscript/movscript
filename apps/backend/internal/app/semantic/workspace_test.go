package semantic

import (
	"context"
	"errors"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestApplyProductionWorkspaceCreatesTreeInTopologyOrder(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createWorkspaceTestProduction(t, db, 1)

	resp, err := service.ApplyProductionWorkspace(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:          "snapshot",
		ProductionID:  production.ID,
		WorkspaceScope: "production",
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ClientID: "segment-1",
			Title:    "Opening",
			SceneMoments: []WorkspaceSceneMomentNode{{
				ClientID:     "scene-1",
				Title:        "Arrival",
				LocationText: "Apartment",
				ContentUnits: []WorkspaceContentUnitNode{{
					ClientID:    "shot-1",
					Title:       "Medium shot",
					Description: "Character enters.",
					Keyframes: []WorkspaceKeyframeNode{{
						ClientID:    "kf-shot-1",
						Title:       "Door reveal",
						Description: "Character appears in the doorway.",
						Prompt:      "medium shot, doorway reveal",
					}},
				}},
				Keyframes: []WorkspaceKeyframeNode{{
					ClientID:    "kf-scene-1",
					Title:       "Rainy exterior",
					Description: "Rain falls outside the apartment.",
				}},
				CreativeReferences: []WorkspaceCreativeRefNode{{
					ID:       ptrUint(seedWorkspaceTestCreativeReference(t, db, 1).ID),
					ClientID: "ref-1",
					Name:     "Lin Xia",
					Kind:     "person",
					Role:     "protagonist",
					State: &WorkspaceCreativeRefState{
						Costume: "red coat",
						Emotion: "tense",
					},
				}},
				AssetSlots: []WorkspaceAssetSlotNode{{
					ClientID:    "slot-1",
					Name:        "Lin Xia reference",
					Kind:        "image",
					Description: "Character reference image.",
				}},
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply workspace: %v", err)
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

func TestApplyProductionWorkspacePersistsScriptBlockBindings(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createWorkspaceTestProduction(t, db, 1)
	script, version, block := seedWorkspaceTestScriptBlock(t, db, 1)

	resp, err := service.ApplyProductionWorkspace(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ClientID:      "segment-1",
			Title:         "Opening",
			ScriptBlockID: &block.ID,
			SceneMoments: []WorkspaceSceneMomentNode{{
				ClientID:      "scene-1",
				Title:         "Arrival",
				ScriptBlockID: &block.ID,
				ContentUnits: []WorkspaceContentUnitNode{{
					ClientID:      "shot-1",
					Title:         "Medium shot",
					Description:   "Character enters.",
					ScriptBlockID: &block.ID,
				}},
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply workspace: %v", err)
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

func TestApplyProductionWorkspaceInheritsScriptBlockBindings(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createWorkspaceTestProduction(t, db, 1)
	_, _, block := seedWorkspaceTestScriptBlock(t, db, 1)

	resp, err := service.ApplyProductionWorkspace(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ClientID:      "segment-1",
			Title:         "Opening",
			ScriptBlockID: &block.ID,
			SceneMoments: []WorkspaceSceneMomentNode{{
				ClientID: "scene-1",
				Title:    "Arrival",
				ContentUnits: []WorkspaceContentUnitNode{{
					ClientID:    "shot-1",
					Title:       "Medium shot",
					Description: "Character enters.",
				}},
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply workspace: %v", err)
	}
	if len(resp.Segments) != 1 || resp.Segments[0].ScriptBlockID == nil || *resp.Segments[0].ScriptBlockID != block.ID {
		t.Fatalf("segment script block not persisted: %+v", resp.Segments)
	}
	if len(resp.SceneMoments) != 1 || resp.SceneMoments[0].ScriptBlockID == nil || *resp.SceneMoments[0].ScriptBlockID != block.ID {
		t.Fatalf("scene moment did not inherit segment script block: %+v", resp.SceneMoments)
	}
	if len(resp.ContentUnits) != 1 || resp.ContentUnits[0].ScriptBlockID == nil || *resp.ContentUnits[0].ScriptBlockID != block.ID {
		t.Fatalf("content unit did not inherit scene moment script block: %+v", resp.ContentUnits)
	}
}

func TestApplyProductionWorkspaceRejectsCreativeReferenceWithoutIDAndRollsBack(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createWorkspaceTestProduction(t, db, 1)

	_, err := service.ApplyProductionWorkspace(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ClientID: "segment-1",
			Title:    "Opening",
			SceneMoments: []WorkspaceSceneMomentNode{{
				ClientID: "scene-1",
				Title:    "Arrival",
				CreativeReferences: []WorkspaceCreativeRefNode{{
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

func TestPreviewProductionWorkspaceApplyRollsBack(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createWorkspaceTestProduction(t, db, 1)

	resp, err := service.PreviewProductionWorkspaceApply(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ClientID: "segment-preview",
			Title:    "Preview segment",
			SceneMoments: []WorkspaceSceneMomentNode{{
				ClientID: "scene-preview",
				Title:    "Preview scene",
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("preview workspace: %v", err)
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

func TestPreviewProductionWorkspaceReportsContentUnitsAndKeyframes(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createWorkspaceTestProduction(t, db, 1)

	resp, err := service.PreviewProductionWorkspaceApply(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ClientID: "segment-preview",
			Title:    "Preview segment",
			SceneMoments: []WorkspaceSceneMomentNode{{
				ClientID: "scene-preview",
				Title:    "Preview scene",
				ContentUnits: []WorkspaceContentUnitNode{{
					ClientID: "unit-preview",
					Title:    "Preview unit",
					Kind:     "visual",
					Keyframes: []WorkspaceKeyframeNode{{
						ClientID: "unit-keyframe-preview",
						Title:    "Unit keyframe",
					}},
				}},
				Keyframes: []WorkspaceKeyframeNode{{
					ClientID: "scene-keyframe-preview",
					Title:    "Scene keyframe",
				}},
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("preview workspace: %v", err)
	}
	kinds := make([]string, 0, len(resp.SemanticChanges))
	for _, change := range resp.SemanticChanges {
		kinds = append(kinds, change.Kind)
	}
	want := []string{"segment", "scene_moment", "content_unit", "keyframe", "keyframe"}
	if len(kinds) != len(want) {
		t.Fatalf("semantic change kinds = %+v, want %+v", kinds, want)
	}
	for i := range want {
		if kinds[i] != want[i] {
			t.Fatalf("semantic change kinds = %+v, want %+v", kinds, want)
		}
	}
	if resp.SemanticChanges[2].Parent != "Preview segment / Preview scene" {
		t.Fatalf("content unit parent = %q", resp.SemanticChanges[2].Parent)
	}
	if resp.SemanticChanges[3].Parent != "Preview segment / Preview scene / Preview unit" {
		t.Fatalf("unit keyframe parent = %q", resp.SemanticChanges[3].Parent)
	}
}

func TestApplyProductionWorkspaceCreatesAndDeletesWritingExpressions(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createWorkspaceTestProduction(t, db, 1)

	resp, err := service.ApplyProductionWorkspace(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ClientID: "segment-1",
			Title:    "Opening",
			SceneMoments: []WorkspaceSceneMomentNode{{
				ClientID: "scene-1",
				Title:    "Arrival",
				WritingExpressions: []WorkspaceWritingExpressionNode{{
					ClientID: "expr-1",
					Kind:     "dialogue",
					Speaker:  "Lin Xia",
					Text:     "We should leave now.",
					Intent:   "人物表达",
					Order:    1,
				}},
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply workspace: %v", err)
	}
	if resp.Counts.WritingExpressionsCreated != 1 || len(resp.WritingExpressions) != 1 {
		t.Fatalf("writing expression response = %+v count %+v", resp.WritingExpressions, resp.Counts)
	}
	expressionID := resp.WritingExpressions[0].ID

	_, err = service.ApplyProductionWorkspace(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ID:    &resp.Segments[0].ID,
			Title: "Opening",
			SceneMoments: []WorkspaceSceneMomentNode{{
				ID:    &resp.SceneMoments[0].ID,
				Title: "Arrival revised",
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply workspace without expression ownership: %v", err)
	}
	var expressionCount int64
	if err := db.Model(&model.WritingExpression{}).Where("id = ?", expressionID).Count(&expressionCount).Error; err != nil {
		t.Fatalf("count expression: %v", err)
	}
	if expressionCount != 1 {
		t.Fatalf("expression count after omitted field = %d, want 1", expressionCount)
	}

	_, err = service.ApplyProductionWorkspace(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ID:    &resp.Segments[0].ID,
			Title: "Opening",
			SceneMoments: []WorkspaceSceneMomentNode{{
				ID:                 &resp.SceneMoments[0].ID,
				Title:              "Arrival revised again",
				WritingExpressions: []WorkspaceWritingExpressionNode{},
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply workspace deleting expression: %v", err)
	}
	expressionCount = 0
	if err := db.Model(&model.WritingExpression{}).Where("id = ?", expressionID).Count(&expressionCount).Error; err != nil {
		t.Fatalf("count expression after delete: %v", err)
	}
	if expressionCount != 0 {
		t.Fatalf("expression count = %d, want 0", expressionCount)
	}
}

func TestApplyProductionWorkspaceSnapshotDeletesOmittedTree(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createWorkspaceTestProduction(t, db, 1)
	keptSegment := model.Segment{ProjectID: 1, ProductionID: &production.ID, Title: "Kept segment", Status: "workspace"}
	removedSegment := model.Segment{ProjectID: 1, ProductionID: &production.ID, Title: "Removed segment", Status: "workspace"}
	if err := db.Create(&keptSegment).Error; err != nil {
		t.Fatalf("create kept segment: %v", err)
	}
	syncSemanticTestRelations(t, db, &keptSegment)
	if err := db.Create(&removedSegment).Error; err != nil {
		t.Fatalf("create removed segment: %v", err)
	}
	syncSemanticTestRelations(t, db, &removedSegment)
	keptMoment := model.SceneMoment{ProjectID: 1, SegmentID: &keptSegment.ID, Title: "Kept moment", Status: "workspace"}
	removedMoment := model.SceneMoment{ProjectID: 1, SegmentID: &removedSegment.ID, Title: "Removed moment", Status: "workspace"}
	if err := db.Create(&keptMoment).Error; err != nil {
		t.Fatalf("create kept moment: %v", err)
	}
	syncSemanticTestRelations(t, db, &keptMoment)
	keptUnit := model.ContentUnit{ProjectID: 1, ProductionID: &production.ID, SegmentID: &keptSegment.ID, SceneMomentID: &keptMoment.ID, Title: "Downstream unit", Kind: "shot", Status: "workspace"}
	if err := db.Create(&keptUnit).Error; err != nil {
		t.Fatalf("create kept content unit: %v", err)
	}
	syncSemanticTestRelations(t, db, &keptUnit)
	keptKeyframe := model.Keyframe{ProjectID: 1, ProductionID: &production.ID, SceneMomentID: &keptMoment.ID, ContentUnitID: &keptUnit.ID, Title: "Downstream keyframe", Status: "generated"}
	if err := db.Create(&keptKeyframe).Error; err != nil {
		t.Fatalf("create kept keyframe: %v", err)
	}
	syncSemanticTestRelations(t, db, &keptKeyframe)
	keptSlot := model.AssetSlot{ProjectID: 1, ProductionID: &production.ID, OwnerType: "scene_moment", OwnerID: &keptMoment.ID, Name: "Downstream asset", Kind: "image", Status: "missing"}
	if err := db.Create(&keptSlot).Error; err != nil {
		t.Fatalf("create kept asset slot: %v", err)
	}
	syncSemanticTestRelations(t, db, &keptSlot)
	if err := db.Create(&removedMoment).Error; err != nil {
		t.Fatalf("create removed moment: %v", err)
	}
	syncSemanticTestRelations(t, db, &removedMoment)
	reference := seedWorkspaceTestCreativeReference(t, db, 1)
	removedUsage := model.CreativeReferenceUsage{
		ProjectID:           1,
		OwnerType:           "scene_moment",
		OwnerID:             removedMoment.ID,
		CreativeReferenceID: reference.ID,
		Role:                "character",
		Status:              "workspace",
	}
	if err := db.Create(&removedUsage).Error; err != nil {
		t.Fatalf("create removed usage: %v", err)
	}
	syncSemanticTestRelations(t, db, &removedUsage)

	_, err := service.ApplyProductionWorkspace(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ID:    &keptSegment.ID,
			Title: "Kept segment revised",
			SceneMoments: []WorkspaceSceneMomentNode{{
				ID:    &keptMoment.ID,
				Title: "Kept moment revised",
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply snapshot workspace: %v", err)
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
	var keptUnitCount int64
	if err := db.Model(&model.ContentUnit{}).Where("id = ?", keptUnit.ID).Count(&keptUnitCount).Error; err != nil {
		t.Fatalf("count kept content unit: %v", err)
	}
	if keptUnitCount != 1 {
		t.Fatalf("kept content unit count = %d, want 1", keptUnitCount)
	}
	var keptKeyframeCount int64
	if err := db.Model(&model.Keyframe{}).Where("id = ?", keptKeyframe.ID).Count(&keptKeyframeCount).Error; err != nil {
		t.Fatalf("count kept keyframe: %v", err)
	}
	if keptKeyframeCount != 1 {
		t.Fatalf("kept keyframe count = %d, want 1", keptKeyframeCount)
	}
	var keptSlotCount int64
	if err := db.Model(&model.AssetSlot{}).Where("id = ?", keptSlot.ID).Count(&keptSlotCount).Error; err != nil {
		t.Fatalf("count kept asset slot: %v", err)
	}
	if keptSlotCount != 1 {
		t.Fatalf("kept asset slot count = %d, want 1", keptSlotCount)
	}
}

func TestApplyProductionWorkspaceReusesExistingCreativeReferenceUsage(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createWorkspaceTestProduction(t, db, 1)
	segment := model.Segment{ProjectID: 1, ProductionID: &production.ID, Title: "Current segment", Status: "workspace"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	syncSemanticTestRelations(t, db, &segment)
	moment := model.SceneMoment{ProjectID: 1, SegmentID: &segment.ID, Title: "Current moment", Status: "workspace"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create moment: %v", err)
	}
	syncSemanticTestRelations(t, db, &moment)
	reference := seedWorkspaceTestCreativeReference(t, db, 1)
	usage := model.CreativeReferenceUsage{
		ProjectID:           1,
		OwnerType:           "scene_moment",
		OwnerID:             moment.ID,
		CreativeReferenceID: reference.ID,
		Role:                "protagonist",
		Source:              "manual",
		Status:              "workspace",
	}
	if err := db.Create(&usage).Error; err != nil {
		t.Fatalf("create usage: %v", err)
	}
	syncSemanticTestRelations(t, db, &usage)

	noChangeResp, err := service.ApplyProductionWorkspace(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ID:    &segment.ID,
			Title: "Current segment",
			SceneMoments: []WorkspaceSceneMomentNode{{
				ID:    &moment.ID,
				Title: "Current moment",
				CreativeReferences: []WorkspaceCreativeRefNode{{
					ID:   &reference.ID,
					Name: reference.Name,
					Role: "protagonist",
				}},
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply unchanged usage workspace: %v", err)
	}
	if noChangeResp.Counts.CreativeReferenceUsages != 0 {
		t.Fatalf("unchanged usage count = %d, want 0", noChangeResp.Counts.CreativeReferenceUsages)
	}
	var usageCount int64
	if err := db.Model(&model.CreativeReferenceUsage{}).Where("owner_type = ? AND owner_id = ? AND creative_reference_id = ?", "scene_moment", moment.ID, reference.ID).Count(&usageCount).Error; err != nil {
		t.Fatalf("count usages: %v", err)
	}
	if usageCount != 1 {
		t.Fatalf("usage count after unchanged apply = %d, want 1", usageCount)
	}

	changedResp, err := service.ApplyProductionWorkspace(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ID:    &segment.ID,
			Title: "Current segment",
			SceneMoments: []WorkspaceSceneMomentNode{{
				ID:    &moment.ID,
				Title: "Current moment",
				CreativeReferences: []WorkspaceCreativeRefNode{{
					ID:   &reference.ID,
					Name: reference.Name,
					Role: "supporting",
				}},
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply changed usage workspace: %v", err)
	}
	if changedResp.Counts.CreativeReferenceUsages != 1 {
		t.Fatalf("changed usage count = %d, want 1", changedResp.Counts.CreativeReferenceUsages)
	}
	var patchedUsage model.CreativeReferenceUsage
	if err := db.First(&patchedUsage, usage.ID).Error; err != nil {
		t.Fatalf("load patched usage: %v", err)
	}
	if patchedUsage.Role != "supporting" {
		t.Fatalf("usage role = %q, want supporting", patchedUsage.Role)
	}
	if err := db.Model(&model.CreativeReferenceUsage{}).Where("owner_type = ? AND owner_id = ? AND creative_reference_id = ?", "scene_moment", moment.ID, reference.ID).Count(&usageCount).Error; err != nil {
		t.Fatalf("count usages after patch: %v", err)
	}
	if usageCount != 1 {
		t.Fatalf("usage count after changed apply = %d, want 1", usageCount)
	}
}

func TestApplyProductionWorkspaceDeletesOmittedCreativeReferenceUsageOnKeptMoment(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createWorkspaceTestProduction(t, db, 1)
	segment := model.Segment{ProjectID: 1, ProductionID: &production.ID, Title: "Current segment", Status: "workspace"}
	if err := db.Create(&segment).Error; err != nil {
		t.Fatalf("create segment: %v", err)
	}
	syncSemanticTestRelations(t, db, &segment)
	moment := model.SceneMoment{ProjectID: 1, SegmentID: &segment.ID, Title: "Current moment", Status: "workspace"}
	if err := db.Create(&moment).Error; err != nil {
		t.Fatalf("create moment: %v", err)
	}
	syncSemanticTestRelations(t, db, &moment)
	keptReference := seedWorkspaceTestCreativeReference(t, db, 1)
	removedReference := seedWorkspaceTestCreativeReference(t, db, 1)
	removedReference.Name = "Removed ref"
	if err := db.Save(&removedReference).Error; err != nil {
		t.Fatalf("rename removed reference: %v", err)
	}
	keptUsage := model.CreativeReferenceUsage{
		ProjectID:           1,
		OwnerType:           "scene_moment",
		OwnerID:             moment.ID,
		CreativeReferenceID: keptReference.ID,
		Role:                "protagonist",
		Status:              "workspace",
	}
	removedUsage := model.CreativeReferenceUsage{
		ProjectID:           1,
		OwnerType:           "scene_moment",
		OwnerID:             moment.ID,
		CreativeReferenceID: removedReference.ID,
		Role:                "supporting",
		Status:              "workspace",
	}
	if err := db.Create(&keptUsage).Error; err != nil {
		t.Fatalf("create kept usage: %v", err)
	}
	syncSemanticTestRelations(t, db, &keptUsage)
	if err := db.Create(&removedUsage).Error; err != nil {
		t.Fatalf("create removed usage: %v", err)
	}
	syncSemanticTestRelations(t, db, &removedUsage)

	_, err := service.ApplyProductionWorkspace(ctx, 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
		Workspace: &WorkspaceTree{Segments: []WorkspaceSegmentNode{{
			ID:    &segment.ID,
			Title: "Current segment",
			SceneMoments: []WorkspaceSceneMomentNode{{
				ID:    &moment.ID,
				Title: "Current moment",
				CreativeReferences: []WorkspaceCreativeRefNode{{
					ID:   &keptReference.ID,
					Name: keptReference.Name,
					Role: "protagonist",
				}},
			}},
		}}},
	})
	if err != nil {
		t.Fatalf("apply omitted usage workspace: %v", err)
	}

	var keptCount int64
	if err := db.Model(&model.CreativeReferenceUsage{}).Where("id = ?", keptUsage.ID).Count(&keptCount).Error; err != nil {
		t.Fatalf("count kept usage: %v", err)
	}
	if keptCount != 1 {
		t.Fatalf("kept usage count = %d, want 1", keptCount)
	}
	var removedCount int64
	if err := db.Model(&model.CreativeReferenceUsage{}).Where("id = ?", removedUsage.ID).Count(&removedCount).Error; err != nil {
		t.Fatalf("count removed usage: %v", err)
	}
	if removedCount != 0 {
		t.Fatalf("removed usage count = %d, want 0", removedCount)
	}
}

func TestApplyProductionWorkspaceRequiresWorkspace(t *testing.T) {
	db := newWorkspaceTestDB(t)
	service := NewService(db)
	production := createWorkspaceTestProduction(t, db, 1)

	_, err := service.ApplyProductionWorkspace(context.Background(), 1, ApplyProductionWorkspaceRequest{
		Mode:         "snapshot",
		ProductionID: production.ID,
	})
	var invalid ErrInvalidInput
	if !errors.As(err, &invalid) {
		t.Fatalf("error = %v, want ErrInvalidInput", err)
	}
}

func newWorkspaceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLiteWithConfig(t, "workspace.db", &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	},
		&model.EntityRelation{},
		&model.Project{},
		&model.Script{},
		&model.ScriptVersion{},
		&model.ScriptBlock{},
		&model.Production{},
		&model.Segment{},
		&model.SceneMoment{},
		&model.WritingExpression{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.CreativeReference{},
		&model.CreativeReferenceState{},
		&model.CreativeReferenceUsage{},
		&model.CreativeRelationship{},
		&model.AssetSlot{},
	)
}

func createWorkspaceTestProduction(t *testing.T, db *gorm.DB, projectID uint) model.Production {
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

func seedWorkspaceTestScriptBlock(t *testing.T, db *gorm.DB, projectID uint) (model.Script, model.ScriptVersion, model.ScriptBlock) {
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

func seedWorkspaceTestCreativeReference(t *testing.T, db *gorm.DB, projectID uint) model.CreativeReference {
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

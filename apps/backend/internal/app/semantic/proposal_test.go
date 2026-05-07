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
		ProductionID:  production.ID,
		AnalysisScope: "production",
		Proposal: &ProposalTree{Segments: []ProposalSegmentNode{{
			Action:   "create",
			ClientID: "segment-1",
			Title:    "Opening",
			SceneMoments: []ProposalSceneMomentNode{{
				Action:       "create",
				ClientID:     "scene-1",
				Title:        "Arrival",
				LocationText: "Apartment",
				ContentUnits: []ProposalContentUnitNode{{
					Action:      "create",
					ClientID:    "shot-1",
					Title:       "Medium shot",
					Description: "Character enters.",
					Keyframes: []ProposalKeyframeNode{{
						Action:      "create",
						ClientID:    "kf-shot-1",
						Title:       "Door reveal",
						Description: "Character appears in the doorway.",
						Prompt:      "medium shot, doorway reveal",
					}},
				}},
				Keyframes: []ProposalKeyframeNode{{
					Action:      "create",
					ClientID:    "kf-scene-1",
					Title:       "Rainy exterior",
					Description: "Rain falls outside the apartment.",
				}},
				CreativeReferences: []ProposalCreativeRefNode{{
					Action:   "create",
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
					Action:      "create",
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

	if resp.Counts.SegmentsCreated != 1 || resp.Counts.SceneMomentsCreated != 1 || resp.Counts.ContentUnitsCreated != 1 || resp.Counts.CreativeReferencesCreated != 1 || resp.Counts.CreativeReferenceUsages != 1 || resp.Counts.AssetSlotsCreated != 1 || resp.Counts.KeyframesCreated != 2 {
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

func TestApplyProductionProposalRejectsReuseWithoutIDAndRollsBack(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)
	ctx := context.Background()
	production := createProposalTestProduction(t, db, 1)

	_, err := service.ApplyProductionProposal(ctx, 1, ApplyProductionProposalRequest{
		ProductionID: production.ID,
		Proposal: &ProposalTree{Segments: []ProposalSegmentNode{{
			Action:   "create",
			ClientID: "segment-1",
			Title:    "Opening",
			SceneMoments: []ProposalSceneMomentNode{{
				Action:   "create",
				ClientID: "scene-1",
				Title:    "Arrival",
				ContentUnits: []ProposalContentUnitNode{{
					Action:   "reuse",
					ClientID: "shot-1",
					Title:    "Existing shot",
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

func TestApplyProductionProposalRequiresProposal(t *testing.T) {
	db := newProposalTestDB(t)
	service := NewService(db)
	production := createProposalTestProduction(t, db, 1)

	_, err := service.ApplyProductionProposal(context.Background(), 1, ApplyProductionProposalRequest{
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
		&model.Production{},
		&model.Segment{},
		&model.SceneMoment{},
		&model.ContentUnit{},
		&model.Keyframe{},
		&model.CreativeReference{},
		&model.CreativeReferenceState{},
		&model.CreativeReferenceUsage{},
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

package semantic

import (
	"context"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type ProposalSegmentNode struct {
	Action       string                    `json:"action"`
	ID           *uint                     `json:"id"`
	ClientID     string                    `json:"client_id"`
	Title        string                    `json:"title"`
	Kind         string                    `json:"kind"`
	Summary      string                    `json:"summary"`
	Order        int                       `json:"order"`
	Status       string                    `json:"status"`
	SceneMoments []ProposalSceneMomentNode `json:"scene_moments"`
}

type ProposalSceneMomentNode struct {
	Action             string                    `json:"action"`
	ID                 *uint                     `json:"id"`
	ClientID           string                    `json:"client_id"`
	Title              string                    `json:"title"`
	TimeText           string                    `json:"time_text"`
	LocationText       string                    `json:"location_text"`
	ActionText         string                    `json:"action_text"`
	Mood               string                    `json:"mood"`
	Description        string                    `json:"description"`
	Order              int                       `json:"order"`
	Status             string                    `json:"status"`
	ContentUnits       []ProposalContentUnitNode `json:"content_units"`
	CreativeReferences []ProposalCreativeRefNode `json:"creative_references"`
	AssetSlots         []ProposalAssetSlotNode   `json:"asset_slots"`
}

type ProposalContentUnitNode struct {
	Action      string  `json:"action"`
	ID          *uint   `json:"id"`
	ClientID    string  `json:"client_id"`
	Title       string  `json:"title"`
	Kind        string  `json:"kind"`
	Description string  `json:"description"`
	ShotSize    string  `json:"shot_size"`
	CameraAngle string  `json:"camera_angle"`
	DurationSec float64 `json:"duration_sec"`
	Order       int     `json:"order"`
	Status      string  `json:"status"`
}

type ProposalCreativeRefNode struct {
	Action   string                    `json:"action"`
	ID       *uint                     `json:"id"`
	ClientID string                    `json:"client_id"`
	Name     string                    `json:"name"`
	Kind     string                    `json:"kind"`
	Role     string                    `json:"role"`
	State    *ProposalCreativeRefState `json:"state"`
}

type ProposalCreativeRefState struct {
	Costume     string `json:"costume"`
	Emotion     string `json:"emotion"`
	Props       string `json:"props"`
	VisualNotes string `json:"visual_notes"`
}

type ProposalAssetSlotNode struct {
	Action      string `json:"action"`
	ID          *uint  `json:"id"`
	ClientID    string `json:"client_id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Description string `json:"description"`
	Priority    string `json:"priority"`
}

type ApplyProductionProposalRequest struct {
	ProductionID  uint          `json:"production_id" binding:"required"`
	AnalysisScope string        `json:"analysis_scope"`
	Proposal      *ProposalTree `json:"proposal"`
}

type ProposalTree struct {
	Segments []ProposalSegmentNode `json:"segments"`
}

type ApplyProductionProposalResponse struct {
	ProductionID uint                `json:"production_id"`
	Counts       ProposalApplyCounts `json:"counts"`
	Segments     []model.Segment     `json:"segments"`
	SceneMoments []model.SceneMoment `json:"scene_moments"`
	ContentUnits []model.ContentUnit `json:"content_units"`
	AssetSlots   []model.AssetSlot   `json:"asset_slots"`
}

type ProposalApplyCounts struct {
	SegmentsCreated           int `json:"segments_created"`
	SceneMomentsCreated       int `json:"scene_moments_created"`
	ContentUnitsCreated       int `json:"content_units_created"`
	AssetSlotsCreated         int `json:"asset_slots_created"`
	CreativeReferencesCreated int `json:"creative_references_created"`
	CreativeReferenceUsages   int `json:"creative_reference_usages"`
}

func (s *Service) ApplyProductionProposal(ctx context.Context, projectID uint, req ApplyProductionProposalRequest) (*ApplyProductionProposalResponse, error) {
	resp := &ApplyProductionProposalResponse{ProductionID: req.ProductionID}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txSvc := NewService(tx)

		for i, segNode := range req.Proposal.Segments {
			var segmentID uint
			if segNode.Action == "reuse" && segNode.ID != nil {
				segmentID = *segNode.ID
			} else if segNode.Action == "create" || segNode.Action == "" {
				seg, err := txSvc.CreateSegment(ctx, projectID, CreateSegmentInput{
					ProductionID: &req.ProductionID,
					Kind:         fallbackString(segNode.Kind, "section"),
					Order:        fallbackInt(segNode.Order, i+1),
					Title:        segNode.Title,
					Summary:      segNode.Summary,
					Status:       fallbackString(segNode.Status, "draft"),
				})
				if err != nil {
					return err
				}
				resp.Segments = append(resp.Segments, seg)
				resp.Counts.SegmentsCreated++
				segmentID = seg.ID
			}

			for j, smNode := range segNode.SceneMoments {
				var sceneMomentID uint
				if smNode.Action == "reuse" && smNode.ID != nil {
					sceneMomentID = *smNode.ID
				} else if smNode.Action == "create" || smNode.Action == "" {
					segIDPtr := &segmentID
					sm, err := txSvc.CreateSceneMoment(ctx, projectID, CreateSceneMomentInput{
						SegmentID:    segIDPtr,
						Order:        fallbackInt(smNode.Order, j+1),
						Title:        smNode.Title,
						Description:  smNode.Description,
						TimeText:     smNode.TimeText,
						LocationText: smNode.LocationText,
						ActionText:   smNode.ActionText,
						Mood:         smNode.Mood,
						Status:       fallbackString(smNode.Status, "draft"),
					})
					if err != nil {
						return err
					}
					resp.SceneMoments = append(resp.SceneMoments, sm)
					resp.Counts.SceneMomentsCreated++
					sceneMomentID = sm.ID
				}

				for _, crNode := range smNode.CreativeReferences {
					var refID uint
					if crNode.Action == "reuse" && crNode.ID != nil {
						refID = *crNode.ID
					} else if crNode.Action == "create" || crNode.Action == "" {
						ref, err := txSvc.CreateCreativeReference(ctx, projectID, CreativeReferenceInput{
							Kind:       fallbackString(crNode.Kind, "character"),
							Name:       crNode.Name,
							Importance: "supporting",
							Status:     "draft",
						})
						if err != nil {
							return err
						}
						resp.Counts.CreativeReferencesCreated++
						refID = ref.ID
					}

					if refID > 0 && sceneMomentID > 0 {
						var stateID *uint
						if crNode.State != nil {
							state, err := txSvc.CreateCreativeReferenceState(ctx, projectID, CreativeReferenceStateInput{
								CreativeReferenceID: refID,
								ScopeType:           "scene_moment",
								ScopeID:             &sceneMomentID,
								Name:                crNode.Name,
								Costume:             crNode.State.Costume,
								Emotion:             crNode.State.Emotion,
								Props:               crNode.State.Props,
								VisualNotes:         crNode.State.VisualNotes,
								Status:              "draft",
							})
							if err != nil {
								return err
							}
							stateID = &state.ID
						}
						_, err := txSvc.CreateCreativeReferenceUsage(ctx, projectID, CreativeReferenceUsageInput{
							OwnerType:                "scene_moment",
							OwnerID:                  sceneMomentID,
							CreativeReferenceID:      refID,
							CreativeReferenceStateID: stateID,
							Role:                     crNode.Role,
							Source:                   "agent_proposal",
							Status:                   "draft",
						})
						if err != nil {
							return err
						}
						resp.Counts.CreativeReferenceUsages++
					}
				}

				for k, cuNode := range smNode.ContentUnits {
					if cuNode.Action == "reuse" {
						continue
					}
					smIDPtr := &sceneMomentID
					prodIDPtr := &req.ProductionID
					segIDPtr := &segmentID
					cu, err := txSvc.CreateContentUnit(ctx, projectID, ContentUnitInput{
						ProductionID:  prodIDPtr,
						SegmentID:     segIDPtr,
						SceneMomentID: smIDPtr,
						Kind:          fallbackString(cuNode.Kind, "shot"),
						Order:         fallbackInt(cuNode.Order, k+1),
						Title:         cuNode.Title,
						Description:   cuNode.Description,
						ShotSize:      cuNode.ShotSize,
						CameraAngle:   cuNode.CameraAngle,
						DurationSec:   cuNode.DurationSec,
						Status:        fallbackString(cuNode.Status, "draft"),
					})
					if err != nil {
						return err
					}
					resp.ContentUnits = append(resp.ContentUnits, cu)
					resp.Counts.ContentUnitsCreated++
				}

				for _, asNode := range smNode.AssetSlots {
					if asNode.Action == "reuse" {
						continue
					}
					smIDPtr := &sceneMomentID
					prodIDPtr := &req.ProductionID
					slot, err := txSvc.CreateAssetSlot(ctx, projectID, AssetSlotInput{
						ProductionID: prodIDPtr,
						OwnerType:    "scene_moment",
						OwnerID:      smIDPtr,
						Kind:         fallbackString(asNode.Kind, "image"),
						Name:         asNode.Name,
						Description:  asNode.Description,
						Priority:     fallbackString(asNode.Priority, "normal"),
						Status:       "draft",
					})
					if err != nil {
						return err
					}
					resp.AssetSlots = append(resp.AssetSlots, slot)
					resp.Counts.AssetSlotsCreated++
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return resp, nil
}

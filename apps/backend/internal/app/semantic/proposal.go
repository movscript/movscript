package semantic

import (
	"context"
	"errors"
	"fmt"

	"github.com/movscript/movscript/internal/domain/model"
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
	if projectID == 0 {
		return nil, ErrInvalidInput{Err: errors.New("project id is required")}
	}
	if req.ProductionID == 0 {
		return nil, ErrInvalidInput{Err: errors.New("production_id is required")}
	}
	if req.Proposal == nil {
		return nil, ErrInvalidInput{Err: errors.New("proposal is required")}
	}
	if err := s.ensureProductionInProject(ctx, projectID, req.ProductionID); err != nil {
		return nil, err
	}
	resp := &ApplyProductionProposalResponse{ProductionID: req.ProductionID}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		txSvc := NewService(tx)

		for i, segNode := range req.Proposal.Segments {
			var segmentID uint
			switch normalizeProposalAction(segNode.Action) {
			case "reuse":
				if segNode.ID == nil {
					return missingProposalID("segment", segNode.ClientID, "reuse")
				}
				if err := txSvc.ensureSegmentInProject(ctx, projectID, *segNode.ID); err != nil {
					return err
				}
				segmentID = *segNode.ID
			case "update":
				if segNode.ID == nil {
					return missingProposalID("segment", segNode.ClientID, "update")
				}
				seg, err := txSvc.PatchSegment(ctx, projectID, fmt.Sprint(*segNode.ID), PatchSegmentInput{
					ProductionID: &req.ProductionID,
					Kind:         segNode.Kind,
					Order:        segNode.Order,
					Title:        segNode.Title,
					Summary:      segNode.Summary,
					Status:       segNode.Status,
				})
				if err != nil {
					return err
				}
				segmentID = seg.ID
			case "create":
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
			default:
				return invalidProposalAction("segment", segNode.ClientID, segNode.Action)
			}

			for j, smNode := range segNode.SceneMoments {
				var sceneMomentID uint
				switch normalizeProposalAction(smNode.Action) {
				case "reuse":
					if smNode.ID == nil {
						return missingProposalID("scene_moment", smNode.ClientID, "reuse")
					}
					if err := txSvc.ensureSceneMomentInProject(ctx, projectID, *smNode.ID); err != nil {
						return err
					}
					sceneMomentID = *smNode.ID
				case "update":
					if smNode.ID == nil {
						return missingProposalID("scene_moment", smNode.ClientID, "update")
					}
					segIDPtr := &segmentID
					sm, err := txSvc.PatchSceneMoment(ctx, projectID, fmt.Sprint(*smNode.ID), PatchSceneMomentInput{
						SegmentID:    segIDPtr,
						Order:        smNode.Order,
						Title:        smNode.Title,
						Description:  smNode.Description,
						TimeText:     smNode.TimeText,
						LocationText: smNode.LocationText,
						ActionText:   smNode.ActionText,
						Mood:         smNode.Mood,
						Status:       smNode.Status,
					})
					if err != nil {
						return err
					}
					sceneMomentID = sm.ID
				case "create":
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
				default:
					return invalidProposalAction("scene_moment", smNode.ClientID, smNode.Action)
				}

				for _, crNode := range smNode.CreativeReferences {
					var refID uint
					switch normalizeProposalAction(crNode.Action) {
					case "reuse":
						if crNode.ID == nil {
							return missingProposalID("creative_reference", crNode.ClientID, "reuse")
						}
						if err := txSvc.ensureCreativeReferenceInProject(ctx, projectID, *crNode.ID); err != nil {
							return err
						}
						refID = *crNode.ID
					case "update":
						if crNode.ID == nil {
							return missingProposalID("creative_reference", crNode.ClientID, "update")
						}
						ref, err := txSvc.PatchCreativeReference(ctx, projectID, fmt.Sprint(*crNode.ID), CreativeReferenceInput{
							Kind:   crNode.Kind,
							Name:   crNode.Name,
							Status: "draft",
						})
						if err != nil {
							return err
						}
						refID = ref.ID
					case "create":
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
					default:
						return invalidProposalAction("creative_reference", crNode.ClientID, crNode.Action)
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
					switch normalizeProposalAction(cuNode.Action) {
					case "reuse":
						if cuNode.ID == nil {
							return missingProposalID("content_unit", cuNode.ClientID, "reuse")
						}
						if err := txSvc.ensureContentUnitInProject(ctx, projectID, *cuNode.ID); err != nil {
							return err
						}
						continue
					case "update":
						if cuNode.ID == nil {
							return missingProposalID("content_unit", cuNode.ClientID, "update")
						}
						smIDPtr := &sceneMomentID
						prodIDPtr := &req.ProductionID
						segIDPtr := &segmentID
						if _, err := txSvc.PatchContentUnit(ctx, projectID, fmt.Sprint(*cuNode.ID), ContentUnitInput{
							ProductionID:  prodIDPtr,
							SegmentID:     segIDPtr,
							SceneMomentID: smIDPtr,
							Kind:          cuNode.Kind,
							Order:         cuNode.Order,
							Title:         cuNode.Title,
							Description:   cuNode.Description,
							ShotSize:      cuNode.ShotSize,
							CameraAngle:   cuNode.CameraAngle,
							DurationSec:   cuNode.DurationSec,
							Status:        cuNode.Status,
						}); err != nil {
							return err
						}
						continue
					case "create":
					default:
						return invalidProposalAction("content_unit", cuNode.ClientID, cuNode.Action)
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
					switch normalizeProposalAction(asNode.Action) {
					case "reuse":
						if asNode.ID == nil {
							return missingProposalID("asset_slot", asNode.ClientID, "reuse")
						}
						if err := txSvc.ensureAssetSlotInProject(ctx, projectID, *asNode.ID); err != nil {
							return err
						}
						continue
					case "update":
						if asNode.ID == nil {
							return missingProposalID("asset_slot", asNode.ClientID, "update")
						}
						smIDPtr := &sceneMomentID
						prodIDPtr := &req.ProductionID
						if _, err := txSvc.PatchAssetSlot(ctx, projectID, fmt.Sprint(*asNode.ID), PatchAssetSlotInput{
							ProductionID: prodIDPtr,
							OwnerType:    "scene_moment",
							OwnerID:      smIDPtr,
							Kind:         asNode.Kind,
							Name:         asNode.Name,
							Description:  asNode.Description,
							Priority:     asNode.Priority,
							Status:       "draft",
						}); err != nil {
							return err
						}
						continue
					case "create":
					default:
						return invalidProposalAction("asset_slot", asNode.ClientID, asNode.Action)
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

func normalizeProposalAction(action string) string {
	if action == "" {
		return "create"
	}
	return action
}

func missingProposalID(kind string, clientID string, action string) error {
	return ErrInvalidInput{Err: fmt.Errorf("%s proposal %q requires id for action %q", kind, clientID, action)}
}

func invalidProposalAction(kind string, clientID string, action string) error {
	return ErrInvalidInput{Err: fmt.Errorf("%s proposal %q has unsupported action %q", kind, clientID, action)}
}

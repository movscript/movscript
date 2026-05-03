package handler

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

// ProposalSegmentNode is one segment in the tree-form proposal.
type ProposalSegmentNode struct {
	Action      string                    `json:"action"` // create | reuse | update
	ID          *uint                     `json:"id"`
	ClientID    string                    `json:"client_id"`
	Title       string                    `json:"title"`
	Kind        string                    `json:"kind"`
	Summary     string                    `json:"summary"`
	Order       int                       `json:"order"`
	Status      string                    `json:"status"`
	SceneMoments []ProposalSceneMomentNode `json:"scene_moments"`
}

type ProposalSceneMomentNode struct {
	Action             string                       `json:"action"`
	ID                 *uint                        `json:"id"`
	ClientID           string                       `json:"client_id"`
	Title              string                       `json:"title"`
	TimeText           string                       `json:"time_text"`
	LocationText       string                       `json:"location_text"`
	ActionText         string                       `json:"action_text"`
	Mood               string                       `json:"mood"`
	Description        string                       `json:"description"`
	Order              int                          `json:"order"`
	Status             string                       `json:"status"`
	ContentUnits       []ProposalContentUnitNode    `json:"content_units"`
	CreativeReferences []ProposalCreativeRefNode    `json:"creative_references"`
	AssetSlots         []ProposalAssetSlotNode      `json:"asset_slots"`
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
	Action   string                    `json:"action"` // create | reuse
	ID       *uint                     `json:"id"`     // required for reuse
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
	ProductionID  uint                  `json:"production_id" binding:"required"`
	AnalysisScope string                `json:"analysis_scope"`
	Proposal      *ProposalTree         `json:"proposal"`
}

type ProposalTree struct {
	Segments []ProposalSegmentNode `json:"segments"`
}

type ApplyProductionProposalResponse struct {
	ProductionID uint                    `json:"production_id"`
	Counts       ProposalApplyCounts     `json:"counts"`
	Segments     []model.Segment         `json:"segments"`
	SceneMoments []model.SceneMoment     `json:"scene_moments"`
	ContentUnits []model.ContentUnit     `json:"content_units"`
	AssetSlots   []model.AssetSlot       `json:"asset_slots"`
}

type ProposalApplyCounts struct {
	SegmentsCreated              int `json:"segments_created"`
	SceneMomentsCreated          int `json:"scene_moments_created"`
	ContentUnitsCreated          int `json:"content_units_created"`
	AssetSlotsCreated            int `json:"asset_slots_created"`
	CreativeReferencesCreated    int `json:"creative_references_created"`
	CreativeReferenceUsages      int `json:"creative_reference_usages"`
}

func (h *SemanticEntityHandler) ApplyProductionProposal(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req ApplyProductionProposalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if req.Proposal == nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("proposal is required"))
		return
	}

	resp, err := applyProposalInTransaction(c.Request.Context(), h.db, h.semantic, projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func applyProposalInTransaction(
	ctx context.Context,
	db *gorm.DB,
	_ *semanticapp.Service,
	projectID uint,
	req ApplyProductionProposalRequest,
) (*ApplyProductionProposalResponse, error) {
	resp := &ApplyProductionProposalResponse{ProductionID: req.ProductionID}

	err := db.Transaction(func(tx *gorm.DB) error {
		txSvc := semanticapp.NewService(tx)

		for i, segNode := range req.Proposal.Segments {
			var segmentID uint

			if segNode.Action == "reuse" && segNode.ID != nil {
				segmentID = *segNode.ID
			} else if segNode.Action == "create" || segNode.Action == "" {
				seg, err := txSvc.CreateSegment(ctx, projectID, semanticapp.CreateSegmentInput{
					ProductionID: &req.ProductionID,
					Kind:         fallbackStr(segNode.Kind, "section"),
					Order:        fallbackInt(segNode.Order, i+1),
					Title:        segNode.Title,
					Summary:      segNode.Summary,
					Status:       fallbackStr(segNode.Status, "draft"),
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
					sm, err := txSvc.CreateSceneMoment(ctx, projectID, semanticapp.CreateSceneMomentInput{
						SegmentID:    segIDPtr,
						Order:        fallbackInt(smNode.Order, j+1),
						Title:        smNode.Title,
						Description:  smNode.Description,
						TimeText:     smNode.TimeText,
						LocationText: smNode.LocationText,
						ActionText:   smNode.ActionText,
						Mood:         smNode.Mood,
						Status:       fallbackStr(smNode.Status, "draft"),
					})
					if err != nil {
						return err
					}
					resp.SceneMoments = append(resp.SceneMoments, sm)
					resp.Counts.SceneMomentsCreated++
					sceneMomentID = sm.ID
				}

				// Create/reuse CreativeReferences and bind usages
				for _, crNode := range smNode.CreativeReferences {
					var refID uint
					if crNode.Action == "reuse" && crNode.ID != nil {
						refID = *crNode.ID
					} else if crNode.Action == "create" || crNode.Action == "" {
						ref, err := txSvc.CreateCreativeReference(ctx, projectID, semanticapp.CreativeReferenceInput{
							Kind:        fallbackStr(crNode.Kind, "character"),
							Name:        crNode.Name,
							Importance:  "supporting",
							Status:      "draft",
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
							state, err := txSvc.CreateCreativeReferenceState(ctx, projectID, semanticapp.CreativeReferenceStateInput{
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
						_, err := txSvc.CreateCreativeReferenceUsage(ctx, projectID, semanticapp.CreativeReferenceUsageInput{
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

				// Create ContentUnits
				for k, cuNode := range smNode.ContentUnits {
					if cuNode.Action == "reuse" {
						continue
					}
					smIDPtr := &sceneMomentID
					prodIDPtr := &req.ProductionID
					segIDPtr := &segmentID
					cu, err := txSvc.CreateContentUnit(ctx, projectID, semanticapp.ContentUnitInput{
						ProductionID:  prodIDPtr,
						SegmentID:     segIDPtr,
						SceneMomentID: smIDPtr,
						Kind:          fallbackStr(cuNode.Kind, "shot"),
						Order:         fallbackInt(cuNode.Order, k+1),
						Title:         cuNode.Title,
						Description:   cuNode.Description,
						ShotSize:      cuNode.ShotSize,
						CameraAngle:   cuNode.CameraAngle,
						DurationSec:   cuNode.DurationSec,
						Status:        fallbackStr(cuNode.Status, "draft"),
					})
					if err != nil {
						return err
					}
					resp.ContentUnits = append(resp.ContentUnits, cu)
					resp.Counts.ContentUnitsCreated++
				}

				// Create AssetSlots
				for _, asNode := range smNode.AssetSlots {
					if asNode.Action == "reuse" {
						continue
					}
					smIDPtr := &sceneMomentID
					prodIDPtr := &req.ProductionID
					slot, err := txSvc.CreateAssetSlot(ctx, projectID, semanticapp.AssetSlotInput{
						ProductionID: prodIDPtr,
						OwnerType:    "scene_moment",
						OwnerID:      smIDPtr,
						Kind:         fallbackStr(asNode.Kind, "image"),
						Name:         asNode.Name,
						Description:  asNode.Description,
						Priority:     fallbackStr(asNode.Priority, "normal"),
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

func fallbackStr(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

func fallbackInt(v, def int) int {
	if v == 0 {
		return def
	}
	return v
}

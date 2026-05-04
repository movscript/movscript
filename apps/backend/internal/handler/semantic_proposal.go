package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
)

// ProposalSegmentNode is one segment in the tree-form proposal.
type ProposalSegmentNode struct {
	Action       string                    `json:"action"` // create | reuse | update
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
	ProductionID  uint          `json:"production_id" binding:"required"`
	AnalysisScope string        `json:"analysis_scope"`
	Proposal      *ProposalTree `json:"proposal"`
}

type ProposalTree struct {
	Segments []ProposalSegmentNode `json:"segments"`
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

	resp, err := h.semantic.ApplyProductionProposal(c.Request.Context(), projectID, semanticapp.ApplyProductionProposalRequest{
		ProductionID:  req.ProductionID,
		AnalysisScope: req.AnalysisScope,
		Proposal:      toSemanticProposalTree(req.Proposal),
	})
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func toSemanticProposalTree(tree *ProposalTree) *semanticapp.ProposalTree {
	if tree == nil {
		return nil
	}
	out := &semanticapp.ProposalTree{Segments: make([]semanticapp.ProposalSegmentNode, 0, len(tree.Segments))}
	for _, segNode := range tree.Segments {
		seg := semanticapp.ProposalSegmentNode{
			Action:       segNode.Action,
			ID:           segNode.ID,
			ClientID:     segNode.ClientID,
			Title:        segNode.Title,
			Kind:         segNode.Kind,
			Summary:      segNode.Summary,
			Order:        segNode.Order,
			Status:       segNode.Status,
			SceneMoments: make([]semanticapp.ProposalSceneMomentNode, 0, len(segNode.SceneMoments)),
		}
		for _, smNode := range segNode.SceneMoments {
			sm := semanticapp.ProposalSceneMomentNode{
				Action:             smNode.Action,
				ID:                 smNode.ID,
				ClientID:           smNode.ClientID,
				Title:              smNode.Title,
				TimeText:           smNode.TimeText,
				LocationText:       smNode.LocationText,
				ActionText:         smNode.ActionText,
				Mood:               smNode.Mood,
				Description:        smNode.Description,
				Order:              smNode.Order,
				Status:             smNode.Status,
				ContentUnits:       make([]semanticapp.ProposalContentUnitNode, 0, len(smNode.ContentUnits)),
				CreativeReferences: make([]semanticapp.ProposalCreativeRefNode, 0, len(smNode.CreativeReferences)),
				AssetSlots:         make([]semanticapp.ProposalAssetSlotNode, 0, len(smNode.AssetSlots)),
			}
			for _, cuNode := range smNode.ContentUnits {
				sm.ContentUnits = append(sm.ContentUnits, semanticapp.ProposalContentUnitNode{
					Action:      cuNode.Action,
					ID:          cuNode.ID,
					ClientID:    cuNode.ClientID,
					Title:       cuNode.Title,
					Kind:        cuNode.Kind,
					Description: cuNode.Description,
					ShotSize:    cuNode.ShotSize,
					CameraAngle: cuNode.CameraAngle,
					DurationSec: cuNode.DurationSec,
					Order:       cuNode.Order,
					Status:      cuNode.Status,
				})
			}
			for _, crNode := range smNode.CreativeReferences {
				var state *semanticapp.ProposalCreativeRefState
				if crNode.State != nil {
					state = &semanticapp.ProposalCreativeRefState{
						Costume:     crNode.State.Costume,
						Emotion:     crNode.State.Emotion,
						Props:       crNode.State.Props,
						VisualNotes: crNode.State.VisualNotes,
					}
				}
				sm.CreativeReferences = append(sm.CreativeReferences, semanticapp.ProposalCreativeRefNode{
					Action:   crNode.Action,
					ID:       crNode.ID,
					ClientID: crNode.ClientID,
					Name:     crNode.Name,
					Kind:     crNode.Kind,
					Role:     crNode.Role,
					State:    state,
				})
			}
			for _, asNode := range smNode.AssetSlots {
				sm.AssetSlots = append(sm.AssetSlots, semanticapp.ProposalAssetSlotNode{
					Action:      asNode.Action,
					ID:          asNode.ID,
					ClientID:    asNode.ClientID,
					Name:        asNode.Name,
					Kind:        asNode.Kind,
					Description: asNode.Description,
					Priority:    asNode.Priority,
				})
			}
			seg.SceneMoments = append(seg.SceneMoments, sm)
		}
		out.Segments = append(out.Segments, seg)
	}
	return out
}

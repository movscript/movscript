package semantic

import (
	"context"
	"errors"
	"fmt"
	"strings"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
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
	Keyframes          []ProposalKeyframeNode    `json:"keyframes"`
}

type ProposalContentUnitNode struct {
	Action      string                 `json:"action"`
	ID          *uint                  `json:"id"`
	ClientID    string                 `json:"client_id"`
	Title       string                 `json:"title"`
	Kind        string                 `json:"kind"`
	Description string                 `json:"description"`
	ShotSize    string                 `json:"shot_size"`
	CameraAngle string                 `json:"camera_angle"`
	DurationSec float64                `json:"duration_sec"`
	Order       int                    `json:"order"`
	Status      string                 `json:"status"`
	Keyframes   []ProposalKeyframeNode `json:"keyframes"`
}

type ProposalKeyframeNode struct {
	Action      string `json:"action"`
	ID          *uint  `json:"id"`
	ClientID    string `json:"client_id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Prompt      string `json:"prompt"`
	Order       int    `json:"order"`
	Status      string `json:"status"`
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
  ProposalScope string        `json:"proposal_scope"`
  Proposal      *ProposalTree `json:"proposal"`
}

type ProposalTree struct {
	Segments []ProposalSegmentNode `json:"segments"`
}

type ApplyProductionProposalResponse struct {
	ProductionID uint                         `json:"production_id"`
	Counts       ProposalApplyCounts          `json:"counts"`
	Segments     []domainsemantic.Segment     `json:"segments"`
	SceneMoments []domainsemantic.SceneMoment `json:"scene_moments"`
	ContentUnits []domainsemantic.ContentUnit `json:"content_units"`
	AssetSlots   []domainsemantic.AssetSlot   `json:"asset_slots"`
	Keyframes    []domainsemantic.Keyframe    `json:"keyframes"`
}

type PreviewProductionProposalApplyResponse struct {
	Status          string                                    `json:"status"`
	DryRun          bool                                      `json:"dry_run"`
	WouldApply      *ApplyProductionProposalResponse          `json:"would_apply"`
	SemanticChanges []ProductionProposalPreviewSemanticChange `json:"semantic_changes"`
	Warnings        []ProductionProposalPreviewWarning        `json:"warnings"`
}

type ProductionProposalPreviewSemanticChange struct {
	Kind     string `json:"kind"`
	Action   string `json:"action"`
	Title    string `json:"title"`
	Parent   string `json:"parent,omitempty"`
	ClientID string `json:"client_id,omitempty"`
	ID       *uint  `json:"id,omitempty"`
}

type ProductionProposalPreviewWarning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ProposalApplyCounts struct {
	SegmentsCreated           int `json:"segments_created"`
	SceneMomentsCreated       int `json:"scene_moments_created"`
	ContentUnitsCreated       int `json:"content_units_created"`
	AssetSlotsCreated         int `json:"asset_slots_created"`
	KeyframesCreated          int `json:"keyframes_created"`
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
	resp, err := s.applyProductionProposalInTx(ctx, projectID, req)
	if err != nil {
		return nil, err
	}
	s.bumpProgressVersion(ctx, projectID)
	return resp, nil
}

func (s *Service) PreviewProductionProposalApply(ctx context.Context, projectID uint, req ApplyProductionProposalRequest) (*PreviewProductionProposalApplyResponse, error) {
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

	var resp *ApplyProductionProposalResponse
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := &Service{repo: txRepo, cache: s.cache}
		var err error
		resp, err = txSvc.applyProductionProposalTree(ctx, projectID, req)
		if err != nil {
			return err
		}
		return errProjectProposalPreviewRollback
	})
	if errors.Is(err, errProjectProposalPreviewRollback) {
		return buildProductionProposalPreviewResponse(req.Proposal, resp), nil
	}
	if err != nil {
		return nil, err
	}
	return buildProductionProposalPreviewResponse(req.Proposal, resp), nil
}

func buildProductionProposalPreviewResponse(proposal *ProposalTree, resp *ApplyProductionProposalResponse) *PreviewProductionProposalApplyResponse {
	return &PreviewProductionProposalApplyResponse{
		Status:          "ok",
		DryRun:          true,
		WouldApply:      resp,
		SemanticChanges: buildProductionProposalPreviewSemanticChanges(proposal),
		Warnings:        buildProductionProposalPreviewWarnings(proposal, resp),
	}
}

func (s *Service) applyProductionProposalInTx(ctx context.Context, projectID uint, req ApplyProductionProposalRequest) (*ApplyProductionProposalResponse, error) {
	var resp *ApplyProductionProposalResponse
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := &Service{repo: txRepo, cache: s.cache}
		var err error
		resp, err = txSvc.applyProductionProposalTree(ctx, projectID, req)
		return err
	})
	if err != nil {
		return nil, err
	}
	return resp, nil
}

func (s *Service) applyProductionProposalTree(ctx context.Context, projectID uint, req ApplyProductionProposalRequest) (*ApplyProductionProposalResponse, error) {
	resp := &ApplyProductionProposalResponse{ProductionID: req.ProductionID}
	for i, segNode := range req.Proposal.Segments {
		var segmentID uint
		switch normalizeProposalAction(segNode.Action) {
		case "reuse":
			if segNode.ID == nil {
				return nil, missingProposalID("segment", segNode.ClientID, "reuse")
			}
			if err := s.ensureSegmentInProject(ctx, projectID, *segNode.ID); err != nil {
				return nil, err
			}
			segmentID = *segNode.ID
		case "update":
			if segNode.ID == nil {
				return nil, missingProposalID("segment", segNode.ClientID, "update")
			}
			seg, err := s.PatchSegment(ctx, projectID, fmt.Sprint(*segNode.ID), PatchSegmentInput{
				ProductionID: &req.ProductionID,
				Kind:         segNode.Kind,
				Order:        segNode.Order,
				Title:        segNode.Title,
				Summary:      segNode.Summary,
				Status:       segNode.Status,
			})
			if err != nil {
				return nil, err
			}
			segmentID = seg.ID
		case "create":
			seg, err := s.CreateSegment(ctx, projectID, CreateSegmentInput{
				ProductionID: &req.ProductionID,
				Kind:         segNode.Kind,
				Order:        fallbackInt(segNode.Order, i+1),
				Title:        segNode.Title,
				Summary:      segNode.Summary,
				Status:       domainsemantic.ProposalDraftStatus(segNode.Status),
			})
			if err != nil {
				return nil, err
			}
			resp.Segments = append(resp.Segments, seg)
			resp.Counts.SegmentsCreated++
			segmentID = seg.ID
		default:
			return nil, invalidProposalAction("segment", segNode.ClientID, segNode.Action)
		}

		for j, smNode := range segNode.SceneMoments {
			var sceneMomentID uint
			switch normalizeProposalAction(smNode.Action) {
			case "reuse":
				if smNode.ID == nil {
					return nil, missingProposalID("scene_moment", smNode.ClientID, "reuse")
				}
				if err := s.ensureSceneMomentInProject(ctx, projectID, *smNode.ID); err != nil {
					return nil, err
				}
				sceneMomentID = *smNode.ID
			case "update":
				if smNode.ID == nil {
					return nil, missingProposalID("scene_moment", smNode.ClientID, "update")
				}
				segIDPtr := &segmentID
				sm, err := s.PatchSceneMoment(ctx, projectID, fmt.Sprint(*smNode.ID), PatchSceneMomentInput{
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
					return nil, err
				}
				sceneMomentID = sm.ID
			case "create":
				segIDPtr := &segmentID
				sm, err := s.CreateSceneMoment(ctx, projectID, CreateSceneMomentInput{
					SegmentID:    segIDPtr,
					Order:        fallbackInt(smNode.Order, j+1),
					Title:        smNode.Title,
					Description:  smNode.Description,
					TimeText:     smNode.TimeText,
					LocationText: smNode.LocationText,
					ActionText:   smNode.ActionText,
					Mood:         smNode.Mood,
					Status:       domainsemantic.ProposalDraftStatus(smNode.Status),
				})
				if err != nil {
					return nil, err
				}
				resp.SceneMoments = append(resp.SceneMoments, sm)
				resp.Counts.SceneMomentsCreated++
				sceneMomentID = sm.ID
			default:
				return nil, invalidProposalAction("scene_moment", smNode.ClientID, smNode.Action)
			}

			for _, crNode := range smNode.CreativeReferences {
				var refID uint
				switch normalizeProposalAction(crNode.Action) {
				case "reuse":
					if crNode.ID == nil {
						return nil, missingProposalID("creative_reference", crNode.ClientID, "reuse")
					}
					if err := s.ensureCreativeReferenceInProject(ctx, projectID, *crNode.ID); err != nil {
						return nil, err
					}
					refID = *crNode.ID
				case "update":
					if crNode.ID == nil {
						return nil, missingProposalID("creative_reference", crNode.ClientID, "update")
					}
					ref, err := s.PatchCreativeReference(ctx, projectID, fmt.Sprint(*crNode.ID), CreativeReferenceInput{
						Kind:   crNode.Kind,
						Name:   crNode.Name,
						Status: domainsemantic.ProposalDraftStatusValue,
					})
					if err != nil {
						return nil, err
					}
					refID = ref.ID
				case "create":
					ref, err := s.CreateCreativeReference(ctx, projectID, CreativeReferenceInput{
						Kind:   crNode.Kind,
						Name:   crNode.Name,
						Status: domainsemantic.ProposalDraftStatusValue,
					})
					if err != nil {
						return nil, err
					}
					resp.Counts.CreativeReferencesCreated++
					refID = ref.ID
				default:
					return nil, invalidProposalAction("creative_reference", crNode.ClientID, crNode.Action)
				}

				if refID > 0 && sceneMomentID > 0 {
					var stateID *uint
					if crNode.State != nil {
						state, err := s.CreateCreativeReferenceState(ctx, projectID, CreativeReferenceStateInput{
							CreativeReferenceID: refID,
							ScopeType:           "scene_moment",
							ScopeID:             &sceneMomentID,
							Name:                crNode.Name,
							Costume:             crNode.State.Costume,
							Emotion:             crNode.State.Emotion,
							Props:               crNode.State.Props,
							VisualNotes:         crNode.State.VisualNotes,
							Status:              domainsemantic.ProposalDraftStatusValue,
						})
						if err != nil {
							return nil, err
						}
						stateID = &state.ID
					}
					_, err := s.CreateCreativeReferenceUsage(ctx, projectID, CreativeReferenceUsageInput{
						OwnerType:                "scene_moment",
						OwnerID:                  sceneMomentID,
						CreativeReferenceID:      refID,
						CreativeReferenceStateID: stateID,
						Role:                     crNode.Role,
						Source:                   "agent_proposal",
						Status:                   domainsemantic.ProposalDraftStatusValue,
					})
					if err != nil {
						return nil, err
					}
					resp.Counts.CreativeReferenceUsages++
				}
			}

			for k, cuNode := range smNode.ContentUnits {
				var contentUnitID uint
				switch normalizeProposalAction(cuNode.Action) {
				case "reuse":
					if cuNode.ID == nil {
						return nil, missingProposalID("content_unit", cuNode.ClientID, "reuse")
					}
					if err := s.ensureContentUnitInProject(ctx, projectID, *cuNode.ID); err != nil {
						return nil, err
					}
					contentUnitID = *cuNode.ID
				case "update":
					if cuNode.ID == nil {
						return nil, missingProposalID("content_unit", cuNode.ClientID, "update")
					}
					smIDPtr := &sceneMomentID
					prodIDPtr := &req.ProductionID
					segIDPtr := &segmentID
					cu, err := s.PatchContentUnit(ctx, projectID, fmt.Sprint(*cuNode.ID), ContentUnitInput{
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
					})
					if err != nil {
						return nil, err
					}
					contentUnitID = cu.ID
				case "create":
					smIDPtr := &sceneMomentID
					prodIDPtr := &req.ProductionID
					segIDPtr := &segmentID
					cu, err := s.CreateContentUnit(ctx, projectID, ContentUnitInput{
						ProductionID:  prodIDPtr,
						SegmentID:     segIDPtr,
						SceneMomentID: smIDPtr,
						Kind:          cuNode.Kind,
						Order:         fallbackInt(cuNode.Order, k+1),
						Title:         cuNode.Title,
						Description:   cuNode.Description,
						ShotSize:      cuNode.ShotSize,
						CameraAngle:   cuNode.CameraAngle,
						DurationSec:   cuNode.DurationSec,
						Status:        domainsemantic.ProposalDraftStatus(cuNode.Status),
					})
					if err != nil {
						return nil, err
					}
					resp.ContentUnits = append(resp.ContentUnits, cu)
					resp.Counts.ContentUnitsCreated++
					contentUnitID = cu.ID
				default:
					return nil, invalidProposalAction("content_unit", cuNode.ClientID, cuNode.Action)
				}
				for l, keyframeNode := range cuNode.Keyframes {
					if err := s.applyProposalKeyframe(ctx, projectID, req.ProductionID, sceneMomentID, &contentUnitID, keyframeNode, l, resp); err != nil {
						return nil, err
					}
				}
			}

			for _, asNode := range smNode.AssetSlots {
				switch normalizeProposalAction(asNode.Action) {
				case "reuse":
					if asNode.ID == nil {
						return nil, missingProposalID("asset_slot", asNode.ClientID, "reuse")
					}
					if err := s.ensureAssetSlotInProject(ctx, projectID, *asNode.ID); err != nil {
						return nil, err
					}
					continue
				case "update":
					if asNode.ID == nil {
						return nil, missingProposalID("asset_slot", asNode.ClientID, "update")
					}
					smIDPtr := &sceneMomentID
					prodIDPtr := &req.ProductionID
					if _, err := s.PatchAssetSlot(ctx, projectID, fmt.Sprint(*asNode.ID), PatchAssetSlotInput{
						ProductionID: prodIDPtr,
						OwnerType:    "scene_moment",
						OwnerID:      smIDPtr,
						Kind:         asNode.Kind,
						Name:         asNode.Name,
						Description:  asNode.Description,
						Priority:     asNode.Priority,
						Status:       domainsemantic.ProposalDraftStatusValue,
					}); err != nil {
						return nil, err
					}
					continue
				case "create":
				default:
					return nil, invalidProposalAction("asset_slot", asNode.ClientID, asNode.Action)
				}
				smIDPtr := &sceneMomentID
				prodIDPtr := &req.ProductionID
				slot, err := s.CreateAssetSlot(ctx, projectID, AssetSlotInput{
					ProductionID: prodIDPtr,
					OwnerType:    "scene_moment",
					OwnerID:      smIDPtr,
					Kind:         asNode.Kind,
					Name:         asNode.Name,
					Description:  asNode.Description,
					Priority:     asNode.Priority,
					Status:       domainsemantic.ProposalDraftStatusValue,
				})
				if err != nil {
					return nil, err
				}
				resp.AssetSlots = append(resp.AssetSlots, slot)
				resp.Counts.AssetSlotsCreated++
			}

			for l, keyframeNode := range smNode.Keyframes {
				if err := s.applyProposalKeyframe(ctx, projectID, req.ProductionID, sceneMomentID, nil, keyframeNode, l, resp); err != nil {
					return nil, err
				}
			}
		}
	}
	return resp, nil
}

func (s *Service) applyProposalKeyframe(ctx context.Context, projectID uint, productionID uint, sceneMomentID uint, contentUnitID *uint, node ProposalKeyframeNode, index int, resp *ApplyProductionProposalResponse) error {
	prodIDPtr := &productionID
	sceneMomentIDPtr := &sceneMomentID
	switch normalizeProposalAction(node.Action) {
	case "reuse":
		if node.ID == nil {
			return missingProposalID("keyframe", node.ClientID, "reuse")
		}
		if err := s.ensureKeyframeInProject(ctx, projectID, *node.ID); err != nil {
			return err
		}
		return nil
	case "update":
		if node.ID == nil {
			return missingProposalID("keyframe", node.ClientID, "update")
		}
		_, err := s.PatchKeyframe(ctx, projectID, fmt.Sprint(*node.ID), KeyframeInput{
			ProductionID:  prodIDPtr,
			SceneMomentID: sceneMomentIDPtr,
			ContentUnitID: contentUnitID,
			Title:         node.Title,
			Description:   node.Description,
			Prompt:        node.Prompt,
			Order:         node.Order,
			Status:        node.Status,
		})
		return err
	case "create":
		keyframe, err := s.CreateKeyframe(ctx, projectID, KeyframeInput{
			ProductionID:  prodIDPtr,
			SceneMomentID: sceneMomentIDPtr,
			ContentUnitID: contentUnitID,
			Title:         node.Title,
			Description:   node.Description,
			Prompt:        node.Prompt,
			Order:         fallbackInt(node.Order, index+1),
			Status:        domainsemantic.ProposalDraftStatus(node.Status),
		})
		if err != nil {
			return err
		}
		resp.Keyframes = append(resp.Keyframes, keyframe)
		resp.Counts.KeyframesCreated++
		return nil
	default:
		return invalidProposalAction("keyframe", node.ClientID, node.Action)
	}
}

func normalizeProposalAction(action string) string {
	if action == "" {
		return "create"
	}
	return action
}

func buildProductionProposalPreviewSemanticChanges(proposal *ProposalTree) []ProductionProposalPreviewSemanticChange {
	if proposal == nil {
		return nil
	}
	var changes []ProductionProposalPreviewSemanticChange
	for _, segment := range proposal.Segments {
		segmentTitle := fallbackProposalTitle(segment.Title, segment.ClientID, "编排段")
		changes = append(changes, ProductionProposalPreviewSemanticChange{
			Kind:     "segment",
			Action:   normalizeProposalAction(segment.Action),
			Title:    segmentTitle,
			ClientID: segment.ClientID,
			ID:       segment.ID,
		})
		for _, moment := range segment.SceneMoments {
			momentTitle := fallbackProposalTitle(moment.Title, moment.ClientID, "情景")
			changes = append(changes, ProductionProposalPreviewSemanticChange{
				Kind:     "scene_moment",
				Action:   normalizeProposalAction(moment.Action),
				Title:    momentTitle,
				Parent:   segmentTitle,
				ClientID: moment.ClientID,
				ID:       moment.ID,
			})
			for _, ref := range moment.CreativeReferences {
				changes = append(changes, ProductionProposalPreviewSemanticChange{
					Kind:     "creative_reference",
					Action:   normalizeProposalAction(ref.Action),
					Title:    fallbackProposalTitle(ref.Name, ref.ClientID, "设定资料"),
					Parent:   segmentTitle + " / " + momentTitle,
					ClientID: ref.ClientID,
					ID:       ref.ID,
				})
			}
			for _, slot := range moment.AssetSlots {
				changes = append(changes, ProductionProposalPreviewSemanticChange{
					Kind:     "asset_slot",
					Action:   normalizeProposalAction(slot.Action),
					Title:    fallbackProposalTitle(slot.Name, slot.ClientID, "素材需求"),
					Parent:   segmentTitle + " / " + momentTitle,
					ClientID: slot.ClientID,
					ID:       slot.ID,
				})
			}
		}
	}
	return changes
}

func buildProductionProposalPreviewWarnings(proposal *ProposalTree, resp *ApplyProductionProposalResponse) []ProductionProposalPreviewWarning {
	if proposal == nil {
		return nil
	}
	var warnings []ProductionProposalPreviewWarning
	if resp == nil || resp.Counts.SegmentsCreated == 0 && len(resp.Segments) == 0 {
		warnings = append(warnings, ProductionProposalPreviewWarning{
			Code:    "NO_SEGMENT_WRITE",
			Message: "本次预览没有创建新的编排段；如果只复用或更新，请确认目标 ID 都来自当前项目。",
		})
	}
	for _, segment := range proposal.Segments {
		if len(segment.SceneMoments) == 0 {
			warnings = append(warnings, ProductionProposalPreviewWarning{
				Code:    "SEGMENT_WITHOUT_SCENE_MOMENTS",
				Message: fmt.Sprintf("编排段 %q 没有关联情景，写入后可能缺少可生成上下文。", fallbackProposalTitle(segment.Title, segment.ClientID, "编排段")),
			})
		}
		for _, moment := range segment.SceneMoments {
			if len(moment.CreativeReferences) == 0 && len(moment.AssetSlots) == 0 {
				warnings = append(warnings, ProductionProposalPreviewWarning{
					Code:    "SCENE_MOMENT_WITHOUT_CONTEXT",
					Message: fmt.Sprintf("情景 %q 没有设定引用或素材需求，后续生成上下文可能不足。", fallbackProposalTitle(moment.Title, moment.ClientID, "情景")),
				})
			}
		}
	}
	return warnings
}

func fallbackProposalTitle(title string, clientID string, fallback string) string {
	if strings.TrimSpace(title) != "" {
		return strings.TrimSpace(title)
	}
	if strings.TrimSpace(clientID) != "" {
		return strings.TrimSpace(clientID)
	}
	return fallback
}

func missingProposalID(kind string, clientID string, action string) error {
	return ErrInvalidInput{Err: fmt.Errorf("%s proposal %q requires id for action %q", kind, clientID, action)}
}

func invalidProposalAction(kind string, clientID string, action string) error {
	return ErrInvalidInput{Err: fmt.Errorf("%s proposal %q has unsupported action %q", kind, clientID, action)}
}

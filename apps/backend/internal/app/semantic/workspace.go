package semantic

import (
	"context"
	"errors"
	"fmt"
	"strings"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

type WorkspaceSegmentNode struct {
	ID            *uint                     `json:"id"`
	ClientID      string                    `json:"client_id"`
	Title         string                    `json:"title"`
	Kind          string                    `json:"kind"`
	Summary       string                    `json:"summary"`
	Order         int                       `json:"order"`
	Status        string                    `json:"status"`
	ScriptBlockID *uint                     `json:"script_block_id"`
	SceneMoments  []WorkspaceSceneMomentNode `json:"scene_moments"`
}

type WorkspaceSceneMomentNode struct {
	ID                 *uint                           `json:"id"`
	ClientID           string                          `json:"client_id"`
	SceneCode          string                          `json:"scene_code"`
	Title              string                          `json:"title"`
	TimeText           string                          `json:"time_text"`
	LocationText       string                          `json:"location_text"`
	ActionText         string                          `json:"action_text"`
	Mood               string                          `json:"mood"`
	Description        string                          `json:"description"`
	Order              int                             `json:"order"`
	Status             string                          `json:"status"`
	ScriptBlockID      *uint                           `json:"script_block_id"`
	ContentUnits       []WorkspaceContentUnitNode       `json:"content_units"`
	CreativeReferences []WorkspaceCreativeRefNode       `json:"creative_references"`
	AssetSlots         []WorkspaceAssetSlotNode         `json:"asset_slots"`
	Keyframes          []WorkspaceKeyframeNode          `json:"keyframes"`
	WritingExpressions []WorkspaceWritingExpressionNode `json:"writing_expressions"`
}

type WorkspaceContentUnitNode struct {
	ID            *uint                  `json:"id"`
	ClientID      string                 `json:"client_id"`
	UnitCode      string                 `json:"unit_code"`
	Title         string                 `json:"title"`
	Kind          string                 `json:"kind"`
	Description   string                 `json:"description"`
	ShotSize      string                 `json:"shot_size"`
	CameraAngle   string                 `json:"camera_angle"`
	DurationSec   float64                `json:"duration_sec"`
	Order         int                    `json:"order"`
	Status        string                 `json:"status"`
	ScriptBlockID *uint                  `json:"script_block_id"`
	Keyframes     []WorkspaceKeyframeNode `json:"keyframes"`
}

type WorkspaceKeyframeNode struct {
	ID          *uint  `json:"id"`
	ClientID    string `json:"client_id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Prompt      string `json:"prompt"`
	Order       int    `json:"order"`
	Status      string `json:"status"`
}

type WorkspaceWritingExpressionNode struct {
	ID            *uint  `json:"id"`
	ClientID      string `json:"client_id"`
	Kind          string `json:"kind"`
	Speaker       string `json:"speaker"`
	Text          string `json:"text"`
	Note          string `json:"note"`
	Intent        string `json:"intent"`
	Order         int    `json:"order"`
	ScriptBlockID *uint  `json:"script_block_id"`
}

type WorkspaceCreativeRefNode struct {
	ID       *uint                     `json:"id"`
	ClientID string                    `json:"client_id"`
	Name     string                    `json:"name"`
	Kind     string                    `json:"kind"`
	Role     string                    `json:"role"`
	State    *WorkspaceCreativeRefState `json:"state"`
}

type WorkspaceCreativeRefState struct {
	Costume     string `json:"costume"`
	Emotion     string `json:"emotion"`
	Props       string `json:"props"`
	VisualNotes string `json:"visual_notes"`
}

type WorkspaceAssetSlotNode struct {
	ID          *uint  `json:"id"`
	ClientID    string `json:"client_id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Description string `json:"description"`
	Priority    string `json:"priority"`
}

type ProductionWorkspaceApplyLinkError struct {
	Message       string `json:"message"`
	ProjectID     uint   `json:"project_id"`
	ProductionID  uint   `json:"production_id"`
	Mode          string `json:"mode,omitempty"`
	WorkspaceScope string `json:"workspace_scope,omitempty"`
	Path          string `json:"path,omitempty"`
	EntityType    string `json:"entity_type,omitempty"`
	EntityID      *uint  `json:"entity_id,omitempty"`
	ClientID      string `json:"client_id,omitempty"`
	Title         string `json:"title,omitempty"`
	SegmentID     *uint  `json:"segment_id,omitempty"`
	SceneMomentID *uint  `json:"scene_moment_id,omitempty"`
	ContentUnitID *uint  `json:"content_unit_id,omitempty"`
	Cause         string `json:"cause"`
	err           error
}

func (e *ProductionWorkspaceApplyLinkError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *ProductionWorkspaceApplyLinkError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.err
}

type productionWorkspaceLinkContext struct {
	Path          string
	EntityType    string
	EntityID      *uint
	ClientID      string
	Title         string
	SegmentID     *uint
	SceneMomentID *uint
	ContentUnitID *uint
}

func productionWorkspaceApplyLinkError(projectID uint, req ApplyProductionWorkspaceRequest, link productionWorkspaceLinkContext, err error) error {
	if err == nil {
		return nil
	}
	var existing *ProductionWorkspaceApplyLinkError
	if errors.As(err, &existing) {
		return err
	}
	if !errors.Is(err, ErrOwnerNotFound) && !errors.Is(err, ErrTextBlockNotFound) && !errors.Is(err, ErrOwnerWrongProject) && !errors.Is(err, ErrNotFound) {
		return err
	}
	detail := &ProductionWorkspaceApplyLinkError{
		ProjectID:     projectID,
		ProductionID:  req.ProductionID,
		Mode:          strings.TrimSpace(req.Mode),
		WorkspaceScope: strings.TrimSpace(req.WorkspaceScope),
		Path:          strings.TrimSpace(link.Path),
		EntityType:    strings.TrimSpace(link.EntityType),
		EntityID:      link.EntityID,
		ClientID:      strings.TrimSpace(link.ClientID),
		Title:         strings.TrimSpace(link.Title),
		SegmentID:     link.SegmentID,
		SceneMomentID: link.SceneMomentID,
		ContentUnitID: link.ContentUnitID,
		Cause:         err.Error(),
		err:           err,
	}
	entity := detail.EntityType
	if entity == "" {
		entity = "关联对象"
	}
	if detail.EntityID != nil {
		detail.Message = fmt.Sprintf("制作工作区应用失败：%s #%d 不存在或不属于当前项目；path=%s；project_id=%d production_id=%d；原因：%s", entity, *detail.EntityID, detail.Path, projectID, req.ProductionID, err.Error())
	} else {
		detail.Message = fmt.Sprintf("制作工作区应用失败：%s 不存在或不属于当前项目；path=%s；project_id=%d production_id=%d；原因：%s", entity, detail.Path, projectID, req.ProductionID, err.Error())
	}
	return detail
}

type ApplyProductionWorkspaceRequest struct {
	Mode          string        `json:"mode"`
	ProductionID  uint          `json:"production_id" binding:"required"`
	WorkspaceScope string        `json:"workspace_scope"`
	Workspace      *WorkspaceTree `json:"workspace"`
}

type WorkspaceTree struct {
	Segments []WorkspaceSegmentNode `json:"segments"`
}

type ApplyProductionWorkspaceResponse struct {
	ProductionID       uint                               `json:"production_id"`
	Counts             WorkspaceApplyCounts                `json:"counts"`
	Segments           []domainsemantic.Segment           `json:"segments"`
	SceneMoments       []domainsemantic.SceneMoment       `json:"scene_moments"`
	ContentUnits       []domainsemantic.ContentUnit       `json:"content_units"`
	AssetSlots         []domainsemantic.AssetSlot         `json:"asset_slots"`
	Keyframes          []domainsemantic.Keyframe          `json:"keyframes"`
	WritingExpressions []domainsemantic.WritingExpression `json:"writing_expressions"`
}

type PreviewProductionWorkspaceApplyResponse struct {
	Status          string                                    `json:"status"`
	DryRun          bool                                      `json:"dry_run"`
	WouldApply      *ApplyProductionWorkspaceResponse          `json:"would_apply"`
	SemanticChanges []ProductionWorkspacePreviewSemanticChange `json:"semantic_changes"`
	Warnings        []ProductionWorkspacePreviewWarning        `json:"warnings"`
}

type ProductionWorkspacePreviewSemanticChange struct {
	Kind     string `json:"kind"`
	Action   string `json:"action"`
	Title    string `json:"title"`
	Parent   string `json:"parent,omitempty"`
	ClientID string `json:"client_id,omitempty"`
	ID       *uint  `json:"id,omitempty"`
}

type ProductionWorkspacePreviewWarning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type WorkspaceApplyCounts struct {
	SegmentsCreated           int `json:"segments_created"`
	SceneMomentsCreated       int `json:"scene_moments_created"`
	ContentUnitsCreated       int `json:"content_units_created"`
	AssetSlotsCreated         int `json:"asset_slots_created"`
	KeyframesCreated          int `json:"keyframes_created"`
	CreativeReferencesCreated int `json:"creative_references_created"`
	CreativeReferenceUsages   int `json:"creative_reference_usages"`
	WritingExpressionsCreated int `json:"writing_expressions_created"`
}

func (s *Service) ApplyProductionWorkspace(ctx context.Context, projectID uint, req ApplyProductionWorkspaceRequest) (*ApplyProductionWorkspaceResponse, error) {
	if projectID == 0 {
		return nil, ErrInvalidInput{Err: errors.New("project id is required")}
	}
	if req.ProductionID == 0 {
		return nil, ErrInvalidInput{Err: errors.New("production_id is required")}
	}
	if req.Workspace == nil {
		return nil, ErrInvalidInput{Err: errors.New("workspace is required")}
	}
	if req.Mode != "snapshot" {
		return nil, ErrInvalidInput{Err: errors.New("production workspace requires mode snapshot")}
	}
	if err := s.ensureProductionInProject(ctx, projectID, req.ProductionID); err != nil {
		return nil, productionWorkspaceApplyLinkError(projectID, req, productionWorkspaceLinkContext{
			Path:       "/production_id",
			EntityType: "production",
			EntityID:   &req.ProductionID,
		}, err)
	}
	resp, err := s.applyProductionWorkspaceInTx(ctx, projectID, req)
	if err != nil {
		return nil, err
	}
	s.bumpProgressVersion(ctx, projectID)
	return resp, nil
}

func (s *Service) PreviewProductionWorkspaceApply(ctx context.Context, projectID uint, req ApplyProductionWorkspaceRequest) (*PreviewProductionWorkspaceApplyResponse, error) {
	if projectID == 0 {
		return nil, ErrInvalidInput{Err: errors.New("project id is required")}
	}
	if req.ProductionID == 0 {
		return nil, ErrInvalidInput{Err: errors.New("production_id is required")}
	}
	if req.Workspace == nil {
		return nil, ErrInvalidInput{Err: errors.New("workspace is required")}
	}
	if req.Mode != "snapshot" {
		return nil, ErrInvalidInput{Err: errors.New("production workspace requires mode snapshot")}
	}
	if err := s.ensureProductionInProject(ctx, projectID, req.ProductionID); err != nil {
		return nil, productionWorkspaceApplyLinkError(projectID, req, productionWorkspaceLinkContext{
			Path:       "/production_id",
			EntityType: "production",
			EntityID:   &req.ProductionID,
		}, err)
	}

	var resp *ApplyProductionWorkspaceResponse
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		resp, err = txSvc.applyProductionWorkspaceTree(ctx, projectID, req)
		if err != nil {
			return err
		}
		return errProjectLayerWorkspacePreviewRollback
	})
	if errors.Is(err, errProjectLayerWorkspacePreviewRollback) {
		return buildProductionWorkspacePreviewResponse(req.Workspace, resp), nil
	}
	if err != nil {
		return nil, err
	}
	return buildProductionWorkspacePreviewResponse(req.Workspace, resp), nil
}

func buildProductionWorkspacePreviewResponse(workspace *WorkspaceTree, resp *ApplyProductionWorkspaceResponse) *PreviewProductionWorkspaceApplyResponse {
	return &PreviewProductionWorkspaceApplyResponse{
		Status:          "ok",
		DryRun:          true,
		WouldApply:      resp,
		SemanticChanges: buildProductionWorkspacePreviewSemanticChanges(workspace),
		Warnings:        buildProductionWorkspacePreviewWarnings(workspace, resp),
	}
}

func (s *Service) applyProductionWorkspaceInTx(ctx context.Context, projectID uint, req ApplyProductionWorkspaceRequest) (*ApplyProductionWorkspaceResponse, error) {
	var resp *ApplyProductionWorkspaceResponse
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		resp, err = txSvc.applyProductionWorkspaceTree(ctx, projectID, req)
		return err
	})
	if err != nil {
		return nil, err
	}
	return resp, nil
}

func (s *Service) applyProductionWorkspaceTree(ctx context.Context, projectID uint, req ApplyProductionWorkspaceRequest) (*ApplyProductionWorkspaceResponse, error) {
	resp := &ApplyProductionWorkspaceResponse{ProductionID: req.ProductionID}
	keptSegmentIDs := make(map[uint]struct{})
	keptSceneMomentIDs := make(map[uint]struct{})
	keptContentUnitIDs := make(map[uint]struct{})
	keptKeyframeIDs := make(map[uint]struct{})
	keptAssetSlotIDs := make(map[uint]struct{})
	keptCreativeReferenceUsageIDs := make(map[uint]struct{})
	keptWritingExpressionIDs := make(map[uint]struct{})
	writingExpressionManagedSceneMomentIDs := make(map[uint]struct{})
	for i, segNode := range req.Workspace.Segments {
		var segmentID uint
		if segNode.ID != nil && *segNode.ID > 0 {
			if err := s.ensureSegmentInProject(ctx, projectID, *segNode.ID); err != nil {
				return nil, productionWorkspaceApplyLinkError(projectID, req, productionWorkspaceLinkContext{
					Path:       fmt.Sprintf("/workspace/segments/%d/id", i),
					EntityType: "segment",
					EntityID:   segNode.ID,
					ClientID:   segNode.ClientID,
					Title:      segNode.Title,
				}, err)
			}
			seg, err := s.PatchSegment(ctx, projectID, fmt.Sprint(*segNode.ID), PatchSegmentInput{
				ProductionID:  &req.ProductionID,
				ScriptBlockID: segNode.ScriptBlockID,
				Kind:          segNode.Kind,
				Order:         fallbackInt(segNode.Order, i+1),
				Title:         segNode.Title,
				Summary:       segNode.Summary,
				Status:        segNode.Status,
			})
			if err != nil {
				return nil, err
			}
			segmentID = seg.ID
		} else {
			seg, err := s.CreateSegment(ctx, projectID, CreateSegmentInput{
				ProductionID:  &req.ProductionID,
				ScriptBlockID: segNode.ScriptBlockID,
				Kind:          segNode.Kind,
				Order:         fallbackInt(segNode.Order, i+1),
				Title:         segNode.Title,
				Summary:       segNode.Summary,
				Status:        domainsemantic.WorkspaceWorkspaceStatus(segNode.Status),
			})
			if err != nil {
				return nil, err
			}
			resp.Segments = append(resp.Segments, seg)
			resp.Counts.SegmentsCreated++
			segmentID = seg.ID
		}
		keptSegmentIDs[segmentID] = struct{}{}

		for j, smNode := range segNode.SceneMoments {
			var sceneMomentID uint
			if smNode.ID != nil && *smNode.ID > 0 {
				if err := s.ensureSceneMomentInProject(ctx, projectID, *smNode.ID); err != nil {
					return nil, productionWorkspaceApplyLinkError(projectID, req, productionWorkspaceLinkContext{
						Path:       fmt.Sprintf("/workspace/segments/%d/scene_moments/%d/id", i, j),
						EntityType: "scene_moment",
						EntityID:   smNode.ID,
						ClientID:   smNode.ClientID,
						Title:      smNode.Title,
						SegmentID:  &segmentID,
					}, err)
				}
				segIDPtr := &segmentID
				sm, err := s.PatchSceneMoment(ctx, projectID, fmt.Sprint(*smNode.ID), PatchSceneMomentInput{
					SegmentID:     segIDPtr,
					ScriptBlockID: smNode.ScriptBlockID,
					SceneCode:     smNode.SceneCode,
					Order:         smNode.Order,
					Title:         smNode.Title,
					Description:   smNode.Description,
					TimeText:      smNode.TimeText,
					LocationText:  smNode.LocationText,
					ActionText:    smNode.ActionText,
					Mood:          smNode.Mood,
					Status:        smNode.Status,
				})
				if err != nil {
					return nil, err
				}
				sceneMomentID = sm.ID
			} else {
				segIDPtr := &segmentID
				sm, err := s.CreateSceneMoment(ctx, projectID, CreateSceneMomentInput{
					SegmentID:     segIDPtr,
					ScriptBlockID: smNode.ScriptBlockID,
					SceneCode:     smNode.SceneCode,
					Order:         fallbackInt(smNode.Order, j+1),
					Title:         smNode.Title,
					Description:   smNode.Description,
					TimeText:      smNode.TimeText,
					LocationText:  smNode.LocationText,
					ActionText:    smNode.ActionText,
					Mood:          smNode.Mood,
					Status:        domainsemantic.WorkspaceWorkspaceStatus(smNode.Status),
				})
				if err != nil {
					return nil, err
				}
				resp.SceneMoments = append(resp.SceneMoments, sm)
				resp.Counts.SceneMomentsCreated++
				sceneMomentID = sm.ID
			}
			keptSceneMomentIDs[sceneMomentID] = struct{}{}

			for crIndex, crNode := range smNode.CreativeReferences {
				if crNode.ID == nil {
					return nil, missingWorkspaceID("creative_reference", crNode.ClientID, "snapshot")
				}
				if err := s.ensureCreativeReferenceInProject(ctx, projectID, *crNode.ID); err != nil {
					return nil, productionWorkspaceApplyLinkError(projectID, req, productionWorkspaceLinkContext{
						Path:          fmt.Sprintf("/workspace/segments/%d/scene_moments/%d/creative_references/%d/id", i, j, crIndex),
						EntityType:    "creative_reference",
						EntityID:      crNode.ID,
						ClientID:      crNode.ClientID,
						Title:         crNode.Name,
						SegmentID:     &segmentID,
						SceneMomentID: &sceneMomentID,
					}, err)
				}
				refID := *crNode.ID

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
							Status:              domainsemantic.WorkspaceWorkspaceStatusValue,
						})
						if err != nil {
							return nil, err
						}
						stateID = &state.ID
					}
					usageInput := CreativeReferenceUsageInput{
						OwnerType:                "scene_moment",
						OwnerID:                  sceneMomentID,
						CreativeReferenceID:      refID,
						CreativeReferenceStateID: stateID,
						Role:                     crNode.Role,
						Source:                   "agent_workspace",
						Status:                   domainsemantic.WorkspaceWorkspaceStatusValue,
					}
					existingUsage, usageFound, err := s.findProductionWorkspaceCreativeReferenceUsage(ctx, projectID, sceneMomentID, refID)
					if err != nil {
						return nil, err
					}
					if usageFound {
						if productionWorkspaceCreativeReferenceUsageNeedsPatch(existingUsage, usageInput) {
							patchedUsage, err := s.PatchCreativeReferenceUsage(ctx, projectID, fmt.Sprint(existingUsage.ID), usageInput)
							if err != nil {
								return nil, err
							}
							keptCreativeReferenceUsageIDs[patchedUsage.ID] = struct{}{}
							resp.Counts.CreativeReferenceUsages++
						} else {
							keptCreativeReferenceUsageIDs[existingUsage.ID] = struct{}{}
						}
						continue
					}
					createdUsage, err := s.CreateCreativeReferenceUsage(ctx, projectID, usageInput)
					if err != nil {
						return nil, err
					}
					keptCreativeReferenceUsageIDs[createdUsage.ID] = struct{}{}
					resp.Counts.CreativeReferenceUsages++
				}
			}

			for expressionIndex, expressionNode := range smNode.WritingExpressions {
				var expressionID uint
				if expressionNode.ID != nil && *expressionNode.ID > 0 {
					item, err := s.PatchWritingExpression(ctx, projectID, fmt.Sprint(*expressionNode.ID), WritingExpressionInput{
						SceneMomentID: sceneMomentID,
						ScriptBlockID: expressionNode.ScriptBlockID,
						Order:         fallbackInt(expressionNode.Order, expressionIndex+1),
						Kind:          expressionNode.Kind,
						Speaker:       expressionNode.Speaker,
						Text:          expressionNode.Text,
						Note:          expressionNode.Note,
						Intent:        expressionNode.Intent,
					})
					if err != nil {
						return nil, productionWorkspaceApplyLinkError(projectID, req, productionWorkspaceLinkContext{
							Path:          fmt.Sprintf("/workspace/segments/%d/scene_moments/%d/writing_expressions/%d/id", i, j, expressionIndex),
							EntityType:    "writing_expression",
							EntityID:      expressionNode.ID,
							ClientID:      expressionNode.ClientID,
							Title:         expressionNode.Text,
							SegmentID:     &segmentID,
							SceneMomentID: &sceneMomentID,
						}, err)
					}
					expressionID = item.ID
				} else {
					item, err := s.CreateWritingExpression(ctx, projectID, WritingExpressionInput{
						SceneMomentID: sceneMomentID,
						ScriptBlockID: expressionNode.ScriptBlockID,
						Order:         fallbackInt(expressionNode.Order, expressionIndex+1),
						Kind:          expressionNode.Kind,
						Speaker:       expressionNode.Speaker,
						Text:          expressionNode.Text,
						Note:          expressionNode.Note,
						Intent:        expressionNode.Intent,
					})
					if err != nil {
						return nil, productionWorkspaceApplyLinkError(projectID, req, productionWorkspaceLinkContext{
							Path:          fmt.Sprintf("/workspace/segments/%d/scene_moments/%d/writing_expressions/%d/id", i, j, expressionIndex),
							EntityType:    "writing_expression",
							EntityID:      expressionNode.ID,
							ClientID:      expressionNode.ClientID,
							Title:         expressionNode.Text,
							SegmentID:     &segmentID,
							SceneMomentID: &sceneMomentID,
						}, err)
					}
					resp.WritingExpressions = append(resp.WritingExpressions, item)
					resp.Counts.WritingExpressionsCreated++
					expressionID = item.ID
				}
				keptWritingExpressionIDs[expressionID] = struct{}{}
			}
			if smNode.WritingExpressions != nil {
				writingExpressionManagedSceneMomentIDs[sceneMomentID] = struct{}{}
			}

			for k, cuNode := range smNode.ContentUnits {
				var contentUnitID uint
				if cuNode.ID != nil && *cuNode.ID > 0 {
					if err := s.ensureContentUnitInProject(ctx, projectID, *cuNode.ID); err != nil {
						return nil, productionWorkspaceApplyLinkError(projectID, req, productionWorkspaceLinkContext{
							Path:          fmt.Sprintf("/workspace/segments/%d/scene_moments/%d/content_units/%d/id", i, j, k),
							EntityType:    "content_unit",
							EntityID:      cuNode.ID,
							ClientID:      cuNode.ClientID,
							Title:         cuNode.Title,
							SegmentID:     &segmentID,
							SceneMomentID: &sceneMomentID,
						}, err)
					}
					smIDPtr := &sceneMomentID
					prodIDPtr := &req.ProductionID
					segIDPtr := &segmentID
					cu, err := s.PatchContentUnit(ctx, projectID, fmt.Sprint(*cuNode.ID), ContentUnitInput{
						ProductionID:  prodIDPtr,
						SegmentID:     segIDPtr,
						SceneMomentID: smIDPtr,
						ScriptBlockID: cuNode.ScriptBlockID,
						Kind:          cuNode.Kind,
						UnitCode:      cuNode.UnitCode,
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
				} else {
					smIDPtr := &sceneMomentID
					prodIDPtr := &req.ProductionID
					segIDPtr := &segmentID
					cu, err := s.CreateContentUnit(ctx, projectID, ContentUnitInput{
						ProductionID:  prodIDPtr,
						SegmentID:     segIDPtr,
						SceneMomentID: smIDPtr,
						ScriptBlockID: cuNode.ScriptBlockID,
						Kind:          cuNode.Kind,
						UnitCode:      cuNode.UnitCode,
						Order:         fallbackInt(cuNode.Order, k+1),
						Title:         cuNode.Title,
						Description:   cuNode.Description,
						ShotSize:      cuNode.ShotSize,
						CameraAngle:   cuNode.CameraAngle,
						DurationSec:   cuNode.DurationSec,
						Status:        domainsemantic.WorkspaceWorkspaceStatus(cuNode.Status),
					})
					if err != nil {
						return nil, err
					}
					resp.ContentUnits = append(resp.ContentUnits, cu)
					resp.Counts.ContentUnitsCreated++
					contentUnitID = cu.ID
				}
				keptContentUnitIDs[contentUnitID] = struct{}{}
				for l, keyframeNode := range cuNode.Keyframes {
					if err := s.applyWorkspaceKeyframe(ctx, projectID, req, sceneMomentID, &contentUnitID, keyframeNode, l, productionWorkspaceLinkContext{
						Path:          fmt.Sprintf("/workspace/segments/%d/scene_moments/%d/content_units/%d/keyframes/%d/id", i, j, k, l),
						EntityType:    "keyframe",
						EntityID:      keyframeNode.ID,
						ClientID:      keyframeNode.ClientID,
						Title:         keyframeNode.Title,
						SegmentID:     &segmentID,
						SceneMomentID: &sceneMomentID,
						ContentUnitID: &contentUnitID,
					}, resp, keptKeyframeIDs); err != nil {
						return nil, err
					}
				}
			}

			for assetIndex, asNode := range smNode.AssetSlots {
				if asNode.ID != nil && *asNode.ID > 0 {
					if err := s.ensureAssetSlotInProject(ctx, projectID, *asNode.ID); err != nil {
						return nil, productionWorkspaceApplyLinkError(projectID, req, productionWorkspaceLinkContext{
							Path:          fmt.Sprintf("/workspace/segments/%d/scene_moments/%d/asset_slots/%d/id", i, j, assetIndex),
							EntityType:    "asset_slot",
							EntityID:      asNode.ID,
							ClientID:      asNode.ClientID,
							Title:         asNode.Name,
							SegmentID:     &segmentID,
							SceneMomentID: &sceneMomentID,
						}, err)
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
						Status:       domainsemantic.WorkspaceWorkspaceStatusValue,
					}); err != nil {
						return nil, err
					}
					keptAssetSlotIDs[*asNode.ID] = struct{}{}
					continue
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
					Status:       domainsemantic.WorkspaceWorkspaceStatusValue,
				})
				if err != nil {
					return nil, err
				}
				resp.AssetSlots = append(resp.AssetSlots, slot)
				resp.Counts.AssetSlotsCreated++
				keptAssetSlotIDs[slot.ID] = struct{}{}
			}

			for l, keyframeNode := range smNode.Keyframes {
				if err := s.applyWorkspaceKeyframe(ctx, projectID, req, sceneMomentID, nil, keyframeNode, l, productionWorkspaceLinkContext{
					Path:          fmt.Sprintf("/workspace/segments/%d/scene_moments/%d/keyframes/%d/id", i, j, l),
					EntityType:    "keyframe",
					EntityID:      keyframeNode.ID,
					ClientID:      keyframeNode.ClientID,
					Title:         keyframeNode.Title,
					SegmentID:     &segmentID,
					SceneMomentID: &sceneMomentID,
				}, resp, keptKeyframeIDs); err != nil {
					return nil, err
				}
			}
		}
	}
	if err := s.applyProductionWorkspaceSnapshotOmissions(ctx, projectID, req, keptSegmentIDs, keptSceneMomentIDs, keptContentUnitIDs, keptKeyframeIDs, keptAssetSlotIDs, keptCreativeReferenceUsageIDs, keptWritingExpressionIDs, writingExpressionManagedSceneMomentIDs); err != nil {
		return nil, err
	}
	return resp, nil
}

func (s *Service) applyWorkspaceKeyframe(ctx context.Context, projectID uint, req ApplyProductionWorkspaceRequest, sceneMomentID uint, contentUnitID *uint, node WorkspaceKeyframeNode, index int, link productionWorkspaceLinkContext, resp *ApplyProductionWorkspaceResponse, keptKeyframeIDs map[uint]struct{}) error {
	prodIDPtr := &req.ProductionID
	sceneMomentIDPtr := &sceneMomentID
	if node.ID != nil && *node.ID > 0 {
		if err := s.ensureKeyframeInProject(ctx, projectID, *node.ID); err != nil {
			return productionWorkspaceApplyLinkError(projectID, req, link, err)
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
		if err != nil {
			return productionWorkspaceApplyLinkError(projectID, req, link, err)
		}
		keptKeyframeIDs[*node.ID] = struct{}{}
		return nil
	}
	keyframe, err := s.CreateKeyframe(ctx, projectID, KeyframeInput{
		ProductionID:  prodIDPtr,
		SceneMomentID: sceneMomentIDPtr,
		ContentUnitID: contentUnitID,
		Title:         node.Title,
		Description:   node.Description,
		Prompt:        node.Prompt,
		Order:         fallbackInt(node.Order, index+1),
		Status:        domainsemantic.WorkspaceWorkspaceStatus(node.Status),
	})
	if err != nil {
		return productionWorkspaceApplyLinkError(projectID, req, link, err)
	}
	resp.Keyframes = append(resp.Keyframes, keyframe)
	resp.Counts.KeyframesCreated++
	keptKeyframeIDs[keyframe.ID] = struct{}{}
	return nil
}

func (s *Service) findProductionWorkspaceCreativeReferenceUsage(ctx context.Context, projectID uint, sceneMomentID uint, referenceID uint) (domainsemantic.CreativeReferenceUsage, bool, error) {
	usages, err := s.ListCreativeReferenceUsages(ctx, CreativeReferenceUsageFilter{
		ProjectID:           projectID,
		OwnerType:           "scene_moment",
		OwnerID:             sceneMomentID,
		CreativeReferenceID: referenceID,
	})
	if err != nil {
		return domainsemantic.CreativeReferenceUsage{}, false, err
	}
	if len(usages) == 0 {
		return domainsemantic.CreativeReferenceUsage{}, false, nil
	}
	return usages[0], true, nil
}

func productionWorkspaceCreativeReferenceUsageNeedsPatch(existing domainsemantic.CreativeReferenceUsage, input CreativeReferenceUsageInput) bool {
	if input.CreativeReferenceStateID != nil && (existing.CreativeReferenceStateID == nil || *existing.CreativeReferenceStateID != *input.CreativeReferenceStateID) {
		return true
	}
	if strings.TrimSpace(input.Role) != "" && strings.TrimSpace(existing.Role) != strings.TrimSpace(input.Role) {
		return true
	}
	return false
}

func buildProductionWorkspacePreviewSemanticChanges(workspace *WorkspaceTree) []ProductionWorkspacePreviewSemanticChange {
	if workspace == nil {
		return nil
	}
	var changes []ProductionWorkspacePreviewSemanticChange
	for _, segment := range workspace.Segments {
		segmentTitle := fallbackWorkspaceTitle(segment.Title, segment.ClientID, "编排段")
		changes = append(changes, ProductionWorkspacePreviewSemanticChange{
			Kind:     "segment",
			Action:   snapshotChangeAction(segment.ID),
			Title:    segmentTitle,
			ClientID: segment.ClientID,
			ID:       segment.ID,
		})
		for _, moment := range segment.SceneMoments {
			momentTitle := fallbackWorkspaceTitle(moment.Title, moment.ClientID, "情景")
			momentParent := segmentTitle + " / " + momentTitle
			changes = append(changes, ProductionWorkspacePreviewSemanticChange{
				Kind:     "scene_moment",
				Action:   snapshotChangeAction(moment.ID),
				Title:    momentTitle,
				Parent:   segmentTitle,
				ClientID: moment.ClientID,
				ID:       moment.ID,
			})
			for _, expression := range moment.WritingExpressions {
				changes = append(changes, ProductionWorkspacePreviewSemanticChange{
					Kind:     "writing_expression",
					Action:   snapshotChangeAction(expression.ID),
					Title:    fallbackWorkspaceTitle(expression.Text, expression.ClientID, "表达条目"),
					Parent:   momentParent,
					ClientID: expression.ClientID,
					ID:       expression.ID,
				})
			}
			for _, unit := range moment.ContentUnits {
				unitTitle := fallbackWorkspaceTitle(unit.Title, unit.ClientID, "制作项")
				changes = append(changes, ProductionWorkspacePreviewSemanticChange{
					Kind:     "content_unit",
					Action:   snapshotChangeAction(unit.ID),
					Title:    unitTitle,
					Parent:   momentParent,
					ClientID: unit.ClientID,
					ID:       unit.ID,
				})
				for _, keyframe := range unit.Keyframes {
					changes = append(changes, ProductionWorkspacePreviewSemanticChange{
						Kind:     "keyframe",
						Action:   snapshotChangeAction(keyframe.ID),
						Title:    fallbackWorkspaceTitle(keyframe.Title, keyframe.ClientID, "关键帧"),
						Parent:   momentParent + " / " + unitTitle,
						ClientID: keyframe.ClientID,
						ID:       keyframe.ID,
					})
				}
			}
			for _, keyframe := range moment.Keyframes {
				changes = append(changes, ProductionWorkspacePreviewSemanticChange{
					Kind:     "keyframe",
					Action:   snapshotChangeAction(keyframe.ID),
					Title:    fallbackWorkspaceTitle(keyframe.Title, keyframe.ClientID, "关键帧"),
					Parent:   momentParent,
					ClientID: keyframe.ClientID,
					ID:       keyframe.ID,
				})
			}
			for _, ref := range moment.CreativeReferences {
				changes = append(changes, ProductionWorkspacePreviewSemanticChange{
					Kind:     "creative_reference",
					Action:   snapshotChangeAction(ref.ID),
					Title:    fallbackWorkspaceTitle(ref.Name, ref.ClientID, "设定资料"),
					Parent:   momentParent,
					ClientID: ref.ClientID,
					ID:       ref.ID,
				})
			}
			for _, slot := range moment.AssetSlots {
				changes = append(changes, ProductionWorkspacePreviewSemanticChange{
					Kind:     "asset_slot",
					Action:   snapshotChangeAction(slot.ID),
					Title:    fallbackWorkspaceTitle(slot.Name, slot.ClientID, "素材需求"),
					Parent:   momentParent,
					ClientID: slot.ClientID,
					ID:       slot.ID,
				})
			}
		}
	}
	return changes
}

func buildProductionWorkspacePreviewWarnings(workspace *WorkspaceTree, resp *ApplyProductionWorkspaceResponse) []ProductionWorkspacePreviewWarning {
	if workspace == nil {
		return nil
	}
	var warnings []ProductionWorkspacePreviewWarning
	if resp == nil || resp.Counts.SegmentsCreated == 0 && len(resp.Segments) == 0 {
		warnings = append(warnings, ProductionWorkspacePreviewWarning{
			Code:    "NO_SEGMENT_WRITE",
			Message: "本次预览没有创建新的编排段；snapshot apply 会以保留的 id 为准，未出现在工作区里的旧编排段将被删除。",
		})
	}
	for _, segment := range workspace.Segments {
		if len(segment.SceneMoments) == 0 {
			warnings = append(warnings, ProductionWorkspacePreviewWarning{
				Code:    "SEGMENT_WITHOUT_SCENE_MOMENTS",
				Message: fmt.Sprintf("编排段 %q 没有关联情景，写入后可能缺少可生成上下文。", fallbackWorkspaceTitle(segment.Title, segment.ClientID, "编排段")),
			})
		}
		for _, moment := range segment.SceneMoments {
			if len(moment.CreativeReferences) == 0 {
				warnings = append(warnings, ProductionWorkspacePreviewWarning{
					Code:    "SCENE_MOMENT_WITHOUT_CONTEXT",
					Message: fmt.Sprintf("情景 %q 没有设定引用，后续生成上下文可能不足。", fallbackWorkspaceTitle(moment.Title, moment.ClientID, "情景")),
				})
			}
		}
	}
	return warnings
}

func (s *Service) applyProductionWorkspaceSnapshotOmissions(
	ctx context.Context,
	projectID uint,
	req ApplyProductionWorkspaceRequest,
	keptSegmentIDs map[uint]struct{},
	keptSceneMomentIDs map[uint]struct{},
	keptContentUnitIDs map[uint]struct{},
	keptKeyframeIDs map[uint]struct{},
	keptAssetSlotIDs map[uint]struct{},
	keptCreativeReferenceUsageIDs map[uint]struct{},
	keptWritingExpressionIDs map[uint]struct{},
	writingExpressionManagedSceneMomentIDs map[uint]struct{},
) error {
	segments, err := s.workspaceSnapshotTargets(ctx, projectID, domainrelation.NewEntityRef("production", req.ProductionID), domainrelation.CategoryStructure, domainrelation.TypeContains, "segment")
	if err != nil {
		return err
	}
	productionSegmentIDs := make(map[uint]struct{}, len(segments))
	for _, segmentID := range segments {
		productionSegmentIDs[segmentID] = struct{}{}
	}

	moments := make([]uint, 0)
	productionSceneMomentIDs := make(map[uint]struct{})
	for segmentID := range productionSegmentIDs {
		ids, err := s.workspaceSnapshotTargets(ctx, projectID, domainrelation.NewEntityRef("segment", segmentID), domainrelation.CategoryStructure, domainrelation.TypeContains, "scene_moment")
		if err != nil {
			return err
		}
		for _, id := range ids {
			if _, seen := productionSceneMomentIDs[id]; seen {
				continue
			}
			productionSceneMomentIDs[id] = struct{}{}
			moments = append(moments, id)
		}
	}

	for momentID := range productionSceneMomentIDs {
		if _, managed := writingExpressionManagedSceneMomentIDs[momentID]; managed {
			expressions, err := s.ListWritingExpressions(ctx, WritingExpressionFilter{
				ProjectID:     projectID,
				SceneMomentID: momentID,
			})
			if err != nil {
				return err
			}
			for _, expression := range expressions {
				if _, ok := keptWritingExpressionIDs[expression.ID]; ok {
					continue
				}
				if _, err := s.repo.DeleteProjectItemByKind(ctx, projectID, "writing_expression", fmt.Sprint(expression.ID)); err != nil {
					return err
				}
			}
		}

		usageIDs, err := s.workspaceSnapshotRelationMetadataIDs(ctx, projectID, domainrelation.NewEntityRef("scene_moment", momentID), domainrelation.CategoryCreative, domainrelation.TypeUses, "creative_reference", "creative_reference_usage_id")
		if err != nil {
			return err
		}
		for _, usageID := range usageIDs {
			if _, ok := keptCreativeReferenceUsageIDs[usageID]; ok {
				continue
			}
			if _, err := s.repo.DeleteProjectItemByKind(ctx, projectID, "creative_reference_usage", fmt.Sprint(usageID)); err != nil {
				return err
			}
		}
	}

	for _, momentID := range moments {
		if _, ok := keptSceneMomentIDs[momentID]; ok {
			continue
		}
		if _, err := s.repo.DeleteProjectItemByKind(ctx, projectID, "scene_moment", fmt.Sprint(momentID)); err != nil {
			return err
		}
	}

	for _, segmentID := range segments {
		if _, ok := keptSegmentIDs[segmentID]; ok {
			continue
		}
		if _, err := s.repo.DeleteProjectItemByKind(ctx, projectID, "segment", fmt.Sprint(segmentID)); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) workspaceSnapshotTargets(ctx context.Context, projectID uint, source domainrelation.EntityRef, category string, relationType string, targetType string) ([]uint, error) {
	edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  category,
		Type:      relationType,
		Source:    source,
	})
	if err != nil {
		return nil, err
	}
	ids := make([]uint, 0, len(edges))
	seen := make(map[uint]struct{})
	for _, edge := range edges {
		if edge.Target.Type != targetType {
			continue
		}
		if _, ok := seen[edge.Target.ID]; ok {
			continue
		}
		seen[edge.Target.ID] = struct{}{}
		ids = append(ids, edge.Target.ID)
	}
	return ids, nil
}

func (s *Service) workspaceSnapshotRelationMetadataIDs(ctx context.Context, projectID uint, source domainrelation.EntityRef, category string, relationType string, targetType string, metadataKey string) ([]uint, error) {
	edges, err := s.relations.ListEdges(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  category,
		Type:      relationType,
		Source:    source,
	})
	if err != nil {
		return nil, err
	}
	ids := make([]uint, 0, len(edges))
	seen := make(map[uint]struct{})
	for _, edge := range edges {
		if edge.Target.Type != targetType {
			continue
		}
		id := relationMetadataUint(edge.Metadata, metadataKey)
		if id == 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids, nil
}

func snapshotChangeAction(id *uint) string {
	if id != nil && *id > 0 {
		return "update"
	}
	return "create"
}

func fallbackWorkspaceTitle(title string, clientID string, fallback string) string {
	if strings.TrimSpace(title) != "" {
		return strings.TrimSpace(title)
	}
	if strings.TrimSpace(clientID) != "" {
		return strings.TrimSpace(clientID)
	}
	return fallback
}

func missingWorkspaceID(kind string, clientID string, action string) error {
	return ErrInvalidInput{Err: fmt.Errorf("%s workspace %q requires id for action %q", kind, clientID, action)}
}

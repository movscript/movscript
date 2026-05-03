package handler

import (
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

func (h *SemanticEntityHandler) ensureSemanticOwnerInProject(projectID uint, ownerType string, ownerID uint) error {
	var ownerProjectID uint
	switch ownerType {
	case "project":
		var item model.Project
		if err := h.db.Select("id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ID
	case "script_version":
		var item model.ScriptVersion
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "segment":
		var item model.Segment
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "scene_moment":
		var item model.SceneMoment
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "production":
		var item model.Production
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "production_text_block":
		var item model.ProductionTextBlock
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "storyboard_script":
		var item model.StoryboardScript
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "storyboard_version":
		var item model.StoryboardVersion
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "storyboard_line":
		var item model.StoryboardLine
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "content_unit":
		var item model.ContentUnit
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "keyframe":
		var item model.Keyframe
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "preview_timeline":
		var item model.PreviewTimeline
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "creative_reference":
		var item model.CreativeReference
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "creative_reference_state":
		var item model.CreativeReferenceState
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "asset_slot":
		var item model.AssetSlot
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "asset_slot_candidate":
		var item model.AssetSlotCandidate
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "candidate_decision":
		var item model.CandidateDecision
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "review_event":
		var item model.ReviewEvent
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "work_item":
		var item model.WorkItem
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "delivery_version":
		var item model.DeliveryVersion
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = item.ProjectID
	case "canvas":
		var item model.Canvas
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		if item.ProjectID == nil {
			return gorm.ErrInvalidData
		}
		ownerProjectID = *item.ProjectID
	case "canvas_run":
		var item model.CanvasRun
		if err := h.db.Select("id, canvas_id").First(&item, ownerID).Error; err != nil {
			return err
		}
		var canvas model.Canvas
		if err := h.db.Select("id, project_id").First(&canvas, item.CanvasID).Error; err != nil {
			return err
		}
		if canvas.ProjectID == nil {
			return gorm.ErrInvalidData
		}
		ownerProjectID = *canvas.ProjectID
	case "resource":
		var item model.RawResource
		if err := h.db.Select("id").First(&item, ownerID).Error; err != nil {
			return err
		}
		ownerProjectID = projectID
	default:
		return gorm.ErrInvalidData
	}
	if ownerProjectID != projectID {
		return gorm.ErrInvalidData
	}
	return nil
}

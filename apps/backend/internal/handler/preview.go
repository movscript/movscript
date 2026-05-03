package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type PreviewHandler struct{ db *gorm.DB }

func NewPreviewHandler(db *gorm.DB) *PreviewHandler {
	return &PreviewHandler{db: db}
}

type previewGenerateRequest struct {
	Scope    string `json:"scope" binding:"required"` // segment|scene_moment|content_unit
	EntityID uint   `json:"entity_id" binding:"required"`
}

type previewEntitySummary struct {
	ID          uint   `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

type previewContext struct {
	SegmentTitle     string `json:"segment_title,omitempty"`
	SceneMomentTitle string `json:"scene_moment_title,omitempty"`
}

type previewContentUnit struct {
	ID          uint    `json:"id"`
	Order       int     `json:"order"`
	Title       string  `json:"title"`
	Kind        string  `json:"kind"`
	Description string  `json:"description"`
	DurationSec float64 `json:"duration_sec"`
}

type previewKeyframe struct {
	ID          uint   `json:"id"`
	Order       int    `json:"order"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Prompt      string `json:"prompt"`
	HasAsset    bool   `json:"has_asset"`
}

type previewMissingAsset struct {
	ID          uint   `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Kind        string `json:"kind"`
	Priority    string `json:"priority"`
}

type previewGenerateResponse struct {
	Scope         string                `json:"scope"`
	Entity        previewEntitySummary  `json:"entity"`
	Context       previewContext        `json:"context"`
	ContentUnits  []previewContentUnit  `json:"content_units"`
	Keyframes     []previewKeyframe     `json:"keyframes"`
	MissingAssets []previewMissingAsset `json:"missing_assets"`
	GeneratedAt   string                `json:"generated_at"`
}

func (h *PreviewHandler) Generate(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	if projectID == 0 {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("invalid project id"))
		return
	}

	var req previewGenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}

	resp := previewGenerateResponse{
		Scope:         req.Scope,
		ContentUnits:  []previewContentUnit{},
		Keyframes:     []previewKeyframe{},
		MissingAssets: []previewMissingAsset{},
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	switch req.Scope {
	case "segment":
		if err := h.loadSegmentPreview(projectID, req.EntityID, &resp); err != nil {
			c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
			return
		}
	case "scene_moment":
		if err := h.loadSceneMomentPreview(projectID, req.EntityID, &resp); err != nil {
			c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
			return
		}
	case "content_unit":
		if err := h.loadContentUnitPreview(projectID, req.EntityID, &resp); err != nil {
			c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
			return
		}
	default:
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("scope must be segment, scene_moment, or content_unit"))
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *PreviewHandler) loadSegmentPreview(projectID, segmentID uint, resp *previewGenerateResponse) error {
	var seg model.Segment
	if err := h.db.Where("project_id = ? AND id = ?", projectID, segmentID).First(&seg).Error; err != nil {
		return err
	}
	resp.Entity = previewEntitySummary{ID: seg.ID, Title: seg.Title, Description: seg.Summary}

	var units []model.ContentUnit
	h.db.Where("project_id = ? AND segment_id = ?", projectID, segmentID).Order(`"order" asc, id asc`).Find(&units)
	for _, u := range units {
		resp.ContentUnits = append(resp.ContentUnits, previewContentUnit{
			ID: u.ID, Order: u.Order, Title: u.Title, Kind: u.Kind,
			Description: u.Description, DurationSec: u.DurationSec,
		})
	}

	h.loadKeyframesForUnits(projectID, units, resp)
	h.loadMissingAssetsForOwner(projectID, "segment", segmentID, resp)
	return nil
}

func (h *PreviewHandler) loadSceneMomentPreview(projectID, momentID uint, resp *previewGenerateResponse) error {
	var moment model.SceneMoment
	if err := h.db.Where("project_id = ? AND id = ?", projectID, momentID).First(&moment).Error; err != nil {
		return err
	}
	resp.Entity = previewEntitySummary{ID: moment.ID, Title: moment.Title, Description: moment.Description}

	if moment.SegmentID != nil {
		var seg model.Segment
		if h.db.Where("id = ?", *moment.SegmentID).First(&seg).Error == nil {
			resp.Context.SegmentTitle = seg.Title
		}
	}

	var units []model.ContentUnit
	h.db.Where("project_id = ? AND scene_moment_id = ?", projectID, momentID).Order(`"order" asc, id asc`).Find(&units)
	for _, u := range units {
		resp.ContentUnits = append(resp.ContentUnits, previewContentUnit{
			ID: u.ID, Order: u.Order, Title: u.Title, Kind: u.Kind,
			Description: u.Description, DurationSec: u.DurationSec,
		})
	}

	h.loadKeyframesForUnits(projectID, units, resp)
	h.loadMissingAssetsForOwner(projectID, "scene_moment", momentID, resp)
	return nil
}

func (h *PreviewHandler) loadContentUnitPreview(projectID, unitID uint, resp *previewGenerateResponse) error {
	var unit model.ContentUnit
	if err := h.db.Where("project_id = ? AND id = ?", projectID, unitID).First(&unit).Error; err != nil {
		return err
	}
	resp.Entity = previewEntitySummary{ID: unit.ID, Title: unit.Title, Description: unit.Description}
	resp.ContentUnits = []previewContentUnit{{
		ID: unit.ID, Order: unit.Order, Title: unit.Title, Kind: unit.Kind,
		Description: unit.Description, DurationSec: unit.DurationSec,
	}}

	if unit.SegmentID != nil {
		var seg model.Segment
		if h.db.Where("id = ?", *unit.SegmentID).First(&seg).Error == nil {
			resp.Context.SegmentTitle = seg.Title
		}
	}
	if unit.SceneMomentID != nil {
		var moment model.SceneMoment
		if h.db.Where("id = ?", *unit.SceneMomentID).First(&moment).Error == nil {
			resp.Context.SceneMomentTitle = moment.Title
		}
	}

	h.loadKeyframesForUnits(projectID, []model.ContentUnit{unit}, resp)
	h.loadMissingAssetsForOwner(projectID, "content_unit", unitID, resp)
	return nil
}

func (h *PreviewHandler) loadKeyframesForUnits(projectID uint, units []model.ContentUnit, resp *previewGenerateResponse) {
	if len(units) == 0 {
		return
	}
	ids := make([]uint, len(units))
	for i, u := range units {
		ids[i] = u.ID
	}
	var keyframes []model.Keyframe
	h.db.Where("project_id = ? AND content_unit_id IN ?", projectID, ids).Order(`"order" asc, id asc`).Find(&keyframes)
	for _, kf := range keyframes {
		resp.Keyframes = append(resp.Keyframes, previewKeyframe{
			ID:          kf.ID,
			Order:       kf.Order,
			Title:       kf.Title,
			Description: kf.Description,
			Prompt:      kf.Prompt,
			HasAsset:    kf.ResourceID != nil,
		})
	}
}

func (h *PreviewHandler) loadMissingAssetsForOwner(projectID uint, ownerType string, ownerID uint, resp *previewGenerateResponse) {
	var slots []model.AssetSlot
	h.db.Where("project_id = ? AND owner_type = ? AND owner_id = ? AND status IN ?",
		projectID, ownerType, ownerID, []string{"missing", "candidate"}).
		Order("priority desc, id asc").Find(&slots)
	for _, s := range slots {
		resp.MissingAssets = append(resp.MissingAssets, previewMissingAsset{
			ID: s.ID, Name: s.Name, Description: s.Description, Kind: s.Kind, Priority: s.Priority,
		})
	}
}

package preview

import (
	"context"
	"errors"
	"time"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

var (
	ErrNotFound     = errors.New("preview entity not found")
	ErrInvalidScope = errors.New("invalid preview scope")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type GenerateInput struct {
	ProjectID uint
	Scope     string
	EntityID  uint
}

type EntitySummary struct {
	ID          uint   `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

type Context struct {
	SegmentTitle     string `json:"segment_title,omitempty"`
	SceneMomentTitle string `json:"scene_moment_title,omitempty"`
}

type ContentUnit struct {
	ID          uint    `json:"id"`
	Order       int     `json:"order"`
	Title       string  `json:"title"`
	Kind        string  `json:"kind"`
	Description string  `json:"description"`
	DurationSec float64 `json:"duration_sec"`
}

type Keyframe struct {
	ID          uint   `json:"id"`
	Order       int    `json:"order"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Prompt      string `json:"prompt"`
	HasAsset    bool   `json:"has_asset"`
}

type MissingAsset struct {
	ID          uint   `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Kind        string `json:"kind"`
	Priority    string `json:"priority"`
}

type GenerateResponse struct {
	Scope         string         `json:"scope"`
	Entity        EntitySummary  `json:"entity"`
	Context       Context        `json:"context"`
	ContentUnits  []ContentUnit  `json:"content_units"`
	Keyframes     []Keyframe     `json:"keyframes"`
	MissingAssets []MissingAsset `json:"missing_assets"`
	GeneratedAt   string         `json:"generated_at"`
}

func (s *Service) Generate(ctx context.Context, input GenerateInput) (GenerateResponse, error) {
	resp := GenerateResponse{
		Scope:         input.Scope,
		ContentUnits:  []ContentUnit{},
		Keyframes:     []Keyframe{},
		MissingAssets: []MissingAsset{},
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	var err error
	switch input.Scope {
	case "segment":
		err = s.loadSegmentPreview(ctx, input.ProjectID, input.EntityID, &resp)
	case "scene_moment":
		err = s.loadSceneMomentPreview(ctx, input.ProjectID, input.EntityID, &resp)
	case "content_unit":
		err = s.loadContentUnitPreview(ctx, input.ProjectID, input.EntityID, &resp)
	default:
		return resp, ErrInvalidScope
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return resp, ErrNotFound
	}
	return resp, err
}

func (s *Service) loadSegmentPreview(ctx context.Context, projectID, segmentID uint, resp *GenerateResponse) error {
	var seg model.Segment
	if err := s.db.WithContext(ctx).Where("project_id = ? AND id = ?", projectID, segmentID).First(&seg).Error; err != nil {
		return err
	}
	resp.Entity = EntitySummary{ID: seg.ID, Title: seg.Title, Description: seg.Summary}

	units, err := s.contentUnits(ctx, projectID, "segment_id", segmentID)
	if err != nil {
		return err
	}
	resp.ContentUnits = append(resp.ContentUnits, contentUnitResponses(units)...)
	if err := s.loadKeyframesForUnits(ctx, projectID, units, resp); err != nil {
		return err
	}
	return s.loadMissingAssetsForOwner(ctx, projectID, "segment", segmentID, resp)
}

func (s *Service) loadSceneMomentPreview(ctx context.Context, projectID, momentID uint, resp *GenerateResponse) error {
	var moment model.SceneMoment
	if err := s.db.WithContext(ctx).Where("project_id = ? AND id = ?", projectID, momentID).First(&moment).Error; err != nil {
		return err
	}
	resp.Entity = EntitySummary{ID: moment.ID, Title: moment.Title, Description: moment.Description}

	if moment.SegmentID != nil {
		var seg model.Segment
		if s.db.WithContext(ctx).Where("id = ?", *moment.SegmentID).First(&seg).Error == nil {
			resp.Context.SegmentTitle = seg.Title
		}
	}

	units, err := s.contentUnits(ctx, projectID, "scene_moment_id", momentID)
	if err != nil {
		return err
	}
	resp.ContentUnits = append(resp.ContentUnits, contentUnitResponses(units)...)
	if err := s.loadKeyframesForUnits(ctx, projectID, units, resp); err != nil {
		return err
	}
	return s.loadMissingAssetsForOwner(ctx, projectID, "scene_moment", momentID, resp)
}

func (s *Service) loadContentUnitPreview(ctx context.Context, projectID, unitID uint, resp *GenerateResponse) error {
	var unit model.ContentUnit
	if err := s.db.WithContext(ctx).Where("project_id = ? AND id = ?", projectID, unitID).First(&unit).Error; err != nil {
		return err
	}
	resp.Entity = EntitySummary{ID: unit.ID, Title: unit.Title, Description: unit.Description}
	resp.ContentUnits = contentUnitResponses([]model.ContentUnit{unit})

	if unit.SegmentID != nil {
		var seg model.Segment
		if s.db.WithContext(ctx).Where("id = ?", *unit.SegmentID).First(&seg).Error == nil {
			resp.Context.SegmentTitle = seg.Title
		}
	}
	if unit.SceneMomentID != nil {
		var moment model.SceneMoment
		if s.db.WithContext(ctx).Where("id = ?", *unit.SceneMomentID).First(&moment).Error == nil {
			resp.Context.SceneMomentTitle = moment.Title
		}
	}

	if err := s.loadKeyframesForUnits(ctx, projectID, []model.ContentUnit{unit}, resp); err != nil {
		return err
	}
	return s.loadMissingAssetsForOwner(ctx, projectID, "content_unit", unitID, resp)
}

func (s *Service) contentUnits(ctx context.Context, projectID uint, field string, id uint) ([]model.ContentUnit, error) {
	units := make([]model.ContentUnit, 0)
	err := s.db.WithContext(ctx).Where("project_id = ? AND "+field+" = ?", projectID, id).
		Order(`"order" asc, id asc`).Find(&units).Error
	return units, err
}

func contentUnitResponses(units []model.ContentUnit) []ContentUnit {
	out := make([]ContentUnit, 0, len(units))
	for _, u := range units {
		out = append(out, ContentUnit{
			ID: u.ID, Order: u.Order, Title: u.Title, Kind: u.Kind,
			Description: u.Description, DurationSec: u.DurationSec,
		})
	}
	return out
}

func (s *Service) loadKeyframesForUnits(ctx context.Context, projectID uint, units []model.ContentUnit, resp *GenerateResponse) error {
	if len(units) == 0 {
		return nil
	}
	ids := make([]uint, len(units))
	for i, u := range units {
		ids[i] = u.ID
	}
	keyframes := make([]model.Keyframe, 0)
	if err := s.db.WithContext(ctx).Where("project_id = ? AND content_unit_id IN ?", projectID, ids).Order(`"order" asc, id asc`).Find(&keyframes).Error; err != nil {
		return err
	}
	for _, kf := range keyframes {
		resp.Keyframes = append(resp.Keyframes, Keyframe{
			ID:          kf.ID,
			Order:       kf.Order,
			Title:       kf.Title,
			Description: kf.Description,
			Prompt:      kf.Prompt,
			HasAsset:    kf.ResourceID != nil,
		})
	}
	return nil
}

func (s *Service) loadMissingAssetsForOwner(ctx context.Context, projectID uint, ownerType string, ownerID uint, resp *GenerateResponse) error {
	slots := make([]model.AssetSlot, 0)
	if err := s.db.WithContext(ctx).Where("project_id = ? AND owner_type = ? AND owner_id = ? AND status IN ?",
		projectID, ownerType, ownerID, []string{"missing", "candidate"}).
		Order("priority desc, id asc").Find(&slots).Error; err != nil {
		return err
	}
	for _, slot := range slots {
		resp.MissingAssets = append(resp.MissingAssets, MissingAsset{
			ID: slot.ID, Name: slot.Name, Description: slot.Description, Kind: slot.Kind, Priority: slot.Priority,
		})
	}
	return nil
}

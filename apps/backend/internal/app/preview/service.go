package preview

import (
	"context"
	"errors"
	"strconv"
	"time"

	relationapp "github.com/movscript/movscript/internal/app/relation"
	domainrelation "github.com/movscript/movscript/internal/domain/relation"
	"gorm.io/gorm"
)

var (
	ErrNotFound     = errors.New("preview entity not found")
	ErrInvalidScope = errors.New("invalid preview scope")
)

type Service struct {
	repo      repository
	relations relationReader
}

type relationReader interface {
	ListEdges(ctx context.Context, filter relationapp.EdgeFilter) ([]domainrelation.Edge, error)
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}, relations: relationapp.NewService(db)}
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
	SceneMomentCode  string `json:"scene_moment_code,omitempty"`
}

type ContentUnit struct {
	ID          uint    `json:"id"`
	UnitCode    string  `json:"unit_code"`
	Order       int     `json:"order"`
	Title       string  `json:"title"`
	Kind        string  `json:"kind"`
	Description string  `json:"description"`
	DurationSec float64 `json:"duration_sec"`
}

type Keyframe struct {
	ID            uint   `json:"id"`
	ContentUnitID *uint  `json:"content_unit_id,omitempty"`
	Order         int    `json:"order"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Prompt        string `json:"prompt"`
	ResourceID    *uint  `json:"resource_id,omitempty"`
	ResourceURL   string `json:"resource_url,omitempty"`
	HasAsset      bool   `json:"has_asset"`
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

type segmentProjection struct {
	ID      uint
	Title   string
	Summary string
}

type sceneMomentProjection struct {
	ID          uint
	SegmentID   *uint
	SceneCode   string
	Title       string
	Description string
}

type contentUnitProjection struct {
	ID            uint
	SegmentID     *uint
	SceneMomentID *uint
	UnitCode      string
	Order         int
	Title         string
	Kind          string
	Description   string
	DurationSec   float64
}

type keyframeProjection struct {
	ID            uint
	ContentUnitID *uint
	Order         int
	Title         string
	Description   string
	Prompt        string
	ResourceID    *uint
}

type assetSlotProjection struct {
	ID          uint
	Name        string
	Description string
	Kind        string
	Priority    string
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
	return resp, err
}

func (s *Service) loadSegmentPreview(ctx context.Context, projectID, segmentID uint, resp *GenerateResponse) error {
	seg, err := s.repo.GetSegment(ctx, projectID, segmentID)
	if err != nil {
		return err
	}
	resp.Entity = EntitySummary{ID: seg.ID, Title: seg.Title, Description: seg.Summary}

	unitIDs, err := s.relatedTargetIDs(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Source:    domainrelation.NewEntityRef("segment", segmentID),
	}, "content_unit")
	if err != nil {
		return err
	}
	units, err := s.repo.ListContentUnitsByIDs(ctx, projectID, unitIDs)
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
	moment, err := s.repo.GetSceneMoment(ctx, projectID, momentID)
	if err != nil {
		return err
	}
	resp.Entity = EntitySummary{ID: moment.ID, Title: moment.Title, Description: moment.Description}
	resp.Context.SceneMomentCode = moment.SceneCode

	segmentIDs, err := s.relatedSourceIDs(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Target:    domainrelation.NewEntityRef("scene_moment", momentID),
	}, "segment")
	if err != nil {
		return err
	}
	if len(segmentIDs) > 0 {
		if seg, err := s.repo.GetSegmentByID(ctx, segmentIDs[0]); err == nil {
			resp.Context.SegmentTitle = seg.Title
		}
	}

	unitIDs, err := s.relatedSourceIDs(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeBasedOn,
		Target:    domainrelation.NewEntityRef("scene_moment", momentID),
	}, "content_unit")
	if err != nil {
		return err
	}
	units, err := s.repo.ListContentUnitsByIDs(ctx, projectID, unitIDs)
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
	unit, err := s.repo.GetContentUnit(ctx, projectID, unitID)
	if err != nil {
		return err
	}
	resp.Entity = EntitySummary{ID: unit.ID, Title: unit.Title, Description: unit.Description}
	resp.ContentUnits = contentUnitResponses([]contentUnitProjection{unit})

	segmentIDs, err := s.relatedSourceIDs(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeContains,
		Target:    domainrelation.NewEntityRef("content_unit", unitID),
	}, "segment")
	if err != nil {
		return err
	}
	if len(segmentIDs) > 0 {
		if seg, err := s.repo.GetSegmentByID(ctx, segmentIDs[0]); err == nil {
			resp.Context.SegmentTitle = seg.Title
		}
	}
	momentIDs, err := s.relatedTargetIDs(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryStructure,
		Type:      domainrelation.TypeBasedOn,
		Source:    domainrelation.NewEntityRef("content_unit", unitID),
	}, "scene_moment")
	if err != nil {
		return err
	}
	if len(momentIDs) > 0 {
		if moment, err := s.repo.GetSceneMomentByID(ctx, momentIDs[0]); err == nil {
			resp.Context.SceneMomentTitle = moment.Title
			resp.Context.SceneMomentCode = moment.SceneCode
		}
	}

	if err := s.loadKeyframesForUnits(ctx, projectID, []contentUnitProjection{unit}, resp); err != nil {
		return err
	}
	return s.loadMissingAssetsForOwner(ctx, projectID, "content_unit", unitID, resp)
}

func contentUnitResponses(units []contentUnitProjection) []ContentUnit {
	out := make([]ContentUnit, 0, len(units))
	for _, u := range units {
		out = append(out, ContentUnit{
			ID: u.ID, UnitCode: u.UnitCode, Order: u.Order, Title: u.Title, Kind: u.Kind,
			Description: u.Description, DurationSec: u.DurationSec,
		})
	}
	return out
}

func (s *Service) loadKeyframesForUnits(ctx context.Context, projectID uint, units []contentUnitProjection, resp *GenerateResponse) error {
	if len(units) == 0 {
		return nil
	}
	ids := make([]uint, 0, len(units))
	for _, unit := range units {
		keyframeIDs, err := s.relatedTargetIDs(ctx, relationapp.EdgeFilter{
			ProjectID: projectID,
			Category:  domainrelation.CategoryStructure,
			Type:      domainrelation.TypeHasKeyframe,
			Source:    domainrelation.NewEntityRef("content_unit", unit.ID),
		}, "keyframe")
		if err != nil {
			return err
		}
		ids = append(ids, keyframeIDs...)
	}
	keyframes, err := s.repo.ListKeyframesByIDs(ctx, projectID, ids)
	if err != nil {
		return err
	}
	for _, kf := range keyframes {
		resp.Keyframes = append(resp.Keyframes, Keyframe{
			ID:            kf.ID,
			ContentUnitID: kf.ContentUnitID,
			Order:         kf.Order,
			Title:         kf.Title,
			Description:   kf.Description,
			Prompt:        kf.Prompt,
			ResourceID:    kf.ResourceID,
			ResourceURL:   previewResourceURL(kf.ResourceID),
			HasAsset:      kf.ResourceID != nil,
		})
	}
	return nil
}

func previewResourceURL(id *uint) string {
	if id == nil || *id == 0 {
		return ""
	}
	return "/api/v1/resources/" + strconv.FormatUint(uint64(*id), 10) + "/file"
}

func (s *Service) loadMissingAssetsForOwner(ctx context.Context, projectID uint, ownerType string, ownerID uint, resp *GenerateResponse) error {
	slotIDs, err := s.relatedTargetIDsOfTypes(ctx, relationapp.EdgeFilter{
		ProjectID: projectID,
		Category:  domainrelation.CategoryAsset,
		Source:    domainrelation.NewEntityRef(ownerType, ownerID),
	}, "asset_slot", domainrelation.TypeNeedsAsset, domainrelation.TypeUsesAsset)
	if err != nil {
		return err
	}
	slots, err := s.repo.ListMissingAssetsByIDs(ctx, projectID, slotIDs)
	if err != nil {
		return err
	}
	for _, slot := range slots {
		resp.MissingAssets = append(resp.MissingAssets, MissingAsset{
			ID: slot.ID, Name: slot.Name, Description: slot.Description, Kind: slot.Kind, Priority: slot.Priority,
		})
	}
	return nil
}

func (s *Service) relatedTargetIDs(ctx context.Context, filter relationapp.EdgeFilter, targetType string) ([]uint, error) {
	return s.relatedTargetIDsOfTypes(ctx, filter, targetType)
}

func (s *Service) relatedTargetIDsOfTypes(ctx context.Context, filter relationapp.EdgeFilter, targetType string, edgeTypes ...string) ([]uint, error) {
	edges, err := s.relations.ListEdges(ctx, filter)
	if err != nil {
		return nil, err
	}
	allowed := map[string]struct{}{}
	for _, edgeType := range edgeTypes {
		if edgeType != "" {
			allowed[edgeType] = struct{}{}
		}
	}
	ids := make([]uint, 0, len(edges))
	seen := make(map[uint]struct{}, len(edges))
	for _, edge := range edges {
		if edge.Target.Type != targetType {
			continue
		}
		if len(allowed) > 0 {
			if _, ok := allowed[edge.Type]; !ok {
				continue
			}
		}
		if _, ok := seen[edge.Target.ID]; ok {
			continue
		}
		seen[edge.Target.ID] = struct{}{}
		ids = append(ids, edge.Target.ID)
	}
	return ids, nil
}

func (s *Service) relatedSourceIDs(ctx context.Context, filter relationapp.EdgeFilter, sourceType string) ([]uint, error) {
	edges, err := s.relations.ListEdges(ctx, filter)
	if err != nil {
		return nil, err
	}
	ids := make([]uint, 0, len(edges))
	seen := make(map[uint]struct{}, len(edges))
	for _, edge := range edges {
		if edge.Source.Type != sourceType {
			continue
		}
		if _, ok := seen[edge.Source.ID]; ok {
			continue
		}
		seen[edge.Source.ID] = struct{}{}
		ids = append(ids, edge.Source.ID)
	}
	return ids, nil
}

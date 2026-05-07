package artifactref

import (
	"context"
	"sort"
	"strconv"
	"strings"
	"time"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	domainresourcebinding "github.com/movscript/movscript/internal/domain/resourcebinding"
	domainworkflow "github.com/movscript/movscript/internal/domain/workflow"
	"gorm.io/gorm"
)

const timeFormatRFC3339 = "2006-01-02T15:04:05Z07:00"

type ResourceURLFunc func(id uint) string

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type ListFilter struct {
	ProjectID   uint
	Kind        string
	ResourceURL ResourceURLFunc
}

type EntityContext struct {
	ScriptVersionID   *uint `json:"script_version_id,omitempty"`
	ContentUnitID     *uint `json:"content_unit_id,omitempty"`
	KeyframeID        *uint `json:"keyframe_id,omitempty"`
	AssetSlotID       *uint `json:"asset_slot_id,omitempty"`
	DeliveryVersionID *uint `json:"delivery_version_id,omitempty"`
}

type Ref struct {
	Kind          string                      `json:"kind"`
	ID            uint                        `json:"id"`
	Title         string                      `json:"title"`
	Subtitle      string                      `json:"subtitle,omitempty"`
	Status        string                      `json:"status,omitempty"`
	EntityContext EntityContext               `json:"entity_context"`
	Resource      *domainresource.RawResource `json:"resource,omitempty"`
	CreatedAt     string                      `json:"created_at"`
	UpdatedAt     string                      `json:"updated_at"`
}

type scriptVersionProjection struct {
	ID         uint
	Title      string
	SourceType string
	Status     string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type assetSlotProjection struct {
	ID        uint
	Name      string
	Kind      string
	Status    string
	Resource  *domainresource.RawResource
	CreatedAt time.Time
	UpdatedAt time.Time
}

type contentUnitProjection struct {
	ID          uint
	Order       int
	Title       string
	Description string
	Status      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type keyframeProjection struct {
	ID            uint
	ContentUnitID *uint
	Order         int
	Title         string
	Description   string
	Status        string
	Resource      *domainresource.RawResource
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type deliveryVersionProjection struct {
	ID          uint
	Name        string
	Description string
	Status      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (s *Service) ListByProject(ctx context.Context, filter ListFilter) ([]Ref, error) {
	kindFilter := strings.TrimSpace(filter.Kind)
	refs := make([]Ref, 0)

	if kindFilter == "" || kindFilter == domainworkflow.EntityKindScriptVersion {
		items, err := s.scriptVersionRefs(ctx, filter.ProjectID)
		if err != nil {
			return nil, err
		}
		refs = append(refs, items...)
	}
	if kindFilter == "" || kindFilter == domainworkflow.EntityKindAssetSlot {
		items, err := s.assetSlotRefs(ctx, filter.ProjectID, filter.ResourceURL)
		if err != nil {
			return nil, err
		}
		refs = append(refs, items...)
	}
	if kindFilter == "" || kindFilter == domainworkflow.EntityKindContentUnit {
		items, err := s.contentUnitRefs(ctx, filter.ProjectID)
		if err != nil {
			return nil, err
		}
		refs = append(refs, items...)
	}
	if kindFilter == "" || kindFilter == domainworkflow.EntityKindKeyframe {
		items, err := s.keyframeRefs(ctx, filter.ProjectID, filter.ResourceURL)
		if err != nil {
			return nil, err
		}
		refs = append(refs, items...)
	}
	if kindFilter == "" || kindFilter == domainworkflow.EntityKindDeliveryVersion {
		items, err := s.deliveryVersionRefs(ctx, filter.ProjectID)
		if err != nil {
			return nil, err
		}
		refs = append(refs, items...)
	}

	sort.SliceStable(refs, func(i, j int) bool {
		return refs[i].UpdatedAt > refs[j].UpdatedAt
	})
	return refs, nil
}

func (s *Service) scriptVersionRefs(ctx context.Context, projectID uint) ([]Ref, error) {
	versions, err := s.repo.ListScriptVersions(ctx, projectID)
	if err != nil {
		return nil, err
	}
	refs := make([]Ref, 0, len(versions))
	for _, version := range versions {
		id := version.ID
		refs = append(refs, Ref{
			Kind:          domainworkflow.EntityKindScriptVersion,
			ID:            version.ID,
			Title:         fallbackTitle(version.Title, "未命名剧本版本"),
			Subtitle:      version.SourceType,
			Status:        version.Status,
			EntityContext: EntityContext{ScriptVersionID: &id},
			CreatedAt:     version.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:     version.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs, nil
}

func (s *Service) assetSlotRefs(ctx context.Context, projectID uint, resourceURL ResourceURLFunc) ([]Ref, error) {
	slots, err := s.repo.ListAssetSlots(ctx, projectID)
	if err != nil {
		return nil, err
	}
	refs := make([]Ref, 0, len(slots))
	for _, slot := range slots {
		id := slot.ID
		resource := withResourceURL(slot.Resource, resourceURL)
		if resource == nil {
			resource = s.firstBoundResource(ctx, projectID, domainresourcebinding.OwnerTypeAssetSlot, slot.ID, resourceURL, domainresourcebinding.RoleThumbnail, domainresourcebinding.RoleFinal, domainresourcebinding.RoleReference)
		}
		refs = append(refs, Ref{
			Kind:          domainworkflow.EntityKindAssetSlot,
			ID:            slot.ID,
			Title:         fallbackTitle(slot.Name, "未命名素材位"),
			Subtitle:      slot.Kind,
			Status:        slot.Status,
			EntityContext: EntityContext{AssetSlotID: &id},
			Resource:      resource,
			CreatedAt:     slot.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:     slot.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs, nil
}

func (s *Service) contentUnitRefs(ctx context.Context, projectID uint) ([]Ref, error) {
	units, err := s.repo.ListContentUnits(ctx, projectID)
	if err != nil {
		return nil, err
	}
	refs := make([]Ref, 0, len(units))
	for _, unit := range units {
		id := unit.ID
		refs = append(refs, Ref{
			Kind:          domainworkflow.EntityKindContentUnit,
			ID:            unit.ID,
			Title:         fallbackTitle(unit.Title, "内容单元 #"+strconv.Itoa(unit.Order)),
			Subtitle:      unit.Description,
			Status:        unit.Status,
			EntityContext: EntityContext{ContentUnitID: &id},
			CreatedAt:     unit.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:     unit.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs, nil
}

func (s *Service) keyframeRefs(ctx context.Context, projectID uint, resourceURL ResourceURLFunc) ([]Ref, error) {
	keyframes, err := s.repo.ListKeyframes(ctx, projectID)
	if err != nil {
		return nil, err
	}
	refs := make([]Ref, 0, len(keyframes))
	for _, keyframe := range keyframes {
		id := keyframe.ID
		refs = append(refs, Ref{
			Kind:          domainworkflow.EntityKindKeyframe,
			ID:            keyframe.ID,
			Title:         fallbackTitle(keyframe.Title, "关键帧 #"+strconv.Itoa(keyframe.Order)),
			Subtitle:      keyframe.Description,
			Status:        keyframe.Status,
			EntityContext: EntityContext{KeyframeID: &id, ContentUnitID: keyframe.ContentUnitID},
			Resource:      withResourceURL(keyframe.Resource, resourceURL),
			CreatedAt:     keyframe.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:     keyframe.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs, nil
}

func (s *Service) deliveryVersionRefs(ctx context.Context, projectID uint) ([]Ref, error) {
	versions, err := s.repo.ListDeliveryVersions(ctx, projectID)
	if err != nil {
		return nil, err
	}
	refs := make([]Ref, 0, len(versions))
	for _, version := range versions {
		id := version.ID
		refs = append(refs, Ref{
			Kind:          domainworkflow.EntityKindDeliveryVersion,
			ID:            version.ID,
			Title:         fallbackTitle(version.Name, "交付版本"),
			Subtitle:      version.Description,
			Status:        version.Status,
			EntityContext: EntityContext{DeliveryVersionID: &id},
			CreatedAt:     version.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:     version.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs, nil
}

func (s *Service) firstBoundResource(ctx context.Context, projectID uint, ownerType string, ownerID uint, resourceURL ResourceURLFunc, roles ...string) *domainresource.RawResource {
	resource, _ := s.repo.FirstBoundResource(ctx, projectID, ownerType, ownerID, roles...)
	return withResourceURL(resource, resourceURL)
}

func withResourceURL(resource *domainresource.RawResource, resourceURL ResourceURLFunc) *domainresource.RawResource {
	if resource == nil {
		return nil
	}
	domainResource := *resource
	if resourceURL != nil {
		domainResource.URL = resourceURL(resource.ID)
	}
	return &domainResource
}

func fallbackTitle(value string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

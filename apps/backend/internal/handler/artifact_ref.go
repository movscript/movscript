package handler

import (
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type ArtifactRefHandler struct{ db *gorm.DB }

func NewArtifactRefHandler(db *gorm.DB) *ArtifactRefHandler { return &ArtifactRefHandler{db: db} }

type ArtifactEntityContext struct {
	ScriptVersionID   *uint `json:"script_version_id,omitempty"`
	ContentUnitID     *uint `json:"content_unit_id,omitempty"`
	KeyframeID        *uint `json:"keyframe_id,omitempty"`
	AssetSlotID       *uint `json:"asset_slot_id,omitempty"`
	DeliveryVersionID *uint `json:"delivery_version_id,omitempty"`
}

type ArtifactRef struct {
	Kind          string                `json:"kind"`
	ID            uint                  `json:"id"`
	Title         string                `json:"title"`
	Subtitle      string                `json:"subtitle,omitempty"`
	Status        string                `json:"status,omitempty"`
	EntityContext ArtifactEntityContext `json:"entity_context"`
	Resource      *model.RawResource    `json:"resource,omitempty"`
	CreatedAt     string                `json:"created_at"`
	UpdatedAt     string                `json:"updated_at"`
}

func (h *ArtifactRefHandler) ListByProject(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	kindFilter := strings.TrimSpace(c.Query("kind"))
	refs := make([]ArtifactRef, 0)

	if kindFilter == "" || kindFilter == "script_version" {
		refs = append(refs, h.scriptVersionRefs(projectID)...)
	}
	if kindFilter == "" || kindFilter == "asset_slot" {
		refs = append(refs, h.assetSlotRefs(c, projectID)...)
	}
	if kindFilter == "" || kindFilter == "content_unit" {
		refs = append(refs, h.contentUnitRefs(projectID)...)
	}
	if kindFilter == "" || kindFilter == "keyframe" {
		refs = append(refs, h.keyframeRefs(c, projectID)...)
	}
	if kindFilter == "" || kindFilter == "delivery_version" {
		refs = append(refs, h.deliveryVersionRefs(projectID)...)
	}

	sort.SliceStable(refs, func(i, j int) bool {
		return refs[i].UpdatedAt > refs[j].UpdatedAt
	})
	c.JSON(http.StatusOK, refs)
}

func (h *ArtifactRefHandler) scriptVersionRefs(projectID uint) []ArtifactRef {
	var versions []model.ScriptVersion
	h.db.Where("project_id = ?", projectID).Order("updated_at desc").Find(&versions)
	refs := make([]ArtifactRef, 0, len(versions))
	for _, version := range versions {
		id := version.ID
		refs = append(refs, ArtifactRef{
			Kind:          "script_version",
			ID:            version.ID,
			Title:         fallbackTitle(version.Title, "未命名剧本版本"),
			Subtitle:      version.SourceType,
			Status:        version.Status,
			EntityContext: ArtifactEntityContext{ScriptVersionID: &id},
			CreatedAt:     version.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:     version.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs
}

func (h *ArtifactRefHandler) assetSlotRefs(c *gin.Context, projectID uint) []ArtifactRef {
	var slots []model.AssetSlot
	h.db.Preload("Resource").Where("project_id = ?", projectID).Order("updated_at desc").Find(&slots)
	refs := make([]ArtifactRef, 0, len(slots))
	for _, slot := range slots {
		id := slot.ID
		resource := slot.Resource
		if resource != nil {
			resource.URL = resourceURL(c, resource.ID)
		}
		if resource == nil {
			resource = h.firstBoundResource(c, projectID, "asset_slot", slot.ID, "thumbnail", "final", "reference")
		}
		refs = append(refs, ArtifactRef{
			Kind:          "asset_slot",
			ID:            slot.ID,
			Title:         fallbackTitle(slot.Name, "未命名素材位"),
			Subtitle:      slot.Kind,
			Status:        slot.Status,
			EntityContext: ArtifactEntityContext{AssetSlotID: &id},
			Resource:      resource,
			CreatedAt:     slot.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:     slot.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs
}

func (h *ArtifactRefHandler) contentUnitRefs(projectID uint) []ArtifactRef {
	var units []model.ContentUnit
	h.db.Where("project_id = ?", projectID).Order("updated_at desc").Find(&units)
	refs := make([]ArtifactRef, 0, len(units))
	for _, unit := range units {
		id := unit.ID
		refs = append(refs, ArtifactRef{
			Kind:          "content_unit",
			ID:            unit.ID,
			Title:         fallbackTitle(unit.Title, "内容单元 #"+intToString(unit.Order)),
			Subtitle:      unit.Description,
			Status:        unit.Status,
			EntityContext: ArtifactEntityContext{ContentUnitID: &id},
			CreatedAt:     unit.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:     unit.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs
}

func (h *ArtifactRefHandler) keyframeRefs(c *gin.Context, projectID uint) []ArtifactRef {
	var keyframes []model.Keyframe
	h.db.Preload("Resource").Where("project_id = ?", projectID).Order("updated_at desc").Find(&keyframes)
	refs := make([]ArtifactRef, 0, len(keyframes))
	for _, keyframe := range keyframes {
		id := keyframe.ID
		resource := keyframe.Resource
		if resource != nil {
			resource.URL = resourceURL(c, resource.ID)
		}
		refs = append(refs, ArtifactRef{
			Kind:          "keyframe",
			ID:            keyframe.ID,
			Title:         fallbackTitle(keyframe.Title, "关键帧 #"+intToString(keyframe.Order)),
			Subtitle:      keyframe.Description,
			Status:        keyframe.Status,
			EntityContext: ArtifactEntityContext{KeyframeID: &id, ContentUnitID: keyframe.ContentUnitID},
			Resource:      resource,
			CreatedAt:     keyframe.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:     keyframe.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs
}

func (h *ArtifactRefHandler) deliveryVersionRefs(projectID uint) []ArtifactRef {
	var versions []model.DeliveryVersion
	h.db.Where("project_id = ?", projectID).Order("updated_at desc").Find(&versions)
	refs := make([]ArtifactRef, 0, len(versions))
	for _, version := range versions {
		id := version.ID
		refs = append(refs, ArtifactRef{
			Kind:          "delivery_version",
			ID:            version.ID,
			Title:         fallbackTitle(version.Name, "交付版本"),
			Subtitle:      version.Description,
			Status:        version.Status,
			EntityContext: ArtifactEntityContext{DeliveryVersionID: &id},
			CreatedAt:     version.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:     version.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs
}

func (h *ArtifactRefHandler) firstBoundResource(c *gin.Context, projectID uint, ownerType string, ownerID uint, roles ...string) *model.RawResource {
	var binding model.ResourceBinding
	q := h.db.Preload("Resource").
		Where("project_id = ? AND owner_type = ? AND owner_id = ?", projectID, ownerType, ownerID).
		Order("is_primary desc, sort_order, created_at")
	if len(roles) > 0 {
		q = q.Where("role IN ?", roles)
	}
	if err := q.First(&binding).Error; err != nil || binding.Resource == nil {
		return nil
	}
	binding.Resource.URL = resourceURL(c, binding.Resource.ID)
	return binding.Resource
}

const timeFormatRFC3339 = "2006-01-02T15:04:05Z07:00"

func fallbackTitle(value string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func intToString(value int) string {
	if value == 0 {
		return "0"
	}
	digits := make([]byte, 0, 10)
	n := value
	if n < 0 {
		n = -n
	}
	for n > 0 {
		digits = append(digits, byte('0'+n%10))
		n /= 10
	}
	if value < 0 {
		digits = append(digits, '-')
	}
	for i, j := 0, len(digits)-1; i < j; i, j = i+1, j-1 {
		digits[i], digits[j] = digits[j], digits[i]
	}
	return string(digits)
}

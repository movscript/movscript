package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type ResourceBindingHandler struct{ db *gorm.DB }

func NewResourceBindingHandler(db *gorm.DB) *ResourceBindingHandler {
	return &ResourceBindingHandler{db: db}
}

type resourceBindingInput struct {
	ResourceID   uint   `json:"resource_id" binding:"required"`
	OwnerType    string `json:"owner_type" binding:"required"`
	OwnerID      uint   `json:"owner_id" binding:"required"`
	Role         string `json:"role"`
	Slot         string `json:"slot"`
	SortOrder    *int   `json:"sort_order"`
	Version      int    `json:"version"`
	IsPrimary    bool   `json:"is_primary"`
	Status       string `json:"status"`
	SourceType   string `json:"source_type"`
	SourceID     *uint  `json:"source_id"`
	MetadataJSON string `json:"metadata_json"`
}

// ListByProject returns resource bindings for a project, optionally filtered by
// owner_type, owner_id, role, status, or resource_id.
func (h *ResourceBindingHandler) ListByProject(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	q := h.db.Preload("Resource").Where("project_id = ?", projectID)
	q = applyResourceBindingFilters(q, c)

	bindings := make([]model.ResourceBinding, 0)
	if err := q.Order("owner_type, owner_id, role, slot, sort_order, created_at").Find(&bindings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	populateBindingResourceURLs(c, bindings)
	c.JSON(http.StatusOK, bindings)
}

// ListByEntity returns resources bound to one creative entity within a project.
func (h *ResourceBindingHandler) ListByEntity(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	ownerType := normalizeOwnerType(c.Param("ownerType"))
	ownerID := parseID(c.Param("ownerId"))
	if _, err := h.projectIDForOwner(ownerType, ownerID); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if err := h.ensureOwnerInProject(projectID, ownerType, ownerID); err != nil {
		status := http.StatusBadRequest
		if err == gorm.ErrRecordNotFound {
			status = http.StatusNotFound
		}
		c.JSON(status, apierr.InvalidInput(ownerType+" 不属于当前项目"))
		return
	}

	q := h.db.Preload("Resource").
		Where("project_id = ? AND owner_type = ? AND owner_id = ?", projectID, ownerType, ownerID)
	q = applyResourceBindingFilters(q, c)

	bindings := make([]model.ResourceBinding, 0)
	if err := q.Order("role, slot, sort_order, created_at").Find(&bindings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	populateBindingResourceURLs(c, bindings)
	c.JSON(http.StatusOK, bindings)
}

func (h *ResourceBindingHandler) CreateByProject(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, apierr.AuthRequired())
		return
	}

	projectID := parseID(c.Param("id"))
	var input resourceBindingInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	input.OwnerType = normalizeOwnerType(input.OwnerType)
	applyResourceBindingDefaults(&input)
	if err := validateResourceBindingInput(input); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}

	if err := h.ensureResourceVisibleToUser(input.ResourceID, user.ID); err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, apierr.NotFound("资源不存在"))
			return
		}
		c.JSON(http.StatusForbidden, apierr.Forbidden("无权绑定该资源"))
		return
	}
	if err := h.ensureOwnerInProject(projectID, input.OwnerType, input.OwnerID); err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, apierr.NotFound("资源归属实体不存在"))
			return
		}
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}

	var existing model.ResourceBinding
	duplicate := h.db.Where(
		"project_id = ? AND resource_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND version = ?",
		projectID, input.ResourceID, input.OwnerType, input.OwnerID, input.Role, input.Slot, input.Version,
	).First(&existing).Error
	if duplicate == nil {
		h.backfillAssetSlotResource(existing)
		h.db.Preload("Resource").First(&existing, existing.ID)
		populateBindingResourceURLs(c, []model.ResourceBinding{existing})
		c.JSON(http.StatusOK, existing)
		return
	}
	if duplicate != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, apierr.Internal(duplicate.Error()))
		return
	}

	sortOrder := 0
	if input.SortOrder != nil {
		sortOrder = *input.SortOrder
	} else {
		sortOrder = h.nextSortOrder(projectID, input.OwnerType, input.OwnerID, input.Role, input.Slot)
	}

	binding := model.ResourceBinding{
		ProjectID:    projectID,
		ResourceID:   input.ResourceID,
		OwnerType:    input.OwnerType,
		OwnerID:      input.OwnerID,
		Role:         input.Role,
		Slot:         input.Slot,
		SortOrder:    sortOrder,
		Version:      input.Version,
		IsPrimary:    input.IsPrimary,
		Status:       input.Status,
		SourceType:   input.SourceType,
		SourceID:     input.SourceID,
		MetadataJSON: input.MetadataJSON,
		CreatedByID:  &user.ID,
	}
	if err := h.db.Create(&binding).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	if binding.IsPrimary {
		h.clearOtherPrimaryBindings(binding)
	}
	h.backfillAssetSlotResource(binding)
	h.db.Preload("Resource").First(&binding, binding.ID)
	populateBindingResourceURLs(c, []model.ResourceBinding{binding})
	c.JSON(http.StatusCreated, binding)
}

func (h *ResourceBindingHandler) createBinding(binding model.ResourceBinding) error {
	if binding.Role == "" {
		binding.Role = "attachment"
	}
	if binding.Status == "" {
		binding.Status = "draft"
	}
	if binding.SourceType == "" {
		binding.SourceType = "manual"
	}
	if binding.Version <= 0 {
		binding.Version = 1
	}
	if binding.SortOrder == 0 {
		binding.SortOrder = h.nextSortOrder(binding.ProjectID, binding.OwnerType, binding.OwnerID, binding.Role, binding.Slot)
	}
	if err := h.db.Create(&binding).Error; err != nil {
		return err
	}
	if binding.IsPrimary {
		h.clearOtherPrimaryBindings(binding)
	}
	h.backfillAssetSlotResource(binding)
	return nil
}

func (h *ResourceBindingHandler) backfillAssetSlotResource(binding model.ResourceBinding) {
	if binding.OwnerType != "asset_slot" || binding.ResourceID == 0 {
		return
	}
	h.db.Model(&model.AssetSlot{}).
		Where("id = ? AND resource_id IS NULL", binding.OwnerID).
		Update("resource_id", binding.ResourceID)
}

func (h *ResourceBindingHandler) clearAssetSlotResourceIfDeleted(binding model.ResourceBinding) {
	if binding.OwnerType != "asset_slot" || binding.ResourceID == 0 {
		return
	}
	var replacement model.ResourceBinding
	err := h.db.
		Where("owner_type = ? AND owner_id = ? AND resource_id <> ?", "asset_slot", binding.OwnerID, binding.ResourceID).
		Order("is_primary desc, sort_order, created_at").
		First(&replacement).Error
	if err == nil {
		h.db.Model(&model.AssetSlot{}).
			Where("id = ? AND resource_id = ?", binding.OwnerID, binding.ResourceID).
			Update("resource_id", replacement.ResourceID)
		return
	}
	h.db.Model(&model.AssetSlot{}).
		Where("id = ? AND resource_id = ?", binding.OwnerID, binding.ResourceID).
		Update("resource_id", nil)
}

func (h *ResourceBindingHandler) Patch(c *gin.Context) {
	var binding model.ResourceBinding
	if err := h.db.First(&binding, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("资源绑定不存在"))
		return
	}

	var body struct {
		Role         *string `json:"role"`
		Slot         *string `json:"slot"`
		SortOrder    *int    `json:"sort_order"`
		Version      *int    `json:"version"`
		IsPrimary    *bool   `json:"is_primary"`
		Status       *string `json:"status"`
		SourceType   *string `json:"source_type"`
		SourceID     *uint   `json:"source_id"`
		MetadataJSON *string `json:"metadata_json"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}

	updates := map[string]any{}
	if body.Role != nil {
		role := normalizeRole(*body.Role)
		if !validBindingRole(role) {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("资源角色不合法"))
			return
		}
		updates["role"] = role
	}
	if body.Slot != nil {
		updates["slot"] = strings.TrimSpace(*body.Slot)
	}
	if body.SortOrder != nil {
		updates["sort_order"] = *body.SortOrder
	}
	if body.Version != nil {
		version := *body.Version
		if version <= 0 {
			version = 1
		}
		updates["version"] = version
	}
	if body.IsPrimary != nil {
		updates["is_primary"] = *body.IsPrimary
	}
	if body.Status != nil {
		status := normalizeBindingStatus(*body.Status)
		if !validBindingStatus(status) {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("资源绑定状态不合法"))
			return
		}
		updates["status"] = status
	}
	if body.SourceType != nil {
		sourceType := normalizeSourceType(*body.SourceType)
		if !validBindingSourceType(sourceType) {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("资源来源不合法"))
			return
		}
		updates["source_type"] = sourceType
	}
	if body.SourceID != nil {
		updates["source_id"] = *body.SourceID
	}
	if body.MetadataJSON != nil {
		updates["metadata_json"] = *body.MetadataJSON
	}

	if len(updates) > 0 {
		if err := h.db.Model(&binding).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
			return
		}
	}
	h.db.Preload("Resource").First(&binding, binding.ID)
	if binding.IsPrimary {
		h.clearOtherPrimaryBindings(binding)
	}
	populateBindingResourceURLs(c, []model.ResourceBinding{binding})
	c.JSON(http.StatusOK, binding)
}

func (h *ResourceBindingHandler) Delete(c *gin.Context) {
	var binding model.ResourceBinding
	if err := h.db.First(&binding, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("资源绑定不存在"))
		return
	}
	if err := h.db.Delete(&binding).Error; err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	h.clearAssetSlotResourceIfDeleted(binding)
	c.Status(http.StatusNoContent)
}

func applyResourceBindingFilters(q *gorm.DB, c *gin.Context) *gorm.DB {
	if ownerType := normalizeOwnerType(c.Query("owner_type")); ownerType != "" {
		q = q.Where("owner_type = ?", ownerType)
	}
	if ownerID := strings.TrimSpace(c.Query("owner_id")); ownerID != "" {
		q = q.Where("owner_id = ?", ownerID)
	}
	if role := normalizeRole(c.Query("role")); role != "" {
		q = q.Where("role = ?", role)
	}
	if status := normalizeBindingStatus(c.Query("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if rid := strings.TrimSpace(c.Query("resource_id")); rid != "" {
		q = q.Where("resource_id = ?", rid)
	}
	return q
}

func applyResourceBindingDefaults(input *resourceBindingInput) {
	input.Role = normalizeRole(input.Role)
	if input.Role == "" {
		input.Role = "attachment"
	}
	input.Slot = strings.TrimSpace(input.Slot)
	if input.Version <= 0 {
		input.Version = 1
	}
	input.Status = normalizeBindingStatus(input.Status)
	if input.Status == "" {
		input.Status = "draft"
	}
	input.SourceType = normalizeSourceType(input.SourceType)
	if input.SourceType == "" {
		input.SourceType = "manual"
	}
	input.MetadataJSON = strings.TrimSpace(input.MetadataJSON)
}

func validateResourceBindingInput(input resourceBindingInput) error {
	switch {
	case !validOwnerType(input.OwnerType):
		return apierrInput("资源归属类型不合法")
	case !validBindingRole(input.Role):
		return apierrInput("资源角色不合法")
	case !validBindingStatus(input.Status):
		return apierrInput("资源绑定状态不合法")
	case !validBindingSourceType(input.SourceType):
		return apierrInput("资源来源不合法")
	}
	return nil
}

type apierrInput string

func (e apierrInput) Error() string { return string(e) }

func normalizeOwnerType(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.ReplaceAll(value, "-", "_")
	return value
}

func normalizeRole(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.ReplaceAll(value, "-", "_")
	return value
}

func normalizeBindingStatus(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

func normalizeSourceType(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

func validOwnerType(value string) bool {
	switch value {
	case "script", "script_version", "segment", "scene_moment", "content_unit", "keyframe", "preview_timeline",
		"creative_reference", "creative_reference_state", "asset_slot",
		"delivery_version", "canvas":
		return true
	default:
		return false
	}
}

func validBindingRole(value string) bool {
	switch value {
	case "reference", "input", "output", "draft", "final", "thumbnail", "attachment", "source", "setting_doc":
		return true
	default:
		return false
	}
}

func validBindingStatus(value string) bool {
	switch value {
	case "draft", "selected", "rejected", "approved", "archived":
		return true
	default:
		return false
	}
}

func validBindingSourceType(value string) bool {
	switch value {
	case "upload", "job", "canvas", "import", "manual", "legacy":
		return true
	default:
		return false
	}
}

func populateBindingResourceURLs(c *gin.Context, bindings []model.ResourceBinding) {
	for i := range bindings {
		if bindings[i].Resource != nil {
			bindings[i].Resource.URL = resourceURL(c, bindings[i].Resource.ID)
		}
	}
}

func (h *ResourceBindingHandler) ensureResourceVisibleToUser(resourceID uint, userID uint) error {
	var resource model.RawResource
	if err := h.db.First(&resource, resourceID).Error; err != nil {
		return err
	}
	if resource.OwnerID == userID || resource.IsShared {
		return nil
	}
	if resource.FolderID != nil {
		var folder model.ResourceFolder
		if err := h.db.First(&folder, *resource.FolderID).Error; err == nil && folder.IsShared {
			return nil
		}
	}
	return gorm.ErrInvalidData
}

func (h *ResourceBindingHandler) ensureOwnerInProject(projectID uint, ownerType string, ownerID uint) error {
	ownerProjectID, err := h.projectIDForOwner(ownerType, ownerID)
	if err != nil {
		return err
	}
	if ownerProjectID != projectID {
		return gorm.ErrInvalidData
	}
	return nil
}

func (h *ResourceBindingHandler) projectIDForOwner(ownerType string, ownerID uint) (uint, error) {
	switch ownerType {
	case "script":
		var item model.Script
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, err
		}
		return item.ProjectID, nil
	case "script_version":
		var item model.ScriptVersion
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, err
		}
		return item.ProjectID, nil
	case "segment":
		var item model.Segment
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, err
		}
		return item.ProjectID, nil
	case "scene_moment":
		var item model.SceneMoment
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, err
		}
		return item.ProjectID, nil
	case "content_unit":
		var item model.ContentUnit
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, err
		}
		return item.ProjectID, nil
	case "keyframe":
		var item model.Keyframe
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, err
		}
		return item.ProjectID, nil
	case "preview_timeline":
		var item model.PreviewTimeline
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, err
		}
		return item.ProjectID, nil
	case "creative_reference":
		var item model.CreativeReference
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, err
		}
		return item.ProjectID, nil
	case "creative_reference_state":
		var item model.CreativeReferenceState
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, err
		}
		return item.ProjectID, nil
	case "asset_slot":
		var item model.AssetSlot
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, err
		}
		return item.ProjectID, nil
	case "delivery_version":
		var item model.DeliveryVersion
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, err
		}
		return item.ProjectID, nil
	case "canvas":
		var item model.Canvas
		if err := h.db.Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, err
		}
		if item.ProjectID == nil {
			return 0, gorm.ErrInvalidData
		}
		return *item.ProjectID, nil
	default:
		return 0, gorm.ErrInvalidData
	}
}

func (h *ResourceBindingHandler) nextSortOrder(projectID uint, ownerType string, ownerID uint, role string, slot string) int {
	var maxOrder int
	h.db.Model(&model.ResourceBinding{}).
		Select("COALESCE(MAX(sort_order), 0)").
		Where("project_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ?", projectID, ownerType, ownerID, role, slot).
		Scan(&maxOrder)
	return maxOrder + 1
}

func (h *ResourceBindingHandler) clearOtherPrimaryBindings(binding model.ResourceBinding) {
	h.db.Model(&model.ResourceBinding{}).
		Where("id <> ? AND project_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ?",
			binding.ID, binding.ProjectID, binding.OwnerType, binding.OwnerID, binding.Role, binding.Slot).
		Update("is_primary", false)
}

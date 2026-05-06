package resourcebinding

import (
	"context"
	"errors"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

var (
	ErrInvalidInput      = errors.New("invalid resource binding input")
	ErrOwnerNotFound     = errors.New("resource binding owner not found")
	ErrOwnerWrongProject = errors.New("resource binding owner does not belong to project")
	ErrOwnerInvalidType  = errors.New("resource binding owner type is invalid")
	ErrResourceNotFound  = errors.New("resource not found")
	ErrResourceForbidden = errors.New("resource is not visible to user")
	ErrBindingNotFound   = errors.New("resource binding not found")
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type Filter struct {
	ProjectID  uint
	OwnerType  string
	OwnerID    uint
	Role       string
	Status     string
	ResourceID uint
}

type CreateInput struct {
	ProjectID    uint
	ResourceID   uint
	OwnerType    string
	OwnerID      uint
	Role         string
	Slot         string
	SortOrder    *int
	Version      int
	IsPrimary    bool
	Status       string
	SourceType   string
	SourceID     *uint
	MetadataJSON string
	CreatedByID  *uint
}

type UpdateInput struct {
	Role         *string
	Slot         *string
	SortOrder    *int
	Version      *int
	IsPrimary    *bool
	Status       *string
	SourceType   *string
	SourceID     *uint
	MetadataJSON *string
}

func (s *Service) List(ctx context.Context, filter Filter) ([]model.ResourceBinding, error) {
	items := make([]model.ResourceBinding, 0)
	q := s.db.WithContext(ctx).Preload("Resource").Where("project_id = ?", filter.ProjectID)
	q = applyFilters(q, filter)
	err := q.Order("owner_type, owner_id, role, slot, sort_order, created_at").Find(&items).Error
	return items, err
}

func (s *Service) ListByEntity(ctx context.Context, filter Filter) ([]model.ResourceBinding, error) {
	filter.OwnerType = NormalizeOwnerType(filter.OwnerType)
	if err := s.EnsureOwnerInProject(ctx, filter.ProjectID, filter.OwnerType, filter.OwnerID); err != nil {
		return nil, err
	}
	items := make([]model.ResourceBinding, 0)
	q := s.db.WithContext(ctx).Preload("Resource").
		Where("project_id = ? AND owner_type = ? AND owner_id = ?", filter.ProjectID, filter.OwnerType, filter.OwnerID)
	q = applyFilters(q, filter)
	err := q.Order("role, slot, sort_order, created_at").Find(&items).Error
	return items, err
}

func (s *Service) Create(ctx context.Context, input CreateInput, userID uint) (model.ResourceBinding, bool, error) {
	var binding model.ResourceBinding
	normalizeCreateInput(&input)
	if err := validateCreateInput(input); err != nil {
		return binding, false, err
	}
	if err := s.EnsureResourceVisibleToUser(ctx, input.ResourceID, userID); err != nil {
		return binding, false, err
	}
	if err := s.EnsureOwnerInProject(ctx, input.ProjectID, input.OwnerType, input.OwnerID); err != nil {
		return binding, false, err
	}

	var existing model.ResourceBinding
	duplicate := s.db.WithContext(ctx).Where(
		"project_id = ? AND resource_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ? AND version = ?",
		input.ProjectID, input.ResourceID, input.OwnerType, input.OwnerID, input.Role, input.Slot, input.Version,
	).First(&existing).Error
	if duplicate == nil {
		s.backfillAssetSlotResource(ctx, existing)
		return s.Get(ctx, existing.ID)
	}
	if !errors.Is(duplicate, gorm.ErrRecordNotFound) {
		return binding, false, duplicate
	}

	sortOrder := 0
	if input.SortOrder != nil {
		sortOrder = *input.SortOrder
	} else {
		sortOrder = s.nextSortOrder(ctx, input.ProjectID, input.OwnerType, input.OwnerID, input.Role, input.Slot)
	}
	binding = model.ResourceBinding{
		ProjectID:    input.ProjectID,
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
		CreatedByID:  input.CreatedByID,
	}
	if err := s.CreateBinding(ctx, &binding); err != nil {
		return binding, false, err
	}
	created, _, err := s.Get(ctx, binding.ID)
	return created, true, err
}

func (s *Service) CreateBinding(ctx context.Context, binding *model.ResourceBinding) error {
	if binding == nil {
		return ErrInvalidInput
	}
	normalizeBinding(binding)
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if binding.SortOrder == 0 {
			binding.SortOrder = s.nextSortOrderWithDB(tx, binding.ProjectID, binding.OwnerType, binding.OwnerID, binding.Role, binding.Slot)
		}
		if err := tx.Create(binding).Error; err != nil {
			return err
		}
		if err := model.SyncCoreEntityRelations(tx, binding); err != nil {
			return err
		}
		if binding.IsPrimary {
			return s.clearOtherPrimaryBindingsWithDB(tx, *binding)
		}
		return nil
	}); err != nil {
		return err
	}
	s.backfillAssetSlotResource(ctx, *binding)
	return nil
}

func (s *Service) Get(ctx context.Context, id uint) (model.ResourceBinding, bool, error) {
	var binding model.ResourceBinding
	if err := s.db.WithContext(ctx).Preload("Resource").First(&binding, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return binding, false, ErrBindingNotFound
		}
		return binding, false, err
	}
	return binding, false, nil
}

func (s *Service) Update(ctx context.Context, id uint, input UpdateInput) (model.ResourceBinding, error) {
	var binding model.ResourceBinding
	if err := s.db.WithContext(ctx).First(&binding, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return binding, ErrBindingNotFound
		}
		return binding, err
	}
	updates, err := buildUpdates(input)
	if err != nil {
		return binding, err
	}
	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&binding).Updates(updates).Error; err != nil {
				return err
			}
			if err := tx.First(&binding, id).Error; err != nil {
				return err
			}
			if err := model.SyncCoreEntityRelations(tx, &binding); err != nil {
				return err
			}
			if binding.IsPrimary {
				return s.clearOtherPrimaryBindingsWithDB(tx, binding)
			}
			return nil
		}); err != nil {
			return binding, err
		}
	}
	if err := s.db.WithContext(ctx).Preload("Resource").First(&binding, id).Error; err != nil {
		return binding, err
	}
	return binding, nil
}

func (s *Service) Delete(ctx context.Context, id uint) error {
	var binding model.ResourceBinding
	if err := s.db.WithContext(ctx).First(&binding, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrBindingNotFound
		}
		return err
	}
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&binding).Error; err != nil {
			return err
		}
		return model.DeleteCoreEntityRelations(tx, &binding)
	}); err != nil {
		return err
	}
	s.clearAssetSlotResourceIfDeleted(ctx, binding)
	return nil
}

func (s *Service) EnsureResourceVisibleToUser(ctx context.Context, resourceID uint, userID uint) error {
	var resource model.RawResource
	if err := s.db.WithContext(ctx).First(&resource, resourceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrResourceNotFound
		}
		return err
	}
	if resource.OwnerID == userID || resource.IsShared {
		return nil
	}
	if resource.FolderID != nil {
		var folder model.ResourceFolder
		if err := s.db.WithContext(ctx).First(&folder, *resource.FolderID).Error; err == nil && folder.IsShared {
			return nil
		}
	}
	return ErrResourceForbidden
}

func (s *Service) EnsureOwnerInProject(ctx context.Context, projectID uint, ownerType string, ownerID uint) error {
	ownerProjectID, err := s.ProjectIDForOwner(ctx, ownerType, ownerID)
	if err != nil {
		return err
	}
	if ownerProjectID != projectID {
		return ErrOwnerWrongProject
	}
	return nil
}

func (s *Service) ProjectIDForOwner(ctx context.Context, ownerType string, ownerID uint) (uint, error) {
	switch NormalizeOwnerType(ownerType) {
	case "script":
		var item model.Script
		if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "script_version":
		var item model.ScriptVersion
		if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "segment":
		var item model.Segment
		if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "scene_moment":
		var item model.SceneMoment
		if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "content_unit":
		var item model.ContentUnit
		if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "keyframe":
		var item model.Keyframe
		if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "preview_timeline":
		var item model.PreviewTimeline
		if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "creative_reference":
		var item model.CreativeReference
		if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "creative_reference_state":
		var item model.CreativeReferenceState
		if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "asset_slot":
		var item model.AssetSlot
		if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "delivery_version":
		var item model.DeliveryVersion
		if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		return item.ProjectID, nil
	case "canvas":
		var item model.Canvas
		if err := s.db.WithContext(ctx).Select("id, project_id").First(&item, ownerID).Error; err != nil {
			return 0, ownerLookupError(err)
		}
		if item.ProjectID == nil {
			return 0, ErrOwnerWrongProject
		}
		return *item.ProjectID, nil
	default:
		return 0, ErrOwnerInvalidType
	}
}

func applyFilters(q *gorm.DB, filter Filter) *gorm.DB {
	if ownerType := NormalizeOwnerType(filter.OwnerType); ownerType != "" {
		q = q.Where("owner_type = ?", ownerType)
	}
	if filter.OwnerID > 0 {
		q = q.Where("owner_id = ?", filter.OwnerID)
	}
	if role := NormalizeRole(filter.Role); role != "" {
		q = q.Where("role = ?", role)
	}
	if status := NormalizeStatus(filter.Status); status != "" {
		q = q.Where("status = ?", status)
	}
	if filter.ResourceID > 0 {
		q = q.Where("resource_id = ?", filter.ResourceID)
	}
	return q
}

func normalizeCreateInput(input *CreateInput) {
	input.OwnerType = NormalizeOwnerType(input.OwnerType)
	input.Role = NormalizeRole(input.Role)
	if input.Role == "" {
		input.Role = "attachment"
	}
	input.Slot = strings.TrimSpace(input.Slot)
	if input.Version <= 0 {
		input.Version = 1
	}
	input.Status = NormalizeStatus(input.Status)
	if input.Status == "" {
		input.Status = "draft"
	}
	input.SourceType = NormalizeSourceType(input.SourceType)
	if input.SourceType == "" {
		input.SourceType = "manual"
	}
	input.MetadataJSON = strings.TrimSpace(input.MetadataJSON)
}

func normalizeBinding(binding *model.ResourceBinding) {
	binding.OwnerType = NormalizeOwnerType(binding.OwnerType)
	binding.Role = NormalizeRole(binding.Role)
	if binding.Role == "" {
		binding.Role = "attachment"
	}
	binding.Slot = strings.TrimSpace(binding.Slot)
	if binding.Version <= 0 {
		binding.Version = 1
	}
	binding.Status = NormalizeStatus(binding.Status)
	if binding.Status == "" {
		binding.Status = "draft"
	}
	binding.SourceType = NormalizeSourceType(binding.SourceType)
	if binding.SourceType == "" {
		binding.SourceType = "manual"
	}
	binding.MetadataJSON = strings.TrimSpace(binding.MetadataJSON)
}

func validateCreateInput(input CreateInput) error {
	switch {
	case input.ProjectID == 0 || input.ResourceID == 0 || input.OwnerID == 0:
		return ErrInvalidInput
	case !ValidOwnerType(input.OwnerType):
		return ErrOwnerInvalidType
	case !ValidRole(input.Role):
		return ErrInvalidInput
	case !ValidStatus(input.Status):
		return ErrInvalidInput
	case !ValidSourceType(input.SourceType):
		return ErrInvalidInput
	}
	return nil
}

func buildUpdates(input UpdateInput) (map[string]any, error) {
	updates := map[string]any{}
	if input.Role != nil {
		role := NormalizeRole(*input.Role)
		if !ValidRole(role) {
			return nil, ErrInvalidInput
		}
		updates["role"] = role
	}
	if input.Slot != nil {
		updates["slot"] = strings.TrimSpace(*input.Slot)
	}
	if input.SortOrder != nil {
		updates["sort_order"] = *input.SortOrder
	}
	if input.Version != nil {
		version := *input.Version
		if version <= 0 {
			version = 1
		}
		updates["version"] = version
	}
	if input.IsPrimary != nil {
		updates["is_primary"] = *input.IsPrimary
	}
	if input.Status != nil {
		status := NormalizeStatus(*input.Status)
		if !ValidStatus(status) {
			return nil, ErrInvalidInput
		}
		updates["status"] = status
	}
	if input.SourceType != nil {
		sourceType := NormalizeSourceType(*input.SourceType)
		if !ValidSourceType(sourceType) {
			return nil, ErrInvalidInput
		}
		updates["source_type"] = sourceType
	}
	if input.SourceID != nil {
		updates["source_id"] = *input.SourceID
	}
	if input.MetadataJSON != nil {
		updates["metadata_json"] = strings.TrimSpace(*input.MetadataJSON)
	}
	return updates, nil
}

func NormalizeOwnerType(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	return strings.ReplaceAll(value, "-", "_")
}

func NormalizeRole(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	return strings.ReplaceAll(value, "-", "_")
}

func NormalizeStatus(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

func NormalizeSourceType(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

func ValidOwnerType(value string) bool {
	switch value {
	case "script", "script_version", "segment", "scene_moment", "content_unit", "keyframe", "preview_timeline",
		"creative_reference", "creative_reference_state", "asset_slot",
		"delivery_version", "canvas":
		return true
	default:
		return false
	}
}

func ValidRole(value string) bool {
	switch value {
	case "reference", "input", "output", "draft", "final", "thumbnail", "attachment", "source", "setting_doc":
		return true
	default:
		return false
	}
}

func ValidStatus(value string) bool {
	switch value {
	case "draft", "selected", "rejected", "approved", "archived":
		return true
	default:
		return false
	}
}

func ValidSourceType(value string) bool {
	switch value {
	case "upload", "job", "canvas", "import", "manual", "legacy":
		return true
	default:
		return false
	}
}

func ownerLookupError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrOwnerNotFound
	}
	return err
}

func (s *Service) nextSortOrder(ctx context.Context, projectID uint, ownerType string, ownerID uint, role string, slot string) int {
	return s.nextSortOrderWithDB(s.db.WithContext(ctx), projectID, ownerType, ownerID, role, slot)
}

func (s *Service) nextSortOrderWithDB(db *gorm.DB, projectID uint, ownerType string, ownerID uint, role string, slot string) int {
	var maxOrder int
	db.Model(&model.ResourceBinding{}).
		Select("COALESCE(MAX(sort_order), 0)").
		Where("project_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ?", projectID, ownerType, ownerID, role, slot).
		Scan(&maxOrder)
	return maxOrder + 1
}

func (s *Service) clearOtherPrimaryBindingsWithDB(db *gorm.DB, binding model.ResourceBinding) error {
	return db.Model(&model.ResourceBinding{}).
		Where("id <> ? AND project_id = ? AND owner_type = ? AND owner_id = ? AND role = ? AND slot = ?",
			binding.ID, binding.ProjectID, binding.OwnerType, binding.OwnerID, binding.Role, binding.Slot).
		Update("is_primary", false).Error
}

func (s *Service) backfillAssetSlotResource(ctx context.Context, binding model.ResourceBinding) {
	if binding.OwnerType != "asset_slot" || binding.ResourceID == 0 {
		return
	}
	s.db.WithContext(ctx).Model(&model.AssetSlot{}).
		Where("id = ? AND resource_id IS NULL", binding.OwnerID).
		Update("resource_id", binding.ResourceID)
}

func (s *Service) clearAssetSlotResourceIfDeleted(ctx context.Context, binding model.ResourceBinding) {
	if binding.OwnerType != "asset_slot" || binding.ResourceID == 0 {
		return
	}
	var replacement model.ResourceBinding
	err := s.db.WithContext(ctx).
		Where("owner_type = ? AND owner_id = ? AND resource_id <> ?", "asset_slot", binding.OwnerID, binding.ResourceID).
		Order("is_primary desc, sort_order, created_at").
		First(&replacement).Error
	if err == nil {
		s.db.WithContext(ctx).Model(&model.AssetSlot{}).
			Where("id = ? AND resource_id = ?", binding.OwnerID, binding.ResourceID).
			Update("resource_id", replacement.ResourceID)
		return
	}
	s.db.WithContext(ctx).Model(&model.AssetSlot{}).
		Where("id = ? AND resource_id = ?", binding.OwnerID, binding.ResourceID).
		Update("resource_id", nil)
}

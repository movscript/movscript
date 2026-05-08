package resourcebinding

import (
	"context"
	"errors"

	domainbinding "github.com/movscript/movscript/internal/domain/resourcebinding"
	"gorm.io/gorm"
)

var (
	ErrInvalidInput      = domainbinding.ErrInvalidInput
	ErrOwnerNotFound     = errors.New("resource binding owner not found")
	ErrOwnerWrongProject = errors.New("resource binding owner does not belong to project")
	ErrOwnerInvalidType  = domainbinding.ErrOwnerInvalidType
	ErrResourceNotFound  = errors.New("resource not found")
	ErrResourceForbidden = errors.New("resource is not visible to user")
	ErrBindingNotFound   = errors.New("resource binding not found")
)

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type Filter = domainbinding.Filter

type CreateInput = domainbinding.CreateInput

type UpdateInput = domainbinding.UpdateInput

func (s *Service) List(ctx context.Context, filter Filter) ([]domainbinding.Binding, error) {
	return s.repo.List(ctx, filter)
}

func (s *Service) ListByEntity(ctx context.Context, filter Filter) ([]domainbinding.Binding, error) {
	filter.OwnerType = NormalizeOwnerType(filter.OwnerType)
	if err := s.EnsureOwnerInProject(ctx, filter.ProjectID, filter.OwnerType, filter.OwnerID); err != nil {
		return nil, err
	}
	return s.repo.ListByEntity(ctx, filter)
}

func (s *Service) Create(ctx context.Context, input CreateInput, userID uint) (domainbinding.Binding, bool, error) {
	normalizeCreateInput(&input)
	if err := validateCreateInput(input); err != nil {
		return domainbinding.Binding{}, false, err
	}
	if err := s.EnsureResourceVisibleToUser(ctx, input.ResourceID, userID); err != nil {
		return domainbinding.Binding{}, false, err
	}
	if err := s.EnsureOwnerInProject(ctx, input.ProjectID, input.OwnerType, input.OwnerID); err != nil {
		return domainbinding.Binding{}, false, err
	}

	existing, found, err := s.repo.FindBindingByUniqueKey(ctx, input.ProjectID, input.ResourceID, input.OwnerType, input.OwnerID, input.Role, input.Slot, input.Version)
	if err != nil {
		return domainbinding.Binding{}, false, err
	}
	if found {
		if err := s.repo.BackfillAssetSlotResource(ctx, existing); err != nil {
			return domainbinding.Binding{}, false, err
		}
		created, _, err := s.repo.GetBinding(ctx, existing.ID)
		return created, false, err
	}

	binding, err := s.repo.CreateBinding(ctx, domainbinding.New(input))
	if err != nil {
		return binding, false, err
	}
	if err := s.repo.BackfillAssetSlotResource(ctx, binding); err != nil {
		return binding, false, err
	}
	created, _, err := s.repo.GetBinding(ctx, binding.ID)
	return created, true, err
}

func (s *Service) CreateBinding(ctx context.Context, binding domainbinding.Binding) (domainbinding.Binding, error) {
	created, err := s.createBinding(ctx, binding)
	if err != nil {
		return created, err
	}
	return created, nil
}

func (s *Service) createBinding(ctx context.Context, binding domainbinding.Binding) (domainbinding.Binding, error) {
	if binding.ProjectID == 0 {
		return domainbinding.Binding{}, ErrInvalidInput
	}
	created, err := s.repo.CreateBinding(ctx, binding)
	if err != nil {
		return created, err
	}
	return created, s.repo.BackfillAssetSlotResource(ctx, created)
}

func (s *Service) Get(ctx context.Context, id uint) (domainbinding.Binding, bool, error) {
	return s.repo.GetBinding(ctx, id)
}

func (s *Service) Update(ctx context.Context, id uint, input UpdateInput) (domainbinding.Binding, error) {
	binding, _, err := s.repo.GetBinding(ctx, id)
	if err != nil {
		return binding, err
	}
	updates, err := buildUpdates(input)
	if err != nil {
		return binding, err
	}
	if !updates.Empty() {
		return s.repo.UpdateBinding(ctx, binding, updates)
	}
	return binding, nil
}

func (s *Service) Delete(ctx context.Context, id uint) error {
	binding, _, err := s.repo.GetBinding(ctx, id)
	if err != nil {
		return err
	}
	if err := s.repo.DeleteBinding(ctx, binding); err != nil {
		return err
	}
	return s.repo.ClearAssetSlotResourceIfDeleted(ctx, binding)
}

func (s *Service) EnsureResourceVisibleToUser(ctx context.Context, resourceID uint, userID uint) error {
	return s.repo.EnsureResourceVisibleToUser(ctx, resourceID, userID)
}

func (s *Service) EnsureOwnerInProject(ctx context.Context, projectID uint, ownerType string, ownerID uint) error {
	return s.repo.EnsureOwnerInProject(ctx, projectID, ownerType, ownerID)
}

func (s *Service) ProjectIDForOwner(ctx context.Context, ownerType string, ownerID uint) (uint, error) {
	return s.repo.ProjectIDForOwner(ctx, ownerType, ownerID)
}

func normalizeCreateInput(input *CreateInput) {
	domainbinding.NormalizeCreateInput(input)
}

func validateCreateInput(input CreateInput) error {
	if err := domainbinding.ValidateCreateInput(input); errors.Is(err, domainbinding.ErrOwnerInvalidType) {
		return ErrOwnerInvalidType
	} else if err != nil {
		return ErrInvalidInput
	}
	return nil
}

func buildUpdates(input UpdateInput) (domainbinding.UpdateSpec, error) {
	updates, err := domainbinding.BuildUpdateSpec(input)
	if err != nil {
		return domainbinding.UpdateSpec{}, ErrInvalidInput
	}
	return updates, nil
}

func NormalizeOwnerType(value string) string {
	return domainbinding.NormalizeOwnerType(value)
}

func NormalizeRole(value string) string {
	return domainbinding.NormalizeRole(value)
}

func NormalizeStatus(value string) string {
	return domainbinding.NormalizeStatus(value)
}

func NormalizeSourceType(value string) string {
	return domainbinding.NormalizeSourceType(value)
}

func ValidOwnerType(value string) bool {
	return domainbinding.ValidOwnerType(value)
}

func ValidRole(value string) bool {
	return domainbinding.ValidRole(value)
}

func ValidStatus(value string) bool {
	return domainbinding.ValidStatus(value)
}

func ValidSourceType(value string) bool {
	return domainbinding.ValidSourceType(value)
}

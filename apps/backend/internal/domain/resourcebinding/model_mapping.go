package resourcebinding

import (
	"github.com/movscript/movscript/internal/domain/model"
	"gorm.io/gorm"
)

func NormalizeBinding(binding *model.ResourceBinding) {
	domainBinding := BindingFromModel(*binding)
	Normalize(&domainBinding)
	*binding = domainBinding.ToModel()
}

func NewBinding(input CreateInput) model.ResourceBinding {
	return New(input).ToModel()
}

func BindingFromModel(binding model.ResourceBinding) Binding {
	return Binding{
		ID:           binding.ID,
		ProjectID:    binding.ProjectID,
		ResourceID:   binding.ResourceID,
		OwnerType:    binding.OwnerType,
		OwnerID:      binding.OwnerID,
		Role:         binding.Role,
		Slot:         binding.Slot,
		SortOrder:    binding.SortOrder,
		Version:      binding.Version,
		IsPrimary:    binding.IsPrimary,
		Status:       binding.Status,
		SourceType:   binding.SourceType,
		SourceID:     binding.SourceID,
		MetadataJSON: binding.MetadataJSON,
		CreatedByID:  binding.CreatedByID,
	}
}

func (binding Binding) ToModel() model.ResourceBinding {
	return model.ResourceBinding{
		Model:        gorm.Model{ID: binding.ID},
		ProjectID:    binding.ProjectID,
		ResourceID:   binding.ResourceID,
		OwnerType:    binding.OwnerType,
		OwnerID:      binding.OwnerID,
		Role:         binding.Role,
		Slot:         binding.Slot,
		SortOrder:    binding.SortOrder,
		Version:      binding.Version,
		IsPrimary:    binding.IsPrimary,
		Status:       binding.Status,
		SourceType:   binding.SourceType,
		SourceID:     binding.SourceID,
		MetadataJSON: binding.MetadataJSON,
		CreatedByID:  binding.CreatedByID,
	}
}

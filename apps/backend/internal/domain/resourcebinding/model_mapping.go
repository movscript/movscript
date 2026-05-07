package resourcebinding

import (
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

func NormalizeBinding(binding *persistencemodel.ResourceBinding) {
	domainBinding := BindingFromModel(*binding)
	Normalize(&domainBinding)
	*binding = domainBinding.ToModel()
}

func BindingFromModel(binding persistencemodel.ResourceBinding) Binding {
	return Binding{
		ID:           binding.ID,
		ProjectID:    binding.ProjectID,
		ResourceID:   binding.ResourceID,
		Resource:     resourceFromModelPointer(binding.Resource),
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
		CreatedAt:    binding.CreatedAt,
		UpdatedAt:    binding.UpdatedAt,
	}
}

func (binding Binding) ToModel() persistencemodel.ResourceBinding {
	return persistencemodel.ResourceBinding{
		Model:        gorm.Model{ID: binding.ID, CreatedAt: binding.CreatedAt, UpdatedAt: binding.UpdatedAt},
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

func resourceFromModelPointer(resource *persistencemodel.RawResource) *domainresource.RawResource {
	if resource == nil {
		return nil
	}
	item := domainresource.RawResourceFromModel(*resource)
	return &item
}

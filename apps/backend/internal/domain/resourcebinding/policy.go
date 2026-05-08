package resourcebinding

import (
	"errors"
	"strings"
	"time"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
)

var (
	ErrInvalidInput     = errors.New("invalid resource binding input")
	ErrOwnerInvalidType = errors.New("resource binding owner type is invalid")
)

const (
	OwnerTypeScript                 = "script"
	OwnerTypeScriptVersion          = "script_version"
	OwnerTypeSegment                = "segment"
	OwnerTypeSceneMoment            = "scene_moment"
	OwnerTypeContentUnit            = "content_unit"
	OwnerTypeKeyframe               = "keyframe"
	OwnerTypePreviewTimeline        = "preview_timeline"
	OwnerTypeCreativeReference      = "creative_reference"
	OwnerTypeCreativeReferenceState = "creative_reference_state"
	OwnerTypeAssetSlot              = "asset_slot"
	OwnerTypeDeliveryVersion        = "delivery_version"
	OwnerTypeCanvas                 = "canvas"

	RoleReference  = "reference"
	RoleInput      = "input"
	RoleOutput     = "output"
	RoleDraft      = "draft"
	RoleFinal      = "final"
	RoleThumbnail  = "thumbnail"
	RoleAttachment = "attachment"
	RoleSource     = "source"
	RoleCandidate  = "candidate"

	StatusDraft    = "draft"
	StatusSelected = "selected"
	StatusRejected = "rejected"
	StatusApproved = "approved"
	StatusArchived = "archived"

	SourceTypeUpload = "upload"
	SourceTypeJob    = "job"
	SourceTypeCanvas = "canvas"
	SourceTypeImport = "import"
	SourceTypeManual = "manual"
	SourceTypeLegacy = "legacy"
)

type Filter struct {
	ProjectID  uint
	OwnerType  string
	OwnerID    uint
	Role       string
	Status     string
	ResourceID uint
}

type Binding struct {
	ID           uint                        `json:"ID"`
	ProjectID    uint                        `json:"project_id"`
	ResourceID   uint                        `json:"resource_id"`
	Resource     *domainresource.RawResource `json:"resource,omitempty"`
	OwnerType    string                      `json:"owner_type"`
	OwnerID      uint                        `json:"owner_id"`
	Role         string                      `json:"role"`
	Slot         string                      `json:"slot"`
	SortOrder    int                         `json:"sort_order"`
	Version      int                         `json:"version"`
	IsPrimary    bool                        `json:"is_primary"`
	Status       string                      `json:"status"`
	SourceType   string                      `json:"source_type"`
	SourceID     *uint                       `json:"source_id,omitempty"`
	MetadataJSON string                      `json:"metadata_json"`
	CreatedByID  *uint                       `json:"created_by_id,omitempty"`
	CreatedAt    time.Time                   `json:"CreatedAt"`
	UpdatedAt    time.Time                   `json:"UpdatedAt"`
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

type UpdateSpec struct {
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

func (spec UpdateSpec) Empty() bool {
	return spec.Role == nil &&
		spec.Slot == nil &&
		spec.SortOrder == nil &&
		spec.Version == nil &&
		spec.IsPrimary == nil &&
		spec.Status == nil &&
		spec.SourceType == nil &&
		spec.SourceID == nil &&
		spec.MetadataJSON == nil
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

func Normalize(binding *Binding) {
	binding.OwnerType = NormalizeOwnerType(binding.OwnerType)
	binding.Role = NormalizeRole(binding.Role)
	if binding.Role == "" {
		binding.Role = RoleAttachment
	}
	binding.Slot = strings.TrimSpace(binding.Slot)
	if binding.Version <= 0 {
		binding.Version = 1
	}
	binding.Status = NormalizeStatus(binding.Status)
	if binding.Status == "" {
		binding.Status = StatusDraft
	}
	binding.SourceType = NormalizeSourceType(binding.SourceType)
	if binding.SourceType == "" {
		binding.SourceType = SourceTypeManual
	}
	binding.MetadataJSON = strings.TrimSpace(binding.MetadataJSON)
}

func ValidOwnerType(value string) bool {
	switch value {
	case OwnerTypeScript, OwnerTypeScriptVersion, OwnerTypeSegment, OwnerTypeSceneMoment, OwnerTypeContentUnit, OwnerTypeKeyframe, OwnerTypePreviewTimeline,
		OwnerTypeCreativeReference, OwnerTypeCreativeReferenceState, OwnerTypeAssetSlot,
		OwnerTypeDeliveryVersion, OwnerTypeCanvas:
		return true
	default:
		return false
	}
}

func ValidRole(value string) bool {
	switch value {
	case RoleReference, RoleInput, RoleOutput, RoleDraft, RoleFinal, RoleThumbnail, RoleAttachment, RoleSource, RoleCandidate:
		return true
	default:
		return false
	}
}

func ValidStatus(value string) bool {
	switch value {
	case StatusDraft, StatusSelected, StatusRejected, StatusApproved, StatusArchived:
		return true
	default:
		return false
	}
}

func ValidSourceType(value string) bool {
	switch value {
	case SourceTypeUpload, SourceTypeJob, SourceTypeCanvas, SourceTypeImport, SourceTypeManual, SourceTypeLegacy:
		return true
	default:
		return false
	}
}

func NormalizeCreateInput(input *CreateInput) {
	input.OwnerType = NormalizeOwnerType(input.OwnerType)
	input.Role = NormalizeRole(input.Role)
	if input.Role == "" {
		input.Role = RoleAttachment
	}
	input.Slot = strings.TrimSpace(input.Slot)
	if input.Version <= 0 {
		input.Version = 1
	}
	input.Status = NormalizeStatus(input.Status)
	if input.Status == "" {
		input.Status = StatusDraft
	}
	input.SourceType = NormalizeSourceType(input.SourceType)
	if input.SourceType == "" {
		input.SourceType = SourceTypeManual
	}
	input.MetadataJSON = strings.TrimSpace(input.MetadataJSON)
}

func New(input CreateInput) Binding {
	NormalizeCreateInput(&input)
	binding := Binding{
		ProjectID:    input.ProjectID,
		ResourceID:   input.ResourceID,
		OwnerType:    input.OwnerType,
		OwnerID:      input.OwnerID,
		Role:         input.Role,
		Slot:         input.Slot,
		Version:      input.Version,
		IsPrimary:    input.IsPrimary,
		Status:       input.Status,
		SourceType:   input.SourceType,
		SourceID:     input.SourceID,
		MetadataJSON: input.MetadataJSON,
		CreatedByID:  input.CreatedByID,
	}
	if input.SortOrder != nil {
		binding.SortOrder = *input.SortOrder
	}
	return binding
}

func ValidateCreateInput(input CreateInput) error {
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

func BuildUpdateSpec(input UpdateInput) (UpdateSpec, error) {
	var spec UpdateSpec
	if input.Role != nil {
		role := NormalizeRole(*input.Role)
		if !ValidRole(role) {
			return UpdateSpec{}, ErrInvalidInput
		}
		spec.Role = &role
	}
	if input.Slot != nil {
		slot := strings.TrimSpace(*input.Slot)
		spec.Slot = &slot
	}
	if input.SortOrder != nil {
		sortOrder := *input.SortOrder
		spec.SortOrder = &sortOrder
	}
	if input.Version != nil {
		version := *input.Version
		if version <= 0 {
			version = 1
		}
		spec.Version = &version
	}
	if input.IsPrimary != nil {
		isPrimary := *input.IsPrimary
		spec.IsPrimary = &isPrimary
	}
	if input.Status != nil {
		status := NormalizeStatus(*input.Status)
		if !ValidStatus(status) {
			return UpdateSpec{}, ErrInvalidInput
		}
		spec.Status = &status
	}
	if input.SourceType != nil {
		sourceType := NormalizeSourceType(*input.SourceType)
		if !ValidSourceType(sourceType) {
			return UpdateSpec{}, ErrInvalidInput
		}
		spec.SourceType = &sourceType
	}
	if input.SourceID != nil {
		sourceID := *input.SourceID
		spec.SourceID = &sourceID
	}
	if input.MetadataJSON != nil {
		metadataJSON := strings.TrimSpace(*input.MetadataJSON)
		spec.MetadataJSON = &metadataJSON
	}
	return spec, nil
}

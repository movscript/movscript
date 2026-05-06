package resourcebinding

import (
	"errors"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
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
	RoleSettingDoc = "setting_doc"
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
	case RoleReference, RoleInput, RoleOutput, RoleDraft, RoleFinal, RoleThumbnail, RoleAttachment, RoleSource, RoleSettingDoc, RoleCandidate:
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

func NormalizeBinding(binding *model.ResourceBinding) {
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

func BuildUpdates(input UpdateInput) (map[string]any, error) {
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

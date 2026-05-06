package resourcebinding

import (
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
)

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

func NormalizeBinding(binding *model.ResourceBinding) {
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

package setting

import (
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
)

func NormalizeSetting(item *model.Setting) {
	item.Name = strings.TrimSpace(item.Name)
	item.Status = strings.TrimSpace(item.Status)
	if item.Status == "" {
		item.Status = "default"
	}
}

func NormalizeRelationship(item *model.SettingRelationship) {
	if item.Source == "" {
		item.Source = "manual"
	}
	if item.Category == "" {
		item.Category = "relationship"
	}
}

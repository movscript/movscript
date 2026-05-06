package script

import (
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
)

func NormalizeDefaults(item *model.Script) {
	if item.ScriptType == "" {
		item.ScriptType = "uncategorized"
	}
	if item.SourceType == "" {
		item.SourceType = "raw"
	}
	if item.Version == 0 {
		item.Version = 1
	}
	if strings.TrimSpace(item.RawSource) == "" {
		item.RawSource = item.Content
	}
	if strings.TrimSpace(item.Content) == "" {
		item.Content = item.RawSource
	}
	if strings.TrimSpace(item.RawSource) != "" {
		item.Content = item.RawSource
	}
}

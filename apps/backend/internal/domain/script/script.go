package script

import (
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
)

const ScriptVersionStatusActive = "active"
const ScriptSourceTypeRaw = "raw"

type ScriptVersion struct {
	ID              uint
	ProjectID       uint
	ScriptID        uint
	ParentVersionID *uint
	VersionNumber   int
	Title           string
	SourceType      string
	Content         string
	RawSource       string
	Summary         string
	Status          string
	CreatedByID     *uint
}

func NewInitialVersion(item model.Script, createdByID *uint) ScriptVersion {
	sourceType := item.SourceType
	if sourceType == "" {
		sourceType = ScriptSourceTypeRaw
	}
	return ScriptVersion{
		ProjectID:     item.ProjectID,
		ScriptID:      item.ID,
		VersionNumber: 1,
		Title:         item.Title,
		SourceType:    sourceType,
		Content:       item.Content,
		RawSource:     item.RawSource,
		Summary:       item.Summary,
		Status:        ScriptVersionStatusActive,
		CreatedByID:   createdByID,
	}
}

func NormalizeDefaults(item *model.Script) {
	if item.ScriptType == "" {
		item.ScriptType = "uncategorized"
	}
	if item.SourceType == "" {
		item.SourceType = ScriptSourceTypeRaw
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

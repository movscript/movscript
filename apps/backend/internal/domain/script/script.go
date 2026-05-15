package script

import (
	"strings"
	"time"
)

const ScriptVersionStatusActive = "active"
const ScriptSourceTypeRaw = "raw"

type ScriptSnapshot struct {
	ID                     uint      `json:"ID"`
	ProjectID              uint      `json:"project_id"`
	Title                  string    `json:"title"`
	Description            string    `json:"description"`
	Content                string    `json:"content"`
	RawSource              string    `json:"raw_source"`
	ScriptType             string    `json:"script_type"`
	SourceType             string    `json:"source_type"`
	Version                int       `json:"version"`
	ParentScriptID         *uint     `json:"parent_script_id,omitempty"`
	AnalysisStatus         string    `json:"analysis_status"`
	AssigneeID             *uint     `json:"assignee_id,omitempty"`
	AuthorID               uint      `json:"author_id"`
	Summary                string    `json:"summary"`
	Characters             string    `json:"characters"`
	CharacterProfiles      string    `json:"character_profiles"`
	CharacterRelationships string    `json:"character_relationships"`
	CoreSettings           string    `json:"core_settings"`
	Background             string    `json:"background"`
	ScenesDesc             string    `json:"scenes_desc"`
	Hook                   string    `json:"hook"`
	PlotSummary            string    `json:"plot_summary"`
	ScriptPoints           string    `json:"script_points"`
	PlannedSceneCount      int       `json:"planned_scene_count"`
	PlannedCharacterCount  int       `json:"planned_character_count"`
	TimeText               string    `json:"time_text"`
	LocationText           string    `json:"location_text"`
	StructuredCharacters   string    `json:"structured_characters"`
	PlotBeats              string    `json:"plot_beats"`
	Atmosphere             string    `json:"atmosphere"`
	StructureJSON          string    `json:"structure_json"`
	EntityCandidates       string    `json:"entity_candidates"`
	RelationshipCandidates string    `json:"relationship_candidates"`
	Order                  int       `json:"order"`
	CreatedAt              time.Time `json:"CreatedAt"`
	UpdatedAt              time.Time `json:"UpdatedAt"`
}

type ScriptVersion struct {
	ID              uint      `json:"ID"`
	ProjectID       uint      `json:"project_id"`
	ScriptID        uint      `json:"script_id"`
	ParentVersionID *uint     `json:"parent_version_id,omitempty"`
	VersionNumber   int       `json:"version_number"`
	Title           string    `json:"title"`
	SourceType      string    `json:"source_type"`
	Content         string    `json:"content"`
	RawSource       string    `json:"raw_source"`
	Summary         string    `json:"summary"`
	Status          string    `json:"status"`
	CreatedByID     *uint     `json:"created_by_id,omitempty"`
	CreatedAt       time.Time `json:"CreatedAt"`
	UpdatedAt       time.Time `json:"UpdatedAt"`
}

type ScriptPatchSpec struct {
	Title                  *string
	Description            *string
	Content                *string
	RawSource              *string
	ScriptType             *string
	SourceType             *string
	Version                *int
	ParentScriptID         **uint
	AssigneeID             **uint
	Summary                *string
	Characters             *string
	CharacterRelationships *string
	CoreSettings           *string
	Background             *string
	ScenesDesc             *string
	Hook                   *string
	PlotSummary            *string
	ScriptPoints           *string
	PlannedSceneCount      *int
	TimeText               *string
	LocationText           *string
	StructuredCharacters   *string
	PlotBeats              *string
	Atmosphere             *string
	StructureJSON          *string
	EntityCandidates       *string
	RelationshipCandidates *string
	Order                  *int
}

func (spec ScriptPatchSpec) Empty() bool {
	return spec.Title == nil &&
		spec.Description == nil &&
		spec.Content == nil &&
		spec.RawSource == nil &&
		spec.ScriptType == nil &&
		spec.SourceType == nil &&
		spec.Version == nil &&
		spec.ParentScriptID == nil &&
		spec.AssigneeID == nil &&
		spec.Summary == nil &&
		spec.Characters == nil &&
		spec.CharacterRelationships == nil &&
		spec.CoreSettings == nil &&
		spec.Background == nil &&
		spec.ScenesDesc == nil &&
		spec.Hook == nil &&
		spec.PlotSummary == nil &&
		spec.ScriptPoints == nil &&
		spec.PlannedSceneCount == nil &&
		spec.TimeText == nil &&
		spec.LocationText == nil &&
		spec.StructuredCharacters == nil &&
		spec.PlotBeats == nil &&
		spec.Atmosphere == nil &&
		spec.StructureJSON == nil &&
		spec.EntityCandidates == nil &&
		spec.RelationshipCandidates == nil &&
		spec.Order == nil
}

func (item *ScriptSnapshot) ApplyPatch(spec ScriptPatchSpec) {
	if spec.Title != nil {
		item.Title = *spec.Title
	}
	if spec.Description != nil {
		item.Description = *spec.Description
	}
	if spec.Content != nil {
		item.Content = *spec.Content
	}
	if spec.RawSource != nil {
		item.RawSource = *spec.RawSource
	}
	if spec.ScriptType != nil {
		item.ScriptType = *spec.ScriptType
	}
	if spec.SourceType != nil {
		item.SourceType = *spec.SourceType
	}
	if spec.Version != nil {
		item.Version = *spec.Version
	}
	if spec.ParentScriptID != nil {
		item.ParentScriptID = *spec.ParentScriptID
	}
	if spec.AssigneeID != nil {
		item.AssigneeID = *spec.AssigneeID
	}
	if spec.Summary != nil {
		item.Summary = *spec.Summary
	}
	if spec.Characters != nil {
		item.Characters = *spec.Characters
	}
	if spec.CharacterRelationships != nil {
		item.CharacterRelationships = *spec.CharacterRelationships
	}
	if spec.CoreSettings != nil {
		item.CoreSettings = *spec.CoreSettings
	}
	if spec.Background != nil {
		item.Background = *spec.Background
	}
	if spec.ScenesDesc != nil {
		item.ScenesDesc = *spec.ScenesDesc
	}
	if spec.Hook != nil {
		item.Hook = *spec.Hook
	}
	if spec.PlotSummary != nil {
		item.PlotSummary = *spec.PlotSummary
	}
	if spec.ScriptPoints != nil {
		item.ScriptPoints = *spec.ScriptPoints
	}
	if spec.PlannedSceneCount != nil {
		item.PlannedSceneCount = *spec.PlannedSceneCount
	}
	if spec.TimeText != nil {
		item.TimeText = *spec.TimeText
	}
	if spec.LocationText != nil {
		item.LocationText = *spec.LocationText
	}
	if spec.StructuredCharacters != nil {
		item.StructuredCharacters = *spec.StructuredCharacters
	}
	if spec.PlotBeats != nil {
		item.PlotBeats = *spec.PlotBeats
	}
	if spec.Atmosphere != nil {
		item.Atmosphere = *spec.Atmosphere
	}
	if spec.StructureJSON != nil {
		item.StructureJSON = *spec.StructureJSON
	}
	if spec.EntityCandidates != nil {
		item.EntityCandidates = *spec.EntityCandidates
	}
	if spec.RelationshipCandidates != nil {
		item.RelationshipCandidates = *spec.RelationshipCandidates
	}
	if spec.Order != nil {
		item.Order = *spec.Order
	}
}

func NewInitialVersion(item ScriptSnapshot, createdByID *uint) ScriptVersion {
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

func NormalizeDefaults(item *ScriptSnapshot) {
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

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

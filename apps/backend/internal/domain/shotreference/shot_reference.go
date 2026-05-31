package shotreference

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	domainresource "github.com/movscript/movscript/internal/domain/resource"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

type ShotReference struct {
	ID                 uint                        `json:"ID"`
	OwnerID            uint                        `json:"owner_id"`
	OrgID              *uint                       `json:"org_id,omitempty"`
	GroupID            *uint                       `json:"group_id,omitempty"`
	Group              *ShotReferenceGroup         `json:"group,omitempty"`
	ResourceID         uint                        `json:"resource_id"`
	Resource           *domainresource.RawResource `json:"resource,omitempty"`
	Order              int                         `json:"order"`
	StartSec           *float64                    `json:"start_sec,omitempty"`
	EndSec             *float64                    `json:"end_sec,omitempty"`
	Title              string                      `json:"title"`
	Summary            string                      `json:"summary"`
	AnalysisStatus     string                      `json:"analysis_status"`
	AnalysisSource     string                      `json:"analysis_source"`
	Intent             []string                    `json:"intent"`
	Pattern            []string                    `json:"pattern"`
	ShotFunction       []string                    `json:"shot_function"`
	VisualPreference   []string                    `json:"visual_preference"`
	EmotionalEffect    []string                    `json:"emotional_effect"`
	ExecutionDetails   ExecutionDetails            `json:"execution_details"`
	VisualAnalysis     VisualAnalysis              `json:"visual_analysis"`
	SceneSemantics     SceneSemantics              `json:"scene_semantics"`
	NarrativeFunction  NarrativeFunction           `json:"narrative_function"`
	EmotionalProfile   EmotionalProfile            `json:"emotional_profile"`
	ReusablePattern    ReusablePattern             `json:"reusable_pattern"`
	SearchIndex        SearchIndex                 `json:"search_index"`
	RetrievalText      string                      `json:"retrieval_text"`
	MachineDescription string                      `json:"machine_description"`
	ReusablePrinciple  string                      `json:"reusable_principle"`
	CreatedAt          time.Time                   `json:"CreatedAt"`
	UpdatedAt          time.Time                   `json:"UpdatedAt"`
}

type ShotReferenceGroup struct {
	ID               uint                        `json:"ID"`
	OwnerID          uint                        `json:"owner_id"`
	OrgID            *uint                       `json:"org_id,omitempty"`
	SourceResourceID uint                        `json:"source_resource_id"`
	SourceResource   *domainresource.RawResource `json:"source_resource,omitempty"`
	Title            string                      `json:"title"`
	Summary          string                      `json:"summary"`
	AnalysisStatus   string                      `json:"analysis_status"`
	CutStrategy      string                      `json:"cut_strategy"`
	CreatedAt        time.Time                   `json:"CreatedAt"`
	UpdatedAt        time.Time                   `json:"UpdatedAt"`
}

type ExecutionDetails struct {
	DurationSec   *float64 `json:"duration_sec,omitempty"`
	Resolution    string   `json:"resolution,omitempty"`
	AspectRatio   string   `json:"aspect_ratio,omitempty"`
	TransitionIn  string   `json:"transition_in,omitempty"`
	TransitionOut string   `json:"transition_out,omitempty"`
	CoverageRole  string   `json:"coverage_role,omitempty"`
	Difficulty    string   `json:"difficulty,omitempty"`
	Requirements  []string `json:"requirements,omitempty"`
	Blocking      string   `json:"blocking,omitempty"`
}

type VisualAnalysis struct {
	ShotSize       string              `json:"shot_size,omitempty"`
	Framing        []string            `json:"framing,omitempty"`
	Composition    []string            `json:"composition,omitempty"`
	CameraAngle    string              `json:"camera_angle,omitempty"`
	CameraHeight   string              `json:"camera_height,omitempty"`
	Lens           LensAnalysis        `json:"lens,omitempty"`
	Focus          FocusAnalysis       `json:"focus,omitempty"`
	CameraMovement MovementAnalysis    `json:"camera_movement,omitempty"`
	Lighting       LightingAnalysis    `json:"lighting,omitempty"`
	Color          ColorAnalysis       `json:"color,omitempty"`
	Environment    EnvironmentAnalysis `json:"environment,omitempty"`
	Characters     []CharacterAnalysis `json:"characters,omitempty"`
}

type LensAnalysis struct {
	FocalLengthClass string   `json:"focal_length_class,omitempty"`
	DepthOfField     string   `json:"depth_of_field,omitempty"`
	OpticalEffects   []string `json:"optical_effects,omitempty"`
}

type FocusAnalysis struct {
	Behavior     string `json:"behavior,omitempty"`
	InitialFocus string `json:"initial_focus,omitempty"`
	FinalFocus   string `json:"final_focus,omitempty"`
}

type MovementAnalysis struct {
	Type       string `json:"type,omitempty"`
	Speed      string `json:"speed,omitempty"`
	Stability  string `json:"stability,omitempty"`
	Motivation string `json:"motivation,omitempty"`
}

type LightingAnalysis struct {
	Style      string `json:"style,omitempty"`
	Motivation string `json:"motivation,omitempty"`
	Contrast   string `json:"contrast,omitempty"`
	Direction  string `json:"direction,omitempty"`
}

type ColorAnalysis struct {
	Palette    string `json:"palette,omitempty"`
	Contrast   string `json:"contrast,omitempty"`
	Saturation string `json:"saturation,omitempty"`
}

type EnvironmentAnalysis struct {
	LocationType   string   `json:"location_type,omitempty"`
	SpatialFeeling []string `json:"spatial_feeling,omitempty"`
}

type CharacterAnalysis struct {
	Role       string `json:"role,omitempty"`
	Visibility string `json:"visibility,omitempty"`
	Expression string `json:"expression,omitempty"`
	Action     string `json:"action,omitempty"`
}

type SceneSemantics struct {
	Genre             []string `json:"genre,omitempty"`
	SceneType         string   `json:"scene_type,omitempty"`
	LocationType      string   `json:"location_type,omitempty"`
	TimeOfDay         string   `json:"time_of_day,omitempty"`
	CharacterCount    string   `json:"character_count,omitempty"`
	RelationshipState string   `json:"relationship_state,omitempty"`
	ConflictLevel     string   `json:"conflict_level,omitempty"`
	StoryBeat         string   `json:"story_beat,omitempty"`
	ProductionScale   string   `json:"production_scale,omitempty"`
}

type NarrativeFunction struct {
	Primary            string   `json:"primary,omitempty"`
	Secondary          []string `json:"secondary,omitempty"`
	InformationState   string   `json:"information_state,omitempty"`
	SequencePosition   string   `json:"sequence_position,omitempty"`
	RelationToPrevious string   `json:"relation_to_previous,omitempty"`
	RelationToNext     string   `json:"relation_to_next,omitempty"`
}

type EmotionalProfile struct {
	Names          []string `json:"names,omitempty"`
	Valence        string   `json:"valence,omitempty"`
	Arousal        string   `json:"arousal,omitempty"`
	Dominance      string   `json:"dominance,omitempty"`
	ViewerPosition string   `json:"viewer_position,omitempty"`
	Intensity      float64  `json:"intensity,omitempty"`
}

type ReusablePattern struct {
	PatternIDs []string          `json:"pattern_ids,omitempty"`
	Principle  string            `json:"principle,omitempty"`
	WorksWhen  []string          `json:"works_when,omitempty"`
	AvoidWhen  []string          `json:"avoid_when,omitempty"`
	Variables  map[string]string `json:"variables,omitempty"`
}

type SearchIndex struct {
	SearchText             string             `json:"search_text,omitempty"`
	NaturalLanguageQueries []string           `json:"natural_language_queries,omitempty"`
	Tags                   []string           `json:"tags,omitempty"`
	VisualFacets           []string           `json:"visual_facets,omitempty"`
	NarrativeFacets        []string           `json:"narrative_facets,omitempty"`
	EmotionFacets          []string           `json:"emotion_facets,omitempty"`
	PatternFacets          []string           `json:"pattern_facets,omitempty"`
	ProductionFacets       []string           `json:"production_facets,omitempty"`
	Confidence             map[string]float64 `json:"confidence,omitempty"`
}

type AnalysisInput struct {
	Resource    domainresource.RawResource
	DurationSec *float64
	Width       int
	Height      int
}

type ListInput struct {
	UserID   uint
	OrgID    *uint
	Query    string
	Page     int
	PageSize int
}

type Page struct {
	Total    int64           `json:"total"`
	Items    []ShotReference `json:"items"`
	Page     int             `json:"page"`
	PageSize int             `json:"page_size"`
}

type UpdateInput struct {
	Title                *string
	Summary              *string
	Intent               []string
	IntentSet            bool
	Pattern              []string
	PatternSet           bool
	ShotFunction         []string
	ShotFunctionSet      bool
	VisualPreference     []string
	VisualPreferenceSet  bool
	EmotionalEffect      []string
	EmotionalEffectSet   bool
	StartSec             *float64
	StartSecSet          bool
	EndSec               *float64
	EndSecSet            bool
	ExecutionDetails     ExecutionDetails
	ExecutionDetailsSet  bool
	VisualAnalysis       VisualAnalysis
	VisualAnalysisSet    bool
	SceneSemantics       SceneSemantics
	SceneSemanticsSet    bool
	NarrativeFunction    NarrativeFunction
	NarrativeFunctionSet bool
	EmotionalProfile     EmotionalProfile
	EmotionalProfileSet  bool
	ReusablePattern      ReusablePattern
	ReusablePatternSet   bool
}

func Analyze(input AnalysisInput) ShotReference {
	resource := input.Resource
	title := titleFromName(resource.Name)
	duration := normalizedDuration(input.DurationSec)
	resolution := ""
	aspectRatio := ""
	if input.Width > 0 && input.Height > 0 {
		resolution = fmt.Sprintf("%dx%d", input.Width, input.Height)
		aspectRatio = formatAspectRatio(input.Width, input.Height)
	}

	intent := unique(append(matchHints(resource.Name, intentHints), durationIntent(duration)))
	pattern := unique(append(matchHints(resource.Name, patternHints), durationPattern(duration)))
	shotFunction := []string{"reference_moment", "visual_cue"}
	if duration != nil && *duration >= 8 {
		shotFunction = []string{"tension_buildup", "emotional_pause"}
	}
	visualPreference := unique(compact([]string{
		aspectRatioLabel(input.Width, input.Height),
		durationPreference(duration),
		"video_reference",
	}))
	emotionalEffect := []string{"reference_mood"}
	if contains(intent, "create_tension") {
		emotionalEffect = []string{"suspense"}
	} else if contains(intent, "isolate_character") {
		emotionalEffect = []string{"isolation"}
	}
	execution := ExecutionDetails{DurationSec: duration, Resolution: resolution, AspectRatio: aspectRatio}
	summary := buildSummary(title, duration, resolution, intent, pattern)
	visualAnalysis := inferVisualAnalysis(resource.Name, intent, pattern, visualPreference, emotionalEffect, duration)
	sceneSemantics := inferSceneSemantics(resource.Name, intent, emotionalEffect)
	narrativeFunction := inferNarrativeFunction(intent, shotFunction, pattern)
	emotionalProfile := inferEmotionalProfile(emotionalEffect, intent)
	reusablePattern := inferReusablePattern(intent, pattern)
	execution = enrichExecutionDetails(execution, visualAnalysis, pattern)
	searchIndex := buildSearchIndex(SearchIndexInput{
		Title:             title,
		Summary:           summary,
		ResourceName:      resource.Name,
		Intent:            intent,
		Pattern:           pattern,
		ShotFunction:      shotFunction,
		VisualPreference:  visualPreference,
		EmotionalEffect:   emotionalEffect,
		VisualAnalysis:    visualAnalysis,
		SceneSemantics:    sceneSemantics,
		NarrativeFunction: narrativeFunction,
		EmotionalProfile:  emotionalProfile,
		ReusablePattern:   reusablePattern,
		ExecutionDetails:  execution,
	})
	retrievalText := searchIndex.SearchText

	return ShotReference{
		OwnerID:            resource.OwnerID,
		OrgID:              resource.OrgID,
		ResourceID:         resource.ID,
		Title:              title,
		Summary:            summary,
		AnalysisStatus:     "ready",
		AnalysisSource:     "manual_draft",
		Intent:             intent,
		Pattern:            pattern,
		ShotFunction:       shotFunction,
		VisualPreference:   visualPreference,
		EmotionalEffect:    emotionalEffect,
		ExecutionDetails:   execution,
		VisualAnalysis:     visualAnalysis,
		SceneSemantics:     sceneSemantics,
		NarrativeFunction:  narrativeFunction,
		EmotionalProfile:   emotionalProfile,
		ReusablePattern:    reusablePattern,
		SearchIndex:        searchIndex,
		RetrievalText:      retrievalText,
		MachineDescription: summary,
		ReusablePrinciple:  reusablePattern.Principle,
	}
}

func FromModel(input persistencemodel.ShotReference) ShotReference {
	var resource *domainresource.RawResource
	if input.Resource.ID != 0 {
		r := domainresource.RawResourceFromModel(input.Resource)
		resource = &r
	}
	reference := ShotReference{
		ID:                 input.ID,
		OwnerID:            input.OwnerID,
		OrgID:              input.OrgID,
		GroupID:            input.GroupID,
		Group:              groupFromModel(input.Group),
		ResourceID:         input.ResourceID,
		Resource:           resource,
		Order:              input.Order,
		StartSec:           input.StartSec,
		EndSec:             input.EndSec,
		Title:              input.Title,
		Summary:            input.Summary,
		AnalysisStatus:     input.AnalysisStatus,
		AnalysisSource:     input.AnalysisSource,
		Intent:             readStringArray(input.IntentJSON),
		Pattern:            readStringArray(input.PatternJSON),
		ShotFunction:       readStringArray(input.ShotFunctionJSON),
		VisualPreference:   readStringArray(input.VisualPrefJSON),
		EmotionalEffect:    readStringArray(input.EmotionalJSON),
		ExecutionDetails:   readExecutionDetails(input.ExecutionJSON),
		VisualAnalysis:     readVisualAnalysis(input.VisualAnalysisJSON),
		SceneSemantics:     readSceneSemantics(input.SceneSemanticsJSON),
		NarrativeFunction:  readNarrativeFunction(input.NarrativeJSON),
		EmotionalProfile:   readEmotionalProfile(input.EmotionalProfileJSON),
		ReusablePattern:    readReusablePattern(input.ReusablePatternJSON),
		SearchIndex:        readSearchIndex(input.SearchIndexJSON),
		RetrievalText:      input.RetrievalText,
		MachineDescription: input.MachineDesc,
		ReusablePrinciple:  input.ReusablePrinciple,
		CreatedAt:          input.CreatedAt,
		UpdatedAt:          input.UpdatedAt,
	}
	return EnsureDerivedFields(reference)
}

func (reference ShotReference) ToModel() persistencemodel.ShotReference {
	model := persistencemodel.ShotReference{
		OwnerID:              reference.OwnerID,
		OrgID:                reference.OrgID,
		GroupID:              reference.GroupID,
		ResourceID:           reference.ResourceID,
		Order:                reference.Order,
		StartSec:             reference.StartSec,
		EndSec:               reference.EndSec,
		Title:                reference.Title,
		Summary:              reference.Summary,
		AnalysisStatus:       reference.AnalysisStatus,
		AnalysisSource:       defaultAnalysisSource(reference.AnalysisSource),
		IntentJSON:           writeJSON(reference.Intent, "[]"),
		PatternJSON:          writeJSON(reference.Pattern, "[]"),
		ShotFunctionJSON:     writeJSON(reference.ShotFunction, "[]"),
		VisualPrefJSON:       writeJSON(reference.VisualPreference, "[]"),
		EmotionalJSON:        writeJSON(reference.EmotionalEffect, "[]"),
		ExecutionJSON:        writeJSON(reference.ExecutionDetails, "{}"),
		VisualAnalysisJSON:   writeJSON(reference.VisualAnalysis, "{}"),
		SceneSemanticsJSON:   writeJSON(reference.SceneSemantics, "{}"),
		NarrativeJSON:        writeJSON(reference.NarrativeFunction, "{}"),
		EmotionalProfileJSON: writeJSON(reference.EmotionalProfile, "{}"),
		ReusablePatternJSON:  writeJSON(reference.ReusablePattern, "{}"),
		SearchIndexJSON:      writeJSON(reference.SearchIndex, "{}"),
		RetrievalText:        reference.RetrievalText,
		MachineDesc:          reference.MachineDescription,
		ReusablePrinciple:    reference.ReusablePrinciple,
	}
	model.Model.ID = reference.ID
	return model
}

func GroupFromModel(input persistencemodel.ShotReferenceGroup) ShotReferenceGroup {
	var resource *domainresource.RawResource
	if input.SourceResource.ID != 0 {
		r := domainresource.RawResourceFromModel(input.SourceResource)
		resource = &r
	}
	return ShotReferenceGroup{
		ID:               input.ID,
		OwnerID:          input.OwnerID,
		OrgID:            input.OrgID,
		SourceResourceID: input.SourceResourceID,
		SourceResource:   resource,
		Title:            input.Title,
		Summary:          input.Summary,
		AnalysisStatus:   input.AnalysisStatus,
		CutStrategy:      input.CutStrategy,
		CreatedAt:        input.CreatedAt,
		UpdatedAt:        input.UpdatedAt,
	}
}

func (group ShotReferenceGroup) ToModel() persistencemodel.ShotReferenceGroup {
	model := persistencemodel.ShotReferenceGroup{
		OwnerID:          group.OwnerID,
		OrgID:            group.OrgID,
		SourceResourceID: group.SourceResourceID,
		Title:            group.Title,
		Summary:          group.Summary,
		AnalysisStatus:   group.AnalysisStatus,
		CutStrategy:      group.CutStrategy,
	}
	model.Model.ID = group.ID
	return model
}

func NewGroupForResource(resource domainresource.RawResource) ShotReferenceGroup {
	title := titleFromName(resource.Name)
	return ShotReferenceGroup{
		OwnerID:          resource.OwnerID,
		OrgID:            resource.OrgID,
		SourceResourceID: resource.ID,
		Title:            title,
		Summary:          title + " shot reference group.",
		AnalysisStatus:   "ready",
		CutStrategy:      "manual_single",
	}
}

func ApplyUpdate(reference ShotReference, input UpdateInput) ShotReference {
	if input.Title != nil {
		reference.Title = strings.TrimSpace(*input.Title)
	}
	if input.Summary != nil {
		reference.Summary = strings.TrimSpace(*input.Summary)
	}
	if input.IntentSet {
		reference.Intent = cleanValues(input.Intent)
	}
	if input.PatternSet {
		reference.Pattern = cleanValues(input.Pattern)
	}
	if input.ShotFunctionSet {
		reference.ShotFunction = cleanValues(input.ShotFunction)
	}
	if input.VisualPreferenceSet {
		reference.VisualPreference = cleanValues(input.VisualPreference)
	}
	if input.EmotionalEffectSet {
		reference.EmotionalEffect = cleanValues(input.EmotionalEffect)
	}
	if input.StartSecSet {
		reference.StartSec = normalizedDuration(input.StartSec)
	}
	if input.EndSecSet {
		reference.EndSec = normalizedDuration(input.EndSec)
	}
	if input.ExecutionDetailsSet {
		reference.ExecutionDetails = input.ExecutionDetails
	}
	if input.VisualAnalysisSet {
		reference.VisualAnalysis = input.VisualAnalysis
	}
	if input.SceneSemanticsSet {
		reference.SceneSemantics = input.SceneSemantics
	}
	if input.NarrativeFunctionSet {
		reference.NarrativeFunction = input.NarrativeFunction
	}
	if input.EmotionalProfileSet {
		reference.EmotionalProfile = input.EmotionalProfile
	}
	if input.ReusablePatternSet {
		reference.ReusablePattern = input.ReusablePattern
	}
	if strings.TrimSpace(reference.Title) == "" {
		reference.Title = "Untitled shot reference"
	}
	reference = EnsureDerivedFields(reference)
	reference.AnalysisSource = "manual"
	return reference
}

func EnsureDerivedFields(reference ShotReference) ShotReference {
	source := strings.Join(compact([]string{buildRetrievalText(reference), reference.RetrievalText}), " ")
	if source == "" {
		source = reference.Title
	}
	reference.VisualAnalysis = mergeVisualAnalysis(inferVisualAnalysis(source, reference.Intent, reference.Pattern, reference.VisualPreference, reference.EmotionalEffect, reference.ExecutionDetails.DurationSec), reference.VisualAnalysis)
	reference.SceneSemantics = mergeSceneSemantics(inferSceneSemantics(source, reference.Intent, reference.EmotionalEffect), reference.SceneSemantics)
	reference.NarrativeFunction = mergeNarrativeFunction(inferNarrativeFunction(reference.Intent, reference.ShotFunction, reference.Pattern), reference.NarrativeFunction)
	reference.EmotionalProfile = mergeEmotionalProfile(inferEmotionalProfile(reference.EmotionalEffect, reference.Intent), reference.EmotionalProfile)
	reference.ReusablePattern = mergeReusablePattern(inferReusablePattern(reference.Intent, reference.Pattern), reference.ReusablePattern)
	reference.ExecutionDetails = enrichExecutionDetails(reference.ExecutionDetails, reference.VisualAnalysis, reference.Pattern)
	reference.SearchIndex = buildSearchIndex(SearchIndexInput{
		Title:             reference.Title,
		Summary:           reference.Summary,
		ResourceName:      resourceName(reference),
		Intent:            reference.Intent,
		Pattern:           reference.Pattern,
		ShotFunction:      reference.ShotFunction,
		VisualPreference:  reference.VisualPreference,
		EmotionalEffect:   reference.EmotionalEffect,
		VisualAnalysis:    reference.VisualAnalysis,
		SceneSemantics:    reference.SceneSemantics,
		NarrativeFunction: reference.NarrativeFunction,
		EmotionalProfile:  reference.EmotionalProfile,
		ReusablePattern:   reference.ReusablePattern,
		ExecutionDetails:  reference.ExecutionDetails,
	})
	reference.RetrievalText = reference.SearchIndex.SearchText
	reference.MachineDescription = reference.Summary
	reference.ReusablePrinciple = reference.ReusablePattern.Principle
	return reference
}

func MatchesOrgScope(reference ShotReference, userID uint, orgID *uint) bool {
	if orgID != nil {
		return reference.OrgID != nil && *reference.OrgID == *orgID || reference.OrgID == nil && reference.OwnerID == userID
	}
	return reference.OrgID == nil && reference.OwnerID == userID
}

type hint struct {
	pattern *regexp.Regexp
	value   string
}

var intentHints = []hint{
	{regexp.MustCompile(`(?i)reveal|揭示|真相|发现|discover|find`), "reveal_information"},
	{regexp.MustCompile(`(?i)tension|紧张|压迫|pressure|suspense`), "create_tension"},
	{regexp.MustCompile(`(?i)lonely|孤独|isolate|alone|empty`), "isolate_character"},
	{regexp.MustCompile(`(?i)memory|回忆|remember|nostalgia`), "evoke_memory"},
	{regexp.MustCompile(`(?i)power|权力|威胁|threat|dominance`), "show_power_shift"},
}

var patternHints = []hint{
	{regexp.MustCompile(`(?i)push|推进|慢推|dolly`), "slow_push_in"},
	{regexp.MustCompile(`(?i)handheld|手持|shake|晃动`), "handheld_follow"},
	{regexp.MustCompile(`(?i)obstruct|遮挡|door|window|frame`), "foreground_obstruction"},
	{regexp.MustCompile(`(?i)wide|远景|empty|空镜`), "negative_space_pressure"},
	{regexp.MustCompile(`(?i)close|特写|face|reaction`), "reaction_close_up"},
}

type SearchIndexInput struct {
	Title             string
	Summary           string
	ResourceName      string
	Intent            []string
	Pattern           []string
	ShotFunction      []string
	VisualPreference  []string
	EmotionalEffect   []string
	VisualAnalysis    VisualAnalysis
	SceneSemantics    SceneSemantics
	NarrativeFunction NarrativeFunction
	EmotionalProfile  EmotionalProfile
	ReusablePattern   ReusablePattern
	ExecutionDetails  ExecutionDetails
}

func matchHints(value string, hints []hint) []string {
	result := []string{}
	for _, h := range hints {
		if h.pattern.MatchString(value) {
			result = append(result, h.value)
		}
	}
	return result
}

func inferVisualAnalysis(source string, intent, pattern, visualPreference, emotionalEffect []string, duration *float64) VisualAnalysis {
	text := strings.ToLower(source)
	analysis := VisualAnalysis{
		ShotSize:     "medium_shot",
		CameraAngle:  "eye_level",
		CameraHeight: "standing_eye_level",
		Lens: LensAnalysis{
			FocalLengthClass: "normal_lens",
			DepthOfField:     "moderate_depth",
		},
		Focus: FocusAnalysis{
			Behavior:   "hold_focus",
			FinalFocus: "subject",
		},
		CameraMovement: MovementAnalysis{
			Type:      "static",
			Speed:     "still",
			Stability: "locked_off",
		},
		Lighting: LightingAnalysis{
			Style:    "naturalistic",
			Contrast: "medium",
		},
		Color: ColorAnalysis{
			Palette:    "neutral",
			Contrast:   "medium",
			Saturation: "medium",
		},
		Environment: EnvironmentAnalysis{
			LocationType:   "unspecified",
			SpatialFeeling: []string{"reference_space"},
		},
		Characters: []CharacterAnalysis{{
			Role:       "subject",
			Visibility: "readable",
			Expression: "unspecified",
			Action:     "reference_action",
		}},
	}
	if strings.Contains(text, "close") || strings.Contains(text, "特写") || contains(pattern, "reaction_close_up") {
		analysis.ShotSize = "close_up"
		analysis.Composition = append(analysis.Composition, "close_framing")
		analysis.Characters[0].Expression = "reaction"
		analysis.Characters[0].Action = "reacts"
	}
	if strings.Contains(text, "wide") || strings.Contains(text, "远景") || strings.Contains(text, "empty") || contains(pattern, "negative_space_pressure") {
		analysis.ShotSize = "wide_shot"
		analysis.Composition = append(analysis.Composition, "negative_space")
		analysis.Environment.SpatialFeeling = []string{"large", "isolating"}
	}
	if contains(pattern, "slow_push_in") {
		analysis.CameraMovement = MovementAnalysis{Type: "push_in", Speed: "slow", Stability: "smooth", Motivation: "psychological_pressure"}
	}
	if contains(pattern, "handheld_follow") {
		analysis.CameraMovement = MovementAnalysis{Type: "follow", Speed: "reactive", Stability: "handheld", Motivation: "subjective_presence"}
	}
	if contains(pattern, "foreground_obstruction") {
		analysis.Framing = append(analysis.Framing, "foreground_obstruction")
		analysis.Composition = append(analysis.Composition, "layered_depth")
		analysis.Lens.OpticalEffects = append(analysis.Lens.OpticalEffects, "foreground_blur")
		analysis.Focus = FocusAnalysis{Behavior: "soft_or_rack_reveal", InitialFocus: "foreground", FinalFocus: "subject"}
		analysis.Characters[0].Visibility = "partially_obscured"
	}
	if contains(intent, "create_tension") || contains(emotionalEffect, "suspense") {
		analysis.Lighting.Style = "low_key"
		analysis.Lighting.Contrast = "medium_high"
		analysis.Color.Palette = "cool_muted"
		analysis.Color.Saturation = "low"
	}
	if contains(intent, "isolate_character") {
		analysis.Composition = append(analysis.Composition, "off_center_subject", "negative_space")
		analysis.Environment.SpatialFeeling = unique(append(analysis.Environment.SpatialFeeling, "empty", "distant"))
	}
	if contains(visualPreference, "vertical_frame") {
		analysis.Framing = append(analysis.Framing, "vertical_frame")
	} else if contains(visualPreference, "landscape_frame") {
		analysis.Framing = append(analysis.Framing, "landscape_frame")
	}
	if duration != nil && *duration >= 8 {
		analysis.Composition = append(analysis.Composition, "held_composition")
	}
	analysis.Framing = unique(analysis.Framing)
	analysis.Composition = unique(analysis.Composition)
	analysis.Lens.OpticalEffects = unique(analysis.Lens.OpticalEffects)
	return analysis
}

func mergeVisualAnalysis(base VisualAnalysis, override VisualAnalysis) VisualAnalysis {
	if override.ShotSize != "" {
		base.ShotSize = override.ShotSize
	}
	if len(override.Framing) > 0 {
		base.Framing = cleanValues(override.Framing)
	}
	if len(override.Composition) > 0 {
		base.Composition = cleanValues(override.Composition)
	}
	if override.CameraAngle != "" {
		base.CameraAngle = override.CameraAngle
	}
	if override.CameraHeight != "" {
		base.CameraHeight = override.CameraHeight
	}
	base.Lens = mergeLensAnalysis(base.Lens, override.Lens)
	base.Focus = mergeFocusAnalysis(base.Focus, override.Focus)
	base.CameraMovement = mergeMovementAnalysis(base.CameraMovement, override.CameraMovement)
	base.Lighting = mergeLightingAnalysis(base.Lighting, override.Lighting)
	base.Color = mergeColorAnalysis(base.Color, override.Color)
	base.Environment = mergeEnvironmentAnalysis(base.Environment, override.Environment)
	if len(override.Characters) > 0 {
		base.Characters = override.Characters
	}
	return base
}

func mergeLensAnalysis(base LensAnalysis, override LensAnalysis) LensAnalysis {
	if override.FocalLengthClass != "" {
		base.FocalLengthClass = override.FocalLengthClass
	}
	if override.DepthOfField != "" {
		base.DepthOfField = override.DepthOfField
	}
	if len(override.OpticalEffects) > 0 {
		base.OpticalEffects = cleanValues(override.OpticalEffects)
	}
	return base
}

func mergeFocusAnalysis(base FocusAnalysis, override FocusAnalysis) FocusAnalysis {
	if override.Behavior != "" {
		base.Behavior = override.Behavior
	}
	if override.InitialFocus != "" {
		base.InitialFocus = override.InitialFocus
	}
	if override.FinalFocus != "" {
		base.FinalFocus = override.FinalFocus
	}
	return base
}

func mergeMovementAnalysis(base MovementAnalysis, override MovementAnalysis) MovementAnalysis {
	if override.Type != "" {
		base.Type = override.Type
	}
	if override.Speed != "" {
		base.Speed = override.Speed
	}
	if override.Stability != "" {
		base.Stability = override.Stability
	}
	if override.Motivation != "" {
		base.Motivation = override.Motivation
	}
	return base
}

func mergeLightingAnalysis(base LightingAnalysis, override LightingAnalysis) LightingAnalysis {
	if override.Style != "" {
		base.Style = override.Style
	}
	if override.Motivation != "" {
		base.Motivation = override.Motivation
	}
	if override.Contrast != "" {
		base.Contrast = override.Contrast
	}
	if override.Direction != "" {
		base.Direction = override.Direction
	}
	return base
}

func mergeColorAnalysis(base ColorAnalysis, override ColorAnalysis) ColorAnalysis {
	if override.Palette != "" {
		base.Palette = override.Palette
	}
	if override.Contrast != "" {
		base.Contrast = override.Contrast
	}
	if override.Saturation != "" {
		base.Saturation = override.Saturation
	}
	return base
}

func mergeEnvironmentAnalysis(base EnvironmentAnalysis, override EnvironmentAnalysis) EnvironmentAnalysis {
	if override.LocationType != "" {
		base.LocationType = override.LocationType
	}
	if len(override.SpatialFeeling) > 0 {
		base.SpatialFeeling = cleanValues(override.SpatialFeeling)
	}
	return base
}

func inferSceneSemantics(source string, intent, emotionalEffect []string) SceneSemantics {
	text := strings.ToLower(source)
	semantics := SceneSemantics{
		Genre:           []string{"drama"},
		SceneType:       "reference_moment",
		LocationType:    "unspecified",
		ConflictLevel:   "medium",
		StoryBeat:       "visual_reference",
		ProductionScale: "small_to_medium",
	}
	if strings.Contains(text, "office") || strings.Contains(text, "办公室") {
		semantics.LocationType = "office_interior"
	}
	if strings.Contains(text, "door") || strings.Contains(text, "room") || strings.Contains(text, "室内") {
		semantics.LocationType = "interior"
	}
	if contains(intent, "create_tension") || contains(emotionalEffect, "suspense") {
		semantics.Genre = unique(append(semantics.Genre, "thriller"))
		semantics.SceneType = "suspense_or_discovery"
		semantics.ConflictLevel = "medium_high"
		semantics.StoryBeat = "before_reveal"
	}
	if contains(intent, "reveal_information") {
		semantics.SceneType = "discovery"
		semantics.StoryBeat = "reveal"
	}
	if contains(intent, "isolate_character") {
		semantics.RelationshipState = "distance_or_disconnection"
	}
	return semantics
}

func mergeSceneSemantics(base SceneSemantics, override SceneSemantics) SceneSemantics {
	if len(override.Genre) > 0 {
		base.Genre = cleanValues(override.Genre)
	}
	if override.SceneType != "" {
		base.SceneType = override.SceneType
	}
	if override.LocationType != "" {
		base.LocationType = override.LocationType
	}
	if override.TimeOfDay != "" {
		base.TimeOfDay = override.TimeOfDay
	}
	if override.CharacterCount != "" {
		base.CharacterCount = override.CharacterCount
	}
	if override.RelationshipState != "" {
		base.RelationshipState = override.RelationshipState
	}
	if override.ConflictLevel != "" {
		base.ConflictLevel = override.ConflictLevel
	}
	if override.StoryBeat != "" {
		base.StoryBeat = override.StoryBeat
	}
	if override.ProductionScale != "" {
		base.ProductionScale = override.ProductionScale
	}
	return base
}

func inferNarrativeFunction(intent, shotFunction, pattern []string) NarrativeFunction {
	fn := NarrativeFunction{
		Primary:            firstValue(shotFunction, "reference_moment"),
		Secondary:          firstN(shotFunction, 3),
		InformationState:   "present_information",
		SequencePosition:   "reference",
		RelationToPrevious: "continues_attention",
		RelationToNext:     "supports_next_cut",
	}
	if contains(intent, "reveal_information") {
		fn.Primary = "delayed_reveal"
		fn.InformationState = "withhold_then_reveal"
		fn.SequencePosition = "setup_or_payoff"
		fn.RelationToPrevious = "narrows_attention"
		fn.RelationToNext = "prepares_reaction"
	}
	if contains(intent, "create_tension") {
		fn.Secondary = unique(append(fn.Secondary, "build_tension", "guide_attention"))
	}
	if contains(pattern, "insert_detail") {
		fn.Primary = "insert_detail"
		fn.RelationToNext = "motivates_reaction"
	}
	return fn
}

func mergeNarrativeFunction(base NarrativeFunction, override NarrativeFunction) NarrativeFunction {
	if override.Primary != "" {
		base.Primary = override.Primary
	}
	if len(override.Secondary) > 0 {
		base.Secondary = cleanValues(override.Secondary)
	}
	if override.InformationState != "" {
		base.InformationState = override.InformationState
	}
	if override.SequencePosition != "" {
		base.SequencePosition = override.SequencePosition
	}
	if override.RelationToPrevious != "" {
		base.RelationToPrevious = override.RelationToPrevious
	}
	if override.RelationToNext != "" {
		base.RelationToNext = override.RelationToNext
	}
	return base
}

func inferEmotionalProfile(emotionalEffect, intent []string) EmotionalProfile {
	profile := EmotionalProfile{
		Names:          emotionalEffect,
		Valence:        "neutral",
		Arousal:        "medium",
		Dominance:      "medium",
		ViewerPosition: "observer",
		Intensity:      0.5,
	}
	if contains(emotionalEffect, "suspense") || contains(intent, "create_tension") {
		profile.Names = unique(append(profile.Names, "suspense", "unease"))
		profile.Valence = "negative"
		profile.Arousal = "medium_high"
		profile.Dominance = "low"
		profile.ViewerPosition = "hidden_observer"
		profile.Intensity = 0.78
	}
	if contains(emotionalEffect, "isolation") || contains(intent, "isolate_character") {
		profile.Names = unique(append(profile.Names, "isolation", "loneliness"))
		profile.Valence = "negative"
		profile.Arousal = "low_medium"
		profile.Dominance = "low"
		profile.ViewerPosition = "distant_observer"
		profile.Intensity = 0.68
	}
	return profile
}

func mergeEmotionalProfile(base EmotionalProfile, override EmotionalProfile) EmotionalProfile {
	if len(override.Names) > 0 {
		base.Names = cleanValues(override.Names)
	}
	if override.Valence != "" {
		base.Valence = override.Valence
	}
	if override.Arousal != "" {
		base.Arousal = override.Arousal
	}
	if override.Dominance != "" {
		base.Dominance = override.Dominance
	}
	if override.ViewerPosition != "" {
		base.ViewerPosition = override.ViewerPosition
	}
	if override.Intensity > 0 {
		base.Intensity = override.Intensity
	}
	return base
}

func inferReusablePattern(intent, pattern []string) ReusablePattern {
	principle := reusablePrinciple(intent, pattern)
	result := ReusablePattern{
		PatternIDs: pattern,
		Principle:  principle,
		WorksWhen: []string{
			"the scene needs a reusable visual method",
			"the audience should understand the shot through image structure",
		},
		AvoidWhen: []string{
			"the story beat requires a simpler or more direct shot",
		},
		Variables: map[string]string{},
	}
	if contains(pattern, "foreground_obstruction") {
		result.Principle = "Place a visual barrier between camera and subject, then reduce distance or increase visibility to delay emotional access."
		result.WorksWhen = []string{"the scene benefits from withholding information", "the subject can stay partially readable", "the location has foreground layers"}
		result.AvoidWhen = []string{"the action must be immediately clear", "the scene needs direct emotional openness"}
		result.Variables["obstruction_type"] = "doorframe_or_foreground_object"
		result.Variables["subject_visibility"] = "partial_to_clear"
	}
	if contains(pattern, "slow_push_in") {
		result.Variables["camera_distance_change"] = "slow_push_in"
		result.Variables["reveal_speed"] = "slow"
	}
	if contains(pattern, "negative_space_pressure") {
		result.WorksWhen = unique(append(result.WorksWhen, "the scene should make space feel emotionally larger than the character"))
		result.Variables["space_ratio"] = "large_environment_small_subject"
	}
	return result
}

func mergeReusablePattern(base ReusablePattern, override ReusablePattern) ReusablePattern {
	if len(override.PatternIDs) > 0 {
		base.PatternIDs = cleanValues(override.PatternIDs)
	}
	if override.Principle != "" {
		base.Principle = strings.TrimSpace(override.Principle)
	}
	if len(override.WorksWhen) > 0 {
		base.WorksWhen = cleanValues(override.WorksWhen)
	}
	if len(override.AvoidWhen) > 0 {
		base.AvoidWhen = cleanValues(override.AvoidWhen)
	}
	if len(override.Variables) > 0 {
		base.Variables = cleanStringMap(override.Variables)
	}
	return base
}

func enrichExecutionDetails(details ExecutionDetails, visual VisualAnalysis, pattern []string) ExecutionDetails {
	if details.TransitionIn == "" {
		details.TransitionIn = "cut"
	}
	if details.TransitionOut == "" {
		details.TransitionOut = "cut_to_next_beat"
	}
	if details.CoverageRole == "" {
		details.CoverageRole = "reference_shot"
	}
	if details.Difficulty == "" {
		details.Difficulty = "medium"
	}
	if details.Blocking == "" {
		details.Blocking = "stage the subject so the camera relationship expresses the selected pattern"
	}
	requirements := []string{"video_reference"}
	if contains(pattern, "slow_push_in") {
		requirements = append(requirements, "slow_dolly_or_gimbal")
	}
	if contains(pattern, "foreground_obstruction") {
		requirements = append(requirements, "foreground_layer", "controlled_focus")
	}
	if visual.CameraMovement.Stability == "handheld" {
		requirements = append(requirements, "handheld_operator")
	}
	details.Requirements = unique(append(details.Requirements, requirements...))
	return details
}

func buildSearchIndex(input SearchIndexInput) SearchIndex {
	visualFacets := visualFacetValues(input.VisualAnalysis)
	narrativeFacets := unique(compact(append([]string{
		input.NarrativeFunction.Primary,
		input.NarrativeFunction.InformationState,
		input.NarrativeFunction.SequencePosition,
		input.NarrativeFunction.RelationToPrevious,
		input.NarrativeFunction.RelationToNext,
	}, input.NarrativeFunction.Secondary...)))
	emotionFacets := unique(compact(append([]string{
		input.EmotionalProfile.Valence,
		input.EmotionalProfile.Arousal,
		input.EmotionalProfile.Dominance,
		input.EmotionalProfile.ViewerPosition,
	}, input.EmotionalProfile.Names...)))
	patternFacets := unique(compact(append(input.Pattern, input.ReusablePattern.PatternIDs...)))
	productionFacets := unique(compact(append([]string{
		input.ExecutionDetails.AspectRatio,
		input.ExecutionDetails.Resolution,
		input.ExecutionDetails.TransitionIn,
		input.ExecutionDetails.TransitionOut,
		input.ExecutionDetails.CoverageRole,
		input.ExecutionDetails.Difficulty,
	}, input.ExecutionDetails.Requirements...)))
	tags := unique(compact(append(append(append(append([]string{}, input.Intent...), input.Pattern...), input.ShotFunction...), append(input.VisualPreference, input.EmotionalEffect...)...)))
	queries := naturalLanguageQueries(input)
	searchText := strings.Join(compact([]string{
		input.Title,
		input.Summary,
		input.ResourceName,
		strings.Join(tags, " "),
		strings.Join(visualFacets, " "),
		strings.Join(narrativeFacets, " "),
		strings.Join(emotionFacets, " "),
		strings.Join(patternFacets, " "),
		strings.Join(productionFacets, " "),
		strings.Join(queries, " "),
		input.ReusablePattern.Principle,
		input.ExecutionDetails.Blocking,
	}), " ")
	return SearchIndex{
		SearchText:             searchText,
		NaturalLanguageQueries: queries,
		Tags:                   tags,
		VisualFacets:           visualFacets,
		NarrativeFacets:        narrativeFacets,
		EmotionFacets:          emotionFacets,
		PatternFacets:          patternFacets,
		ProductionFacets:       productionFacets,
		Confidence: map[string]float64{
			"visual_analysis":    0.64,
			"narrative_function": 0.7,
			"emotional_effect":   0.68,
			"reusable_pattern":   0.66,
		},
	}
}

func visualFacetValues(visual VisualAnalysis) []string {
	values := []string{
		visual.ShotSize,
		visual.CameraAngle,
		visual.CameraHeight,
		visual.Lens.FocalLengthClass,
		visual.Lens.DepthOfField,
		visual.Focus.Behavior,
		visual.Focus.InitialFocus,
		visual.Focus.FinalFocus,
		visual.CameraMovement.Type,
		visual.CameraMovement.Speed,
		visual.CameraMovement.Stability,
		visual.CameraMovement.Motivation,
		visual.Lighting.Style,
		visual.Lighting.Motivation,
		visual.Lighting.Contrast,
		visual.Lighting.Direction,
		visual.Color.Palette,
		visual.Color.Contrast,
		visual.Color.Saturation,
		visual.Environment.LocationType,
	}
	values = append(values, visual.Framing...)
	values = append(values, visual.Composition...)
	values = append(values, visual.Lens.OpticalEffects...)
	values = append(values, visual.Environment.SpatialFeeling...)
	for _, character := range visual.Characters {
		values = append(values, character.Role, character.Visibility, character.Expression, character.Action)
	}
	return unique(compact(values))
}

func naturalLanguageQueries(input SearchIndexInput) []string {
	queries := []string{}
	if contains(input.Intent, "create_tension") {
		queries = append(queries, "气氛慢慢变紧的镜头", "suspense tension buildup shot")
	}
	if contains(input.Intent, "reveal_information") || input.NarrativeFunction.Primary == "delayed_reveal" {
		queries = append(queries, "角色发现真相前的延迟揭示", "delayed reveal before discovery")
	}
	if contains(input.Pattern, "foreground_obstruction") {
		queries = append(queries, "前景遮挡像被偷看一样的镜头", "foreground obstruction hidden observer shot")
	}
	if contains(input.Pattern, "slow_push_in") {
		queries = append(queries, "慢推近制造压迫感", "slow push in psychological pressure")
	}
	if contains(input.Intent, "isolate_character") {
		queries = append(queries, "角色孤独留白压迫", "isolate character with negative space")
	}
	return unique(queries)
}

func durationIntent(duration *float64) string {
	if duration != nil && *duration >= 8 {
		return "slow_viewer_down"
	}
	return "guide_attention"
}

func durationPattern(duration *float64) string {
	if duration != nil && *duration >= 8 {
		return "static_observation"
	}
	return "insert_detail"
}

func durationPreference(duration *float64) string {
	if duration != nil && *duration >= 8 {
		return "restrained_pacing"
	}
	return "compact_pacing"
}

func titleFromName(name string) string {
	base := strings.TrimSuffix(name, filepath.Ext(name))
	base = strings.NewReplacer("_", " ", "-", " ").Replace(base)
	base = strings.Join(strings.Fields(base), " ")
	if strings.TrimSpace(base) == "" {
		return "Untitled shot reference"
	}
	return base
}

func normalizedDuration(value *float64) *float64 {
	if value == nil || *value <= 0 {
		return nil
	}
	rounded := float64(int(*value*10+0.5)) / 10
	return &rounded
}

func buildSummary(title string, duration *float64, resolution string, intent []string, pattern []string) string {
	durationText := "video reference"
	if duration != nil {
		durationText = fmt.Sprintf("%s reference", formatDuration(*duration))
	}
	quality := ""
	if resolution != "" {
		quality = " at " + resolution
	}
	return fmt.Sprintf("%s is a %s%s; inferred intents include %s and reusable patterns include %s.", title, durationText, quality, strings.Join(firstN(intent, 2), ", "), strings.Join(firstN(pattern, 2), ", "))
}

func reusablePrinciple(intent []string, pattern []string) string {
	if len(pattern) == 0 {
		return "Use this reference as a visual mood and execution anchor."
	}
	return fmt.Sprintf("Reuse %s when the scene needs %s.", pattern[0], strings.Join(firstN(intent, 2), " / "))
}

func groupFromModel(input *persistencemodel.ShotReferenceGroup) *ShotReferenceGroup {
	if input == nil || input.ID == 0 {
		return nil
	}
	group := GroupFromModel(*input)
	return &group
}

func buildRetrievalText(reference ShotReference) string {
	resourceName := ""
	if reference.Resource != nil {
		resourceName = reference.Resource.Name
	}
	return strings.Join(compact([]string{
		reference.Title,
		reference.Summary,
		strings.Join(reference.Intent, " "),
		strings.Join(reference.Pattern, " "),
		strings.Join(reference.ShotFunction, " "),
		strings.Join(reference.VisualPreference, " "),
		strings.Join(reference.EmotionalEffect, " "),
		resourceName,
	}), " ")
}

func cleanValues(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return unique(result)
}

func cleanStringMap(values map[string]string) map[string]string {
	result := map[string]string{}
	for key, value := range values {
		cleanKey := strings.TrimSpace(key)
		cleanValue := strings.TrimSpace(value)
		if cleanKey != "" && cleanValue != "" {
			result[cleanKey] = cleanValue
		}
	}
	return result
}

func defaultAnalysisSource(value string) string {
	if strings.TrimSpace(value) == "" {
		return "manual"
	}
	return value
}

func readStringArray(value string) []string {
	var result []string
	if err := json.Unmarshal([]byte(value), &result); err != nil {
		return []string{}
	}
	return result
}

func readExecutionDetails(value string) ExecutionDetails {
	var result ExecutionDetails
	_ = json.Unmarshal([]byte(value), &result)
	return result
}

func readVisualAnalysis(value string) VisualAnalysis {
	var result VisualAnalysis
	_ = json.Unmarshal([]byte(value), &result)
	return result
}

func readSceneSemantics(value string) SceneSemantics {
	var result SceneSemantics
	_ = json.Unmarshal([]byte(value), &result)
	return result
}

func readNarrativeFunction(value string) NarrativeFunction {
	var result NarrativeFunction
	_ = json.Unmarshal([]byte(value), &result)
	return result
}

func readEmotionalProfile(value string) EmotionalProfile {
	var result EmotionalProfile
	_ = json.Unmarshal([]byte(value), &result)
	return result
}

func readReusablePattern(value string) ReusablePattern {
	var result ReusablePattern
	_ = json.Unmarshal([]byte(value), &result)
	return result
}

func readSearchIndex(value string) SearchIndex {
	var result SearchIndex
	_ = json.Unmarshal([]byte(value), &result)
	return result
}

func writeJSON(value any, fallback string) string {
	data, err := json.Marshal(value)
	if err != nil {
		return fallback
	}
	return string(data)
}

func formatDuration(value float64) string {
	if value < 60 {
		return fmt.Sprintf("%.0fs", value)
	}
	minutes := int(value) / 60
	seconds := int(value) % 60
	return fmt.Sprintf("%dm %ds", minutes, seconds)
}

func aspectRatioLabel(width, height int) string {
	if width <= 0 || height <= 0 {
		return ""
	}
	if width > height {
		return "landscape_frame"
	}
	if height > width {
		return "vertical_frame"
	}
	return "square_frame"
}

func formatAspectRatio(width, height int) string {
	divisor := gcd(width, height)
	return fmt.Sprintf("%d:%d", width/divisor, height/divisor)
}

func gcd(a, b int) int {
	if b == 0 {
		return a
	}
	return gcd(b, a%b)
}

func firstN(values []string, limit int) []string {
	if len(values) <= limit {
		return values
	}
	return values[:limit]
}

func firstValue(values []string, fallback string) string {
	if len(values) == 0 {
		return fallback
	}
	return values[0]
}

func resourceName(reference ShotReference) string {
	if reference.Resource == nil {
		return ""
	}
	return reference.Resource.Name
}

func compact(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			result = append(result, value)
		}
	}
	return result
}

func unique(values []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

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
	DurationSec *float64 `json:"duration_sec,omitempty"`
	Resolution  string   `json:"resolution,omitempty"`
	AspectRatio string   `json:"aspect_ratio,omitempty"`
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
	Title               *string
	Summary             *string
	Intent              []string
	IntentSet           bool
	Pattern             []string
	PatternSet          bool
	ShotFunction        []string
	ShotFunctionSet     bool
	VisualPreference    []string
	VisualPreferenceSet bool
	EmotionalEffect     []string
	EmotionalEffectSet  bool
	StartSec            *float64
	StartSecSet         bool
	EndSec              *float64
	EndSecSet           bool
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
	retrievalText := strings.Join(compact([]string{
		title,
		summary,
		strings.Join(intent, " "),
		strings.Join(pattern, " "),
		strings.Join(shotFunction, " "),
		strings.Join(visualPreference, " "),
		strings.Join(emotionalEffect, " "),
		resource.Name,
	}), " ")

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
		RetrievalText:      retrievalText,
		MachineDescription: summary,
		ReusablePrinciple:  reusablePrinciple(intent, pattern),
	}
}

func FromModel(input persistencemodel.ShotReference) ShotReference {
	var resource *domainresource.RawResource
	if input.Resource.ID != 0 {
		r := domainresource.RawResourceFromModel(input.Resource)
		resource = &r
	}
	return ShotReference{
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
		RetrievalText:      input.RetrievalText,
		MachineDescription: input.MachineDesc,
		ReusablePrinciple:  input.ReusablePrinciple,
		CreatedAt:          input.CreatedAt,
		UpdatedAt:          input.UpdatedAt,
	}
}

func (reference ShotReference) ToModel() persistencemodel.ShotReference {
	model := persistencemodel.ShotReference{
		OwnerID:           reference.OwnerID,
		OrgID:             reference.OrgID,
		GroupID:           reference.GroupID,
		ResourceID:        reference.ResourceID,
		Order:             reference.Order,
		StartSec:          reference.StartSec,
		EndSec:            reference.EndSec,
		Title:             reference.Title,
		Summary:           reference.Summary,
		AnalysisStatus:    reference.AnalysisStatus,
		AnalysisSource:    defaultAnalysisSource(reference.AnalysisSource),
		IntentJSON:        writeJSON(reference.Intent, "[]"),
		PatternJSON:       writeJSON(reference.Pattern, "[]"),
		ShotFunctionJSON:  writeJSON(reference.ShotFunction, "[]"),
		VisualPrefJSON:    writeJSON(reference.VisualPreference, "[]"),
		EmotionalJSON:     writeJSON(reference.EmotionalEffect, "[]"),
		ExecutionJSON:     writeJSON(reference.ExecutionDetails, "{}"),
		RetrievalText:     reference.RetrievalText,
		MachineDesc:       reference.MachineDescription,
		ReusablePrinciple: reference.ReusablePrinciple,
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
	if strings.TrimSpace(reference.Title) == "" {
		reference.Title = "Untitled shot reference"
	}
	reference.AnalysisSource = "manual"
	reference.RetrievalText = buildRetrievalText(reference)
	reference.MachineDescription = reference.Summary
	reference.ReusablePrinciple = reusablePrinciple(reference.Intent, reference.Pattern)
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

func matchHints(value string, hints []hint) []string {
	result := []string{}
	for _, h := range hints {
		if h.pattern.MatchString(value) {
			result = append(result, h.value)
		}
	}
	return result
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

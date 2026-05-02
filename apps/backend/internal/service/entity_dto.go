package service

import "github.com/movscript/movscript/internal/model"

type ProjectCreateInput struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	TotalEpisodes int    `json:"total_episodes"`
}

type ProjectUpdateInput struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	TotalEpisodes int    `json:"total_episodes"`
}

type ProjectMemberInput struct {
	UserID uint   `json:"user_id" binding:"required"`
	Role   string `json:"role"`
}

type UserCreateInput struct {
	Username string `json:"username" binding:"required"`
}

type AIModelConfigInput struct {
	ModelDefID            string  `json:"model_def_id" binding:"required"`
	ModelIDOverride       string  `json:"model_id_override"`
	IsEnabled             *bool   `json:"is_enabled"`
	Priority              int     `json:"priority"`
	CreditsInputPer1M     float64 `json:"credits_input_per_1m"`
	CreditsOutputPer1M    float64 `json:"credits_output_per_1m"`
	CreditsPerImage       float64 `json:"credits_per_image"`
	CreditsPerSecond      float64 `json:"credits_per_second"`
	CreditsPerCall        float64 `json:"credits_per_call"`
	CustomDisplayName     string  `json:"custom_display_name"`
	ShortName             string  `json:"short_name"`
	CustomCapabilities    string  `json:"custom_capabilities"`
	CustomBillingMode     string  `json:"custom_billing_mode"`
	CustomAcceptsImage    bool    `json:"custom_accepts_image"`
	CustomMaxInputImages  int     `json:"custom_max_input_images"`
	CustomMaxInputVideos  int     `json:"custom_max_input_videos"`
	CustomImageEditField  string  `json:"custom_image_edit_field"`
	CustomSupportedParams string  `json:"custom_supported_params"`
}

type ScriptInput struct {
	Title                  string `json:"title" binding:"required"`
	Description            string `json:"description"`
	Content                string `json:"content"`
	RawSource              string `json:"raw_source"`
	ScriptType             string `json:"script_type"`
	SourceType             string `json:"source_type"`
	Version                int    `json:"version"`
	ParentScriptID         *uint  `json:"parent_script_id"`
	AssigneeID             *uint  `json:"assignee_id"`
	Summary                string `json:"summary"`
	Characters             string `json:"characters"`
	CoreSettings           string `json:"core_settings"`
	Hook                   string `json:"hook"`
	PlotSummary            string `json:"plot_summary"`
	ScriptPoints           string `json:"script_points"`
	PlannedSceneCount      int    `json:"planned_scene_count"`
	PlannedCharacterCount  int    `json:"planned_character_count"`
	TimeText               string `json:"time_text"`
	LocationText           string `json:"location_text"`
	StructuredCharacters   string `json:"structured_characters"`
	PlotBeats              string `json:"plot_beats"`
	Atmosphere             string `json:"atmosphere"`
	StructureJSON          string `json:"structure_json"`
	EntityCandidates       string `json:"entity_candidates"`
	RelationshipCandidates string `json:"relationship_candidates"`
	Order                  int    `json:"order"`
}

type EpisodeInput struct {
	Title    string `json:"title" binding:"required"`
	Number   int    `json:"number"`
	Synopsis string `json:"synopsis"`
}

type SceneInput struct {
	Number int    `json:"number"`
	Title  string `json:"title"`
	Notes  string `json:"notes"`
}

type StoryboardInput struct {
	SceneID     *uint   `json:"scene_id"`
	EpisodeID   *uint   `json:"episode_id"`
	SettingID   *uint   `json:"setting_id"`
	AssigneeID  *uint   `json:"assignee_id"`
	Order       int     `json:"order"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Notes       string  `json:"notes"`
	Characters  string  `json:"characters"`
	Actions     string  `json:"actions"`
	Dialogue    string  `json:"dialogue"`
	Atmosphere  string  `json:"atmosphere"`
	Lighting    string  `json:"lighting"`
	Duration    float64 `json:"duration"`
	ShotSize    string  `json:"shot_size"`
	Angle       string  `json:"angle"`
	Movement    string  `json:"movement"`
	FocalLength string  `json:"focal_length"`
	Pacing      string  `json:"pacing"`
	Intent      string  `json:"intent"`
}

type ShotInput struct {
	StoryboardID *uint  `json:"storyboard_id"`
	AssigneeID   *uint  `json:"assignee_id"`
	Order        int    `json:"order"`
	Description  string `json:"description"`
	CanvasID     *uint  `json:"canvas_id"`
}

type FinalVideoInput struct {
	EpisodeID    *uint  `json:"episode_id"`
	SceneID      *uint  `json:"scene_id"`
	StoryboardID *uint  `json:"storyboard_id"`
	ShotID       *uint  `json:"shot_id"`
	Title        string `json:"title"`
	Description  string `json:"description"`
}

type AssetInput struct {
	Name                string `json:"name" binding:"required"`
	Type                string `json:"type"`
	ResourceID          *uint  `json:"resource_id"`
	Description         string `json:"description"`
	VariantType         string `json:"variant_type"`
	VariantName         string `json:"variant_name"`
	Costume             string `json:"costume"`
	TimeOfDay           string `json:"time_of_day"`
	Period              string `json:"period"`
	State               string `json:"state"`
	StyleProfile        string `json:"style_profile"`
	Prompt              string `json:"prompt"`
	NegativePrompt      string `json:"negative_prompt"`
	IsPrimary           bool   `json:"is_primary"`
	SettingID           *uint  `json:"setting_id"`
	FollowSettingStatus *bool  `json:"follow_setting_status"`
}

type SettingInput struct {
	ScriptID         *uint  `json:"script_id"`
	SourceScriptID   *uint  `json:"source_script_id"`
	SourceAnalysisID *uint  `json:"source_analysis_id"`
	Type             string `json:"type"`
	Name             string `json:"name" binding:"required"`
	Alias            string `json:"alias"`
	Description      string `json:"description"`
	Content          string `json:"content"`
	Status           string `json:"status"`
	Importance       string `json:"importance"`
	Tags             string `json:"tags"`
	StateTags        string `json:"state_tags"`
	ProfileJSON      string `json:"profile_json"`
}

type ScriptSettingRefInput struct {
	ScriptID     uint    `json:"script_id" binding:"required"`
	SettingID    uint    `json:"setting_id" binding:"required"`
	Role         string  `json:"role"`
	Scope        string  `json:"scope"`
	FirstMention string  `json:"first_mention"`
	Evidence     string  `json:"evidence"`
	Note         string  `json:"note"`
	Emotion      string  `json:"emotion"`
	State        string  `json:"state"`
	Purpose      string  `json:"purpose"`
	Order        int     `json:"order"`
	Confidence   float64 `json:"confidence"`
}

type SettingRelationshipInput struct {
	SourceSettingID uint   `json:"source_setting_id" binding:"required"`
	TargetSettingID uint   `json:"target_setting_id" binding:"required"`
	ScopeScriptID   *uint  `json:"scope_script_id"`
	Category        string `json:"category"`
	Type            string `json:"type"`
	Label           string `json:"label"`
	Description     string `json:"description"`
}

func NewProject(in ProjectCreateInput, ownerID uint) model.Project {
	return model.Project{
		Name:          in.Name,
		Description:   in.Description,
		OwnerID:       ownerID,
		TotalEpisodes: in.TotalEpisodes,
	}
}

func NewUser(in UserCreateInput) model.User {
	return model.User{Username: in.Username}
}

func NewAIModelConfig(in AIModelConfigInput, credentialID uint) model.AIModelConfig {
	cfg := model.AIModelConfig{CredentialID: credentialID}
	ApplyAIModelConfigInput(&cfg, in)
	if in.IsEnabled == nil {
		cfg.IsEnabled = true
	}
	return cfg
}

func ApplyAIModelConfigInput(cfg *model.AIModelConfig, in AIModelConfigInput) {
	cfg.ModelDefID = in.ModelDefID
	cfg.ModelIDOverride = in.ModelIDOverride
	cfg.Priority = in.Priority
	cfg.CreditsInputPer1M = in.CreditsInputPer1M
	cfg.CreditsOutputPer1M = in.CreditsOutputPer1M
	cfg.CreditsPerImage = in.CreditsPerImage
	cfg.CreditsPerSecond = in.CreditsPerSecond
	cfg.CreditsPerCall = in.CreditsPerCall
	cfg.CustomDisplayName = in.CustomDisplayName
	cfg.ShortName = in.ShortName
	cfg.CustomCapabilities = in.CustomCapabilities
	cfg.CustomBillingMode = in.CustomBillingMode
	cfg.CustomAcceptsImage = in.CustomAcceptsImage
	cfg.CustomMaxInputImages = in.CustomMaxInputImages
	cfg.CustomMaxInputVideos = in.CustomMaxInputVideos
	cfg.CustomImageEditField = in.CustomImageEditField
	cfg.CustomSupportedParams = in.CustomSupportedParams
	if in.IsEnabled != nil {
		cfg.IsEnabled = *in.IsEnabled
	}
}

func ApplyProjectUpdate(p *model.Project, in ProjectUpdateInput) {
	p.Name = in.Name
	p.Description = in.Description
	p.TotalEpisodes = in.TotalEpisodes
}

func ApplyScriptInput(s *model.Script, in ScriptInput) {
	s.Title = in.Title
	s.Description = in.Description
	s.Content = in.Content
	s.RawSource = in.RawSource
	s.ScriptType = in.ScriptType
	s.SourceType = in.SourceType
	s.Version = in.Version
	s.ParentScriptID = in.ParentScriptID
	s.AssigneeID = in.AssigneeID
	s.Summary = in.Summary
	s.Characters = in.Characters
	s.CoreSettings = in.CoreSettings
	s.Hook = in.Hook
	s.PlotSummary = in.PlotSummary
	s.ScriptPoints = in.ScriptPoints
	s.PlannedSceneCount = in.PlannedSceneCount
	s.PlannedCharacterCount = in.PlannedCharacterCount
	s.TimeText = in.TimeText
	s.LocationText = in.LocationText
	s.StructuredCharacters = in.StructuredCharacters
	s.PlotBeats = in.PlotBeats
	s.Atmosphere = in.Atmosphere
	s.StructureJSON = in.StructureJSON
	s.EntityCandidates = in.EntityCandidates
	s.RelationshipCandidates = in.RelationshipCandidates
	s.Order = in.Order
}

func ApplyEpisodeInput(e *model.Episode, in EpisodeInput) {
	e.Title = in.Title
	e.Number = in.Number
	e.Synopsis = in.Synopsis
}

func ApplySceneInput(s *model.Scene, in SceneInput) {
	s.Number = in.Number
	s.Title = in.Title
	s.Notes = in.Notes
}

func ApplyStoryboardInput(b *model.Storyboard, in StoryboardInput) {
	b.SceneID = in.SceneID
	b.EpisodeID = in.EpisodeID
	b.SettingID = in.SettingID
	b.AssigneeID = in.AssigneeID
	b.Order = in.Order
	b.Title = in.Title
	b.Description = in.Description
	b.Notes = in.Notes
	b.Characters = in.Characters
	b.Actions = in.Actions
	b.Dialogue = in.Dialogue
	b.Atmosphere = in.Atmosphere
	b.Lighting = in.Lighting
	b.Duration = in.Duration
	b.ShotSize = in.ShotSize
	b.Angle = in.Angle
	b.Movement = in.Movement
	b.FocalLength = in.FocalLength
	b.Pacing = in.Pacing
	b.Intent = in.Intent
}

func ApplyShotInput(s *model.Shot, in ShotInput) {
	s.StoryboardID = in.StoryboardID
	s.AssigneeID = in.AssigneeID
	s.Order = in.Order
	s.Description = in.Description
	s.CanvasID = in.CanvasID
}

func ApplyFinalVideoInput(v *model.FinalVideo, in FinalVideoInput) {
	v.EpisodeID = in.EpisodeID
	v.SceneID = in.SceneID
	v.StoryboardID = in.StoryboardID
	v.ShotID = in.ShotID
	v.Title = in.Title
	v.Description = in.Description
}

func ApplyAssetInput(a *model.Asset, in AssetInput) {
	a.Name = in.Name
	a.Type = in.Type
	if a.Type == "" {
		a.Type = in.VariantType
	}
	a.ResourceID = in.ResourceID
	a.Description = in.Description
	a.VariantType = in.VariantType
	a.VariantName = in.VariantName
	a.Costume = in.Costume
	a.TimeOfDay = in.TimeOfDay
	a.Period = in.Period
	a.State = in.State
	a.StyleProfile = in.StyleProfile
	a.Prompt = in.Prompt
	a.NegativePrompt = in.NegativePrompt
	a.IsPrimary = in.IsPrimary
	a.SettingID = in.SettingID
	if in.FollowSettingStatus != nil {
		a.FollowSettingStatus = *in.FollowSettingStatus
	} else if a.ID == 0 {
		a.FollowSettingStatus = true
	}
}

func ApplySettingInput(s *model.Setting, in SettingInput) {
	s.ScriptID = in.ScriptID
	s.SourceScriptID = in.SourceScriptID
	s.SourceAnalysisID = in.SourceAnalysisID
	s.Type = in.Type
	s.Name = in.Name
	s.Alias = in.Alias
	s.Description = in.Description
	s.Content = in.Content
	s.Status = in.Status
	s.Importance = in.Importance
	s.Tags = in.Tags
	s.StateTags = in.StateTags
	s.ProfileJSON = in.ProfileJSON
}

func ApplyScriptSettingRefInput(ref *model.ScriptSettingRef, in ScriptSettingRefInput) {
	ref.ScriptID = in.ScriptID
	ref.SettingID = in.SettingID
	ref.Role = in.Role
	ref.Scope = in.Scope
	ref.FirstMention = in.FirstMention
	ref.Evidence = in.Evidence
	ref.Note = in.Note
	ref.Emotion = in.Emotion
	ref.State = in.State
	ref.Purpose = in.Purpose
	ref.Order = in.Order
	ref.Confidence = in.Confidence
}

func ApplySettingRelationshipInput(r *model.SettingRelationship, in SettingRelationshipInput) {
	r.SourceSettingID = in.SourceSettingID
	r.TargetSettingID = in.TargetSettingID
	r.ScopeScriptID = in.ScopeScriptID
	r.Category = in.Category
	r.Type = in.Type
	r.Label = in.Label
	r.Description = in.Description
}

var projectPatchFields = stringSet("name", "description", "total_episodes")
var scriptPatchFields = stringSet("title", "description", "content", "raw_source", "script_type", "source_type", "version", "parent_script_id", "assignee_id", "summary", "characters", "core_settings", "hook", "plot_summary", "script_points", "planned_scene_count", "time_text", "location_text", "structured_characters", "plot_beats", "atmosphere", "structure_json", "entity_candidates", "relationship_candidates", "order")
var episodePatchFields = stringSet("title", "number", "synopsis", "script_id")
var scenePatchFields = stringSet("number", "title", "notes", "script_id")
var storyboardPatchFields = stringSet("scene_id", "episode_id", "setting_id", "assignee_id", "order", "title", "description", "notes", "characters", "actions", "dialogue", "atmosphere", "lighting", "duration", "shot_size", "angle", "movement", "focal_length", "pacing", "intent")
var shotPatchFields = stringSet("storyboard_id", "assignee_id", "order", "description", "canvas_id")
var finalVideoPatchFields = stringSet("episode_id", "scene_id", "storyboard_id", "shot_id", "title", "description")
var assetPatchFields = stringSet("name", "type", "resource_id", "description", "variant_type", "variant_name", "costume", "time_of_day", "period", "state", "style_profile", "prompt", "negative_prompt", "is_primary", "setting_id", "follow_setting_status")

func ProjectPatchUpdates(body map[string]any) map[string]any {
	return allowPatchFields(body, projectPatchFields)
}

func ScriptPatchUpdates(body map[string]any) map[string]any {
	return allowPatchFields(body, scriptPatchFields)
}

func EpisodePatchUpdates(body map[string]any) map[string]any {
	return allowPatchFields(body, episodePatchFields)
}

func ScenePatchUpdates(body map[string]any) map[string]any {
	return allowPatchFields(body, scenePatchFields)
}

func StoryboardPatchUpdates(body map[string]any) map[string]any {
	return allowPatchFields(body, storyboardPatchFields)
}

func ShotPatchUpdates(body map[string]any) map[string]any {
	return allowPatchFields(body, shotPatchFields)
}

func FinalVideoPatchUpdates(body map[string]any) map[string]any {
	return allowPatchFields(body, finalVideoPatchFields)
}

func AssetPatchUpdates(body map[string]any) map[string]any {
	return allowPatchFields(body, assetPatchFields)
}

func allowPatchFields(body map[string]any, allowed map[string]struct{}) map[string]any {
	updates := make(map[string]any, len(body))
	for key, value := range body {
		if _, ok := allowed[key]; ok {
			updates[key] = value
		}
	}
	return updates
}

func stringSet(values ...string) map[string]struct{} {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		set[value] = struct{}{}
	}
	return set
}

package dto

import "github.com/movscript/movscript/internal/domain/model"

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
	CharacterRelationships string `json:"character_relationships"`
	CoreSettings           string `json:"core_settings"`
	Background             string `json:"background"`
	ScenesDesc             string `json:"scenes_desc"`
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
	s.CharacterRelationships = in.CharacterRelationships
	s.CoreSettings = in.CoreSettings
	s.Background = in.Background
	s.ScenesDesc = in.ScenesDesc
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

var projectPatchFields = stringSet("name", "description", "total_episodes")
var scriptPatchFields = stringSet("title", "description", "content", "raw_source", "script_type", "source_type", "version", "parent_script_id", "assignee_id", "summary", "characters", "character_relationships", "core_settings", "background", "scenes_desc", "hook", "plot_summary", "script_points", "planned_scene_count", "time_text", "location_text", "structured_characters", "plot_beats", "atmosphere", "structure_json", "entity_candidates", "relationship_candidates", "order")

func ProjectPatchUpdates(body map[string]any) map[string]any {
	return allowPatchFields(body, projectPatchFields)
}

func ScriptPatchUpdates(body map[string]any) map[string]any {
	return allowPatchFields(body, scriptPatchFields)
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

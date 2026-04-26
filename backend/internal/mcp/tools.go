package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

// Tool is a callable skill.
type Tool struct {
	Definition ToolDefinition
	Handler    func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult
}

// Registry holds all registered tools.
type Registry struct {
	tools map[string]Tool
}

func NewRegistry(db *gorm.DB) *Registry {
	r := &Registry{tools: make(map[string]Tool)}
	r.register(projectTools()...)
	r.register(scriptTools()...)
	r.register(episodeTools()...)
	r.register(sceneTools()...)
	r.register(storyboardTools()...)
	r.register(shotTools()...)
	r.register(assetTools()...)
	return r
}

func (r *Registry) register(tools ...Tool) {
	for _, t := range tools {
		r.tools[t.Definition.Name] = t
	}
}

func (r *Registry) List() []ToolDefinition {
	out := make([]ToolDefinition, 0, len(r.tools))
	for _, t := range r.tools {
		out = append(out, t.Definition)
	}
	return out
}

func (r *Registry) Call(ctx context.Context, name string, args json.RawMessage, db *gorm.DB) ToolCallResult {
	t, ok := r.tools[name]
	if !ok {
		return errResult(fmt.Sprintf("unknown tool: %s", name))
	}
	return t.Handler(ctx, args, db)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func toJSON(v any) string {
	b, _ := json.MarshalIndent(v, "", "  ")
	return string(b)
}

func parseArg[T any](raw json.RawMessage, dst *T) error {
	if len(raw) == 0 {
		return nil
	}
	return json.Unmarshal(raw, dst)
}

// ── Project tools ─────────────────────────────────────────────────────────────

func projectTools() []Tool {
	return []Tool{
		{
			Definition: ToolDefinition{
				Name:        "list_projects",
				Description: "List all projects in the system. Returns project IDs, names, descriptions, and status.",
				InputSchema: InputSchema{Type: "object", Properties: map[string]Property{}},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var projects []model.Project
				db.Preload("Owner").Find(&projects)
				type row struct {
					ID          uint   `json:"id"`
					Name        string `json:"name"`
					Description string `json:"description"`
					Status      string `json:"status"`
					OwnerName   string `json:"owner_name"`
					CreatedAt   string `json:"created_at"`
				}
				rows := make([]row, len(projects))
				for i, p := range projects {
					ownerName := p.Owner.Username
					rows[i] = row{
						ID:          p.ID,
						Name:        p.Name,
						Description: p.Description,
						Status:      p.Status,
						OwnerName:   ownerName,
						CreatedAt:   p.CreatedAt.Format(time.RFC3339),
					}
				}
				return textResult(toJSON(rows))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "get_project",
				Description: "Get detailed information about a specific project, including member count, scripts, and episodes.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"project_id": {Type: "number", Description: "The project ID"},
					},
					Required: []string{"project_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct{ ProjectID uint `json:"project_id"` }
				if err := parseArg(args, &a); err != nil || a.ProjectID == 0 {
					return errResult("project_id required")
				}
				var p model.Project
				if err := db.Preload("Owner").Preload("Members").First(&p, a.ProjectID).Error; err != nil {
					return errResult(fmt.Sprintf("project %d not found", a.ProjectID))
				}
				var scriptCount, episodeCount, sceneCount int64
				db.Model(&model.Script{}).Where("project_id = ?", p.ID).Count(&scriptCount)
				db.Model(&model.Episode{}).Where("project_id = ?", p.ID).Count(&episodeCount)
				db.Model(&model.Scene{}).Where("project_id = ?", p.ID).Count(&sceneCount)
				result := map[string]any{
					"id": p.ID, "name": p.Name, "description": p.Description,
					"status": p.Status, "script_count": scriptCount,
					"episode_count": episodeCount, "scene_count": sceneCount,
					"member_count": len(p.Members),
					"created_at":   p.CreatedAt.Format(time.RFC3339),
				}
				return textResult(toJSON(result))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "create_project",
				Description: "Create a new project.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"name":        {Type: "string", Description: "Project name"},
						"description": {Type: "string", Description: "Project description"},
						"owner_id":    {Type: "number", Description: "Owner user ID"},
					},
					Required: []string{"name", "owner_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct {
					Name        string `json:"name"`
					Description string `json:"description"`
					OwnerID     uint   `json:"owner_id"`
				}
				if err := parseArg(args, &a); err != nil || a.Name == "" || a.OwnerID == 0 {
					return errResult("name and owner_id required")
				}
				p := model.Project{Name: a.Name, Description: a.Description, OwnerID: a.OwnerID}
				if err := db.Create(&p).Error; err != nil {
					return errResult(err.Error())
				}
				// Auto-add owner as member
				db.Create(&model.ProjectMember{ProjectID: p.ID, UserID: a.OwnerID, Role: "owner"})
				return textResult(fmt.Sprintf(`{"id":%d,"name":"%s","message":"created"}`, p.ID, p.Name))
			},
		},
	}
}

// ── Script tools ──────────────────────────────────────────────────────────────

func scriptTools() []Tool {
	return []Tool{
		{
			Definition: ToolDefinition{
				Name:        "list_scripts",
				Description: "List all scripts in a project. Scripts can be main scripts, episode scripts, or settings (character/scene/background).",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"project_id": {Type: "number", Description: "Project ID"},
					},
					Required: []string{"project_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct{ ProjectID uint `json:"project_id"` }
				if err := parseArg(args, &a); err != nil || a.ProjectID == 0 {
					return errResult("project_id required")
				}
				var scripts []model.Script
				db.Where("project_id = ?", a.ProjectID).Order("\"order\"").Find(&scripts)
				type row struct {
					ID          uint   `json:"id"`
					Title       string `json:"title"`
					ScriptType  string `json:"script_type"`
					Status      string `json:"status"`
					Description string `json:"description"`
				}
				rows := make([]row, len(scripts))
				for i, s := range scripts {
					rows[i] = row{ID: s.ID, Title: s.Title, ScriptType: s.ScriptType, Status: s.Status, Description: s.Description}
				}
				return textResult(toJSON(rows))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "get_script",
				Description: "Get the full content of a script including characters, settings, and scene descriptions.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"script_id": {Type: "number", Description: "Script ID"},
					},
					Required: []string{"script_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct{ ScriptID uint `json:"script_id"` }
				if err := parseArg(args, &a); err != nil || a.ScriptID == 0 {
					return errResult("script_id required")
				}
				var s model.Script
				if err := db.First(&s, a.ScriptID).Error; err != nil {
					return errResult(fmt.Sprintf("script %d not found", a.ScriptID))
				}
				return textResult(toJSON(s))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "update_script",
				Description: "Update a script's content, summary, characters, or other fields.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"script_id":     {Type: "number", Description: "Script ID"},
						"title":         {Type: "string", Description: "New title (optional)"},
						"content":       {Type: "string", Description: "Full script body text (optional)"},
						"summary":       {Type: "string", Description: "Script summary (optional)"},
						"characters":    {Type: "string", Description: "Characters description (optional)"},
						"core_settings": {Type: "string", Description: "Core world settings (optional)"},
						"background":    {Type: "string", Description: "Background/world-building (optional)"},
						"scenes_desc":   {Type: "string", Description: "Scene descriptions overview (optional)"},
					},
					Required: []string{"script_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct {
					ScriptID     uint   `json:"script_id"`
					Title        string `json:"title"`
					Content      string `json:"content"`
					Summary      string `json:"summary"`
					Characters   string `json:"characters"`
					CoreSettings string `json:"core_settings"`
					Background   string `json:"background"`
					ScenesDesc   string `json:"scenes_desc"`
				}
				if err := parseArg(args, &a); err != nil || a.ScriptID == 0 {
					return errResult("script_id required")
				}
				var s model.Script
				if err := db.First(&s, a.ScriptID).Error; err != nil {
					return errResult(fmt.Sprintf("script %d not found", a.ScriptID))
				}
				updates := map[string]any{}
				if a.Title != "" {
					updates["title"] = a.Title
				}
				if a.Content != "" {
					updates["content"] = a.Content
				}
				if a.Summary != "" {
					updates["summary"] = a.Summary
				}
				if a.Characters != "" {
					updates["characters"] = a.Characters
				}
				if a.CoreSettings != "" {
					updates["core_settings"] = a.CoreSettings
				}
				if a.Background != "" {
					updates["background"] = a.Background
				}
				if a.ScenesDesc != "" {
					updates["scenes_desc"] = a.ScenesDesc
				}
				if len(updates) == 0 {
					return errResult("no fields to update")
				}
				db.Model(&s).Updates(updates)
				return textResult(fmt.Sprintf(`{"id":%d,"message":"updated"}`, s.ID))
			},
		},
	}
}

// ── Episode tools ─────────────────────────────────────────────────────────────

func episodeTools() []Tool {
	return []Tool{
		{
			Definition: ToolDefinition{
				Name:        "list_episodes",
				Description: "List all episodes in a project with their status.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"project_id": {Type: "number", Description: "Project ID"},
					},
					Required: []string{"project_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct{ ProjectID uint `json:"project_id"` }
				if err := parseArg(args, &a); err != nil || a.ProjectID == 0 {
					return errResult("project_id required")
				}
				var episodes []model.Episode
				db.Where("project_id = ?", a.ProjectID).Order("number").Find(&episodes)
				type row struct {
					ID       uint   `json:"id"`
					Title    string `json:"title"`
					Status   string `json:"status"`
					Number   int    `json:"number"`
					Synopsis string `json:"synopsis"`
				}
				rows := make([]row, len(episodes))
				for i, e := range episodes {
					rows[i] = row{ID: e.ID, Title: e.Title, Status: e.Status, Number: e.Number, Synopsis: e.Synopsis}
				}
				return textResult(toJSON(rows))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "update_episode",
				Description: "Update an episode's title, synopsis, or status.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"episode_id": {Type: "number", Description: "Episode ID"},
						"title":      {Type: "string", Description: "New title (optional)"},
						"synopsis":   {Type: "string", Description: "Episode synopsis (optional)"},
						"status": {Type: "string", Description: "New status: draft|scripted|storyboarded|generating|editing|done (optional)",
							Enum: []any{"draft", "scripted", "storyboarded", "generating", "editing", "done"}},
					},
					Required: []string{"episode_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct {
					EpisodeID uint   `json:"episode_id"`
					Title     string `json:"title"`
					Synopsis  string `json:"synopsis"`
					Status    string `json:"status"`
				}
				if err := parseArg(args, &a); err != nil || a.EpisodeID == 0 {
					return errResult("episode_id required")
				}
				updates := map[string]any{}
				if a.Title != "" {
					updates["title"] = a.Title
				}
				if a.Synopsis != "" {
					updates["synopsis"] = a.Synopsis
				}
				if a.Status != "" {
					updates["status"] = a.Status
				}
				if len(updates) == 0 {
					return errResult("no fields to update")
				}
				db.Model(&model.Episode{}).Where("id = ?", a.EpisodeID).Updates(updates)
				return textResult(fmt.Sprintf(`{"id":%d,"message":"updated"}`, a.EpisodeID))
			},
		},
	}
}

// ── Scene tools ───────────────────────────────────────────────────────────────

func sceneTools() []Tool {
	return []Tool{
		{
			Definition: ToolDefinition{
				Name:        "list_scenes",
				Description: "List all scenes in a project with their location and notes.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"project_id": {Type: "number", Description: "Project ID"},
					},
					Required: []string{"project_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct{ ProjectID uint `json:"project_id"` }
				if err := parseArg(args, &a); err != nil || a.ProjectID == 0 {
					return errResult("project_id required")
				}
				var scenes []model.Scene
				db.Where("project_id = ?", a.ProjectID).Order("number").Find(&scenes)
				type row struct {
					ID       uint   `json:"id"`
					Number   int    `json:"number"`
					Title    string `json:"title"`
					Location string `json:"location"`
					Notes    string `json:"notes"`
				}
				rows := make([]row, len(scenes))
				for i, s := range scenes {
					rows[i] = row{ID: s.ID, Number: s.Number, Title: s.Title, Location: s.Location, Notes: s.Notes}
				}
				return textResult(toJSON(rows))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "update_scene",
				Description: "Update a scene's title, location, or notes.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"scene_id": {Type: "number", Description: "Scene ID"},
						"title":    {Type: "string", Description: "New title (optional)"},
						"location": {Type: "string", Description: "Shooting location (optional)"},
						"notes":    {Type: "string", Description: "Director's notes (optional)"},
					},
					Required: []string{"scene_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct {
					SceneID  uint   `json:"scene_id"`
					Title    string `json:"title"`
					Location string `json:"location"`
					Notes    string `json:"notes"`
				}
				if err := parseArg(args, &a); err != nil || a.SceneID == 0 {
					return errResult("scene_id required")
				}
				updates := map[string]any{}
				if a.Title != "" {
					updates["title"] = a.Title
				}
				if a.Location != "" {
					updates["location"] = a.Location
				}
				if a.Notes != "" {
					updates["notes"] = a.Notes
				}
				if len(updates) == 0 {
					return errResult("no fields to update")
				}
				db.Model(&model.Scene{}).Where("id = ?", a.SceneID).Updates(updates)
				return textResult(fmt.Sprintf(`{"id":%d,"message":"updated"}`, a.SceneID))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "create_scene",
				Description: "Create a new scene in a project.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"project_id": {Type: "number", Description: "Project ID"},
						"title":      {Type: "string", Description: "Scene title"},
						"location":   {Type: "string", Description: "Shooting location"},
						"notes":      {Type: "string", Description: "Director's notes"},
					},
					Required: []string{"project_id", "title"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct {
					ProjectID uint   `json:"project_id"`
					Title     string `json:"title"`
					Location  string `json:"location"`
					Notes     string `json:"notes"`
				}
				if err := parseArg(args, &a); err != nil || a.ProjectID == 0 || a.Title == "" {
					return errResult("project_id and title required")
				}
				var maxNum int
				db.Model(&model.Scene{}).Where("project_id = ?", a.ProjectID).
					Select("COALESCE(MAX(number), 0)").Scan(&maxNum)
				s := model.Scene{
					ProjectID: a.ProjectID,
					Number:    maxNum + 1,
					Title:     a.Title,
					Location:  a.Location,
					Notes:     a.Notes,
				}
				if err := db.Create(&s).Error; err != nil {
					return errResult(err.Error())
				}
				return textResult(fmt.Sprintf(`{"id":%d,"number":%d,"message":"created"}`, s.ID, s.Number))
			},
		},
	}
}

// ── Storyboard tools ──────────────────────────────────────────────────────────

func storyboardTools() []Tool {
	return []Tool{
		{
			Definition: ToolDefinition{
				Name:        "list_storyboards",
				Description: "List all storyboards for a scene.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"scene_id": {Type: "number", Description: "Scene ID"},
					},
					Required: []string{"scene_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct{ SceneID uint `json:"scene_id"` }
				if err := parseArg(args, &a); err != nil || a.SceneID == 0 {
					return errResult("scene_id required")
				}
				var sbs []model.Storyboard
				db.Where("scene_id = ?", a.SceneID).Order("\"order\", id").Find(&sbs)
				type row struct {
					ID             uint    `json:"id"`
					Title          string  `json:"title"`
					Characters     string  `json:"characters"`
					Actions        string  `json:"actions"`
					Dialogue       string  `json:"dialogue"`
					Atmosphere     string  `json:"atmosphere"`
					CameraAngle    string  `json:"camera_angle"`
					CameraMovement string  `json:"camera_movement"`
					Lighting       string  `json:"lighting"`
					Duration       float64 `json:"duration"`
					Status         string  `json:"status"`
				}
				rows := make([]row, len(sbs))
				for i, sb := range sbs {
					rows[i] = row{
						ID: sb.ID, Title: sb.Title, Characters: sb.Characters, Actions: sb.Actions,
						Dialogue: sb.Dialogue, Atmosphere: sb.Atmosphere,
						CameraAngle: sb.CameraAngle, CameraMovement: sb.CameraMovement,
						Lighting: sb.Lighting, Duration: sb.Duration, Status: sb.Status,
					}
				}
				return textResult(toJSON(rows))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "create_storyboard",
				Description: "Create a new storyboard panel for a scene.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"project_id":      {Type: "number", Description: "Project ID"},
						"scene_id":        {Type: "number", Description: "Scene ID (optional)"},
						"title":           {Type: "string", Description: "Storyboard title"},
						"characters":      {Type: "string", Description: "Characters in this panel"},
						"actions":         {Type: "string", Description: "Character actions and blocking"},
						"dialogue":        {Type: "string", Description: "Spoken dialogue"},
						"atmosphere":      {Type: "string", Description: "Mood, lighting, visual notes"},
						"camera_angle":    {Type: "string", Description: "Camera angle"},
						"camera_movement": {Type: "string", Description: "Camera movement"},
						"lighting":        {Type: "string", Description: "Lighting description"},
					},
					Required: []string{"project_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct {
					ProjectID      uint   `json:"project_id"`
					SceneID        uint   `json:"scene_id"`
					Title          string `json:"title"`
					Characters     string `json:"characters"`
					Actions        string `json:"actions"`
					Dialogue       string `json:"dialogue"`
					Atmosphere     string `json:"atmosphere"`
					CameraAngle    string `json:"camera_angle"`
					CameraMovement string `json:"camera_movement"`
					Lighting       string `json:"lighting"`
				}
				if err := parseArg(args, &a); err != nil || a.ProjectID == 0 {
					return errResult("project_id required")
				}
				sb := model.Storyboard{
					ProjectID:      a.ProjectID,
					Title:          a.Title,
					Characters:     a.Characters,
					Actions:        a.Actions,
					Dialogue:       a.Dialogue,
					Atmosphere:     a.Atmosphere,
					CameraAngle:    a.CameraAngle,
					CameraMovement: a.CameraMovement,
					Lighting:       a.Lighting,
					Status:         "draft",
				}
				if a.SceneID != 0 {
					sb.SceneID = &a.SceneID
				}
				if err := db.Create(&sb).Error; err != nil {
					return errResult(err.Error())
				}
				return textResult(fmt.Sprintf(`{"id":%d,"message":"created"}`, sb.ID))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "update_storyboard",
				Description: "Update a storyboard's content or status.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"storyboard_id": {Type: "number", Description: "Storyboard ID"},
						"characters":    {Type: "string", Description: "Characters (optional)"},
						"actions":       {Type: "string", Description: "Actions and blocking (optional)"},
						"dialogue":      {Type: "string", Description: "Dialogue (optional)"},
						"atmosphere":    {Type: "string", Description: "Atmosphere/notes (optional)"},
						"status": {Type: "string", Description: "Status: draft|approved (optional)",
							Enum: []any{"draft", "approved"}},
					},
					Required: []string{"storyboard_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct {
					StoryboardID uint   `json:"storyboard_id"`
					Characters   string `json:"characters"`
					Actions      string `json:"actions"`
					Dialogue     string `json:"dialogue"`
					Atmosphere   string `json:"atmosphere"`
					Status       string `json:"status"`
				}
				if err := parseArg(args, &a); err != nil || a.StoryboardID == 0 {
					return errResult("storyboard_id required")
				}
				updates := map[string]any{}
				if a.Characters != "" {
					updates["characters"] = a.Characters
				}
				if a.Actions != "" {
					updates["actions"] = a.Actions
				}
				if a.Dialogue != "" {
					updates["dialogue"] = a.Dialogue
				}
				if a.Atmosphere != "" {
					updates["atmosphere"] = a.Atmosphere
				}
				if a.Status != "" {
					updates["status"] = a.Status
				}
				if len(updates) == 0 {
					return errResult("no fields to update")
				}
				db.Model(&model.Storyboard{}).Where("id = ?", a.StoryboardID).Updates(updates)
				return textResult(fmt.Sprintf(`{"id":%d,"message":"updated"}`, a.StoryboardID))
			},
		},
	}
}

// ── Shot tools ────────────────────────────────────────────────────────────────

func shotTools() []Tool {
	return []Tool{
		{
			Definition: ToolDefinition{
				Name:        "list_shots",
				Description: "List all shots under a storyboard.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"storyboard_id": {Type: "number", Description: "Storyboard ID"},
					},
					Required: []string{"storyboard_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct{ StoryboardID uint `json:"storyboard_id"` }
				if err := parseArg(args, &a); err != nil || a.StoryboardID == 0 {
					return errResult("storyboard_id required")
				}
				var shots []model.Shot
				db.Where("storyboard_id = ?", a.StoryboardID).Order("\"order\", id").Find(&shots)
				type row struct {
					ID          uint   `json:"id"`
					Description string `json:"description"`
					Prompt      string `json:"prompt"`
					Status      string `json:"status"`
					IsApproved  bool   `json:"is_approved"`
				}
				rows := make([]row, len(shots))
				for i, s := range shots {
					rows[i] = row{ID: s.ID, Description: s.Description, Prompt: s.Prompt, Status: s.Status, IsApproved: s.IsApproved}
				}
				return textResult(toJSON(rows))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "create_shot",
				Description: "Create a new shot under a storyboard with description and generation prompt.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"project_id":    {Type: "number", Description: "Project ID"},
						"storyboard_id": {Type: "number", Description: "Storyboard ID (optional)"},
						"description":   {Type: "string", Description: "Shot description"},
						"prompt":        {Type: "string", Description: "AI generation prompt for this shot"},
					},
					Required: []string{"project_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct {
					ProjectID    uint   `json:"project_id"`
					StoryboardID uint   `json:"storyboard_id"`
					Description  string `json:"description"`
					Prompt       string `json:"prompt"`
				}
				if err := parseArg(args, &a); err != nil || a.ProjectID == 0 {
					return errResult("project_id required")
				}
				shot := model.Shot{
					ProjectID:   a.ProjectID,
					Description: a.Description,
					Prompt:      a.Prompt,
					Status:      "draft",
				}
				if a.StoryboardID != 0 {
					shot.StoryboardID = &a.StoryboardID
				}
				if shot.Prompt != "" {
					shot.Status = "prompt_ready"
				}
				if err := db.Create(&shot).Error; err != nil {
					return errResult(err.Error())
				}
				return textResult(fmt.Sprintf(`{"id":%d,"message":"created"}`, shot.ID))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "update_shot",
				Description: "Update a shot's description, prompt, or status.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"shot_id":     {Type: "number", Description: "Shot ID"},
						"description": {Type: "string", Description: "Shot description (optional)"},
						"prompt":      {Type: "string", Description: "AI generation prompt (optional)"},
						"status": {Type: "string", Description: "Shot status (optional)",
							Enum: []any{"draft", "prompt_ready", "generating", "generated", "approved"}},
					},
					Required: []string{"shot_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct {
					ShotID      uint   `json:"shot_id"`
					Description string `json:"description"`
					Prompt      string `json:"prompt"`
					Status      string `json:"status"`
				}
				if err := parseArg(args, &a); err != nil || a.ShotID == 0 {
					return errResult("shot_id required")
				}
				updates := map[string]any{}
				if a.Description != "" {
					updates["description"] = a.Description
				}
				if a.Prompt != "" {
					updates["prompt"] = a.Prompt
					updates["status"] = "prompt_ready"
				}
				if a.Status != "" {
					updates["status"] = a.Status
				}
				if len(updates) == 0 {
					return errResult("no fields to update")
				}
				db.Model(&model.Shot{}).Where("id = ?", a.ShotID).Updates(updates)
				return textResult(fmt.Sprintf(`{"id":%d,"message":"updated"}`, a.ShotID))
			},
		},
	}
}

// ── Asset tools ───────────────────────────────────────────────────────────────

func assetTools() []Tool {
	return []Tool{
		{
			Definition: ToolDefinition{
				Name:        "list_assets",
				Description: "List all assets (characters, scenes, props, drafts) in a project.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"project_id": {Type: "number", Description: "Project ID"},
						"type": {Type: "string", Description: "Filter by asset type (optional)",
							Enum: []any{"character", "scene", "prop", "draft"}},
					},
					Required: []string{"project_id"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct {
					ProjectID uint   `json:"project_id"`
					Type      string `json:"type"`
				}
				if err := parseArg(args, &a); err != nil || a.ProjectID == 0 {
					return errResult("project_id required")
				}
				q := db.Where("project_id = ?", a.ProjectID)
				if a.Type != "" {
					q = q.Where("type = ?", a.Type)
				}
				var assets []model.Asset
				q.Order("id").Find(&assets)
				type row struct {
					ID          uint   `json:"id"`
					Name        string `json:"name"`
					Type        string `json:"type"`
					Description string `json:"description"`
				}
				rows := make([]row, len(assets))
				for i, a := range assets {
					rows[i] = row{ID: a.ID, Name: a.Name, Type: a.Type, Description: a.Description}
				}
				return textResult(toJSON(rows))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "create_asset",
				Description: "Create a new asset (character, scene location, prop, or draft) in a project.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"project_id":  {Type: "number", Description: "Project ID"},
						"name":        {Type: "string", Description: "Asset name"},
						"type":        {Type: "string", Description: "Asset type", Enum: []any{"character", "scene", "prop", "draft"}},
						"description": {Type: "string", Description: "Asset description"},
					},
					Required: []string{"project_id", "name", "type"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct {
					ProjectID   uint   `json:"project_id"`
					Name        string `json:"name"`
					Type        string `json:"type"`
					Description string `json:"description"`
				}
				if err := parseArg(args, &a); err != nil || a.ProjectID == 0 || a.Name == "" || a.Type == "" {
					return errResult("project_id, name, and type required")
				}
				valid := map[string]bool{"character": true, "scene": true, "prop": true, "draft": true}
				if !valid[a.Type] {
					return errResult("type must be one of: character, scene, prop, draft")
				}
				asset := model.Asset{ProjectID: a.ProjectID, Name: a.Name, Type: a.Type, Description: a.Description}
				if err := db.Create(&asset).Error; err != nil {
					return errResult(err.Error())
				}
				return textResult(fmt.Sprintf(`{"id":%d,"message":"created"}`, asset.ID))
			},
		},
		{
			Definition: ToolDefinition{
				Name:        "search",
				Description: "Search across projects, scripts, scenes, and assets by keyword.",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"query":      {Type: "string", Description: "Search keyword"},
						"project_id": {Type: "number", Description: "Limit search to a project (optional)"},
					},
					Required: []string{"query"},
				},
			},
			Handler: func(ctx context.Context, args json.RawMessage, db *gorm.DB) ToolCallResult {
				var a struct {
					Query     string `json:"query"`
					ProjectID uint   `json:"project_id"`
				}
				if err := parseArg(args, &a); err != nil || a.Query == "" {
					return errResult("query required")
				}
				like := "%" + strings.ToLower(a.Query) + "%"
				results := map[string]any{}

				// Search scripts
				q := db.Model(&model.Script{}).Where("LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(summary) LIKE ?", like, like, like)
				if a.ProjectID > 0 {
					q = q.Where("project_id = ?", a.ProjectID)
				}
				var scripts []model.Script
				q.Limit(10).Find(&scripts)
				scriptRows := make([]map[string]any, len(scripts))
				for i, s := range scripts {
					scriptRows[i] = map[string]any{"id": s.ID, "title": s.Title, "type": s.ScriptType, "project_id": s.ProjectID}
				}
				results["scripts"] = scriptRows

				// Search scenes
				qsc := db.Model(&model.Scene{}).Where("LOWER(title) LIKE ? OR LOWER(location) LIKE ? OR LOWER(notes) LIKE ?", like, like, like)
				if a.ProjectID > 0 {
					qsc = qsc.Where("project_id = ?", a.ProjectID)
				}
				var scenes []model.Scene
				qsc.Limit(10).Find(&scenes)
				sceneRows := make([]map[string]any, len(scenes))
				for i, s := range scenes {
					sceneRows[i] = map[string]any{"id": s.ID, "title": s.Title, "location": s.Location, "project_id": s.ProjectID}
				}
				results["scenes"] = sceneRows

				// Search assets
				qa := db.Model(&model.Asset{}).Where("LOWER(name) LIKE ? OR LOWER(description) LIKE ?", like, like)
				if a.ProjectID > 0 {
					qa = qa.Where("project_id = ?", a.ProjectID)
				}
				var assets []model.Asset
				qa.Limit(10).Find(&assets)
				assetRows := make([]map[string]any, len(assets))
				for i, a := range assets {
					assetRows[i] = map[string]any{"id": a.ID, "name": a.Name, "type": a.Type, "project_id": a.ProjectID}
				}
				results["assets"] = assetRows

				return textResult(toJSON(results))
			},
		},
	}
}

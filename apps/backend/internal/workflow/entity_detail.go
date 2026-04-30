package workflow

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/movscript/movscript/internal/model"
)

type EntitySemanticValues struct {
	Kind          string         `json:"kind"`
	ID            uint           `json:"id"`
	SchemaVersion int            `json:"schemaVersion"`
	Values        map[string]any `json:"values"`
}

type EntitySchemaMigrationReport struct {
	Kind             string                   `json:"kind"`
	SchemaVersion    int                      `json:"schemaVersion"`
	CurrentVersion   int                      `json:"currentVersion"`
	MinCompatible    int                      `json:"minCompatibleVersion"`
	FieldAliases     map[string][]string      `json:"fieldAliases,omitempty"`
	DeprecatedFields []string                 `json:"deprecatedFields,omitempty"`
	Migrations       []EntityMigration        `json:"migrations,omitempty"`
	Actions          []EntitySchemaActionHint `json:"actions"`
}

type EntitySchemaActionHint struct {
	Kind        string `json:"kind"`
	FieldID     string `json:"fieldId,omitempty"`
	FromFieldID string `json:"fromFieldId,omitempty"`
	ToFieldID   string `json:"toFieldId,omitempty"`
	Description string `json:"description"`
}

func EntitySchemaMigrationReportForKind(kind string) (EntitySchemaMigrationReport, error) {
	schema, ok := EntitySchemaForKind(kind)
	if !ok {
		return EntitySchemaMigrationReport{}, fmt.Errorf("unsupported entity type %q", kind)
	}
	compat := schema.Compatibility
	report := EntitySchemaMigrationReport{
		Kind:             kind,
		SchemaVersion:    schema.SchemaVersion,
		CurrentVersion:   compat.CurrentVersion,
		MinCompatible:    compat.MinCompatibleVersion,
		FieldAliases:     compat.FieldAliases,
		DeprecatedFields: compat.DeprecatedFields,
		Migrations:       compat.Migrations,
		Actions:          make([]EntitySchemaActionHint, 0, len(compat.Migrations)+len(compat.FieldAliases)+len(compat.DeprecatedFields)),
	}
	for fieldID, aliases := range compat.FieldAliases {
		for _, alias := range aliases {
			report.Actions = append(report.Actions, EntitySchemaActionHint{
				Kind:        "field_alias",
				FieldID:     fieldID,
				FromFieldID: alias,
				ToFieldID:   fieldID,
				Description: fmt.Sprintf("Accept legacy field or port %q as %q.", alias, fieldID),
			})
		}
	}
	for _, fieldID := range compat.DeprecatedFields {
		report.Actions = append(report.Actions, EntitySchemaActionHint{
			Kind:        "deprecated",
			FieldID:     fieldID,
			Description: fmt.Sprintf("Field %q remains readable for compatibility but should not be used for new writes.", fieldID),
		})
	}
	for _, migration := range compat.Migrations {
		report.Actions = append(report.Actions, EntitySchemaActionHint{
			Kind:        migration.Kind,
			FieldID:     migration.FieldID,
			FromFieldID: migration.FromFieldID,
			ToFieldID:   migration.ToFieldID,
			Description: migration.Description,
		})
	}
	return report, nil
}

func (s *EntityIOService) ReadDetailValues(ctx context.Context, kind string, id uint) (EntitySemanticValues, error) {
	schema, ok := EntitySemanticSchemaForKind(kind)
	if !ok {
		return EntitySemanticValues{}, fmt.Errorf("unsupported entity type %q", kind)
	}
	portValues, err := s.ReadPorts(ctx, kind, id)
	if err != nil {
		return EntitySemanticValues{}, err
	}
	values := map[string]any{}
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			portID := EntityWorkflowPortID(field)
			if value, ok := portValues[portID]; ok {
				values[field.ID] = detailNativeValue(field, value)
			}
		}
	}
	related, err := s.readRelatedDetailValues(ctx, kind, id, schema)
	if err != nil {
		return EntitySemanticValues{}, err
	}
	for fieldID, value := range related {
		values[fieldID] = value
	}
	return EntitySemanticValues{
		Kind:          kind,
		ID:            id,
		SchemaVersion: schema.SchemaVersion,
		Values:        values,
	}, nil
}

func detailNativeValue(field EntitySemanticField, value EntityPortValue) any {
	if field.Binding != nil {
		if field.Binding.IsPrimary && len(value.ResourceIDs) > 0 {
			return value.ResourceIDs[0]
		}
		return value.ResourceIDs
	}
	switch field.ValueType {
	case "number":
		if value.Number != nil {
			return *value.Number
		}
	case "boolean":
		if value.Boolean != nil {
			return *value.Boolean
		}
	case "json":
		if value.JSON != nil {
			return value.JSON
		}
		var parsed any
		if strings.TrimSpace(value.Text) != "" && json.Unmarshal([]byte(value.Text), &parsed) == nil {
			return parsed
		}
	}
	if value.Text != "" {
		return value.Text
	}
	if len(value.ResourceIDs) > 0 {
		return value.ResourceIDs
	}
	return nil
}

func (s *EntityIOService) readRelatedDetailValues(ctx context.Context, kind string, id uint, schema EntitySemanticSchema) (map[string]any, error) {
	result := map[string]any{}
	relatedFields := []EntitySemanticField{}
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			if field.Control == "related_entity_list" {
				relatedFields = append(relatedFields, field)
			}
		}
	}
	if len(relatedFields) == 0 {
		return result, nil
	}
	for _, field := range relatedFields {
		items, err := s.relatedItemsForField(ctx, kind, id, field)
		if err != nil {
			return nil, err
		}
		result[field.ID] = items
	}
	return result, nil
}

func (s *EntityIOService) relatedItemsForField(ctx context.Context, kind string, id uint, field EntitySemanticField) ([]map[string]any, error) {
	switch kind + "." + field.ID {
	case "episode.scenes":
		var links []model.EpisodeScene
		if err := s.db.WithContext(ctx).Where("episode_id = ?", id).Order(`"order"`).Find(&links).Error; err != nil {
			return nil, err
		}
		sceneIDs := make([]uint, 0, len(links))
		orderByID := map[uint]int{}
		for _, link := range links {
			sceneIDs = append(sceneIDs, link.SceneID)
			orderByID[link.SceneID] = link.Order
		}
		var scenes []model.Scene
		if len(sceneIDs) > 0 {
			if err := s.db.WithContext(ctx).Where("id IN ?", sceneIDs).Find(&scenes).Error; err != nil {
				return nil, err
			}
		}
		items := make([]map[string]any, 0, len(scenes))
		for _, scene := range scenes {
			items = append(items, compactScene(scene, orderByID[scene.ID]))
		}
		sort.SliceStable(items, func(i, j int) bool { return intValue(items[i]["order"]) < intValue(items[j]["order"]) })
		return items, nil
	case "episode.storyboards":
		var boards []model.Storyboard
		if err := s.db.WithContext(ctx).Where("episode_id = ?", id).Order(`"order"`).Preload("Shots").Find(&boards).Error; err != nil {
			return nil, err
		}
		return compactStoryboards(boards), nil
	case "episode.settings":
		var episode model.Episode
		if err := s.db.WithContext(ctx).Preload("Settings").First(&episode, id).Error; err != nil {
			return nil, err
		}
		return compactSettings(episode.Settings), nil
	case "episode.scripts":
		var episode model.Episode
		if err := s.db.WithContext(ctx).Preload("Script").First(&episode, id).Error; err != nil {
			return nil, err
		}
		if episode.Script == nil {
			return []map[string]any{}, nil
		}
		return compactScripts([]model.Script{*episode.Script}), nil
	case "scene.storyboards":
		var boards []model.Storyboard
		if err := s.db.WithContext(ctx).Where("scene_id = ?", id).Order(`"order"`).Preload("Shots").Find(&boards).Error; err != nil {
			return nil, err
		}
		return compactStoryboards(boards), nil
	case "scene.settings":
		var scene model.Scene
		if err := s.db.WithContext(ctx).Preload("Settings").First(&scene, id).Error; err != nil {
			return nil, err
		}
		return compactSettings(scene.Settings), nil
	case "scene.scripts":
		var scene model.Scene
		if err := s.db.WithContext(ctx).Preload("Script").First(&scene, id).Error; err != nil {
			return nil, err
		}
		if scene.Script == nil {
			return []map[string]any{}, nil
		}
		return compactScripts([]model.Script{*scene.Script}), nil
	case "scene.shots":
		var boardIDs []uint
		if err := s.db.WithContext(ctx).Model(&model.Storyboard{}).Where("scene_id = ?", id).Pluck("id", &boardIDs).Error; err != nil {
			return nil, err
		}
		var shots []model.Shot
		if len(boardIDs) > 0 {
			if err := s.db.WithContext(ctx).Where("storyboard_id IN ?", boardIDs).Order(`storyboard_id, "order"`).Find(&shots).Error; err != nil {
				return nil, err
			}
		}
		return compactShots(shots), nil
	case "scene.final_videos":
		var videos []model.FinalVideo
		if err := s.db.WithContext(ctx).Where("scene_id = ?", id).Order("id").Find(&videos).Error; err != nil {
			return nil, err
		}
		return compactFinalVideos(videos), nil
	case "storyboard.shots":
		var shots []model.Shot
		if err := s.db.WithContext(ctx).Where("storyboard_id = ?", id).Order(`"order"`).Find(&shots).Error; err != nil {
			return nil, err
		}
		return compactShots(shots), nil
	default:
		return []map[string]any{}, nil
	}
}

func compactScene(scene model.Scene, order int) map[string]any {
	return map[string]any{
		"ID":     scene.ID,
		"kind":   "scene",
		"order":  order,
		"number": scene.Number,
		"title":  scene.Title,
		"status": scene.ReviewStatus,
	}
}

func compactStoryboards(boards []model.Storyboard) []map[string]any {
	items := make([]map[string]any, 0, len(boards))
	for _, board := range boards {
		items = append(items, map[string]any{
			"ID":          board.ID,
			"kind":        "storyboard",
			"order":       board.Order,
			"title":       board.Title,
			"description": board.Description,
			"setting_id":  board.SettingID,
			"shots_count": len(board.Shots),
		})
	}
	return items
}

func compactSettings(settings []model.Setting) []map[string]any {
	items := make([]map[string]any, 0, len(settings))
	for _, setting := range settings {
		items = append(items, map[string]any{
			"ID":          setting.ID,
			"kind":        "setting",
			"name":        setting.Name,
			"type":        setting.Type,
			"description": setting.Description,
			"status":      setting.Status,
		})
	}
	return items
}

func compactScripts(scripts []model.Script) []map[string]any {
	items := make([]map[string]any, 0, len(scripts))
	for _, script := range scripts {
		items = append(items, map[string]any{
			"ID":          script.ID,
			"kind":        "script",
			"title":       script.Title,
			"description": script.Description,
			"script_type": script.ScriptType,
			"order":       script.Order,
		})
	}
	return items
}

func compactFinalVideos(videos []model.FinalVideo) []map[string]any {
	items := make([]map[string]any, 0, len(videos))
	for _, video := range videos {
		items = append(items, map[string]any{
			"ID":          video.ID,
			"kind":        "final_video",
			"title":       video.Title,
			"description": video.Description,
		})
	}
	return items
}

func compactShots(shots []model.Shot) []map[string]any {
	items := make([]map[string]any, 0, len(shots))
	for _, shot := range shots {
		items = append(items, map[string]any{
			"ID":            shot.ID,
			"kind":          "shot",
			"storyboard_id": shot.StoryboardID,
			"order":         shot.Order,
			"description":   firstNonEmpty(shot.FinalDescription, shot.Description),
			"status":        shot.Status,
			"is_approved":   shot.IsApproved,
		})
	}
	return items
}

func intValue(value any) int {
	switch v := value.(type) {
	case int:
		return v
	case uint:
		return int(v)
	case float64:
		return int(v)
	default:
		return 0
	}
}

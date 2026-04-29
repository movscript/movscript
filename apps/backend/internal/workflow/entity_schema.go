package workflow

type EntitySchema struct {
	Kind          string                `json:"kind"`
	LabelKey      string                `json:"labelKey"`
	FallbackLabel string                `json:"fallbackLabel"`
	Sections      []EntitySchemaSection `json:"sections"`
}

type EntitySchemaSection struct {
	ID            string              `json:"id"`
	LabelKey      string              `json:"labelKey"`
	FallbackLabel string              `json:"fallbackLabel"`
	Fields        []EntitySchemaField `json:"fields"`
}

type EntitySchemaField struct {
	ID            string           `json:"id"`
	LabelKey      string           `json:"labelKey"`
	FallbackLabel string           `json:"fallbackLabel"`
	ValueType     string           `json:"valueType"`
	Control       string           `json:"control"`
	Storage       *FieldStorageMap `json:"-"`
	Workflow      FieldWorkflowIO  `json:"workflow"`
	Binding       *FieldBindingMap `json:"binding,omitempty"`
}

type FieldWorkflowIO struct {
	Readable bool   `json:"readable"`
	Writable bool   `json:"writable"`
	PortID   string `json:"portId"`
	Required bool   `json:"required,omitempty"`
	MaxCount int    `json:"maxCount,omitempty"`
}

type FieldBindingMap struct {
	Role      string `json:"role"`
	Slot      string `json:"slot"`
	IsPrimary bool   `json:"isPrimary"`
	Multiple  bool   `json:"multiple"`
}

type FieldStorageMap struct {
	Column string `json:"column"`
}

type PortDef struct {
	ID            string `json:"id"`
	LabelKey      string `json:"labelKey"`
	FallbackLabel string `json:"label,omitempty"`
	Type          string `json:"type"`
	Required      bool   `json:"required,omitempty"`
	MaxCount      int    `json:"maxCount,omitempty"`
	Description   string `json:"description,omitempty"`
}

func EntitySchemas() []EntitySchema {
	return []EntitySchema{
		{
			Kind: "script", LabelKey: "canvas.entityTypes.script", FallbackLabel: "Script",
			Sections: []EntitySchemaSection{section("content", "details.contentManagement", "Content", []EntitySchemaField{
				resourceField("result", "details.attachments", "Result", "result", "output", false),
				resourceField("attachment", "details.attachments", "Attachment", "attachment", "reference", false),
				textField("title", "shared.scriptTitle", "Title", "input", true),
				textField("description", "shared.description", "Description", "textarea", true),
				textField("content", "details.scriptBody", "Script Body", "textarea", true),
				textField("summary", "details.scriptSummary", "Summary", "textarea", true),
				jsonField("characters", "details.characters", "Characters", true),
				jsonField("character_profiles", "details.characterProfiles", "Character Profiles", true),
				jsonField("character_relationships", "details.characterRelationshipGraph", "Character Relationships", true),
				jsonField("settings", "details.coreSettings", "Core Settings", true),
				textField("background", "details.background", "Background", "textarea", true),
				textField("scenes_desc", "details.scenes", "Scenes", "textarea", true),
				textField("hook", "details.hook", "Hook", "textarea", true),
				textField("plot_summary", "details.plotSummary", "Plot Summary", "textarea", true),
				jsonField("script_points", "details.generatePoints", "Script Points", true),
			})},
		},
		{
			Kind: "setting", LabelKey: "canvas.entityTypes.setting", FallbackLabel: "Setting",
			Sections: []EntitySchemaSection{section("profile", "details.contentManagement", "Profile", []EntitySchemaField{
				resourceField("result", "details.attachments", "Result", "result", "output", false),
				resourceField("reference", "details.referenceAssets", "Reference", "reference", "reference", false),
				textField("name", "project.scripts.settingName", "Name", "input", true),
				textField("alias", "details.characterIdentity", "Alias", "input", true),
				textField("type", "shared.type", "Type", "input", true),
				textField("description", "shared.description", "Description", "textarea", true),
				textField("content", "project.scripts.settingContent", "Content", "textarea", true),
				textField("status", "details.productionStatus", "Status", "input", true),
				textField("importance", "details.characterGoal", "Importance", "input", true),
				jsonField("tags", "details.pointTagsPlaceholder", "Tags", true),
				jsonField("profile_json", "details.characterProfiles", "Profile JSON", true),
			})},
		},
		{
			Kind: "asset", LabelKey: "canvas.entityTypes.asset", FallbackLabel: "Asset",
			Sections: []EntitySchemaSection{section("asset", "details.assetViews", "Asset", []EntitySchemaField{
				resourceField("result", "details.attachments", "Result", "result", "output", false),
				mediaField("image", "details.referenceImages", "Image", "image", "image", "final", true),
				resourceField("reference", "details.referenceAssets", "Reference", "reference", "reference", false),
				textField("name", "shared.assetName", "Name", "input", true),
				textField("type", "shared.type", "Type", "input", true),
				textField("description", "shared.description", "Description", "textarea", true),
				textField("variant_name", "details.assetViews", "Variant", "input", true),
				textField("costume", "details.characterIdentity", "Costume", "input", true),
				textField("time_of_day", "details.timeOfDay", "Time of Day", "input", true),
				textField("period", "details.background", "Period", "input", true),
				textField("state", "details.productionStatus", "State", "input", true),
				textField("style_profile", "details.atmosphere", "Style Profile", "textarea", true),
				textField("prompt", "details.prompt", "Prompt", "textarea", true),
				textField("negative_prompt", "details.finalPromptNotes", "Negative Prompt", "textarea", true),
			})},
		},
		{
			Kind: "episode", LabelKey: "canvas.entityTypes.episode", FallbackLabel: "Episode",
			Sections: []EntitySchemaSection{section("episode", "details.episodeSpecific", "Episode", []EntitySchemaField{
				resourceField("result", "details.attachments", "Result", "result", "output", false),
				resourceField("attachment", "details.attachments", "Attachment", "attachment", "reference", false),
				textField("title", "details.episodeNumber", "Title", "input", true),
				textField("synopsis", "details.episodeSynopsis", "Synopsis", "textarea", true),
				textField("script", "details.scriptBody", "Script", "textarea", false),
			})},
		},
		{
			Kind: "scene", LabelKey: "canvas.entityTypes.scene", FallbackLabel: "Scene",
			Sections: []EntitySchemaSection{section("scene", "details.sceneSpecific", "Scene", []EntitySchemaField{
				resourceField("result", "details.attachments", "Result", "result", "output", false),
				resourceField("reference", "details.referenceAssets", "Reference", "reference", "reference", false),
				textField("title", "details.sceneLabel", "Title", "input", true),
				textField("location", "details.scenes", "Location", "input", true),
				textField("time_of_day", "details.timeOfDay", "Time of Day", "input", true),
				textField("notes", "details.finalPromptNotes", "Notes", "textarea", true),
			})},
		},
		{
			Kind: "storyboard", LabelKey: "canvas.entityTypes.storyboard", FallbackLabel: "Storyboard",
			Sections: []EntitySchemaSection{section("storyboard", "details.storyboardLabel", "Storyboard", []EntitySchemaField{
				resourceField("result", "details.attachments", "Result", "result", "output", false),
				mediaField("image", "details.referenceImages", "Image", "image", "image", "final", true),
				resourceField("reference", "details.referenceAssets", "Reference", "reference", "reference", false),
				textField("title", "shared.storyboardTitle", "Title", "input", true),
				textField("description", "shared.storyboardDescription", "Description", "textarea", true),
				textField("notes", "details.finalPromptNotes", "Notes", "textarea", true),
				jsonField("characters", "details.characters", "Characters", true),
				textField("actions", "details.actions", "Actions", "textarea", true),
				textField("dialogue", "details.dialogue", "Dialogue", "textarea", true),
				textField("atmosphere", "details.atmosphere", "Atmosphere", "textarea", true),
				storedField(textField("prompt", "details.prompt", "Prompt", "textarea", true), "description"),
				textField("camera_angle", "details.cameraReference", "Camera Angle", "input", true),
				textField("camera_movement", "details.cameraReference", "Camera Movement", "input", true),
				textField("depth_of_field", "details.cameraReference", "Depth of Field", "input", true),
				textField("lighting", "details.lighting", "Lighting", "input", true),
				textField("shot_size", "details.shotLabel", "Shot Size", "input", true),
				textField("angle", "details.cameraReference", "Angle", "input", true),
				textField("movement", "details.cameraReference", "Movement", "input", true),
				textField("focal_length", "details.cameraReference", "Focal Length", "input", true),
				textField("pacing", "details.duration", "Pacing", "input", true),
				textField("intent", "details.finalPromptNotes", "Intent", "textarea", true),
			})},
		},
		{
			Kind: "shot", LabelKey: "canvas.entityTypes.shot", FallbackLabel: "Shot",
			Sections: []EntitySchemaSection{section("shot", "details.shotLabel", "Shot", []EntitySchemaField{
				resourceField("result", "details.attachments", "Result", "result", "output", false),
				mediaField("video", "details.generatedVideo", "Video", "video", "video", "final", true),
				resourceField("reference", "details.referenceAssets", "Reference", "reference", "reference", false),
				textField("description", "shared.shotDescription", "Description", "textarea", true),
				textField("prompt", "details.prompt", "Prompt", "textarea", true),
				textField("final_description", "details.finalShotDescription", "Final Description", "textarea", true),
				textField("final_prompt", "details.finalPromptNotes", "Final Prompt", "textarea", true),
			})},
		},
		{
			Kind: "final_video", LabelKey: "canvas.entityTypes.final_video", FallbackLabel: "Final Video",
			Sections: []EntitySchemaSection{section("final_video", "details.finalShot", "Final Video", []EntitySchemaField{
				resourceField("result", "details.attachments", "Result", "result", "output", false),
				mediaField("video", "details.generatedVideo", "Video", "video", "video", "final", true),
				resourceField("reference", "details.referenceAssets", "Reference", "reference", "reference", false),
				textField("title", "shared.title", "Title", "input", true),
				textField("description", "shared.description", "Description", "textarea", true),
			})},
		},
	}
}

func EntitySchemaForKind(kind string) (EntitySchema, bool) {
	for _, schema := range EntitySchemas() {
		if schema.Kind == kind {
			return schema, true
		}
	}
	return EntitySchema{}, false
}

func EntityFieldForPort(kind string, portID string) (EntitySchemaField, bool) {
	schema, ok := EntitySchemaForKind(kind)
	if !ok {
		return EntitySchemaField{}, false
	}
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			if field.Workflow.PortID == portID {
				return field, true
			}
		}
	}
	return EntitySchemaField{}, false
}

func EntityPorts(kind string) (inputs []PortDef, outputs []PortDef) {
	schema, ok := EntitySchemaForKind(kind)
	if !ok {
		return nil, nil
	}
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			port := PortDef{
				ID:            field.Workflow.PortID,
				LabelKey:      field.LabelKey,
				FallbackLabel: field.FallbackLabel,
				Type:          field.ValueType,
				Required:      field.Workflow.Required,
				MaxCount:      field.Workflow.MaxCount,
			}
			if field.Workflow.Writable {
				inputs = append(inputs, port)
			}
			if field.Workflow.Readable {
				outputs = append(outputs, port)
			}
		}
	}
	return inputs, outputs
}

func section(id string, labelKey string, fallback string, fields []EntitySchemaField) EntitySchemaSection {
	return EntitySchemaSection{ID: id, LabelKey: labelKey, FallbackLabel: fallback, Fields: fields}
}

func textField(id string, labelKey string, fallback string, control string, writable bool) EntitySchemaField {
	return EntitySchemaField{
		ID: id, LabelKey: labelKey, FallbackLabel: fallback, ValueType: "text", Control: control,
		Storage:  &FieldStorageMap{Column: defaultStorageColumn(id)},
		Workflow: FieldWorkflowIO{Readable: true, Writable: writable, PortID: id},
	}
}

func jsonField(id string, labelKey string, fallback string, writable bool) EntitySchemaField {
	return EntitySchemaField{
		ID: id, LabelKey: labelKey, FallbackLabel: fallback, ValueType: "json", Control: "json_editor",
		Storage:  &FieldStorageMap{Column: defaultStorageColumn(id)},
		Workflow: FieldWorkflowIO{Readable: true, Writable: writable, PortID: id},
	}
}

func resourceField(id string, labelKey string, fallback string, portID string, role string, primary bool) EntitySchemaField {
	return mediaField(id, labelKey, fallback, portID, "resource", role, primary)
}

func mediaField(id string, labelKey string, fallback string, portID string, valueType string, role string, primary bool) EntitySchemaField {
	return EntitySchemaField{
		ID: id, LabelKey: labelKey, FallbackLabel: fallback, ValueType: valueType, Control: "resource_picker",
		Workflow: FieldWorkflowIO{Readable: true, Writable: true, PortID: portID},
		Binding:  &FieldBindingMap{Role: role, Slot: portID, IsPrimary: primary, Multiple: !primary},
	}
}

func storedField(field EntitySchemaField, column string) EntitySchemaField {
	field.Storage = &FieldStorageMap{Column: column}
	return field
}

func defaultStorageColumn(id string) string {
	switch id {
	case "settings":
		return "core_settings"
	default:
		return id
	}
}

package workflow

import domainresourcebinding "github.com/movscript/movscript/internal/domain/resourcebinding"

const EntitySemanticSchemaVersion = 1

// EntitySchemaVersion is kept for compatibility with existing callers that
// consume the workflow-facing projection.
const EntitySchemaVersion = EntitySemanticSchemaVersion

// EntitySemanticSchema is the domain-facing entity field registry. Workflow
// ports and detail-page schemas should be projections of this registry instead
// of each owning independent field definitions.
type EntitySemanticSchema struct {
	Kind          string                    `json:"kind"`
	SchemaVersion int                       `json:"schemaVersion"`
	Projection    string                    `json:"projection,omitempty"`
	Compatibility EntitySchemaCompatibility `json:"compatibility,omitempty"`
	LabelKey      string                    `json:"labelKey"`
	FallbackLabel string                    `json:"fallbackLabel"`
	Layout        EntitySchemaLayout        `json:"layout,omitempty"`
	Sections      []EntitySemanticSection   `json:"sections"`
}

type EntitySemanticSection struct {
	ID            string                `json:"id"`
	LabelKey      string                `json:"labelKey"`
	FallbackLabel string                `json:"fallbackLabel"`
	Layout        EntitySectionLayout   `json:"layout,omitempty"`
	Fields        []EntitySemanticField `json:"fields"`
}

type EntitySemanticField struct {
	ID              string            `json:"id"`
	Aliases         []string          `json:"aliases,omitempty"`
	Deprecated      bool              `json:"deprecated,omitempty"`
	LabelKey        string            `json:"labelKey"`
	FallbackLabel   string            `json:"fallbackLabel"`
	ValueType       string            `json:"valueType"`
	Control         string            `json:"control"`
	Readonly        bool              `json:"readonly,omitempty"`
	Layout          EntityFieldLayout `json:"layout,omitempty"`
	Storage         *FieldStorageMap  `json:"-"`
	IO              FieldIO           `json:"io"`
	WorkflowPort    string            `json:"-"`
	WorkflowAliases []string          `json:"-"`
	Binding         *FieldBindingMap  `json:"binding,omitempty"`
	Validation      *FieldValidation  `json:"validation,omitempty"`
}

type FieldIO struct {
	Readable bool `json:"readable"`
	Writable bool `json:"writable"`
	Required bool `json:"required,omitempty"`
	MaxCount int  `json:"maxCount,omitempty"`
}

// EntitySchema is the legacy workflow-facing projection returned by
// /workflow/entity-schemas. New domain/UI code should prefer
// EntitySemanticSchema and derive its own projection.
type EntitySchema struct {
	Kind          string                    `json:"kind"`
	SchemaVersion int                       `json:"schemaVersion"`
	Projection    string                    `json:"projection,omitempty"`
	Compatibility EntitySchemaCompatibility `json:"compatibility,omitempty"`
	LabelKey      string                    `json:"labelKey"`
	FallbackLabel string                    `json:"fallbackLabel"`
	Layout        EntitySchemaLayout        `json:"layout,omitempty"`
	Sections      []EntitySchemaSection     `json:"sections"`
}

type EntitySchemaCompatibility struct {
	CurrentVersion       int                 `json:"currentVersion"`
	MinCompatibleVersion int                 `json:"minCompatibleVersion"`
	FieldAliases         map[string][]string `json:"fieldAliases,omitempty"`
	DeprecatedFields     []string            `json:"deprecatedFields,omitempty"`
	Migrations           []EntityMigration   `json:"migrations,omitempty"`
}

type EntityMigration struct {
	FromVersion int    `json:"fromVersion"`
	ToVersion   int    `json:"toVersion"`
	Kind        string `json:"kind"`
	FieldID     string `json:"fieldId,omitempty"`
	FromFieldID string `json:"fromFieldId,omitempty"`
	ToFieldID   string `json:"toFieldId,omitempty"`
	Description string `json:"description,omitempty"`
}

type EntitySchemaSection struct {
	ID            string              `json:"id"`
	LabelKey      string              `json:"labelKey"`
	FallbackLabel string              `json:"fallbackLabel"`
	Layout        EntitySectionLayout `json:"layout,omitempty"`
	Fields        []EntitySchemaField `json:"fields"`
}

type EntitySchemaField struct {
	ID            string            `json:"id"`
	Aliases       []string          `json:"aliases,omitempty"`
	Deprecated    bool              `json:"deprecated,omitempty"`
	LabelKey      string            `json:"labelKey"`
	FallbackLabel string            `json:"fallbackLabel"`
	ValueType     string            `json:"valueType"`
	Control       string            `json:"control"`
	Readonly      bool              `json:"readonly,omitempty"`
	Layout        EntityFieldLayout `json:"layout,omitempty"`
	Storage       *FieldStorageMap  `json:"-"`
	Workflow      FieldWorkflowIO   `json:"workflow"`
	Binding       *FieldBindingMap  `json:"binding,omitempty"`
	Validation    *FieldValidation  `json:"validation,omitempty"`
}

type FieldWorkflowIO struct {
	Readable bool     `json:"readable"`
	Writable bool     `json:"writable"`
	PortID   string   `json:"portId"`
	Aliases  []string `json:"aliases,omitempty"`
	Required bool     `json:"required,omitempty"`
	MaxCount int      `json:"maxCount,omitempty"`
}

type EntitySchemaLayout struct {
	Variant string `json:"variant,omitempty"`
}

type EntitySectionLayout struct {
	Variant string `json:"variant,omitempty"`
	Columns int    `json:"columns,omitempty"`
}

type EntityFieldLayout struct {
	Width      string `json:"width,omitempty"`
	Relation   string `json:"relation,omitempty"`
	NestedKind string `json:"nestedKind,omitempty"`
}

type FieldValidation struct {
	Required bool     `json:"required,omitempty"`
	Enum     []string `json:"enum,omitempty"`
	Min      *float64 `json:"min,omitempty"`
	Max      *float64 `json:"max,omitempty"`
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
	ID            string   `json:"id"`
	Aliases       []string `json:"aliases,omitempty"`
	LabelKey      string   `json:"labelKey"`
	FallbackLabel string   `json:"label,omitempty"`
	Type          string   `json:"type"`
	Required      bool     `json:"required,omitempty"`
	MaxCount      int      `json:"maxCount,omitempty"`
	Deprecated    bool     `json:"deprecated,omitempty"`
	Description   string   `json:"description,omitempty"`
}

func EntitySemanticSchemas() []EntitySemanticSchema {
	schemas := []EntitySemanticSchema{
		{
			Kind: "script", LabelKey: "canvas.entityTypes.script", FallbackLabel: "Script",
			Sections: []EntitySemanticSection{section("content", "details.contentManagement", "Content", []EntitySemanticField{
				resourceField("result", "details.attachments", "Result", "result", "output", false),
				resourceField("attachment", "details.attachments", "Attachment", "attachment", "reference", false),
				textField("title", "shared.scriptTitle", "Title", "input", true),
				textField("description", "shared.description", "Description", "textarea", true),
				textField("raw_source", "details.scriptBody", "Raw Source", "textarea", true),
				textField("summary", "details.scriptSummary", "Summary", "textarea", true),
				jsonField("characters", "details.characters", "Characters", true),
				textField("time_text", "user.usage.time", "Time", "input", true),
				textField("location_text", "domain.settingTypes.scene", "Location", "input", true),
				jsonField("structured_characters", "details.characters", "Structured Characters", true),
				jsonField("plot_beats", "details.generatePoints", "Plot Beats", true),
				textField("atmosphere", "details.atmosphere", "Atmosphere", "textarea", true),
				jsonField("entity_candidates", "details.contentManagement", "Entity Candidates", true),
				jsonField("relationship_candidates", "details.characterRelationshipGraph", "Relationship Candidates", true),
				deprecatedReadonlyField(jsonField("character_profiles", "details.characterProfiles", "Character Profiles", false)),
				deprecatedReadonlyField(jsonField("character_relationships", "details.characterRelationshipGraph", "Character Relationships", false)),
				workflowPort(deprecatedReadonlyField(jsonField("core_settings", "details.coreSettings", "Core Settings", false)), "settings"),
				deprecatedReadonlyField(textField("background", "details.background", "Background", "textarea", false)),
				deprecatedReadonlyField(textField("scenes_desc", "details.scenes", "Scenes", "textarea", false)),
				textField("hook", "details.hook", "Hook", "textarea", true),
				textField("plot_summary", "details.plotSummary", "Plot Summary", "textarea", true),
				jsonField("script_points", "details.generatePoints", "Script Points", true),
			})},
		},
		{
			Kind: "setting", LabelKey: "canvas.entityTypes.setting", FallbackLabel: "Setting",
			Sections: []EntitySemanticSection{section("identity", "canvas.entityTypes.setting", "Identity", []EntitySemanticField{
				resourceField("result", "details.attachments", "Result", "result", "output", false),
				resourceField("reference", "details.referenceAssets", "Reference", "reference", "reference", false),
				textField("name", "project.scripts.settingName", "Name", "input", true),
				textField("type", "shared.type", "Type", "input", true),
				textField("status", "details.productionStatus", "Status", "input", true),
				jsonField("tags", "details.pointTagsPlaceholder", "Tags", true),
				jsonField("state_tags", "details.pointTagsPlaceholder", "State Tags", true),
				textField("description", "shared.description", "Description", "textarea", true),
				textField("content", "project.scripts.settingContent", "Notes", "textarea", true),
				textField("alias", "details.characterIdentity", "Alias", "input", true),
				textField("importance", "details.characterGoal", "Importance", "input", true),
				jsonField("profile_json", "details.contentManagement", "Optional Structured Data", true),
			})},
		},
		{
			Kind: "segment", LabelKey: "canvas.entityTypes.segment", FallbackLabel: "Segment",
			Sections: []EntitySemanticSection{section("segment", "entities.segments", "Segment", []EntitySemanticField{
				textField("title", "shared.title", "Title", "input", false),
				textField("kind", "shared.type", "Kind", "input", false),
				numberField("order", "details.order", "Order", false),
				numberField("production_id", "details.productionStatus", "Production", false),
				numberField("text_block_id", "details.contentManagement", "Text Block", false),
				textField("summary", "details.scriptSummary", "Summary", "textarea", false),
				textField("content", "details.scriptBody", "Content", "textarea", false),
				textField("status", "details.productionStatus", "Status", "input", false),
				jsonField("metadata_json", "details.contentManagement", "Metadata", false),
			})},
		},
		{
			Kind: "scene_moment", LabelKey: "canvas.entityTypes.scene_moment", FallbackLabel: "Scene Moment",
			Sections: []EntitySemanticSection{section("scene_moment", "entities.sceneMoments", "Scene Moment", []EntitySemanticField{
				textField("title", "shared.title", "Title", "input", false),
				numberField("segment_id", "entities.segments", "Segment", false),
				numberField("order", "details.order", "Order", false),
				textField("description", "shared.description", "Description", "textarea", false),
				textField("time_text", "user.usage.time", "Time", "input", false),
				textField("location_text", "domain.settingTypes.scene", "Location", "input", false),
				textField("condition_text", "details.condition", "Condition", "textarea", false),
				textField("action_text", "details.action", "Action", "textarea", false),
				textField("mood", "details.atmosphere", "Mood", "input", false),
				textField("status", "details.productionStatus", "Status", "input", false),
				jsonField("metadata_json", "details.contentManagement", "Metadata", false),
			})},
		},
		{
			Kind: "creative_reference", LabelKey: "canvas.entityTypes.creative_reference", FallbackLabel: "Creative Reference",
			Sections: []EntitySemanticSection{section("creative_reference", "canvas.entityTypes.creative_reference", "Creative Reference", []EntitySemanticField{
				textField("name", "project.scripts.settingName", "Name", "input", false),
				textField("kind", "shared.type", "Kind", "input", false),
				textField("alias", "details.characterIdentity", "Alias", "input", false),
				textField("description", "shared.description", "Description", "textarea", false),
				textField("content", "project.scripts.settingContent", "Notes", "textarea", false),
				textField("importance", "details.characterGoal", "Importance", "input", false),
				textField("status", "details.productionStatus", "Status", "input", false),
				jsonField("profile_json", "details.contentManagement", "Profile", false),
				jsonField("tags_json", "details.pointTagsPlaceholder", "Tags", false),
			})},
		},
		{
			Kind: "asset_slot", LabelKey: "canvas.entityTypes.assetSlot", FallbackLabel: "Asset Slot",
			Sections: []EntitySemanticSection{section("asset_slot", "details.assetSlots", "Asset Slot", []EntitySemanticField{
				resourceField("result", "details.attachments", "Result", "result", "output", false),
				mediaField("image", "details.referenceImages", "Image", "image", "image", "final", true),
				mediaField("video", "canvas.outputTypes.video", "Video", "video", "video", "final", true),
				mediaField("audio", "canvas.outputTypes.audio", "Audio", "audio", "audio", "final", true),
				resourceField("reference", "details.referenceAssets", "Reference", "reference", "reference", false),
				textField("name", "shared.assetName", "Name", "input", false),
				textField("kind", "shared.type", "Kind", "input", false),
				textField("status", "details.productionStatus", "Status", "input", false),
				textField("priority", "details.priority", "Priority", "input", false),
				numberField("creative_reference_id", "details.references", "Creative Reference", false),
				numberField("creative_reference_state_id", "details.references", "Creative Reference State", false),
				numberField("resource_id", "details.attachments", "Resource", true),
				numberField("locked_asset_slot_id", "details.lockedAsset", "Locked Asset Slot", true),
				textField("description", "shared.description", "Description", "textarea", false),
				textField("slot_key", "details.slot", "Slot", "input", false),
				textField("prompt_hint", "details.prompt", "Prompt Hint", "textarea", false),
				candidateResourceField("candidates", "details.assetCandidates", "Candidates"),
				jsonField("metadata_json", "details.contentManagement", "Metadata", false),
			})},
		},
		{
			Kind: "content_unit", LabelKey: "canvas.entityTypes.contentUnit", FallbackLabel: "Content Unit",
			Sections: []EntitySemanticSection{section("content_unit", "canvas.entityTypes.contentUnit", "Content Unit", []EntitySemanticField{
				resourceField("result", "details.attachments", "Result", "result", "output", false),
				mediaField("image", "canvas.outputTypes.image", "Image", "image", "image", "output", false),
				mediaField("video", "canvas.outputTypes.video", "Video", "video", "video", "output", false),
				mediaField("audio", "canvas.outputTypes.audio", "Audio", "audio", "audio", "output", false),
				textField("title", "shared.title", "Title", "input", false),
				textField("kind", "shared.type", "Kind", "input", false),
				textField("status", "details.productionStatus", "Status", "input", false),
				numberField("segment_id", "entities.segments", "Segment", false),
				numberField("scene_moment_id", "entities.sceneMoments", "Scene Moment", false),
				numberField("order", "details.order", "Order", false),
				numberField("duration_sec", "details.duration", "Duration", false),
				textField("description", "shared.description", "Description", "textarea", false),
				textField("prompt", "details.prompt", "Prompt", "textarea", false),
				textField("shot_size", "details.shotSize", "Shot Size", "input", false),
				textField("camera_angle", "details.cameraAngle", "Camera Angle", "input", false),
				textField("camera_height", "details.cameraHeight", "Camera Height", "input", false),
				textField("camera_motion", "details.cameraMotion", "Camera Motion", "textarea", false),
				textField("motion_intensity", "details.motionIntensity", "Motion Intensity", "input", false),
				textField("camera_speed", "details.cameraSpeed", "Camera Speed", "input", false),
				textField("lens", "details.lens", "Lens", "input", false),
				textField("focal_length", "details.focalLength", "Focal Length", "input", false),
				textField("focus_subject", "details.focusSubject", "Focus Subject", "input", false),
				textField("composition_start", "details.compositionStart", "Start Composition", "textarea", false),
				textField("composition_end", "details.compositionEnd", "End Composition", "textarea", false),
				textField("stabilization", "details.stabilization", "Stabilization", "input", false),
				jsonField("camera_params_json", "details.cameraParams", "Camera Params", false),
				textField("camera_notes", "details.cameraNotes", "Camera Notes", "textarea", false),
				jsonField("metadata_json", "details.contentManagement", "Metadata", false),
			})},
		},
	}
	normalizeEntitySemanticSchemas(schemas)
	return schemas
}

func normalizeEntitySemanticSchemas(schemas []EntitySemanticSchema) {
	for i := range schemas {
		schemas[i].SchemaVersion = EntitySemanticSchemaVersion
		schemas[i].Projection = "semantic"
		if schemas[i].Layout.Variant == "" {
			schemas[i].Layout.Variant = "detail"
		}
		compat := EntitySchemaCompatibility{
			CurrentVersion:       EntitySemanticSchemaVersion,
			MinCompatibleVersion: 1,
			FieldAliases:         map[string][]string{},
			DeprecatedFields:     []string{},
			Migrations:           []EntityMigration{},
		}
		for si := range schemas[i].Sections {
			if schemas[i].Sections[si].Layout.Columns == 0 {
				schemas[i].Sections[si].Layout.Columns = 1
			}
			for fi := range schemas[i].Sections[si].Fields {
				field := &schemas[i].Sections[si].Fields[fi]
				field.Readonly = field.Readonly || !field.IO.Writable
				if field.WorkflowPort == "" {
					field.WorkflowPort = field.ID
				}
				if len(field.WorkflowAliases) == 0 && len(field.Aliases) > 0 {
					field.WorkflowAliases = field.Aliases
				}
				if field.Validation == nil && field.IO.Required {
					field.Validation = &FieldValidation{Required: true}
				}
				aliases := append([]string{}, field.Aliases...)
				aliases = append(aliases, EntityWorkflowAliases(*field)...)
				if len(aliases) > 0 {
					compat.FieldAliases[field.ID] = uniqueStrings(aliases)
				}
				if field.Deprecated {
					compat.DeprecatedFields = append(compat.DeprecatedFields, field.ID)
				}
			}
		}
		compat.Migrations = schemaMigrations(schemas[i].Kind)
		if len(compat.FieldAliases) == 0 {
			compat.FieldAliases = nil
		}
		if len(compat.DeprecatedFields) == 0 {
			compat.DeprecatedFields = nil
		}
		if len(compat.Migrations) == 0 {
			compat.Migrations = nil
		}
		schemas[i].Compatibility = compat
	}
}

func schemaMigrations(kind string) []EntityMigration {
	switch kind {
	case "script":
		return []EntityMigration{
			{
				FromVersion: 1,
				ToVersion:   EntitySemanticSchemaVersion,
				Kind:        "deprecated_field",
				FieldID:     "core_settings",
				FromFieldID: "settings",
				ToFieldID:   "setting.profile_json",
				Description: "Script core settings are readonly legacy data; write canonical settings to Setting records bound to the script.",
			},
		}
	default:
		return nil
	}
}

func EntitySemanticSchemaForKind(kind string) (EntitySemanticSchema, bool) {
	for _, schema := range EntitySemanticSchemas() {
		if schema.Kind == kind {
			return schema, true
		}
	}
	return EntitySemanticSchema{}, false
}

func EntitySemanticFieldForPort(kind string, portID string) (EntitySemanticField, bool) {
	schema, ok := EntitySemanticSchemaForKind(kind)
	if !ok {
		return EntitySemanticField{}, false
	}
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			if field.ID == portID || EntityWorkflowPortID(field) == portID || stringInSlice(portID, EntityWorkflowAliases(field)) || stringInSlice(portID, field.Aliases) {
				return field, true
			}
		}
	}
	return EntitySemanticField{}, false
}

func EntityFieldForPort(kind string, portID string) (EntitySchemaField, bool) {
	schema, ok := EntitySchemaForKind(kind)
	if !ok {
		return EntitySchemaField{}, false
	}
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			if field.ID == portID || field.Workflow.PortID == portID || stringInSlice(portID, field.Workflow.Aliases) || stringInSlice(portID, field.Aliases) {
				return field, true
			}
		}
	}
	return EntitySchemaField{}, false
}

func EntityWorkflowPortID(field EntitySemanticField) string {
	if field.WorkflowPort != "" {
		return field.WorkflowPort
	}
	return field.ID
}

func EntityWorkflowAliases(field EntitySemanticField) []string {
	if len(field.WorkflowAliases) > 0 {
		return field.WorkflowAliases
	}
	return field.Aliases
}

func EntitySchemas() []EntitySchema {
	return EntityWorkflowSchemas()
}

func EntityWorkflowSchemas() []EntitySchema {
	semanticSchemas := EntitySemanticSchemas()
	schemas := make([]EntitySchema, 0, len(semanticSchemas))
	for _, schema := range semanticSchemas {
		schemas = append(schemas, projectEntityWorkflowSchema(schema))
	}
	return schemas
}

func EntitySchemaForKind(kind string) (EntitySchema, bool) {
	schema, ok := EntitySemanticSchemaForKind(kind)
	if !ok {
		return EntitySchema{}, false
	}
	return projectEntityWorkflowSchema(schema), true
}

func projectEntityWorkflowSchema(schema EntitySemanticSchema) EntitySchema {
	projected := EntitySchema{
		Kind:          schema.Kind,
		SchemaVersion: schema.SchemaVersion,
		Projection:    "workflow",
		Compatibility: schema.Compatibility,
		LabelKey:      schema.LabelKey,
		FallbackLabel: schema.FallbackLabel,
		Layout:        schema.Layout,
		Sections:      make([]EntitySchemaSection, 0, len(schema.Sections)),
	}
	for _, section := range schema.Sections {
		projectedSection := EntitySchemaSection{
			ID:            section.ID,
			LabelKey:      section.LabelKey,
			FallbackLabel: section.FallbackLabel,
			Layout:        section.Layout,
			Fields:        make([]EntitySchemaField, 0, len(section.Fields)),
		}
		for _, field := range section.Fields {
			projectedSection.Fields = append(projectedSection.Fields, EntitySchemaField{
				ID:            field.ID,
				Aliases:       field.Aliases,
				Deprecated:    field.Deprecated,
				LabelKey:      field.LabelKey,
				FallbackLabel: field.FallbackLabel,
				ValueType:     field.ValueType,
				Control:       field.Control,
				Readonly:      field.Readonly,
				Layout:        field.Layout,
				Storage:       field.Storage,
				Workflow: FieldWorkflowIO{
					Readable: field.IO.Readable,
					Writable: field.IO.Writable,
					PortID:   EntityWorkflowPortID(field),
					Aliases:  EntityWorkflowAliases(field),
					Required: field.IO.Required,
					MaxCount: field.IO.MaxCount,
				},
				Binding:    field.Binding,
				Validation: field.Validation,
			})
		}
		projected.Sections = append(projected.Sections, projectedSection)
	}
	return projected
}

func EntityPorts(kind string) (inputs []PortDef, outputs []PortDef) {
	schema, ok := EntitySemanticSchemaForKind(kind)
	if !ok {
		return nil, nil
	}
	for _, section := range schema.Sections {
		for _, field := range section.Fields {
			port := PortDef{
				ID:            EntityWorkflowPortID(field),
				Aliases:       EntityWorkflowAliases(field),
				LabelKey:      field.LabelKey,
				FallbackLabel: field.FallbackLabel,
				Type:          field.ValueType,
				Required:      field.IO.Required,
				MaxCount:      field.IO.MaxCount,
				Deprecated:    field.Deprecated,
			}
			if field.IO.Writable {
				inputs = append(inputs, port)
			}
			if field.IO.Readable {
				outputs = append(outputs, port)
			}
		}
	}
	return inputs, outputs
}

func section(id string, labelKey string, fallback string, fields []EntitySemanticField) EntitySemanticSection {
	return EntitySemanticSection{ID: id, LabelKey: labelKey, FallbackLabel: fallback, Fields: fields}
}

func textField(id string, labelKey string, fallback string, control string, writable bool) EntitySemanticField {
	return EntitySemanticField{
		ID: id, LabelKey: labelKey, FallbackLabel: fallback, ValueType: "text", Control: control,
		Storage: &FieldStorageMap{Column: defaultStorageColumn(id)},
		IO:      FieldIO{Readable: true, Writable: writable},
	}
}

func jsonField(id string, labelKey string, fallback string, writable bool) EntitySemanticField {
	return EntitySemanticField{
		ID: id, LabelKey: labelKey, FallbackLabel: fallback, ValueType: "json", Control: "json_editor",
		Storage: &FieldStorageMap{Column: defaultStorageColumn(id)},
		IO:      FieldIO{Readable: true, Writable: writable},
	}
}

func deprecatedReadonlyField(field EntitySemanticField) EntitySemanticField {
	field.Deprecated = true
	field.Readonly = true
	field.IO.Writable = false
	return field
}

func numberField(id string, labelKey string, fallback string, writable bool) EntitySemanticField {
	return EntitySemanticField{
		ID: id, LabelKey: labelKey, FallbackLabel: fallback, ValueType: "number", Control: "number",
		Storage: &FieldStorageMap{Column: defaultStorageColumn(id)},
		IO:      FieldIO{Readable: true, Writable: writable},
	}
}

func checkboxField(id string, labelKey string, fallback string, writable bool) EntitySemanticField {
	return EntitySemanticField{
		ID: id, LabelKey: labelKey, FallbackLabel: fallback, ValueType: "boolean", Control: "checkbox",
		Storage: &FieldStorageMap{Column: defaultStorageColumn(id)},
		IO:      FieldIO{Readable: true, Writable: writable},
	}
}

func computedTextField(id string, labelKey string, fallback string) EntitySemanticField {
	return EntitySemanticField{
		ID: id, LabelKey: labelKey, FallbackLabel: fallback, ValueType: "text", Control: "computed",
		Readonly: true,
		IO:       FieldIO{Readable: true, Writable: false},
	}
}

func relatedListField(id string, labelKey string, fallback string, nestedKind string) EntitySemanticField {
	return EntitySemanticField{
		ID: id, LabelKey: labelKey, FallbackLabel: fallback, ValueType: "json", Control: "related_entity_list",
		Readonly: true,
		Layout:   EntityFieldLayout{Width: "full", NestedKind: nestedKind, Relation: "children"},
		IO:       FieldIO{Readable: true, Writable: false},
	}
}

func candidateResourceField(id string, labelKey string, fallback string) EntitySemanticField {
	return EntitySemanticField{
		ID: id, Aliases: []string{"candidate_item"}, WorkflowAliases: []string{"candidate_item"}, LabelKey: labelKey, FallbackLabel: fallback, ValueType: "resource", Control: "related_entity_list",
		Layout: EntityFieldLayout{Width: "full", NestedKind: "asset_slot", Relation: "children"},
		IO:     FieldIO{Readable: true, Writable: true, MaxCount: 12},
		Binding: &FieldBindingMap{
			Role:     domainresourcebinding.RoleCandidate,
			Slot:     id,
			Multiple: true,
		},
	}
}

func resourceField(id string, labelKey string, fallback string, portID string, role string, primary bool) EntitySemanticField {
	return mediaField(id, labelKey, fallback, portID, "resource", role, primary)
}

func mediaField(id string, labelKey string, fallback string, portID string, valueType string, role string, primary bool) EntitySemanticField {
	maxCount := 0
	control := "resource_gallery"
	if primary {
		maxCount = 1
		control = "resource_picker"
	}
	return EntitySemanticField{
		ID: id, LabelKey: labelKey, FallbackLabel: fallback, ValueType: valueType, Control: control,
		IO:           FieldIO{Readable: true, Writable: true, MaxCount: maxCount},
		WorkflowPort: portID,
		Binding:      &FieldBindingMap{Role: role, Slot: portID, IsPrimary: primary, Multiple: !primary},
	}
}

func uniqueStrings(items []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(items))
	for _, item := range items {
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		result = append(result, item)
	}
	return result
}

func unstoredField(field EntitySemanticField) EntitySemanticField {
	field.Storage = nil
	return field
}

func storedField(field EntitySemanticField, column string) EntitySemanticField {
	field.Storage = &FieldStorageMap{Column: column}
	return field
}

func workflowPort(field EntitySemanticField, portID string) EntitySemanticField {
	field.WorkflowPort = portID
	return field
}

func stringInSlice(value string, items []string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

func defaultStorageColumn(id string) string {
	switch id {
	case "settings":
		return "core_settings"
	default:
		return id
	}
}

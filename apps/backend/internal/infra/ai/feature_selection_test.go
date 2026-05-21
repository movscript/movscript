package ai

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestSelectFeatureModelPrefersDefaultModel(t *testing.T) {
	defaultID := uint(2)
	cfg, modelID, ok := selectFeatureModel("test.prefers_default", []featureModelCandidate{
		{
			cfg:      model.AIModelConfig{ModelDefID: "high-priority", Priority: 100},
			def:      ResolveModelDef("high-priority", AdapterOpenAICompat, "", CapabilityText, "", false, 0, 0, "", ""),
			priority: 100,
		},
		{
			cfg:      model.AIModelConfig{ModelDefID: "default-model", ModelIDOverride: "override-model", Priority: 1, Model: gormModel(2)},
			def:      ResolveModelDef("default-model", AdapterOpenAICompat, "", CapabilityText, "", false, 0, 0, "", ""),
			priority: 1,
		},
	}, &defaultID)

	if !ok {
		t.Fatal("expected selected model")
	}
	if cfg.cfg.ModelDefID != "default-model" {
		t.Fatalf("selected model = %q, want default-model", cfg.cfg.ModelDefID)
	}
	if modelID != "override-model" {
		t.Fatalf("model ID = %q, want override-model", modelID)
	}
}

func gormModel(id uint) gorm.Model {
	return gorm.Model{ID: id}
}

func TestSelectFeatureModelFallsBackToPriorityWhenDefaultMissing(t *testing.T) {
	defaultID := uint(9)
	cfg, _, ok := selectFeatureModel("test.fallback_priority", []featureModelCandidate{
		{
			cfg:      model.AIModelConfig{ModelDefID: "low-priority", Priority: 1},
			def:      ResolveModelDef("low-priority", AdapterOpenAICompat, "", CapabilityText, "", false, 0, 0, "", ""),
			priority: 1,
		},
		{
			cfg:      model.AIModelConfig{ModelDefID: "high-priority", Priority: 10},
			def:      ResolveModelDef("high-priority", AdapterOpenAICompat, "", CapabilityText, "", false, 0, 0, "", ""),
			priority: 10,
		},
	}, &defaultID)

	if !ok {
		t.Fatal("expected selected model")
	}
	if cfg.cfg.ModelDefID != "high-priority" {
		t.Fatalf("selected model = %q, want high-priority", cfg.cfg.ModelDefID)
	}
}

func TestSelectFeatureModelRoundRobinsEqualPriority(t *testing.T) {
	candidates := []featureModelCandidate{
		{
			cfg:      model.AIModelConfig{ModelDefID: "alpha", Priority: 10},
			def:      ResolveModelDef("alpha", AdapterOpenAICompat, "", CapabilityText, "", false, 0, 0, "", ""),
			priority: 10,
		},
		{
			cfg:      model.AIModelConfig{ModelDefID: "beta", Priority: 10},
			def:      ResolveModelDef("beta", AdapterOpenAICompat, "", CapabilityText, "", false, 0, 0, "", ""),
			priority: 10,
		},
	}

	got := make([]string, 0, 4)
	for range 4 {
		cfg, _, ok := selectFeatureModel("test.round_robin", candidates, nil)
		if !ok {
			t.Fatal("expected selected model")
		}
		got = append(got, cfg.cfg.ModelDefID)
	}

	if !slices.Equal(got, []string{"alpha", "beta", "alpha", "beta"}) {
		t.Fatalf("round robin sequence = %#v, want alpha/beta alternating", got)
	}
}

func TestGetModelsByCapabilityMergesProviderVariants(t *testing.T) {
	db := openAITestDB(t)
	createProviderVariant(t, db, 1, "OpenAI A", "gpt-image-1", 10)
	createProviderVariant(t, db, 2, "OpenAI B", "gpt-image-1", 10)
	createProviderVariant(t, db, 3, "Other", "other-image", 5)

	svc := NewAIService(db, NewRegistry(db, nil))
	models, err := svc.GetModelsByCapability(CapabilityImage)
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 2 {
		t.Fatalf("logical model count = %d, want 2: %#v", len(models), models)
	}
	if models[0].LogicalModelID != "gpt-image-1" || models[0].ProviderVariants != 2 || models[0].ProviderName != "" {
		t.Fatalf("unexpected merged model: %#v", models[0])
	}
}

func TestGetProviderModelsByCapabilityKeepsProviderVariants(t *testing.T) {
	db := openAITestDB(t)
	createProviderVariant(t, db, 1, "OpenAI A", "gpt-image-1", 10)
	createProviderVariant(t, db, 2, "OpenAI B", "gpt-image-1", 10)

	svc := NewAIService(db, NewRegistry(db, nil))
	models, err := svc.GetProviderModelsByCapability(CapabilityImage)
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 2 {
		t.Fatalf("provider variant count = %d, want 2", len(models))
	}
	if models[0].ProviderName == "" || models[1].ProviderName == "" {
		t.Fatalf("provider variants should expose provider names: %#v", models)
	}
}

func TestResolveGenerationModelRouteUsesPublicModelIDAndRoundRobinsProviders(t *testing.T) {
	db := openAITestDB(t)
	createProviderVariant(t, db, 1, "OpenAI A", "gpt-image-1", 10)
	createProviderVariant(t, db, 2, "OpenAI B", "gpt-image-1", 10)

	svc := NewAIService(db, NewRegistry(db, nil))
	var got []uint
	for range 4 {
		route, err := svc.ResolveGenerationModelRoute("gpt-image-1", CapabilityImage)
		if err != nil {
			t.Fatal(err)
		}
		if route.ModelID != "gpt-image-1" || route.ProviderModelID != "gpt-image-1" {
			t.Fatalf("unexpected route: %#v", route)
		}
		got = append(got, route.ModelConfigID)
	}
	if !slices.Equal(got, []uint{1, 2, 1, 2}) {
		t.Fatalf("route sequence = %#v, want provider configs 1/2 alternating", got)
	}
}

func TestGetModelsByCapabilityDoesNotMergeDifferentModelContracts(t *testing.T) {
	db := openAITestDB(t)
	createProviderVariantWithParams(t, db, 1, "OpenAI A", "gpt-image-1", 10, `[{"key":"image_size","label":"Image Size","type":"select","options":["1024x1024"],"default":"1024x1024"}]`)
	createProviderVariantWithParams(t, db, 2, "OpenAI B", "gpt-image-1", 10, `[{"key":"image_size","label":"Image Size","type":"select","options":["1536x1024"],"default":"1536x1024"}]`)

	svc := NewAIService(db, NewRegistry(db, nil))
	models, err := svc.GetModelsByCapability(CapabilityImage)
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 2 {
		t.Fatalf("logical model count = %d, want 2 distinct contracts: %#v", len(models), models)
	}
	for _, got := range models {
		if got.ProviderVariants != 1 {
			t.Fatalf("model contract %s was merged across provider variants: %#v", got.ModelDefID, got)
		}
		if len(got.SupportedParams) != 1 || got.SupportedParams[0].Key != "image_size" || len(got.SupportedParams[0].Options) != 1 {
			t.Fatalf("unexpected supported params for %s: %#v", got.ModelDefID, got.SupportedParams)
		}
	}
}

func TestGetModelsByCapabilityExposesResolvedModelContract(t *testing.T) {
	db := openAITestDB(t)
	cred := model.AICredential{
		Model:       gormModel(1),
		AdapterType: AdapterVolcen,
		DisplayName: "Volcen",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	cfg := model.AIModelConfig{
		Model:              gormModel(1),
		CredentialID:       cred.ID,
		ModelDefID:         "seedance-test",
		IsEnabled:          true,
		CustomDisplayName:  "Seedance Test",
		CustomCapabilities: CapabilityVideo,
		CustomPricingMode:  string(PricingPerSecond),
		CustomSupportedParams: `{
			"allow":["duration","frames","draft","resolution","return_last_frame","sequential_image_generation","image_count"],
			"override":{
				"duration":{"conflicts_with":["frames"]},
				"resolution":{"conditional_enum":[{"when_param":"draft","when_value":true,"options":["480p"]}]},
				"return_last_frame":{"conditional_const":[{"when_param":"draft","when_value":true,"value":false}]}
			},
			"add":[
				{"key":"sequential_image_generation","label":"组图","type":"select","options":["disabled","auto"],"default":"disabled"},
				{"key":"image_count","label":"生成张数","type":"number","min":1,"max":15,"step":1,"requires_value":[{"param":"sequential_image_generation","value":"auto"}]}
			]
		}`,
	}
	if err := db.Create(&cfg).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}

	svc := NewAIService(db, NewRegistry(db, nil))
	models, err := svc.GetModelsByCapability(CapabilityVideo)
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 1 {
		t.Fatalf("model count = %d, want 1: %#v", len(models), models)
	}
	got := models[0]
	if got.InputRequirements.Image.Min != 0 || got.InputRequirements.Video.Max != 0 {
		t.Fatalf("unexpected video input requirements: %#v", got.InputRequirements)
	}
	for _, key := range []string{"duration", "frames", "draft", "resolution", "return_last_frame", "sequential_image_generation", "image_count"} {
		if !hasParam(got.SupportedParams, key) {
			t.Fatalf("expected supported param %q in public model contract: %#v", key, got.SupportedParams)
		}
	}
	allOf, ok := got.ParamsSchema["allOf"].([]any)
	if !ok || len(allOf) != 4 {
		t.Fatalf("expected four schema rules in public model contract, got %#v", got.ParamsSchema["allOf"])
	}
	props, ok := got.ParamsSchema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("expected schema properties in public model contract, got %#v", got.ParamsSchema["properties"])
	}
	frames, ok := props["frames"].(map[string]any)
	if !ok {
		t.Fatalf("expected frames property in public model schema, got %#v", props["frames"])
	}
	enumValues, enumOK := frames["enum"].([]int)
	if !schemaNumberEquals(frames["minimum"], 29) || !schemaNumberEquals(frames["maximum"], 289) || !enumOK || len(enumValues) != 66 || enumValues[0] != 29 || enumValues[len(enumValues)-1] != 289 || frames["description"] == "" {
		t.Fatalf("expected frames JSON Schema constraints in public model schema, got %#v", frames)
	}
	if !schemaHasConflictRule(allOf, "duration", "frames") {
		t.Fatalf("expected duration/frames conflict in public model schema: %#v", allOf)
	}
	if !schemaHasConditionalPropertyRule(allOf, "draft", true, "resolution", "enum", []any{"480p"}, false) {
		t.Fatalf("expected draft=true resolution rule in public model schema: %#v", allOf)
	}
	if !schemaHasConditionalPropertyRule(allOf, "draft", true, "return_last_frame", "const", false, false) {
		t.Fatalf("expected draft=true return_last_frame rule in public model schema: %#v", allOf)
	}
	if !schemaHasConditionalPropertyRule(allOf, "", nil, "sequential_image_generation", "const", "auto", true) {
		t.Fatalf("expected image_count dependency rule in public model schema: %#v", allOf)
	}
}

func TestGetProviderModelsByCapabilityExposesAllVisualPresetContracts(t *testing.T) {
	db := openAITestDB(t)
	for index, preset := range ModelPresets() {
		if !hasVisualGenerationCapability(preset.Capabilities) {
			continue
		}
		paramsJSON, err := json.Marshal(preset.SupportedParams)
		if err != nil {
			t.Fatalf("marshal supported params for %s: %v", preset.ID, err)
		}
		id := uint(index + 1)
		cred := model.AICredential{
			Model:       gormModel(id),
			AdapterType: preset.AdapterType,
			DisplayName: preset.ID,
			IsEnabled:   true,
		}
		if err := db.Create(&cred).Error; err != nil {
			t.Fatalf("create credential for %s: %v", preset.ID, err)
		}
		cfg := model.AIModelConfig{
			Model:                 gormModel(id),
			CredentialID:          cred.ID,
			ModelDefID:            preset.ID,
			IsEnabled:             true,
			CustomDisplayName:     preset.DisplayName,
			CustomCapabilities:    strings.Join(preset.Capabilities, ","),
			CustomPricingMode:     string(preset.PricingMode),
			CustomAcceptsImage:    preset.AcceptsImageInput,
			CustomMaxInputImages:  preset.MaxInputImages,
			CustomMaxInputVideos:  preset.MaxInputVideos,
			CustomSupportedParams: string(paramsJSON),
		}
		if err := db.Create(&cfg).Error; err != nil {
			t.Fatalf("create model config for %s: %v", preset.ID, err)
		}
	}

	svc := NewAIService(db, NewRegistry(db, nil))
	for _, capability := range []string{CapabilityImage, CapabilityImageEdit, CapabilityVideo, CapabilityVideoI2V, CapabilityVideoV2V} {
		models, err := svc.GetProviderModelsByCapability(capability)
		if err != nil {
			t.Fatalf("list provider models for %s: %v", capability, err)
		}
		for _, got := range models {
			if got.ModelDefID == "" || got.DisplayName == "" {
				t.Fatalf("runtime model for %s is missing identity fields: %#v", capability, got)
			}
			if !modelHasCapability(&ModelDef{Capabilities: got.Capabilities}, capability) {
				t.Fatalf("runtime model %s does not expose requested capability %s: %#v", got.ModelDefID, capability, got.Capabilities)
			}
			if len(got.SupportedParams) == 0 {
				t.Fatalf("runtime visual model %s has no supported_params", got.ModelDefID)
			}
			props, ok := got.ParamsSchema["properties"].(map[string]any)
			if !ok || len(props) == 0 {
				t.Fatalf("runtime visual model %s has no params_schema properties: %#v", got.ModelDefID, got.ParamsSchema)
			}
			for _, param := range got.SupportedParams {
				if param.Key == "" {
					t.Fatalf("runtime visual model %s exposes empty param key: %#v", got.ModelDefID, got.SupportedParams)
				}
				if _, ok := props[param.Key]; !ok {
					t.Fatalf("runtime visual model %s schema missing param %q: %#v", got.ModelDefID, param.Key, props)
				}
			}
			if got.InputRequirements.Image.Min != expectedImageInputMin(capability) {
				t.Fatalf("runtime visual model %s image min mismatch: %#v", got.ModelDefID, got.InputRequirements.Image)
			}
			if got.InputRequirements.Video.Min != expectedVideoInputMin(capability) {
				t.Fatalf("runtime visual model %s video min mismatch: %#v", got.ModelDefID, got.InputRequirements.Video)
			}
			if got.InputRequirements.Image.Max < -1 || got.InputRequirements.Video.Max < -1 {
				t.Fatalf("runtime visual model %s has invalid max input requirements: %#v", got.ModelDefID, got.InputRequirements)
			}
		}
	}
}

func TestResolveRuntimeModelConfigRoundRobinsLogicalProviderVariants(t *testing.T) {
	db := openAITestDB(t)
	createProviderVariant(t, db, 1, "OpenAI A", "gpt-image-1", 10)
	createProviderVariant(t, db, 2, "OpenAI B", "gpt-image-1", 10)

	svc := NewAIService(db, NewRegistry(db, nil))
	got := make([]uint, 0, 4)
	for range 4 {
		id, err := svc.ResolveRuntimeModelConfig(1, CapabilityImage)
		if err != nil {
			t.Fatal(err)
		}
		got = append(got, id)
	}
	if !slices.Equal(got, []uint{1, 2, 1, 2}) {
		t.Fatalf("runtime provider sequence = %#v, want 1/2 alternating", got)
	}
}

func TestGetModelsByCapabilityUsesQueriedCapabilityInputRequirements(t *testing.T) {
	db := openAITestDB(t)
	cred := model.AICredential{
		Model:       gormModel(1),
		AdapterType: AdapterOpenAICompat,
		DisplayName: "OpenAI",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	cfg := model.AIModelConfig{
		Model:                gormModel(1),
		CredentialID:         cred.ID,
		ModelDefID:           "gpt-image-2",
		IsEnabled:            true,
		CustomDisplayName:    "GPT Image 2",
		CustomCapabilities:   strings.Join([]string{CapabilityImage, CapabilityImageEdit}, ","),
		CustomPricingMode:    string(PricingPerImage),
		CustomAcceptsImage:   true,
		CustomMaxInputImages: 7,
		CustomImageEditField: "image[]",
	}
	if err := db.Create(&cfg).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}

	svc := NewAIService(db, NewRegistry(db, nil))
	imageModels, err := svc.GetModelsByCapability(CapabilityImage)
	if err != nil {
		t.Fatal(err)
	}
	if len(imageModels) != 1 {
		t.Fatalf("image model count = %d, want 1: %#v", len(imageModels), imageModels)
	}
	if imageModels[0].InputRequirements.Image.Min != 0 || imageModels[0].InputRequirements.Image.Max != 7 {
		t.Fatalf("text-to-image contract should allow zero reference images, got %#v", imageModels[0].InputRequirements.Image)
	}

	editModels, err := svc.GetModelsByCapability(CapabilityImageEdit)
	if err != nil {
		t.Fatal(err)
	}
	if len(editModels) != 1 {
		t.Fatalf("image_edit model count = %d, want 1: %#v", len(editModels), editModels)
	}
	if editModels[0].InputRequirements.Image.Min != 1 || editModels[0].InputRequirements.Image.Max != 7 {
		t.Fatalf("image_edit contract should require reference images, got %#v", editModels[0].InputRequirements.Image)
	}
}

func expectedImageInputMin(capability string) int {
	if capability == CapabilityImageEdit || capability == CapabilityVideoI2V {
		return 1
	}
	return 0
}

func expectedVideoInputMin(capability string) int {
	if capability == CapabilityVideoV2V {
		return 1
	}
	return 0
}

func openAITestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return testutil.OpenSQLite(t, "ai.db", &model.AICredential{}, &model.AIModelConfig{})
}

func createProviderVariant(t *testing.T, db *gorm.DB, id uint, providerName, modelID string, priority int) {
	createProviderVariantWithParams(t, db, id, providerName, modelID, priority, "")
}

func createProviderVariantWithParams(t *testing.T, db *gorm.DB, id uint, providerName, modelID string, priority int, supportedParams string) {
	t.Helper()
	cred := model.AICredential{
		Model:       gormModel(id),
		AdapterType: AdapterOpenAICompat,
		DisplayName: providerName,
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	cfg := model.AIModelConfig{
		Model:                 gormModel(id),
		CredentialID:          cred.ID,
		ModelDefID:            modelID,
		IsEnabled:             true,
		Priority:              priority,
		CustomDisplayName:     modelID,
		CustomCapabilities:    CapabilityImage,
		CustomSupportedParams: supportedParams,
	}
	if err := db.Create(&cfg).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}
}

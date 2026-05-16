package aiadmin

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/app/dto"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestModelConfigRejectsInvalidCustomSupportedParamsBeforeSave(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	_, err := service.CreateModelConfig(ctx, 1, dto.AIModelConfigInput{
		ModelDefID:            "bad-video",
		CustomCapabilities:    "video",
		CustomSupportedParams: `[{"key":"duration","type":"select"}]`,
	})
	if !errors.Is(err, ErrInvalidModelConfig) {
		t.Fatalf("expected ErrInvalidModelConfig, got %v", err)
	}

	cfgs, err := service.ListModelConfigs(ctx, "1")
	if err != nil {
		t.Fatalf("list model configs: %v", err)
	}
	if len(cfgs) != 0 {
		t.Fatalf("expected invalid config not to be saved, got %#v", cfgs)
	}
}

func TestModelConfigRejectsInvalidInputLimitBeforeSave(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	_, err := service.CreateModelConfig(ctx, 1, dto.AIModelConfigInput{
		ModelDefID:            "bad-image",
		CustomCapabilities:    "image",
		CustomMaxInputImages:  -2,
		CustomSupportedParams: `[{"key":"aspect_ratio","label":"Aspect Ratio","type":"select","options":["1:1"],"default":"1:1"}]`,
	})
	if !errors.Is(err, ErrInvalidModelConfig) {
		t.Fatalf("expected ErrInvalidModelConfig, got %v", err)
	}
	if !strings.Contains(err.Error(), "custom_max_input_images") {
		t.Fatalf("expected invalid input limit field in error, got %v", err)
	}

	cfgs, err := service.ListModelConfigs(ctx, "1")
	if err != nil {
		t.Fatalf("list model configs: %v", err)
	}
	if len(cfgs) != 0 {
		t.Fatalf("expected invalid config not to be saved, got %#v", cfgs)
	}
}

func TestPatchModelConfigRejectsInvalidCustomSupportedParamsAndKeepsExisting(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()
	validParams := `{"allow":["duration"],"override":{"duration":{"type":"select","options":["5"],"default":"5"}}}`
	cfg, err := service.CreateModelConfig(ctx, 1, dto.AIModelConfigInput{
		ModelDefID:            "video-model",
		CustomCapabilities:    "video",
		CustomSupportedParams: validParams,
	})
	if err != nil {
		t.Fatalf("create valid config: %v", err)
	}

	_, err = service.PatchModelConfig(ctx, PatchModelConfigInput{
		ID:                    "1",
		CustomSupportedParams: ptrString(`[{"key":"duration","type":"number","min":10,"max":5}]`),
	})
	if !errors.Is(err, ErrInvalidModelConfig) {
		t.Fatalf("expected ErrInvalidModelConfig, got %v", err)
	}

	got, err := service.GetModelConfig(ctx, "1")
	if err != nil {
		t.Fatalf("get model config: %v", err)
	}
	if got.ID != cfg.ID || got.CustomSupportedParams != validParams {
		t.Fatalf("expected existing params to remain unchanged, got %#v", got)
	}
}

func TestPatchModelConfigRejectsInvalidInputLimitAndKeepsExisting(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()
	cfg, err := service.CreateModelConfig(ctx, 1, dto.AIModelConfigInput{
		ModelDefID:            "image-model",
		CustomCapabilities:    "image",
		CustomAcceptsImage:    true,
		CustomMaxInputImages:  4,
		CustomSupportedParams: `[{"key":"aspect_ratio","label":"Aspect Ratio","type":"select","options":["1:1"],"default":"1:1"}]`,
	})
	if err != nil {
		t.Fatalf("create valid config: %v", err)
	}

	invalidLimit := -2
	_, err = service.PatchModelConfig(ctx, PatchModelConfigInput{
		ID:                   "1",
		CustomMaxInputImages: &invalidLimit,
	})
	if !errors.Is(err, ErrInvalidModelConfig) {
		t.Fatalf("expected ErrInvalidModelConfig, got %v", err)
	}

	got, err := service.GetModelConfig(ctx, "1")
	if err != nil {
		t.Fatalf("get model config: %v", err)
	}
	if got.ID != cfg.ID || got.CustomMaxInputImages != 4 {
		t.Fatalf("expected existing input limit to remain unchanged, got %#v", got)
	}
}

func TestDeleteModelConfigReturnsDeletedConfigAndMissingIsNotFound(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	cfg, err := service.CreateModelConfig(ctx, 1, dto.AIModelConfigInput{
		ModelDefID:           "delete-me",
		CustomCapabilities:   "text",
		CustomPricingMode:    "per_token",
		CreditsInputPer1M:    1,
		CreditsOutputPer1M:   2,
		CustomAcceptsImage:   false,
		CustomMaxInputImages: 0,
		CustomMaxInputVideos: 0,
	})
	if err != nil {
		t.Fatalf("CreateModelConfig returned error: %v", err)
	}

	deleted, err := service.DeleteModelConfig(ctx, strconvID(cfg.ID))
	if err != nil {
		t.Fatalf("DeleteModelConfig returned error: %v", err)
	}
	if deleted.ID != cfg.ID || deleted.ModelDefID != "delete-me" {
		t.Fatalf("unexpected deleted model config: %+v", deleted)
	}
	if _, err := service.GetModelConfig(ctx, strconvID(cfg.ID)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetModelConfig after delete error = %v, want ErrNotFound", err)
	}
	if _, err := service.DeleteModelConfig(ctx, strconvID(cfg.ID)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("DeleteModelConfig missing error = %v, want ErrNotFound", err)
	}
}

func TestDeleteCredentialReturnsDeletedCredentialAndMissingIsNotFound(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	deleted, err := service.DeleteCredential(ctx, "1")
	if err != nil {
		t.Fatalf("DeleteCredential returned error: %v", err)
	}
	if deleted.ID != 1 || deleted.AdapterType != "volcen" {
		t.Fatalf("unexpected deleted credential: %+v", deleted)
	}
	if _, err := service.GetCredential(ctx, 1); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetCredential after delete error = %v, want ErrNotFound", err)
	}
	if _, err := service.DeleteCredential(ctx, "1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("DeleteCredential missing error = %v, want ErrNotFound", err)
	}
	if _, err := service.DeleteCredential(ctx, "bad"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("DeleteCredential invalid id error = %v, want ErrNotFound", err)
	}
}

func TestModelConfigSaveUsesCredentialAdapterForProfileValidation(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()
	params := `{"allow":["duration"],"override":{"duration":{"options":["5"],"default":"5"}}}`
	cfg, err := service.CreateModelConfig(ctx, 1, dto.AIModelConfigInput{
		ModelDefID:            "video-model",
		CustomCapabilities:    "video",
		CustomSupportedParams: params,
	})
	if err != nil {
		t.Fatalf("create profile override that inherits adapter param type/label: %v", err)
	}
	if cfg.CustomSupportedParams != params {
		t.Fatalf("expected profile params to be saved, got %#v", cfg.CustomSupportedParams)
	}

	_, err = service.PatchModelConfig(ctx, PatchModelConfigInput{
		ID:                    "1",
		CustomSupportedParams: ptrString(`{"allow":["duration"],"override":{"duration":{"options":["6"],"default":"6"}}}`),
	})
	if err != nil {
		t.Fatalf("patch profile override that inherits adapter param type/label: %v", err)
	}
}

func TestPreviewModelConfigContractReturnsResolvedBackendContract(t *testing.T) {
	service := newTestService(t)
	preview, err := service.PreviewModelConfigContract(PreviewModelConfigContractInput{
		AdapterType:           "volcen",
		CustomCapabilities:    "video",
		CustomSupportedParams: `{"allow":["duration","resolution"],"override":{"duration":{"type":"select","options":["5"],"default":"5"}}}`,
	})
	if err != nil {
		t.Fatalf("preview contract: %v", err)
	}
	if len(preview.Capabilities) != 1 || preview.Capabilities[0] != "video" {
		t.Fatalf("unexpected capabilities: %#v", preview.Capabilities)
	}
	if len(preview.SupportedParams) != 2 {
		t.Fatalf("expected two supported params, got %#v", preview.SupportedParams)
	}
	if preview.ParamsSchema["additionalProperties"] != false {
		t.Fatalf("expected closed params schema, got %#v", preview.ParamsSchema)
	}
	if preview.AgentContract.ContractVersion != 1 {
		t.Fatalf("expected agent contract v1, got %#v", preview.AgentContract)
	}
	if len(preview.AgentContract.SupportedParamKeys) != 2 || preview.AgentContract.SupportedParamKeys[0] != "duration" || preview.AgentContract.SupportedParamKeys[1] != "resolution" {
		t.Fatalf("unexpected agent supported keys: %#v", preview.AgentContract.SupportedParamKeys)
	}
}

func TestPreviewModelConfigContractUsesInputLimits(t *testing.T) {
	service := newTestService(t)
	preview, err := service.PreviewModelConfigContract(PreviewModelConfigContractInput{
		AdapterType:           ai.AdapterVolcen,
		CustomCapabilities:    strings.Join([]string{ai.CapabilityVideoI2V, ai.CapabilityVideoV2V}, ","),
		CustomAcceptsImage:    true,
		CustomMaxInputImages:  4,
		CustomMaxInputVideos:  2,
		CustomSupportedParams: `{"allow":["duration"],"override":{"duration":{"type":"select","options":["5"],"default":"5"}}}`,
	})
	if err != nil {
		t.Fatalf("preview contract: %v", err)
	}
	if preview.AgentContract.InputRequirements.Image.Min != 1 || preview.AgentContract.InputRequirements.Image.Max != 4 {
		t.Fatalf("unexpected image input requirements: %#v", preview.AgentContract.InputRequirements.Image)
	}
	if preview.AgentContract.InputRequirements.Video.Min != 1 || preview.AgentContract.InputRequirements.Video.Max != 2 {
		t.Fatalf("unexpected video input requirements: %#v", preview.AgentContract.InputRequirements.Video)
	}
}

func TestPreviewModelConfigContractAllowsUnlimitedInputLimit(t *testing.T) {
	service := newTestService(t)
	preview, err := service.PreviewModelConfigContract(PreviewModelConfigContractInput{
		AdapterType:           ai.AdapterVolcen,
		CustomCapabilities:    ai.CapabilityVideoI2V,
		CustomAcceptsImage:    true,
		CustomMaxInputImages:  -1,
		CustomSupportedParams: `{"allow":["duration"],"override":{"duration":{"type":"select","options":["5"],"default":"5"}}}`,
	})
	if err != nil {
		t.Fatalf("preview contract: %v", err)
	}
	if preview.AgentContract.InputRequirements.Image.Min != 1 || preview.AgentContract.InputRequirements.Image.Max != -1 {
		t.Fatalf("unexpected unlimited image input requirements: %#v", preview.AgentContract.InputRequirements.Image)
	}
}

func TestPreviewModelConfigContractRejectsInvalidInputLimit(t *testing.T) {
	service := newTestService(t)
	_, err := service.PreviewModelConfigContract(PreviewModelConfigContractInput{
		AdapterType:           ai.AdapterVolcen,
		CustomCapabilities:    ai.CapabilityVideoI2V,
		CustomMaxInputImages:  -2,
		CustomSupportedParams: `{"allow":["duration"],"override":{"duration":{"type":"select","options":["5"],"default":"5"}}}`,
	})
	if !errors.Is(err, ErrInvalidModelConfig) {
		t.Fatalf("expected ErrInvalidModelConfig, got %v", err)
	}
	if !strings.Contains(err.Error(), "custom_max_input_images") {
		t.Fatalf("expected field name in error, got %v", err)
	}
}

func TestPresetSupportedParamsRoundTripThroughSavePreviewAndRuntime(t *testing.T) {
	service := newTestService(t)
	for _, preset := range ai.ModelPresets() {
		if !hasVisualGenerationCapability(preset.Capabilities) {
			continue
		}
		preset := preset
		t.Run(preset.ID, func(t *testing.T) {
			paramsJSON, err := json.Marshal(preset.SupportedParams)
			if err != nil {
				t.Fatalf("marshal preset supported params: %v", err)
			}

			cfg, err := service.CreateModelConfig(context.Background(), 1, dto.AIModelConfigInput{
				ModelDefID:            preset.ID,
				CustomDisplayName:     preset.DisplayName,
				CustomCapabilities:    strings.Join(preset.Capabilities, ","),
				CustomPricingMode:     string(preset.PricingMode),
				CustomAcceptsImage:    preset.AcceptsImageInput,
				CustomMaxInputImages:  preset.MaxInputImages,
				CustomMaxInputVideos:  preset.MaxInputVideos,
				CustomSupportedParams: string(paramsJSON),
			})
			if err != nil {
				t.Fatalf("save preset-backed model config: %v", err)
			}

			preview, err := service.PreviewModelConfigContract(PreviewModelConfigContractInput{
				AdapterType:           preset.AdapterType,
				CustomCapabilities:    cfg.CustomCapabilities,
				CustomAcceptsImage:    cfg.CustomAcceptsImage,
				CustomMaxInputImages:  cfg.CustomMaxInputImages,
				CustomMaxInputVideos:  cfg.CustomMaxInputVideos,
				CustomSupportedParams: cfg.CustomSupportedParams,
			})
			if err != nil {
				t.Fatalf("preview saved preset-backed contract: %v", err)
			}
			runtime := ai.ResolveModelDef(
				cfg.ModelDefID,
				preset.AdapterType,
				cfg.CustomDisplayName,
				cfg.CustomCapabilities,
				cfg.CustomPricingMode,
				cfg.CustomAcceptsImage,
				cfg.CustomMaxInputImages,
				cfg.CustomMaxInputVideos,
				cfg.CustomImageEditField,
				cfg.CustomSupportedParams,
			)

			if !runtime.SupportedParamsExplicit {
				t.Fatal("expected saved preset params to be treated as explicit model contract")
			}
			assertParamDefsJSONEqual(t, preview.SupportedParams, runtime.SupportedParams)
			if !stringSlicesEqual(preview.AgentContract.SupportedParamKeys, paramKeys(runtime.SupportedParams)) {
				t.Fatalf("agent supported keys do not match runtime params: got %#v runtime %#v", preview.AgentContract.SupportedParamKeys, paramKeys(runtime.SupportedParams))
			}
			if preview.AgentContract.InputRequirements.Image.Min != expectedImageInputMin(runtime) || preview.AgentContract.InputRequirements.Image.Max != runtime.MaxInputImages {
				t.Fatalf("agent image input requirements do not match runtime: got %#v runtime max=%d", preview.AgentContract.InputRequirements.Image, runtime.MaxInputImages)
			}
			if preview.AgentContract.InputRequirements.Video.Min != expectedVideoInputMin(runtime) || preview.AgentContract.InputRequirements.Video.Max != runtime.MaxInputVideos {
				t.Fatalf("agent video input requirements do not match runtime: got %#v runtime max=%d", preview.AgentContract.InputRequirements.Video, runtime.MaxInputVideos)
			}
			if preview.AgentContract.ContractVersion != 1 {
				t.Fatalf("expected agent contract v1, got %#v", preview.AgentContract)
			}
		})
	}

	preset := modelPresetByID(t, "volcengine:seedance-1-5-pro")
	paramsJSON, err := json.Marshal(preset.SupportedParams)
	if err != nil {
		t.Fatalf("marshal preset supported params: %v", err)
	}
	preview, err := service.PreviewModelConfigContract(PreviewModelConfigContractInput{
		AdapterType:           preset.AdapterType,
		CustomCapabilities:    strings.Join(preset.Capabilities, ","),
		CustomAcceptsImage:    preset.AcceptsImageInput,
		CustomMaxInputImages:  preset.MaxInputImages,
		CustomMaxInputVideos:  preset.MaxInputVideos,
		CustomSupportedParams: string(paramsJSON),
	})
	if err != nil {
		t.Fatalf("preview seedance preset-backed contract: %v", err)
	}
	for _, key := range []string{"duration", "resolution", "draft", "return_last_frame", "service_tier"} {
		if agentContractParam(preview.AgentContract, key) == nil {
			t.Fatalf("expected agent contract to include %s, got %#v", key, preview.AgentContract.SupportedParamKeys)
		}
	}
	resolution := agentContractParam(preview.AgentContract, "resolution")
	if resolution == nil || len(resolution.ConditionalEnum) != 1 || resolution.ConditionalEnum[0].WhenParam != "draft" {
		t.Fatalf("expected draft resolution rule after round trip, got %#v", resolution)
	}
	returnLastFrame := agentContractParam(preview.AgentContract, "return_last_frame")
	if returnLastFrame == nil || len(returnLastFrame.ConditionalConst) != 1 || returnLastFrame.ConditionalConst[0].Value != false {
		t.Fatalf("expected return_last_frame draft rule after round trip, got %#v", returnLastFrame)
	}
}

func hasVisualGenerationCapability(capabilities []string) bool {
	for _, capability := range capabilities {
		switch capability {
		case ai.CapabilityImage, ai.CapabilityImageEdit, ai.CapabilityVideo, ai.CapabilityVideoI2V, ai.CapabilityVideoV2V:
			return true
		}
	}
	return false
}

func expectedImageInputMin(def *ai.ModelDef) int {
	if containsString(def.Capabilities, ai.CapabilityImageEdit) || containsString(def.Capabilities, ai.CapabilityVideoI2V) {
		return 1
	}
	return 0
}

func expectedVideoInputMin(def *ai.ModelDef) int {
	if containsString(def.Capabilities, ai.CapabilityVideoV2V) {
		return 1
	}
	return 0
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func TestPreviewModelConfigContractReturnsAgentCompactRules(t *testing.T) {
	service := newTestService(t)
	expectedContract := loadAgentCompactContractFixture(t)
	preview, err := service.PreviewModelConfigContract(PreviewModelConfigContractInput{
		AdapterType:          "volcen",
		CustomCapabilities:   ai.CapabilityVideoI2V,
		CustomAcceptsImage:   true,
		CustomMaxInputImages: 4,
		CustomSupportedParams: `[
			{"key":"draft","label":"Draft","type":"boolean"},
			{"key":"resolution","label":"Resolution","type":"select","options":["480p","720p"],"default":"480p","json_schema":{"enum":["360p","480p"]},"conditional_enum":[{"when_param":"draft","when_value":true,"options":["480p"]}]},
			{"key":"frames","label":"Frames","type":"number","min":0,"max":0,"step":4,"json_schema":{"description":"Frame count must match 25 + 4n.","enum":[29,33,37]},"conflicts_with":["resolution"]},
			{"key":"return_last_frame","label":"Return Last Frame","type":"boolean","default":false,"conditional_const":[{"when_param":"draft","when_value":true,"value":false}]},
			{"key":"sequential_image_generation","label":"Sequential","type":"select","options":["disabled","auto"]},
			{"key":"image_count","label":"Image Count","type":"number","default":1,"min":1,"max":15,"requires_value":[{"param":"sequential_image_generation","value":"auto"}]}
		]`,
	})
	if err != nil {
		t.Fatalf("preview contract: %v", err)
	}
	assertAgentCompactContractMatchesFixture(t, preview.AgentContract, expectedContract)
	var frames *AgentContractParam
	var resolution *AgentContractParam
	for i := range preview.AgentContract.SupportedParams {
		param := &preview.AgentContract.SupportedParams[i]
		if param.Key == "frames" {
			frames = param
		}
		if param.Key == "resolution" {
			resolution = param
		}
	}
	if frames == nil || frames.Min == nil || frames.Max == nil || *frames.Min != 0 || *frames.Max != 0 {
		t.Fatalf("expected explicit zero bounds in agent contract, got %#v", frames)
	}
	if frames.Label != "Frames" || frames.Step == nil || *frames.Step != 4 || frames.Description != "Frame count must match 25 + 4n." {
		t.Fatalf("expected compact label, step, and schema description, got %#v", frames)
	}
	if len(frames.Enum) != 3 || frames.Enum[0] != float64(29) {
		t.Fatalf("expected numeric schema enum in agent contract, got %#v", frames)
	}
	if len(frames.ConflictsWith) != 1 || frames.ConflictsWith[0] != "resolution" {
		t.Fatalf("expected compact conflict rule, got %#v", frames)
	}
	if imageCount := agentContractParam(preview.AgentContract, "image_count"); imageCount == nil || imageCount.Default != float64(1) {
		t.Fatalf("expected compact default value, got %#v", imageCount)
	}
	if resolution == nil || len(resolution.ConditionalEnum) != 1 || resolution.ConditionalEnum[0].WhenParam != "draft" || len(resolution.ConditionalEnum[0].Options) != 1 || resolution.ConditionalEnum[0].Options[0] != "480p" {
		t.Fatalf("expected compact conditional enum rule, got %#v", resolution)
	}
	if len(resolution.Options) != 2 || resolution.Options[0] != "360p" || resolution.Options[1] != "480p" {
		t.Fatalf("expected schema enum to override compact string options like MCP contract, got %#v", resolution)
	}
}

func TestBuildAgentContractKeepsNativeNumericSchemaEnum(t *testing.T) {
	contract := buildAgentContract([]string{ai.CapabilityVideo}, false, 0, 0, []ai.ParamDef{
		{
			Key:        "frames",
			Label:      "Frames",
			Type:       "number",
			JSONSchema: map[string]any{"minimum": 29, "maximum": int64(289), "multipleOf": json.Number("4"), "enum": []int{29, 33, 37}},
		},
	}, map[string]any{
		"properties": map[string]any{
			"frames": map[string]any{
				"minimum":    29,
				"maximum":    int64(289),
				"multipleOf": json.Number("4"),
				"enum":       []int{29, 33, 37},
			},
		},
	})

	frames := agentContractParam(contract, "frames")
	if frames == nil || len(frames.Enum) != 3 || frames.Enum[0] != 29 || frames.Enum[2] != 37 {
		t.Fatalf("expected native []int schema enum in compact contract, got %#v", frames)
	}
	if frames.Min == nil || *frames.Min != 29 || frames.Max == nil || *frames.Max != 289 || frames.Step == nil || *frames.Step != 4 {
		t.Fatalf("expected native schema numbers in compact contract, got %#v", frames)
	}
}

func agentContractParam(contract AgentContract, key string) *AgentContractParam {
	for i := range contract.SupportedParams {
		if contract.SupportedParams[i].Key == key {
			return &contract.SupportedParams[i]
		}
	}
	return nil
}

func loadAgentCompactContractFixture(t *testing.T) AgentContract {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "agent-compact-contract-v1.fixture.json"))
	if err != nil {
		t.Fatalf("read compact contract fixture: %v", err)
	}
	var contract AgentContract
	if err := json.Unmarshal(raw, &contract); err != nil {
		t.Fatalf("decode compact contract fixture: %v", err)
	}
	return contract
}

func assertAgentCompactContractMatchesFixture(t *testing.T, got AgentContract, want AgentContract) {
	t.Helper()
	if got.ContractVersion != want.ContractVersion {
		t.Fatalf("unexpected contract version: got %d want %d", got.ContractVersion, want.ContractVersion)
	}
	if got.InputRequirements != want.InputRequirements {
		t.Fatalf("unexpected input requirements: got %#v want %#v", got.InputRequirements, want.InputRequirements)
	}
	if !stringSlicesEqual(got.SupportedParamKeys, want.SupportedParamKeys) {
		t.Fatalf("unexpected supported keys: got %#v want %#v", got.SupportedParamKeys, want.SupportedParamKeys)
	}
	if len(got.SupportedParams) != len(want.SupportedParams) {
		t.Fatalf("unexpected supported params length: got %#v want %#v", got.SupportedParams, want.SupportedParams)
	}
	for i := range got.SupportedParams {
		gotJSON, _ := json.Marshal(got.SupportedParams[i])
		wantJSON, _ := json.Marshal(want.SupportedParams[i])
		if string(gotJSON) != string(wantJSON) {
			t.Fatalf("unexpected compact param %d:\ngot  %s\nwant %s", i, gotJSON, wantJSON)
		}
	}
}

func assertParamDefsJSONEqual(t *testing.T, got, want []ai.ParamDef) {
	t.Helper()
	gotJSON, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("marshal got params: %v", err)
	}
	wantJSON, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal want params: %v", err)
	}
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("unexpected params:\ngot  %s\nwant %s", gotJSON, wantJSON)
	}
}

func modelPresetByID(t *testing.T, id string) ai.ModelPreset {
	t.Helper()
	for _, preset := range ai.ModelPresets() {
		if preset.ID == id {
			return preset
		}
	}
	t.Fatalf("missing model preset %s", id)
	return ai.ModelPreset{}
}

func paramKeys(params []ai.ParamDef) []string {
	out := make([]string, 0, len(params))
	for _, param := range params {
		if param.Key != "" {
			out = append(out, param.Key)
		}
	}
	sort.Strings(out)
	return out
}

func stringSlicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestPreviewModelConfigContractRejectsInvalidContract(t *testing.T) {
	service := newTestService(t)
	_, err := service.PreviewModelConfigContract(PreviewModelConfigContractInput{
		AdapterType:           "volcen",
		CustomCapabilities:    "video",
		CustomSupportedParams: `[{"key":"duration","type":"select"}]`,
	})
	if !errors.Is(err, ErrInvalidModelConfig) {
		t.Fatalf("expected ErrInvalidModelConfig, got %v", err)
	}
}

func newTestService(t *testing.T) *Service {
	t.Helper()
	db := testutil.OpenSQLite(t, "aiadmin.db", &persistencemodel.AICredential{}, &persistencemodel.AIModelConfig{})
	if err := db.Create(&persistencemodel.AICredential{
		AdapterType: "volcen",
		DisplayName: "Volcen",
		IsEnabled:   true,
	}).Error; err != nil {
		t.Fatalf("seed credential: %v", err)
	}
	return NewService(db.Session(&gorm.Session{SkipHooks: true}), []byte("test-encryption-key-32-bytes----"), nil)
}

func ptrString(value string) *string {
	return &value
}

func strconvID(id uint) string {
	return strconv.FormatUint(uint64(id), 10)
}

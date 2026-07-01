package ai

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

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

func TestPreviewCatalogEntryContractReturnsResolvedBackendContract(t *testing.T) {
	service := newTestService(t)
	preview, err := service.PreviewCatalogEntryContract(PreviewCatalogEntryContractInput{
		AdapterType:           "volcen",
		CustomCapabilities:    "video_generation",
		CustomSupportedParams: `{"version":2,"common":{"allow":["duration","resolution"],"override":{"duration":{"key":"duration","type":"select","options":["5"],"default":"5"}}}}`,
	})
	if err != nil {
		t.Fatalf("preview contract: %v", err)
	}
	if len(preview.Capabilities) != 1 || preview.Capabilities[0] != "video_generation" {
		t.Fatalf("unexpected capabilities: %#v", preview.Capabilities)
	}
	if preview.AgentContract.ContractVersion != 2 {
		t.Fatalf("expected agent contract v2, got %#v", preview.AgentContract)
	}
	keys := preview.AgentContract.SupportedParamKeysByOperation[ai.VideoOperationPromptToVideo]
	if !stringSlicesEqual(keys, []string{"duration", "resolution"}) {
		t.Fatalf("unexpected agent supported keys for prompt_to_video: %#v", keys)
	}
	if preview.AgentContract.ParamsSchemaByOperation[ai.VideoOperationPromptToVideo]["additionalProperties"] != false {
		t.Fatalf("expected closed params schema by operation, got %#v", preview.AgentContract.ParamsSchemaByOperation[ai.VideoOperationPromptToVideo])
	}
}

func TestPreviewCatalogEntryContractUsesInputLimits(t *testing.T) {
	service := newTestService(t)
	preview, err := service.PreviewCatalogEntryContract(PreviewCatalogEntryContractInput{
		AdapterType:           ai.AdapterVolcen,
		CustomCapabilities:    strings.Join([]string{ai.CapabilityFamilyVideoGeneration, ai.CapabilityFamilyVideoGeneration}, ","),
		CustomAcceptsImage:    true,
		CustomMaxInputImages:  4,
		CustomMaxInputVideos:  2,
		CustomSupportedParams: `{"version":2,"common":{"allow":["duration"],"override":{"duration":{"key":"duration","type":"select","options":["5"],"default":"5"}}}}`,
	})
	if err != nil {
		t.Fatalf("preview contract: %v", err)
	}
	if preview.AgentContract.InputRequirements.Image.Min != 0 || preview.AgentContract.InputRequirements.Image.Max != 4 {
		t.Fatalf("unexpected image input requirements: %#v", preview.AgentContract.InputRequirements.Image)
	}
	if preview.AgentContract.InputRequirements.Video.Min != 0 || preview.AgentContract.InputRequirements.Video.Max != 2 {
		t.Fatalf("unexpected video input requirements: %#v", preview.AgentContract.InputRequirements.Video)
	}
}

func TestPreviewCatalogEntryContractAllowsUnlimitedInputLimit(t *testing.T) {
	service := newTestService(t)
	preview, err := service.PreviewCatalogEntryContract(PreviewCatalogEntryContractInput{
		AdapterType:           ai.AdapterVolcen,
		CustomCapabilities:    ai.CapabilityFamilyVideoGeneration,
		CustomAcceptsImage:    true,
		CustomMaxInputImages:  -1,
		CustomSupportedParams: `{"version":2,"common":{"allow":["duration"],"override":{"duration":{"key":"duration","type":"select","options":["5"],"default":"5"}}}}`,
	})
	if err != nil {
		t.Fatalf("preview contract: %v", err)
	}
	if preview.AgentContract.InputRequirements.Image.Min != 0 || preview.AgentContract.InputRequirements.Image.Max != -1 {
		t.Fatalf("unexpected unlimited image input requirements: %#v", preview.AgentContract.InputRequirements.Image)
	}
}

func TestPreviewCatalogEntryContractRejectsInvalidInputLimit(t *testing.T) {
	service := newTestService(t)
	_, err := service.PreviewCatalogEntryContract(PreviewCatalogEntryContractInput{
		AdapterType:           ai.AdapterVolcen,
		CustomCapabilities:    ai.CapabilityFamilyVideoGeneration,
		CustomMaxInputImages:  -2,
		CustomSupportedParams: `{"version":2,"common":{"allow":["duration"],"override":{"duration":{"key":"duration","type":"select","options":["5"],"default":"5"}}}}`,
	})
	if !errors.Is(err, ErrInvalidModelCatalog) {
		t.Fatalf("expected ErrInvalidModelCatalog, got %v", err)
	}
	if !strings.Contains(err.Error(), "custom_max_input_images") {
		t.Fatalf("expected field name in error, got %v", err)
	}
}

func TestCatalogEntrySupportedParamsRoundTripThroughPreviewAndRuntime(t *testing.T) {
	service := newTestService(t)
	cases := []struct {
		name            string
		adapter         string
		capabilities    []string
		acceptsImage    bool
		maxInputImages  int
			maxInputVideos  int
			inputImageField string
			supportedParams string
			operation       string
			wantKeys        []string
		}{
		{
			name:            "edit-image",
			adapter:         ai.AdapterOpenAICompat,
			capabilities:    []string{ai.CapabilityFamilyImageGeneration},
			acceptsImage:    true,
			maxInputImages:  2,
			inputImageField: "image",
			supportedParams: `{"version":2,"common":{"allow":["quality","background"],"override":{"quality":{"key":"quality","label":"Quality","type":"select","options":["standard","hd"],"default":"standard"}},"add":[{"key":"background","label":"Background","type":"select","options":["transparent","opaque"],"default":"opaque"}]}}`,
			operation:       ai.ImageOperationTextToImage,
			wantKeys: []string{"background", "quality"},
		},
		{
			name:           "video-generation-conditional",
			adapter:        ai.AdapterVolcen,
			capabilities:   []string{ai.CapabilityFamilyVideoGeneration},
			acceptsImage:   true,
			maxInputImages: 4,
			supportedParams: `{"version":2,"common":{"allow":["duration","workspace","resolution","return_last_frame","service_tier"],"override":{"duration":{"key":"duration","label":"Duration","type":"select","options":["5","10"],"default":"5"},"workspace":{"key":"workspace","label":"Workspace","type":"boolean"},"resolution":{"key":"resolution","label":"Resolution","type":"select","options":["480p","720p"],"default":"480p","conditional_enum":[{"when_param":"workspace","when_value":true,"options":["480p"]}]},"return_last_frame":{"key":"return_last_frame","label":"Return Last Frame","type":"boolean","default":false,"conditional_const":[{"when_param":"workspace","when_value":true,"value":false}]},"service_tier":{"key":"service_tier","label":"Service Tier","type":"select","options":["standard","fast"],"default":"standard"}}}}`,
			operation:       ai.VideoOperationPromptToVideo,
			wantKeys: []string{"duration", "resolution", "return_last_frame", "service_tier", "workspace"},
		},
	}
	for _, tt := range cases {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			capabilities := strings.Join(tt.capabilities, ",")
			preview, err := service.PreviewCatalogEntryContract(PreviewCatalogEntryContractInput{
				AdapterType:           tt.adapter,
				CustomCapabilities:    capabilities,
				CustomAcceptsImage:    tt.acceptsImage,
				CustomMaxInputImages:  tt.maxInputImages,
				CustomMaxInputVideos:  tt.maxInputVideos,
				CustomSupportedParams: tt.supportedParams,
			})
			if err != nil {
				t.Fatalf("preview catalog entry contract: %v", err)
			}
			runtime := ai.ResolveModelDef(
				tt.name,
				tt.adapter,
				tt.name,
				capabilities,
				"",
				tt.acceptsImage,
				tt.maxInputImages,
				tt.maxInputVideos,
				tt.inputImageField,
				tt.supportedParams,
			)

			assertParamDefsJSONEqual(t, preview.SupportedParamsByOperation[tt.operation], runtime.SupportedParamsByOperation[tt.operation])
			if !stringSlicesEqual(preview.AgentContract.SupportedParamKeysByOperation[tt.operation], paramKeys(runtime.SupportedParamsByOperation[tt.operation])) {
				t.Fatalf("agent supported keys do not match runtime params: got %#v runtime %#v", preview.AgentContract.SupportedParamKeysByOperation[tt.operation], paramKeys(runtime.SupportedParamsByOperation[tt.operation]))
			}
			if !stringSlicesEqual(preview.AgentContract.SupportedParamKeysByOperation[tt.operation], tt.wantKeys) {
				t.Fatalf("agent supported keys = %#v, want %#v", preview.AgentContract.SupportedParamKeysByOperation[tt.operation], tt.wantKeys)
			}
			if preview.AgentContract.InputRequirements.Image.Min != expectedImageInputMin(runtime) || preview.AgentContract.InputRequirements.Image.Max != runtime.MaxInputImages {
				t.Fatalf("agent image input requirements do not match runtime: got %#v runtime max=%d", preview.AgentContract.InputRequirements.Image, runtime.MaxInputImages)
			}
			if preview.AgentContract.InputRequirements.Video.Min != expectedVideoInputMin(runtime) || preview.AgentContract.InputRequirements.Video.Max != runtime.MaxInputVideos {
				t.Fatalf("agent video input requirements do not match runtime: got %#v runtime max=%d", preview.AgentContract.InputRequirements.Video, runtime.MaxInputVideos)
			}
			if preview.AgentContract.ContractVersion != 2 {
				t.Fatalf("expected agent contract v2, got %#v", preview.AgentContract)
			}
		})
	}

	preview, err := service.PreviewCatalogEntryContract(PreviewCatalogEntryContractInput{
		AdapterType:          ai.AdapterVolcen,
		CustomCapabilities:   ai.CapabilityFamilyVideoGeneration,
		CustomAcceptsImage:   true,
		CustomMaxInputImages: 4,
		CustomSupportedParams: `{"version":2,"common":{"allow":["duration","workspace","resolution","return_last_frame","service_tier"],"override":{"duration":{"key":"duration","label":"Duration","type":"select","options":["5","10"],"default":"5"},"workspace":{"key":"workspace","label":"Workspace","type":"boolean"},"resolution":{"key":"resolution","label":"Resolution","type":"select","options":["480p","720p"],"default":"480p","conditional_enum":[{"when_param":"workspace","when_value":true,"options":["480p"]}]},"return_last_frame":{"key":"return_last_frame","label":"Return Last Frame","type":"boolean","default":false,"conditional_const":[{"when_param":"workspace","when_value":true,"value":false}]},"service_tier":{"key":"service_tier","label":"Service Tier","type":"select","options":["standard","fast"],"default":"standard"}}}}`,
	})
	if err != nil {
		t.Fatalf("preview conditional catalog contract: %v", err)
	}
	for _, key := range []string{"duration", "resolution", "workspace", "return_last_frame", "service_tier"} {
		if agentContractParam(preview.AgentContract, ai.VideoOperationPromptToVideo, key) == nil {
			t.Fatalf("expected agent contract to include %s, got %#v", key, preview.AgentContract.SupportedParamKeysByOperation[ai.VideoOperationPromptToVideo])
		}
	}
	resolution := agentContractParam(preview.AgentContract, ai.VideoOperationPromptToVideo, "resolution")
	if resolution == nil || len(resolution.ConditionalEnum) != 1 || resolution.ConditionalEnum[0].WhenParam != "workspace" {
		t.Fatalf("expected workspace resolution rule after round trip, got %#v", resolution)
	}
	returnLastFrame := agentContractParam(preview.AgentContract, ai.VideoOperationPromptToVideo, "return_last_frame")
	if returnLastFrame == nil || len(returnLastFrame.ConditionalConst) != 1 || returnLastFrame.ConditionalConst[0].Value != false {
		t.Fatalf("expected return_last_frame workspace rule after round trip, got %#v", returnLastFrame)
	}
}

func expectedImageInputMin(def *ai.ModelDef) int {
	return 0
}

func expectedVideoInputMin(def *ai.ModelDef) int {
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

func TestPreviewCatalogEntryContractReturnsAgentCompactRules(t *testing.T) {
	service := newTestService(t)
	preview, err := service.PreviewCatalogEntryContract(PreviewCatalogEntryContractInput{
		AdapterType:          "volcen",
		CustomCapabilities:   ai.CapabilityFamilyVideoGeneration,
		CustomAcceptsImage:   true,
		CustomMaxInputImages: 4,
		CustomSupportedParams: `{"version":2,"common":{"allow":["workspace","resolution","frames","return_last_frame","sequential_image_generation","image_count"],"override":{"workspace":{"key":"workspace","label":"Workspace","type":"boolean"},"resolution":{"key":"resolution","label":"Resolution","type":"select","options":["480p","720p"],"default":"480p","json_schema":{"enum":["360p","480p"]},"conditional_enum":[{"when_param":"workspace","when_value":true,"options":["480p"]}]},"frames":{"key":"frames","label":"Frames","type":"number","min":0,"max":0,"step":4,"json_schema":{"description":"Frame count must match 25 + 4n.","enum":[29,33,37]},"conflicts_with":["resolution"]},"return_last_frame":{"key":"return_last_frame","label":"Return Last Frame","type":"boolean","default":false,"conditional_const":[{"when_param":"workspace","when_value":true,"value":false}]},"sequential_image_generation":{"key":"sequential_image_generation","label":"Sequential","type":"select","options":["disabled","auto"]},"image_count":{"key":"image_count","label":"Image Count","type":"number","default":1,"min":1,"max":15,"requires_value":[{"param":"sequential_image_generation","value":"auto"}]}}}}`,
	})
	if err != nil {
		t.Fatalf("preview contract: %v", err)
	}
	frames := agentContractParam(preview.AgentContract, ai.VideoOperationPromptToVideo, "frames")
	resolution := agentContractParam(preview.AgentContract, ai.VideoOperationPromptToVideo, "resolution")
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
	if imageCount := agentContractParam(preview.AgentContract, ai.VideoOperationPromptToVideo, "image_count"); imageCount == nil || imageCount.Default != float64(1) {
		t.Fatalf("expected compact default value, got %#v", imageCount)
	}
	if resolution == nil || len(resolution.ConditionalEnum) != 1 || resolution.ConditionalEnum[0].WhenParam != "workspace" || len(resolution.ConditionalEnum[0].Options) != 1 || resolution.ConditionalEnum[0].Options[0] != "480p" {
		t.Fatalf("expected compact conditional enum rule, got %#v", resolution)
	}
	if len(resolution.Options) != 2 || resolution.Options[0] != "360p" || resolution.Options[1] != "480p" {
		t.Fatalf("expected schema enum to override compact string options like MCP contract, got %#v", resolution)
	}
}

func TestBuildAgentContractKeepsNativeNumericSchemaEnum(t *testing.T) {
	contract := buildAgentContract(
		[]string{ai.CapabilityFamilyVideoGeneration},
		false,
		0,
		0,
		map[string][]ai.ParamDef{
			ai.VideoOperationPromptToVideo: {{
				Key:        "frames",
				Label:      "Frames",
				Type:       "number",
				JSONSchema: map[string]any{"minimum": 29, "maximum": int64(289), "multipleOf": json.Number("4"), "enum": []int{29, 33, 37}},
			}},
		},
		map[string]map[string]any{
			ai.VideoOperationPromptToVideo: {
				"properties": map[string]any{
					"frames": map[string]any{
						"minimum":    29,
						"maximum":    int64(289),
						"multipleOf": json.Number("4"),
						"enum":       []int{29, 33, 37},
					},
				},
			},
		},
	)

	frames := agentContractParam(contract, ai.VideoOperationPromptToVideo, "frames")
	if frames == nil || len(frames.Enum) != 3 || frames.Enum[0] != 29 || frames.Enum[2] != 37 {
		t.Fatalf("expected native []int schema enum in compact contract, got %#v", frames)
	}
	if frames.Min == nil || *frames.Min != 29 || frames.Max == nil || *frames.Max != 289 || frames.Step == nil || *frames.Step != 4 {
		t.Fatalf("expected native schema numbers in compact contract, got %#v", frames)
	}
}

func agentContractParam(contract AgentContract, operation, key string) *AgentContractParam {
	params := contract.SupportedParamsByOperation[operation]
	for i := range params {
		if params[i].Key == key {
			return &params[i]
		}
	}
	return nil
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

func TestPreviewCatalogEntryContractRejectsInvalidContract(t *testing.T) {
	service := newTestService(t)
	_, err := service.PreviewCatalogEntryContract(PreviewCatalogEntryContractInput{
		AdapterType:           "volcen",
		CustomCapabilities:    "video_generation",
		CustomSupportedParams: `[{"key":"duration","type":"select"}]`,
	})
	if !errors.Is(err, ErrInvalidModelCatalog) {
		t.Fatalf("expected ErrInvalidModelCatalog, got %v", err)
	}
}

func newTestService(t *testing.T) *Service {
	t.Helper()
	db := testutil.OpenSQLite(t, "admin-ai.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	if err := db.Create(&persistencemodel.AICredential{
		AdapterType: "volcen",
		DisplayName: "Volcen",
		IsEnabled:   true,
	}).Error; err != nil {
		t.Fatalf("seed credential: %v", err)
	}
	return NewService(db.Session(&gorm.Session{SkipHooks: true}), []byte("test-encryption-key-32-bytes----"), nil)
}

func strconvID(id uint) string {
	return strconv.FormatUint(uint64(id), 10)
}

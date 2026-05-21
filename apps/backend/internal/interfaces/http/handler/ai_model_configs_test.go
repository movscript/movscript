package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestCreateModelConfigAuditAndDeleteNotFound(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestAIModelConfigRouterWithDB(t, true)

	createReq := httptest.NewRequest(http.MethodPost, "/admin/credentials/1/models", strings.NewReader(`{
		"model_def_id":"audit-model",
		"custom_capabilities":"text",
		"custom_pricing_mode":"per_token"
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected valid config to be created, got %d: %s", createRes.Code, createRes.Body.String())
	}
	if countAuditAction(t, db, "ai_model_config.admin_created") != 1 {
		t.Fatalf("expected create audit log")
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/admin/credentials/1/models/1", nil)
	deleteRes := httptest.NewRecorder()

	router.ServeHTTP(deleteRes, deleteReq)

	if deleteRes.Code != http.StatusNoContent {
		t.Fatalf("expected valid config to be deleted, got %d: %s", deleteRes.Code, deleteRes.Body.String())
	}
	if countAuditAction(t, db, "ai_model_config.admin_deleted") != 1 {
		t.Fatalf("expected delete audit log")
	}

	missingReq := httptest.NewRequest(http.MethodDelete, "/admin/credentials/1/models/1", nil)
	missingRes := httptest.NewRecorder()

	router.ServeHTTP(missingRes, missingReq)

	if missingRes.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing model config delete, got %d: %s", missingRes.Code, missingRes.Body.String())
	}
}

func TestModelConfigExternalAdminActionsWriteAuditWithoutPayloads(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, db := newTestAIModelConfigRouterWithDB(t, true)

	imageConfig := persistencemodel.AIModelConfig{
		CredentialID:       1,
		ModelDefID:         "custom-image",
		ModelIDOverride:    "image-model",
		CustomDisplayName:  "Image Model",
		CustomCapabilities: "image",
		CustomPricingMode:  "per_image",
		CreditsPerImage:    1,
		CustomSupportedParams: `[
			{"key":"size","label":"Size","type":"select","options":["1280x720"],"default":"1280x720"}
		]`,
		IsEnabled: true,
	}
	if err := db.Create(&imageConfig).Error; err != nil {
		t.Fatalf("create image model config: %v", err)
	}

	testReq := httptest.NewRequest(http.MethodPost, "/admin/credentials/1/models/1/test", nil)
	testRes := httptest.NewRecorder()

	router.ServeHTTP(testRes, testReq)

	if testRes.Code != http.StatusOK {
		t.Fatalf("expected model config test response, got %d: %s", testRes.Code, testRes.Body.String())
	}
	if countAuditAction(t, db, "ai_model_config.admin_tested") != 1 {
		t.Fatalf("expected model config test audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "ai_model_config.admin_tested", "Hi")

	debugConfig := persistencemodel.AIModelConfig{
		CredentialID:       1,
		ModelDefID:         "custom-text",
		ModelIDOverride:    "debug-model",
		CustomDisplayName:  "Debug Model",
		CustomCapabilities: "text",
		CustomPricingMode:  "per_token",
		IsEnabled:          true,
	}
	if err := db.Create(&debugConfig).Error; err != nil {
		t.Fatalf("create debug model config: %v", err)
	}

	debugReq := httptest.NewRequest(http.MethodPost, "/admin/credentials/1/models/2/debug", nil)
	debugRes := httptest.NewRecorder()

	router.ServeHTTP(debugRes, debugReq)

	if debugRes.Code != http.StatusOK {
		t.Fatalf("expected model config debug response, got %d: %s", debugRes.Code, debugRes.Body.String())
	}
	if countAuditAction(t, db, "ai_model_config.admin_debugged") != 1 {
		t.Fatalf("expected model config debug audit log")
	}
	assertAuditMetadataDoesNotContain(t, db, "ai_model_config.admin_debugged", "Hi")
}

func TestCreateModelConfigReturnsBadRequestForInvalidParamContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newTestAIModelConfigRouter(t, true)

	req := httptest.NewRequest(http.MethodPost, "/admin/credentials/1/models", strings.NewReader(`{
		"model_def_id":"bad-video",
		"custom_capabilities":"video",
		"custom_supported_params":"[{\"key\":\"duration\",\"type\":\"select\"}]"
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid model param contract, got %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "invalid ai model config") {
		t.Fatalf("expected invalid model config error body, got %s", res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body["code"] != "INVALID_MODEL_CONFIG" {
		t.Fatalf("expected stable INVALID_MODEL_CONFIG code, got %#v", body)
	}
	if body["message"] == "" || body["error"] == "" {
		t.Fatalf("expected message and legacy error fields, got %#v", body)
	}
}

func TestCreateModelConfigReturnsBadRequestForInvalidInputLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newTestAIModelConfigRouter(t, true)

	req := httptest.NewRequest(http.MethodPost, "/admin/credentials/1/models", strings.NewReader(`{
		"model_def_id":"bad-image",
		"custom_capabilities":"image",
		"custom_max_input_images":-2,
		"custom_supported_params":"[{\"key\":\"aspect_ratio\",\"label\":\"Aspect Ratio\",\"type\":\"select\",\"options\":[\"1:1\"],\"default\":\"1:1\"}]"
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid input limit, got %d: %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body["code"] != "INVALID_MODEL_CONFIG" {
		t.Fatalf("expected stable INVALID_MODEL_CONFIG code, got %#v", body)
	}
	if !strings.Contains(body["message"].(string), "custom_max_input_images") {
		t.Fatalf("expected input limit detail in message, got %#v", body)
	}
}

func TestPatchModelConfigReturnsBadRequestForInvalidInputLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newTestAIModelConfigRouter(t, true)

	createReq := httptest.NewRequest(http.MethodPost, "/admin/credentials/1/models", strings.NewReader(`{
		"model_def_id":"image-model",
		"custom_capabilities":"image",
		"custom_accepts_image":true,
		"custom_max_input_images":4,
		"custom_supported_params":"[{\"key\":\"aspect_ratio\",\"label\":\"Aspect Ratio\",\"type\":\"select\",\"options\":[\"1:1\"],\"default\":\"1:1\"}]"
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected valid config to be created, got %d: %s", createRes.Code, createRes.Body.String())
	}

	patchReq := httptest.NewRequest(http.MethodPatch, "/admin/model-configs/1", strings.NewReader(`{
		"custom_max_input_images":-2
	}`))
	patchReq.Header.Set("Content-Type", "application/json")
	patchRes := httptest.NewRecorder()

	router.ServeHTTP(patchRes, patchReq)

	if patchRes.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid input limit patch, got %d: %s", patchRes.Code, patchRes.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(patchRes.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body["code"] != "INVALID_MODEL_CONFIG" {
		t.Fatalf("expected stable INVALID_MODEL_CONFIG code, got %#v", body)
	}
	if !strings.Contains(body["message"].(string), "custom_max_input_images") {
		t.Fatalf("expected input limit detail in message, got %#v", body)
	}
}

func TestCreateModelConfigReturnsNotFoundForMissingCredential(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newTestAIModelConfigRouter(t, false)

	req := httptest.NewRequest(http.MethodPost, "/admin/credentials/999/models", strings.NewReader(`{
		"model_def_id":"video-model",
		"custom_capabilities":"video",
		"custom_supported_params":""
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing credential, got %d: %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body["code"] != "NOT_FOUND" {
		t.Fatalf("expected stable NOT_FOUND code, got %#v", body)
	}
	if !strings.Contains(body["message"].(string), "credential not found") {
		t.Fatalf("expected credential detail in message, got %#v", body)
	}
}

func TestPreviewModelConfigContractReturnsAgentContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newTestAIModelConfigRouter(t, false)

	req := httptest.NewRequest(http.MethodPost, "/admin/model-configs/preview-contract", strings.NewReader(`{
		"adapter_type":"volcen",
		"custom_capabilities":"video_i2v,video_v2v",
		"custom_accepts_image":true,
		"custom_max_input_images":4,
		"custom_max_input_videos":2,
		"custom_supported_params":"{\"allow\":[\"duration\",\"resolution\"],\"override\":{\"duration\":{\"type\":\"select\",\"options\":[\"5\"],\"default\":\"5\"},\"resolution\":{\"json_schema\":{\"description\":\"Preview resolution\"}}}}"
	}`))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200 for preview contract, got %d: %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode preview body: %v", err)
	}
	agentContract, ok := body["agent_contract"].(map[string]any)
	if !ok {
		t.Fatalf("expected agent_contract object, got %#v", body)
	}
	if agentContract["contract_version"] != float64(1) {
		t.Fatalf("expected agent contract version 1, got %#v", agentContract)
	}
	inputRequirements, ok := agentContract["input_requirements"].(map[string]any)
	if !ok {
		t.Fatalf("expected input_requirements object, got %#v", agentContract)
	}
	imageReq, ok := inputRequirements["image"].(map[string]any)
	if !ok || imageReq["min"] != float64(0) || imageReq["max"] != float64(4) {
		t.Fatalf("unexpected image input requirements: %#v", inputRequirements["image"])
	}
	videoReq, ok := inputRequirements["video"].(map[string]any)
	if !ok || videoReq["min"] != float64(0) || videoReq["max"] != float64(2) {
		t.Fatalf("unexpected video input requirements: %#v", inputRequirements["video"])
	}
	keys, ok := agentContract["supported_param_keys"].([]any)
	if !ok || len(keys) != 2 || keys[0] != "duration" || keys[1] != "resolution" {
		t.Fatalf("unexpected agent supported keys: %#v", agentContract["supported_param_keys"])
	}
	params, ok := agentContract["supported_params"].([]any)
	if !ok || len(params) != 2 {
		t.Fatalf("unexpected agent supported params: %#v", agentContract["supported_params"])
	}
	duration := agentContractParamBody(params, "duration")
	if duration == nil || duration["label"] != "时长(秒)" || duration["default"] != "5" {
		t.Fatalf("expected compact duration label/default, got %#v", duration)
	}
	resolution := agentContractParamBody(params, "resolution")
	if resolution == nil || resolution["description"] != "Preview resolution" {
		t.Fatalf("expected schema description in compact resolution, got %#v", resolution)
	}
}

func TestSavedModelConfigInputRequirementsMatchRuntimeModels(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newTestAIModelConfigRouter(t, true)

	previewReq := httptest.NewRequest(http.MethodPost, "/admin/model-configs/preview-contract", strings.NewReader(`{
		"adapter_type":"volcen",
		"custom_capabilities":"video_i2v,video_v2v",
		"custom_accepts_image":true,
		"custom_max_input_images":4,
		"custom_max_input_videos":2,
		"custom_supported_params":"{\"allow\":[\"duration\",\"resolution\"],\"override\":{\"duration\":{\"type\":\"select\",\"options\":[\"5\"],\"default\":\"5\"}}}"
	}`))
	previewReq.Header.Set("Content-Type", "application/json")
	previewRes := httptest.NewRecorder()

	router.ServeHTTP(previewRes, previewReq)

	if previewRes.Code != http.StatusOK {
		t.Fatalf("expected 200 for preview contract, got %d: %s", previewRes.Code, previewRes.Body.String())
	}
	var preview map[string]any
	if err := json.Unmarshal(previewRes.Body.Bytes(), &preview); err != nil {
		t.Fatalf("decode preview body: %v", err)
	}
	agentContract, ok := preview["agent_contract"].(map[string]any)
	if !ok {
		t.Fatalf("expected agent_contract object, got %#v", preview)
	}
	previewInputs, ok := agentContract["input_requirements"].(map[string]any)
	if !ok {
		t.Fatalf("expected preview input_requirements object, got %#v", agentContract)
	}

	createReq := httptest.NewRequest(http.MethodPost, "/admin/credentials/1/models", strings.NewReader(`{
		"model_def_id":"runtime-i2v",
		"custom_capabilities":"video_i2v,video_v2v",
		"custom_accepts_image":true,
		"custom_max_input_images":4,
		"custom_max_input_videos":2,
		"custom_supported_params":"{\"allow\":[\"duration\",\"resolution\"],\"override\":{\"duration\":{\"type\":\"select\",\"options\":[\"5\"],\"default\":\"5\"}}}"
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected valid config to be created, got %d: %s", createRes.Code, createRes.Body.String())
	}

	modelsReq := httptest.NewRequest(http.MethodGet, "/models?capability=video_i2v&provider_variants=true", nil)
	modelsRes := httptest.NewRecorder()

	router.ServeHTTP(modelsRes, modelsReq)

	if modelsRes.Code != http.StatusOK {
		t.Fatalf("expected 200 for runtime models, got %d: %s", modelsRes.Code, modelsRes.Body.String())
	}
	var models []map[string]any
	if err := json.Unmarshal(modelsRes.Body.Bytes(), &models); err != nil {
		t.Fatalf("decode runtime models: %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("expected one runtime model, got %#v", models)
	}
	runtimeInputs, ok := models[0]["input_requirements"].(map[string]any)
	if !ok {
		t.Fatalf("expected runtime input_requirements object, got %#v", models[0])
	}
	if !inputRequirementHas(previewInputs["image"], 0, 4) || !inputRequirementHas(previewInputs["video"], 0, 2) {
		t.Fatalf("expected preview to show no globally required input for mixed capabilities, got %#v", previewInputs)
	}
	if !inputRequirementHas(runtimeInputs["image"], 1, 4) || !inputRequirementHas(runtimeInputs["video"], 0, 2) {
		t.Fatalf("expected video_i2v runtime contract to require image input only, got %#v", runtimeInputs)
	}
}

func TestSavedModelConfigPreservesUnlimitedInputRequirements(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newTestAIModelConfigRouter(t, true)

	previewReq := httptest.NewRequest(http.MethodPost, "/admin/model-configs/preview-contract", strings.NewReader(`{
		"adapter_type":"volcen",
		"custom_capabilities":"video_i2v,video_v2v",
		"custom_accepts_image":true,
		"custom_max_input_images":-1,
		"custom_max_input_videos":-1,
		"custom_supported_params":"{\"allow\":[\"duration\"],\"override\":{\"duration\":{\"type\":\"select\",\"options\":[\"5\"],\"default\":\"5\"}}}"
	}`))
	previewReq.Header.Set("Content-Type", "application/json")
	previewRes := httptest.NewRecorder()

	router.ServeHTTP(previewRes, previewReq)

	if previewRes.Code != http.StatusOK {
		t.Fatalf("expected 200 for preview contract, got %d: %s", previewRes.Code, previewRes.Body.String())
	}
	var preview map[string]any
	if err := json.Unmarshal(previewRes.Body.Bytes(), &preview); err != nil {
		t.Fatalf("decode preview body: %v", err)
	}
	agentContract, ok := preview["agent_contract"].(map[string]any)
	if !ok {
		t.Fatalf("expected agent_contract object, got %#v", preview)
	}
	previewInputs, ok := agentContract["input_requirements"].(map[string]any)
	if !ok {
		t.Fatalf("expected preview input_requirements object, got %#v", agentContract)
	}
	if !inputRequirementHas(previewInputs["image"], 0, -1) || !inputRequirementHas(previewInputs["video"], 0, -1) {
		t.Fatalf("expected preview unlimited image/video requirements, got %#v", previewInputs)
	}

	createReq := httptest.NewRequest(http.MethodPost, "/admin/credentials/1/models", strings.NewReader(`{
		"model_def_id":"runtime-unlimited-i2v",
		"custom_capabilities":"video_i2v,video_v2v",
		"custom_accepts_image":true,
		"custom_max_input_images":-1,
		"custom_max_input_videos":-1,
		"custom_supported_params":"{\"allow\":[\"duration\"],\"override\":{\"duration\":{\"type\":\"select\",\"options\":[\"5\"],\"default\":\"5\"}}}"
	}`))
	createReq.Header.Set("Content-Type", "application/json")
	createRes := httptest.NewRecorder()

	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected valid config to be created, got %d: %s", createRes.Code, createRes.Body.String())
	}

	modelsReq := httptest.NewRequest(http.MethodGet, "/models?capability=video_i2v&provider_variants=true", nil)
	modelsRes := httptest.NewRecorder()

	router.ServeHTTP(modelsRes, modelsReq)

	if modelsRes.Code != http.StatusOK {
		t.Fatalf("expected 200 for runtime models, got %d: %s", modelsRes.Code, modelsRes.Body.String())
	}
	var models []map[string]any
	if err := json.Unmarshal(modelsRes.Body.Bytes(), &models); err != nil {
		t.Fatalf("decode runtime models: %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("expected one runtime model, got %#v", models)
	}
	runtimeInputs, ok := models[0]["input_requirements"].(map[string]any)
	if !ok {
		t.Fatalf("expected runtime input_requirements object, got %#v", models[0])
	}
	if !inputRequirementHas(runtimeInputs["image"], 1, -1) || !inputRequirementHas(runtimeInputs["video"], 0, -1) {
		t.Fatalf("expected video_i2v runtime unlimited image input requirement, got %#v", runtimeInputs)
	}
}

func TestListModelPresetsReturnsSupportedParams(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newTestAIModelConfigRouter(t, false)

	req := httptest.NewRequest(http.MethodGet, "/admin/model-presets", nil)
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200 for model presets, got %d: %s", res.Code, res.Body.String())
	}
	var presets []map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &presets); err != nil {
		t.Fatalf("decode presets: %v", err)
	}
	for _, preset := range presets {
		if preset["id"] != "volcengine:seedance-1-0-lite-t2v" {
			continue
		}
		params, ok := preset["supported_params"].([]any)
		if !ok || len(params) == 0 {
			t.Fatalf("expected preset supported_params, got %#v", preset)
		}
		if agentContractParamBody(params, "duration") == nil || agentContractParamBody(params, "resolution") == nil {
			t.Fatalf("expected duration and resolution preset params, got %#v", params)
		}
		return
	}
	t.Fatal("expected Seedance preset in HTTP response")
}

func TestListModelPresetsReturnsCanonicalParamKeys(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := newTestAIModelConfigRouter(t, false)

	req := httptest.NewRequest(http.MethodGet, "/admin/model-presets", nil)
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200 for model presets, got %d: %s", res.Code, res.Body.String())
	}
	var presets []map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &presets); err != nil {
		t.Fatalf("decode presets: %v", err)
	}
	for _, preset := range presets {
		if preset["id"] != "openai:dall-e-3" {
			continue
		}
		params, ok := preset["supported_params"].([]any)
		if !ok || len(params) == 0 {
			t.Fatalf("expected DALL-E supported_params, got %#v", preset)
		}
		if agentContractParamBody(params, "image_size") == nil {
			t.Fatalf("expected DALL-E preset to expose canonical image_size param, got %#v", params)
		}
		if agentContractParamBody(params, "size") != nil {
			t.Fatalf("expected DALL-E preset not to expose legacy size alias, got %#v", params)
		}
		return
	}
	t.Fatal("expected DALL-E preset in HTTP response")
}

func agentContractParamBody(params []any, key string) map[string]any {
	for _, raw := range params {
		param, ok := raw.(map[string]any)
		if ok && param["key"] == key {
			return param
		}
	}
	return nil
}

func inputRequirementEqual(left any, right any) bool {
	leftReq, leftOK := left.(map[string]any)
	rightReq, rightOK := right.(map[string]any)
	return leftOK &&
		rightOK &&
		leftReq["min"] == rightReq["min"] &&
		leftReq["max"] == rightReq["max"]
}

func inputRequirementHas(raw any, min int, max int) bool {
	req, ok := raw.(map[string]any)
	return ok && req["min"] == float64(min) && req["max"] == float64(max)
}

func newTestAIModelConfigRouter(t *testing.T, seedCredential bool) *gin.Engine {
	t.Helper()
	router, _ := newTestAIModelConfigRouterWithDB(t, seedCredential)
	return router
}

func newTestAIModelConfigRouterWithDB(t *testing.T, seedCredential bool) (*gin.Engine, *gorm.DB) {
	t.Helper()
	db := testutil.OpenSQLite(t, "handler-admin-ai.db", &persistencemodel.AICredential{}, &persistencemodel.AIModelConfig{}, &persistencemodel.AuditLog{})
	if seedCredential {
		if err := db.Create(&persistencemodel.AICredential{
			AdapterType: "volcen",
			DisplayName: "Volcen",
			IsEnabled:   true,
		}).Error; err != nil {
			t.Fatalf("seed credential: %v", err)
		}
	}
	db = db.Session(&gorm.Session{SkipHooks: true})
	registry := ai.NewRegistry(db, nil)
	h := NewAIHandler(db, "746573742d656e6372797074696f6e2d6b65792d33322d62797465732d2d2d2d2d", registry)
	models := NewModelsHandler(ai.NewAIService(db, registry))
	router := gin.New()
	router.GET("/admin/model-presets", h.ListModelPresets)
	router.POST("/admin/credentials/:id/models", h.CreateModelConfig)
	router.DELETE("/admin/credentials/:id/models/:modelId", h.DeleteModelConfig)
	router.POST("/admin/credentials/:id/models/:modelId/test", h.TestModelConfig)
	router.POST("/admin/credentials/:id/models/:modelId/debug", h.DebugModelConfig)
	router.PATCH("/admin/model-configs/:id", h.PatchModelConfig)
	router.POST("/admin/model-configs/preview-contract", h.PreviewModelConfigContract)
	router.GET("/models", models.ListByCapability)
	return router, db
}

package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"testing"
	"time"

	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	appcontentcandidate "github.com/movscript/movscript/internal/app/contentcandidate"
	appdecision "github.com/movscript/movscript/internal/app/decision"
	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/storage"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

func TestGeneratedResourceNameUsesJobTitle(t *testing.T) {
	job := &model.Job{Model: gorm.Model{ID: 38}, Title: "雨夜门口/纸条?"}
	if got := generatedResourceName(job, "image", "png"); got != "雨夜门口_纸条.png" {
		t.Fatalf("generated resource name = %q", got)
	}
}

func TestGeneratedResourceNameFallsBackToJobID(t *testing.T) {
	job := &model.Job{Model: gorm.Model{ID: 38}}
	if got := generatedResourceName(job, "image", "png"); got != "job_38_image.png" {
		t.Fatalf("generated resource fallback name = %q", got)
	}
}

func testOperationCapabilitiesJSON(capability, operation string) string {
	return fmt.Sprintf(`{%q:{"operations":[%q]}}`, capability, operation)
}

func testOperationSupportedParamsProfile(operation string) string {
	return fmt.Sprintf(`{"version":2,"by_operation":{%q:{"add":[{"key":"test_param","label":"Test Param","type":"string"}]}}}`, operation)
}

func testGenerationIntentRequestContext(capability, operation string) string {
	return fmt.Sprintf(`{"intent":{"capability":%q,"operation":%q}}`, capability, operation)
}

func TestResolveMentionsAcceptsTypedResourceTokens(t *testing.T) {
	worker := NewWorker(nil, nil, nil, nil)
	prompt, inputID, inputIDs := worker.resolveMentions(
		"use @[resource:image:first_frame:42] then @[resource:video:motion_reference:77] and @[resource:42]",
		nil,
		"[7]",
	)
	if prompt != "use 图片1 then 图片2 and 图片1" {
		t.Fatalf("prompt = %q, want typed resource mentions replaced in encounter order", prompt)
	}
	if inputID == nil || *inputID != 42 {
		t.Fatalf("inputID = %#v, want first typed resource id 42", inputID)
	}
	if inputIDs != "[7,42,77]" {
		t.Fatalf("inputIDs = %q, want existing plus typed resource ids", inputIDs)
	}
}

func TestProviderGeneratedArtifactMetadataIncludesOriginRouteFacts(t *testing.T) {
	job := &model.Job{
		Model:   gorm.Model{ID: 44},
		JobType: domainjob.JobTypeImage,
		RequestContext: `{
			"model":{"identifier":"volcengine-ark:seedream-5-0-lite","model_def_id":"volcengine-ark:seedream-5-0-lite","provider_name":"Ark main"},
			"route":{
				"catalog_entry_id":12,
				"route_binding_id":34,
				"provider_id":"volc-ark-main",
				"provider_kind":"volcengine_ark_official",
				"adapter_key":"volcen",
				"provider_model_id":"doubao-seedream-5-0-lite-260128"
			}
		}`,
	}
	var metadata map[string]any
	if err := json.Unmarshal([]byte(providerGeneratedArtifactMetadata(job, "image", "image/png", time.Date(2026, 4, 20, 10, 0, 0, 0, time.UTC))), &metadata); err != nil {
		t.Fatalf("decode metadata: %v", err)
	}
	if metadata["origin_provider_id"] != "volc-ark-main" ||
		metadata["origin_provider_kind"] != "volcengine_ark_official" ||
		metadata["origin_adapter_key"] != "volcen" ||
		metadata["origin_provider_model_id"] != "doubao-seedream-5-0-lite-260128" ||
		metadata["derivation_state"] != "original" ||
		metadata["original_provider_artifact"] != true {
		t.Fatalf("metadata missing origin facts: %#v", metadata)
	}
	if metadata["origin_route_binding_id"] != float64(34) || metadata["origin_catalog_entry_id"] != float64(12) {
		t.Fatalf("metadata route ids = %#v", metadata)
	}
	if _, ok := metadata["provider_trust"].(map[string]any); !ok {
		t.Fatalf("metadata provider_trust missing: %#v", metadata)
	}
	trust := metadata["provider_trust"].(map[string]any)
	if trust["policy_id"] != "volcengine_ark_original_face_artifact_v1" ||
		trust["policy_scope"] != "same_provider_account" ||
		trust["scope"] != "seedream5_lite_face_image" ||
		trust["trusted_model_family"] != "seedream-lite" ||
		trust["requires_original_artifact"] != true ||
		trust["origin_provider_id"] != "volc-ark-main" {
		t.Fatalf("metadata provider_trust policy fields = %#v", trust)
	}
}

func TestAnnotateDebugRouteContextCapturesRuntimeRouteFacts(t *testing.T) {
	result := &ai.DebugCallResult{}
	annotateDebugRouteContext(result, ai.ModelRoute{
		ModelID:            "grok-video",
		CatalogEntryID:     12,
		RouteBindingID:     34,
		SourceType:         model.ModelRouteSourceLocalProvider,
		RouteGroup:         "yunwu_unified_video",
		ProviderID:         "yunwu-main",
		ProviderKind:       "yunwu",
		AdapterKey:         "yunwu_unified_video",
		AdapterType:        ai.AdapterYunwuUnifiedVideo,
		ProviderModelID:    "grok-video-3",
		Capability:         ai.CapabilityFamilyVideoGeneration,
		Operation:          ai.VideoOperationFirstLastFrameToVideo,
		APIKind:            ai.CapabilityFamilyVideoGeneration,
		EndpointPathPrefix: "/video",
		EndpointMode:       ai.RouteEndpointModeReplacePath,
		SelectionReason:    "route_binding_id",
	}, ai.CapabilityFamilyVideoGeneration)

	if result.RouteTrace == nil {
		t.Fatal("route_trace is nil")
	}
	trace := result.RouteTrace
	if trace.PublicModelID != "grok-video" || trace.RouteBindingID != 34 || trace.ProviderModelID != "grok-video-3" {
		t.Fatalf("route_trace identity = %#v", trace)
	}
	if trace.AdapterType != ai.AdapterYunwuUnifiedVideo || trace.Capability != ai.CapabilityFamilyVideoGeneration || trace.Operation != ai.VideoOperationFirstLastFrameToVideo {
		t.Fatalf("route_trace execution facts = %#v", trace)
	}
	if trace.EndpointPathPrefix != "/video" || trace.EndpointMode != ai.RouteEndpointModeReplacePath {
		t.Fatalf("route_trace endpoint facts = %#v", trace)
	}
}

func TestProviderGeneratedArtifactMetadataTrustRequiresProviderPolicy(t *testing.T) {
	job := &model.Job{
		Model:   gorm.Model{ID: 45},
		JobType: domainjob.JobTypeImage,
		RequestContext: `{
			"model":{"identifier":"volcengine:seedream-5-0-lite","model_def_id":"volcengine:seedream-5-0-lite","provider_name":"Ark proxy"},
			"route":{
				"catalog_entry_id":12,
				"route_binding_id":34,
				"provider_id":"volc-ark-proxy",
				"provider_kind":"volcengine_ark_proxy",
				"adapter_key":"openai_compat",
				"provider_model_id":"doubao-seedream-5-0-lite-260128"
			}
		}`,
	}
	var metadata map[string]any
	if err := json.Unmarshal([]byte(providerGeneratedArtifactMetadata(job, "image", "image/png", time.Date(2026, 4, 20, 10, 0, 0, 0, time.UTC))), &metadata); err != nil {
		t.Fatalf("decode metadata: %v", err)
	}
	if _, ok := metadata["provider_trust"]; ok {
		t.Fatalf("proxy provider should not get provider_trust: %#v", metadata)
	}
	if _, ok := metadata["trust_claim"]; ok {
		t.Fatalf("proxy provider should not get trust_claim: %#v", metadata)
	}
}

func TestProviderGeneratedArtifactMetadataTrustRequiresProviderAccount(t *testing.T) {
	job := &model.Job{
		Model:   gorm.Model{ID: 46},
		JobType: domainjob.JobTypeVideo,
		RequestContext: `{
			"model":{"identifier":"volcengine:seedance-2-0","model_def_id":"volcengine:seedance-2-0","provider_name":"Ark main"},
			"route":{
				"catalog_entry_id":12,
				"route_binding_id":34,
				"provider_kind":"volcengine_ark_official",
				"adapter_key":"volcen",
				"provider_model_id":"doubao-seedance-2-0-260128"
			}
		}`,
	}
	var metadata map[string]any
	if err := json.Unmarshal([]byte(providerGeneratedArtifactMetadata(job, "video", "video/mp4", time.Date(2026, 4, 20, 10, 0, 0, 0, time.UTC))), &metadata); err != nil {
		t.Fatalf("decode metadata: %v", err)
	}
	if _, ok := metadata["provider_trust"]; ok {
		t.Fatalf("missing provider_id should not get provider_trust: %#v", metadata)
	}
}

func TestCallProviderWithTimeout(t *testing.T) {
	start := time.Now()
	_, err := callProviderWithTimeout(context.Background(), 20*time.Millisecond, func(ctx context.Context) (string, error) {
		<-ctx.Done()
		return "", ctx.Err()
	})
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected DeadlineExceeded, got %v", err)
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("timeout took too long: %s", elapsed)
	}
}

func TestRetryDelayCaps(t *testing.T) {
	if retryDelay(1) != 10*time.Second {
		t.Fatalf("attempt 1 delay = %s", retryDelay(1))
	}
	if retryDelay(99) != 5*time.Minute {
		t.Fatalf("attempt 99 delay = %s", retryDelay(99))
	}
}

func TestClaimLocalJobWritesWorkerLease(t *testing.T) {
	db := openJobRunnerTestDB(t)
	job := model.Job{
		UserID:         1,
		RuntimeModelID: 1,
		JobType:        domainjob.JobTypeImage,
		Status:         StatusPending,
		MaxAttempts:    3,
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}

	worker := NewWorker(db, nil, nil, nil)
	worker.workerID = "worker-a"

	var claimed model.Job
	if err := worker.claimLocalJob(&claimed); err != nil {
		t.Fatalf("claim job: %v", err)
	}
	if claimed.ID != job.ID {
		t.Fatalf("claimed job id = %d, want %d", claimed.ID, job.ID)
	}
	if claimed.Status != StatusRunning {
		t.Fatalf("claimed status = %q", claimed.Status)
	}
	if claimed.LockedBy != worker.workerID {
		t.Fatalf("locked_by = %q, want %q", claimed.LockedBy, worker.workerID)
	}
	if claimed.LeaseUntil == nil || !claimed.LeaseUntil.After(time.Now()) {
		t.Fatalf("lease_until was not set in the future: %v", claimed.LeaseUntil)
	}
	if claimed.AttemptCount != 1 {
		t.Fatalf("attempt_count = %d, want 1", claimed.AttemptCount)
	}
}

func TestWorkerRouteHelpersDoNotFallbackToLegacyModelConfig(t *testing.T) {
	db := testutil.OpenSQLite(t, "worker_catalog_only.db", &model.Job{}, &model.AIModelCatalogEntry{})
	worker := NewWorker(db, nil, nil, nil)
	if db.Migrator().HasTable("ai_model_configs") || db.Migrator().HasTable(&model.AICredential{}) {
		t.Fatal("catalog-only worker test should not create legacy provider tables")
	}
	job := &model.Job{UserID: 7, RuntimeModelID: 42, JobType: domainjob.JobTypeImage}
	if got := worker.modelAdapterTypeForJob(job); got != "" {
		t.Fatalf("modelAdapterTypeForJob() = %q, want empty without route metadata", got)
	}
	if got := worker.jobModelDefID(context.Background(), job); got != "" {
		t.Fatalf("jobModelDefID() = %q, want empty without route metadata", got)
	}
	if uploader, cacheKey := worker.providerFileUploaderForJob(context.Background(), job); uploader != nil || cacheKey != "" {
		t.Fatalf("providerFileUploaderForJob() = %v/%q, want nil empty without route metadata", uploader, cacheKey)
	}
}

func TestWorkerUsesCatalogRouteBindingForModelAdapterWithoutLegacyModelConfigTable(t *testing.T) {
	db := testutil.OpenSQLite(t, "worker_catalog_route_adapter.db",
		&model.Job{},
		&model.AICredential{},
		&model.AIModelCatalogEntry{},
		&model.AIModelRouteBinding{},
	)
	if db.Migrator().HasTable("ai_model_configs") {
		t.Fatal("catalog route adapter test should not create legacy ai_model_configs")
	}
	cred := model.AICredential{AdapterType: ai.AdapterVolcen, DisplayName: "Volcen route", IsEnabled: true}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := model.AIModelCatalogEntry{
		PublicModelID:         "image-fast",
		DisplayName:           "Image Fast",
		IsEnabled:             true,
		Capabilities:          ai.CapabilityFamilyImageGeneration,
		ModelCapabilitiesJSON: testOperationCapabilitiesJSON(ai.CapabilityFamilyImageGeneration, ai.ImageOperationTextToImage),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := model.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      model.ModelRouteSourceLocalProvider,
		AdapterType:     cred.AdapterType,
		CredentialID:    &cred.ID,
		ProviderModelID: "provider-image-v2",
		IsEnabled:       true,
		CapacityWeight:  1}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	job := model.Job{
		UserID:                7,
		RuntimeModelID:        entry.ID,
		AIModelCatalogEntryID: &entry.ID,
		RouteBindingID:        &binding.ID,
		JobType:               domainjob.JobTypeImage,
		Status:                StatusRunning,
		MaxAttempts:           1,
	}
	worker := NewWorker(db, ai.NewAIService(db, ai.NewRegistry(db, nil)), nil, nil)

	route, err := worker.resolveJobModelRoute(context.Background(), &job, ai.CapabilityFamilyImageGeneration)
	if err != nil {
		t.Fatalf("resolveJobModelRoute() error = %v", err)
	}
	if route.RouteBindingID != binding.ID || route.CatalogEntryID != entry.ID || route.CredentialID != cred.ID {
		t.Fatalf("route = %#v, want persisted route binding/catalog/credential", route)
	}
	if got := worker.modelAdapterTypeForJob(&job); got != ai.AdapterVolcen {
		t.Fatalf("modelAdapterTypeForJob() = %q, want route credential adapter %q", got, ai.AdapterVolcen)
	}
	if got := worker.jobModelDefID(context.Background(), &job); got != "provider-image-v2" {
		t.Fatalf("jobModelDefID() = %q, want catalog provider model id", got)
	}
}

func TestBuildVideoRequestAppliesCertifiedProviderAssetsOnlyWhenRouteSupportsAssetURI(t *testing.T) {
	const providerID = "volc-ark-main"
	db := testutil.OpenSQLite(t, "worker_video_certified_provider_assets.db", &model.RawResource{})
	resource := model.RawResource{
		OwnerID:                     7,
		Type:                        "image",
		Name:                        "hero.png",
		FilePath:                    "stored:hero.png",
		MimeType:                    "image/png",
		ProviderAssetCertifications: `{"volc-ark-main":{"provider_id":"volc-ark-main","status":"active","asset_type":"image","asset_uri":"asset://sd2_asset_hero"}}`,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	resourceID := resource.ID
	job := &model.Job{Prompt: "make the portrait move", InputResourceID: &resourceID}
	imageData := []ai.MediaData{{
		ResourceID:   resource.ID,
		PresignedURL: "https://example.test/ordinary-reference.png",
		MimeType:     "image/png",
	}}
	worker := NewWorker(db, nil, nil, nil)

	ordinaryReq := worker.buildVideoRequest(job, parseGenerationParams(""), 5, imageData, nil, nil, nil)
	if len(ordinaryReq.InputImages) != 0 {
		t.Fatalf("ordinary route input images = %#v, want no asset URI", ordinaryReq.InputImages)
	}
	if len(ordinaryReq.InputImageDataList) != 1 {
		t.Fatalf("ordinary route image data len = %d, want original media data", len(ordinaryReq.InputImageDataList))
	}

	volcenReq := worker.buildVideoRequest(job, parseGenerationParams(""), 5, imageData, nil, nil, worker.certifiedProviderAssetsForJob(job, providerID))
	if len(volcenReq.InputImages) != 1 || volcenReq.InputImages[0] != "asset://sd2_asset_hero" {
		t.Fatalf("volcen route input images = %#v, want asset URI", volcenReq.InputImages)
	}
	if len(volcenReq.InputImageDataList) != 0 {
		t.Fatalf("volcen route image data len = %d, want certified resource replaced by asset URI", len(volcenReq.InputImageDataList))
	}
}

func TestPrepareVideoInputReferencesFailsWhenRouteRequiresPublicImageURL(t *testing.T) {
	db := testutil.OpenSQLite(t, "worker_video_public_image_url_required.db", &model.RawResource{})
	resource := model.RawResource{
		OwnerID:  7,
		Type:     "image",
		Name:     "ref.png",
		FilePath: "stored:ref.png",
		MimeType: "image/png",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	resourceID := resource.ID
	job := &model.Job{Prompt: "animate", InputResourceID: &resourceID}
	route := ai.ModelRoute{
		RouteBindingID: 88,
		Capability:     ai.CapabilityFamilyVideoGeneration,
		Operation:      ai.VideoOperationImageToVideo,
		AdapterType:    ai.AdapterVolcen,
	}
	imageData := []ai.MediaData{{ResourceID: resource.ID, MimeType: "image/png"}}
	worker := NewWorker(db, nil, nil, nil)

	traces, err := worker.prepareVideoInputReferencesForRouteWithTrace(job, route, imageData, nil, nil)
	if err == nil {
		t.Fatal("expected missing public URL error")
	}
	if !strings.Contains(err.Error(), "route 88 requires public image URL") || !strings.Contains(err.Error(), "resource #") {
		t.Fatalf("error = %v, want route public URL diagnostic", err)
	}
	if len(traces) != 1 {
		t.Fatalf("resource access trace len = %d, want 1", len(traces))
	}
	if traces[0].ResourceID != resource.ID || traces[0].Transport != "public_url" || traces[0].Status != "missing_profile" || traces[0].Error != "missing_resource_access_profile" {
		t.Fatalf("resource access trace = %#v, want missing profile public URL trace", traces[0])
	}
}

func TestPrepareVideoInputReferencesAcceptsExistingPublicImageURL(t *testing.T) {
	worker := NewWorker(nil, nil, nil, nil)
	route := ai.ModelRoute{
		RouteBindingID: 89,
		Capability:     ai.CapabilityFamilyVideoGeneration,
		Operation:      ai.VideoOperationImageToVideo,
		AdapterType:    ai.AdapterVolcen,
	}
	imageData := []ai.MediaData{{ResourceID: 12, PresignedURL: "https://cdn.example.test/ref.png", MimeType: "image/png"}}

	traces, err := worker.prepareVideoInputReferencesForRouteWithTrace(&model.Job{}, route, imageData, nil, nil)
	if err != nil {
		t.Fatalf("prepareVideoInputReferencesForRoute() error = %v", err)
	}
	if len(traces) != 1 || traces[0].Source != "existing_public_url" || traces[0].URLHost != "cdn.example.test" {
		t.Fatalf("resource access trace = %#v, want existing public URL trace", traces)
	}
}

func TestPrepareVideoInputReferencesUsesResourceAccessProfile(t *testing.T) {
	db := testutil.OpenSQLite(t, "runner_resource_access_public_url.db",
		&model.AdminSetting{},
		&model.RawResource{},
	)
	resource := model.RawResource{
		Name:     "first-frame.png",
		Type:     "image",
		MimeType: "image/png",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	if _, err := adminsettings.NewService(db).UpdateResourceAccessSettings(context.Background(), adminsettings.ResourceAccessSettings{
		DefaultProfileID: "local-ngrok",
		Profiles: []adminsettings.ResourceAccessProfile{{
			ID:             "local-ngrok",
			Name:           "Local ngrok",
			Enabled:        true,
			Mode:           "public_tunnel",
			PublicBaseURL:  "https://example-ngrok.test",
			SigningEnabled: true,
			SigningSecret:  "secret",
			ExpiresSeconds: 3600,
		}},
	}); err != nil {
		t.Fatalf("save resource access settings: %v", err)
	}
	route := ai.ModelRoute{
		RouteBindingID: 90,
		Capability:     ai.CapabilityFamilyVideoGeneration,
		Operation:      ai.VideoOperationImageToVideo,
		AdapterType:    ai.AdapterVolcen,
	}
	worker := NewWorker(db, nil, nil, nil)
	imageData := []ai.MediaData{{ResourceID: resource.ID, MimeType: "image/png"}}

	traces, err := worker.prepareVideoInputReferencesForRouteWithTrace(&model.Job{}, route, imageData, nil, nil)
	if err != nil {
		t.Fatalf("prepareVideoInputReferencesForRoute() error = %v", err)
	}
	if got := imageData[0].PresignedURL; !strings.HasPrefix(got, "https://example-ngrok.test/api/v1/resource-access/resources/") ||
		!strings.Contains(got, "profile=local-ngrok") ||
		!strings.Contains(got, "signature=") {
		t.Fatalf("PresignedURL = %q, want signed resource access URL", got)
	}
	if len(traces) != 1 {
		t.Fatalf("resource access trace len = %d, want 1", len(traces))
	}
	if traces[0].Source != "resource_access_profile" ||
		traces[0].Status != "resolved" ||
		traces[0].ProfileID != "local-ngrok" ||
		traces[0].ProfileMode != "public_tunnel" ||
		traces[0].URLHost != "example-ngrok.test" ||
		traces[0].URLPath != "/api/v1/resource-access/resources/"+strconv.FormatUint(uint64(resource.ID), 10)+"/file" ||
		traces[0].ExpiresAt == 0 {
		t.Fatalf("resource access trace = %#v, want resolved signed URL trace", traces[0])
	}
	var reloaded model.RawResource
	if err := db.First(&reloaded, resource.ID).Error; err != nil {
		t.Fatalf("reload resource: %v", err)
	}
	if strings.Contains(reloaded.CloudUploads, "example-ngrok.test") || strings.Contains(reloaded.CloudUploads, "resource-access") {
		t.Fatalf("cloud_uploads = %q, want no cached resource access URL", reloaded.CloudUploads)
	}
}

func TestPrepareVideoInputReferencesUsesObjectRelayResourceAccessProfile(t *testing.T) {
	db := testutil.OpenSQLite(t, "runner_resource_access_object_relay.db",
		&model.AdminSetting{},
		&model.RawResource{},
	)
	resource := model.RawResource{
		Name:     "seedance-ref.png",
		Type:     "image",
		MimeType: "image/png",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	if _, err := adminsettings.NewService(db).UpdateResourceAccessSettings(context.Background(), adminsettings.ResourceAccessSettings{
		DefaultProfileID: "relay",
		Profiles: []adminsettings.ResourceAccessProfile{{
			ID:             "relay",
			Name:           "Object relay",
			Enabled:        true,
			Mode:           "object_relay",
			PublicBaseURL:  "https://relay.example.test",
			SigningEnabled: true,
			SigningSecret:  "secret",
			ExpiresSeconds: 600,
		}},
	}); err != nil {
		t.Fatalf("save resource access settings: %v", err)
	}
	route := ai.ModelRoute{
		RouteBindingID:  91,
		Capability:      ai.CapabilityFamilyVideoGeneration,
		Operation:       ai.VideoOperationImageToVideo,
		AdapterType:     ai.AdapterYunwuUnifiedVideo,
		ProviderModelID: "grok-video-3",
	}
	worker := NewWorker(db, nil, nil, nil)
	imageData := []ai.MediaData{{ResourceID: resource.ID, MimeType: "image/png"}}

	traces, err := worker.prepareVideoInputReferencesForRouteWithTrace(&model.Job{}, route, imageData, nil, nil)
	if err != nil {
		t.Fatalf("prepareVideoInputReferencesForRoute() error = %v", err)
	}
	if len(traces) != 1 {
		t.Fatalf("resource access trace len = %d, want 1", len(traces))
	}
	if traces[0].ProfileMode != "object_relay" || traces[0].URLHost != "relay.example.test" || traces[0].Status != "resolved" {
		t.Fatalf("resource access trace = %#v, want object relay profile trace", traces[0])
	}
}

func TestPrepareVideoInputReferencesUsesResourceAccessForVolcenSeedanceRoute(t *testing.T) {
	db := testutil.OpenSQLite(t, "runner_resource_access_seedance.db",
		&model.AdminSetting{},
		&model.RawResource{},
	)
	image := model.RawResource{Name: "first.png", Type: "image", MimeType: "image/png"}
	video := model.RawResource{Name: "motion.mp4", Type: "video", MimeType: "video/mp4"}
	if err := db.Create(&image).Error; err != nil {
		t.Fatalf("create image resource: %v", err)
	}
	if err := db.Create(&video).Error; err != nil {
		t.Fatalf("create video resource: %v", err)
	}
	if _, err := adminsettings.NewService(db).UpdateResourceAccessSettings(context.Background(), adminsettings.ResourceAccessSettings{
		DefaultProfileID: "seedance-public",
		Profiles: []adminsettings.ResourceAccessProfile{{
			ID:             "seedance-public",
			Name:           "Seedance public tunnel",
			Enabled:        true,
			Mode:           "public_tunnel",
			PublicBaseURL:  "https://seedance-public.example.test",
			SigningEnabled: true,
			SigningSecret:  "secret",
			ExpiresSeconds: 900,
		}},
	}); err != nil {
		t.Fatalf("save resource access settings: %v", err)
	}
	route := ai.ModelRoute{
		RouteBindingID:  92,
		Capability:      ai.CapabilityFamilyVideoGeneration,
		Operation:       ai.VideoOperationReferenceToVideo,
		AdapterType:     ai.AdapterVolcen,
		ProviderModelID: "doubao-seedance-2-0-pro-260128",
	}
	worker := NewWorker(db, nil, nil, nil)
	imageData := []ai.MediaData{{ResourceID: image.ID, MimeType: "image/png"}}
	videoData := []ai.MediaData{{ResourceID: video.ID, MimeType: "video/mp4"}}

	traces, err := worker.prepareVideoInputReferencesForRouteWithTrace(&model.Job{}, route, imageData, videoData, nil)
	if err != nil {
		t.Fatalf("prepareVideoInputReferencesForRoute() error = %v", err)
	}
	if !strings.Contains(imageData[0].PresignedURL, "profile=seedance-public") ||
		!strings.Contains(videoData[0].PresignedURL, "profile=seedance-public") {
		t.Fatalf("image/video presigned URLs = %q / %q, want ResourceAccess URLs", imageData[0].PresignedURL, videoData[0].PresignedURL)
	}
	if len(traces) != 2 {
		t.Fatalf("resource access trace len = %d, want 2", len(traces))
	}
	for _, trace := range traces {
		if trace.Status != "resolved" || trace.ProfileID != "seedance-public" || trace.Transport != "public_url" {
			t.Fatalf("resource access trace = %#v, want resolved seedance public URL trace", trace)
		}
	}
}

func TestRunVideoJobRecordsResourceAccessTraceBeforeUpstreamCall(t *testing.T) {
	db := testutil.OpenSQLite(t, "runner_video_resource_access_trace.db",
		&model.Job{},
		&model.RawResource{},
		&model.AIModelCatalogEntry{},
		&model.AIModelRouteBinding{},
		&model.AdminSetting{},
	)
	resource := model.RawResource{
		Name:     "first-frame.png",
		Type:     "image",
		MimeType: "image/png",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	entry := model.AIModelCatalogEntry{
		PublicModelID:         "grok-video",
		DisplayName:           "Grok Video",
		IsEnabled:             true,
		Capabilities:          ai.CapabilityFamilyVideoGeneration,
		ModelCapabilitiesJSON: `{"video_generation":{"operations":["image_to_video"],"reference_assets":{"min":1,"max":1,"modalities":["image"],"roles":["generic"]}}}`,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := model.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      model.ModelRouteSourceRelayGateway,
		ProviderID:      model.ModelRouteSourceRelayGateway,
		AdapterType:     ai.AdapterYunwuUnifiedVideo,
		ProviderModelID: "grok-video-3",
		IsEnabled:       true,
		CapacityWeight:  1,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	requestContext := `{"intent":{"capability":"video_generation","operation":"image_to_video","reference_assets":[{"role":"generic","media_type":"image","resource_id":` + strconv.FormatUint(uint64(resource.ID), 10) + `}]}}`
	job := &model.Job{
		UserID:                7,
		RuntimeModelID:        entry.ID,
		AIModelCatalogEntryID: &entry.ID,
		RouteBindingID:        &binding.ID,
		JobType:               domainjob.JobTypeVideo,
		Status:                StatusRunning,
		MaxAttempts:           1,
		RequestContext:        requestContext,
		InputResourceIDs:      "[" + strconv.FormatUint(uint64(resource.ID), 10) + "]",
	}
	worker := NewWorker(db, ai.NewAIService(db, ai.NewRegistry(db, nil)), nil, nil)
	debugResult := &ai.DebugCallResult{}
	imageData := []ai.MediaData{{ResourceID: resource.ID, MimeType: "image/png"}}

	err := worker.runVideoJob(context.Background(), context.Background(), job, parseGenerationParams(""), imageData, nil, nil, nil, debugResult)
	if err == nil {
		t.Fatal("runVideoJob() succeeded, want missing ResourceAccessProfile error before provider call")
	}
	if debugResult.Endpoint != "" || len(debugResult.Calls) != 0 {
		t.Fatalf("debug HTTP exchange = endpoint %q calls %#v, want no upstream call", debugResult.Endpoint, debugResult.Calls)
	}
	if debugResult.RouteTrace == nil || debugResult.RouteTrace.RouteBindingID != binding.ID || debugResult.RouteTrace.ProviderModelID != "grok-video-3" {
		t.Fatalf("route trace = %#v, want selected route trace", debugResult.RouteTrace)
	}
	if len(debugResult.ResourceAccessTrace) != 1 {
		t.Fatalf("resource access trace len = %d, want 1", len(debugResult.ResourceAccessTrace))
	}
	trace := debugResult.ResourceAccessTrace[0]
	if trace.ResourceID != resource.ID || trace.Transport != "public_url" || trace.Status != "missing_profile" || trace.Error != "missing_resource_access_profile" {
		t.Fatalf("resource access trace = %#v, want missing profile trace", trace)
	}
}

func TestBuildVideoRequestMatchesCertifiedProviderAssetsByProviderModel(t *testing.T) {
	const providerID = "yunwu-main"
	db := testutil.OpenSQLite(t, "worker_video_certified_provider_assets_by_model.db", &model.RawResource{})
	resource := model.RawResource{
		OwnerID:  7,
		Type:     "image",
		Name:     "hero.png",
		FilePath: "stored:hero.png",
		MimeType: "image/png",
		ProviderAssetCertifications: `{
			"yunwu-main::model:doubao-seedance-2-0-260128":{"provider_id":"yunwu-main","status":"active","asset_type":"image","model":"doubao-seedance-2-0-260128","asset_uri":"asset://standard-asset"},
			"yunwu-main::model:doubao-seedance-2-0-fast-260128":{"provider_id":"yunwu-main","status":"active","asset_type":"image","model":"doubao-seedance-2-0-fast-260128","asset_uri":"asset://fast-asset"}
		}`,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	resourceID := resource.ID
	job := &model.Job{Prompt: "make the portrait move", InputResourceID: &resourceID}
	imageData := []ai.MediaData{{ResourceID: resource.ID, PresignedURL: "https://example.test/ref.png", MimeType: "image/png"}}
	worker := NewWorker(db, nil, nil, nil)

	fastReq := worker.buildVideoRequest(job, parseGenerationParams(""), 5, imageData, nil, nil, worker.certifiedProviderAssetsForJob(job, providerID, "doubao-seedance-2-0-fast-260128"))
	if len(fastReq.InputImages) != 1 || fastReq.InputImages[0] != "asset://fast-asset" {
		t.Fatalf("fast route input images = %#v, want fast asset URI", fastReq.InputImages)
	}
	standardReq := worker.buildVideoRequest(job, parseGenerationParams(""), 5, imageData, nil, nil, worker.certifiedProviderAssetsForJob(job, providerID, "doubao-seedance-2-0-260128"))
	if len(standardReq.InputImages) != 1 || standardReq.InputImages[0] != "asset://standard-asset" {
		t.Fatalf("standard route input images = %#v, want standard asset URI", standardReq.InputImages)
	}
}

func TestBuildVideoRequestUsesProviderAssetReadModelByProviderModel(t *testing.T) {
	const providerID = "yunwu-main"
	const modelID = "doubao-seedance-2-0-fast-260128"
	db := testutil.OpenSQLite(t, "worker_video_provider_asset_read_model.db",
		&model.RawResource{},
		&model.ProviderAssetGroup{},
		&model.ProviderAsset{},
		&model.ProviderAssetModelCertification{},
	)
	resource := model.RawResource{
		OwnerID:  7,
		Type:     "image",
		Name:     "hero.png",
		FilePath: "stored:hero.png",
		MimeType: "image/png",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	group := model.ProviderAssetGroup{
		ProviderID:    providerID,
		ProviderKind:  model.AIProviderKindYunwuGateway,
		RemoteGroupID: "group-1",
		Name:          "角色组",
		Status:        model.ProviderAssetStatusActive,
	}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("create provider asset group: %v", err)
	}
	asset := model.ProviderAsset{
		ProviderID:       providerID,
		ProviderKind:     model.AIProviderKindYunwuGateway,
		GroupID:          group.ID,
		RemoteGroupID:    group.RemoteGroupID,
		RemoteAssetID:    "asset-fast",
		AssetURI:         "asset://read-model-fast",
		SourceResourceID: &resource.ID,
		Name:             "hero",
		AssetType:        "image",
		Status:           model.ProviderAssetStatusActive,
	}
	if err := db.Create(&asset).Error; err != nil {
		t.Fatalf("create provider asset: %v", err)
	}
	if err := db.Create(&model.ProviderAssetModelCertification{
		ProviderAssetID: asset.ID,
		ProviderID:      providerID,
		PublicModelID:   modelID,
		ProviderModelID: modelID,
		Capability:      ai.CapabilityFamilyVideoGeneration,
		Status:          model.ProviderAssetStatusActive,
		AssetURI:        asset.AssetURI,
		RemoteAssetID:   asset.RemoteAssetID,
	}).Error; err != nil {
		t.Fatalf("create provider asset model certification: %v", err)
	}
	resourceID := resource.ID
	job := &model.Job{Prompt: "make the portrait move", InputResourceID: &resourceID}
	imageData := []ai.MediaData{{ResourceID: resource.ID, PresignedURL: "https://example.test/ref.png", MimeType: "image/png"}}
	worker := NewWorker(db, nil, nil, nil)

	req := worker.buildVideoRequest(job, parseGenerationParams(""), 5, imageData, nil, nil, worker.certifiedProviderAssetsForJob(job, providerID, modelID))
	if len(req.InputImages) != 1 || req.InputImages[0] != "asset://read-model-fast" {
		t.Fatalf("route input images = %#v, want read-model asset URI", req.InputImages)
	}
}

func TestBuildVideoRequestPrefersModelCertificationOverLegacyProviderKey(t *testing.T) {
	const providerID = "yunwu-main"
	db := testutil.OpenSQLite(t, "worker_video_certified_provider_assets_model_preference.db", &model.RawResource{})
	resource := model.RawResource{
		OwnerID:  7,
		Type:     "image",
		Name:     "hero.png",
		FilePath: "stored:hero.png",
		MimeType: "image/png",
		ProviderAssetCertifications: `{
			"yunwu-main":{"provider_id":"yunwu-main","status":"active","asset_type":"image","asset_uri":"asset://legacy-asset"},
			"yunwu-main::model:doubao-seedance-2-0-fast-260128":{"provider_id":"yunwu-main","status":"active","asset_type":"image","model":"doubao-seedance-2-0-fast-260128","asset_uri":"asset://fast-asset"}
		}`,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	resourceID := resource.ID
	job := &model.Job{Prompt: "make the portrait move", InputResourceID: &resourceID}
	imageData := []ai.MediaData{{ResourceID: resource.ID, PresignedURL: "https://example.test/ref.png", MimeType: "image/png"}}
	worker := NewWorker(db, nil, nil, nil)

	req := worker.buildVideoRequest(job, parseGenerationParams(""), 5, imageData, nil, nil, worker.certifiedProviderAssetsForJob(job, providerID, "doubao-seedance-2-0-fast-260128"))
	if len(req.InputImages) != 1 || req.InputImages[0] != "asset://fast-asset" {
		t.Fatalf("fast route input images = %#v, want model-specific asset URI", req.InputImages)
	}
}

func TestBuildVideoRequestIgnoresCertifiedProviderAssetsForNonImageResources(t *testing.T) {
	const providerID = "volc-ark-main"
	db := testutil.OpenSQLite(t, "worker_video_certified_provider_asset_modalities.db", &model.RawResource{})
	videoResource := model.RawResource{
		OwnerID:                     7,
		Type:                        "video",
		Name:                        "ref.mp4",
		FilePath:                    "stored:ref.mp4",
		MimeType:                    "video/mp4",
		ProviderAssetCertifications: `{"volc-ark-main":{"provider_id":"volc-ark-main","status":"active","asset_type":"video","asset_uri":"asset://sd2_video_ref"}}`,
	}
	audioResource := model.RawResource{
		OwnerID:                     7,
		Type:                        "audio",
		Name:                        "ref.mp3",
		FilePath:                    "stored:ref.mp3",
		MimeType:                    "audio/mpeg",
		ProviderAssetCertifications: `{"volc-ark-main":{"provider_id":"volc-ark-main","status":"active","asset_type":"audio","asset_uri":"asset://sd2_audio_ref"}}`,
	}
	if err := db.Create(&videoResource).Error; err != nil {
		t.Fatalf("create video resource: %v", err)
	}
	if err := db.Create(&audioResource).Error; err != nil {
		t.Fatalf("create audio resource: %v", err)
	}
	videoResourceID := videoResource.ID
	audioResourceID := audioResource.ID
	job := &model.Job{Prompt: "animate with references", InputResourceIDs: "[" + strconv.FormatUint(uint64(videoResourceID), 10) + "," + strconv.FormatUint(uint64(audioResourceID), 10) + "]"}
	videoData := []ai.MediaData{{ResourceID: videoResource.ID, PresignedURL: "https://example.test/ref.mp4", MimeType: "video/mp4"}}
	audioData := []ai.MediaData{{ResourceID: audioResource.ID, PresignedURL: "https://example.test/ref.mp3", MimeType: "audio/mpeg"}}

	worker := NewWorker(db, nil, nil, nil)
	req := worker.buildVideoRequest(job, parseGenerationParams(""), 5, nil, videoData, audioData, worker.certifiedProviderAssetsForJob(job, providerID))
	if req.InputVideo != "" || req.InputVideoData == nil {
		t.Fatalf("video mapping produced InputVideo=%q InputVideoData=%#v", req.InputVideo, req.InputVideoData)
	}
	if req.InputAudio != "" || req.InputAudioData == nil {
		t.Fatalf("audio mapping produced InputAudio=%q InputAudioData=%#v", req.InputAudio, req.InputAudioData)
	}
}

func TestBuildVideoRequestPreservesMultipleVideoAudioInputs(t *testing.T) {
	worker := NewWorker(nil, nil, nil, nil)
	job := &model.Job{Prompt: "animate with several references"}
	videoData := []ai.MediaData{
		{ResourceID: 21, PresignedURL: "https://example.test/ref-a.mp4", MimeType: "video/mp4"},
		{ResourceID: 22, PresignedURL: "https://example.test/ref-b.mp4", MimeType: "video/mp4"},
	}
	audioData := []ai.MediaData{
		{ResourceID: 31, PresignedURL: "https://example.test/audio-a.mp3", MimeType: "audio/mpeg"},
		{ResourceID: 32, PresignedURL: "https://example.test/audio-b.wav", MimeType: "audio/wav"},
	}

	req := worker.buildVideoRequest(job, parseGenerationParams(""), 5, nil, videoData, audioData, nil)
	if len(req.InputVideoDataList) != 2 || req.InputVideoData == nil || req.InputVideoData.ResourceID != 21 {
		t.Fatalf("video inputs = list:%#v first:%#v, want two videos with first selected", req.InputVideoDataList, req.InputVideoData)
	}
	if len(req.InputAudioDataList) != 2 || req.InputAudioData == nil || req.InputAudioData.ResourceID != 31 {
		t.Fatalf("audio inputs = list:%#v first:%#v, want two audios with first selected", req.InputAudioDataList, req.InputAudioData)
	}
}

func TestBuildVideoRequestIgnoresInactiveProviderAssetCertification(t *testing.T) {
	const providerID = "volc-ark-main"
	db := testutil.OpenSQLite(t, "worker_video_inactive_provider_asset.db", &model.RawResource{})
	resource := model.RawResource{
		OwnerID:                     7,
		Type:                        "image",
		Name:                        "hero.png",
		FilePath:                    "stored:hero.png",
		MimeType:                    "image/png",
		ProviderAssetCertifications: `{"volc-ark-main":{"provider_id":"volc-ark-main","status":"processing","asset_type":"image","asset_uri":"asset://not-ready"}}`,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	resourceID := resource.ID
	worker := NewWorker(db, nil, nil, nil)
	job := &model.Job{Prompt: "animate", InputResourceID: &resourceID}
	req := worker.buildVideoRequest(job, parseGenerationParams(""), 5, []ai.MediaData{{ResourceID: resource.ID, PresignedURL: "https://example.test/ref.png"}}, nil, nil, worker.certifiedProviderAssetsForJob(job, providerID))
	if len(req.InputImages) != 0 || len(req.InputImageDataList) != 1 {
		t.Fatalf("inactive certification produced InputImages=%#v InputImageDataList=%#v", req.InputImages, req.InputImageDataList)
	}
}

func TestProviderAssetDiagnosticsExplainAssetURIDecisions(t *testing.T) {
	const providerID = "volc-ark-main"
	db := testutil.OpenSQLite(t, "worker_provider_asset_diagnostics.db", &model.RawResource{})
	activeImage := model.RawResource{
		OwnerID:                     7,
		Type:                        "image",
		Name:                        "active.png",
		FilePath:                    "stored:active.png",
		MimeType:                    "image/png",
		ProviderAssetCertifications: `{"volc-ark-main":{"provider_id":"volc-ark-main","status":"active","asset_type":"image","asset_uri":"asset://active-image","asset_group_id":"group-1"}}`,
		ProviderGeneratedArtifact:   `{"origin_provider_id":"volc-ark-main","original_provider_artifact":true,"derivation_state":"original","provider_trust":{"status":"active"}}`,
	}
	mismatchImage := model.RawResource{
		OwnerID:                     7,
		Type:                        "image",
		Name:                        "mismatch.png",
		FilePath:                    "stored:mismatch.png",
		MimeType:                    "image/png",
		ProviderAssetCertifications: `{"other-provider":{"provider_id":"other-provider","status":"active","asset_type":"image","asset_uri":"asset://wrong-account"}}`,
	}
	videoResource := model.RawResource{
		OwnerID:                     7,
		Type:                        "video",
		Name:                        "ref.mp4",
		FilePath:                    "stored:ref.mp4",
		MimeType:                    "video/mp4",
		ProviderAssetCertifications: `{"volc-ark-main":{"provider_id":"volc-ark-main","status":"active","asset_type":"video","asset_uri":"asset://video-ref"}}`,
	}
	for _, resource := range []*model.RawResource{&activeImage, &mismatchImage, &videoResource} {
		if err := db.Create(resource).Error; err != nil {
			t.Fatalf("create resource %s: %v", resource.Name, err)
		}
	}
	job := &model.Job{
		InputResourceIDs: "[" +
			strconv.FormatUint(uint64(activeImage.ID), 10) + "," +
			strconv.FormatUint(uint64(mismatchImage.ID), 10) + "," +
			strconv.FormatUint(uint64(videoResource.ID), 10) +
			"]",
	}
	worker := NewWorker(db, nil, nil, nil)
	diagnostics := worker.providerAssetDiagnosticsForJob(context.Background(), job, ai.ModelRoute{
		ProviderID:   providerID,
		ProviderKind: model.AIProviderKindVolcengineArk,
	}, true)
	if len(diagnostics) != 3 {
		t.Fatalf("diagnostics len = %d, want 3: %#v", len(diagnostics), diagnostics)
	}
	activeDiagnostic := resourceDiagnosticByID(diagnostics, activeImage.ID)
	if activeDiagnostic == nil || activeDiagnostic.Mode != "provider_asset_uri" || activeDiagnostic.AssetURI != "asset://active-image" ||
		activeDiagnostic.AssetGroupID != "group-1" || activeDiagnostic.Reason != "active_provider_asset_certification" {
		t.Fatalf("active diagnostic = %#v", activeDiagnostic)
	}
	if activeDiagnostic.Trust["origin_provider_id"] != "volc-ark-main" {
		t.Fatalf("active trust summary = %#v", activeDiagnostic.Trust)
	}
	mismatchDiagnostic := resourceDiagnosticByID(diagnostics, mismatchImage.ID)
	if mismatchDiagnostic == nil || mismatchDiagnostic.Mode != "public_url" ||
		mismatchDiagnostic.Reason != "provider_asset_certification_provider_mismatch" ||
		!hasString(mismatchDiagnostic.AvailableCertificationProviders, "other-provider") {
		t.Fatalf("mismatch diagnostic = %#v", mismatchDiagnostic)
	}
	videoDiagnostic := resourceDiagnosticByID(diagnostics, videoResource.ID)
	if videoDiagnostic == nil || videoDiagnostic.Reason != "provider_asset_uri_unsupported_resource_type" {
		t.Fatalf("video diagnostic = %#v", videoDiagnostic)
	}
}

func resourceDiagnosticByID(diagnostics []ai.ResourceDiagnostic, id uint) *ai.ResourceDiagnostic {
	for i := range diagnostics {
		if diagnostics[i].ResourceID == id {
			return &diagnostics[i]
		}
	}
	return nil
}

func TestProviderAssetDiagnosticsExplainUnsupportedProvider(t *testing.T) {
	db := testutil.OpenSQLite(t, "worker_provider_asset_diagnostics_unsupported.db", &model.RawResource{})
	resource := model.RawResource{
		OwnerID:  7,
		Type:     "image",
		Name:     "ref.png",
		FilePath: "stored:ref.png",
		MimeType: "image/png",
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}
	job := &model.Job{InputResourceIDs: "[" + strconv.FormatUint(uint64(resource.ID), 10) + "]"}
	worker := NewWorker(db, nil, nil, nil)
	diagnostics := worker.providerAssetDiagnosticsForJob(context.Background(), job, ai.ModelRoute{
		ProviderID:   "gateway-main",
		ProviderKind: model.AIProviderKindOpenAICompatGateway,
	}, false)
	if len(diagnostics) != 1 {
		t.Fatalf("diagnostics len = %d, want 1: %#v", len(diagnostics), diagnostics)
	}
	if diagnostics[0].Mode != "public_url" || diagnostics[0].SupportsProviderAssetURI ||
		diagnostics[0].Reason != "provider_asset_uri_unsupported_by_route_provider" {
		t.Fatalf("unsupported provider diagnostic = %#v", diagnostics[0])
	}
}

func TestRouteSupportsProviderAssetURIOnlyForProviderCapability(t *testing.T) {
	db := testutil.OpenSQLite(t, "worker_provider_asset_uri_capability.db", &model.AIProvider{})
	if err := db.Create(&model.AIProvider{
		ProviderID:       "volc-ark-main",
		ProviderKind:     model.AIProviderKindVolcengineArk,
		ProviderCategory: model.AIProviderCategoryOfficialPlatform,
		AdapterKey:       ai.AdapterVolcen,
		DisplayName:      "Ark main",
		IsEnabled:        true,
	}).Error; err != nil {
		t.Fatalf("create ark provider: %v", err)
	}
	if err := db.Create(&model.AIProvider{
		ProviderID:       "gateway-main",
		ProviderKind:     model.AIProviderKindOpenAICompatGateway,
		ProviderCategory: model.AIProviderCategoryAggregatorGateway,
		AdapterKey:       ai.AdapterOpenAICompat,
		DisplayName:      "Gateway",
		IsEnabled:        true,
	}).Error; err != nil {
		t.Fatalf("create gateway provider: %v", err)
	}
	worker := NewWorker(db, nil, nil, nil)
	if !worker.routeSupportsProviderAssetURI(context.Background(), ai.ModelRoute{ProviderID: "volc-ark-main"}) {
		t.Fatal("official Ark provider route should support provider asset URI")
	}
	if worker.routeSupportsProviderAssetURI(context.Background(), ai.ModelRoute{ProviderID: "gateway-main"}) {
		t.Fatal("gateway provider route should not support provider asset URI")
	}
	if worker.routeSupportsProviderAssetURI(context.Background(), ai.ModelRoute{ProviderID: "seedance2"}) {
		t.Fatal("legacy provider alias should not support provider asset URI")
	}
}

func TestWorkerProviderFileUploaderUsesCatalogRouteCredentialWithoutLegacyModelConfigTable(t *testing.T) {
	db := testutil.OpenSQLite(t, "worker_catalog_route_uploader.db",
		&model.Job{},
		&model.AICredential{},
		&model.AIModelCatalogEntry{},
		&model.AIModelRouteBinding{},
		&model.AIProvider{},
		&model.AIProviderCredential{},
	)
	if db.Migrator().HasTable("ai_model_configs") {
		t.Fatal("catalog route uploader test should not create legacy ai_model_configs")
	}
	cred := model.AICredential{
		AdapterType:       ai.AdapterOpenAICompat,
		DisplayName:       "OpenAI-compatible route",
		BaseURL:           "https://provider.example.test/v1",
		IsEnabled:         true,
		FilesAPIEnabled:   true,
		FilesAPIBaseURL:   "https://files.example.test/v1",
		FilesAPIMaskedKey: "sk-***",
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	providerID := "openai_compat_gateway:provider-first-uploader"
	if err := db.Create(&model.AIProvider{
		ProviderID:       providerID,
		ProviderKind:     model.AIProviderKindOpenAICompatGateway,
		ProviderCategory: model.AIProviderCategoryAggregatorGateway,
		AdapterKey:       ai.AdapterOpenAICompat,
		DisplayName:      "Provider first uploader",
		IsEnabled:        true,
	}).Error; err != nil {
		t.Fatalf("create provider: %v", err)
	}
	if err := db.Create(&model.AIProviderCredential{
		ProviderID:      providerID,
		CredentialKey:   "primary",
		CredentialKind:  "api_key",
		PlainConfigJSON: `{"legacy_credential_id":` + strconv.FormatUint(uint64(cred.ID), 10) + `}`,
		Status:          model.AIProviderCredentialStatusActive,
		IsPrimary:       true,
	}).Error; err != nil {
		t.Fatalf("create provider credential: %v", err)
	}
	entry := model.AIModelCatalogEntry{
		PublicModelID:         "image-edit",
		DisplayName:           "Image Edit",
		IsEnabled:             true,
		Capabilities:          ai.CapabilityFamilyImageGeneration,
		ModelCapabilitiesJSON: testOperationCapabilitiesJSON(ai.CapabilityFamilyImageGeneration, ai.ImageOperationTextToImage),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := model.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      model.ModelRouteSourceLocalProvider,
		ProviderID:      providerID,
		AdapterType:     ai.AdapterOpenAICompat,
		ProviderModelID: "provider-image-edit",
		IsEnabled:       true,
		CapacityWeight:  1}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	job := model.Job{
		UserID:                7,
		RuntimeModelID:        entry.ID,
		AIModelCatalogEntryID: &entry.ID,
		RouteBindingID:        &binding.ID,
		JobType:               domainjob.JobTypeImage,
		Status:                StatusRunning,
		MaxAttempts:           1,
	}
	worker := NewWorker(db, ai.NewAIService(db, ai.NewRegistry(db, nil)), nil, nil)

	uploader, cacheKey := worker.providerFileUploaderForJob(context.Background(), &job)
	if uploader == nil {
		t.Fatal("providerFileUploaderForJob() returned nil, want uploader resolved from provider_id")
	}
	wantCacheKey := "ai_route_binding:" + strconv.FormatUint(uint64(binding.ID), 10)
	if cacheKey != wantCacheKey {
		t.Fatalf("cache key = %q, want route binding key", cacheKey)
	}
}

func TestClaimLocalProviderPollDoesNotIncrementAttempt(t *testing.T) {
	db := openJobRunnerTestDB(t)
	job := model.Job{
		UserID:         1,
		RuntimeModelID: 1,
		JobType:        domainjob.JobTypeVideo,
		Status:         StatusPending,
		AttemptCount:   1,
		MaxAttempts:    3,
		ProviderTaskID: "provider-task-1",
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}

	worker := NewWorker(db, nil, nil, nil)
	worker.workerID = "worker-a"

	var claimed model.Job
	if err := worker.claimLocalJob(&claimed); err != nil {
		t.Fatalf("claim job: %v", err)
	}
	if claimed.AttemptCount != 1 {
		t.Fatalf("attempt_count = %d, want provider poll to keep 1", claimed.AttemptCount)
	}
}

func TestClaimLocalJobEmptyQueueDoesNotLogRecordNotFound(t *testing.T) {
	var logs bytes.Buffer
	db := openJobRunnerTestDBWithLogger(t, gormlogger.New(log.New(&logs, "", 0), gormlogger.Config{
		LogLevel:                  gormlogger.Warn,
		IgnoreRecordNotFoundError: false,
	}))
	worker := NewWorker(db, nil, nil, nil)

	var claimed model.Job
	if err := worker.claimLocalJob(&claimed); err != nil {
		t.Fatalf("claim empty queue: %v", err)
	}
	if claimed.ID != 0 {
		t.Fatalf("claimed job id = %d, want 0", claimed.ID)
	}

	output := logs.String()
	if strings.Contains(output, "record not found") {
		t.Fatalf("claim empty queue logged record not found: %s", output)
	}
}

func TestCompleteFailureSyncsBoundContentUnitCandidate(t *testing.T) {
	db := testutil.OpenSQLite(t, "runner_content_candidate_failure.db",
		&model.Job{},
		&model.DecisionContext{},
		&model.ProjectDataSpace{},
		&model.ProjectDataDecisionContext{},
	)
	ctx := context.Background()
	promptSnapshot := json.RawMessage(`{"schema":"movscript.content_unit_generation_prompt_snapshot.v1","prompt":"draw a frame"}`)
	requestContext, err := json.Marshal(map[string]any{
		"model": map[string]any{
			"identifier": "gpt-image-2",
		},
		"content_unit_candidate": domainjob.ContentUnitCandidateBinding{
			ProjectID:      7,
			ProjectUID:     "prj_canvas_generate",
			ProjectTitle:   "Canvas Generate",
			ScopeKind:      appdecision.ProjectDataScopeUser,
			ScopeID:        "5",
			ContentUnitID:  "cu_failure",
			TargetKind:     appcontentcandidate.TargetKindContentUnit,
			TargetRef:      "content_units/cu_failure",
			CandidateID:    "candidate_failure",
			OutputKind:     "image",
			PromptSnapshot: promptSnapshot,
		},
	})
	if err != nil {
		t.Fatalf("marshal request context: %v", err)
	}
	job := model.Job{
		UserID:         5,
		RuntimeModelID: 1,
		JobType:        domainjob.JobTypeImage,
		Status:         StatusRunning,
		AttemptCount:   1,
		MaxAttempts:    1,
		RequestContext: string(requestContext),
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}
	pending := json.RawMessage(fmt.Sprintf(`{
		"schema":"movscript.content_candidate.v1",
		"id":"candidate_failure",
		"source":"ai_generate",
		"status":"pending",
		"producer":{"kind":"generation","job_id":%d,"model_id":"gpt-image-2"},
		"outputs":[],
		"prompt_snapshot":{"output_kind":"image","job_id":%d}
	}`, job.ID, job.ID))
	decisionService := appdecision.NewService(db)
	if _, err := decisionService.UpsertCandidate(ctx, appdecision.UpsertCandidateInput{
		TargetInput: appdecision.TargetInput{
			ProjectID:  7,
			TargetKind: appcontentcandidate.TargetKindContentUnit,
			TargetRef:  "content_units/cu_failure",
		},
		Candidate: pending,
	}); err != nil {
		t.Fatalf("upsert pending candidate: %v", err)
	}

	worker := NewWorker(db, nil, nil, nil)
	worker.completeFailure(&job, errors.New("provider rejected prompt"))

	decision, err := decisionService.Get(ctx, appdecision.TargetInput{
		ProjectID:  7,
		TargetKind: appcontentcandidate.TargetKindContentUnit,
		TargetRef:  "content_units/cu_failure",
	})
	if err != nil {
		t.Fatalf("get decision: %v", err)
	}
	if len(decision.Candidates) != 1 {
		t.Fatalf("candidate count = %d, want 1", len(decision.Candidates))
	}
	var candidate struct {
		ID       string `json:"id"`
		Status   string `json:"status"`
		Producer struct {
			Status       string `json:"status"`
			ErrorMessage string `json:"error_message"`
		} `json:"producer"`
		Outputs []struct {
			ResourceID uint `json:"resource_id"`
		} `json:"outputs"`
	}
	if err := json.Unmarshal(decision.Candidates[0], &candidate); err != nil {
		t.Fatalf("decode candidate: %v", err)
	}
	if candidate.ID != "candidate_failure" || candidate.Status != "failed" || candidate.Producer.Status != "failed" {
		t.Fatalf("candidate = %#v, want failed candidate_failure", candidate)
	}
	if candidate.Producer.ErrorMessage != "provider rejected prompt" {
		t.Fatalf("candidate error = %q, want provider rejected prompt", candidate.Producer.ErrorMessage)
	}
	if len(candidate.Outputs) != 0 {
		t.Fatalf("outputs = %#v, want none for failed candidate", candidate.Outputs)
	}

	projectDataDecision, err := appdecision.NewProjectDataService(db).Get(ctx, appdecision.ProjectDataTargetInput{
		ProjectDataSpaceInput: appdecision.ProjectDataSpaceInput{
			ProjectDataScopeInput: appdecision.ProjectDataScopeInput{
				ScopeKind: appdecision.ProjectDataScopeUser,
				ScopeID:   "5",
			},
			ProjectUID: "prj_canvas_generate",
		},
		TargetKind: appcontentcandidate.TargetKindContentUnit,
		TargetRef:  "content_units/cu_failure",
	})
	if err != nil {
		t.Fatalf("get project data decision: %v", err)
	}
	if len(projectDataDecision.Candidates) != 1 {
		t.Fatalf("project data candidate count = %d, want 1", len(projectDataDecision.Candidates))
	}
	var projectDataCandidate struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(projectDataDecision.Candidates[0], &projectDataCandidate); err != nil {
		t.Fatalf("decode project data candidate: %v", err)
	}
	if projectDataCandidate.Status != "failed" {
		t.Fatalf("project data candidate status = %q, want failed", projectDataCandidate.Status)
	}
}

func TestRenewLeaseOnlyForOwningWorker(t *testing.T) {
	db := openJobRunnerTestDB(t)
	now := time.Now()
	oldLease := now.Add(-time.Minute)
	job := model.Job{
		UserID:         1,
		RuntimeModelID: 1,
		JobType:        domainjob.JobTypeImage,
		Status:         StatusRunning,
		MaxAttempts:    3,
		LockedBy:       "worker-a",
		LeaseUntil:     &oldLease,
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}

	other := NewWorker(db, nil, nil, nil)
	other.workerID = "worker-b"
	rows, err := other.renewLease(job.ID)
	if err != nil {
		t.Fatalf("renew by non-owner: %v", err)
	}
	if rows != 0 {
		t.Fatalf("non-owner renewed %d rows, want 0", rows)
	}

	owner := NewWorker(db, nil, nil, nil)
	owner.workerID = "worker-a"
	rows, err = owner.renewLease(job.ID)
	if err != nil {
		t.Fatalf("renew by owner: %v", err)
	}
	if rows != 1 {
		t.Fatalf("owner renewed %d rows, want 1", rows)
	}

	var reloaded model.Job
	if err := db.First(&reloaded, job.ID).Error; err != nil {
		t.Fatalf("reload job: %v", err)
	}
	if reloaded.LeaseUntil == nil || !reloaded.LeaseUntil.After(now) {
		t.Fatalf("lease_until was not renewed: %v", reloaded.LeaseUntil)
	}
}

func TestRequeueStaleRunningJobsClearsExpiredLease(t *testing.T) {
	db := openJobRunnerTestDB(t)
	expiredLease := time.Now().Add(-time.Minute)
	job := model.Job{
		UserID:         1,
		RuntimeModelID: 1,
		JobType:        domainjob.JobTypeImage,
		Status:         StatusRunning,
		AttemptCount:   1,
		MaxAttempts:    3,
		LockedBy:       "dead-worker",
		LeaseUntil:     &expiredLease,
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}

	worker := NewWorker(db, nil, nil, nil)
	worker.requeueStaleRunningJobs(context.Background())

	var reloaded model.Job
	if err := db.First(&reloaded, job.ID).Error; err != nil {
		t.Fatalf("reload job: %v", err)
	}
	if reloaded.Status != StatusPending {
		t.Fatalf("status = %q, want pending", reloaded.Status)
	}
	if reloaded.LockedBy != "" {
		t.Fatalf("locked_by = %q, want empty", reloaded.LockedBy)
	}
	if reloaded.LeaseUntil != nil {
		t.Fatalf("lease_until = %v, want nil", reloaded.LeaseUntil)
	}
}

func TestWorkerExecutesOrthogonalSubtitleJobTypesAsResourceOutputs(t *testing.T) {
	db := testutil.OpenSQLite(t, "runner_p3_subtitle_jobs.db",
		&model.Job{},
		&model.RawResource{},
		&model.ResourceBlob{},
		&model.AICredential{},
		&model.AIModelCatalogEntry{},
		&model.AIModelRouteBinding{},
		&model.UsageReservation{},
		&model.UsageLog{},
	)
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileSystemStorage: %v", err)
	}
	cred := model.AICredential{
		Model:       gorm.Model{ID: 1},
		AdapterType: ai.AdapterLocal,
		DisplayName: "Local subtitle runner",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	worker := NewWorker(db, ai.NewAIService(db, ai.NewRegistry(db, nil)), store, nil)
	audioInputJob := &model.Job{UserID: 42, Title: "source audio"}
	audioResourceID, err := worker.saveBytes(context.Background(), audioInputJob, []byte("wav"), "audio/wav")
	if err != nil {
		t.Fatalf("save input audio: %v", err)
	}

	cases := []struct {
		operation string
		want      string
		withAudio bool
	}{
		{operation: ai.AudioOperationSpeechToText, want: "transcribed", withAudio: true},
		{operation: ai.AudioOperationSpeechTranslate, want: "[local speech translation:zh-CN]\ntranslated audio\n", withAudio: true},
		{operation: ai.AudioOperationForcedAlignment, want: "hello world", withAudio: true},
		{operation: ai.AudioOperationDubbing, want: "[local subtitle translation:zh-CN]\nhello world\n", withAudio: false},
	}
	for index, tc := range cases {
		entry := model.AIModelCatalogEntry{
			Model:                 gorm.Model{ID: uint(100 + index)},
			PublicModelID:         "local-" + tc.operation,
			DisplayName:           "Local " + tc.operation,
			IsEnabled:             true,
			Capabilities:          ai.CapabilityFamilyAudioGeneration,
			ModelCapabilitiesJSON: testOperationCapabilitiesJSON(ai.CapabilityFamilyAudioGeneration, tc.operation),
			SupportedParams:       testOperationSupportedParamsProfile(tc.operation),
		}
		if err := db.Create(&entry).Error; err != nil {
			t.Fatalf("create catalog entry %s: %v", tc.operation, err)
		}
		binding := model.AIModelRouteBinding{
			CatalogEntryID: entry.ID,
			SourceType:     model.ModelRouteSourceLocalProvider,
			AdapterType:    cred.AdapterType,
			CredentialID:   &cred.ID,
			IsEnabled:      true,
			CapacityWeight: 1}
		if err := db.Create(&binding).Error; err != nil {
			t.Fatalf("create route binding %s: %v", tc.operation, err)
		}
		job := model.Job{
			UserID:                42,
			RuntimeModelID:        entry.ID,
			AIModelCatalogEntryID: &entry.ID,
			RouteBindingID:        &binding.ID,
			JobType:               domainjob.JobTypeAudio,
			Status:                StatusRunning,
			MaxAttempts:           1,
			Title:                 "subtitle " + tc.operation,
			Prompt:                "hello world",
			ExtraParams:           fmt.Sprintf(`{"operation":%q,"target_language":"zh-CN","language":"en-US","script":"hello world"}`, tc.operation),
			RequestContext:        testGenerationIntentRequestContext(ai.CapabilityFamilyAudioGeneration, tc.operation),
		}
		if tc.withAudio {
			job.InputResourceID = &audioResourceID
		}
		if err := db.Create(&job).Error; err != nil {
			t.Fatalf("create job %s: %v", tc.operation, err)
		}
		if err := worker.execute(context.Background(), &job); err != nil {
			t.Fatalf("execute %s: %v", tc.operation, err)
		}

		var reloaded model.Job
		if err := db.First(&reloaded, job.ID).Error; err != nil {
			t.Fatalf("reload job %s: %v", tc.operation, err)
		}
		if reloaded.Status != StatusSucceeded {
			t.Fatalf("%s status = %q, want %q", tc.operation, reloaded.Status, StatusSucceeded)
		}
		if reloaded.OutputResourceID == nil {
			t.Fatalf("%s did not store an output resource id", tc.operation)
		}
		var output model.RawResource
		if err := db.First(&output, *reloaded.OutputResourceID).Error; err != nil {
			t.Fatalf("load output resource for %s: %v", tc.operation, err)
		}
		if output.Type != "text" || output.MimeType != "text/plain" {
			t.Fatalf("%s output resource type/mime = %q/%q", tc.operation, output.Type, output.MimeType)
		}
		data, _, _, err := worker.readResourceBytes(output)
		if err != nil {
			t.Fatalf("read output resource for %s: %v", tc.operation, err)
		}
		if string(data) != tc.want {
			t.Fatalf("%s output = %q, want %q", tc.operation, string(data), tc.want)
		}
	}
}

func TestWorkerExecutesVoiceProfileJobsAsJSONResources(t *testing.T) {
	db := testutil.OpenSQLite(t, "runner_voice_profile_jobs.db",
		&model.Job{},
		&model.RawResource{},
		&model.ResourceBlob{},
		&model.AICredential{},
		&model.AIModelCatalogEntry{},
		&model.AIModelRouteBinding{},
		&model.UsageReservation{},
		&model.UsageLog{},
	)
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileSystemStorage: %v", err)
	}
	cred := model.AICredential{
		Model:       gorm.Model{ID: 1},
		AdapterType: ai.AdapterLocal,
		DisplayName: "Local voice runner",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	worker := NewWorker(db, ai.NewAIService(db, ai.NewRegistry(db, nil)), store, nil)
	audioInputJob := &model.Job{UserID: 42, Title: "voice source"}
	audioResourceID, err := worker.saveBytes(context.Background(), audioInputJob, []byte("wav"), "audio/wav")
	if err != nil {
		t.Fatalf("save input audio: %v", err)
	}

	for index, tc := range []struct {
		operation  string
		withAudio  bool
		wantPrefix string
	}{
		{operation: ai.AudioOperationVoiceClone, withAudio: true, wantPrefix: "local_clone_"},
		{operation: ai.AudioOperationVoiceDesign, withAudio: false, wantPrefix: "local_design_"},
	} {
		entry := model.AIModelCatalogEntry{
			Model:                 gorm.Model{ID: uint(300 + index)},
			PublicModelID:         "local-" + tc.operation,
			DisplayName:           "Local " + tc.operation,
			IsEnabled:             true,
			Capabilities:          ai.CapabilityFamilyAudioGeneration,
			ModelCapabilitiesJSON: testOperationCapabilitiesJSON(ai.CapabilityFamilyAudioGeneration, tc.operation),
			SupportedParams:       testOperationSupportedParamsProfile(tc.operation),
		}
		if err := db.Create(&entry).Error; err != nil {
			t.Fatalf("create catalog entry %s: %v", tc.operation, err)
		}
		binding := model.AIModelRouteBinding{
			CatalogEntryID: entry.ID,
			SourceType:     model.ModelRouteSourceLocalProvider,
			AdapterType:    cred.AdapterType,
			CredentialID:   &cred.ID,
			IsEnabled:      true,
			CapacityWeight: 1}
		if err := db.Create(&binding).Error; err != nil {
			t.Fatalf("create route binding %s: %v", tc.operation, err)
		}
		job := model.Job{
			UserID:                42,
			RuntimeModelID:        entry.ID,
			AIModelCatalogEntryID: &entry.ID,
			RouteBindingID:        &binding.ID,
			JobType:               domainjob.JobTypeAudio,
			Status:                StatusRunning,
			MaxAttempts:           1,
			Title:                 "voice " + tc.operation,
			Prompt:                "warm narrator voice",
			ExtraParams:           fmt.Sprintf(`{"operation":%q,"name":"Narrator","description":"warm narrator voice"}`, tc.operation),
			RequestContext:        testGenerationIntentRequestContext(ai.CapabilityFamilyAudioGeneration, tc.operation),
		}
		if tc.withAudio {
			job.InputResourceID = &audioResourceID
		}
		if err := db.Create(&job).Error; err != nil {
			t.Fatalf("create job %s: %v", tc.operation, err)
		}
		if err := worker.execute(context.Background(), &job); err != nil {
			t.Fatalf("execute %s: %v", tc.operation, err)
		}

		var reloaded model.Job
		if err := db.First(&reloaded, job.ID).Error; err != nil {
			t.Fatalf("reload job %s: %v", tc.operation, err)
		}
		if reloaded.Status != StatusSucceeded || reloaded.OutputResourceID == nil {
			t.Fatalf("%s status=%q output=%v", tc.operation, reloaded.Status, reloaded.OutputResourceID)
		}
		var output model.RawResource
		if err := db.First(&output, *reloaded.OutputResourceID).Error; err != nil {
			t.Fatalf("load output resource for %s: %v", tc.operation, err)
		}
		if output.Type != "text" || output.MimeType != "application/json" {
			t.Fatalf("%s output resource type/mime = %q/%q", tc.operation, output.Type, output.MimeType)
		}
		data, _, _, err := worker.readResourceBytes(output)
		if err != nil {
			t.Fatalf("read output resource for %s: %v", tc.operation, err)
		}
		var payload struct {
			VoiceID string `json:"voice_id"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("decode output for %s: %v\n%s", tc.operation, err, string(data))
		}
		if !strings.HasPrefix(payload.VoiceID, tc.wantPrefix) {
			t.Fatalf("%s voice_id = %q, want prefix %q", tc.operation, payload.VoiceID, tc.wantPrefix)
		}
	}
}

func TestWorkerExecutesSpeechToSpeechJobAsAudioResource(t *testing.T) {
	db := testutil.OpenSQLite(t, "runner_speech_to_speech_job.db",
		&model.Job{},
		&model.RawResource{},
		&model.ResourceBlob{},
		&model.AICredential{},
		&model.AIModelCatalogEntry{},
		&model.AIModelRouteBinding{},
		&model.UsageReservation{},
		&model.UsageLog{},
	)
	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileSystemStorage: %v", err)
	}
	cred := model.AICredential{
		Model:       gorm.Model{ID: 1},
		AdapterType: ai.AdapterLocal,
		DisplayName: "Local speech-to-speech runner",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	worker := NewWorker(db, ai.NewAIService(db, ai.NewRegistry(db, nil)), store, nil)
	audioInputJob := &model.Job{UserID: 42, Title: "chat source"}
	audioResourceID, err := worker.saveBytes(context.Background(), audioInputJob, []byte("wav"), "audio/wav")
	if err != nil {
		t.Fatalf("save input audio: %v", err)
	}

	entry := model.AIModelCatalogEntry{
		Model:                 gorm.Model{ID: 400},
		PublicModelID:         "local-speech-to-speech",
		DisplayName:           "Local Speech-to-Speech",
		IsEnabled:             true,
		Capabilities:          ai.CapabilityFamilyAudioGeneration,
		ModelCapabilitiesJSON: testOperationCapabilitiesJSON(ai.CapabilityFamilyAudioGeneration, ai.AudioOperationSpeechToSpeech),
		SupportedParams:       testOperationSupportedParamsProfile(ai.AudioOperationSpeechToSpeech),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := model.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     model.ModelRouteSourceLocalProvider,
		AdapterType:    cred.AdapterType,
		CredentialID:   &cred.ID,
		IsEnabled:      true,
		CapacityWeight: 1}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	job := model.Job{
		UserID:                42,
		RuntimeModelID:        entry.ID,
		AIModelCatalogEntryID: &entry.ID,
		RouteBindingID:        &binding.ID,
		JobType:               domainjob.JobTypeAudio,
		Status:                StatusRunning,
		MaxAttempts:           1,
		Title:                 "speech to speech",
		Prompt:                "answer in a calm voice",
		ExtraParams:           `{"operation":"speech_to_speech","language":"zh-CN","voice":"alloy"}`,
		RequestContext:        testGenerationIntentRequestContext(ai.CapabilityFamilyAudioGeneration, ai.AudioOperationSpeechToSpeech),
		InputResourceID:       &audioResourceID,
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}
	if err := worker.execute(context.Background(), &job); err != nil {
		t.Fatalf("execute speech_to_speech: %v", err)
	}

	var reloaded model.Job
	if err := db.First(&reloaded, job.ID).Error; err != nil {
		t.Fatalf("reload job: %v", err)
	}
	if reloaded.Status != StatusSucceeded || reloaded.OutputResourceID == nil {
		t.Fatalf("status=%q output=%v", reloaded.Status, reloaded.OutputResourceID)
	}
	var output model.RawResource
	if err := db.First(&output, *reloaded.OutputResourceID).Error; err != nil {
		t.Fatalf("load output resource: %v", err)
	}
	if output.Type != "audio" || output.MimeType != "audio/wav" {
		t.Fatalf("output resource type/mime = %q/%q, want audio/audio/wav", output.Type, output.MimeType)
	}
	data, _, _, err := worker.readResourceBytes(output)
	if err != nil {
		t.Fatalf("read output resource: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("speech_to_speech output resource is empty")
	}
}

func openJobRunnerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return openJobRunnerTestDBWithLogger(t, nil)
}

func openJobRunnerTestDBWithLogger(t *testing.T, gormLogger gormlogger.Interface) *gorm.DB {
	t.Helper()
	config := &gorm.Config{}
	if gormLogger != nil {
		config.Logger = gormLogger
	}
	return testutil.OpenSQLiteWithConfig(t, "runner.db", config, &model.Job{})
}

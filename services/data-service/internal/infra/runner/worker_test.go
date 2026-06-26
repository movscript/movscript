package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log"
	"strconv"
	"strings"
	"testing"
	"time"

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

func TestProviderGeneratedArtifactMetadataIncludesOriginRouteFacts(t *testing.T) {
	job := &model.Job{
		Model:   gorm.Model{ID: 44},
		JobType: ai.CapabilityImage,
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

func TestProviderGeneratedArtifactMetadataTrustRequiresProviderPolicy(t *testing.T) {
	job := &model.Job{
		Model:   gorm.Model{ID: 45},
		JobType: ai.CapabilityImage,
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
		JobType: ai.CapabilityVideo,
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
		JobType:        ai.CapabilityImage,
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
	job := &model.Job{UserID: 7, RuntimeModelID: 42, JobType: ai.CapabilityImage}
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
		PublicModelID: "image-fast",
		DisplayName:   "Image Fast",
		IsEnabled:     true,
		Capabilities:  ai.CapabilityImage,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := model.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      model.ModelRouteSourceLocalProvider,
		CredentialID:    &cred.ID,
		ProviderModelID: "provider-image-v2",
		IsEnabled:       true,
		CapacityWeight:  1,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	job := model.Job{
		UserID:                7,
		RuntimeModelID:        entry.ID,
		AIModelCatalogEntryID: &entry.ID,
		RouteBindingID:        &binding.ID,
		JobType:               ai.CapabilityImage,
		Status:                StatusRunning,
		MaxAttempts:           1,
	}
	worker := NewWorker(db, ai.NewAIService(db, ai.NewRegistry(db, nil)), nil, nil)

	route, err := worker.resolveJobModelRoute(context.Background(), &job, ai.CapabilityImage)
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
		Capability:      "video_i2v",
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
		PublicModelID: "image-edit",
		DisplayName:   "Image Edit",
		IsEnabled:     true,
		Capabilities:  ai.CapabilityImageEdit,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := model.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     model.ModelRouteSourceLocalProvider,
		ProviderID:     providerID,
		IsEnabled:      true,
		CapacityWeight: 1,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	job := model.Job{
		UserID:                7,
		RuntimeModelID:        entry.ID,
		AIModelCatalogEntryID: &entry.ID,
		RouteBindingID:        &binding.ID,
		JobType:               ai.CapabilityImageEdit,
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
		JobType:        ai.CapabilityVideo,
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

func TestRenewLeaseOnlyForOwningWorker(t *testing.T) {
	db := openJobRunnerTestDB(t)
	now := time.Now()
	oldLease := now.Add(-time.Minute)
	job := model.Job{
		UserID:         1,
		RuntimeModelID: 1,
		JobType:        ai.CapabilityImage,
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
		JobType:        ai.CapabilityImage,
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
		capability string
		want       string
		withAudio  bool
	}{
		{capability: ai.CapabilityAudioSTT, want: "transcribed", withAudio: true},
		{capability: ai.CapabilityAudioTranslate, want: "[local audio translation:zh-CN]\ntranslated audio\n", withAudio: true},
		{capability: ai.CapabilitySubAlign, want: "hello world", withAudio: true},
		{capability: ai.CapabilitySubTranslate, want: "[local subtitle translation:zh-CN]\nhello world\n", withAudio: false},
	}
	for index, tc := range cases {
		entry := model.AIModelCatalogEntry{
			Model:         gorm.Model{ID: uint(100 + index)},
			PublicModelID: "local-" + tc.capability,
			DisplayName:   "Local " + tc.capability,
			IsEnabled:     true,
			Capabilities:  tc.capability,
		}
		if err := db.Create(&entry).Error; err != nil {
			t.Fatalf("create catalog entry %s: %v", tc.capability, err)
		}
		binding := model.AIModelRouteBinding{
			CatalogEntryID: entry.ID,
			SourceType:     model.ModelRouteSourceLocalProvider,
			CredentialID:   &cred.ID,
			IsEnabled:      true,
			CapacityWeight: 1,
		}
		if err := db.Create(&binding).Error; err != nil {
			t.Fatalf("create route binding %s: %v", tc.capability, err)
		}
		job := model.Job{
			UserID:                42,
			RuntimeModelID:        entry.ID,
			AIModelCatalogEntryID: &entry.ID,
			RouteBindingID:        &binding.ID,
			JobType:               tc.capability,
			Status:                StatusRunning,
			MaxAttempts:           1,
			Title:                 "subtitle " + tc.capability,
			Prompt:                "hello world",
			ExtraParams:           `{"target_language":"zh-CN","language":"en-US","script":"hello world"}`,
		}
		if tc.withAudio {
			job.InputResourceID = &audioResourceID
		}
		if err := db.Create(&job).Error; err != nil {
			t.Fatalf("create job %s: %v", tc.capability, err)
		}
		if err := worker.execute(context.Background(), &job); err != nil {
			t.Fatalf("execute %s: %v", tc.capability, err)
		}

		var reloaded model.Job
		if err := db.First(&reloaded, job.ID).Error; err != nil {
			t.Fatalf("reload job %s: %v", tc.capability, err)
		}
		if reloaded.Status != StatusSucceeded {
			t.Fatalf("%s status = %q, want %q", tc.capability, reloaded.Status, StatusSucceeded)
		}
		if reloaded.OutputResourceID == nil {
			t.Fatalf("%s did not store an output resource id", tc.capability)
		}
		var output model.RawResource
		if err := db.First(&output, *reloaded.OutputResourceID).Error; err != nil {
			t.Fatalf("load output resource for %s: %v", tc.capability, err)
		}
		if output.Type != "text" || output.MimeType != "text/plain" {
			t.Fatalf("%s output resource type/mime = %q/%q", tc.capability, output.Type, output.MimeType)
		}
		data, _, _, err := worker.readResourceBytes(output)
		if err != nil {
			t.Fatalf("read output resource for %s: %v", tc.capability, err)
		}
		if string(data) != tc.want {
			t.Fatalf("%s output = %q, want %q", tc.capability, string(data), tc.want)
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
		capability string
		withAudio  bool
		wantPrefix string
	}{
		{capability: ai.CapabilityVoiceClone, withAudio: true, wantPrefix: "local_clone_"},
		{capability: ai.CapabilityVoiceDesign, withAudio: false, wantPrefix: "local_design_"},
	} {
		entry := model.AIModelCatalogEntry{
			Model:         gorm.Model{ID: uint(300 + index)},
			PublicModelID: "local-" + tc.capability,
			DisplayName:   "Local " + tc.capability,
			IsEnabled:     true,
			Capabilities:  tc.capability,
		}
		if err := db.Create(&entry).Error; err != nil {
			t.Fatalf("create catalog entry %s: %v", tc.capability, err)
		}
		binding := model.AIModelRouteBinding{
			CatalogEntryID: entry.ID,
			SourceType:     model.ModelRouteSourceLocalProvider,
			CredentialID:   &cred.ID,
			IsEnabled:      true,
			CapacityWeight: 1,
		}
		if err := db.Create(&binding).Error; err != nil {
			t.Fatalf("create route binding %s: %v", tc.capability, err)
		}
		job := model.Job{
			UserID:                42,
			RuntimeModelID:        entry.ID,
			AIModelCatalogEntryID: &entry.ID,
			RouteBindingID:        &binding.ID,
			JobType:               tc.capability,
			Status:                StatusRunning,
			MaxAttempts:           1,
			Title:                 "voice " + tc.capability,
			Prompt:                "warm narrator voice",
			ExtraParams:           `{"name":"Narrator","description":"warm narrator voice"}`,
		}
		if tc.withAudio {
			job.InputResourceID = &audioResourceID
		}
		if err := db.Create(&job).Error; err != nil {
			t.Fatalf("create job %s: %v", tc.capability, err)
		}
		if err := worker.execute(context.Background(), &job); err != nil {
			t.Fatalf("execute %s: %v", tc.capability, err)
		}

		var reloaded model.Job
		if err := db.First(&reloaded, job.ID).Error; err != nil {
			t.Fatalf("reload job %s: %v", tc.capability, err)
		}
		if reloaded.Status != StatusSucceeded || reloaded.OutputResourceID == nil {
			t.Fatalf("%s status=%q output=%v", tc.capability, reloaded.Status, reloaded.OutputResourceID)
		}
		var output model.RawResource
		if err := db.First(&output, *reloaded.OutputResourceID).Error; err != nil {
			t.Fatalf("load output resource for %s: %v", tc.capability, err)
		}
		if output.Type != "text" || output.MimeType != "application/json" {
			t.Fatalf("%s output resource type/mime = %q/%q", tc.capability, output.Type, output.MimeType)
		}
		data, _, _, err := worker.readResourceBytes(output)
		if err != nil {
			t.Fatalf("read output resource for %s: %v", tc.capability, err)
		}
		var payload struct {
			VoiceID string `json:"voice_id"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("decode output for %s: %v\n%s", tc.capability, err, string(data))
		}
		if !strings.HasPrefix(payload.VoiceID, tc.wantPrefix) {
			t.Fatalf("%s voice_id = %q, want prefix %q", tc.capability, payload.VoiceID, tc.wantPrefix)
		}
	}
}

func TestWorkerExecutesAudioChatJobAsAudioResource(t *testing.T) {
	db := testutil.OpenSQLite(t, "runner_audio_chat_job.db",
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
		DisplayName: "Local audio chat runner",
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
		Model:         gorm.Model{ID: 400},
		PublicModelID: "local-audio-chat",
		DisplayName:   "Local Audio Chat",
		IsEnabled:     true,
		Capabilities:  ai.CapabilityAudioChat,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := model.AIModelRouteBinding{
		CatalogEntryID: entry.ID,
		SourceType:     model.ModelRouteSourceLocalProvider,
		CredentialID:   &cred.ID,
		IsEnabled:      true,
		CapacityWeight: 1,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	job := model.Job{
		UserID:                42,
		RuntimeModelID:        entry.ID,
		AIModelCatalogEntryID: &entry.ID,
		RouteBindingID:        &binding.ID,
		JobType:               ai.CapabilityAudioChat,
		Status:                StatusRunning,
		MaxAttempts:           1,
		Title:                 "audio chat",
		Prompt:                "answer in a calm voice",
		ExtraParams:           `{"language":"zh-CN","voice":"alloy"}`,
		InputResourceID:       &audioResourceID,
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("create job: %v", err)
	}
	if err := worker.execute(context.Background(), &job); err != nil {
		t.Fatalf("execute audio_chat: %v", err)
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
		t.Fatal("audio_chat output resource is empty")
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

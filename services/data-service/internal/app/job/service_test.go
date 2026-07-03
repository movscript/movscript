package job

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
)

// 真人认证当前留空：所有模型都不触发，等后续按白名单具体填入。
func TestRequireImageVerificationDisabled(t *testing.T) {
	service := &Service{}
	resources := []domainjob.InputResource{{Type: "image"}}

	cases := []string{
		"kling:v1-5-standard-i2v",
		"volcengine:seedance-2-0",
		"doubao-seedance-1-5-pro-251215",
	}
	for _, id := range cases {
		if err := service.requireImageVerification(&ai.ModelDef{ID: id}, resources); err != nil {
			t.Fatalf("%s should not require verification while gate is empty: %v", id, err)
		}
	}
}

func TestEnqueueGenerationAcceptsAudioGenerationOperation(t *testing.T) {
	db := testutil.OpenSQLite(t, "job_enqueue_audio_generation_operation.db",
		&persistencemodel.Job{},
		&persistencemodel.RawResource{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: ai.AdapterLocal,
		DisplayName: "Local P3 audio",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))

	capabilitiesJSON := `{"audio_generation":{"operations":["text_to_speech"]}}`
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "local-audio-family",
		DisplayName:           "Local Audio Generation",
		Capabilities:          ai.CapabilityFamilyAudioGeneration,
		IsEnabled:             true,
		ModelCapabilitiesJSON: capabilitiesJSON,
		SupportedParams:       testOperationSupportedParamsProfile(ai.AudioOperationTextToSpeech),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		AdapterType:     cred.AdapterType,
		ProviderModelID: "provider-audio-family",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		CapacityWeight:  1}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}

	job, err := service.EnqueueGeneration(context.Background(), EnqueueInput{
		UserID:     42,
		ModelID:    entry.PublicModelID,
		JobType:    domainjob.JobTypeAudio,
		FeatureKey: "test.audio",
		Title:      "Audio generation",
		Prompt:     "generate resource",
		GenerationIntent: &GenerationIntentInput{
			Capability: ai.CapabilityFamilyAudioGeneration,
			Operation:  ai.AudioOperationTextToSpeech,
		},
	})
	if err != nil {
		t.Fatalf("EnqueueGeneration(audio_generation) error = %v", err)
	}
	if job.JobType != domainjob.JobTypeAudio {
		t.Fatalf("job type = %q, want %q", job.JobType, domainjob.JobTypeAudio)
	}
	if job.UsageReservationID == nil {
		t.Fatal("job did not store a usage reservation id")
	}
	var snapshot struct {
		JobType    string `json:"job_type"`
		FeatureKey string `json:"feature_key"`
		Model      struct {
			ConfigID uint `json:"config_id"`
		} `json:"model"`
	}
	if err := json.Unmarshal([]byte(job.RequestContext), &snapshot); err != nil {
		t.Fatalf("decode request context: %v", err)
	}
	if snapshot.JobType != domainjob.JobTypeAudio || snapshot.FeatureKey != "test.audio" {
		t.Fatalf("request context = %#v", snapshot)
	}
	if snapshot.Model.ConfigID != entry.ID {
		t.Fatalf("request context model = %#v", snapshot.Model)
	}
}

func TestEnqueueGenerationTTSCatalogRouteWithoutLegacyModelConfig(t *testing.T) {
	db := testutil.OpenSQLite(t, "job_enqueue_tts_catalog_only.db",
		&persistencemodel.Job{},
		&persistencemodel.RawResource{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	if db.Migrator().HasTable("ai_model_configs") || db.Migrator().HasTable(&persistencemodel.AICredential{}) {
		t.Fatal("catalog-only TTS enqueue test should not create legacy provider tables")
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "voice-main",
		DisplayName:           "Voice Main",
		IsEnabled:             true,
		Capabilities:          ai.CapabilityFamilyAudioGeneration,
		ModelCapabilitiesJSON: `{"audio_generation":{"operations":["text_to_speech"]}}`,
		SupportedParams:       testOperationSupportedParamsProfile(ai.AudioOperationTextToSpeech),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:      "default",
		AdapterType:     ai.AdapterOpenAICompat,
		ProviderModelID: "provider-voice-v2",
		IsEnabled:       true,
		CapacityWeight:  1,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))

	job, err := service.EnqueueGeneration(context.Background(), EnqueueInput{
		UserID:  42,
		ModelID: "voice-main",
		JobType: domainjob.JobTypeAudio,
		Title:   "Narration",
		Prompt:  "hello",
		GenerationIntent: &GenerationIntentInput{
			Capability: ai.CapabilityFamilyAudioGeneration,
			Operation:  ai.AudioOperationTextToSpeech,
		},
	})
	if err != nil {
		t.Fatalf("EnqueueGeneration(TTS catalog route) error = %v", err)
	}
	if job.RuntimeModelID != entry.ID {
		t.Fatalf("job model config compatibility id = %d, want catalog entry id %d", job.RuntimeModelID, entry.ID)
	}
	if job.AIModelCatalogEntryID == nil || *job.AIModelCatalogEntryID != entry.ID {
		t.Fatalf("job catalog entry id = %v, want %d", job.AIModelCatalogEntryID, entry.ID)
	}
	if job.RouteBindingID == nil || *job.RouteBindingID != binding.ID {
		t.Fatalf("job route binding id = %v, want %d", job.RouteBindingID, binding.ID)
	}
	if job.UsageReservationID == nil {
		t.Fatal("job did not store usage reservation id")
	}
	var reservation persistencemodel.UsageReservation
	if err := db.First(&reservation, *job.UsageReservationID).Error; err != nil {
		t.Fatalf("load usage reservation: %v", err)
	}
	if reservation.AIModelCatalogEntryID == nil || *reservation.AIModelCatalogEntryID != entry.ID {
		t.Fatalf("reservation catalog entry id = %v, want %d", reservation.AIModelCatalogEntryID, entry.ID)
	}
	if reservation.RouteBindingID == nil || *reservation.RouteBindingID != binding.ID {
		t.Fatalf("reservation route binding id = %v, want %d", reservation.RouteBindingID, binding.ID)
	}
	if reservation.EstimatedCost != 0 {
		t.Fatalf("reservation estimated cost = %v, want no model pricing", reservation.EstimatedCost)
	}
	if !strings.Contains(job.RequestContext, "provider-voice-v2") || !strings.Contains(job.RequestContext, persistencemodel.ModelRouteSourceRelayGateway) {
		t.Fatalf("request context = %s, want provider model and route source", job.RequestContext)
	}
}

func TestPreflightGenerationValidatesRouteWithoutCreatingJobOrReservation(t *testing.T) {
	db := testutil.OpenSQLite(t, "job_preflight_tts_catalog_only.db",
		&persistencemodel.Job{},
		&persistencemodel.RawResource{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "voice-preflight",
		DisplayName:           "Voice Preflight",
		IsEnabled:             true,
		Capabilities:          ai.CapabilityFamilyAudioGeneration,
		ModelCapabilitiesJSON: `{"audio_generation":{"operations":["text_to_speech"]}}`,
		SupportedParams:       testOperationSupportedParamsProfile(ai.AudioOperationTextToSpeech),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:      "default",
		AdapterType:     ai.AdapterOpenAICompat,
		ProviderModelID: "provider-voice-preflight",
		IsEnabled:       true,
		CapacityWeight:  1,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))

	result, err := service.PreflightGeneration(context.Background(), EnqueueInput{
		UserID:  42,
		ModelID: "voice-preflight",
		JobType: domainjob.JobTypeAudio,
		Title:   "Narration preflight",
		Prompt:  "hello",
		GenerationIntent: &GenerationIntentInput{
			Capability: ai.CapabilityFamilyAudioGeneration,
			Operation:  ai.AudioOperationTextToSpeech,
		},
	})
	if err != nil {
		t.Fatalf("PreflightGeneration(TTS catalog route) error = %v", err)
	}
	if !result.Ready || result.JobType != domainjob.JobTypeAudio || result.CatalogEntryID != entry.ID || result.RouteBindingID != binding.ID {
		t.Fatalf("preflight result = %#v, want ready route metadata", result)
	}
	var jobCount int64
	if err := db.Model(&persistencemodel.Job{}).Count(&jobCount).Error; err != nil {
		t.Fatalf("count jobs: %v", err)
	}
	if jobCount != 0 {
		t.Fatalf("preflight created %d jobs, want 0", jobCount)
	}
	var reservationCount int64
	if err := db.Model(&persistencemodel.UsageReservation{}).Count(&reservationCount).Error; err != nil {
		t.Fatalf("count reservations: %v", err)
	}
	if reservationCount != 0 {
		t.Fatalf("preflight created %d reservations, want 0", reservationCount)
	}
}

func TestEnqueueGenerationRejectsVisualJobWithoutIntent(t *testing.T) {
	db := testutil.OpenSQLite(t, "job_enqueue_video_requires_intent.db",
		&persistencemodel.Job{},
		&persistencemodel.RawResource{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: ai.AdapterOpenAICompat,
		DisplayName: "Relay",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:   "grok-imagine-video-1.5",
		DisplayName:     "Grok Imagine Video 1.5",
		IsEnabled:       true,
		Capabilities:    ai.CapabilityFamilyVideoGeneration,
		AcceptsImage:    true,
		MaxInputImages:  1,
		SupportedParams: `[{"key":"duration","type":"select","options":["5"],"default":"5"}]`,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceRelayGateway,
		ProviderModelID: "grok-imagine-video-1.5",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		CapacityWeight:  1,
	}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	image := persistencemodel.RawResource{
		OwnerID:        42,
		Type:           "image",
		Name:           "reference.png",
		FilePath:       "/tmp/reference.png",
		Size:           123,
		MimeType:       "image/png",
		StorageBackend: "local",
	}
	if err := db.Create(&image).Error; err != nil {
		t.Fatalf("create image resource: %v", err)
	}

	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))
	_, err := service.EnqueueGeneration(context.Background(), EnqueueInput{
		UserID:           42,
		ModelID:          entry.PublicModelID,
		JobType:          domainjob.JobTypeVideo,
		Title:            "Reference video",
		Prompt:           "make it move",
		Duration:         5,
		InputResourceIDs: []uint{image.ID},
	})
	var validationErr *ai.ValidationError
	if !errors.As(err, &validationErr) || validationErr.Code != "missing_operation_intent" {
		t.Fatalf("EnqueueGeneration(video without intent) error = %v, want missing operation intent", err)
	}
}

func TestEnqueueGenerationIntentRoutesByOperationWithoutInputAwarePromotion(t *testing.T) {
	db := testutil.OpenSQLite(t, "job_enqueue_generation_intent_route.db",
		&persistencemodel.Job{},
		&persistencemodel.RawResource{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: ai.AdapterVolcen,
		DisplayName: "Local structured video",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "story-video",
		DisplayName:           "Story Video",
		Capabilities:          ai.CapabilityFamilyVideoGeneration,
		AcceptsImage:          true,
		MaxInputImages:        2,
		IsEnabled:             true,
		ModelCapabilitiesJSON: `{"video_generation":{"operations":["image_to_video","first_last_frame_to_video"],"reference_assets":{"min":1,"max":2,"modalities":["image"],"roles":["generic","first_frame","last_frame"]}}}`,
		SupportedParams:       testOperationSupportedParamsProfile(ai.VideoOperationImageToVideo, ai.VideoOperationFirstLastFrameToVideo),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	imageOnlyRoute := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      "local_provider",
		AdapterType:     cred.AdapterType,
		ProviderModelID: "provider-image-video",
		CredentialID:    &cred.ID,
		IsEnabled:       false,
		Priority:        20,
		CapacityWeight:  1,
	}
	firstLastRoute := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      "local_provider",
		AdapterType:     cred.AdapterType,
		ProviderModelID: "provider-first-last-video",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		Priority:        10,
		CapacityWeight:  1,
	}
	if err := db.Create(&imageOnlyRoute).Error; err != nil {
		t.Fatalf("create image-only route: %v", err)
	}
	if err := db.Model(&imageOnlyRoute).Update("is_enabled", false).Error; err != nil {
		t.Fatalf("disable image-only route: %v", err)
	}
	if err := db.Create(&firstLastRoute).Error; err != nil {
		t.Fatalf("create first-last route: %v", err)
	}
	firstFrame := persistencemodel.RawResource{OwnerID: 42, Type: "image", Name: "first.png", FilePath: "/tmp/first.png", Size: 1, MimeType: "image/png", StorageBackend: "local"}
	lastFrame := persistencemodel.RawResource{OwnerID: 42, Type: "image", Name: "last.png", FilePath: "/tmp/last.png", Size: 1, MimeType: "image/png", StorageBackend: "local"}
	if err := db.Create(&firstFrame).Error; err != nil {
		t.Fatalf("create first frame: %v", err)
	}
	if err := db.Create(&lastFrame).Error; err != nil {
		t.Fatalf("create last frame: %v", err)
	}

	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))
	job, err := service.EnqueueGeneration(context.Background(), EnqueueInput{
		UserID:           42,
		ModelID:          entry.PublicModelID,
		JobType:          domainjob.JobTypeVideo,
		Title:            "First-last video",
		Prompt:           "animate between frames",
		Duration:         5,
		InputResourceIDs: []uint{firstFrame.ID, lastFrame.ID},
		GenerationIntent: &GenerationIntentInput{
			Capability: ai.CapabilityFamilyVideoGeneration,
			Operation:  ai.VideoOperationFirstLastFrameToVideo,
			ReferenceAssets: []GenerationReferenceAssetInput{
				{
					ReferenceID: "ref_first_frame",
					SourceKind:  "asset",
					SourceID:    "wet_hair",
					SourceRef:   "{{ref:ref_first_frame}}",
					Role:        "first_frame",
					MediaType:   "image",
					ResourceID:  firstFrame.ID,
				},
				{Role: "last_frame", MediaType: "image", ResourceID: lastFrame.ID},
			},
		},
	})
	if err != nil {
		t.Fatalf("EnqueueGeneration(intent) error = %v", err)
	}
	if job.JobType != domainjob.JobTypeVideo {
		t.Fatalf("job type = %q, want execution job type video without input-aware promotion", job.JobType)
	}
	if job.RouteBindingID == nil || *job.RouteBindingID != firstLastRoute.ID {
		t.Fatalf("route binding id = %v, want first-last route %d", job.RouteBindingID, firstLastRoute.ID)
	}
	if !strings.Contains(job.RequestContext, `"operation":"first_last_frame_to_video"`) || !strings.Contains(job.RequestContext, `"role":"last_frame"`) {
		t.Fatalf("request context = %s, want generation intent with roles", job.RequestContext)
	}
	var snapshot struct {
		Intent struct {
			ReferenceAssets []struct {
				ReferenceID string `json:"reference_id"`
				SourceKind  string `json:"source_kind"`
				SourceID    string `json:"source_id"`
				SourceRef   string `json:"source_ref"`
				Role        string `json:"role"`
				MediaType   string `json:"media_type"`
				ResourceID  uint   `json:"resource_id"`
			} `json:"reference_assets"`
		} `json:"intent"`
	}
	if err := json.Unmarshal([]byte(job.RequestContext), &snapshot); err != nil {
		t.Fatalf("unmarshal request context: %v", err)
	}
	if len(snapshot.Intent.ReferenceAssets) != 2 {
		t.Fatalf("reference assets = %v, want two assets", snapshot.Intent.ReferenceAssets)
	}
	first := snapshot.Intent.ReferenceAssets[0]
	if first.ReferenceID != "ref_first_frame" || first.SourceKind != "asset" || first.SourceID != "wet_hair" || first.SourceRef != "{{ref:ref_first_frame}}" {
		t.Fatalf("first reference asset = %+v, want reference pool metadata", first)
	}
}

func TestEnqueueAudioGenerationIntentRoutesByCanonicalOperation(t *testing.T) {
	db := testutil.OpenSQLite(t, "job_enqueue_audio_generation_intent_route.db",
		&persistencemodel.Job{},
		&persistencemodel.RawResource{},
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		AdapterType: ai.AdapterLocal,
		DisplayName: "Local structured audio",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "story-audio",
		DisplayName:           "Story Audio",
		Capabilities:          ai.CapabilityFamilyAudioGeneration,
		IsEnabled:             true,
		ModelCapabilitiesJSON: `{"audio_generation":{"operations":["text_to_speech","music_generation"]}}`,
		SupportedParams:       testOperationSupportedParamsProfile(ai.AudioOperationTextToSpeech, ai.AudioOperationMusicGeneration),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	ttsRoute := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      "local_provider",
		AdapterType:     cred.AdapterType,
		ProviderModelID: "provider-tts",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		Priority:        20,
		CapacityWeight:  1,
	}
	musicRoute := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:      "local_provider",
		AdapterType:     cred.AdapterType,
		ProviderModelID: "provider-music",
		CredentialID:    &cred.ID,
		IsEnabled:       true,
		Priority:        10,
		CapacityWeight:  1,
	}
	if err := db.Create(&ttsRoute).Error; err != nil {
		t.Fatalf("create tts route: %v", err)
	}
	if err := db.Create(&musicRoute).Error; err != nil {
		t.Fatalf("create music route: %v", err)
	}

	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))
	job, err := service.EnqueueGeneration(context.Background(), EnqueueInput{
		UserID:  42,
		ModelID: entry.PublicModelID,
		Title:   "Music",
		Prompt:  "generate music",
		GenerationIntent: &GenerationIntentInput{
			Capability: ai.CapabilityFamilyAudioGeneration,
			Operation:  ai.AudioOperationMusicGeneration,
		},
	})
	if err != nil {
		t.Fatalf("EnqueueGeneration(audio intent) error = %v", err)
	}
	if job.JobType != domainjob.JobTypeAudio {
		t.Fatalf("job type = %q, want %q", job.JobType, domainjob.JobTypeAudio)
	}
	if job.RouteBindingID == nil || *job.RouteBindingID != ttsRoute.ID {
		t.Fatalf("route binding id = %v, want highest-priority compatible route %d", job.RouteBindingID, ttsRoute.ID)
	}
	if !strings.Contains(job.RequestContext, `"capability":"audio_generation"`) || !strings.Contains(job.RequestContext, `"operation":"music_generation"`) {
		t.Fatalf("request context = %s, want audio generation intent with music_generation operation", job.RequestContext)
	}
}

func TestAudioGenerationIntentRequiresExplicitOperation(t *testing.T) {
	db := testutil.OpenSQLite(t, "job_enqueue_audio_generation_missing_operation.db",
		&persistencemodel.Job{},
		&persistencemodel.RawResource{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
	)
	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))
	_, err := service.EnqueueGeneration(context.Background(), EnqueueInput{
		UserID: 42,
		Title:  "Audio",
		Prompt: "generate audio",
		GenerationIntent: &GenerationIntentInput{
			Capability: ai.CapabilityFamilyAudioGeneration,
		},
	})
	var validationErr *ai.ValidationError
	if !errors.As(err, &validationErr) || validationErr.Code != "missing_operation_intent" {
		t.Fatalf("EnqueueGeneration(audio intent without operation) error = %v, want missing operation intent", err)
	}
}

func TestAudioGenerationExecutionJobTypeRequiresIntent(t *testing.T) {
	db := testutil.OpenSQLite(t, "job_enqueue_audio_generation_without_intent.db",
		&persistencemodel.Job{},
		&persistencemodel.RawResource{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
	)
	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))
	_, err := service.EnqueueGeneration(context.Background(), EnqueueInput{
		UserID:  42,
		JobType: domainjob.JobTypeAudio,
		Title:   "Music",
		Prompt:  "generate music",
	})
	var validationErr *ai.ValidationError
	if !errors.As(err, &validationErr) || validationErr.Code != "missing_operation_intent" {
		t.Fatalf("EnqueueGeneration(audio job type without intent) error = %v, want missing operation intent", err)
	}
}

func TestValidateGenerationIntentRequiresStructuredResourceAssets(t *testing.T) {
	base := EnqueueInput{
		JobType: domainjob.JobTypeVideo,
		GenerationIntent: &GenerationIntentInput{
			Capability: ai.CapabilityFamilyVideoGeneration,
			Operation:  ai.VideoOperationFirstLastFrameToVideo,
			ReferenceAssets: []GenerationReferenceAssetInput{
				{Role: "first_frame", MediaType: "image", ResourceID: 101},
				{Role: "last_frame", MediaType: "image", ResourceID: 102},
			},
		},
	}
	inputResourceIDs := []uint{101, 102}
	inputResources := []domainjob.InputResource{
		{ID: 101, Type: "image"},
		{ID: 102, Type: "image"},
	}
	if err := validateGenerationIntentContract(base, inputResourceIDs, inputResources); err != nil {
		t.Fatalf("validateGenerationIntentContract(complete assets) error = %v", err)
	}

	cases := []struct {
		name string
		edit func(*EnqueueInput)
		code string
	}{
		{
			name: "missing resource id",
			edit: func(input *EnqueueInput) {
				input.GenerationIntent.ReferenceAssets[0].ResourceID = 0
			},
			code: "missing_input_resource_id",
		},
		{
			name: "missing media type",
			edit: func(input *EnqueueInput) {
				input.GenerationIntent.ReferenceAssets[0].MediaType = ""
			},
			code: "missing_input_media_type",
		},
		{
			name: "missing role",
			edit: func(input *EnqueueInput) {
				input.GenerationIntent.ReferenceAssets[0].Role = ""
			},
			code: "missing_input_role",
		},
		{
			name: "unknown resource id",
			edit: func(input *EnqueueInput) {
				input.GenerationIntent.ReferenceAssets[0].ResourceID = 999
			},
			code: "unknown_input_resource_id",
		},
		{
			name: "duplicate resource id",
			edit: func(input *EnqueueInput) {
				input.GenerationIntent.ReferenceAssets[1].ResourceID = 101
			},
			code: "duplicate_input_resource_id",
		},
		{
			name: "media type mismatch",
			edit: func(input *EnqueueInput) {
				input.GenerationIntent.ReferenceAssets[0].MediaType = "video"
			},
			code: "input_media_type_mismatch",
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			input := base
			refs := append([]GenerationReferenceAssetInput(nil), base.GenerationIntent.ReferenceAssets...)
			intent := *base.GenerationIntent
			intent.ReferenceAssets = refs
			input.GenerationIntent = &intent
			tt.edit(&input)
			err := validateGenerationIntentContract(input, inputResourceIDs, inputResources)
			var validationErr *ai.ValidationError
			if !errors.As(err, &validationErr) || validationErr.Code != tt.code {
				t.Fatalf("validateGenerationIntentContract() error = %v, want %s", err, tt.code)
			}
		})
	}
}

func TestExecutionJobTypeForAudioGenerationIntent(t *testing.T) {
	tests := []struct {
		operation string
		want      string
	}{
		{operation: ai.AudioOperationTextToSpeech, want: domainjob.JobTypeAudio},
		{operation: ai.AudioOperationMusicGeneration, want: domainjob.JobTypeAudio},
		{operation: ai.AudioOperationSoundEffectGeneration, want: domainjob.JobTypeAudio},
		{operation: ai.AudioOperationSpeechToText, want: domainjob.JobTypeAudio},
		{operation: ai.AudioOperationSpeechTranslate, want: domainjob.JobTypeAudio},
		{operation: ai.AudioOperationSpeechToSpeech, want: domainjob.JobTypeAudio},
		{operation: ai.AudioOperationVoiceClone, want: domainjob.JobTypeAudio},
		{operation: ai.AudioOperationVoiceDesign, want: domainjob.JobTypeAudio},
	}
	for _, tt := range tests {
		got := executionJobTypeForGenerationIntent(&GenerationIntentInput{
			Capability: ai.CapabilityFamilyAudioGeneration,
			Operation:  tt.operation,
		})
		if got != tt.want {
			t.Fatalf("executionJobTypeForGenerationIntent(audio_generation, %s) = %q, want %q", tt.operation, got, tt.want)
		}
	}
}

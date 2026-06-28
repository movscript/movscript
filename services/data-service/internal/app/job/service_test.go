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

func TestEnqueueGenerationAcceptsOrthogonalAudioAndSubtitleJobTypes(t *testing.T) {
	db := testutil.OpenSQLite(t, "job_enqueue_p3_audio_subtitle.db",
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

	for _, capability := range []string{
		ai.CapabilityAudioMusic,
		ai.CapabilityAudioSFX,
		ai.CapabilityAudioSTT,
		ai.CapabilityAudioTranslate,
		ai.CapabilityAudioChat,
		ai.CapabilityVoiceClone,
		ai.CapabilityVoiceDesign,
		ai.CapabilitySubAlign,
		ai.CapabilitySubTranslate,
	} {
		intentCapability, intentOperation, capabilitiesJSON := generationIntentContractForExecutionCapability(capability)
		entry := persistencemodel.AIModelCatalogEntry{
			PublicModelID:         "local-" + capability,
			DisplayName:           "Local " + capability,
			Capabilities:          capability,
			IsEnabled:             true,
			ModelCapabilitiesJSON: capabilitiesJSON,
		}
		if err := db.Create(&entry).Error; err != nil {
			t.Fatalf("create catalog entry %s: %v", capability, err)
		}
		if err := db.Create(&persistencemodel.AIModelRouteBinding{
			CatalogEntryID:        entry.ID,
			SourceType:            persistencemodel.ModelRouteSourceLocalProvider,
			ProviderModelID:       "provider-" + capability,
			CredentialID:          &cred.ID,
			IsEnabled:             true,
			CapacityWeight:        1,
			RouteCapabilitiesJSON: capabilitiesJSON,
		}).Error; err != nil {
			t.Fatalf("create route binding %s: %v", capability, err)
		}

		input := EnqueueInput{
			UserID:     42,
			ModelID:    entry.PublicModelID,
			JobType:    capability,
			FeatureKey: "test." + capability,
			Title:      "P3 " + capability,
			Prompt:     "generate resource",
			GenerationIntent: &GenerationIntentInput{
				Capability: intentCapability,
				Operation:  intentOperation,
			},
		}
		if capability == ai.CapabilityAudioMusic || capability == ai.CapabilityAudioSFX {
			input.Duration = 2
		}
		job, err := service.EnqueueGeneration(context.Background(), input)
		if err != nil {
			t.Fatalf("EnqueueGeneration(%s) error = %v", capability, err)
		}
		if job.JobType != capability {
			t.Fatalf("job type = %q, want %q", job.JobType, capability)
		}
		if job.UsageReservationID == nil {
			t.Fatalf("job %s did not store a usage reservation id", capability)
		}
		var snapshot struct {
			JobType    string `json:"job_type"`
			FeatureKey string `json:"feature_key"`
			Model      struct {
				ConfigID uint `json:"config_id"`
			} `json:"model"`
		}
		if err := json.Unmarshal([]byte(job.RequestContext), &snapshot); err != nil {
			t.Fatalf("decode request context for %s: %v", capability, err)
		}
		if snapshot.JobType != capability || snapshot.FeatureKey != "test."+capability {
			t.Fatalf("request context for %s = %#v", capability, snapshot)
		}
		if snapshot.Model.ConfigID != entry.ID {
			t.Fatalf("request context model for %s = %#v", capability, snapshot.Model)
		}
	}
}

func generationIntentContractForExecutionCapability(capability string) (string, string, string) {
	switch capability {
	case ai.CapabilityAudioTTS:
		return ai.CapabilityFamilyAudioGeneration, ai.AudioOperationTTS, `{"audio_generation":{"operations":["tts"]}}`
	case ai.CapabilityAudioMusic:
		return ai.CapabilityFamilyAudioGeneration, ai.AudioOperationMusic, `{"audio_generation":{"operations":["music"]}}`
	case ai.CapabilityAudioSFX:
		return ai.CapabilityFamilyAudioGeneration, ai.AudioOperationSFX, `{"audio_generation":{"operations":["sfx"]}}`
	case ai.CapabilityAudioSTT:
		return ai.CapabilityFamilyAudioGeneration, ai.AudioOperationSTT, `{"audio_generation":{"operations":["stt"]}}`
	case ai.CapabilityAudioTranslate:
		return ai.CapabilityFamilyAudioGeneration, ai.AudioOperationSpeechTranslate, `{"audio_generation":{"operations":["speech_translate"]}}`
	case ai.CapabilityAudioChat:
		return ai.CapabilityFamilyAudioGeneration, ai.AudioOperationAudioChat, `{"audio_generation":{"operations":["audio_chat"]}}`
	case ai.CapabilityVoiceClone:
		return ai.CapabilityFamilyAudioGeneration, ai.AudioOperationVoiceClone, `{"audio_generation":{"operations":["voice_clone"]}}`
	case ai.CapabilityVoiceDesign:
		return ai.CapabilityFamilyAudioGeneration, ai.AudioOperationVoiceDesign, `{"audio_generation":{"operations":["voice_design"]}}`
	case ai.CapabilitySubAlign:
		return ai.CapabilitySubAlign, ai.CapabilitySubAlign, `{"subtitle_align":{"operations":["subtitle_align"]}}`
	case ai.CapabilitySubTranslate:
		return ai.CapabilitySubTranslate, ai.CapabilitySubTranslate, `{"subtitle_translate":{"operations":["subtitle_translate"]}}`
	default:
		return capability, capability, `{}`
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
		Capabilities:          ai.CapabilityAudioTTS,
		ModelCapabilitiesJSON: `{"audio_generation":{"operations":["tts"]}}`,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:        entry.ID,
		SourceType:            persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:            "default",
		ProviderModelID:       "provider-voice-v2",
		IsEnabled:             true,
		CapacityWeight:        1,
		RouteCapabilitiesJSON: `{"audio_generation":{"operations":["tts"]}}`,
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))

	job, err := service.EnqueueGeneration(context.Background(), EnqueueInput{
		UserID:  42,
		ModelID: "voice-main",
		JobType: ai.CapabilityAudioTTS,
		Title:   "Narration",
		Prompt:  "hello",
		GenerationIntent: &GenerationIntentInput{
			Capability: ai.CapabilityFamilyAudioGeneration,
			Operation:  ai.AudioOperationTTS,
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
		Capabilities:    ai.CapabilityVideoI2V,
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
		JobType:          ai.CapabilityVideo,
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
		AdapterType: ai.AdapterLocal,
		DisplayName: "Local structured video",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID:         "story-video",
		DisplayName:           "Story Video",
		Capabilities:          ai.CapabilityVideo,
		AcceptsImage:          true,
		MaxInputImages:        2,
		IsEnabled:             true,
		ModelCapabilitiesJSON: `{"video_generation":{"operations":["image_to_video","first_last_frame_to_video"],"reference_assets":{"min":1,"max":2,"modalities":["image"],"roles":["generic","first_frame","last_frame"]}}}`,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	imageOnlyRoute := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:        entry.ID,
		SourceType:            persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:            "local_provider",
		ProviderModelID:       "provider-image-video",
		CredentialID:          &cred.ID,
		IsEnabled:             true,
		Priority:              20,
		CapacityWeight:        1,
		RouteCapabilitiesJSON: `{"video_generation":{"operations":["image_to_video"],"reference_assets":{"min":1,"max":1,"modalities":["image"],"roles":["generic"]}}}`,
	}
	firstLastRoute := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:        entry.ID,
		SourceType:            persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:            "local_provider",
		ProviderModelID:       "provider-first-last-video",
		CredentialID:          &cred.ID,
		IsEnabled:             true,
		Priority:              10,
		CapacityWeight:        1,
		RouteCapabilitiesJSON: `{"video_generation":{"operations":["first_last_frame_to_video"],"reference_assets":{"min":2,"max":2,"modalities":["image"],"roles":["first_frame","last_frame"]}}}`,
	}
	if err := db.Create(&imageOnlyRoute).Error; err != nil {
		t.Fatalf("create image-only route: %v", err)
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
		JobType:          ai.CapabilityVideo,
		Title:            "First-last video",
		Prompt:           "animate between frames",
		Duration:         5,
		InputResourceIDs: []uint{firstFrame.ID, lastFrame.ID},
		GenerationIntent: &GenerationIntentInput{
			Capability: ai.CapabilityFamilyVideoGeneration,
			Operation:  ai.VideoOperationFirstLastFrameToVideo,
			ReferenceAssets: []GenerationReferenceAssetInput{
				{Role: "first_frame", MediaType: "image", ResourceID: firstFrame.ID},
				{Role: "last_frame", MediaType: "image", ResourceID: lastFrame.ID},
			},
		},
	})
	if err != nil {
		t.Fatalf("EnqueueGeneration(intent) error = %v", err)
	}
	if job.JobType != ai.CapabilityVideo {
		t.Fatalf("job type = %q, want execution job type video without input-aware promotion", job.JobType)
	}
	if job.RouteBindingID == nil || *job.RouteBindingID != firstLastRoute.ID {
		t.Fatalf("route binding id = %v, want first-last route %d", job.RouteBindingID, firstLastRoute.ID)
	}
	if !strings.Contains(job.RequestContext, `"operation":"first_last_frame_to_video"`) || !strings.Contains(job.RequestContext, `"role":"last_frame"`) {
		t.Fatalf("request context = %s, want generation intent with roles", job.RequestContext)
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
		Capabilities:          ai.CapabilityAudioMusic + "," + ai.CapabilityAudioTTS,
		IsEnabled:             true,
		ModelCapabilitiesJSON: `{"audio_generation":{"operations":["tts","music"]}}`,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	ttsRoute := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:        entry.ID,
		SourceType:            persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:            "local_provider",
		ProviderModelID:       "provider-tts",
		CredentialID:          &cred.ID,
		IsEnabled:             true,
		Priority:              20,
		CapacityWeight:        1,
		RouteCapabilitiesJSON: `{"audio_generation":{"operations":["tts"]}}`,
	}
	musicRoute := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:        entry.ID,
		SourceType:            persistencemodel.ModelRouteSourceLocalProvider,
		ProviderID:            "local_provider",
		ProviderModelID:       "provider-music",
		CredentialID:          &cred.ID,
		IsEnabled:             true,
		Priority:              10,
		CapacityWeight:        1,
		RouteCapabilitiesJSON: `{"audio_generation":{"operations":["music"]}}`,
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
			Operation:  ai.AudioOperationMusic,
		},
	})
	if err != nil {
		t.Fatalf("EnqueueGeneration(audio intent) error = %v", err)
	}
	if job.JobType != ai.CapabilityAudioMusic {
		t.Fatalf("job type = %q, want %q", job.JobType, ai.CapabilityAudioMusic)
	}
	if job.RouteBindingID == nil || *job.RouteBindingID != musicRoute.ID {
		t.Fatalf("route binding id = %v, want music route %d", job.RouteBindingID, musicRoute.ID)
	}
	if !strings.Contains(job.RequestContext, `"capability":"audio_generation"`) || !strings.Contains(job.RequestContext, `"operation":"music"`) {
		t.Fatalf("request context = %s, want audio generation intent with music operation", job.RequestContext)
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
	db := testutil.OpenSQLite(t, "job_enqueue_audio_music_without_intent.db",
		&persistencemodel.Job{},
		&persistencemodel.RawResource{},
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
		&persistencemodel.UsageReservation{},
	)
	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))
	_, err := service.EnqueueGeneration(context.Background(), EnqueueInput{
		UserID:  42,
		JobType: ai.CapabilityAudioMusic,
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
		JobType: ai.CapabilityVideo,
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
	if err := validateGenerationIntentContract(base, inputResourceIDs); err != nil {
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
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			input := base
			refs := append([]GenerationReferenceAssetInput(nil), base.GenerationIntent.ReferenceAssets...)
			intent := *base.GenerationIntent
			intent.ReferenceAssets = refs
			input.GenerationIntent = &intent
			tt.edit(&input)
			err := validateGenerationIntentContract(input, inputResourceIDs)
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
		{operation: ai.AudioOperationTTS, want: ai.CapabilityAudioTTS},
		{operation: ai.AudioOperationMusic, want: ai.CapabilityAudioMusic},
		{operation: ai.AudioOperationSFX, want: ai.CapabilityAudioSFX},
		{operation: ai.AudioOperationSTT, want: ai.CapabilityAudioSTT},
		{operation: ai.AudioOperationSpeechTranslate, want: ai.CapabilityAudioTranslate},
		{operation: ai.AudioOperationAudioChat, want: ai.CapabilityAudioChat},
		{operation: ai.AudioOperationVoiceClone, want: ai.CapabilityVoiceClone},
		{operation: ai.AudioOperationVoiceDesign, want: ai.CapabilityVoiceDesign},
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

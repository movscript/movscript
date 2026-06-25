package job

import (
	"context"
	"encoding/json"
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
		entry := persistencemodel.AIModelCatalogEntry{
			PublicModelID: "local-" + capability,
			DisplayName:   "Local " + capability,
			Capabilities:  capability,
			IsEnabled:     true,
		}
		if err := db.Create(&entry).Error; err != nil {
			t.Fatalf("create catalog entry %s: %v", capability, err)
		}
		if err := db.Create(&persistencemodel.AIModelRouteBinding{
			CatalogEntryID:  entry.ID,
			SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
			ProviderModelID: "provider-" + capability,
			CredentialID:    &cred.ID,
			IsEnabled:       true,
			CapacityWeight:  1,
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
		PublicModelID: "voice-main",
		DisplayName:   "Voice Main",
		IsEnabled:     true,
		Capabilities:  ai.CapabilityAudioTTS,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	binding := persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:      "default",
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
		JobType: ai.CapabilityAudioTTS,
		Title:   "Narration",
		Prompt:  "hello",
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

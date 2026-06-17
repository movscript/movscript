package job

import (
	"context"
	"encoding/json"
	"testing"

	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
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
		&persistencemodel.AIModelConfig{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		Model:       gorm.Model{ID: 1},
		AdapterType: ai.AdapterLocal,
		DisplayName: "Local P3 audio",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)))

	for index, capability := range []string{
		ai.CapabilityAudioMusic,
		ai.CapabilityAudioSFX,
		ai.CapabilityAudioSTT,
		ai.CapabilitySubAlign,
		ai.CapabilitySubTranslate,
	} {
		cfg := persistencemodel.AIModelConfig{
			Model:              gorm.Model{ID: uint(10 + index)},
			CredentialID:       cred.ID,
			ModelDefID:         "local-" + capability,
			ModelIDOverride:    "provider-" + capability,
			CustomCapabilities: capability,
			CustomPricingMode:  string(ai.PricingPerCall),
			CreditsPerCall:     0,
			IsEnabled:          true,
		}
		if err := db.Create(&cfg).Error; err != nil {
			t.Fatalf("create model config %s: %v", capability, err)
		}

		input := EnqueueInput{
			UserID:     42,
			ModelID:    cfg.ModelDefID,
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
		if snapshot.Model.ConfigID != cfg.ID {
			t.Fatalf("request context model for %s = %#v", capability, snapshot.Model)
		}
	}
}

package handler

import (
	"testing"

	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

func TestAudioPublicModelFromCatalogDescriptorUsesPublicModelID(t *testing.T) {
	model := audioPublicModelFromDescriptor(providercontract.AIModelDescriptor{
		ModelID:         "voice-fast",
		ModelConfigID:   9,
		CatalogEntryID:  42,
		ModelDefID:      "provider-voice-fast",
		ModelIDOverride: "provider-voice-fast",
		DisplayName:     "Voice Fast",
		Capabilities:    []string{"audio_tts"},
	})

	if model.ModelID != "voice-fast" || model.ModelDefID != "voice-fast" || model.ModelIDOverride != "" {
		t.Fatalf("model = %#v, want public catalog id without provider override", model)
	}
}

package ai

import (
	"context"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/domain/media"
)

func TestLocalAdapterGenerateAudioProducesMusicWAV(t *testing.T) {
	adapter := NewLocalAdapter()
	resp, err := adapter.GenerateAudio(context.Background(), media.AudioGenerationRequest{
		Kind:        media.AudioGenerationKindMusic,
		Prompt:      "ambient synth pulse",
		Model:       "musicgen",
		DurationSec: 1,
	})
	if err != nil {
		t.Fatalf("GenerateAudio() error = %v", err)
	}
	if len(resp.Audio) == 0 || string(resp.Audio[:4]) != "RIFF" {
		t.Fatalf("audio header = %q, len=%d", string(resp.Audio[:min(len(resp.Audio), 4)]), len(resp.Audio))
	}
	if resp.MimeType != "audio/wav" || resp.DurationMs != 1000 {
		t.Fatalf("resp = %+v", resp)
	}
	if !strings.HasPrefix(resp.ProviderRef, "local:music_generation:") {
		t.Fatalf("provider ref = %q", resp.ProviderRef)
	}
}

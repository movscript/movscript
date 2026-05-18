package preview

import (
	"testing"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func TestKeyframesFromModelsExcludesGeneratedKeyframeCandidates(t *testing.T) {
	resourceID := uint(7)
	keyframes := keyframesFromModels([]persistencemodel.Keyframe{
		{
			ProjectID:    1,
			Title:        "Accepted keyframe",
			Status:       "accepted",
			ResourceID:   &resourceID,
			MetadataJSON: `{"source":"manual"}`,
		},
		{
			ProjectID:    1,
			Title:        "AI candidate",
			Status:       "candidate",
			ResourceID:   &resourceID,
			MetadataJSON: `{"source":"ai_generated_keyframe_candidate","target_keyframe_id":1}`,
		},
		{
			ProjectID:    1,
			Title:        "Legacy candidate",
			Status:       "candidate",
			ResourceID:   &resourceID,
			MetadataJSON: `{"target_keyframe_id":1}`,
		},
	})

	if len(keyframes) != 1 {
		t.Fatalf("keyframes length = %d, want 1", len(keyframes))
	}
	if keyframes[0].Title != "Accepted keyframe" {
		t.Fatalf("keyframe title = %q, want accepted keyframe", keyframes[0].Title)
	}
}

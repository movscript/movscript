package job

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
)

func TestMergeIDsDeduplicatesAndPreservesOrder(t *testing.T) {
	single := uint(3)
	got := MergeIDs([]uint{2, 1, 2}, &single)
	want := []uint{2, 1, 3}
	if len(got) != len(want) {
		t.Fatalf("ids = %#v, want %#v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("ids = %#v, want %#v", got, want)
		}
	}
}

func TestBuildListSpecExpandsImageType(t *testing.T) {
	spec := BuildListSpec(ListFilter{JobType: "image"})
	if len(spec.JobTypes) != 2 || spec.JobTypes[0] != "image" || spec.JobTypes[1] != "image_edit" {
		t.Fatalf("job types = %#v", spec.JobTypes)
	}
	spec = BuildListSpec(ListFilter{JobType: "image", ExactType: true})
	if len(spec.JobTypes) != 1 || spec.JobTypes[0] != "image" {
		t.Fatalf("exact job types = %#v", spec.JobTypes)
	}
}

func TestCountInputResources(t *testing.T) {
	result := CountInputResources([]model.RawResource{
		{Type: "image"},
		{Type: "video"},
		{Type: "file"},
		{Type: "image"},
	})
	if result.ImageCount != 2 || result.VideoCount != 1 {
		t.Fatalf("resource counts = %+v", result)
	}
}

func TestBuildContextSnapshotIncludesModelAndResources(t *testing.T) {
	raw := BuildContextSnapshot(ContextSnapshotInput{
		Model:          model.AIModelConfig{ModelDefID: "gpt-image", CredentialID: 8},
		Credential:     model.AICredential{DisplayName: "OpenAI"},
		Prompt:         "draw",
		ExtraParams:    `{"n":1}`,
		JobType:        ai.CapabilityImage,
		InputResources: []model.RawResource{{Name: "ref.png", Type: "image"}},
		CreatedAt:      time.Unix(10, 0).UTC(),
	})
	var snapshot map[string]any
	if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot["job_type"] != ai.CapabilityImage || snapshot["prompt"] != "draw" {
		t.Fatalf("unexpected snapshot: %s", raw)
	}
}

func TestCostRequestBuildsVideoRequestFromParams(t *testing.T) {
	kind, _, videoReq, err := CostRequest(1, ai.CapabilityVideo, 0, `{"duration":5,"ratio":"16:9"}`, "")
	if err != nil {
		t.Fatal(err)
	}
	if kind != "video" || videoReq.Duration != 5 || videoReq.AspectRatio != "16:9" {
		t.Fatalf("unexpected video cost request: kind=%s req=%+v", kind, videoReq)
	}
}

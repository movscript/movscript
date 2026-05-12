package job

import (
	"encoding/json"
	"testing"
	"time"
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

func TestNewQueuedJobAppliesDomainDefaults(t *testing.T) {
	job := NewQueuedJob(NewQueuedJobSpec{
		UserID:        1,
		ModelConfigID: 2,
		JobType:       CapabilityImage,
		Title:         "参考生图-1234",
		Prompt:        "draw",
	})
	if job.Status != StatusPending {
		t.Fatalf("status = %q, want %s", job.Status, StatusPending)
	}
	if job.MaxAttempts != DefaultMaxAttempts {
		t.Fatalf("max attempts = %d, want %d", job.MaxAttempts, DefaultMaxAttempts)
	}
	if job.UserID != 1 || job.ModelConfigID != 2 || job.Title != "参考生图-1234" || job.Prompt != "draw" {
		t.Fatalf("unexpected job: %+v", job)
	}
	modelJob := job.ToModel()
	modelJob.ID = 14
	roundTrip := JobFromModel(modelJob)
	if roundTrip.ID != 14 || roundTrip.Status != StatusPending || roundTrip.MaxAttempts != DefaultMaxAttempts || roundTrip.Title != "参考生图-1234" {
		t.Fatalf("unexpected job round-trip: %+v", roundTrip)
	}
}

func TestScheduleRetryResetsProviderAndAppendsTrace(t *testing.T) {
	now := time.Unix(20, 0).UTC()
	outputID := uint(5)
	finishedAt := time.Unix(10, 0).UTC()
	job := Job{
		Status:              StatusFailed,
		AttemptCount:        2,
		MaxAttempts:         0,
		ErrorMsg:            "failed",
		OutputResourceID:    &outputID,
		ProviderTaskID:      "task",
		ProviderTaskKind:    "video",
		ProviderTaskStatus:  "failed",
		ProviderTaskHistory: "history",
		LockedBy:            "worker",
		LeaseUntil:          &finishedAt,
		LastHeartbeatAt:     &finishedAt,
		FinishedAt:          &finishedAt,
	}

	job.ScheduleRetry(now, "manual retry requested")

	if job.Status != StatusPending || job.AttemptCount != 0 || job.MaxAttempts != DefaultMaxAttempts {
		t.Fatalf("unexpected retry counters: %+v", job)
	}
	if job.ErrorMsg != "" || job.OutputResourceID != nil || job.ProviderTaskID != "" || job.ProviderTaskHistory != "" {
		t.Fatalf("provider state was not reset: %+v", job)
	}
	if job.NextRunAt == nil || !job.NextRunAt.Equal(now) || job.FinishedAt != nil || job.LeaseUntil != nil {
		t.Fatalf("unexpected retry timing: %+v", job)
	}
	if job.ExecutionState != string(StateRetryScheduled) || job.LastHeartbeatAt == nil || !job.LastHeartbeatAt.Equal(now) {
		t.Fatalf("unexpected execution state: %+v", job)
	}
	var trace []StateTraceEntry
	if err := json.Unmarshal([]byte(job.StateTrace), &trace); err != nil {
		t.Fatal(err)
	}
	if len(trace) != 1 || trace[0].State != StateRetryScheduled || trace[0].Status != StatusSucceeded || trace[0].Message != "manual retry requested" {
		t.Fatalf("unexpected trace: %+v", trace)
	}
}

func TestDeleteActionAndCancelForDelete(t *testing.T) {
	if got := (Job{Status: StatusPending}).DeleteAction(); got != DeleteActionCancel {
		t.Fatalf("pending delete action = %s, want %s", got, DeleteActionCancel)
	}
	if got := (Job{Status: StatusRunning}).DeleteAction(); got != DeleteActionBlock {
		t.Fatalf("running delete action = %s, want %s", got, DeleteActionBlock)
	}
	if got := (Job{Status: StatusSucceeded}).DeleteAction(); got != DeleteActionRemove {
		t.Fatalf("succeeded delete action = %s, want %s", got, DeleteActionRemove)
	}

	now := time.Unix(30, 0).UTC()
	nextRunAt := time.Unix(40, 0).UTC()
	job := Job{Status: StatusPending, NextRunAt: &nextRunAt, LockedBy: "worker", LeaseUntil: &nextRunAt}
	job.MarkCancelledForDelete(now, "cancelled by user")
	if job.Status != StatusCancelled || job.ErrorMsg != "cancelled by user" || job.NextRunAt != nil || job.LockedBy != "" || job.LeaseUntil != nil {
		t.Fatalf("unexpected delete cancellation: %+v", job)
	}
	if job.FinishedAt == nil || !job.FinishedAt.Equal(now) || job.LastHeartbeatAt == nil || !job.LastHeartbeatAt.Equal(now) {
		t.Fatalf("unexpected cancellation timing: %+v", job)
	}
}

func TestCountInputResources(t *testing.T) {
	result := CountInputResources([]InputResource{
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
		Model:          ModelConfigInput{ModelDefID: "gpt-image", CredentialID: 8},
		Credential:     CredentialInput{DisplayName: "OpenAI"},
		Prompt:         "draw",
		ExtraParams:    `{"n":1}`,
		JobType:        CapabilityImage,
		InputResources: []InputResource{{Name: "ref.png", Type: "image"}},
		CreatedAt:      time.Unix(10, 0).UTC(),
	})
	var snapshot map[string]any
	if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot["job_type"] != CapabilityImage || snapshot["prompt"] != "draw" {
		t.Fatalf("unexpected snapshot: %s", raw)
	}
}

func TestCostRequestBuildsVideoRequestFromParams(t *testing.T) {
	kind, _, videoReq, err := CostRequest(1, CapabilityVideo, 0, `{"duration":5,"ratio":"16:9"}`, "")
	if err != nil {
		t.Fatal(err)
	}
	if kind != CostRequestVideo || videoReq.Duration != 5 || videoReq.AspectRatio != "16:9" {
		t.Fatalf("unexpected video cost request: kind=%s req=%+v", kind, videoReq)
	}
}

package ai

import (
	"context"
	"testing"
)

func TestRecordDebugAnnotatesRequestShape(t *testing.T) {
	ctx, result := WithDebugRecorder(context.Background())
	recordDebug(ctx, DebugCallResult{
		Success: true,
		ModelID: "grok-video-3",
		Method:  "POST",
		RequestHeaders: map[string]string{
			"Content-Type": "multipart/form-data; boundary=test",
		},
		RequestBody: `(multipart: model=grok-video-3 prompt="hello" images=1)`,
	})
	if result.RequestShape != "multipart_form_data_summary" {
		t.Fatalf("request_shape = %q, want multipart summary", result.RequestShape)
	}
	if result.ContentType != "multipart/form-data; boundary=test" {
		t.Fatalf("content_type = %q", result.ContentType)
	}
	if len(result.Calls) != 1 || result.Calls[0].RequestShape != "multipart_form_data_summary" {
		t.Fatalf("call shape = %#v", result.Calls)
	}

	ctx, result = WithDebugRecorder(context.Background())
	recordDebug(ctx, DebugCallResult{
		Success: true,
		ModelID: "grok-video-3",
		Method:  "POST",
		RequestHeaders: map[string]string{
			"Content-Type": "application/json",
		},
		RequestBody: `{"model":"grok-video-3","prompt":"hello"}`,
	})
	if result.RequestShape != "json_object" {
		t.Fatalf("json request_shape = %q, want json_object", result.RequestShape)
	}
}

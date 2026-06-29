package ai

import "testing"

func TestCapabilityJSONRequiresFirstLastFrameRolesForFirstLastVideo(t *testing.T) {
	raw := `{
		"video_generation": {
			"operations": ["first_last_frame_to_video"],
			"reference_assets": {
				"min": 2,
				"max": 2,
				"roles": ["generic", "first_frame", "last_frame"],
				"modalities": ["image"]
			}
		}
	}`

	ok, reason := capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationFirstLastFrameToVideo, []RouteReferenceAssetIntent{
		{Role: "first_frame", MediaType: "image"},
		{Role: "last_frame", MediaType: "image"},
	})
	if !ok || reason != "" {
		t.Fatalf("first/last frame intent supported = %v reason=%q, want supported", ok, reason)
	}

	ok, reason = capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationFirstLastFrameToVideo, []RouteReferenceAssetIntent{
		{Role: "generic", MediaType: "image"},
		{Role: "generic", MediaType: "image"},
	})
	if ok || reason != "missing_reference_role:first_frame" {
		t.Fatalf("generic image pair supported = %v reason=%q, want missing first_frame role", ok, reason)
	}
}

func TestCapabilityJSONAllowsGenericImageToVideoReference(t *testing.T) {
	raw := `{
		"video_generation": {
			"operations": ["image_to_video"],
			"reference_assets": {
				"min": 1,
				"max": 4,
				"roles": ["generic", "reference_image"],
				"modalities": ["image"]
			}
		}
	}`

	ok, reason := capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationImageToVideo, []RouteReferenceAssetIntent{
		{Role: "generic", MediaType: "image"},
	})
	if !ok || reason != "" {
		t.Fatalf("generic image-to-video ref supported = %v reason=%q, want supported", ok, reason)
	}

	ok, reason = capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationImageToVideo, nil)
	if ok || reason != "invalid_operation_inputs" {
		t.Fatalf("image-to-video without image supported = %v reason=%q, want invalid inputs", ok, reason)
	}

	ok, reason = capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationImageToVideo, []RouteReferenceAssetIntent{
		{Role: "generic"},
	})
	if ok || reason != "missing_input_media_type" {
		t.Fatalf("image-to-video without media type supported = %v reason=%q, want missing media type", ok, reason)
	}
}

func TestCapabilityJSONAllowsOmniReferenceVideoInputs(t *testing.T) {
	raw := `{
		"video_generation": {
			"operations": ["reference_to_video"],
			"reference_assets": {
				"min": 1,
				"max": 8,
				"roles": ["generic", "reference_image", "reference_video", "reference_audio"],
				"modalities": ["image", "video", "audio"]
			}
		}
	}`

	ok, reason := capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationReferenceToVideo, []RouteReferenceAssetIntent{
		{Role: "reference_image", MediaType: "image"},
		{Role: "reference_video", MediaType: "video"},
		{Role: "reference_audio", MediaType: "audio"},
	})
	if !ok || reason != "" {
		t.Fatalf("omni reference video refs supported = %v reason=%q, want supported", ok, reason)
	}

	ok, reason = capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationReferenceToVideo, []RouteReferenceAssetIntent{
		{Role: "reference_audio", MediaType: "audio"},
	})
	if !ok || reason != "" {
		t.Fatalf("audio reference video ref supported = %v reason=%q, want supported", ok, reason)
	}

	ok, reason = capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationReferenceToVideo, nil)
	if ok || reason != "invalid_operation_inputs" {
		t.Fatalf("reference video without refs supported = %v reason=%q, want invalid inputs", ok, reason)
	}
}

func TestCapabilityJSONOperationSlotsOverrideCoarseReferenceAssets(t *testing.T) {
	raw := `{
		"video_generation": {
			"operations": [
				{
					"id": "first_last_frame_to_video",
					"input_slots": [
						{"id": "first_frame", "required": true, "max": 1, "roles": ["first_frame"], "modalities": ["image"]},
						{"id": "last_frame", "required": true, "max": 1, "roles": ["last_frame"], "modalities": ["image"]}
					]
				},
				{
					"id": "image_to_video",
					"input_slots": [
						{"id": "reference_image", "min": 1, "max": 1, "roles": ["generic", "reference_image"], "media_types": ["image"]}
					]
				}
			],
			"reference_assets": {
				"min": 1,
				"max": 3,
				"roles": ["generic", "reference_image", "first_frame", "last_frame"],
				"modalities": ["image"]
			}
		}
	}`

	ok, reason := capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationFirstLastFrameToVideo, []RouteReferenceAssetIntent{
		{Role: "first_frame", MediaType: "image"},
		{Role: "last_frame", MediaType: "image"},
	})
	if !ok || reason != "" {
		t.Fatalf("first/last V2 slot intent supported = %v reason=%q, want supported", ok, reason)
	}

	ok, reason = capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationFirstLastFrameToVideo, []RouteReferenceAssetIntent{
		{Role: "reference_image", MediaType: "image"},
		{Role: "last_frame", MediaType: "image"},
	})
	if ok || reason != "unsupported_operation_input:reference_image:image" {
		t.Fatalf("ordinary reference as first frame supported = %v reason=%q, want unsupported operation input", ok, reason)
	}

	ok, reason = capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationFirstLastFrameToVideo, []RouteReferenceAssetIntent{
		{Role: "first_frame", MediaType: "image"},
	})
	if ok || reason != "missing_operation_input:last_frame" {
		t.Fatalf("missing last frame supported = %v reason=%q, want missing slot", ok, reason)
	}

	ok, reason = capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationImageToVideo, []RouteReferenceAssetIntent{
		{Role: "reference_image", MediaType: "image"},
	})
	if !ok || reason != "" {
		t.Fatalf("ordinary image-to-video V2 slot intent supported = %v reason=%q, want supported", ok, reason)
	}
}

func TestCapabilityJSONOperationSlotsMapIsAccepted(t *testing.T) {
	raw := `{
		"video_generation": {
			"operations": ["first_frame_to_video"],
			"operation_slots": {
				"first_frame_to_video": [
					{"id": "first_frame", "required": true, "max": 1, "role": "first_frame", "media_type": "image"}
				]
			},
			"reference_assets": {
				"min": 1,
				"max": 1,
				"roles": ["reference_image", "first_frame"],
				"modalities": ["image"]
			}
		}
	}`

	ok, reason := capabilityJSONSupportsIntent(raw, CapabilityFamilyVideoGeneration, VideoOperationFirstFrameToVideo, []RouteReferenceAssetIntent{
		{Role: "reference_image", MediaType: "image"},
	})
	if ok || reason != "unsupported_operation_input:reference_image:image" {
		t.Fatalf("ordinary reference first-frame slot supported = %v reason=%q, want unsupported slot input", ok, reason)
	}
}

func TestRouteCapabilityPublicURLRequirementsReadsAssetTransport(t *testing.T) {
	raw := `{
		"video_generation": {
			"operations": ["reference_to_video"],
			"reference_assets": {
				"min": 1,
				"max": 8,
				"roles": ["generic", "reference_image", "reference_video", "reference_audio"],
				"modalities": ["image", "video", "audio"]
			},
			"asset_transport": {
				"input_media": ["public_url"]
			}
		}
	}`

	requirements := RouteCapabilityPublicURLRequirements(raw, CapabilityFamilyVideoGeneration)
	if !requirements.Image || !requirements.Video || !requirements.Audio {
		t.Fatalf("requirements = %#v, want public URL for all declared input modalities", requirements)
	}
}

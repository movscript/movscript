package ai

import (
	"encoding/json"
	"fmt"
	"strings"
)

type RouteReferenceAssetIntent struct {
	Role      string
	MediaType string
}

type capabilityDomain struct {
	Operations       []string                 `json:"operations"`
	ReferenceAssets  referenceAssetCapability `json:"reference_assets"`
	RequiresImageURL bool                     `json:"requires_public_image_url"`
	RequiresVideoURL bool                     `json:"requires_public_video_url"`
}

type referenceAssetCapability struct {
	Min        int      `json:"min"`
	Max        int      `json:"max"`
	Roles      []string `json:"roles"`
	Modalities []string `json:"modalities"`
}

type PublicURLRequirements struct {
	Image bool
	Video bool
}

func RouteCapabilityPublicURLRequirements(rawJSON, capability string) PublicURLRequirements {
	rawJSON = strings.TrimSpace(rawJSON)
	capability = strings.TrimSpace(capability)
	if rawJSON == "" || capability == "" {
		return PublicURLRequirements{}
	}
	var domains map[string]capabilityDomain
	if err := json.Unmarshal([]byte(rawJSON), &domains); err != nil {
		return PublicURLRequirements{}
	}
	domain, ok := domains[capability]
	if !ok {
		return PublicURLRequirements{}
	}
	return PublicURLRequirements{
		Image: domain.RequiresImageURL,
		Video: domain.RequiresVideoURL,
	}
}

func isStructuredCapabilityFamily(capability string) bool {
	switch strings.TrimSpace(capability) {
	case CapabilityFamilyTextGeneration,
		CapabilityFamilyImageGeneration,
		CapabilityFamilyVideoGeneration,
		CapabilityFamilyAudioGeneration,
		CapabilityFamilyEmbedding,
		CapabilityFamilyRerank,
		CapabilityFamilyModeration:
		return true
	default:
		return false
	}
}

func validateStructuredCapabilityRequest(capability, operation string, refs []RouteReferenceAssetIntent) error {
	if !isStructuredCapabilityFamily(capability) {
		return nil
	}
	if strings.TrimSpace(operation) == "" {
		return fmt.Errorf("missing_operation_intent")
	}
	for _, ref := range refs {
		if strings.TrimSpace(ref.Role) == "" {
			return fmt.Errorf("missing_input_role")
		}
	}
	return nil
}

func capabilityJSONSupportsIntent(rawJSON, capability, operation string, refs []RouteReferenceAssetIntent) (bool, string) {
	capability = strings.TrimSpace(capability)
	operation = strings.TrimSpace(operation)
	if capability == "" || operation == "" {
		return false, "missing_operation_intent"
	}
	rawJSON = strings.TrimSpace(rawJSON)
	if rawJSON == "" {
		return false, "missing_capability_schema"
	}
	var domains map[string]capabilityDomain
	if err := json.Unmarshal([]byte(rawJSON), &domains); err != nil {
		return false, "invalid_capability_schema"
	}
	domain, ok := domains[capability]
	if !ok {
		return false, "missing_capability:" + capability
	}
	if !containsTrimmed(domain.Operations, operation) {
		return false, "missing_operation:" + operation
	}
	if reason := referenceAssetsMatchIntent(domain.ReferenceAssets, refs); reason != "" {
		return false, reason
	}
	if reason := operationInputsMatchIntent(capability, operation, refs); reason != "" {
		return false, reason
	}
	return true, ""
}

func capabilityJSONSupportsOperation(rawJSON, capability, operation string) (bool, string) {
	capability = strings.TrimSpace(capability)
	operation = strings.TrimSpace(operation)
	if capability == "" || operation == "" {
		return false, "missing_operation_intent"
	}
	rawJSON = strings.TrimSpace(rawJSON)
	if rawJSON == "" {
		return false, "missing_capability_schema"
	}
	var domains map[string]capabilityDomain
	if err := json.Unmarshal([]byte(rawJSON), &domains); err != nil {
		return false, "invalid_capability_schema"
	}
	domain, ok := domains[capability]
	if !ok {
		return false, "missing_capability:" + capability
	}
	if !containsTrimmed(domain.Operations, operation) {
		return false, "missing_operation:" + operation
	}
	return true, ""
}

func capabilityJSONHasDomain(rawJSON, capability string) bool {
	rawJSON = strings.TrimSpace(rawJSON)
	capability = strings.TrimSpace(capability)
	if rawJSON == "" || capability == "" {
		return false
	}
	var domains map[string]json.RawMessage
	if err := json.Unmarshal([]byte(rawJSON), &domains); err != nil {
		return false
	}
	_, ok := domains[capability]
	return ok
}

func referenceAssetsMatchIntent(capability referenceAssetCapability, refs []RouteReferenceAssetIntent) string {
	if capability.Min > 0 && len(refs) < capability.Min {
		return "invalid_operation_inputs"
	}
	if capability.Max > 0 && len(refs) > capability.Max {
		return "invalid_operation_inputs"
	}
	for _, ref := range refs {
		role := strings.TrimSpace(ref.Role)
		if role == "" {
			return "missing_input_role"
		}
		if len(capability.Roles) > 0 && !containsTrimmed(capability.Roles, role) {
			return "invalid_operation_inputs"
		}
		mediaType := strings.TrimSpace(ref.MediaType)
		if mediaType != "" && len(capability.Modalities) > 0 && !containsTrimmed(capability.Modalities, mediaType) {
			return "invalid_operation_inputs"
		}
	}
	return ""
}

func operationInputsMatchIntent(capability, operation string, refs []RouteReferenceAssetIntent) string {
	switch strings.TrimSpace(capability) {
	case CapabilityFamilyVideoGeneration:
		return videoOperationInputsMatchIntent(strings.TrimSpace(operation), refs)
	default:
		return ""
	}
}

func videoOperationInputsMatchIntent(operation string, refs []RouteReferenceAssetIntent) string {
	switch operation {
	case VideoOperationImageToVideo:
		if !hasReferenceAssetRole(refs, "generic") && !hasReferenceAssetRole(refs, "reference_image") {
			return "missing_reference_role:generic"
		}
	case VideoOperationFirstFrameToVideo:
		if !hasReferenceAssetRole(refs, "first_frame") {
			return "missing_reference_role:first_frame"
		}
	case VideoOperationFirstLastFrameToVideo:
		if !hasReferenceAssetRole(refs, "first_frame") {
			return "missing_reference_role:first_frame"
		}
		if !hasReferenceAssetRole(refs, "last_frame") {
			return "missing_reference_role:last_frame"
		}
	case VideoOperationReferenceToVideo:
		if len(refs) == 0 {
			return "invalid_operation_inputs"
		}
	}
	return ""
}

func hasReferenceAssetRole(refs []RouteReferenceAssetIntent, role string) bool {
	role = strings.TrimSpace(role)
	if role == "" {
		return false
	}
	for _, ref := range refs {
		if strings.TrimSpace(ref.Role) == role {
			return true
		}
	}
	return false
}

func containsTrimmed(values []string, want string) bool {
	want = strings.TrimSpace(want)
	for _, value := range values {
		if strings.TrimSpace(value) == want {
			return true
		}
	}
	return false
}

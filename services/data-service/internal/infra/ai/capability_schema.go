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
	Operations      []string                        `json:"-"`
	OperationInputs map[string][]operationInputSlot `json:"-"`
	OperationRules  map[string][]operationRule      `json:"-"`
	ReferenceAssets referenceAssetCapability        `json:"reference_assets"`
	AssetTransport  assetTransportCapability        `json:"asset_transport"`
}

type referenceAssetCapability struct {
	Min        int      `json:"min"`
	Max        int      `json:"max"`
	Roles      []string `json:"roles"`
	Modalities []string `json:"modalities"`
}

type assetTransportCapability struct {
	InputMedia  []string `json:"input_media"`
	OutputMedia []string `json:"output_media"`
}

type operationInputSlot struct {
	ID          string   `json:"id"`
	Label       string   `json:"label"`
	Min         int      `json:"min"`
	Max         int      `json:"max"`
	Required    bool     `json:"required"`
	Roles       []string `json:"roles"`
	Role        string   `json:"role"`
	Modalities  []string `json:"modalities"`
	MediaTypes  []string `json:"media_types"`
	MediaType   string   `json:"media_type"`
	Description string   `json:"description"`
}

type operationRule struct {
	ID          string `json:"id"`
	Rule        string `json:"rule"`
	Description string `json:"description"`
}

type operationCapability struct {
	ID         string               `json:"id"`
	Operation  string               `json:"operation"`
	Label      string               `json:"label"`
	InputSlots []operationInputSlot `json:"input_slots"`
	Inputs     []operationInputSlot `json:"inputs"`
}

func (domain *capabilityDomain) UnmarshalJSON(data []byte) error {
	type rawCapabilityDomain struct {
		Operations      json.RawMessage                 `json:"operations"`
		OperationSlots  map[string][]operationInputSlot `json:"operation_slots"`
		OperationRules  map[string][]operationRule      `json:"operation_rules"`
		ReferenceAssets referenceAssetCapability        `json:"reference_assets"`
		AssetTransport  assetTransportCapability        `json:"asset_transport"`
	}
	var raw rawCapabilityDomain
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	domain.ReferenceAssets = raw.ReferenceAssets
	domain.AssetTransport = raw.AssetTransport
	domain.Operations = nil
	domain.OperationInputs = map[string][]operationInputSlot{}
	domain.OperationRules = normalizeOperationRules(raw.OperationRules)
	for operation, slots := range raw.OperationSlots {
		operation = strings.TrimSpace(operation)
		if operation == "" {
			continue
		}
		domain.Operations = appendUniqueTrimmed(domain.Operations, operation)
		domain.OperationInputs[operation] = normalizeOperationInputSlots(slots)
	}
	if len(raw.Operations) == 0 || string(raw.Operations) == "null" {
		return nil
	}
	var operationIDs []string
	if err := json.Unmarshal(raw.Operations, &operationIDs); err == nil {
		domain.Operations = appendUniqueTrimmed(domain.Operations, operationIDs...)
		return nil
	}
	var operationDefs []operationCapability
	if err := json.Unmarshal(raw.Operations, &operationDefs); err == nil {
		for _, def := range operationDefs {
			operation := strings.TrimSpace(def.ID)
			if operation == "" {
				operation = strings.TrimSpace(def.Operation)
			}
			if operation == "" {
				continue
			}
			domain.Operations = appendUniqueTrimmed(domain.Operations, operation)
			slots := def.InputSlots
			if len(slots) == 0 {
				slots = def.Inputs
			}
			if len(slots) > 0 {
				domain.OperationInputs[operation] = normalizeOperationInputSlots(slots)
			}
		}
		return nil
	}
	var operationMap map[string]operationCapability
	if err := json.Unmarshal(raw.Operations, &operationMap); err == nil {
		for operation, def := range operationMap {
			operation = strings.TrimSpace(operation)
			if operation == "" {
				operation = strings.TrimSpace(def.ID)
			}
			if operation == "" {
				operation = strings.TrimSpace(def.Operation)
			}
			if operation == "" {
				continue
			}
			domain.Operations = appendUniqueTrimmed(domain.Operations, operation)
			slots := def.InputSlots
			if len(slots) == 0 {
				slots = def.Inputs
			}
			if len(slots) > 0 {
				domain.OperationInputs[operation] = normalizeOperationInputSlots(slots)
			}
		}
		return nil
	}
	return fmt.Errorf("invalid operations schema")
}

type PublicURLRequirements struct {
	Image bool
	Video bool
	Audio bool
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
	requirements := PublicURLRequirements{}
	if containsTrimmed(domain.AssetTransport.InputMedia, "public_url") {
		modalities := domainReferenceModalities(domain)
		if len(modalities) == 0 {
			requirements.Image = true
			requirements.Video = true
			requirements.Audio = true
		} else {
			requirements.Image = requirements.Image || containsTrimmed(modalities, "image")
			requirements.Video = requirements.Video || containsTrimmed(modalities, "video")
			requirements.Audio = requirements.Audio || containsTrimmed(modalities, "audio")
		}
	}
	return requirements
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
	for _, ref := range refs {
		if strings.TrimSpace(ref.Role) == "" {
			return fmt.Errorf("missing_input_role")
		}
		if strings.TrimSpace(ref.MediaType) == "" {
			return fmt.Errorf("missing_input_media_type")
		}
	}
	return nil
}

func capabilityJSONSupportsIntent(rawJSON, capability, operation string, refs []RouteReferenceAssetIntent) (bool, string) {
	capability = strings.TrimSpace(capability)
	operation = strings.TrimSpace(operation)
	if capability == "" {
		return false, "missing_operation_intent"
	}
	if operation == "" {
		return capabilityJSONSupportsInferredIntent(rawJSON, capability, refs)
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
	if reason := operationInputsMatchIntent(domain, capability, operation, refs); reason != "" {
		return false, reason
	}
	if reason := operationRulesMatchIntent(domain, operation, refs); reason != "" {
		return false, reason
	}
	return true, ""
}

func capabilityJSONSupportsOperation(rawJSON, capability, operation string) (bool, string) {
	capability = strings.TrimSpace(capability)
	operation = strings.TrimSpace(operation)
	if capability == "" {
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
	if operation == "" {
		return true, ""
	}
	if !containsTrimmed(domain.Operations, operation) {
		return false, "missing_operation:" + operation
	}
	return true, ""
}

func capabilityJSONSupportsInferredIntent(rawJSON, capability string, refs []RouteReferenceAssetIntent) (bool, string) {
	operations := inferredStructuredCapabilityOperations(capability, refs)
	if len(operations) == 0 {
		return false, "missing_operation_intent"
	}
	lastReason := ""
	for _, operation := range operations {
		ok, reason := capabilityJSONSupportsIntent(rawJSON, capability, operation, refs)
		if ok {
			return true, ""
		}
		if lastReason == "" {
			lastReason = reason
		}
	}
	if lastReason == "" {
		lastReason = "unsupported_generation_intent"
	}
	return false, lastReason
}

func capabilityJSONSupportedInferredOperations(rawJSON, capability string, refs []RouteReferenceAssetIntent) []string {
	operations := inferredStructuredCapabilityOperations(capability, refs)
	out := make([]string, 0, len(operations))
	for _, operation := range operations {
		if ok, _ := capabilityJSONSupportsIntent(rawJSON, capability, operation, refs); ok {
			out = appendUniqueTrimmed(out, operation)
		}
	}
	return out
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

func capabilityJSONOperationsByCapability(rawJSON string, capabilities []string) map[string][]string {
	capabilities = compactTrimmed(capabilities)
	if len(capabilities) == 0 {
		return nil
	}
	var domains map[string]capabilityDomain
	if strings.TrimSpace(rawJSON) != "" {
		_ = json.Unmarshal([]byte(rawJSON), &domains)
	}
	out := make(map[string][]string, len(capabilities))
	for _, capability := range capabilities {
		if domain, ok := domains[capability]; ok && len(domain.Operations) > 0 {
			out[capability] = appendUniqueTrimmed(nil, domain.Operations...)
			continue
		}
		if operations := inferredStructuredCapabilityOperations(capability, nil); len(operations) > 0 {
			out[capability] = appendUniqueTrimmed(nil, operations...)
		}
	}
	return out
}

func inferredStructuredCapabilityOperations(capability string, refs []RouteReferenceAssetIntent) []string {
	switch strings.TrimSpace(capability) {
	case CapabilityFamilyTextGeneration:
		return []string{"chat", "responses"}
	case CapabilityFamilyImageGeneration:
		return inferredImageGenerationOperations(refs)
	case CapabilityFamilyVideoGeneration:
		return inferredVideoGenerationOperations(refs)
	case CapabilityFamilyAudioGeneration:
		return inferredAudioGenerationOperations(refs)
	default:
		return nil
	}
}

func inferredImageGenerationOperations(refs []RouteReferenceAssetIntent) []string {
	if len(refs) == 0 {
		return []string{ImageOperationTextToImage}
	}
	if hasReferenceAssetRole(refs, "style_reference") {
		return []string{ImageOperationReferenceToImage, ImageOperationEditImage}
	}
	return []string{ImageOperationReferenceToImage, ImageOperationEditImage}
}

func inferredVideoGenerationOperations(refs []RouteReferenceAssetIntent) []string {
	if len(refs) == 0 {
		return []string{VideoOperationPromptToVideo, VideoOperationReferenceToVideo}
	}
	hasFirst := hasReferenceAsset(refs, "first_frame", "image")
	hasLast := hasReferenceAsset(refs, "last_frame", "image")
	hasVideo := hasReferenceAssetMediaType(refs, "video")
	hasAudio := hasReferenceAssetMediaType(refs, "audio")
	hasImage := hasReferenceAssetMediaType(refs, "image")
	operations := make([]string, 0, 6)
	if hasFirst && hasLast {
		operations = appendUniqueTrimmed(operations, VideoOperationFirstLastFrameToVideo)
	}
	if hasFirst {
		operations = appendUniqueTrimmed(operations, VideoOperationFirstFrameToVideo)
	}
	if hasVideo && !hasImage && !hasAudio {
		operations = appendUniqueTrimmed(operations, VideoOperationReferenceToVideo)
	}
	if hasImage && !hasVideo && !hasAudio {
		operations = appendUniqueTrimmed(operations, VideoOperationImageToVideo)
	}
	operations = appendUniqueTrimmed(operations, VideoOperationReferenceToVideo)
	if hasVideo {
		operations = appendUniqueTrimmed(operations, VideoOperationReferenceToVideo)
	}
	if hasImage {
		operations = appendUniqueTrimmed(operations, VideoOperationImageToVideo)
	}
	return operations
}

func inferredAudioGenerationOperations(refs []RouteReferenceAssetIntent) []string {
	if hasReferenceAssetMediaType(refs, "audio") {
		return []string{AudioOperationSpeechToSpeech, AudioOperationVoiceClone, AudioOperationSpeechToText, AudioOperationSpeechTranslate}
	}
	return []string{AudioOperationTextToSpeech, AudioOperationMusicGeneration, AudioOperationSoundEffectGeneration, AudioOperationVoiceDesign}
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
		if mediaType == "" {
			return "missing_input_media_type"
		}
		if len(capability.Modalities) > 0 && !containsTrimmed(capability.Modalities, mediaType) {
			return "invalid_operation_inputs"
		}
	}
	return ""
}

func operationInputsMatchIntent(domain capabilityDomain, capability, operation string, refs []RouteReferenceAssetIntent) string {
	if slots := domain.OperationInputs[strings.TrimSpace(operation)]; len(slots) > 0 {
		return operationInputSlotsMatchIntent(slots, refs)
	}
	switch strings.TrimSpace(capability) {
	case CapabilityFamilyVideoGeneration:
		return videoOperationInputsMatchIntent(strings.TrimSpace(operation), refs)
	default:
		return ""
	}
}

func operationInputSlotsMatchIntent(slots []operationInputSlot, refs []RouteReferenceAssetIntent) string {
	for _, ref := range refs {
		if !operationInputRefMatchesAnySlot(slots, ref) {
			role := strings.TrimSpace(ref.Role)
			if role == "" {
				return "missing_input_role"
			}
			mediaType := strings.TrimSpace(ref.MediaType)
			if mediaType == "" {
				return "missing_input_media_type"
			}
			return "unsupported_operation_input:" + role + ":" + mediaType
		}
	}
	for _, slot := range slots {
		id := operationInputSlotID(slot)
		count := operationInputSlotRefCount(slot, refs)
		min := operationInputSlotMin(slot)
		if min > 0 && count < min {
			return "missing_operation_input:" + id
		}
		if slot.Max > 0 && count > slot.Max {
			return "too_many_operation_inputs:" + id
		}
	}
	return ""
}

func operationInputRefMatchesAnySlot(slots []operationInputSlot, ref RouteReferenceAssetIntent) bool {
	for _, slot := range slots {
		if operationInputSlotMatchesRef(slot, ref) {
			return true
		}
	}
	return false
}

func operationInputSlotRefCount(slot operationInputSlot, refs []RouteReferenceAssetIntent) int {
	count := 0
	for _, ref := range refs {
		if operationInputSlotMatchesRef(slot, ref) {
			count++
		}
	}
	return count
}

func operationInputSlotMatchesRef(slot operationInputSlot, ref RouteReferenceAssetIntent) bool {
	role := strings.TrimSpace(ref.Role)
	if role == "" {
		return false
	}
	roles := operationInputSlotRoles(slot)
	if len(roles) > 0 && !containsTrimmed(roles, role) {
		return false
	}
	mediaType := strings.TrimSpace(ref.MediaType)
	if mediaType == "" {
		return false
	}
	mediaTypes := operationInputSlotMediaTypes(slot)
	if len(mediaTypes) > 0 && !containsTrimmed(mediaTypes, mediaType) {
		return false
	}
	return true
}

func operationInputSlotID(slot operationInputSlot) string {
	if id := strings.TrimSpace(slot.ID); id != "" {
		return id
	}
	if role := strings.TrimSpace(slot.Role); role != "" {
		return role
	}
	roles := operationInputSlotRoles(slot)
	if len(roles) == 1 {
		return strings.TrimSpace(roles[0])
	}
	return "reference"
}

func operationInputSlotMin(slot operationInputSlot) int {
	if slot.Min > 0 {
		return slot.Min
	}
	if slot.Required {
		return 1
	}
	return 0
}

func operationInputSlotRoles(slot operationInputSlot) []string {
	return compactTrimmed(append(slot.Roles, slot.Role))
}

func operationInputSlotMediaTypes(slot operationInputSlot) []string {
	values := append([]string{}, slot.Modalities...)
	values = append(values, slot.MediaTypes...)
	values = append(values, slot.MediaType)
	return compactTrimmed(values)
}

func operationRulesMatchIntent(domain capabilityDomain, operation string, refs []RouteReferenceAssetIntent) string {
	operation = strings.TrimSpace(operation)
	if operation == "" {
		return ""
	}
	for _, rule := range domain.OperationRules[operation] {
		switch operationRuleID(rule) {
		case "no_audio_only":
			if hasReferenceAssetMediaType(refs, "audio") &&
				!hasReferenceAssetMediaType(refs, "image") &&
				!hasReferenceAssetMediaType(refs, "video") {
				return "invalid_operation_inputs:audio_only_reference"
			}
		}
	}
	return ""
}

func operationRuleID(rule operationRule) string {
	if id := strings.TrimSpace(rule.ID); id != "" {
		return id
	}
	return strings.TrimSpace(rule.Rule)
}

func normalizeOperationRules(rules map[string][]operationRule) map[string][]operationRule {
	if len(rules) == 0 {
		return nil
	}
	out := make(map[string][]operationRule, len(rules))
	for operation, operationRules := range rules {
		operation = strings.TrimSpace(operation)
		if operation == "" {
			continue
		}
		for _, rule := range operationRules {
			rule.ID = strings.TrimSpace(rule.ID)
			rule.Rule = strings.TrimSpace(rule.Rule)
			if rule.ID == "" && rule.Rule == "" {
				continue
			}
			out[operation] = append(out[operation], rule)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeOperationInputSlots(slots []operationInputSlot) []operationInputSlot {
	out := make([]operationInputSlot, 0, len(slots))
	for _, slot := range slots {
		slot.ID = strings.TrimSpace(slot.ID)
		slot.Role = strings.TrimSpace(slot.Role)
		slot.MediaType = strings.TrimSpace(slot.MediaType)
		slot.Roles = compactTrimmed(slot.Roles)
		slot.Modalities = compactTrimmed(slot.Modalities)
		slot.MediaTypes = compactTrimmed(slot.MediaTypes)
		if slot.ID == "" && slot.Role != "" {
			slot.ID = slot.Role
		}
		if slot.ID == "" && len(slot.Roles) == 1 {
			slot.ID = slot.Roles[0]
		}
		out = append(out, slot)
	}
	return out
}

func domainReferenceModalities(domain capabilityDomain) []string {
	modalities := compactTrimmed(domain.ReferenceAssets.Modalities)
	if len(modalities) > 0 {
		return modalities
	}
	for _, slots := range domain.OperationInputs {
		for _, slot := range slots {
			modalities = appendUniqueTrimmed(modalities, operationInputSlotMediaTypes(slot)...)
		}
	}
	return modalities
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

func hasReferenceAsset(refs []RouteReferenceAssetIntent, role, mediaType string) bool {
	role = strings.TrimSpace(role)
	mediaType = strings.TrimSpace(mediaType)
	for _, ref := range refs {
		if role != "" && strings.TrimSpace(ref.Role) != role {
			continue
		}
		if mediaType != "" && strings.TrimSpace(ref.MediaType) != mediaType {
			continue
		}
		return true
	}
	return false
}

func hasReferenceAssetMediaType(refs []RouteReferenceAssetIntent, mediaType string) bool {
	mediaType = strings.TrimSpace(mediaType)
	if mediaType == "" {
		return false
	}
	for _, ref := range refs {
		if strings.TrimSpace(ref.MediaType) == mediaType {
			return true
		}
	}
	return false
}

func appendUniqueTrimmed(values []string, candidates ...string) []string {
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" || containsTrimmed(values, candidate) {
			continue
		}
		values = append(values, candidate)
	}
	return values
}

func compactTrimmed(values []string) []string {
	out := make([]string, 0, len(values))
	return appendUniqueTrimmed(out, values...)
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

package semantic

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

var errProjectLayerProposalPreviewRollback = errors.New("project-layer proposal apply preview rollback")

type ProjectLayerProposalAssetSlotLinkError struct {
	Message                  string `json:"message"`
	SlotID                   *uint  `json:"slot_id,omitempty"`
	SlotClientID             string `json:"slot_client_id,omitempty"`
	SlotName                 string `json:"slot_name,omitempty"`
	OwnerType                string `json:"owner_type,omitempty"`
	OwnerID                  *uint  `json:"owner_id,omitempty"`
	CreativeReferenceID      *uint  `json:"creative_reference_id,omitempty"`
	ProductionID             *uint  `json:"production_id,omitempty"`
	CreativeReferenceStateID *uint  `json:"creative_reference_state_id,omitempty"`
	Cause                    string `json:"cause"`
	err                      error
}

type ProjectLayerProposalApplyLinkError struct {
	Message              string                                       `json:"message"`
	ProjectID            uint                                         `json:"project_id"`
	Scope                string                                       `json:"scope,omitempty"`
	Mode                 string                                       `json:"mode,omitempty"`
	CreativeReferenceIDs []uint                                       `json:"creative_reference_ids,omitempty"`
	AssetSlots           []ProjectLayerProposalApplyAssetSlotLinkHint `json:"asset_slots,omitempty"`
	Cause                string                                       `json:"cause"`
	err                  error
}

type ProjectLayerProposalApplyAssetSlotLinkHint struct {
	ID                  *uint  `json:"id,omitempty"`
	ClientID            string `json:"client_id,omitempty"`
	Name                string `json:"name,omitempty"`
	OwnerType           string `json:"owner_type,omitempty"`
	OwnerID             *uint  `json:"owner_id,omitempty"`
	OwnerClientID       string `json:"owner_client_id,omitempty"`
	CreativeReferenceID *uint  `json:"creative_reference_id,omitempty"`
	ProductionID        *uint  `json:"production_id,omitempty"`
}

func (e *ProjectLayerProposalAssetSlotLinkError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *ProjectLayerProposalAssetSlotLinkError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.err
}

func (e *ProjectLayerProposalApplyLinkError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *ProjectLayerProposalApplyLinkError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.err
}

type ApplyProjectLayerProposalRequest struct {
	Scope    string                    `json:"scope"`
	Mode     string                    `json:"mode"`
	Summary  string                    `json:"summary"`
	Proposal *ProjectLayerProposalTree `json:"proposal"`
}

type ProjectLayerProposalTree struct {
	ProjectStyle       *ProjectStylePatch                           `json:"project_style"`
	CreativeReferences []ProjectLayerProposalCreativeReferencePatch `json:"creative_references"`
	AssetSlots         []ProjectLayerProposalAssetSlotPatch         `json:"asset_slots"`
}

type ProjectStylePatch struct {
	AspectRatio    *string                        `json:"aspect_ratio"`
	ShotSizeSystem []string                       `json:"shot_size_system"`
	CameraLanguage *string                        `json:"camera_language"`
	VisualStyle    *string                        `json:"visual_style"`
	LightingStyle  *string                        `json:"lighting_style"`
	ColorPalette   *string                        `json:"color_palette"`
	PacingRules    *string                        `json:"pacing_rules"`
	NegativeRules  []string                       `json:"negative_rules"`
	CustomRules    *[]ProjectStyleCustomRulePatch `json:"custom_rules"`
}

type ProjectStyleCustomRulePatch struct {
	ID         string `json:"id"`
	Key        string `json:"key"`
	Label      string `json:"label"`
	Category   string `json:"category"`
	Value      string `json:"value"`
	PromptRole string `json:"prompt_role"`
	Enabled    *bool  `json:"enabled"`
	Required   *bool  `json:"required"`
	Order      *int   `json:"order"`
}

type ProjectLayerProposalCreativeReferencePatch struct {
	ClientID         string                               `json:"client_id"`
	ID               *uint                                `json:"id"`
	MergeCandidates  []ProjectLayerProposalMergeCandidate `json:"merge_candidates"`
	SourceScriptID   *uint                                `json:"source_script_id"`
	SourceAnalysisID *uint                                `json:"source_analysis_id"`
	Kind             string                               `json:"kind"`
	Name             string                               `json:"name"`
	Alias            string                               `json:"alias"`
	Description      string                               `json:"description"`
	Content          string                               `json:"content"`
	Importance       string                               `json:"importance"`
	Status           string                               `json:"status"`
	ProfileJSON      string                               `json:"profile_json"`
	TagsJSON         string                               `json:"tags_json"`
}

type ProjectLayerProposalAssetSlotPatch struct {
	ClientID                 string                        `json:"client_id"`
	ID                       *uint                         `json:"id"`
	Owner                    *ProjectLayerProposalOwnerRef `json:"owner"`
	ProductionID             *uint                         `json:"production_id"`
	CreativeReferenceID      *uint                         `json:"creative_reference_id"`
	CreativeReferenceStateID *uint                         `json:"creative_reference_state_id"`
	OwnerType                string                        `json:"owner_type"`
	OwnerID                  *uint                         `json:"owner_id"`
	Kind                     string                        `json:"kind"`
	Name                     string                        `json:"name"`
	Description              string                        `json:"description"`
	SlotKey                  string                        `json:"slot_key"`
	PromptHint               string                        `json:"prompt_hint"`
	Status                   string                        `json:"status"`
	Priority                 string                        `json:"priority"`
	ResourceID               *uint                         `json:"resource_id"`
	LockedAssetSlotID        *uint                         `json:"locked_asset_slot_id"`
	MetadataJSON             string                        `json:"metadata_json"`
}

type ProjectLayerProposalOwnerRef struct {
	Type     string `json:"type"`
	ID       *uint  `json:"id"`
	ClientID string `json:"client_id"`
}

type ProjectLayerProposalMergeCandidate struct {
	SourceID *uint  `json:"source_id"`
	Reason   string `json:"reason"`
}

type projectLayerProposalApplyState struct {
	creativeReferenceIDByClientID map[string]uint
	creativeReferenceIDs          map[uint]bool
	creativeReferenceSearchText   map[uint]string
	keptCreativeReferenceIDs      map[uint]bool
	keptAssetSlotIDs              map[uint]bool
}

type ApplyProjectLayerProposalResponse struct {
	ProjectID          uint                            `json:"project_id"`
	Counts             ProjectLayerProposalApplyCounts `json:"counts"`
	CanonicalSnapshot  *ProjectLayerProposalTree       `json:"canonical_snapshot,omitempty"`
	DeprecatedWarnings []string                        `json:"deprecated_warnings,omitempty"`
}

type ProjectLayerProposalApplyCounts struct {
	CreativeReferencesCreated int `json:"creative_references_created"`
	CreativeReferencesUpdated int `json:"creative_references_updated"`
	CreativeReferencesMerged  int `json:"creative_references_merged"`
	CreativeReferencesDeleted int `json:"creative_references_deleted"`
	AssetSlotsCreated         int `json:"asset_slots_created"`
	AssetSlotsUpdated         int `json:"asset_slots_updated"`
	AssetSlotsDeleted         int `json:"asset_slots_deleted"`
	AssetSlotsReassigned      int `json:"asset_slots_reassigned"`
	CreativeReferenceUsages   int `json:"creative_reference_usages"`
	CreativeRelationships     int `json:"creative_relationships"`
	ProjectStyleUpdated       int `json:"project_style_updated"`
}

func (s *Service) ApplyProjectLayerProposal(ctx context.Context, projectID uint, req ApplyProjectLayerProposalRequest) (*ApplyProjectLayerProposalResponse, error) {
	if projectID == 0 {
		return nil, ErrInvalidInput{Err: errors.New("project id is required")}
	}
	if req.Proposal == nil {
		return nil, ErrInvalidInput{Err: errors.New("proposal is required")}
	}

	resp, err := s.applyProjectLayerProposalInTx(ctx, projectID, req)
	if err != nil {
		return nil, projectLayerProposalApplyLinkError(projectID, req, err)
	}

	s.bumpProgressVersion(ctx, projectID)
	return resp, nil
}

func (s *Service) PreviewProjectLayerProposalApply(ctx context.Context, projectID uint, req ApplyProjectLayerProposalRequest) (*ApplyProjectLayerProposalResponse, error) {
	if projectID == 0 {
		return nil, ErrInvalidInput{Err: errors.New("project id is required")}
	}
	if req.Proposal == nil {
		return nil, ErrInvalidInput{Err: errors.New("proposal is required")}
	}

	var resp *ApplyProjectLayerProposalResponse
	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		var err error
		resp, err = txSvc.applyProjectLayerProposalInTx(ctx, projectID, req)
		if err != nil {
			return err
		}
		return errProjectLayerProposalPreviewRollback
	})
	if errors.Is(err, errProjectLayerProposalPreviewRollback) {
		return resp, nil
	}
	if err != nil {
		return nil, projectLayerProposalApplyLinkError(projectID, req, err)
	}
	return resp, nil
}

func (s *Service) applyProjectLayerProposalInTx(ctx context.Context, projectID uint, req ApplyProjectLayerProposalRequest) (*ApplyProjectLayerProposalResponse, error) {
	scope := normalizeProjectLayerProposalScope(req.Scope)
	if !isProjectLayerProposalScope(scope) {
		return nil, ErrInvalidInput{Err: fmt.Errorf("project-layer proposal scope must be project_standards_proposal, setting_proposal, or asset_proposal")}
	}
	if scope == "project_standards_proposal" && (len(req.Proposal.CreativeReferences) > 0 || len(req.Proposal.AssetSlots) > 0) {
		return nil, ErrInvalidInput{Err: errors.New("project_standards_proposal only supports project_style; use setting_proposal or asset_proposal for project-layer lists")}
	}
	if scope == "setting_proposal" && len(req.Proposal.AssetSlots) > 0 {
		return nil, ErrInvalidInput{Err: errors.New("setting_proposal only supports creative_references; use asset_proposal for asset slots")}
	}
	if scope == "asset_proposal" && len(req.Proposal.CreativeReferences) > 0 {
		return nil, ErrInvalidInput{Err: errors.New("asset_proposal only supports asset_slots; use setting_proposal for creative references")}
	}
	resp := &ApplyProjectLayerProposalResponse{ProjectID: projectID}
	state := projectLayerProposalApplyState{
		creativeReferenceIDByClientID: make(map[string]uint),
		creativeReferenceIDs:          make(map[uint]bool),
		creativeReferenceSearchText:   make(map[uint]string),
		keptCreativeReferenceIDs:      make(map[uint]bool),
		keptAssetSlotIDs:              make(map[uint]bool),
	}

	err := s.repo.WithTx(ctx, func(txRepo repository) error {
		txSvc := s.withRepository(txRepo)
		if err := txSvc.loadPersistedProjectLayerProposalClientIDs(ctx, projectID, &state); err != nil {
			return err
		}
		if req.Proposal.ProjectStyle != nil && req.Proposal.ProjectStyle.hasChanges() {
			if _, err := txRepo.PatchProjectStyle(ctx, projectID, *req.Proposal.ProjectStyle); err != nil {
				return err
			}
			resp.Counts.ProjectStyleUpdated = 1
		}
		for _, patch := range req.Proposal.CreativeReferences {
			if err := txSvc.applyProjectCreativeReferencePatch(ctx, projectID, patch, resp, &state); err != nil {
				return err
			}
		}
		for _, patch := range req.Proposal.AssetSlots {
			if err := txSvc.applyProjectAssetSlotPatch(ctx, projectID, patch, resp, &state); err != nil {
				return err
			}
		}
		if normalizeProjectLayerProposalMode(req.Mode) == "snapshot" {
			ownedReferences, ownedAssetSlots := projectLayerProposalSnapshotOwnedLists(scope)
			if err := txSvc.applyProjectLayerProposalSnapshotOmissions(ctx, projectID, &state, resp, ownedReferences, ownedAssetSlots); err != nil {
				return err
			}
		}
		snapshot, err := txSvc.loadProjectLayerProposalCanonicalSnapshot(ctx, projectID)
		if err != nil {
			return err
		}
		resp.CanonicalSnapshot = snapshot
		return nil
	})
	if err != nil {
		return nil, err
	}

	return resp, nil
}

func (s *Service) applyProjectLayerProposalSnapshotOmissions(ctx context.Context, projectID uint, state *projectLayerProposalApplyState, resp *ApplyProjectLayerProposalResponse, ownedReferences bool, ownedAssetSlots bool) error {
	if state == nil {
		return nil
	}
	if ownedReferences {
		references, err := s.repo.ListCreativeReferences(ctx, CreativeReferenceFilter{ProjectID: projectID})
		if err != nil {
			return err
		}
		for _, reference := range references {
			if state.keptCreativeReferenceIDs[reference.ID] || !projectLayerProposalReferenceActive(reference) {
				continue
			}
			if _, err := s.PatchCreativeReference(ctx, projectID, fmt.Sprint(reference.ID), CreativeReferenceInput{
				Name:        reference.Name,
				Kind:        reference.Kind,
				Description: reference.Description,
				Status:      "ignored",
			}); err != nil {
				return err
			}
			resp.Counts.CreativeReferencesDeleted++
		}
	}

	if ownedAssetSlots {
		slots, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, IncludeInternal: "true"})
		if err != nil {
			return err
		}
		for _, slot := range slots {
			if state.keptAssetSlotIDs[slot.ID] || !projectLayerProposalAssetSlotActive(slot) {
				continue
			}
			if _, err := s.PatchAssetSlot(ctx, projectID, fmt.Sprint(slot.ID), PatchAssetSlotInput{
				Status: "waived",
			}); err != nil {
				return projectLayerProposalOmittedAssetSlotApplyError(slot, err)
			}
			resp.Counts.AssetSlotsDeleted++
		}
	}
	return nil
}

func projectLayerProposalOmittedAssetSlotApplyError(slot domainsemantic.AssetSlot, err error) error {
	if err == nil {
		return nil
	}
	if !errors.Is(err, ErrOwnerNotFound) && !errors.Is(err, ErrTextBlockNotFound) && !errors.Is(err, ErrOwnerWrongProject) {
		return err
	}
	fields := map[string]any{
		"owner_type":                  slot.OwnerType,
		"owner_id":                    slot.OwnerID,
		"creative_reference_id":       slot.CreativeReferenceID,
		"production_id":               slot.ProductionID,
		"creative_reference_state_id": slot.CreativeReferenceStateID,
	}
	slotID := slot.ID
	return &ProjectLayerProposalAssetSlotLinkError{
		Message:                  fmt.Sprintf("清理旧素材需求 %q 时关联对象无效：%s；原因：%s", slot.Name, projectLayerProposalAssetSlotLinkLabel(fields), err.Error()),
		SlotID:                   &slotID,
		SlotName:                 strings.TrimSpace(slot.Name),
		OwnerType:                strings.TrimSpace(slot.OwnerType),
		OwnerID:                  slot.OwnerID,
		CreativeReferenceID:      slot.CreativeReferenceID,
		ProductionID:             slot.ProductionID,
		CreativeReferenceStateID: slot.CreativeReferenceStateID,
		Cause:                    err.Error(),
		err:                      err,
	}
}

func projectLayerProposalSnapshotOwnedLists(scope string) (creativeReferences bool, assetSlots bool) {
	switch normalizeProjectLayerProposalScope(scope) {
	case "project_standards_proposal":
		return false, false
	case "setting_proposal":
		return true, false
	case "asset_proposal":
		return false, true
	default:
		return false, false
	}
}

func normalizeProjectLayerProposalScope(scope string) string {
	return strings.TrimSpace(scope)
}

func isProjectLayerProposalScope(scope string) bool {
	return scope == "project_standards_proposal" || scope == "setting_proposal" || scope == "asset_proposal"
}

func (patch ProjectStylePatch) hasChanges() bool {
	return patch.AspectRatio != nil ||
		len(patch.ShotSizeSystem) > 0 ||
		patch.CameraLanguage != nil ||
		patch.VisualStyle != nil ||
		patch.LightingStyle != nil ||
		patch.ColorPalette != nil ||
		patch.PacingRules != nil ||
		len(patch.NegativeRules) > 0 ||
		patch.CustomRules != nil
}

func (patch ProjectStylePatch) normalizedMap() map[string]any {
	out := make(map[string]any)
	if patch.AspectRatio != nil {
		out["aspect_ratio"] = strings.TrimSpace(*patch.AspectRatio)
	}
	if len(patch.ShotSizeSystem) > 0 {
		out["shot_size_system"] = normalizedStringSlice(patch.ShotSizeSystem)
	}
	if patch.CameraLanguage != nil {
		out["camera_language"] = strings.TrimSpace(*patch.CameraLanguage)
	}
	if patch.VisualStyle != nil {
		out["visual_style"] = strings.TrimSpace(*patch.VisualStyle)
	}
	if patch.LightingStyle != nil {
		out["lighting_style"] = strings.TrimSpace(*patch.LightingStyle)
	}
	if patch.ColorPalette != nil {
		out["color_palette"] = strings.TrimSpace(*patch.ColorPalette)
	}
	if patch.PacingRules != nil {
		out["pacing_rules"] = strings.TrimSpace(*patch.PacingRules)
	}
	if len(patch.NegativeRules) > 0 {
		out["negative_rules"] = normalizedStringSlice(patch.NegativeRules)
	}
	if patch.CustomRules != nil {
		out["custom_rules"] = normalizedProjectStyleCustomRules(*patch.CustomRules)
	}
	return out
}

func normalizedStringSlice(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func normalizedProjectStyleCustomRules(values []ProjectStyleCustomRulePatch) []map[string]any {
	out := make([]map[string]any, 0, len(values))
	for index, value := range values {
		key := strings.TrimSpace(value.Key)
		label := strings.TrimSpace(value.Label)
		ruleValue := strings.TrimSpace(value.Value)
		if key == "" && label == "" && ruleValue == "" {
			continue
		}
		ruleID := normalizeProjectStyleRuleID(value.ID, key, label, index)
		if key == "" {
			key = ruleID
		}
		enabled := true
		if value.Enabled != nil {
			enabled = *value.Enabled
		}
		order := index + 1
		if value.Order != nil {
			order = *value.Order
		}
		item := map[string]any{
			"id":          ruleID,
			"key":         key,
			"label":       label,
			"category":    strings.TrimSpace(value.Category),
			"value":       ruleValue,
			"prompt_role": normalizeProjectStylePromptRole(value.PromptRole),
			"enabled":     enabled,
			"order":       order,
		}
		if value.Required != nil {
			item["required"] = *value.Required
		}
		out = append(out, item)
	}
	return out
}

func normalizeProjectStyleRuleID(id, key, label string, index int) string {
	candidate := strings.TrimSpace(id)
	if candidate == "" {
		candidate = strings.TrimSpace(key)
	}
	if candidate == "" {
		candidate = strings.TrimSpace(label)
	}
	var builder strings.Builder
	previousSeparator := false
	for _, char := range strings.ToLower(candidate) {
		if unicode.IsLetter(char) || unicode.IsDigit(char) {
			builder.WriteRune(char)
			previousSeparator = false
			continue
		}
		if char == '_' || char == '-' || char == ' ' || char == '.' {
			if builder.Len() > 0 && !previousSeparator {
				builder.WriteByte('_')
				previousSeparator = true
			}
		}
	}
	normalized := strings.Trim(builder.String(), "_")
	if normalized == "" {
		return fmt.Sprintf("custom_rule_%d", index+1)
	}
	return normalized
}

func normalizeProjectStylePromptRole(value string) string {
	switch strings.TrimSpace(value) {
	case "context", "style", "constraint", "negative", "quality_gate":
		return strings.TrimSpace(value)
	default:
		return "constraint"
	}
}

func mergeProjectStyleJSON(current string, patch ProjectStylePatch) (string, error) {
	merged := make(map[string]any)
	if strings.TrimSpace(current) != "" {
		if err := json.Unmarshal([]byte(current), &merged); err != nil {
			return "", fmt.Errorf("parse existing project style: %w", err)
		}
	}
	for key, value := range patch.normalizedMap() {
		merged[key] = value
	}
	raw, err := json.Marshal(merged)
	if err != nil {
		return "", fmt.Errorf("marshal project style: %w", err)
	}
	return string(raw), nil
}

func normalizeProjectLayerProposalMode(mode string) string {
	if strings.TrimSpace(mode) == "snapshot" {
		return "snapshot"
	}
	return "patch"
}

func projectLayerProposalReferenceActive(reference domainsemantic.CreativeReference) bool {
	status := strings.TrimSpace(reference.Status)
	return status != "ignored" && status != "merged"
}

func projectLayerProposalAssetSlotActive(slot domainsemantic.AssetSlot) bool {
	status := strings.TrimSpace(slot.Status)
	return status != "ignored" && status != "waived" && status != "merged"
}

func (s *Service) loadProjectLayerProposalCanonicalSnapshot(ctx context.Context, projectID uint) (*ProjectLayerProposalTree, error) {
	references, err := s.repo.ListCreativeReferences(ctx, CreativeReferenceFilter{ProjectID: projectID})
	if err != nil {
		return nil, err
	}
	slots, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, IncludeInternal: "true"})
	if err != nil {
		return nil, err
	}
	snapshot := &ProjectLayerProposalTree{
		CreativeReferences: make([]ProjectLayerProposalCreativeReferencePatch, 0, len(references)),
		AssetSlots:         make([]ProjectLayerProposalAssetSlotPatch, 0, len(slots)),
	}
	for _, reference := range references {
		if !projectLayerProposalReferenceActive(reference) {
			continue
		}
		snapshot.CreativeReferences = append(snapshot.CreativeReferences, projectLayerProposalCreativeReferenceFromDomain(reference))
	}
	for _, slot := range slots {
		if !projectLayerProposalAssetSlotActive(slot) {
			continue
		}
		snapshot.AssetSlots = append(snapshot.AssetSlots, projectLayerProposalAssetSlotFromDomain(slot))
	}
	return snapshot, nil
}

func projectLayerProposalCreativeReferenceFromDomain(reference domainsemantic.CreativeReference) ProjectLayerProposalCreativeReferencePatch {
	id := reference.ID
	return ProjectLayerProposalCreativeReferencePatch{
		ID:               &id,
		SourceScriptID:   reference.SourceScriptID,
		SourceAnalysisID: reference.SourceAnalysisID,
		Kind:             reference.Kind,
		Name:             reference.Name,
		Alias:            reference.Alias,
		Description:      reference.Description,
		Content:          reference.Content,
		Importance:       reference.Importance,
		Status:           reference.Status,
		ProfileJSON:      reference.ProfileJSON,
		TagsJSON:         reference.TagsJSON,
	}
}

func projectLayerProposalAssetSlotFromDomain(slot domainsemantic.AssetSlot) ProjectLayerProposalAssetSlotPatch {
	id := slot.ID
	return ProjectLayerProposalAssetSlotPatch{
		ID:                       &id,
		ProductionID:             slot.ProductionID,
		CreativeReferenceID:      slot.CreativeReferenceID,
		CreativeReferenceStateID: slot.CreativeReferenceStateID,
		OwnerType:                slot.OwnerType,
		OwnerID:                  slot.OwnerID,
		Kind:                     slot.Kind,
		Name:                     slot.Name,
		Description:              slot.Description,
		SlotKey:                  slot.SlotKey,
		PromptHint:               slot.PromptHint,
		Status:                   slot.Status,
		Priority:                 slot.Priority,
		ResourceID:               slot.ResourceID,
		LockedAssetSlotID:        slot.LockedAssetSlotID,
		MetadataJSON:             slot.MetadataJSON,
	}
}

func (s *Service) applyProjectCreativeReferencePatch(ctx context.Context, projectID uint, patch ProjectLayerProposalCreativeReferencePatch, resp *ApplyProjectLayerProposalResponse, state *projectLayerProposalApplyState) error {
	fields := patch.fields()
	if patch.ID == nil {
		input, err := creativeReferenceInputFromProposalFields(fields)
		if err != nil {
			return err
		}
		if strings.TrimSpace(input.Name) == "" {
			return ErrInvalidInput{Err: errors.New("creative reference snapshot row requires name for new references")}
		}
		if strings.TrimSpace(input.Kind) == "" {
			input.Kind = "character"
		}
		if strings.TrimSpace(input.Status) == "" {
			input.Status = domainsemantic.ProposalDraftStatusValue
		}
		created, err := s.CreateCreativeReference(ctx, projectID, input)
		if err != nil {
			return err
		}
		rememberProjectLayerProposalCreativeReferenceID(state, patch.ClientID, fields, created.ID)
		rememberProjectLayerProposalCreativeReferenceKeep(state, created.ID)
		resp.Counts.CreativeReferencesCreated++
		return nil
	}
	if len(fields) > 0 {
		input, err := creativeReferenceInputFromProposalFields(fields)
		if err != nil {
			return err
		}
		if _, err := s.PatchCreativeReference(ctx, projectID, fmt.Sprint(*patch.ID), input); err != nil {
			return err
		}
		if isProjectLayerProposalSoftDeleteStatus(input.Status) {
			resp.Counts.CreativeReferencesDeleted++
		} else {
			resp.Counts.CreativeReferencesUpdated++
		}
	} else if _, err := s.repo.LoadCreativeReference(ctx, projectID, fmt.Sprint(*patch.ID)); err != nil {
		return err
	}
	rememberProjectLayerProposalCreativeReferenceID(state, patch.ClientID, fields, *patch.ID)
	rememberProjectLayerProposalCreativeReferenceKeep(state, *patch.ID)
	for _, candidate := range patch.MergeCandidates {
		if candidate.SourceID == nil || *candidate.SourceID == 0 {
			return ErrInvalidInput{Err: errors.New("creative reference merge candidate requires source_id")}
		}
		if err := s.applyProjectCreativeReferenceMerge(ctx, projectID, *patch.ID, []uint{*candidate.SourceID}, resp); err != nil {
			return err
		}
		resp.Counts.CreativeReferencesMerged++
	}
	return nil
}

func (s *Service) applyProjectCreativeReferenceMerge(ctx context.Context, projectID uint, targetID uint, sourceIDs []uint, resp *ApplyProjectLayerProposalResponse) error {
	if len(sourceIDs) == 0 {
		return ErrInvalidInput{Err: errors.New("creative reference merge candidate requires source_id")}
	}

	targetSlots, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, IncludeInternal: "true"})
	if err != nil {
		return err
	}
	targetSlotSet := make(map[string]uint)
	for _, slot := range targetSlots {
		if slot.CreativeReferenceID != nil && *slot.CreativeReferenceID == targetID {
			targetSlotSet[assetSlotMergeKey(slot)] = slot.ID
		}
	}

	for _, sourceID := range sourceIDs {
		if sourceID == 0 || sourceID == targetID {
			continue
		}

		usages, err := s.ListCreativeReferenceUsages(ctx, CreativeReferenceUsageFilter{ProjectID: projectID, CreativeReferenceID: sourceID})
		if err != nil {
			return err
		}
		for _, usage := range usages {
			input := CreativeReferenceUsageInput{
				OwnerType:                usage.OwnerType,
				OwnerID:                  usage.OwnerID,
				CreativeReferenceID:      targetID,
				CreativeReferenceStateID: usage.CreativeReferenceStateID,
				Role:                     usage.Role,
				Order:                    usage.Order,
				Evidence:                 usage.Evidence,
				Source:                   usage.Source,
				Status:                   usage.Status,
				MetadataJSON:             usage.MetadataJSON,
			}
			if _, err := s.PatchCreativeReferenceUsage(ctx, projectID, fmt.Sprint(usage.ID), input); err != nil {
				return err
			}
			resp.Counts.CreativeReferenceUsages++
		}

		relationships, err := s.ListCreativeRelationships(ctx, CreativeRelationshipFilter{ProjectID: projectID, CreativeReferenceID: sourceID})
		if err != nil {
			return err
		}
		for _, relation := range relationships {
			sourceRefID := relation.SourceCreativeReferenceID
			targetRefID := relation.TargetCreativeReferenceID
			if sourceRefID == sourceID {
				sourceRefID = targetID
			}
			if targetRefID == sourceID {
				targetRefID = targetID
			}
			input := CreativeRelationshipInput{
				SourceCreativeReferenceID: sourceRefID,
				TargetCreativeReferenceID: targetRefID,
				ScopeType:                 relation.ScopeType,
				ScopeID:                   relation.ScopeID,
				Category:                  relation.Category,
				Type:                      relation.Type,
				Label:                     relation.Label,
				Description:               relation.Description,
				Source:                    relation.Source,
				Status:                    relation.Status,
				Evidence:                  relation.Evidence,
				MetadataJSON:              relation.MetadataJSON,
			}
			if sourceRefID == targetRefID {
				input.Status = "ignored"
			}
			if _, err := s.PatchCreativeRelationship(ctx, projectID, fmt.Sprint(relation.ID), input); err != nil {
				return err
			}
			resp.Counts.CreativeRelationships++
		}

		slots, err := s.repo.ListAssetSlots(ctx, AssetSlotFilter{ProjectID: projectID, IncludeInternal: "true"})
		if err != nil {
			return err
		}
		for _, slot := range slots {
			if slot.CreativeReferenceID == nil || *slot.CreativeReferenceID != sourceID {
				continue
			}
			key := assetSlotMergeKey(slot)
			if _, ok := targetSlotSet[key]; ok {
				if _, err := s.PatchAssetSlot(ctx, projectID, fmt.Sprint(slot.ID), PatchAssetSlotInput{
					CreativeReferenceID:      &targetID,
					Status:                   "waived",
					OwnerType:                slot.OwnerType,
					OwnerID:                  slot.OwnerID,
					CreativeReferenceStateID: slot.CreativeReferenceStateID,
					ProductionID:             slot.ProductionID,
					Kind:                     slot.Kind,
					Name:                     slot.Name,
					Description:              slot.Description,
					SlotKey:                  slot.SlotKey,
					PromptHint:               slot.PromptHint,
					Priority:                 slot.Priority,
					MetadataJSON:             slot.MetadataJSON,
				}); err != nil {
					return err
				}
			} else {
				if _, err := s.PatchAssetSlot(ctx, projectID, fmt.Sprint(slot.ID), PatchAssetSlotInput{
					CreativeReferenceID:      &targetID,
					OwnerType:                slot.OwnerType,
					OwnerID:                  slot.OwnerID,
					CreativeReferenceStateID: slot.CreativeReferenceStateID,
					ProductionID:             slot.ProductionID,
					Kind:                     slot.Kind,
					Name:                     slot.Name,
					Description:              slot.Description,
					SlotKey:                  slot.SlotKey,
					PromptHint:               slot.PromptHint,
					Status:                   slot.Status,
					Priority:                 slot.Priority,
					MetadataJSON:             slot.MetadataJSON,
				}); err != nil {
					return err
				}
				targetSlotSet[key] = slot.ID
			}
			resp.Counts.AssetSlotsReassigned++
		}

		source, err := s.repo.LoadCreativeReference(ctx, projectID, fmt.Sprint(sourceID))
		if err != nil {
			return err
		}
		if _, err := s.PatchCreativeReference(ctx, projectID, fmt.Sprint(source.ID), CreativeReferenceInput{
			SourceScriptID:   source.SourceScriptID,
			SourceAnalysisID: source.SourceAnalysisID,
			Kind:             source.Kind,
			Name:             source.Name,
			Alias:            source.Alias,
			Description:      source.Description,
			Content:          source.Content,
			Importance:       source.Importance,
			Status:           "merged",
			ProfileJSON:      source.ProfileJSON,
			TagsJSON:         source.TagsJSON,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) applyProjectAssetSlotPatch(ctx context.Context, projectID uint, patch ProjectLayerProposalAssetSlotPatch, resp *ApplyProjectLayerProposalResponse, state *projectLayerProposalApplyState) error {
	fields, err := resolveProjectLayerProposalAssetSlotFields(patch.fields(), patch.Owner, state)
	if err != nil {
		return err
	}
	if patch.ID == nil {
		input, err := assetSlotInputFromProposalFields(fields)
		if err != nil {
			return err
		}
		if strings.TrimSpace(input.Name) == "" {
			return ErrInvalidInput{Err: errors.New("asset slot snapshot row requires name for new asset slots")}
		}
		if strings.TrimSpace(input.Kind) == "" {
			input.Kind = "image"
		}
		if strings.TrimSpace(input.Status) == "" {
			input.Status = domainsemantic.AssetSlotStatusMissing
		}
		created, err := s.CreateAssetSlot(ctx, projectID, input)
		if err != nil {
			return projectLayerProposalAssetSlotApplyError(patch, fields, err)
		}
		rememberProjectLayerProposalAssetSlotKeep(state, created.ID)
		resp.Counts.AssetSlotsCreated++
		return nil
	}
	input, err := assetSlotPatchInputFromProposalFields(fields)
	if err != nil {
		return err
	}
	if _, err := s.PatchAssetSlot(ctx, projectID, fmt.Sprint(*patch.ID), input); err != nil {
		return projectLayerProposalAssetSlotApplyError(patch, fields, err)
	}
	if isProjectLayerProposalSoftDeleteStatus(input.Status) {
		resp.Counts.AssetSlotsDeleted++
	} else {
		resp.Counts.AssetSlotsUpdated++
	}
	rememberProjectLayerProposalAssetSlotKeep(state, *patch.ID)
	return nil
}

func projectLayerProposalAssetSlotApplyError(patch ProjectLayerProposalAssetSlotPatch, fields map[string]any, err error) error {
	if err == nil {
		return nil
	}
	if !errors.Is(err, ErrOwnerNotFound) && !errors.Is(err, ErrTextBlockNotFound) && !errors.Is(err, ErrOwnerWrongProject) {
		return err
	}
	detail := ProjectLayerProposalAssetSlotLinkError{
		SlotID:                   patch.ID,
		SlotClientID:             strings.TrimSpace(patch.ClientID),
		SlotName:                 strings.TrimSpace(patch.Name),
		OwnerType:                strings.TrimSpace(fieldString(fields, "owner_type")),
		OwnerID:                  fieldUint(fields, "owner_id"),
		CreativeReferenceID:      fieldUint(fields, "creative_reference_id"),
		ProductionID:             fieldUint(fields, "production_id"),
		CreativeReferenceStateID: fieldUint(fields, "creative_reference_state_id"),
		Cause:                    err.Error(),
		err:                      err,
	}
	detail.Message = fmt.Sprintf("素材需求 %q 的关联对象无效：%s；原因：%s", detail.SlotName, projectLayerProposalAssetSlotLinkLabel(fields), err.Error())
	if detail.SlotName == "" {
		detail.Message = fmt.Sprintf("素材需求的关联对象无效：%s；原因：%s", projectLayerProposalAssetSlotLinkLabel(fields), err.Error())
	}
	return &detail
}

func projectLayerProposalApplyLinkError(projectID uint, req ApplyProjectLayerProposalRequest, err error) error {
	if err == nil {
		return nil
	}
	var slotLinkErr *ProjectLayerProposalAssetSlotLinkError
	if errors.As(err, &slotLinkErr) {
		return err
	}
	if !errors.Is(err, ErrOwnerNotFound) && !errors.Is(err, ErrTextBlockNotFound) && !errors.Is(err, ErrOwnerWrongProject) && !errors.Is(err, ErrNotFound) {
		return err
	}
	detail := ProjectLayerProposalApplyLinkError{
		ProjectID: projectID,
		Scope:     strings.TrimSpace(req.Scope),
		Mode:      strings.TrimSpace(req.Mode),
		Cause:     err.Error(),
		err:       err,
	}
	if req.Proposal != nil {
		for _, reference := range req.Proposal.CreativeReferences {
			if reference.ID != nil && *reference.ID > 0 {
				detail.CreativeReferenceIDs = append(detail.CreativeReferenceIDs, *reference.ID)
			}
		}
		for _, slot := range req.Proposal.AssetSlots {
			if len(detail.AssetSlots) >= 20 {
				break
			}
			hint := ProjectLayerProposalApplyAssetSlotLinkHint{
				ID:                  slot.ID,
				ClientID:            strings.TrimSpace(slot.ClientID),
				Name:                strings.TrimSpace(slot.Name),
				CreativeReferenceID: slot.CreativeReferenceID,
				ProductionID:        slot.ProductionID,
			}
			if slot.Owner != nil {
				hint.OwnerType = strings.TrimSpace(slot.Owner.Type)
				hint.OwnerID = slot.Owner.ID
				hint.OwnerClientID = strings.TrimSpace(slot.Owner.ClientID)
			}
			detail.AssetSlots = append(detail.AssetSlots, hint)
		}
	}
	detail.Message = fmt.Sprintf("项目层提案应用失败：关联对象无效；project_id=%d scope=%q mode=%q；原因：%s", projectID, detail.Scope, detail.Mode, err.Error())
	return &detail
}

func projectLayerProposalAssetSlotLinkLabel(fields map[string]any) string {
	if ownerType := strings.TrimSpace(fieldString(fields, "owner_type")); ownerType != "" {
		if ownerID := fieldUint(fields, "owner_id"); ownerID != nil {
			return fmt.Sprintf("owner %s #%d", ownerType, *ownerID)
		}
	}
	if referenceID := fieldUint(fields, "creative_reference_id"); referenceID != nil {
		return fmt.Sprintf("creative_reference #%d", *referenceID)
	}
	if productionID := fieldUint(fields, "production_id"); productionID != nil {
		return fmt.Sprintf("production #%d", *productionID)
	}
	if stateID := fieldUint(fields, "creative_reference_state_id"); stateID != nil {
		return fmt.Sprintf("creative_reference_state #%d", *stateID)
	}
	return "unknown owner"
}

func isProjectLayerProposalSoftDeleteStatus(status string) bool {
	switch strings.TrimSpace(status) {
	case "ignored", "waived":
		return true
	default:
		return false
	}
}

func rememberProjectLayerProposalCreativeReferenceID(state *projectLayerProposalApplyState, clientID string, fields map[string]any, id uint) {
	if state == nil || id == 0 {
		return
	}
	for _, key := range []string{
		clientID,
		fieldString(fields, "client_id"),
	} {
		normalized := strings.TrimSpace(key)
		if normalized != "" {
			state.creativeReferenceIDByClientID[normalized] = id
		}
	}
}

func (s *Service) loadPersistedProjectLayerProposalClientIDs(ctx context.Context, projectID uint, state *projectLayerProposalApplyState) error {
	if state == nil {
		return nil
	}
	references, err := s.repo.ListCreativeReferences(ctx, CreativeReferenceFilter{ProjectID: projectID})
	if err != nil {
		return err
	}
	for _, reference := range references {
		if reference.ID == 0 {
			continue
		}
		state.creativeReferenceIDs[reference.ID] = true
		state.creativeReferenceSearchText[reference.ID] = normalizeProjectLayerProposalMatchText(
			strings.Join([]string{reference.Name, reference.Alias, reference.Kind, reference.Description, reference.Content}, " "),
		)
		clientID := strings.TrimSpace(reference.ProposalClientID)
		if clientID == "" {
			continue
		}
		state.creativeReferenceIDByClientID[clientID] = reference.ID
	}
	return nil
}

func rememberProjectLayerProposalCreativeReferenceKeep(state *projectLayerProposalApplyState, id uint) {
	if state == nil || id == 0 {
		return
	}
	state.keptCreativeReferenceIDs[id] = true
}

func rememberProjectLayerProposalAssetSlotKeep(state *projectLayerProposalApplyState, id uint) {
	if state == nil || id == 0 {
		return
	}
	state.keptAssetSlotIDs[id] = true
}

func resolveProjectLayerProposalAssetSlotFields(fields map[string]any, owner *ProjectLayerProposalOwnerRef, state *projectLayerProposalApplyState) (map[string]any, error) {
	next := make(map[string]any, len(fields)+3)
	for key, value := range fields {
		next[key] = value
	}
	if owner != nil {
		ownerType := normalizeProjectLayerProposalOwnerType(owner.Type)
		if strings.TrimSpace(owner.Type) != "" {
			next["owner_type"] = ownerType
		}
		clientID := strings.TrimSpace(owner.ClientID)
		if clientID != "" && state != nil {
			if resolvedID, ok := state.creativeReferenceIDByClientID[clientID]; ok && resolvedID > 0 {
				next["creative_reference_id"] = resolvedID
				next["owner_type"] = "creative_reference"
				next["owner_id"] = resolvedID
				return next, nil
			}
		}
		if owner.ID != nil && *owner.ID > 0 {
			if ownerType == "creative_reference" {
				if state == nil || state.creativeReferenceIDs[*owner.ID] {
					next["owner_id"] = *owner.ID
					next["creative_reference_id"] = *owner.ID
					return next, nil
				}
				if resolvedID := resolveProjectLayerProposalAssetSlotReferenceByText(fields, state); resolvedID > 0 {
					next["owner_id"] = resolvedID
					next["owner_type"] = "creative_reference"
					next["creative_reference_id"] = resolvedID
					return next, nil
				}
			}
			next["owner_id"] = *owner.ID
			if ownerType == "creative_reference" {
				next["creative_reference_id"] = *owner.ID
			}
			return next, nil
		}
	}
	clientID := ""
	if owner != nil {
		clientID = strings.TrimSpace(owner.ClientID)
	}
	if clientID == "" {
		return next, nil
	}
	if state == nil || len(state.creativeReferenceIDByClientID) == 0 {
		return nil, ErrInvalidInput{Err: fmt.Errorf("asset slot owner client_id %q cannot be resolved in this apply; use backend id from the latest snapshot", clientID)}
	}
	resolvedID, ok := state.creativeReferenceIDByClientID[clientID]
	if !ok || resolvedID == 0 {
		return nil, ErrInvalidInput{Err: fmt.Errorf("asset slot owner client_id %q cannot be resolved in this apply; use backend id from the latest snapshot", clientID)}
	}
	next["creative_reference_id"] = resolvedID
	next["owner_type"] = "creative_reference"
	next["owner_id"] = resolvedID
	return next, nil
}

func resolveProjectLayerProposalAssetSlotReferenceByText(fields map[string]any, state *projectLayerProposalApplyState) uint {
	if state == nil || len(state.creativeReferenceSearchText) == 0 {
		return 0
	}
	slotText := normalizeProjectLayerProposalMatchText(strings.Join([]string{
		fieldString(fields, "name"),
		fieldString(fields, "description"),
		fieldString(fields, "kind"),
		fieldString(fields, "prompt_hint"),
	}, " "))
	if slotText == "" {
		return 0
	}
	if resolvedID := uniqueProjectLayerProposalReferenceTextMatch(slotText, state, func(referenceText string) bool {
		for _, token := range []string{"女主", "男主", "萌宝", "女配", "男配", "爷爷", "奶奶", "父亲", "母亲", "反派"} {
			if strings.Contains(slotText, token) && strings.Contains(referenceText, token) {
				return true
			}
		}
		return false
	}); resolvedID > 0 {
		return resolvedID
	}
	return uniqueProjectLayerProposalReferenceTextMatch(slotText, state, func(referenceText string) bool {
		return referenceText != "" && strings.Contains(slotText, referenceText)
	})
}

func uniqueProjectLayerProposalReferenceTextMatch(slotText string, state *projectLayerProposalApplyState, matches func(referenceText string) bool) uint {
	var resolvedID uint
	for id, referenceText := range state.creativeReferenceSearchText {
		if !matches(referenceText) {
			continue
		}
		if resolvedID != 0 {
			return 0
		}
		resolvedID = id
	}
	return resolvedID
}

func normalizeProjectLayerProposalMatchText(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return unicode.ToLower(r)
	}, strings.TrimSpace(value))
}

func normalizeProjectLayerProposalOwnerType(value string) string {
	switch strings.TrimSpace(value) {
	default:
		return strings.TrimSpace(value)
	}
}

func (patch ProjectLayerProposalCreativeReferencePatch) fields() map[string]any {
	fields := make(map[string]any)
	if strings.TrimSpace(patch.ClientID) != "" {
		fields["proposal_client_id"] = patch.ClientID
	}
	if patch.SourceScriptID != nil {
		fields["source_script_id"] = *patch.SourceScriptID
	}
	if patch.SourceAnalysisID != nil {
		fields["source_analysis_id"] = *patch.SourceAnalysisID
	}
	if strings.TrimSpace(patch.Kind) != "" {
		fields["kind"] = patch.Kind
	}
	if strings.TrimSpace(patch.Name) != "" {
		fields["name"] = patch.Name
	}
	if strings.TrimSpace(patch.Alias) != "" {
		fields["alias"] = patch.Alias
	}
	if strings.TrimSpace(patch.Description) != "" {
		fields["description"] = patch.Description
	}
	if strings.TrimSpace(patch.Content) != "" {
		fields["content"] = patch.Content
	}
	if strings.TrimSpace(patch.Importance) != "" {
		fields["importance"] = patch.Importance
	}
	if strings.TrimSpace(patch.Status) != "" {
		fields["status"] = patch.Status
	}
	if strings.TrimSpace(patch.ProfileJSON) != "" {
		fields["profile_json"] = patch.ProfileJSON
	}
	if strings.TrimSpace(patch.TagsJSON) != "" {
		fields["tags_json"] = patch.TagsJSON
	}
	return fields
}

func (patch ProjectLayerProposalAssetSlotPatch) fields() map[string]any {
	fields := make(map[string]any)
	if patch.ProductionID != nil {
		fields["production_id"] = *patch.ProductionID
	}
	if patch.CreativeReferenceID != nil {
		fields["creative_reference_id"] = *patch.CreativeReferenceID
	}
	if patch.CreativeReferenceStateID != nil {
		fields["creative_reference_state_id"] = *patch.CreativeReferenceStateID
	}
	if strings.TrimSpace(patch.OwnerType) != "" {
		fields["owner_type"] = patch.OwnerType
	}
	if patch.OwnerID != nil {
		fields["owner_id"] = *patch.OwnerID
	}
	if strings.TrimSpace(patch.Kind) != "" {
		fields["kind"] = patch.Kind
	}
	if strings.TrimSpace(patch.Name) != "" {
		fields["name"] = patch.Name
	}
	if strings.TrimSpace(patch.Description) != "" {
		fields["description"] = patch.Description
	}
	if strings.TrimSpace(patch.SlotKey) != "" {
		fields["slot_key"] = patch.SlotKey
	}
	if strings.TrimSpace(patch.PromptHint) != "" {
		fields["prompt_hint"] = patch.PromptHint
	}
	if strings.TrimSpace(patch.Status) != "" {
		fields["status"] = patch.Status
	}
	if strings.TrimSpace(patch.Priority) != "" {
		fields["priority"] = patch.Priority
	}
	if strings.TrimSpace(patch.MetadataJSON) != "" {
		fields["metadata_json"] = patch.MetadataJSON
	}
	return fields
}

func creativeReferenceInputFromProposalFields(fields map[string]any) (CreativeReferenceInput, error) {
	return CreativeReferenceInput{
		ProposalClientID: fieldString(fields, "proposal_client_id"),
		SourceScriptID:   fieldUint(fields, "source_script_id"),
		SourceAnalysisID: fieldUint(fields, "source_analysis_id"),
		Kind:             fieldString(fields, "kind"),
		Name:             fieldString(fields, "name"),
		Alias:            fieldString(fields, "alias"),
		Description:      fieldString(fields, "description"),
		Content:          fieldString(fields, "content"),
		Importance:       fieldString(fields, "importance"),
		Status:           fieldString(fields, "status"),
		ProfileJSON:      fieldString(fields, "profile_json"),
		TagsJSON:         fieldString(fields, "tags_json"),
	}, nil
}

func assetSlotInputFromProposalFields(fields map[string]any) (AssetSlotInput, error) {
	return AssetSlotInput{
		ProductionID:             fieldUint(fields, "production_id"),
		CreativeReferenceID:      fieldUint(fields, "creative_reference_id"),
		CreativeReferenceStateID: fieldUint(fields, "creative_reference_state_id"),
		OwnerType:                normalizeProjectLayerProposalOwnerType(fieldString(fields, "owner_type")),
		OwnerID:                  fieldUint(fields, "owner_id"),
		Kind:                     fieldString(fields, "kind"),
		Name:                     fieldString(fields, "name"),
		Description:              fieldString(fields, "description"),
		SlotKey:                  fieldString(fields, "slot_key"),
		PromptHint:               fieldString(fields, "prompt_hint"),
		Status:                   fieldString(fields, "status"),
		Priority:                 fieldString(fields, "priority"),
		MetadataJSON:             fieldString(fields, "metadata_json"),
	}, nil
}

func assetSlotPatchInputFromProposalFields(fields map[string]any) (PatchAssetSlotInput, error) {
	return PatchAssetSlotInput{
		ProductionID:             fieldUint(fields, "production_id"),
		CreativeReferenceID:      fieldUint(fields, "creative_reference_id"),
		CreativeReferenceStateID: fieldUint(fields, "creative_reference_state_id"),
		OwnerType:                normalizeProjectLayerProposalOwnerType(fieldString(fields, "owner_type")),
		OwnerID:                  fieldUint(fields, "owner_id"),
		Kind:                     fieldString(fields, "kind"),
		Name:                     fieldString(fields, "name"),
		Description:              fieldString(fields, "description"),
		SlotKey:                  fieldString(fields, "slot_key"),
		PromptHint:               fieldString(fields, "prompt_hint"),
		Status:                   fieldString(fields, "status"),
		Priority:                 fieldString(fields, "priority"),
		MetadataJSON:             fieldString(fields, "metadata_json"),
	}, nil
}

func fieldString(fields map[string]any, key string) string {
	value, ok := fields[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 64)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case uint:
		return strconv.FormatUint(uint64(typed), 10)
	default:
		return fmt.Sprint(value)
	}
}

func firstFieldString(fields map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(fieldString(fields, key)); value != "" {
			return value
		}
	}
	return ""
}

func fieldUint(fields map[string]any, key string) *uint {
	value, ok := fields[key]
	if !ok || value == nil {
		return nil
	}
	switch typed := value.(type) {
	case float64:
		if typed <= 0 {
			return nil
		}
		u := uint(typed)
		return &u
	case float32:
		if typed <= 0 {
			return nil
		}
		u := uint(typed)
		return &u
	case int:
		if typed <= 0 {
			return nil
		}
		u := uint(typed)
		return &u
	case int64:
		if typed <= 0 {
			return nil
		}
		u := uint(typed)
		return &u
	case uint:
		if typed == 0 {
			return nil
		}
		u := typed
		return &u
	case uint64:
		if typed == 0 {
			return nil
		}
		u := uint(typed)
		return &u
	case string:
		parsed, err := strconv.ParseUint(strings.TrimSpace(typed), 10, 64)
		if err != nil || parsed == 0 {
			return nil
		}
		u := uint(parsed)
		return &u
	default:
		return nil
	}
}

func assetSlotMergeKey(slot domainsemantic.AssetSlot) string {
	ownerID := ""
	if slot.OwnerID != nil {
		ownerID = fmt.Sprint(*slot.OwnerID)
	}
	return strings.Join([]string{
		strings.ToLower(strings.TrimSpace(slot.Kind)),
		strings.ToLower(strings.TrimSpace(slot.Name)),
		strings.ToLower(strings.TrimSpace(slot.OwnerType)),
		ownerID,
	}, ":")
}

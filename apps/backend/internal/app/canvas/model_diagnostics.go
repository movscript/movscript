package canvas

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
	"github.com/movscript/movscript/internal/infra/ai"
)

type nodeData = canvasdomain.NodeData

type NodeModelDiagnostics struct {
	CanvasID            uint                       `json:"canvas_id"`
	NodeID              string                     `json:"node_id"`
	NodeLabel           string                     `json:"node_label"`
	NodeType            string                     `json:"node_type"`
	Capability          string                     `json:"capability,omitempty"`
	Status              string                     `json:"status"`
	Problems            []string                   `json:"problems,omitempty"`
	NextActions         []string                   `json:"next_actions,omitempty"`
	RawModelFields      map[string]any             `json:"raw_model_fields,omitempty"`
	DataModelID         string                     `json:"data_model_id,omitempty"`
	DataModelDbID       uint                       `json:"data_model_db_id,omitempty"`
	Executable          bool                       `json:"executable"`
	ExecutableModelID   string                     `json:"executable_model_id,omitempty"`
	ExecutableModelDbID uint                       `json:"executable_model_db_id,omitempty"`
	AvailableModelCount int                        `json:"available_model_count"`
	AvailableModels     []NodeModelDiagnosticModel `json:"available_models,omitempty"`
	Route               *NodeModelDiagnosticRoute  `json:"route,omitempty"`
}

type NodeModelDiagnosticModel struct {
	ID           uint     `json:"id"`
	ModelID      string   `json:"model_id"`
	DisplayName  string   `json:"display_name"`
	IsDefault    bool     `json:"is_default,omitempty"`
	Capabilities []string `json:"capabilities,omitempty"`
}

type NodeModelDiagnosticRoute struct {
	ModelID         string `json:"model_id"`
	ModelConfigID   uint   `json:"model_config_id"`
	ProviderModelID string `json:"provider_model_id,omitempty"`
	SelectionReason string `json:"selection_reason,omitempty"`
}

func (h *Service) DiagnoseNodeModel(ctx context.Context, canvasID uint, nodeID string) (NodeModelDiagnostics, error) {
	node, err := h.getNode(ctx, canvasID, nodeID)
	if err != nil {
		return NodeModelDiagnostics{}, err
	}

	diag := NodeModelDiagnostics{
		CanvasID:   canvasID,
		NodeID:     node.NodeID,
		NodeLabel:  node.Label,
		NodeType:   node.Type,
		Status:     "unknown",
		Executable: false,
	}

	var raw map[string]any
	if strings.TrimSpace(node.Data) != "" {
		if err := json.Unmarshal([]byte(node.Data), &raw); err != nil {
			diag.Status = "invalid_node_data"
			diag.Problems = append(diag.Problems, fmt.Sprintf("node data is not valid JSON: %v", err))
			diag.NextActions = append(diag.NextActions, "Save the canvas again or inspect the persisted canvas_nodes.data value for this node.")
			return diag, nil
		}
		diag.RawModelFields = rawModelFields(raw)
	}

	var nd nodeData
	if strings.TrimSpace(node.Data) != "" {
		if err := json.Unmarshal([]byte(node.Data), &nd); err != nil {
			return diag, nil
		}
	}
	diag.DataModelID = strings.TrimSpace(nd.ModelID)
	diag.DataModelDbID = nd.ModelDbID

	if nd.ExecutableSpec != nil {
		diag.Executable = true
		diag.Capability = strings.TrimSpace(nd.ExecutableSpec.Capability)
		diag.ExecutableModelID = strings.TrimSpace(nd.ExecutableSpec.ModelID)
		diag.ExecutableModelDbID = nd.ExecutableSpec.ModelDbID
		h.fillAvailableModels(ctx, &diag)
		h.diagnoseExecutableSpecRoute(ctx, &diag, nd.ExecutableSpec)
		return diag, nil
	}

	diag.Capability = capabilityForCanvasNodeType(node.Type, nd.OutputType)
	h.fillAvailableModels(ctx, &diag)
	h.diagnoseNodeRoute(ctx, &diag, nd)
	return diag, nil
}

func (h *Service) diagnoseNodeRoute(_ context.Context, diag *NodeModelDiagnostics, nd nodeData) {
	if diag.Capability == "" {
		diag.Status = "not_applicable"
		diag.Problems = append(diag.Problems, fmt.Sprintf("node type %q does not route through an AI model", diag.NodeType))
		return
	}
	if h.svc == nil {
		diag.Status = "ai_service_unavailable"
		diag.Problems = append(diag.Problems, "AI service is not configured in this process")
		return
	}

	modelID := strings.TrimSpace(nd.ModelID)
	if modelID == "" && nd.ModelDbID == 0 {
		diag.Status = "missing_model_selection"
		diag.Problems = append(diag.Problems, "node data has empty modelId and modelDbId")
		addRawFieldProblems(diag)
		diag.NextActions = append(diag.NextActions, fmt.Sprintf("Select a model that supports capability %q.", diag.Capability))
		return
	}

	route, err := h.svc.ResolveModelRoute(ai.ModelRouteRequest{
		ModelID:       modelID,
		ModelConfigID: nd.ModelDbID,
		Capability:    diag.Capability,
	})
	if err != nil {
		diag.Status = "route_error"
		diag.Problems = append(diag.Problems, err.Error())
		diag.NextActions = append(diag.NextActions, "Check that the selected model is enabled, its credential is enabled, and it supports the required capability.")
		return
	}
	setDiagnosticRoute(diag, route)
}

func (h *Service) diagnoseExecutableSpecRoute(_ context.Context, diag *NodeModelDiagnostics, spec *canvasdomain.ExecutableSpec) {
	if diag.Capability == "" {
		diag.Status = "missing_capability"
		diag.Problems = append(diag.Problems, "executableSpec.capability is empty")
		return
	}
	if h.svc == nil {
		diag.Status = "ai_service_unavailable"
		diag.Problems = append(diag.Problems, "AI service is not configured in this process")
		return
	}

	modelID := strings.TrimSpace(spec.ModelID)
	modelDbID := spec.ModelDbID
	if modelID == "" && modelDbID == 0 {
		diag.Status = "missing_model_selection"
		diag.Problems = append(diag.Problems, "executableSpec has empty modelId and modelDbId")
		diag.NextActions = append(diag.NextActions, "Set executableSpec.modelId when creating this node.")
		return
	}

	route, err := h.svc.ResolveModelRoute(ai.ModelRouteRequest{
		ModelID:       modelID,
		ModelConfigID: modelDbID,
		Capability:    diag.Capability,
	})
	if err != nil {
		diag.Status = "route_error"
		diag.Problems = append(diag.Problems, err.Error())
		return
	}
	setDiagnosticRoute(diag, route)
}

func (h *Service) fillAvailableModels(_ context.Context, diag *NodeModelDiagnostics) {
	if h.svc == nil || diag.Capability == "" {
		return
	}
	var (
		models []ai.PublicModel
		err    error
	)
	models, err = h.svc.GetModelsByCapability(diag.Capability)
	if err != nil {
		diag.Problems = append(diag.Problems, fmt.Sprintf("failed to list available models: %v", err))
		return
	}
	diag.AvailableModelCount = len(models)
	limit := len(models)
	if limit > 10 {
		limit = 10
	}
	diag.AvailableModels = make([]NodeModelDiagnosticModel, 0, limit)
	for _, model := range models[:limit] {
		diag.AvailableModels = append(diag.AvailableModels, NodeModelDiagnosticModel{
			ID:           model.ID,
			ModelID:      model.ModelID,
			DisplayName:  model.DisplayName,
			IsDefault:    model.IsDefault,
			Capabilities: model.Capabilities,
		})
	}
}

func setDiagnosticRoute(diag *NodeModelDiagnostics, route ai.ModelRoute) {
	diag.Status = "ok"
	diag.Route = &NodeModelDiagnosticRoute{
		ModelID:         route.ModelID,
		ModelConfigID:   route.ModelConfigID,
		ProviderModelID: route.ProviderModelID,
		SelectionReason: route.SelectionReason,
	}
}

func rawModelFields(raw map[string]any) map[string]any {
	keys := []string{"modelId", "modelDbId", "model_id", "model_db_id", "modelConfigId", "model_config_id"}
	out := map[string]any{}
	for _, key := range keys {
		if value, ok := raw[key]; ok {
			out[key] = value
		}
	}
	if spec, ok := raw["executableSpec"].(map[string]any); ok {
		for _, key := range keys {
			if value, ok := spec[key]; ok {
				out["executableSpec."+key] = value
			}
		}
		if value, ok := spec["capability"]; ok {
			out["executableSpec.capability"] = value
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func addRawFieldProblems(diag *NodeModelDiagnostics) {
	if diag.RawModelFields == nil {
		return
	}
	if _, ok := diag.RawModelFields["model_id"]; ok {
		diag.Problems = append(diag.Problems, "node data contains model_id, but canvas runtime expects camelCase modelId")
	}
	if _, ok := diag.RawModelFields["model_db_id"]; ok {
		diag.Problems = append(diag.Problems, "node data contains model_db_id, but canvas runtime expects camelCase modelDbId")
	}
	if _, ok := diag.RawModelFields["modelConfigId"]; ok {
		diag.Problems = append(diag.Problems, "node data contains modelConfigId, but canvas runtime expects modelDbId")
	}
	if _, ok := diag.RawModelFields["model_config_id"]; ok {
		diag.Problems = append(diag.Problems, "node data contains model_config_id, but canvas runtime expects modelDbId")
	}
}

func generationKindForCanvasNode(nodeType string, nd nodeData) string {
	if nodeType == "ai_gen" {
		switch strings.TrimSpace(nd.OutputType) {
		case "text", "video", "audio":
			return strings.TrimSpace(nd.OutputType)
		default:
			return "image"
		}
	}
	switch nodeType {
	case "text", "text_gen":
		return "text"
	case "image", "ref_image_gen", "multi_angle", "style_transfer":
		return "image"
	case "video", "ref_video_gen", "motion_imitation":
		return "video"
	case "audio":
		return "audio"
	default:
		return ""
	}
}

func capabilityForCanvasNodeType(nodeType string, outputType ...string) string {
	kind := generationKindForCanvasNode(nodeType, nodeData{OutputType: firstOptionalString(outputType)})
	switch kind {
	case "text":
		return ai.CapabilityText
	case "image":
		return ai.CapabilityImage
	case "video":
		return ai.CapabilityVideo
	default:
		return ""
	}
}

func firstOptionalString(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

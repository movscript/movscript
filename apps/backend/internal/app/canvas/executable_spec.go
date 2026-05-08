package canvas

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

func (h *Service) executeExecutableSpec(ctx context.Context, user *persistencemodel.User, node *persistencemodel.CanvasNode, task *persistencemodel.CanvasTask, nd nodeData, portInputs canvasPortInputMap) {
	spec := nd.ExecutableSpec
	if spec == nil {
		h.failTask(task, node, nd, "missing executable spec")
		return
	}
	if spec.Executor == "plugin_http" {
		h.executeHTTPPluginSpec(ctx, user, node, task, nd, portInputs)
		return
	}
	if spec.Executor != "ai_model" {
		h.failTask(task, node, nd, "unsupported executable executor")
		return
	}
	modelDbID := spec.ModelDbID
	if modelDbID == 0 && strings.TrimSpace(spec.FeatureKey) != "" {
		resolvedID, _, err := h.svc.GetForFeature(spec.FeatureKey)
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		modelDbID = resolvedID
	}
	if modelDbID == 0 {
		h.failTask(task, node, nd, "no model selected for executable spec")
		return
	}

	specData := nodeData{
		InputResourceIDs: spec.InputResourceIDs,
	}
	upstreamResources := portInputs.Flatten()
	inputResourceIDs, inputResources, err := h.loadCanvasInputResourceRows(ctx, specData, upstreamResources)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return
	}
	imageData, videoData := h.mediaDataFromCanvasResources(ctx, inputResourceIDs, inputResources)
	prompt := strings.TrimSpace(spec.Prompt)
	if prompt == "" && spec.Params != nil {
		if v, ok := spec.Params["prompt"].(string); ok {
			prompt = strings.TrimSpace(v)
		}
	}
	params := spec.Params
	if params == nil {
		params = map[string]any{}
	}

	var resultURL, mimeType, resType string
	switch spec.Capability {
	case "text":
		if prompt == "" {
			h.failTask(task, node, nd, "prompt is required")
			return
		}
		maxTokens := intParam(params, "max_tokens", ai.DefaultTextMaxTokens)
		textReq := ai.TextRequest{
			PromptName:  "canvas_executable_text",
			Messages:    []ai.Message{{Role: "user", Content: prompt}},
			MaxTokens:   maxTokens,
			Temperature: float32(floatParam(params, "temperature", -1)),
			JSONMode:    boolParam(params, "json_mode", false),
			ExtraParams: params,
		}
		if _, err := h.svc.PreflightText(modelDbID, &textReq); err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		resp, err := h.svc.CallTextWithUsage(ctx, user.ID, modelDbID, textReq, h.usageContextForNode(ctx, node, task))
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		h.completeInlineTextTask(task, node, nd, resp.Content)
		return

	case "image", "image_edit":
		if prompt == "" {
			h.failTask(task, node, nd, "prompt is required")
			return
		}
		preflight, err := h.svc.PreflightGeneration(ai.GenerationPreflightRequest{
			ModelConfigID: modelDbID,
			OutputType:    spec.Capability,
			ExtraParams:   MarshalParamsForPreflight(params),
			AspectRatio:   spec.AspectRatio,
			ImageCount:    len(imageData),
		})
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		params = ai.NormalizeGenerationParams(preflight.NormalizedParams)
		seed := int64PtrParam(params, "seed")
		watermark := boolPtrParam(params, "watermark")
		resp, err := h.svc.CallImageWithUsage(ctx, user.ID, modelDbID, ai.ImageRequest{
			Prompt:              prompt,
			N:                   intParam(params, "n", 1),
			Quality:             stringParam(params, "quality", ""),
			Size:                stringParam(params, "size", stringParam(params, "image_size", "")),
			Style:               stringParam(params, "style", ""),
			AspectRatio:         canvasruntime.FirstNonEmptyString(spec.AspectRatio, stringParam(params, "aspect_ratio", "")),
			Seed:                seed,
			GuidanceScale:       floatParam(params, "guidance_scale", 0),
			Watermark:           watermark,
			OutputFormat:        stringParam(params, "output_format", ""),
			SequentialMode:      stringParam(params, "sequential_image_generation", stringParam(params, "sequential_mode", "")),
			SequentialMaxImages: intParam(params, "max_images", intParam(params, "sequential_max_images", 0)),
			WebSearch:           boolParam(params, "web_search", false),
			OptimizePromptMode:  stringParam(params, "optimize_prompt_mode", ""),
			InputImageDataList:  imageData,
			EditOnly:            spec.Capability == "image_edit",
		}, h.usageContextForNode(ctx, node, task))
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		if len(resp.URLs) == 0 {
			h.failTask(task, node, nd, "no image returned")
			return
		}
		resultURL, mimeType, resType = resp.URLs[0], "image/png", "image"

	case "video", "video_i2v", "video_v2v":
		if prompt == "" {
			h.failTask(task, node, nd, "prompt is required")
			return
		}
		duration := firstPositive(spec.Duration, intParam(params, "duration", 0))
		preflight, err := h.svc.PreflightGeneration(ai.GenerationPreflightRequest{
			ModelConfigID: modelDbID,
			OutputType:    spec.Capability,
			ExtraParams:   MarshalParamsForPreflight(params),
			AspectRatio:   spec.AspectRatio,
			Duration:      duration,
			ImageCount:    len(imageData),
			VideoCount:    len(videoData),
		})
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		if err := h.requireImageVerification(preflight.Def, inputResources); err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		params = ai.NormalizeGenerationParams(preflight.NormalizedParams)
		videoReq := ai.VideoRequest{
			Prompt:                prompt,
			InputImageDataList:    imageData,
			Duration:              duration,
			Frames:                intParam(params, "frames", 0),
			Seed:                  int64PtrParam(params, "seed"),
			Width:                 intParam(params, "width", 0),
			Height:                intParam(params, "height", 0),
			AspectRatio:           canvasruntime.FirstNonEmptyString(spec.AspectRatio, stringParam(params, "aspect_ratio", "")),
			Ratio:                 stringParam(params, "ratio", ""),
			Quality:               stringParam(params, "quality", ""),
			Size:                  stringParam(params, "size", stringParam(params, "image_size", "")),
			ResolutionName:        stringParam(params, "resolution", stringParam(params, "resolution_name", "")),
			Preset:                stringParam(params, "preset", ""),
			CameraFixed:           boolPtrParam(params, "camera_fixed"),
			Watermark:             boolPtrParam(params, "watermark"),
			GenerateAudio:         boolPtrParam(params, "generate_audio"),
			ReturnLastFrame:       boolPtrParam(params, "return_last_frame"),
			ServiceTier:           stringParam(params, "service_tier", ""),
			ExecutionExpiresAfter: intParam(params, "execution_expires_after", 0),
			Draft:                 boolPtrParam(params, "draft"),
			WebSearch:             boolParam(params, "web_search", false),
		}
		if len(videoData) > 0 {
			videoReq.InputVideoData = &videoData[0]
		}
		resp, err := h.svc.CallVideoWithUsage(ctx, user.ID, modelDbID, videoReq, h.usageContextForNode(ctx, node, task))
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		resultURL = resp.URL
		if resultURL == "" {
			resultURL = resp.TaskID
		}
		mimeType, resType = "video/mp4", "video"

	default:
		h.failTask(task, node, nd, "unsupported executable capability")
		return
	}

	r, err := h.createCanvasResourceFromSource(ctx, user.ID, h.orgIDForNode(ctx, node), fmt.Sprintf("generated_%s_%d.%s", resType, task.ID, canvasExtFromMime(mimeType)), resultURL, mimeType)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return
	}

	_ = h.updateTaskRow(ctx, task, canvasruntime.CompleteCanvasTask(task, &nd, &r.ID))
	value := canvasruntime.PortValueFromResource(&r.ID, resType)
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		canvasruntime.DefaultSourceHandleForNode(node.Type, nd): value,
		"": value,
	})
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func MarshalParamsForPreflight(params map[string]any) string {
	return canvasruntime.MarshalParamsForPreflight(params)
}

type pluginHTTPRuntimeSpec struct {
	Kind     string `json:"kind"`
	Endpoint string `json:"endpoint"`
	Method   string `json:"method"`
	Timeout  int    `json:"timeout"`
}

func (h *Service) executeHTTPPluginSpec(ctx context.Context, user *persistencemodel.User, node *persistencemodel.CanvasNode, task *persistencemodel.CanvasTask, nd nodeData, portInputs canvasPortInputMap) {
	spec := nd.ExecutableSpec
	if spec == nil || strings.TrimSpace(spec.PluginToolKey) == "" {
		h.failTask(task, node, nd, "plugin tool key is required")
		return
	}

	tool, err := h.canvasRepo().FindEnabledPluginTool(ctx, spec.PluginToolKey)
	if err != nil {
		h.failTask(task, node, nd, "plugin tool not found")
		return
	}
	if tool.Plugin == nil || !tool.Plugin.Trusted {
		h.failTask(task, node, nd, "plugin_http executor requires a trusted plugin")
		return
	}

	var runtime pluginHTTPRuntimeSpec
	if err := json.Unmarshal([]byte(tool.Runtime), &runtime); err != nil {
		h.failTask(task, node, nd, "invalid plugin runtime")
		return
	}
	if runtime.Kind != "http" {
		h.failTask(task, node, nd, "plugin tool is not an http runtime")
		return
	}
	if strings.TrimSpace(runtime.Endpoint) == "" {
		h.failTask(task, node, nd, "plugin http endpoint is required")
		return
	}
	method := strings.ToUpper(strings.TrimSpace(runtime.Method))
	if method == "" {
		method = http.MethodPost
	}
	if method != http.MethodPost {
		h.failTask(task, node, nd, "plugin_http executor currently supports POST only")
		return
	}
	timeout := time.Duration(firstPositive(runtime.Timeout, 30)) * time.Second
	callCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	body, _ := json.Marshal(map[string]any{
		"tool_key":           tool.ToolKey,
		"plugin_key":         tool.Plugin.PluginKey,
		"params":             spec.Params,
		"inputs":             portInputs,
		"input_resource_ids": portInputs.Flatten(),
		"canvas_node_id":     node.NodeID,
		"task_id":            task.ID,
		"user_id":            user.ID,
	})
	req, err := http.NewRequestWithContext(callCtx, method, runtime.Endpoint, bytes.NewReader(body))
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		h.failTask(task, node, nd, fmt.Sprintf("plugin http runtime returned %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody))))
		return
	}

	outputs := PluginHTTPOutputs(respBody)
	if len(outputs) == 0 {
		h.failTask(task, node, nd, "plugin http runtime returned no outputs")
		return
	}
	h.completeInlineValueTask(task, node, nd, outputs)
}

func PluginHTTPOutputs(raw []byte) map[string]canvasPortValue {
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		text := strings.TrimSpace(string(raw))
		if text == "" {
			return nil
		}
		value := canvasPortValue{Type: "text", Text: text}
		return map[string]canvasPortValue{"result": value}
	}
	outputs := map[string]canvasPortValue{}
	if rawOutputs, ok := payload["outputs"].(map[string]any); ok {
		for handle, rawValue := range rawOutputs {
			value := canvasruntime.PortValueFromAny(rawValue)
			if !canvasruntime.PortValueEmpty(value) {
				outputs[handle] = value
			}
		}
	}
	if len(outputs) == 0 {
		for _, key := range []string{"result", "value", "data", "content"} {
			if rawValue, ok := payload[key]; ok {
				value := canvasruntime.PortValueFromAny(rawValue)
				if !canvasruntime.PortValueEmpty(value) {
					outputs["result"] = value
					break
				}
			}
		}
	}
	return outputs
}

package canvas

import (
	"context"
	"fmt"
	"strings"
	"time"

	canvasdomain "github.com/movscript/movscript/internal/domain/canvas"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

type nodeData = canvasdomain.NodeData
type canvasPortValue = canvasdomain.PortValue
type canvasPortInputMap = canvasdomain.PortInputMap

func (h *Service) executeTask(user *persistencemodel.User, node *persistencemodel.CanvasNode, task *persistencemodel.CanvasTask, nd nodeData, portInputs canvasPortInputMap) {
	_ = h.updateTaskRow(context.Background(), task, canvasdomain.StartCanvasTask(task, &nd))
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	resolvedPrompt, mentionIDs := resolveCanvasMentions(nd.Prompt)
	nd.Prompt = resolvedPrompt
	if len(mentionIDs) > 0 {
		nd.InputResourceIDs = append(nd.InputResourceIDs, mentionIDs...)
	}

	upstreamResources := portInputs.Flatten()
	var resultURL, mimeType, resType string
	inputResourceIDs, inputResources, err := h.loadCanvasInputResourceRows(ctx, nd, upstreamResources)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return
	}
	imageData, videoData := h.mediaDataFromCanvasResources(ctx, inputResourceIDs, inputResources)

	if nd.ExecutableSpec != nil {
		h.executeExecutableSpec(ctx, user, node, task, nd, portInputs)
		return
	}

	if node.Type == "canvas" {
		h.completeCanvasReferenceTask(ctx, task, node, nd, user, portInputs)
		return
	}

	modelDbID, err := h.resolveCanvasNodeModelConfigID(nd, node.Type)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return
	}

	switch node.Type {
	case "text":
		if modelDbID == 0 {
			h.failTask(task, node, nd, "no model selected for this node")
			return
		}
		textReq := ai.TextRequest{
			PromptName:  "canvas_text",
			Messages:    []ai.Message{{Role: "user", Content: nd.Prompt}},
			MaxTokens:   canvasdomain.IntParam(nd.Params, "max_tokens", ai.DefaultTextMaxTokens),
			Temperature: float32(canvasdomain.FloatParam(nd.Params, "temperature", -1)),
			JSONMode:    canvasdomain.BoolParam(nd.Params, "json_mode", false),
			ExtraParams: nd.Params,
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

	case "image", "ref_image_gen", "multi_angle", "style_transfer":
		if modelDbID == 0 {
			h.failTask(task, node, nd, "no model selected for this node")
			return
		}
		resp, err := h.svc.CallImageWithUsage(ctx, user.ID, modelDbID, ai.ImageRequest{
			Prompt:              nd.Prompt,
			N:                   1,
			Quality:             canvasdomain.StringParam(nd.Params, "quality", ""),
			Size:                canvasdomain.StringParam(nd.Params, "size", canvasdomain.StringParam(nd.Params, "image_size", "")),
			Style:               canvasdomain.StringParam(nd.Params, "style", ""),
			AspectRatio:         canvasdomain.StringParam(nd.Params, "aspect_ratio", ""),
			Seed:                canvasdomain.Int64PtrParam(nd.Params, "seed"),
			GuidanceScale:       canvasdomain.FloatParam(nd.Params, "guidance_scale", 0),
			Watermark:           canvasdomain.BoolPtrParam(nd.Params, "watermark"),
			OutputFormat:        canvasdomain.StringParam(nd.Params, "output_format", ""),
			SequentialMaxImages: canvasdomain.IntParam(nd.Params, "max_images", 0),
			InputImageDataList:  imageData,
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

	case "video", "ref_video_gen", "motion_imitation":
		if modelDbID == 0 {
			h.failTask(task, node, nd, "no model selected for this node")
			return
		}
		videoDef, err := h.svc.GetVideoModelDef(modelDbID)
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		if err := h.requireImageVerification(videoDef, inputResources); err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		videoReq := ai.VideoRequest{
			Prompt:             nd.Prompt,
			InputImageDataList: imageData,
			Duration:           canvasdomain.IntParam(nd.Params, "duration", 0),
			Frames:             canvasdomain.IntParam(nd.Params, "frames", 0),
			Seed:               canvasdomain.Int64PtrParam(nd.Params, "seed"),
			Width:              canvasdomain.IntParam(nd.Params, "width", 0),
			Height:             canvasdomain.IntParam(nd.Params, "height", 0),
			AspectRatio:        canvasdomain.StringParam(nd.Params, "aspect_ratio", ""),
			Ratio:              canvasdomain.StringParam(nd.Params, "ratio", ""),
			Quality:            canvasdomain.StringParam(nd.Params, "quality", ""),
			Size:               canvasdomain.StringParam(nd.Params, "size", canvasdomain.StringParam(nd.Params, "image_size", "")),
			ResolutionName:     canvasdomain.StringParam(nd.Params, "resolution", canvasdomain.StringParam(nd.Params, "resolution_name", "")),
			Preset:             canvasdomain.StringParam(nd.Params, "preset", ""),
			CameraFixed:        canvasdomain.BoolPtrParam(nd.Params, "camera_fixed"),
			Watermark:          canvasdomain.BoolPtrParam(nd.Params, "watermark"),
			GenerateAudio:      canvasdomain.BoolPtrParam(nd.Params, "generate_audio"),
			ReturnLastFrame:    canvasdomain.BoolPtrParam(nd.Params, "return_last_frame"),
			ServiceTier:        canvasdomain.StringParam(nd.Params, "service_tier", ""),
			Draft:              canvasdomain.BoolPtrParam(nd.Params, "draft"),
			WebSearch:          canvasdomain.BoolParam(nd.Params, "web_search", false),
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
			resultURL = resp.TaskID // async providers return a task ID
		}
		mimeType, resType = "video/mp4", "video"

	case "audio":
		h.failTask(task, node, nd, "audio generation not yet supported")
		return

	default:
		h.failTask(task, node, nd, "unknown node type")
		return
	}

	r, err := h.createCanvasResourceFromSource(ctx, user.ID, h.orgIDForNode(ctx, node), fmt.Sprintf("generated_%s_%d.%s", resType, task.ID, canvasExtFromMime(mimeType)), resultURL, mimeType)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return
	}

	_ = h.updateTaskRow(ctx, task, canvasdomain.CompleteCanvasTask(task, &nd, &r.ID))
	value := canvasdomain.PortValueFromResource(&r.ID, resType)
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		canvasdomain.DefaultSourceHandleForNode(node.Type, nd): value,
		"": value,
	})
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *Service) completeInlineTextTask(task *persistencemodel.CanvasTask, node *persistencemodel.CanvasNode, nd nodeData, text string) {
	value := canvasPortValue{Type: "text", Text: text}
	_ = h.updateTaskRow(context.Background(), task, canvasdomain.CompleteCanvasTask(task, &nd, nil))
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		canvasdomain.DefaultSourceHandleForNode(node.Type, nd): value,
		"": value,
	})
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *Service) usageContextForNode(ctx context.Context, node *persistencemodel.CanvasNode, task *persistencemodel.CanvasTask) ai.UsageContext {
	usage := ai.UsageContext{}
	if task != nil {
		usage.JobID = &task.ID
	}
	if node != nil && node.CanvasID != 0 {
		if orgID, projectID, err := h.canvasRepo().CanvasUsageScope(ctx, node.CanvasID); err == nil {
			usage.OrgID = orgID
			usage.ProjectID = projectID
		}
	}
	return usage
}

func (h *Service) resolveCanvasNodeModelConfigID(nd nodeData, nodeType string) (uint, error) {
	modelID := strings.TrimSpace(nd.ModelID)
	if modelID == "" {
		return nd.ModelDbID, nil
	}
	capability := capabilityForCanvasNodeType(nodeType)
	if capability == "" {
		return nd.ModelDbID, nil
	}
	route, err := h.svc.ResolveModelRoute(ai.ModelRouteRequest{
		ModelID:       modelID,
		ModelConfigID: nd.ModelDbID,
		Capability:    capability,
	})
	if err != nil {
		return 0, err
	}
	return route.ModelConfigID, nil
}

func capabilityForCanvasNodeType(nodeType string) string {
	switch nodeType {
	case "text":
		return ai.CapabilityText
	case "image", "ref_image_gen", "multi_angle", "style_transfer":
		return ai.CapabilityImage
	case "video", "ref_video_gen", "motion_imitation":
		return ai.CapabilityVideo
	default:
		return ""
	}
}

func (h *Service) orgIDForNode(ctx context.Context, node *persistencemodel.CanvasNode) *uint {
	if node == nil || node.CanvasID == 0 {
		return nil
	}
	orgID, err := h.canvasRepo().CanvasOrgID(ctx, node.CanvasID)
	if err != nil {
		return nil
	}
	return orgID
}

func (h *Service) requireImageVerification(def *ai.ModelDef, resources []domainresource.RawResource) error {
	if !def.RequiresImageVerification() {
		return nil
	}
	for _, resource := range resources {
		if resource.NeedsImageVerification() {
			return ai.ErrImageVerificationRequired
		}
	}
	return nil
}

package canvas

import (
	"context"
	"fmt"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

type nodeData = canvasruntime.NodeData
type canvasPortValue = canvasruntime.PortValue
type canvasPortInputMap = canvasruntime.PortInputMap

func (h *Service) executeTask(user *persistencemodel.User, node *persistencemodel.CanvasNode, task *persistencemodel.CanvasTask, nd nodeData, portInputs canvasPortInputMap) {
	_ = h.updateTaskRow(context.Background(), task, canvasruntime.StartCanvasTask(task, &nd))
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

	switch node.Type {
	case "text":
		if nd.ModelDbID == 0 {
			h.failTask(task, node, nd, "no model selected for this node")
			return
		}
		textReq := ai.TextRequest{
			PromptName: "canvas_text",
			Messages:   []ai.Message{{Role: "user", Content: nd.Prompt}},
			MaxTokens:  ai.DefaultTextMaxTokens,
		}
		if _, err := h.svc.PreflightText(nd.ModelDbID, &textReq); err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		resp, err := h.svc.CallTextWithUsage(ctx, user.ID, nd.ModelDbID, textReq, h.usageContextForNode(ctx, node, task))
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		h.completeInlineTextTask(task, node, nd, resp.Content)
		return

	case "image", "ref_image_gen", "multi_angle", "style_transfer":
		if nd.ModelDbID == 0 {
			h.failTask(task, node, nd, "no model selected for this node")
			return
		}
		resp, err := h.svc.CallImageWithUsage(ctx, user.ID, nd.ModelDbID, ai.ImageRequest{
			Prompt:             nd.Prompt,
			N:                  1,
			InputImageDataList: imageData,
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
		if nd.ModelDbID == 0 {
			h.failTask(task, node, nd, "no model selected for this node")
			return
		}
		videoDef, err := h.svc.GetVideoModelDef(nd.ModelDbID)
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
		}
		if len(videoData) > 0 {
			videoReq.InputVideoData = &videoData[0]
		}
		resp, err := h.svc.CallVideoWithUsage(ctx, user.ID, nd.ModelDbID, videoReq, h.usageContextForNode(ctx, node, task))
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

func (h *Service) completeInlineTextTask(task *persistencemodel.CanvasTask, node *persistencemodel.CanvasNode, nd nodeData, text string) {
	value := canvasPortValue{Type: "text", Text: text}
	_ = h.updateTaskRow(context.Background(), task, canvasruntime.CompleteCanvasTask(task, &nd, nil))
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		canvasruntime.DefaultSourceHandleForNode(node.Type, nd): value,
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

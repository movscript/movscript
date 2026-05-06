package canvas

import (
	"context"
	"fmt"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
)

type nodeData = canvasruntime.NodeData
type canvasPortValue = canvasruntime.PortValue
type canvasPortInputMap = canvasruntime.PortInputMap

func (h *Service) executeTask(user *model.User, node *model.CanvasNode, task *model.CanvasTask, nd nodeData, portInputs canvasPortInputMap) {
	_ = h.canvasRepo().UpdateTask(context.Background(), task, canvasruntime.StartCanvasTask(task, &nd))
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
	imageData, videoData := h.loadCanvasInputResources(ctx, nd, upstreamResources)

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
		resp, err := h.svc.CallTextWithBilling(ctx, user.ID, nd.ModelDbID, textReq, h.billingContextForNode(ctx, node, task))
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
		resp, err := h.svc.CallImageWithBilling(ctx, user.ID, nd.ModelDbID, ai.ImageRequest{
			Prompt:             nd.Prompt,
			N:                  1,
			InputImageDataList: imageData,
		}, h.billingContextForNode(ctx, node, task))
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
		videoReq := ai.VideoRequest{
			Prompt:             nd.Prompt,
			InputImageDataList: imageData,
		}
		if len(videoData) > 0 {
			videoReq.InputVideoData = &videoData[0]
		}
		resp, err := h.svc.CallVideoWithBilling(ctx, user.ID, nd.ModelDbID, videoReq, h.billingContextForNode(ctx, node, task))
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

	_ = h.canvasRepo().UpdateTask(ctx, task, canvasruntime.CompleteCanvasTask(task, &nd, &r.ID))
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

func (h *Service) completeInlineTextTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, text string) {
	value := canvasPortValue{Type: "text", Text: text}
	_ = h.canvasRepo().UpdateTask(context.Background(), task, canvasruntime.CompleteCanvasTask(task, &nd, nil))
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		canvasruntime.DefaultSourceHandleForNode(node.Type, nd): value,
		"": value,
	})
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *Service) billingContextForNode(ctx context.Context, node *model.CanvasNode, task *model.CanvasTask) ai.BillingContext {
	billing := ai.BillingContext{}
	if task != nil {
		billing.JobID = &task.ID
	}
	if node != nil && node.CanvasID != 0 {
		if orgID, projectID, err := h.canvasRepo().CanvasBillingScope(ctx, node.CanvasID); err == nil {
			billing.OrgID = orgID
			billing.ProjectID = projectID
		}
	}
	return billing
}

func (h *Service) orgIDForNode(ctx context.Context, node *model.CanvasNode) *uint {
	if node == nil || node.CanvasID == 0 {
		return nil
	}
	orgID, err := h.canvasRepo().CanvasOrgID(ctx, node.CanvasID)
	if err != nil {
		return nil
	}
	return orgID
}

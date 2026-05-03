package canvasservice

import (
	"context"
	"fmt"
	"time"

	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/canvasruntime"
	"github.com/movscript/movscript/internal/model"
)

type nodeData = canvasruntime.NodeData
type canvasPortValue = canvasruntime.PortValue
type canvasPortInputMap = canvasruntime.PortInputMap

func (h *Service) executeTask(user *model.User, node *model.CanvasNode, task *model.CanvasTask, nd nodeData, portInputs canvasPortInputMap) {
	h.db.Model(task).Update("status", "running")
	nd.Status = "running"
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
		resp, err := h.svc.CallText(ctx, user.ID, nd.ModelDbID, textReq)
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
		resp, err := h.svc.CallImage(ctx, user.ID, nd.ModelDbID, ai.ImageRequest{
			Prompt:             nd.Prompt,
			N:                  1,
			InputImageDataList: imageData,
		})
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
		resp, err := h.svc.CallVideo(ctx, user.ID, nd.ModelDbID, videoReq)
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

	r, err := h.createCanvasResourceFromSource(ctx, user.ID, fmt.Sprintf("generated_%s_%d.%s", resType, task.ID, canvasExtFromMime(mimeType)), resultURL, mimeType)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return
	}

	h.db.Model(task).Updates(map[string]any{"status": "done", "resource_id": r.ID})
	value := canvasruntime.PortValueFromResource(&r.ID, resType)
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		canvasruntime.DefaultSourceHandleForNode(node.Type, nd): value,
		"": value,
	})
	nd.Status = "done"
	nd.ResourceID = &r.ID
	nd.TaskID = &task.ID
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *Service) completeInlineTextTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, text string) {
	value := canvasPortValue{Type: "text", Text: text}
	h.db.Model(task).Update("status", "done")
	h.updateTaskOutputValues(task, map[string]canvasPortValue{
		canvasruntime.DefaultSourceHandleForNode(node.Type, nd): value,
		"": value,
	})
	nd.Status = "done"
	nd.ResourceID = nil
	nd.TaskID = &task.ID
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/model"
)

type canvasRunSnapshot struct {
	Version    int                `json:"version"`
	CanvasID   uint               `json:"canvas_id"`
	CapturedAt time.Time          `json:"captured_at"`
	Nodes      []model.CanvasNode `json:"nodes"`
	Edges      []model.CanvasEdge `json:"edges"`
}

// nodeData mirrors the JSON stored in CanvasNode.Data.
type nodeData struct {
	Source             string `json:"source"`
	ResourceID         *uint  `json:"resourceId,omitempty"`
	ReferencedCanvasID *uint  `json:"referencedCanvasId,omitempty"`
	Prompt             string `json:"prompt,omitempty"`
	ProviderName       string `json:"providerName,omitempty"`
	ModelID            string `json:"modelId,omitempty"`
	ModelDbID          uint   `json:"modelDbId,omitempty"` // AIModel primary key (preferred over ProviderName+ModelID)
	InputResourceIDs   []uint `json:"inputResourceIds,omitempty"`
	Status             string `json:"status,omitempty"`
	TaskID             *uint  `json:"taskId,omitempty"`
	Error              string `json:"error,omitempty"`
	TextContent        string `json:"textContent,omitempty"`
	InputValue         string `json:"inputValue,omitempty"`
}

// RunNode executes a single AI node and returns a pending CanvasTask.
func (h *CanvasHandler) RunNode(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "canvas not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	if cv.CanvasType == "workflow" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workflow canvases must be run as a workflow"})
		return
	}

	var node model.CanvasNode
	if err := h.db.Where("canvas_id = ? AND node_id = ?", cv.ID, c.Param("nodeId")).First(&node).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}

	task, err := h.startNodeTask(user, &node, nil, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, task)
}

// RunCanvas starts one workflow run and executes all AI nodes in topological order.
func (h *CanvasHandler) RunCanvas(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	if cv.CanvasType != "workflow" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only workflow canvases can create run records"})
		return
	}
	var req struct {
		InputValues map[string]string `json:"input_values"`
	}
	_ = c.ShouldBindJSON(&req)

	order, err := topoSort(cv.Nodes, cv.Edges)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cycle detected in canvas"})
		return
	}
	snapshot, snapshotHash, snapshotNodeCount, snapshotEdgeCount := buildCanvasRunSnapshot(cv)

	inputValues := "{}"
	if req.InputValues != nil {
		if b, err := json.Marshal(req.InputValues); err == nil {
			inputValues = string(b)
		}
	}
	now := time.Now()
	run := model.CanvasRun{
		CanvasID:          cv.ID,
		Status:            "running",
		InputValues:       inputValues,
		GraphSnapshot:     snapshot,
		SnapshotHash:      snapshotHash,
		SnapshotNodeCount: snapshotNodeCount,
		SnapshotEdgeCount: snapshotEdgeCount,
		StartedAt:         &now,
	}
	h.db.Create(&run)

	nodeMap := map[string]*model.CanvasNode{}
	for i := range cv.Nodes {
		nodeMap[cv.Nodes[i].NodeID] = &cv.Nodes[i]
	}

	var tasks []model.CanvasTask
	for _, nid := range order {
		node := nodeMap[nid]
		var nd nodeData
		json.Unmarshal([]byte(node.Data), &nd)
		if nd.Source != "ai" && node.Type != "output" {
			continue
		}
		task := model.CanvasTask{
			CanvasNodeID: node.ID,
			CanvasRunID:  &run.ID,
			NodeID:       node.NodeID,
			NodeLabel:    node.Label,
			NodeType:     node.Type,
			Status:       "pending",
		}
		h.db.Create(&task)
		tasks = append(tasks, task)
	}

	if len(tasks) == 0 {
		finishedAt := time.Now()
		h.db.Model(&run).Updates(map[string]any{"status": "done", "finished_at": &finishedAt})
		run.Status = "done"
		run.FinishedAt = &finishedAt
	} else {
		go h.executeWorkflowRun(user, cv.ID, run.ID, order)
	}
	run.Tasks = tasks
	c.JSON(http.StatusAccepted, gin.H{"run": run, "tasks": tasks})
}

func (h *CanvasHandler) executeWorkflowRun(user *model.User, canvasID uint, runID uint, order []string) {
	var run model.CanvasRun
	if err := h.db.First(&run, runID).Error; err != nil {
		finishedAt := time.Now()
		h.db.Model(&model.CanvasRun{}).Where("id = ?", runID).Updates(map[string]any{
			"status":      "failed",
			"error":       "run not found",
			"finished_at": &finishedAt,
		})
		return
	}

	cv, snapshotErr := canvasFromRunSnapshot(canvasID, run.GraphSnapshot)
	if snapshotErr != nil {
		if err := h.db.Preload("Nodes").Preload("Edges").First(&cv, canvasID).Error; err != nil {
			finishedAt := time.Now()
			h.db.Model(&model.CanvasRun{}).Where("id = ?", runID).Updates(map[string]any{
				"status":      "failed",
				"error":       "canvas not found",
				"finished_at": &finishedAt,
			})
			return
		}
	}

	upstream := map[string][]string{}
	for _, e := range cv.Edges {
		upstream[e.Target] = append(upstream[e.Target], e.Source)
	}
	nodeMap := map[string]*model.CanvasNode{}
	for i := range cv.Nodes {
		nodeMap[cv.Nodes[i].NodeID] = &cv.Nodes[i]
	}
	taskMap := map[string]*model.CanvasTask{}
	var runTasks []model.CanvasTask
	h.db.Where("canvas_run_id = ?", runID).Order("id asc").Find(&runTasks)
	inputValues := map[string]string{}
	if run.InputValues != "" {
		_ = json.Unmarshal([]byte(run.InputValues), &inputValues)
	}
	taskIndex := 0
	for _, nid := range order {
		node := nodeMap[nid]
		if node == nil {
			continue
		}
		var nd nodeData
		json.Unmarshal([]byte(node.Data), &nd)
		if nd.Source != "ai" && node.Type != "output" {
			continue
		}
		if taskIndex >= len(runTasks) {
			break
		}
		taskMap[nid] = &runTasks[taskIndex]
		taskIndex++
	}

	produced := map[string]*uint{}
	for _, nid := range order {
		node := nodeMap[nid]
		if node == nil {
			continue
		}
		var nd nodeData
		json.Unmarshal([]byte(node.Data), &nd)
		if node.Type == "input" {
			text, ok := inputValues[nid]
			if !ok {
				text = nd.InputValue
			}
			if r, err := h.createCanvasTextResource(context.Background(), user.ID, fmt.Sprintf("input_%s_%d.txt", nid, runID), text); err == nil {
				rid := r.ID
				produced[nid] = &rid
			}
			continue
		}
		if node.Type == "output" {
			task := taskMap[nid]
			var outputResource *uint
			for _, uid := range upstream[nid] {
				if rid := produced[uid]; rid != nil {
					outputResource = rid
					break
				}
			}
			if task != nil {
				if outputResource == nil {
					h.failTask(task, node, nd, "output node has no upstream resource")
				} else {
					h.db.Model(task).Updates(map[string]any{"status": "done", "resource_id": *outputResource})
					produced[nid] = outputResource
					h.updateRunStatus(task.CanvasRunID)
				}
			}
			continue
		}
		if nd.Source != "ai" {
			if nd.ResourceID != nil {
				produced[nid] = nd.ResourceID
			} else if node.Type == "text" {
				if r, err := h.createCanvasTextResource(context.Background(), user.ID, fmt.Sprintf("text_%s_%d.txt", nid, runID), nd.TextContent); err == nil {
					rid := r.ID
					produced[nid] = &rid
				}
			}
			continue
		}
		task := taskMap[nid]
		if task == nil {
			continue
		}
		promptOptionalTypes := map[string]bool{
			"motion_imitation": true,
			"canvas":           true,
		}
		if nd.Prompt == "" && !promptOptionalTypes[node.Type] {
			h.failTask(task, node, nd, "prompt is required")
			continue
		}

		var upstreamResources []*uint
		for _, uid := range upstream[nid] {
			if rid := produced[uid]; rid != nil {
				upstreamResources = append(upstreamResources, rid)
			}
		}
		h.executeTask(user, node, task, nd, upstreamResources)

		var updated model.CanvasTask
		if err := h.db.First(&updated, task.ID).Error; err == nil && updated.Status == "done" && updated.ResourceID != nil {
			produced[nid] = updated.ResourceID
		}
	}
	h.updateRunStatus(&runID)
}

func buildCanvasRunSnapshot(cv model.Canvas) (string, string, int, int) {
	snapshot := canvasRunSnapshot{
		Version:    1,
		CanvasID:   cv.ID,
		CapturedAt: time.Now(),
		Nodes:      cv.Nodes,
		Edges:      cv.Edges,
	}
	b, err := json.Marshal(snapshot)
	if err != nil {
		return "", "", len(cv.Nodes), len(cv.Edges)
	}
	sum := sha256.Sum256(b)
	return string(b), hex.EncodeToString(sum[:]), len(cv.Nodes), len(cv.Edges)
}

func canvasFromRunSnapshot(canvasID uint, raw string) (model.Canvas, error) {
	if strings.TrimSpace(raw) == "" {
		return model.Canvas{}, fmt.Errorf("empty snapshot")
	}
	var snapshot canvasRunSnapshot
	if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
		return model.Canvas{}, err
	}
	cv := model.Canvas{Nodes: snapshot.Nodes, Edges: snapshot.Edges}
	cv.ID = canvasID
	return cv, nil
}

// ListRuns returns workflow runs for a canvas, newest first.
func (h *CanvasHandler) ListRuns(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "canvas not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var runs []model.CanvasRun
	q := h.db.Model(&model.CanvasRun{}).Where("canvas_id = ?", cv.ID)
	if status := strings.TrimSpace(c.Query("status")); status != "" && status != "all" {
		q = q.Where("status = ?", status)
	}

	pageMode := c.Query("page") != "" || c.Query("page_size") != ""
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	var total int64
	q.Count(&total)
	q.Omit("graph_snapshot").Order("id desc")
	if pageMode {
		q.Limit(pageSize).Offset((page - 1) * pageSize).Find(&runs)
		c.JSON(http.StatusOK, gin.H{"total": total, "items": runs, "page": page, "page_size": pageSize})
		return
	}
	q.Limit(20).Find(&runs)
	c.JSON(http.StatusOK, runs)
}

// GetRun returns one workflow run and its tasks.
func (h *CanvasHandler) GetRun(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "canvas not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var run model.CanvasRun
	if err := h.db.Where("canvas_id = ? AND id = ?", cv.ID, c.Param("runId")).Preload("Tasks.Resource").First(&run).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not found"})
		return
	}
	for i := range run.Tasks {
		if run.Tasks[i].Resource != nil {
			run.Tasks[i].Resource.URL = resourceURL(c, run.Tasks[i].Resource.ID)
		}
	}
	c.JSON(http.StatusOK, run)
}

// ListRunTasks returns tasks belonging to one workflow run.
func (h *CanvasHandler) ListRunTasks(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var cv model.Canvas
	if err := h.db.First(&cv, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "canvas not found"})
		return
	}
	if cv.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var run model.CanvasRun
	if err := h.db.Where("canvas_id = ? AND id = ?", cv.ID, c.Param("runId")).First(&run).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not found"})
		return
	}
	var tasks []model.CanvasTask
	h.db.Where("canvas_run_id = ?", run.ID).Preload("Resource").Order("id asc").Find(&tasks)
	for i := range tasks {
		if tasks[i].Resource != nil {
			tasks[i].Resource.URL = resourceURL(c, tasks[i].Resource.ID)
		}
	}
	c.JSON(http.StatusOK, tasks)
}

// GetNodeTask returns the latest CanvasTask for a given node.
func (h *CanvasHandler) GetNodeTask(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var node model.CanvasNode
	if err := h.db.Where("canvas_id = ? AND node_id = ?", c.Param("id"), c.Param("nodeId")).First(&node).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	var task model.CanvasTask
	if err := h.db.Where("canvas_node_id = ?", node.ID).Order("id desc").First(&task).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no task"})
		return
	}
	if task.ResourceID != nil {
		var resource model.RawResource
		if err := h.db.First(&resource, *task.ResourceID).Error; err == nil {
			resource.URL = resourceURL(c, resource.ID)
			task.Resource = &resource
		}
	}
	c.JSON(http.StatusOK, task)
}

// ListNodeTasks returns all CanvasTasks for a given node, newest first.
func (h *CanvasHandler) ListNodeTasks(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var node model.CanvasNode
	if err := h.db.Where("canvas_id = ? AND node_id = ?", c.Param("id"), c.Param("nodeId")).First(&node).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	var tasks []model.CanvasTask
	h.db.Where("canvas_node_id = ?", node.ID).Preload("Resource").Order("id desc").Find(&tasks)
	// Populate resource URLs
	for i := range tasks {
		if tasks[i].Resource != nil {
			tasks[i].Resource.URL = resourceURL(c, tasks[i].Resource.ID)
		}
	}
	c.JSON(http.StatusOK, tasks)
}

// startNodeTask creates a CanvasTask record and launches an async goroutine.
func (h *CanvasHandler) startNodeTask(user *model.User, node *model.CanvasNode, upstreamResources []*uint, run *model.CanvasRun) (*model.CanvasTask, error) {
	var nd nodeData
	if err := json.Unmarshal([]byte(node.Data), &nd); err != nil {
		return nil, fmt.Errorf("invalid node data")
	}
	if nd.Source != "ai" {
		return nil, fmt.Errorf("node is not an AI node")
	}
	promptOptionalTypes := map[string]bool{
		"motion_imitation": true,
		"canvas":           true,
	}
	if nd.Prompt == "" && !promptOptionalTypes[node.Type] {
		return nil, fmt.Errorf("prompt is required")
	}

	task := model.CanvasTask{CanvasNodeID: node.ID, Status: "pending"}
	if run != nil {
		task.CanvasRunID = &run.ID
	}
	h.db.Create(&task)

	nd.Status = "pending"
	nd.TaskID = &task.ID
	if run == nil {
		h.updateNodeData(node, nd)
	}

	go h.executeTask(user, node, &task, nd, upstreamResources)
	return &task, nil
}

func (h *CanvasHandler) executeTask(user *model.User, node *model.CanvasNode, task *model.CanvasTask, nd nodeData, upstreamResources []*uint) {
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

	var resultURL, mimeType, resType string
	imageData, videoData := h.loadCanvasInputResources(ctx, nd, upstreamResources)

	if node.Type == "canvas" {
		h.completeCanvasReferenceTask(task, node, nd, user)
		return
	}

	switch node.Type {
	case "text":
		if nd.ModelDbID == 0 {
			h.failTask(task, node, nd, "no model selected for this node")
			return
		}
		resp, err := h.svc.CallText(ctx, user.ID, nd.ModelDbID, ai.TextRequest{
			Messages:  []ai.Message{{Role: "user", Content: nd.Prompt}},
			MaxTokens: 2048,
		})
		if err != nil {
			h.failTask(task, node, nd, err.Error())
			return
		}
		filename := fmt.Sprintf("%d_text_%d.txt", user.ID, task.ID)
		_ = os.MkdirAll(h.uploadDir, 0755)
		path := filepath.Join(h.uploadDir, filename)
		os.WriteFile(path, []byte(resp.Content), 0644)
		resultURL, mimeType, resType = path, "text/plain", "text"

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
	nd.Status = "done"
	nd.ResourceID = &r.ID
	nd.TaskID = &task.ID
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *CanvasHandler) createCanvasTextResource(ctx context.Context, ownerID uint, name string, text string) (*model.RawResource, error) {
	return h.createCanvasResourceFromBytes(ctx, ownerID, name, []byte(text), "text/plain")
}

func (h *CanvasHandler) createCanvasResourceFromSource(ctx context.Context, ownerID uint, name string, source string, mimeType string) (*model.RawResource, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return nil, fmt.Errorf("generated result is empty")
	}
	var data []byte
	if strings.HasPrefix(source, "data:") {
		semi := strings.Index(source, ";")
		comma := strings.Index(source, ",")
		if semi < 0 || comma < 0 || comma <= semi {
			return nil, fmt.Errorf("malformed data URI")
		}
		mimeType = strings.TrimPrefix(source[:semi], "data:")
		decoded, err := base64.StdEncoding.DecodeString(source[comma+1:])
		if err != nil {
			return nil, fmt.Errorf("decode generated data: %w", err)
		}
		data = decoded
	} else if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
		if err != nil {
			return nil, fmt.Errorf("build generated result request: %w", err)
		}
		resp, err := (&http.Client{Timeout: 2 * time.Minute}).Do(req)
		if err != nil {
			return nil, fmt.Errorf("download generated result: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("download generated result returned %d", resp.StatusCode)
		}
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			mimeType = ct
		}
		data, err = io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("read generated result: %w", err)
		}
	} else {
		var err error
		data, err = os.ReadFile(source)
		if err != nil {
			return nil, fmt.Errorf("read generated result file: %w", err)
		}
	}
	return h.createCanvasResourceFromBytes(ctx, ownerID, name, data, mimeType)
}

func (h *CanvasHandler) createCanvasResourceFromBytes(ctx context.Context, ownerID uint, name string, data []byte, mimeType string) (*model.RawResource, error) {
	if h.store == nil {
		return nil, fmt.Errorf("resource storage is not configured")
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	resType := mimeToType(mimeType, name)
	key := fmt.Sprintf("canvas/%d/%d_%s", ownerID, time.Now().UnixNano(), filepath.Base(name))
	r := model.RawResource{
		OwnerID:        ownerID,
		Type:           resType,
		Name:           name,
		MimeType:       mimeType,
		Size:           int64(len(data)),
		FilePath:       "pending",
		StorageBackend: h.store.Backend(),
		StorageKey:     key,
	}
	if err := h.db.Create(&r).Error; err != nil {
		return nil, fmt.Errorf("create resource record: %w", err)
	}
	if err := h.store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		h.db.Delete(&r)
		return nil, fmt.Errorf("store resource: %w", err)
	}
	h.db.Model(&r).Update("file_path", "stored:"+key)
	r.FilePath = "stored:" + key
	return &r, nil
}

func canvasExtFromMime(mimeType string) string {
	base := strings.TrimSpace(strings.Split(mimeType, ";")[0])
	if exts, err := mime.ExtensionsByType(base); err == nil && len(exts) > 0 {
		return strings.TrimPrefix(exts[0], ".")
	}
	switch mimeToType(base, "") {
	case "image":
		return "png"
	case "video":
		return "mp4"
	case "audio":
		return "mp3"
	case "text":
		return "txt"
	default:
		return "bin"
	}
}

func (h *CanvasHandler) completeCanvasReferenceTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, user *model.User) {
	if nd.ReferencedCanvasID == nil || *nd.ReferencedCanvasID == 0 {
		h.failTask(task, node, nd, "referenced workflow canvas is required")
		return
	}
	var ref model.Canvas
	if err := h.db.First(&ref, *nd.ReferencedCanvasID).Error; err != nil {
		h.failTask(task, node, nd, "referenced canvas not found")
		return
	}
	if ref.OwnerID != user.ID {
		h.failTask(task, node, nd, "referenced canvas is not accessible")
		return
	}
	if ref.CanvasType != "workflow" {
		h.failTask(task, node, nd, "only workflow canvases can be referenced")
		return
	}

	var latestRun model.CanvasRun
	if err := h.db.Where("canvas_id = ? AND status = ?", ref.ID, "done").Order("id desc").First(&latestRun).Error; err != nil {
		h.failTask(task, node, nd, "referenced workflow has no completed run")
		return
	}

	var outputNodeIDs []uint
	h.db.Model(&model.CanvasNode{}).Where("canvas_id = ? AND type = ?", ref.ID, "output").Pluck("id", &outputNodeIDs)

	var refTask model.CanvasTask
	refTaskQuery := h.db.Where("canvas_run_id = ? AND resource_id IS NOT NULL", latestRun.ID)
	if len(outputNodeIDs) > 0 {
		refTaskQuery = refTaskQuery.Where("canvas_node_id IN ?", outputNodeIDs)
	}
	if err := refTaskQuery.Order("id desc").First(&refTask).Error; err != nil || refTask.ResourceID == nil {
		h.failTask(task, node, nd, "referenced workflow run has no resource output")
		return
	}

	h.db.Model(task).Updates(map[string]any{"status": "done", "resource_id": *refTask.ResourceID})
	nd.Status = "done"
	nd.ResourceID = refTask.ResourceID
	nd.TaskID = &task.ID
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *CanvasHandler) loadCanvasInputResources(ctx context.Context, nd nodeData, upstreamResources []*uint) (imageData, videoData []ai.MediaData) {
	ids := make([]uint, 0, len(nd.InputResourceIDs)+len(upstreamResources))
	seen := map[uint]bool{}
	for _, id := range nd.InputResourceIDs {
		if id == 0 || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	for _, ptr := range upstreamResources {
		if ptr == nil || *ptr == 0 || seen[*ptr] {
			continue
		}
		seen[*ptr] = true
		ids = append(ids, *ptr)
	}
	if len(ids) == 0 {
		return nil, nil
	}

	var resources []model.RawResource
	if err := h.db.Where("id IN ?", ids).Find(&resources).Error; err != nil {
		return nil, nil
	}
	byID := make(map[uint]model.RawResource, len(resources))
	for _, r := range resources {
		byID[r.ID] = r
	}
	for _, id := range ids {
		r, ok := byID[id]
		if !ok {
			continue
		}
		data, mime, err := h.readCanvasResourceBytes(ctx, r)
		if err != nil || len(data) == 0 {
			continue
		}
		md := ai.MediaData{Bytes: data, MimeType: mime}
		switch r.Type {
		case "image":
			imageData = append(imageData, md)
		case "video":
			videoData = append(videoData, md)
		}
	}
	return imageData, videoData
}

func (h *CanvasHandler) readCanvasResourceBytes(ctx context.Context, r model.RawResource) ([]byte, string, error) {
	mimeType := r.MimeType
	if r.StorageKey != "" && h.store != nil {
		rc, _, storedMime, err := h.store.GetObject(ctx, r.StorageKey, -1, -1)
		if err != nil {
			return nil, "", err
		}
		defer rc.Close()
		data, err := io.ReadAll(rc)
		if storedMime != "" {
			mimeType = storedMime
		}
		return data, mimeType, err
	}

	if strings.HasPrefix(r.FilePath, "data:") {
		semi := strings.Index(r.FilePath, ";")
		comma := strings.Index(r.FilePath, ",")
		if semi < 0 || comma < 0 || comma <= semi {
			return nil, "", fmt.Errorf("malformed data URI")
		}
		mimeType = strings.TrimPrefix(r.FilePath[:semi], "data:")
		data, err := base64.StdEncoding.DecodeString(r.FilePath[comma+1:])
		return data, mimeType, err
	}

	if strings.HasPrefix(r.FilePath, "http://") || strings.HasPrefix(r.FilePath, "https://") {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.FilePath, nil)
		if err != nil {
			return nil, "", err
		}
		resp, err := (&http.Client{Timeout: 2 * time.Minute}).Do(req)
		if err != nil {
			return nil, "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, "", fmt.Errorf("download resource returned %d", resp.StatusCode)
		}
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			mimeType = ct
		}
		data, err := io.ReadAll(resp.Body)
		return data, mimeType, err
	}

	if r.FilePath != "" {
		data, err := os.ReadFile(r.FilePath)
		return data, mimeType, err
	}
	return nil, "", fmt.Errorf("resource has no readable data")
}

func resolveCanvasMentions(prompt string) (string, []uint) {
	re := regexp.MustCompile(`@\[resource:(\d+)\]`)
	var order []uint
	seen := map[uint]int{}
	for _, sub := range re.FindAllStringSubmatch(prompt, -1) {
		id64, err := strconv.ParseUint(sub[1], 10, 64)
		if err != nil {
			continue
		}
		id := uint(id64)
		if _, ok := seen[id]; !ok {
			order = append(order, id)
			seen[id] = len(order)
		}
	}
	cleaned := re.ReplaceAllStringFunc(prompt, func(match string) string {
		sub := re.FindStringSubmatch(match)
		if len(sub) < 2 {
			return ""
		}
		id64, err := strconv.ParseUint(sub[1], 10, 64)
		if err != nil {
			return ""
		}
		return fmt.Sprintf("图片%d", seen[uint(id64)])
	})
	return strings.TrimSpace(cleaned), order
}

func (h *CanvasHandler) failTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, errMsg string) {
	h.db.Model(task).Updates(map[string]any{"status": "failed", "error": errMsg})
	nd.Status = "failed"
	nd.Error = errMsg
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
}

func (h *CanvasHandler) updateNodeData(node *model.CanvasNode, nd nodeData) {
	var existing map[string]any
	if err := json.Unmarshal([]byte(node.Data), &existing); err != nil || existing == nil {
		existing = map[string]any{}
	}
	var patch map[string]any
	b, _ := json.Marshal(nd)
	_ = json.Unmarshal(b, &patch)
	for k, v := range patch {
		existing[k] = v
	}
	b, _ = json.Marshal(existing)
	h.db.Model(node).Update("data", string(b))
	node.Data = string(b)
}

func (h *CanvasHandler) updateRunStatus(runID *uint) {
	if runID == nil {
		return
	}
	var tasks []model.CanvasTask
	h.db.Where("canvas_run_id = ?", *runID).Find(&tasks)
	if len(tasks) == 0 {
		return
	}
	active := false
	failed := false
	for _, task := range tasks {
		switch task.Status {
		case "pending", "running":
			active = true
		case "failed":
			failed = true
		}
	}
	status := "done"
	updates := map[string]any{"status": status}
	if active {
		status = "running"
		updates["status"] = status
	} else {
		if failed {
			status = "failed"
			updates["status"] = status
			updates["error"] = "one or more workflow tasks failed"
		}
		finishedAt := time.Now()
		updates["finished_at"] = &finishedAt
	}
	h.db.Model(&model.CanvasRun{}).Where("id = ?", *runID).Updates(updates)
}

// topoSort returns node IDs in topological order; returns error if a cycle exists.
func topoSort(nodes []model.CanvasNode, edges []model.CanvasEdge) ([]string, error) {
	inDegree := map[string]int{}
	adj := map[string][]string{}
	for _, n := range nodes {
		inDegree[n.NodeID] = 0
	}
	for _, e := range edges {
		adj[e.Source] = append(adj[e.Source], e.Target)
		inDegree[e.Target]++
	}
	queue := []string{}
	for _, n := range nodes {
		if inDegree[n.NodeID] == 0 {
			queue = append(queue, n.NodeID)
		}
	}
	var order []string
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		order = append(order, cur)
		for _, next := range adj[cur] {
			inDegree[next]--
			if inDegree[next] == 0 {
				queue = append(queue, next)
			}
		}
	}
	if len(order) != len(nodes) {
		return nil, fmt.Errorf("cycle")
	}
	return order, nil
}

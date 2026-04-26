package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/model"
)

// nodeData mirrors the JSON stored in CanvasNode.Data.
type nodeData struct {
	Source       string `json:"source"`
	ResourceID   *uint  `json:"resourceId,omitempty"`
	Prompt       string `json:"prompt,omitempty"`
	ProviderName string `json:"providerName,omitempty"`
	ModelID      string `json:"modelId,omitempty"`
	ModelDbID    uint   `json:"modelDbId,omitempty"` // AIModel primary key (preferred over ProviderName+ModelID)
	Status       string `json:"status,omitempty"`
	TaskID       *uint  `json:"taskId,omitempty"`
	Error        string `json:"error,omitempty"`
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
	var req struct {
		InputValues map[string]string `json:"input_values"`
	}
	_ = c.ShouldBindJSON(&req)

	order, err := topoSort(cv.Nodes, cv.Edges)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cycle detected in canvas"})
		return
	}

	inputValues := "{}"
	if req.InputValues != nil {
		if b, err := json.Marshal(req.InputValues); err == nil {
			inputValues = string(b)
		}
	}
	now := time.Now()
	run := model.CanvasRun{
		CanvasID:    cv.ID,
		Status:      "running",
		InputValues: inputValues,
		StartedAt:   &now,
	}
	h.db.Create(&run)

	// Build upstream map: nodeID → list of upstream nodeIDs
	upstream := map[string][]string{}
	for _, e := range cv.Edges {
		upstream[e.Target] = append(upstream[e.Target], e.Source)
	}

	nodeMap := map[string]*model.CanvasNode{}
	for i := range cv.Nodes {
		nodeMap[cv.Nodes[i].NodeID] = &cv.Nodes[i]
	}

	// nodeID → resourceID produced by that node
	produced := map[string]*uint{}

	var tasks []model.CanvasTask
	aiNodeCount := 0
	startErrorCount := 0
	for _, nid := range order {
		node := nodeMap[nid]
		var nd nodeData
		json.Unmarshal([]byte(node.Data), &nd)
		if nd.Source != "ai" {
			if nd.ResourceID != nil {
				produced[nid] = nd.ResourceID
			}
			continue
		}
		aiNodeCount++

		var upstreamResources []*uint
		for _, uid := range upstream[nid] {
			if rid := produced[uid]; rid != nil {
				upstreamResources = append(upstreamResources, rid)
			}
		}

		task, err := h.startNodeTask(user, node, upstreamResources, &run)
		if err != nil {
			startErrorCount++
			continue
		}
		tasks = append(tasks, *task)
	}

	if len(tasks) == 0 {
		finishedAt := time.Now()
		status := "done"
		errorMsg := ""
		if aiNodeCount > 0 && startErrorCount > 0 {
			status = "failed"
			errorMsg = fmt.Sprintf("%d workflow node(s) could not start", startErrorCount)
		}
		h.db.Model(&run).Updates(map[string]any{"status": status, "error": errorMsg, "finished_at": &finishedAt})
		run.Status = status
		run.Error = errorMsg
		run.FinishedAt = &finishedAt
	} else if startErrorCount > 0 {
		run.Error = fmt.Sprintf("%d workflow node(s) could not start", startErrorCount)
		h.db.Model(&run).Update("error", run.Error)
	}
	run.Tasks = tasks
	c.JSON(http.StatusAccepted, gin.H{"run": run, "tasks": tasks})
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
	h.db.Where("canvas_id = ?", cv.ID).Order("id desc").Limit(20).Find(&runs)
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
	h.updateNodeData(node, nd)

	go h.executeTask(user, node, &task, nd, upstreamResources)
	return &task, nil
}

func (h *CanvasHandler) executeTask(user *model.User, node *model.CanvasNode, task *model.CanvasTask, nd nodeData, _ []*uint) {
	h.db.Model(task).Update("status", "running")
	nd.Status = "running"
	h.updateNodeData(node, nd)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	var resultURL, mimeType, resType string

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
		path := filepath.Join(h.uploadDir, filename)
		os.WriteFile(path, []byte(resp.Content), 0644)
		resultURL, mimeType, resType = path, "text/plain", "text"

	case "image", "ref_image_gen", "multi_angle", "style_transfer":
		if nd.ModelDbID == 0 {
			h.failTask(task, node, nd, "no model selected for this node")
			return
		}
		resp, err := h.svc.CallImage(ctx, user.ID, nd.ModelDbID, ai.ImageRequest{
			Prompt: nd.Prompt,
			N:      1,
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
		resp, err := h.svc.CallVideo(ctx, user.ID, nd.ModelDbID, ai.VideoRequest{
			Prompt: nd.Prompt,
		})
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

	case "canvas":
		h.failTask(task, node, nd, "canvas reference nodes do not generate output directly")
		return

	default:
		h.failTask(task, node, nd, "unknown node type")
		return
	}

	r := model.RawResource{
		OwnerID:  user.ID,
		Type:     resType,
		Name:     fmt.Sprintf("generated_%s_%d", resType, task.ID),
		FilePath: resultURL,
		MimeType: mimeType,
	}
	h.db.Create(&r)

	h.db.Model(task).Updates(map[string]any{"status": "done", "resource_id": r.ID})
	nd.Status = "done"
	nd.ResourceID = &r.ID
	nd.TaskID = &task.ID
	h.updateNodeData(node, nd)
	h.updateRunStatus(task.CanvasRunID)
}

func (h *CanvasHandler) failTask(task *model.CanvasTask, node *model.CanvasNode, nd nodeData, errMsg string) {
	h.db.Model(task).Updates(map[string]any{"status": "failed", "error": errMsg})
	nd.Status = "failed"
	nd.Error = errMsg
	h.updateNodeData(node, nd)
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

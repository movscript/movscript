package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type PipelineHandler struct{ db *gorm.DB }

func NewPipelineHandler(db *gorm.DB) *PipelineHandler { return &PipelineHandler{db: db} }

var pipelineWorkNodeTypes = map[string]bool{
	"script_writing":      true,
	"episode_writing":     true,
	"scene_writing":       true,
	"storyboard_creation": true,
	"asset_creation":      true,
	"raw_script":          true,
	"shot_production":     true,
	"episode_edit":        true,
}

var pipelineArtifactNodeTypes = map[string]bool{
	"main_script":       true,
	"episode_script":    true,
	"scene_script":      true,
	"storyboard_script": true,
	"episode":           true,
	"scene":             true,
	"storyboard":        true,
	"asset":             true,
	"shot":              true,
}

var pipelineToolNodeTypes = map[string]bool{
	"ref_image_gen":    true,
	"ref_video_gen":    true,
	"style_transfer":   true,
	"motion_imitation": true,
	"multi_angle":      true,
}

func isPipelineWorkNode(nodeType string) bool {
	return pipelineWorkNodeTypes[nodeType]
}

func isPipelineArtifactNode(nodeType string) bool {
	return pipelineArtifactNodeTypes[nodeType]
}

func isPipelineToolNode(nodeType string) bool {
	return pipelineToolNodeTypes[nodeType]
}

func pipelineContentTypeForNode(nodeType string) string {
	switch nodeType {
	case "script_writing", "raw_script", "main_script", "episode_writing", "episode_script", "scene_writing", "scene_script":
		return "script"
	case "storyboard_creation", "storyboard_script", "storyboard":
		return "storyboard"
	case "shot_production", "shot":
		return "shot"
	case "asset_creation", "asset":
		return "asset"
	default:
		return "custom"
	}
}

// GetNode returns a single pipeline node by ID.
func (h *PipelineHandler) GetNode(c *gin.Context) {
	var node model.PipelineNode
	if err := h.db.Preload("Assignee").Preload("Lead").First(&node, c.Param("nodeId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("节点不存在"))
		return
	}
	if isPipelineToolNode(node.Type) {
		c.JSON(http.StatusNotFound, apierr.NotFound("节点不存在"))
		return
	}
	c.JSON(http.StatusOK, node)
}

// GetPipeline returns all nodes and edges for a project.
func (h *PipelineHandler) GetPipeline(c *gin.Context) {
	pid := c.Param("id")
	var nodes []model.PipelineNode
	var edges []model.PipelineEdge

	h.db.Preload("Assignee").Preload("Lead").Where("project_id = ?", pid).Order("created_at").Find(&nodes)
	h.db.Where("project_id = ?", pid).Find(&edges)
	nodes, edges = visiblePipelineTree(nodes, edges)

	c.JSON(http.StatusOK, gin.H{"nodes": nodes, "edges": edges})
}

// CreateNode adds a new pipeline node to a project.
func (h *PipelineHandler) CreateNode(c *gin.Context) {
	pid := parseID(c.Param("id"))
	var node model.PipelineNode
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	node.ProjectID = pid
	node.Status = "draft"
	if isPipelineToolNode(node.Type) {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("管线不再支持工具节点类型"))
		return
	}
	node.ContentType = pipelineContentTypeForNode(node.Type)
	h.db.Create(&node)
	h.db.Preload("Assignee").Preload("Lead").First(&node, node.ID)
	c.JSON(http.StatusCreated, node)
}

// UpdateNode updates mutable fields of a pipeline node (name, description, assignee, due_date, pos).
func (h *PipelineHandler) UpdateNode(c *gin.Context) {
	var node model.PipelineNode
	if err := h.db.First(&node, c.Param("nodeId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("节点不存在"))
		return
	}

	var body struct {
		Name        *string    `json:"name"`
		Description *string    `json:"description"`
		AssigneeID  *uint      `json:"assignee_id"`
		LeadID      *uint      `json:"lead_id"`
		DueDate     *time.Time `json:"due_date"`
		ContentType *string    `json:"content_type"`
		EntityType  *string    `json:"entity_type"`
		EntityID    *uint      `json:"entity_id"`
		PosX        *float64   `json:"pos_x"`
		PosY        *float64   `json:"pos_y"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}

	if body.Name != nil {
		node.Name = *body.Name
	}
	if body.Description != nil {
		node.Description = *body.Description
	}
	if body.AssigneeID != nil {
		node.AssigneeID = body.AssigneeID
	}
	if body.LeadID != nil {
		node.LeadID = body.LeadID
	}
	if body.DueDate != nil {
		node.DueDate = body.DueDate
	}
	node.ContentType = pipelineContentTypeForNode(node.Type)
	if body.EntityType != nil {
		node.EntityType = *body.EntityType
	}
	if body.EntityID != nil {
		node.EntityID = body.EntityID
	}
	if body.PosX != nil {
		node.PosX = *body.PosX
	}
	if body.PosY != nil {
		node.PosY = *body.PosY
	}

	h.db.Save(&node)
	h.db.Preload("Assignee").Preload("Lead").First(&node, node.ID)
	c.JSON(http.StatusOK, node)
}

// DeleteNode removes a pipeline node and all edges connected to it.
func (h *PipelineHandler) DeleteNode(c *gin.Context) {
	nid := c.Param("nodeId")
	var node model.PipelineNode
	if err := h.db.First(&node, nid).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("节点不存在"))
		return
	}
	h.db.Where("from_node_id = ? OR to_node_id = ?", nid, nid).Delete(&model.PipelineEdge{})
	h.db.Delete(&node)
	c.Status(http.StatusNoContent)
}

// CreateEdge adds a parent-child relation between two pipeline nodes.
func (h *PipelineHandler) CreateEdge(c *gin.Context) {
	pid := parseID(c.Param("id"))
	var edge model.PipelineEdge
	if err := c.ShouldBindJSON(&edge); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	edge.ProjectID = pid

	// Prevent self-loops
	if edge.FromNodeID == edge.ToNodeID {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("节点不能指向自身"))
		return
	}

	var parent model.PipelineNode
	if err := h.db.First(&parent, edge.FromNodeID).Error; err != nil || parent.ProjectID != pid {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("父节点不存在"))
		return
	}
	var child model.PipelineNode
	if err := h.db.First(&child, edge.ToNodeID).Error; err != nil || child.ProjectID != pid {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("子节点不存在"))
		return
	}

	// A tree node can have only one parent.
	var parentCount int64
	h.db.Model(&model.PipelineEdge{}).Where("project_id = ? AND to_node_id = ?", pid, edge.ToNodeID).Count(&parentCount)
	if parentCount > 0 {
		c.JSON(http.StatusConflict, apierr.Conflict("树形管线中每个节点只能有一个父节点"))
		return
	}

	if h.wouldCreateCycle(pid, edge.FromNodeID, edge.ToNodeID) {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("树形管线不允许形成循环"))
		return
	}

	// Prevent duplicate edges
	var existing model.PipelineEdge
	if h.db.Where("from_node_id = ? AND to_node_id = ?", edge.FromNodeID, edge.ToNodeID).First(&existing).Error == nil {
		c.JSON(http.StatusConflict, apierr.Conflict("依赖关系已存在"))
		return
	}

	h.db.Create(&edge)
	c.JSON(http.StatusCreated, edge)
}

// DeleteEdge removes a dependency edge.
func (h *PipelineHandler) DeleteEdge(c *gin.Context) {
	h.db.Delete(&model.PipelineEdge{}, c.Param("edgeId"))
	c.Status(http.StatusNoContent)
}

// Submit transitions a node from draft (or rejected) to under_review.
// Work nodes can be submitted only after every adjacent artifact node
// (both upstream parent-side and downstream child-side) is final.
func (h *PipelineHandler) Submit(c *gin.Context) {
	var node model.PipelineNode
	if err := h.db.First(&node, c.Param("nodeId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("节点不存在"))
		return
	}
	if node.Status != "draft" && node.Status != "rejected" {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("只有草稿或被拒绝的节点可以提交审核"))
		return
	}
	if isPipelineToolNode(node.Type) {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("管线不再支持工具节点类型"))
		return
	}

	if isPipelineWorkNode(node.Type) {
		if blocking, ok := h.findBlockingAdjacentArtifact(node); ok {
			c.JSON(http.StatusBadRequest, gin.H{
				"code":    "artifact_not_final",
				"message": "关联产物「" + blocking.Name + "」尚未定稿，工作节点无法提交审核",
			})
			return
		}
	}

	node.Status = "under_review"
	node.ReviewNote = ""
	h.db.Save(&node)
	c.JSON(http.StatusOK, node)
}

// Approve transitions a node from under_review to final.
// Requires director or owner role.
func (h *PipelineHandler) Approve(c *gin.Context) {
	var node model.PipelineNode
	if err := h.db.First(&node, c.Param("nodeId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("节点不存在"))
		return
	}
	if node.Status != "under_review" {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("只有审核中的节点可以批准"))
		return
	}

	userID := currentUserID(c)
	if !hasProjectRole(h.db, node.ProjectID, userID, "owner", "director") {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要导演或所有者权限"))
		return
	}

	now := time.Now()
	node.Status = "final"
	node.ReviewedBy = &userID
	node.ReviewedAt = &now
	h.db.Save(&node)
	c.JSON(http.StatusOK, node)
}

// Reject transitions a node from under_review to rejected with a review note.
// Requires director or owner role.
func (h *PipelineHandler) Reject(c *gin.Context) {
	var node model.PipelineNode
	if err := h.db.First(&node, c.Param("nodeId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("节点不存在"))
		return
	}
	if node.Status != "under_review" {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("只有审核中的节点可以拒绝"))
		return
	}

	userID := currentUserID(c)
	if !hasProjectRole(h.db, node.ProjectID, userID, "owner", "director") {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要导演或所有者权限"))
		return
	}

	var body struct {
		Note string `json:"note"`
	}
	c.ShouldBindJSON(&body)

	now := time.Now()
	node.Status = "rejected"
	node.ReviewNote = body.Note
	node.ReviewedBy = &userID
	node.ReviewedAt = &now
	h.db.Save(&node)
	c.JSON(http.StatusOK, node)
}

// Reopen transitions a node from rejected (or final) back to draft.
// All child nodes are cascade-reset to draft via BFS.
func (h *PipelineHandler) Reopen(c *gin.Context) {
	var node model.PipelineNode
	if err := h.db.First(&node, c.Param("nodeId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("节点不存在"))
		return
	}
	if node.Status == "draft" {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("节点已经是草稿状态"))
		return
	}

	// Cascade reset: BFS through all child nodes
	visited := map[uint]bool{node.ID: true}
	queue := []uint{node.ID}
	toReset := []uint{}

	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]

		var downEdges []model.PipelineEdge
		h.db.Where("from_node_id = ?", cur).Find(&downEdges)
		for _, e := range downEdges {
			if !visited[e.ToNodeID] {
				visited[e.ToNodeID] = true
				toReset = append(toReset, e.ToNodeID)
				queue = append(queue, e.ToNodeID)
			}
		}
	}

	// Reset node itself
	node.Status = "draft"
	node.ReviewNote = ""
	h.db.Save(&node)

	// Reset all child nodes that are not already draft
	if len(toReset) > 0 {
		h.db.Model(&model.PipelineNode{}).
			Where("id IN ? AND status != 'draft'", toReset).
			Updates(map[string]interface{}{"status": "draft", "review_note": ""})
	}

	h.db.Preload("Assignee").Preload("Lead").First(&node, node.ID)
	c.JSON(http.StatusOK, gin.H{
		"node":           node,
		"reset_count":    len(toReset),
		"reset_node_ids": toReset,
	})
}

func (h *PipelineHandler) findBlockingAdjacentArtifact(node model.PipelineNode) (model.PipelineNode, bool) {
	var edges []model.PipelineEdge
	h.db.Where("project_id = ? AND (from_node_id = ? OR to_node_id = ?)", node.ProjectID, node.ID, node.ID).Find(&edges)
	for _, e := range edges {
		otherID := e.FromNodeID
		if otherID == node.ID {
			otherID = e.ToNodeID
		}
		var artifact model.PipelineNode
		if err := h.db.Select("id, type, name, status").First(&artifact, otherID).Error; err != nil {
			continue
		}
		if isPipelineArtifactNode(artifact.Type) && artifact.Status != "final" {
			return artifact, true
		}
	}
	return model.PipelineNode{}, false
}

func visiblePipelineTree(nodes []model.PipelineNode, edges []model.PipelineEdge) ([]model.PipelineNode, []model.PipelineEdge) {
	visibleIDs := map[uint]bool{}
	visibleNodes := make([]model.PipelineNode, 0, len(nodes))
	for _, node := range nodes {
		if isPipelineToolNode(node.Type) {
			continue
		}
		visibleIDs[node.ID] = true
		visibleNodes = append(visibleNodes, node)
	}

	visibleEdges := make([]model.PipelineEdge, 0, len(edges))
	for _, edge := range edges {
		if visibleIDs[edge.FromNodeID] && visibleIDs[edge.ToNodeID] {
			visibleEdges = append(visibleEdges, edge)
		}
	}
	return visibleNodes, visibleEdges
}

func (h *PipelineHandler) wouldCreateCycle(projectID, parentID, childID uint) bool {
	visited := map[uint]bool{}
	queue := []uint{childID}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		if cur == parentID {
			return true
		}
		if visited[cur] {
			continue
		}
		visited[cur] = true

		var edges []model.PipelineEdge
		h.db.Where("project_id = ? AND from_node_id = ?", projectID, cur).Find(&edges)
		for _, e := range edges {
			queue = append(queue, e.ToNodeID)
		}
	}
	return false
}

// currentUserID extracts the authenticated user's ID from context.
func currentUserID(c *gin.Context) uint {
	if u, ok := c.Get(middleware.ContextUserKey); ok {
		return u.(*model.User).ID
	}
	return 0
}

// hasProjectRole checks if a user has one of the given roles in a project.
func hasProjectRole(db *gorm.DB, projectID, userID uint, roles ...string) bool {
	if userID == 0 {
		return false
	}
	var member model.ProjectMember
	if err := db.Where("project_id = ? AND user_id = ?", projectID, userID).First(&member).Error; err != nil {
		return false
	}
	for _, r := range roles {
		if member.Role == r {
			return true
		}
	}
	return false
}

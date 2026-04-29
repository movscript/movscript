package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

type PipelineHandler struct{ db *gorm.DB }

func NewPipelineHandler(db *gorm.DB) *PipelineHandler { return &PipelineHandler{db: db} }

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
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var req service.PipelineNodeInput
	if err := json.Unmarshal(payload, &req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	node := service.NewPipelineNode(req, pid)
	if isPipelineToolNode(node.Type) {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("管线不再支持工具节点类型"))
		return
	}
	if req.ParentID == nil && !isPipelineWorkNode(node.Type) {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("新增工作项只能使用工作节点类型"))
		return
	}
	var parent model.PipelineNode
	if req.ParentID != nil {
		if err := h.db.First(&parent, *req.ParentID).Error; err != nil || parent.ProjectID != pid {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("父节点不存在"))
			return
		}
		if !isPipelineWorkNode(parent.Type) {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("只有工作节点可以创建子节点"))
			return
		}
		if node.LeadID == nil && parent.LeadID != nil {
			node.LeadID = parent.LeadID
		}
	}
	if node.EntityType == "" {
		node.EntityType = pipelineEntityTypeForNode(node.Type)
	}
	node.ContentType = pipelineContentTypeForBinding(node.Type, node.EntityType)
	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&node).Error; err != nil {
			return err
		}
		if req.ParentID != nil {
			if err := tx.Create(&model.PipelineEdge{
				ProjectID:    pid,
				FromNodeID:   *req.ParentID,
				ToNodeID:     node.ID,
				RelationType: "hierarchy",
			}).Error; err != nil {
				return err
			}
		}
		return h.syncPipelineEntityBinding(tx, node)
	}); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
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

	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(payload, &raw); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
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
	if err := json.Unmarshal(payload, &body); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}

	userID := currentUserID(c)
	assignmentTouched := hasJSONField(raw, "assignee_id", "lead_id", "due_date")
	if assignmentTouched && !h.canManageNodeAssignment(node, userID) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要所有者、导演或节点负责人权限"))
		return
	}

	previous := node
	if body.Name != nil {
		node.Name = *body.Name
	}
	if body.Description != nil {
		node.Description = *body.Description
	}
	if rawAssigneeID, ok := raw["assignee_id"]; ok && string(rawAssigneeID) == "null" {
		node.AssigneeID = nil
	} else if body.AssigneeID != nil {
		node.AssigneeID = body.AssigneeID
	}
	if rawLeadID, ok := raw["lead_id"]; ok && string(rawLeadID) == "null" {
		node.LeadID = nil
	} else if body.LeadID != nil {
		node.LeadID = body.LeadID
	}
	if rawDueDate, ok := raw["due_date"]; ok && string(rawDueDate) == "null" {
		node.DueDate = nil
	} else if body.DueDate != nil {
		node.DueDate = body.DueDate
	}
	if rawEntityType, ok := raw["entity_type"]; ok {
		if string(rawEntityType) == "null" {
			node.EntityType = ""
			node.EntityID = nil
		} else {
			var entityType string
			if err := json.Unmarshal(rawEntityType, &entityType); err != nil {
				c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
				return
			}
			node.EntityType = entityType
			if entityType == "" {
				node.EntityID = nil
			}
		}
	}
	if rawEntityID, ok := raw["entity_id"]; ok {
		if string(rawEntityID) == "null" {
			node.EntityID = nil
			node.EntityType = ""
		} else {
			var entityID uint
			if err := json.Unmarshal(rawEntityID, &entityID); err != nil {
				c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
				return
			}
			node.EntityID = &entityID
			if node.EntityType == "" {
				node.EntityType = pipelineEntityTypeForNode(node.Type)
			}
		}
	} else if node.EntityType == "" && body.EntityID != nil {
		node.EntityType = pipelineEntityTypeForNode(node.Type)
	}
	node.ContentType = pipelineContentTypeForBinding(node.Type, node.EntityType)
	if body.PosX != nil {
		node.PosX = *body.PosX
	}
	if body.PosY != nil {
		node.PosY = *body.PosY
	}
	if rawAssigneeID, ok := raw["assignee_id"]; ok && string(rawAssigneeID) != "null" {
		if node.AssigneeID == nil || !h.isProjectMember(node.ProjectID, *node.AssigneeID) {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("执行者必须是项目成员"))
			return
		}
	}
	if rawLeadID, ok := raw["lead_id"]; ok && string(rawLeadID) != "null" {
		if node.LeadID == nil || !h.isProjectMember(node.ProjectID, *node.LeadID) {
			c.JSON(http.StatusBadRequest, apierr.InvalidInput("负责人必须是项目成员"))
			return
		}
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		entityChanged := previous.EntityType != node.EntityType ||
			(previous.EntityID == nil && node.EntityID != nil) ||
			(previous.EntityID != nil && node.EntityID == nil) ||
			(previous.EntityID != nil && node.EntityID != nil && *previous.EntityID != *node.EntityID)
		if entityChanged {
			if err := h.clearPipelineEntityBinding(tx, previous); err != nil {
				return err
			}
		}
		if err := tx.Save(&node).Error; err != nil {
			return err
		}
		if entityChanged {
			return h.syncPipelineEntityBinding(tx, node)
		}
		return nil
	}); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
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
	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := h.clearPipelineEntityBinding(tx, node); err != nil {
			return err
		}
		if err := tx.Where("from_node_id = ? OR to_node_id = ?", nid, nid).Delete(&model.PipelineEdge{}).Error; err != nil {
			return err
		}
		return tx.Delete(&node).Error
	}); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}

// CreateEdge adds a hierarchy relation or an extra dependency between two pipeline nodes.
func (h *PipelineHandler) CreateEdge(c *gin.Context) {
	pid := parseID(c.Param("id"))
	var req service.PipelineEdgeInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	edge := service.NewPipelineEdge(req, pid)
	if edge.RelationType != "hierarchy" && edge.RelationType != "dependency" {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("依赖类型必须是 hierarchy 或 dependency"))
		return
	}

	// Prevent self-loops
	if edge.FromNodeID == edge.ToNodeID {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("节点不能指向自身"))
		return
	}

	var from model.PipelineNode
	if err := h.db.First(&from, edge.FromNodeID).Error; err != nil || from.ProjectID != pid {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("起点节点不存在"))
		return
	}
	if edge.RelationType == "hierarchy" && !isPipelineWorkNode(from.Type) {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("只有工作节点可以挂载子节点"))
		return
	}
	var to model.PipelineNode
	if err := h.db.First(&to, edge.ToNodeID).Error; err != nil || to.ProjectID != pid {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("终点节点不存在"))
		return
	}

	if h.wouldCreateCycle(pid, edge.FromNodeID, edge.ToNodeID) {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("管线 DAG 不允许形成循环"))
		return
	}

	// Prevent duplicate edges
	var existing model.PipelineEdge
	if h.db.Where("project_id = ? AND from_node_id = ? AND to_node_id = ?", pid, edge.FromNodeID, edge.ToNodeID).First(&existing).Error == nil {
		c.JSON(http.StatusConflict, apierr.Conflict("依赖关系已存在"))
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if edge.RelationType == "hierarchy" {
			if err := tx.Where("project_id = ? AND relation_type = ? AND to_node_id = ?", pid, "hierarchy", edge.ToNodeID).Delete(&model.PipelineEdge{}).Error; err != nil {
				return err
			}
		}
		return tx.Create(&edge).Error
	}); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, edge)
}

// DeleteEdge removes a dependency edge.
func (h *PipelineHandler) DeleteEdge(c *gin.Context) {
	var edge model.PipelineEdge
	if err := h.db.First(&edge, c.Param("edgeId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("依赖关系不存在"))
		return
	}
	if edge.RelationType == "hierarchy" {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("父子关系需要在任务层调整，不能作为额外依赖删除"))
		return
	}
	h.db.Delete(&edge)
	c.Status(http.StatusNoContent)
}

// Submit transitions a node from draft (or rejected) to under_review.
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
	userID := currentUserID(c)
	if !h.canSubmitNode(node, userID) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要执行者、负责人、导演或所有者权限"))
		return
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
	if !h.canReviewNode(node, userID) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要所有者、导演或非自审负责人权限"))
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
	if !h.canReviewNode(node, userID) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要所有者、导演或非自审负责人权限"))
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
	userID := currentUserID(c)
	if !h.canReviewNode(node, userID) {
		c.JSON(http.StatusForbidden, apierr.Forbidden("需要所有者、导演或非自审负责人权限"))
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
		if edge.RelationType == "" {
			edge.RelationType = "hierarchy"
		}
		if visibleIDs[edge.FromNodeID] && visibleIDs[edge.ToNodeID] {
			visibleEdges = append(visibleEdges, edge)
		}
	}
	return visibleNodes, visibleEdges
}

func (h *PipelineHandler) visibleNodeCount(projectID uint) int {
	var nodes []model.PipelineNode
	h.db.Select("id, type").Where("project_id = ?", projectID).Find(&nodes)
	count := 0
	for _, node := range nodes {
		if !isPipelineToolNode(node.Type) {
			count++
		}
	}
	return count
}

func (h *PipelineHandler) wouldDeleteNodeBreakSingleRoot(projectID, nodeID uint) bool {
	var nodes []model.PipelineNode
	var edges []model.PipelineEdge
	h.db.Select("id, type").Where("project_id = ?", projectID).Find(&nodes)
	h.db.Select("from_node_id, to_node_id, relation_type").Where("project_id = ?", projectID).Find(&edges)

	before := visibleHierarchyRootCount(nodes, edges, 0)
	after := visibleHierarchyRootCount(nodes, edges, nodeID)
	return after > 1 && after > before
}

func visibleHierarchyRootCount(nodes []model.PipelineNode, edges []model.PipelineEdge, excludedNodeID uint) int {
	remaining := map[uint]bool{}
	for _, node := range nodes {
		if node.ID == excludedNodeID || isPipelineToolNode(node.Type) {
			continue
		}
		remaining[node.ID] = true
	}
	if len(remaining) <= 1 {
		return len(remaining)
	}

	hasParent := map[uint]bool{}
	for _, edge := range edges {
		if edge.RelationType != "" && edge.RelationType != "hierarchy" {
			continue
		}
		if edge.FromNodeID == excludedNodeID || edge.ToNodeID == excludedNodeID {
			continue
		}
		if remaining[edge.FromNodeID] && remaining[edge.ToNodeID] {
			hasParent[edge.ToNodeID] = true
		}
	}

	rootCount := 0
	for id := range remaining {
		if !hasParent[id] {
			rootCount++
		}
	}
	return rootCount
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
	role, ok := projectRole(db, projectID, userID)
	if !ok {
		return false
	}
	for _, r := range roles {
		if role == r {
			return true
		}
	}
	return false
}

func projectRole(db *gorm.DB, projectID, userID uint) (string, bool) {
	if userID == 0 {
		return "", false
	}
	var project model.Project
	if err := db.Select("owner_id").First(&project, projectID).Error; err == nil && project.OwnerID == userID {
		return "owner", true
	}
	var member model.ProjectMember
	if err := db.Where("project_id = ? AND user_id = ?", projectID, userID).First(&member).Error; err == nil {
		return member.Role, true
	}
	return "", false
}

func hasJSONField(raw map[string]json.RawMessage, fields ...string) bool {
	for _, field := range fields {
		if _, ok := raw[field]; ok {
			return true
		}
	}
	return false
}

func (h *PipelineHandler) isProjectMember(projectID, userID uint) bool {
	if userID == 0 {
		return false
	}
	if _, ok := projectRole(h.db, projectID, userID); ok {
		return true
	}
	return false
}

func (h *PipelineHandler) canManageNodeAssignment(node model.PipelineNode, userID uint) bool {
	if hasProjectRole(h.db, node.ProjectID, userID, "owner", "director") {
		return true
	}
	if leadID, ok := h.effectiveLeadID(node); ok && leadID == userID {
		return true
	}
	return false
}

func (h *PipelineHandler) canSubmitNode(node model.PipelineNode, userID uint) bool {
	if hasProjectRole(h.db, node.ProjectID, userID, "owner", "director") {
		return true
	}
	if node.AssigneeID != nil && *node.AssigneeID == userID {
		return true
	}
	if leadID, ok := h.effectiveLeadID(node); ok && leadID == userID {
		return true
	}
	return false
}

func (h *PipelineHandler) canReviewNode(node model.PipelineNode, userID uint) bool {
	if hasProjectRole(h.db, node.ProjectID, userID, "owner", "director") {
		return true
	}
	if node.AssigneeID != nil && *node.AssigneeID == userID {
		return false
	}
	if leadID, ok := h.effectiveLeadID(node); ok && leadID == userID {
		return true
	}
	return false
}

func (h *PipelineHandler) effectiveLeadID(node model.PipelineNode) (uint, bool) {
	visited := map[uint]bool{}
	current := node
	for {
		if current.LeadID != nil {
			return *current.LeadID, true
		}
		if visited[current.ID] {
			return 0, false
		}
		visited[current.ID] = true

		var edge model.PipelineEdge
		if err := h.db.
			Where("project_id = ? AND to_node_id = ? AND (relation_type = ? OR relation_type = '' OR relation_type IS NULL)", current.ProjectID, current.ID, "hierarchy").
			First(&edge).Error; err != nil {
			return 0, false
		}
		if err := h.db.Select("id, project_id, lead_id").First(&current, edge.FromNodeID).Error; err != nil {
			return 0, false
		}
	}
}

package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type TaskHandler struct{ db *gorm.DB }

func NewTaskHandler(db *gorm.DB) *TaskHandler { return &TaskHandler{db: db} }

func (h *TaskHandler) List(c *gin.Context) {
	var tasks []model.Task
	q := h.db.Where("project_id = ?", c.Param("id")).
		Preload("Assignee").
		Order("created_at desc")
	if s := c.Query("status"); s != "" {
		q = q.Where("status = ?", s)
	}
	if rt := c.Query("ref_type"); rt != "" {
		q = q.Where("ref_type = ?", rt)
	}
	q.Find(&tasks)
	c.JSON(http.StatusOK, tasks)
}

func (h *TaskHandler) Create(c *gin.Context) {
	var t model.Task
	if err := c.ShouldBindJSON(&t); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	t.ProjectID = parseID(c.Param("id"))
	if u, ok := c.Get(middleware.ContextUserKey); ok {
		t.CreatorID = u.(*model.User).ID
	}
	h.db.Create(&t)
	h.db.Preload("Assignee").First(&t, t.ID)
	c.JSON(http.StatusCreated, t)
}

func (h *TaskHandler) Update(c *gin.Context) {
	var t model.Task
	if err := h.db.First(&t, c.Param("taskId")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := c.ShouldBindJSON(&t); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.db.Save(&t)
	c.JSON(http.StatusOK, t)
}

func (h *TaskHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Task{}, c.Param("taskId"))
	c.Status(http.StatusNoContent)
}

func (h *TaskHandler) AddComment(c *gin.Context) {
	var comment model.TaskComment
	if err := c.ShouldBindJSON(&comment); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	comment.TaskID = parseID(c.Param("taskId"))
	if u, ok := c.Get(middleware.ContextUserKey); ok {
		comment.UserID = u.(*model.User).ID
	}
	h.db.Create(&comment)
	h.db.Preload("User").First(&comment, comment.ID)
	c.JSON(http.StatusCreated, comment)
}

func (h *TaskHandler) ListComments(c *gin.Context) {
	var comments []model.TaskComment
	h.db.Where("task_id = ?", c.Param("taskId")).Preload("User").Order("created_at").Find(&comments)
	c.JSON(http.StatusOK, comments)
}

// Collaboration returns a project overview for the collaboration dashboard.
func (h *TaskHandler) Collaboration(c *gin.Context) {
	pid := c.Param("id")

	var members []model.ProjectMember
	h.db.Where("project_id = ?", pid).Preload("User").Find(&members)

	var scripts []model.Script
	h.db.Where("project_id = ?", pid).Find(&scripts)

	var scriptIDs []uint
	for _, s := range scripts {
		scriptIDs = append(scriptIDs, s.ID)
	}

	var episodes []model.Episode
	if len(scriptIDs) > 0 {
		h.db.Where("script_id IN ?", scriptIDs).Find(&episodes)
	}

	var scenes []model.Scene
	h.db.Where("project_id = ?", pid).Order("number").Find(&scenes)

	var storyboards []model.Storyboard
	h.db.Joins("JOIN scenes ON scenes.id = storyboards.scene_id").
		Where("scenes.project_id = ?", pid).
		Order("storyboards.scene_id, \"order\"").
		Find(&storyboards)

	// shot status breakdown
	type statusCount struct {
		Status string
		Count  int64
	}
	var shotBreakdown []statusCount
	h.db.Model(&model.Shot{}).
		Joins("JOIN storyboards ON storyboards.id = shots.storyboard_id").
		Joins("JOIN scenes ON scenes.id = storyboards.scene_id").
		Select("shots.status, count(*) as count").
		Where("scenes.project_id = ?", pid).
		Group("shots.status").
		Scan(&shotBreakdown)
	shotMap := map[string]int64{}
	var shotTotal int64
	for _, r := range shotBreakdown {
		shotMap[r.Status] = r.Count
		shotTotal += r.Count
	}

	var tasks []model.Task
	h.db.Where("project_id = ?", pid).Preload("Assignee").Order("created_at desc").Find(&tasks)

	c.JSON(http.StatusOK, gin.H{
		"members":     members,
		"scripts":     scripts,
		"episodes":    episodes,
		"scenes":      scenes,
		"storyboards": storyboards,
		"shots": gin.H{
			"total":        shotTotal,
			"draft":        shotMap["draft"],
			"prompt_ready": shotMap["prompt_ready"],
			"generating":   shotMap["generating"],
			"generated":    shotMap["generated"],
			"approved":     shotMap["approved"],
		},
		"tasks": tasks,
	})
}

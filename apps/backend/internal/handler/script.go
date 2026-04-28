package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type ScriptHandler struct {
	db  *gorm.DB
	svc *ai.AIService
}

func NewScriptHandler(db *gorm.DB, svc *ai.AIService) *ScriptHandler {
	return &ScriptHandler{db: db, svc: svc}
}

func (h *ScriptHandler) List(c *gin.Context) {
	scripts := make([]model.Script, 0)
	q := h.db.Where("project_id = ?", c.Param("id"))
	if t := c.Query("type"); t != "" {
		q = q.Where("script_type = ?", t)
	}
	if nid := c.Query("pipeline_node_id"); nid != "" {
		q = q.Where("pipeline_node_id = ?", nid)
	}
	if aid := c.Query("assignee_id"); aid != "" {
		q = q.Where("assignee_id = ?", aid)
	}
	q.Order(`"order", created_at`).Find(&scripts)
	c.JSON(http.StatusOK, scripts)
}

func (h *ScriptHandler) Create(c *gin.Context) {
	var s model.Script
	if err := c.ShouldBindJSON(&s); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	s.ProjectID = parseID(c.Param("id"))
	if user := currentUser(c); user != nil {
		s.AuthorID = user.ID
	}
	h.db.Create(&s)
	c.JSON(http.StatusCreated, s)
}

func (h *ScriptHandler) Get(c *gin.Context) {
	var s model.Script
	if err := h.db.First(&s, c.Param("scriptId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("剧本不存在"))
		return
	}
	c.JSON(http.StatusOK, s)
}

func (h *ScriptHandler) Update(c *gin.Context) {
	var s model.Script
	if err := h.db.First(&s, c.Param("scriptId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("剧本不存在"))
		return
	}
	if err := c.ShouldBindJSON(&s); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.db.Save(&s)
	c.JSON(http.StatusOK, s)
}

func (h *ScriptHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Script{}, c.Param("scriptId"))
	c.Status(http.StatusNoContent)
}

// Patch applies a partial update to a script.
// Note: review_status is retained for legacy compatibility but is not enabled
// in the current frontend; pipeline node status owns review workflow.
func (h *ScriptHandler) Patch(c *gin.Context) {
	var s model.Script
	if err := h.db.First(&s, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("剧本不存在"))
		return
	}
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	h.db.Model(&s).Updates(body)
	h.db.First(&s, s.ID)
	c.JSON(http.StatusOK, s)
}

// Analyze uses AI to extract content metadata from script text.
func (h *ScriptHandler) Analyze(c *gin.Context) {
	if h.svc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service not configured"})
		return
	}

	var s model.Script
	if err := h.db.First(&s, c.Param("scriptId")).Error; err != nil {
		c.JSON(http.StatusNotFound, apierr.NotFound("剧本不存在"))
		return
	}

	// Allow overriding content via request body
	var body struct {
		Content string `json:"content"`
	}
	c.ShouldBindJSON(&body)
	content := body.Content
	if content == "" {
		content = s.Content
	}
	if strings.TrimSpace(content) == "" {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("剧本内容不能为空"))
		return
	}

	modelConfigID, _, err := h.svc.GetForFeature("script_analyze")
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "暂无可用的 AI 提供商，请先在 AI 配置中添加并启用提供商"})
		return
	}

	var userID uint
	if u := currentUser(c); u != nil {
		userID = u.ID
	}

	prompt := `请分析以下剧本内容，提取关键信息并以纯JSON格式返回。不要有任何额外文字，只返回JSON对象。

JSON结构如下（所有字段均为字符串）：
{
  "summary": "剧本总结，简洁概括主要内容（100-300字）",
  "characters": "主要人物描述，每个人物一段，包含姓名、身份、性格",
  "core_settings": "核心世界观设定和规则",
  "background": "故事背景，时代、地点、社会环境",
  "scenes_desc": "主要场景描述",
  "hook": "核心钩子，最吸引观众的悬念或看点",
  "plot_summary": "剧情推演简要总结，交代主要情节走向"
}

剧本内容：
` + content

	resp, err := h.svc.CallText(context.Background(), userID, modelConfigID, ai.TextRequest{
		MaxTokens: 2000,
		Messages: []ai.Message{
			{Role: "user", Content: prompt},
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI 分析失败: " + err.Error()})
		return
	}

	// Extract JSON from response (handle markdown code blocks)
	raw := strings.TrimSpace(resp.Content)
	if idx := strings.Index(raw, "```json"); idx >= 0 {
		raw = raw[idx+7:]
		if end := strings.Index(raw, "```"); end >= 0 {
			raw = raw[:end]
		}
	} else if idx := strings.Index(raw, "```"); idx >= 0 {
		raw = raw[idx+3:]
		if end := strings.Index(raw, "```"); end >= 0 {
			raw = raw[:end]
		}
	}
	raw = strings.TrimSpace(raw)

	var result struct {
		Summary      string `json:"summary"`
		Characters   string `json:"characters"`
		CoreSettings string `json:"core_settings"`
		Background   string `json:"background"`
		ScenesDesc   string `json:"scenes_desc"`
		Hook         string `json:"hook"`
		PlotSummary  string `json:"plot_summary"`
	}
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		// Return raw content so user can see what AI returned
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error": "AI 返回格式异常，请重试",
			"raw":   resp.Content,
		})
		return
	}

	// Update script fields
	s.Summary = result.Summary
	s.Characters = result.Characters
	s.CoreSettings = result.CoreSettings
	s.Background = result.Background
	s.ScenesDesc = result.ScenesDesc
	s.Hook = result.Hook
	s.PlotSummary = result.PlotSummary
	h.db.Save(&s)

	c.JSON(http.StatusOK, s)
}

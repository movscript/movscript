package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/apierr"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/service"
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

func (h *ScriptHandler) ListAnalyses(c *gin.Context) {
	analyses := make([]model.ScriptAnalysis, 0)
	q := h.db.Where("project_id = ?", c.Param("id"))
	if scriptID := c.Query("script_id"); scriptID != "" {
		q = q.Where("script_id = ?", scriptID)
	}
	q.Order("created_at desc").Find(&analyses)
	c.JSON(http.StatusOK, analyses)
}

func (h *ScriptHandler) Create(c *gin.Context) {
	var req service.ScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	var s model.Script
	service.ApplyScriptInput(&s, req)
	s.ProjectID = parseID(c.Param("id"))
	if err := h.validateScriptEpisodeBinding(&s); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if user := currentUser(c); user != nil {
		s.AuthorID = user.ID
	}
	if err := h.db.Create(&s).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := h.syncEpisodeScriptCompatibility(&s); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "分集剧本关联同步失败: " + err.Error()})
		return
	}
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
	var req service.ScriptInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	service.ApplyScriptInput(&s, req)
	if err := h.validateScriptEpisodeBinding(&s); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if err := h.db.Save(&s).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := h.syncEpisodeScriptCompatibility(&s); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "分集剧本关联同步失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, s)
}

func (h *ScriptHandler) Delete(c *gin.Context) {
	h.db.Delete(&model.Script{}, c.Param("scriptId"))
	c.Status(http.StatusNoContent)
}

// Patch applies a partial update to a script.
// Pipeline node status owns review workflow; scripts only carry content fields.
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
	next := s
	if scriptType, ok := body["script_type"].(string); ok {
		next.ScriptType = scriptType
	}
	if rawEpisodeID, ok := body["episode_id"]; ok {
		next.EpisodeID = nil
		switch v := rawEpisodeID.(type) {
		case float64:
			if v > 0 {
				id := uint(v)
				next.EpisodeID = &id
			}
		case int:
			if v > 0 {
				id := uint(v)
				next.EpisodeID = &id
			}
		case string:
			if v != "" {
				var id uint
				if _, err := fmt.Sscanf(v, "%d", &id); err == nil && id > 0 {
					next.EpisodeID = &id
				}
			}
		}
	}
	if err := h.validateScriptEpisodeBinding(&next); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	updates := service.ScriptPatchUpdates(body)
	if next.ScriptType == "main" {
		updates["episode_id"] = nil
	}
	if len(updates) > 0 {
		if err := h.db.Model(&s).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	h.db.First(&s, s.ID)
	if err := h.syncEpisodeScriptCompatibility(&s); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "分集剧本关联同步失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, s)
}

func (h *ScriptHandler) validateScriptEpisodeBinding(s *model.Script) error {
	if s.ScriptType == "main" {
		s.EpisodeID = nil
		return nil
	}
	if s.ScriptType != "episode" && s.ScriptType != "scene" {
		return fmt.Errorf("剧本类型无效")
	}
	if s.ScriptType == "episode" && s.EpisodeID == nil {
		return fmt.Errorf("分集剧本必须关联分集")
	}
	if s.EpisodeID == nil {
		return nil
	}
	var episode model.Episode
	if err := h.db.Where("id = ? AND project_id = ?", *s.EpisodeID, s.ProjectID).First(&episode).Error; err != nil {
		return fmt.Errorf("关联分集不存在或不属于该项目")
	}
	return nil
}

func (h *ScriptHandler) syncEpisodeScriptCompatibility(s *model.Script) error {
	if err := h.db.Model(&model.Episode{}).
		Where("script_id = ? AND (id <> ? OR ? = 0)", s.ID, currentEpisodeID(s), currentEpisodeID(s)).
		Update("script_id", nil).Error; err != nil {
		return err
	}
	if s.ScriptType != "episode" || s.EpisodeID == nil {
		return h.db.Model(&model.Episode{}).
			Where("script_id = ?", s.ID).
			Update("script_id", nil).Error
	}
	return h.db.Model(&model.Episode{}).
		Where("id = ? AND project_id = ?", *s.EpisodeID, s.ProjectID).
		Update("script_id", s.ID).Error
}

func currentEpisodeID(s *model.Script) uint {
	if s.EpisodeID == nil {
		return 0
	}
	return *s.EpisodeID
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
	h.db.Model(&s).Update("analysis_status", "analyzing")

	var userID uint
	if u := currentUser(c); u != nil {
		userID = u.ID
	}

	prompt := `请分析以下剧本内容，提取关键信息并以纯JSON格式返回。不要有任何额外文字，只返回JSON对象。

JSON结构如下：
{
  "summary": "剧本提纲，用条目概括主要内容",
  "characters": "人物补充说明，保留无法结构化但有用的信息",
  "character_profiles": [
    {
      "id": "c1",
      "name": "人物姓名",
      "identity": "身份",
      "traits": "性格/特征",
      "goal": "欲望/目标",
      "notes": "补充说明"
    }
  ],
  "character_relationships": [
    {
      "id": "r1",
      "source": "c1",
      "target": "c2",
      "label": "关系说明",
      "type": "alliance|family|love|conflict|secret|other"
    }
  ],
  "core_settings": ["核心设定，多条，每条描述一条规则、关系或限制"],
  "background": "时代背景，用一句尽可能短的话描述",
  "scenes_desc": [
    {
      "id": "s1",
      "name": "场景名称或地点",
      "time_of_day": "day|night|dawn|dusk|unknown",
      "period": "时期/年代",
      "description": "空间、时间、氛围、可见元素和调度重点"
    }
  ],
  "props": [
    {
      "id": "pr1",
      "name": "道具名称",
      "category": "类别",
      "usage": "剧情用途",
      "visual_notes": "外观、材质、状态"
    }
  ],
  "hook": "核心钩子，最吸引观众的悬念或看点",
  "plot_summary": "剧情推演提纲，按条目交代主要情节走向",
  "script_points": [
    {
      "id": "p1",
      "content": "剧本正文中的一个关键点或段落摘要",
      "beat_type": "hook|reversal|conflict|release|none",
      "tags": ["标签1", "标签2"]
    }
  ]
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

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		h.db.Model(&s).Update("analysis_status", "failed")
		// Return raw content so user can see what AI returned
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error": "AI 返回格式异常，请重试",
			"raw":   resp.Content,
		})
		return
	}

	// Update script fields
	s.Summary = analysisFieldToText(result["summary"])
	s.Characters = analysisFieldToText(result["characters"])
	s.Hook = analysisFieldToText(result["hook"])
	s.PlotSummary = analysisFieldToText(result["plot_summary"])
	if points, ok := result["script_points"]; ok {
		s.ScriptPoints = analysisFieldToJSON(points)
	}
	s.AnalysisStatus = "analyzed"
	h.db.Save(&s)

	modelConfigIDForAnalysis := modelConfigID
	analysis := model.ScriptAnalysis{
		ProjectID:              s.ProjectID,
		ScriptID:               s.ID,
		Status:                 "draft",
		Summary:                s.Summary,
		WorldSetting:           analysisFieldToText(result["background"]),
		CharacterExtractJSON:   analysisFieldToJSON(result["character_profiles"]),
		SceneExtractJSON:       analysisFieldToJSON(result["scenes_desc"]),
		RelationshipJSON:       analysisFieldToJSON(result["character_relationships"]),
		CoreSettingJSON:        analysisFieldToJSON(result["core_settings"]),
		ScriptPointJSON:        s.ScriptPoints,
		SourceModelConfigID:    &modelConfigIDForAnalysis,
		Prompt:                 prompt,
		RawResponse:            resp.Content,
		NormalizedResponseJSON: analysisFieldToJSON(result),
	}
	if props, ok := result["props"]; ok {
		analysis.PropExtractJSON = analysisFieldToJSON(props)
	} else if props, ok := result["prop_extracts"]; ok {
		analysis.PropExtractJSON = analysisFieldToJSON(props)
	}
	h.db.Create(&analysis)
	if err := h.syncAnalysisToSettings(&s, &analysis, result); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "设定同步失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, s)
}

func (h *ScriptHandler) syncAnalysisToSettings(s *model.Script, analysis *model.ScriptAnalysis, result map[string]interface{}) error {
	return h.syncSettingsFromResult(s, analysis, result, "ai")
}

func (h *ScriptHandler) syncSettingsFromResult(s *model.Script, analysis *model.ScriptAnalysis, result map[string]interface{}, source string) error {
	return h.db.Transaction(func(tx *gorm.DB) error {
		settingByLocalID := make(map[string]model.Setting)
		activeSettingIDs := make(map[uint]bool)
		syncedTypes := make(map[string]bool)

		if _, ok := result["character_profiles"]; ok {
			syncedTypes["character"] = true
			ids, err := syncSettingList(tx, s, analysis, "character", "supporting", result["character_profiles"], source, settingByLocalID)
			if err != nil {
				return err
			}
			for _, id := range ids {
				activeSettingIDs[id] = true
			}
		}
		if _, ok := result["scenes_desc"]; ok {
			syncedTypes["scene"] = true
			ids, err := syncSettingList(tx, s, analysis, "scene", "location", result["scenes_desc"], source, settingByLocalID)
			if err != nil {
				return err
			}
			for _, id := range ids {
				activeSettingIDs[id] = true
			}
		}
		if _, ok := result["background"]; ok {
			syncedTypes["world_rule"] = true
			ids, err := syncSettingList(tx, s, analysis, "world_rule", "world_rule", result["background"], source, settingByLocalID)
			if err != nil {
				return err
			}
			for _, id := range ids {
				activeSettingIDs[id] = true
			}
		}
		if props, ok := result["props"]; ok {
			syncedTypes["prop"] = true
			ids, err := syncSettingList(tx, s, analysis, "prop", "prop", props, source, settingByLocalID)
			if err != nil {
				return err
			}
			for _, id := range ids {
				activeSettingIDs[id] = true
			}
		} else if props, ok := result["prop_extracts"]; ok {
			syncedTypes["prop"] = true
			ids, err := syncSettingList(tx, s, analysis, "prop", "prop", props, source, settingByLocalID)
			if err != nil {
				return err
			}
			for _, id := range ids {
				activeSettingIDs[id] = true
			}
		}
		if _, ok := result["core_settings"]; ok {
			syncedTypes["world_rule"] = true
			ids, err := syncSettingList(tx, s, analysis, "world_rule", "world_rule", result["core_settings"], source, settingByLocalID)
			if err != nil {
				return err
			}
			for _, id := range ids {
				activeSettingIDs[id] = true
			}
		}
		if _, ok := result["character_relationships"]; ok {
			if err := syncSettingRelationships(tx, s, result["character_relationships"], source, settingByLocalID); err != nil {
				return err
			}
		}
		if source == "manual" {
			if err := pruneScriptSettingRefs(tx, s, activeSettingIDs, syncedTypes); err != nil {
				return err
			}
		}
		return nil
	})
}

func syncSettingList(tx *gorm.DB, s *model.Script, analysis *model.ScriptAnalysis, settingType, role string, raw interface{}, source string, settingByLocalID map[string]model.Setting) ([]uint, error) {
	items := normalizeAnalysisItems(raw)
	activeIDs := make([]uint, 0, len(items))
	for index, item := range items {
		name := settingName(item, settingType, index)
		if name == "" {
			continue
		}
		description := settingDescription(item, settingType)
		content := settingContent(item, settingType)
		profileJSON := analysisFieldToJSON(item)
		if settingType == "world_rule" {
			profileJSON = analysisFieldToJSON(map[string]interface{}{"rule": content})
		}
		next := model.Setting{
			ProjectID:      s.ProjectID,
			SourceScriptID: &s.ID,
			Type:           settingType,
			Name:           name,
			Description:    description,
			Content:        content,
			Importance:     settingImportance(s.ScriptType),
			ProfileJSON:    profileJSON,
		}
		if analysis != nil {
			next.SourceAnalysisID = &analysis.ID
		}
		setting, err := upsertAnalysisSetting(tx, s, analysis, next)
		if err != nil {
			return activeIDs, err
		}
		activeIDs = append(activeIDs, setting.ID)
		if localID := stringFromMap(item, "id"); localID != "" {
			settingByLocalID[localID] = setting
		}
		settingByLocalID[setting.Name] = setting
		if err := upsertScriptSettingRef(tx, s, setting, role, item, index, source); err != nil {
			return activeIDs, err
		}
	}
	return activeIDs, nil
}

func upsertAnalysisSetting(tx *gorm.DB, s *model.Script, analysis *model.ScriptAnalysis, next model.Setting) (model.Setting, error) {
	var existing model.Setting
	err := tx.Where("project_id = ? AND type = ? AND name = ?", next.ProjectID, next.Type, next.Name).First(&existing).Error
	if err == nil {
		if existing.Status != "locked" {
			updates := map[string]interface{}{
				"source_script_id": s.ID,
			}
			if analysis != nil {
				updates["source_analysis_id"] = analysis.ID
			}
			if strings.TrimSpace(existing.Description) == "" && next.Description != "" {
				updates["description"] = next.Description
			}
			if strings.TrimSpace(existing.Content) == "" && next.Content != "" {
				updates["content"] = next.Content
			}
			if strings.TrimSpace(existing.ProfileJSON) == "" && next.ProfileJSON != "" {
				updates["profile_json"] = next.ProfileJSON
			}
			if err := tx.Model(&existing).Updates(updates).Error; err != nil {
				return existing, err
			}
			if err := tx.First(&existing, existing.ID).Error; err != nil {
				return existing, err
			}
		}
		return existing, nil
	}
	if err != gorm.ErrRecordNotFound {
		return next, err
	}
	if err := tx.Create(&next).Error; err != nil {
		return next, err
	}
	return next, nil
}

func upsertScriptSettingRef(tx *gorm.DB, s *model.Script, setting model.Setting, role string, item map[string]interface{}, order int, source string) error {
	var ref model.ScriptSettingRef
	err := tx.Where("project_id = ? AND script_id = ? AND setting_id = ?", s.ProjectID, s.ID, setting.ID).First(&ref).Error
	next := model.ScriptSettingRef{
		ProjectID:    s.ProjectID,
		ScriptID:     s.ID,
		SettingID:    setting.ID,
		Role:         role,
		Scope:        s.ScriptType,
		FirstMention: stringFromMap(item, "first_mention"),
		Evidence:     stringFromMap(item, "evidence"),
		Note:         stringFromMap(item, "notes"),
		Emotion:      stringFromMap(item, "emotion"),
		State:        stringFromMap(item, "state"),
		Purpose:      firstStringFromMap(item, "purpose", "usage", "goal"),
		Order:        order,
		Source:       source,
		Confidence:   confidenceForSource(source),
	}
	if err == nil {
		return tx.Model(&ref).Updates(map[string]interface{}{
			"role":          next.Role,
			"scope":         next.Scope,
			"first_mention": next.FirstMention,
			"evidence":      next.Evidence,
			"note":          next.Note,
			"emotion":       next.Emotion,
			"state":         next.State,
			"purpose":       next.Purpose,
			"order":         next.Order,
			"source":        next.Source,
			"confidence":    next.Confidence,
		}).Error
	}
	if err != gorm.ErrRecordNotFound {
		return err
	}
	return tx.Create(&next).Error
}

func syncSettingRelationships(tx *gorm.DB, s *model.Script, raw interface{}, source string, settingByLocalID map[string]model.Setting) error {
	relationships := normalizeAnalysisItems(raw)
	for _, item := range relationships {
		sourceSetting, sourceOK := settingByLocalID[stringFromMap(item, "source")]
		targetSetting, targetOK := settingByLocalID[stringFromMap(item, "target")]
		if !sourceOK || !targetOK || sourceSetting.ID == targetSetting.ID {
			continue
		}
		category := firstStringFromMap(item, "category")
		if category == "" {
			category = "relationship"
		}
		relationship := model.SettingRelationship{
			ProjectID:       s.ProjectID,
			SourceSettingID: sourceSetting.ID,
			TargetSettingID: targetSetting.ID,
			Category:        category,
			Type:            firstStringFromMap(item, "type"),
			Label:           firstStringFromMap(item, "label"),
			Description:     firstStringFromMap(item, "description", "notes"),
			Source:          source,
		}
		if s.ScriptType != "main" {
			relationship.ScopeScriptID = &s.ID
		}
		var existing model.SettingRelationship
		q := tx.Where("project_id = ? AND source_setting_id = ? AND target_setting_id = ? AND category = ? AND type = ?", relationship.ProjectID, relationship.SourceSettingID, relationship.TargetSettingID, relationship.Category, relationship.Type)
		if relationship.ScopeScriptID == nil {
			q = q.Where("scope_script_id IS NULL")
		} else {
			q = q.Where("scope_script_id = ?", *relationship.ScopeScriptID)
		}
		err := q.First(&existing).Error
		if err == nil {
			if err := tx.Model(&existing).Updates(map[string]interface{}{
				"category":    relationship.Category,
				"label":       relationship.Label,
				"description": relationship.Description,
				"source":      relationship.Source,
			}).Error; err != nil {
				return err
			}
			continue
		}
		if err != gorm.ErrRecordNotFound {
			return err
		}
		if err := tx.Create(&relationship).Error; err != nil {
			return err
		}
	}
	return nil
}

func confidenceForSource(source string) float64 {
	if source == "ai" {
		return 0.8
	}
	return 1
}

func pruneScriptSettingRefs(tx *gorm.DB, s *model.Script, activeSettingIDs map[uint]bool, syncedTypes map[string]bool) error {
	if len(syncedTypes) == 0 {
		return nil
	}
	types := make([]string, 0, len(syncedTypes))
	for settingType := range syncedTypes {
		types = append(types, settingType)
	}
	activeIDs := make([]uint, 0, len(activeSettingIDs))
	for id := range activeSettingIDs {
		activeIDs = append(activeIDs, id)
	}
	subQuery := tx.Model(&model.Setting{}).Select("id").Where("project_id = ? AND type IN ?", s.ProjectID, types)
	q := tx.Where("project_id = ? AND script_id = ?", s.ProjectID, s.ID).
		Where("setting_id IN (?)", subQuery)
	if len(activeIDs) > 0 {
		q = q.Where("setting_id NOT IN ?", activeIDs)
	}
	return q.Delete(&model.ScriptSettingRef{}).Error
}

func normalizeAnalysisItems(raw interface{}) []map[string]interface{} {
	switch value := raw.(type) {
	case nil:
		return nil
	case []interface{}:
		items := make([]map[string]interface{}, 0, len(value))
		for index, item := range value {
			switch v := item.(type) {
			case map[string]interface{}:
				items = append(items, v)
			case string:
				items = append(items, map[string]interface{}{
					"id":          fmt.Sprintf("item%d", index+1),
					"name":        v,
					"description": v,
				})
			}
		}
		return items
	case map[string]interface{}:
		return []map[string]interface{}{value}
	case string:
		lines := strings.Split(value, "\n")
		items := make([]map[string]interface{}, 0, len(lines))
		for index, line := range lines {
			text := strings.TrimSpace(strings.TrimLeft(line, "-* "))
			if text != "" {
				items = append(items, map[string]interface{}{
					"id":          fmt.Sprintf("item%d", index+1),
					"name":        text,
					"description": text,
				})
			}
		}
		return items
	default:
		return nil
	}
}

func settingName(item map[string]interface{}, settingType string, index int) string {
	name := firstStringFromMap(item, "name", "title", "location")
	if settingType == "world_rule" && name != "" {
		return truncateRunes(name, 48)
	}
	if name != "" {
		return name
	}
	if settingType == "world_rule" {
		return truncateRunes(firstStringFromMap(item, "description", "content", "rule"), 48)
	}
	return fmt.Sprintf("%s %d", settingType, index+1)
}

func settingDescription(item map[string]interface{}, settingType string) string {
	switch settingType {
	case "character":
		parts := compactStrings(firstStringFromMap(item, "identity"), firstStringFromMap(item, "traits"))
		return strings.Join(parts, " / ")
	case "prop":
		return firstStringFromMap(item, "usage", "category", "description")
	case "scene":
		return firstStringFromMap(item, "description", "visual_notes")
	case "world_rule":
		return firstStringFromMap(item, "description", "content", "rule", "name")
	default:
		return firstStringFromMap(item, "description", "notes")
	}
}

func settingContent(item map[string]interface{}, settingType string) string {
	switch settingType {
	case "character":
		return strings.Join(compactStrings(
			firstStringFromMap(item, "identity"),
			firstStringFromMap(item, "traits"),
			firstStringFromMap(item, "goal"),
			firstStringFromMap(item, "notes"),
		), "\n")
	case "prop":
		return strings.Join(compactStrings(
			firstStringFromMap(item, "category"),
			firstStringFromMap(item, "usage"),
			firstStringFromMap(item, "visual_notes"),
		), "\n")
	case "scene":
		return strings.Join(compactStrings(
			firstStringFromMap(item, "location"),
			firstStringFromMap(item, "time_of_day"),
			firstStringFromMap(item, "period"),
			firstStringFromMap(item, "description", "visual_notes"),
		), "\n")
	case "world_rule":
		return firstStringFromMap(item, "description", "content", "rule", "name")
	default:
		return firstStringFromMap(item, "description", "notes")
	}
}

func settingImportance(scriptType string) string {
	if scriptType == "main" {
		return "main"
	}
	return "supporting"
}

func stringFromMap(item map[string]interface{}, key string) string {
	value, ok := item[key]
	if !ok {
		return ""
	}
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		return strings.TrimSpace(fmt.Sprintf("%g", v))
	default:
		return analysisFieldToText(v)
	}
}

func firstStringFromMap(item map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value := stringFromMap(item, key); value != "" {
			return value
		}
	}
	return ""
}

func compactStrings(values ...string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			out = append(out, strings.TrimSpace(value))
		}
	}
	return out
}

func truncateRunes(value string, max int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= max {
		return string(runes)
	}
	return string(runes[:max])
}

func analysisFieldToText(v interface{}) string {
	switch value := v.(type) {
	case nil:
		return ""
	case string:
		return value
	case []interface{}:
		lines := make([]string, 0, len(value))
		for _, item := range value {
			text := analysisFieldToText(item)
			if text != "" {
				lines = append(lines, "- "+text)
			}
		}
		return strings.Join(lines, "\n")
	case map[string]interface{}:
		if b, err := json.Marshal(value); err == nil {
			return string(b)
		}
	}
	return ""
}

func analysisFieldToJSON(v interface{}) string {
	if v == nil {
		return ""
	}
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

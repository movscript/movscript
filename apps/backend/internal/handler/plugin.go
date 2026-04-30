package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/audit"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/pluginkit"
	"gorm.io/gorm"
)

type PluginHandler struct {
	db *gorm.DB
}

func NewPluginHandler(db *gorm.DB) *PluginHandler {
	return &PluginHandler{db: db}
}

func (h *PluginHandler) List(c *gin.Context) {
	var plugins []model.Plugin
	h.db.Preload("Tools").Order("id").Find(&plugins)
	c.JSON(http.StatusOK, plugins)
}

func (h *PluginHandler) Import(c *gin.Context) {
	var req pluginkit.ImportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := pluginkit.Import(h.db, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	status := http.StatusOK
	if result.Created {
		status = http.StatusCreated
	}
	action := "plugin.imported"
	if !result.Created {
		action = "plugin.updated"
	}
	audit.Record(c, h.db, audit.Event{
		Action:     action,
		TargetType: "plugin",
		TargetID:   audit.TargetID(result.Plugin.ID),
		Metadata: map[string]any{
			"plugin_key": result.Plugin.PluginKey,
			"version":    result.Plugin.Version,
		},
	})
	c.JSON(status, result.Plugin)
}

func (h *PluginHandler) Enable(c *gin.Context) {
	h.setEnabled(c, true)
}

func (h *PluginHandler) Disable(c *gin.Context) {
	h.setEnabled(c, false)
}

func (h *PluginHandler) setEnabled(c *gin.Context, enabled bool) {
	var plugin model.Plugin
	if err := h.db.First(&plugin, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "plugin not found"})
		return
	}
	h.db.Model(&plugin).Update("enabled", enabled)
	plugin.Enabled = enabled
	action := "plugin.disabled"
	if enabled {
		action = "plugin.enabled"
	}
	audit.Record(c, h.db, audit.Event{
		Action:     action,
		TargetType: "plugin",
		TargetID:   audit.TargetID(plugin.ID),
		Metadata: map[string]any{
			"plugin_key": plugin.PluginKey,
			"enabled":    enabled,
		},
	})
	c.JSON(http.StatusOK, plugin)
}

func (h *PluginHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	var plugin model.Plugin
	h.db.First(&plugin, id)
	if err := h.db.Where("plugin_id = ?", id).Delete(&model.PluginTool{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := h.db.Delete(&model.Plugin{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "plugin.deleted",
		TargetType: "plugin",
		TargetID:   id,
		Metadata: map[string]any{
			"plugin_key": plugin.PluginKey,
		},
	})
	c.Status(http.StatusNoContent)
}

func (h *PluginHandler) ToolCatalog(c *gin.Context) {
	var tools []model.PluginTool
	h.db.Preload("Plugin").Joins("JOIN plugins ON plugins.id = plugin_tools.plugin_id").
		Where("plugins.enabled = ? AND plugins.deleted_at IS NULL AND plugin_tools.enabled = ?", true, true).
		Order("plugin_tools.tool_key").Find(&tools)
	c.JSON(http.StatusOK, tools)
}

func (h *PluginHandler) CardCatalog(c *gin.Context) {
	plugins := h.enabledPlugins()
	out := make([]pluginCardResp, 0)
	for _, p := range plugins {
		m, ok := parseStoredManifest(p)
		if !ok {
			continue
		}
		for _, card := range m.Contributes.Cards {
			out = append(out, pluginCardResp{PluginID: p.ID, PluginKey: p.PluginKey, CardContribution: card})
		}
	}
	c.JSON(http.StatusOK, out)
}

func (h *PluginHandler) CanvasNodeCatalog(c *gin.Context) {
	plugins := h.enabledPlugins()
	out := make([]pluginCanvasNodeResp, 0)
	for _, p := range plugins {
		m, ok := parseStoredManifest(p)
		if !ok {
			continue
		}
		for _, node := range m.Contributes.CanvasNodes {
			out = append(out, pluginCanvasNodeResp{PluginID: p.ID, PluginKey: p.PluginKey, CanvasNodeContribution: node})
		}
	}
	c.JSON(http.StatusOK, out)
}

func (h *PluginHandler) WorkflowCatalog(c *gin.Context) {
	plugins := h.enabledPlugins()
	out := make([]pluginWorkflowResp, 0)
	for _, p := range plugins {
		m, ok := parseStoredManifest(p)
		if !ok {
			continue
		}
		for _, workflow := range m.Contributes.Workflows {
			out = append(out, pluginWorkflowResp{PluginID: p.ID, PluginKey: p.PluginKey, WorkflowContribution: workflow})
		}
	}
	c.JSON(http.StatusOK, out)
}

func (h *PluginHandler) enabledPlugins() []model.Plugin {
	var plugins []model.Plugin
	h.db.Where("enabled = ?", true).Order("id").Find(&plugins)
	return plugins
}

type pluginCardResp struct {
	PluginID  uint   `json:"plugin_id"`
	PluginKey string `json:"plugin_key"`
	pluginkit.CardContribution
}

type pluginCanvasNodeResp struct {
	PluginID  uint   `json:"plugin_id"`
	PluginKey string `json:"plugin_key"`
	pluginkit.CanvasNodeContribution
}

type pluginWorkflowResp struct {
	PluginID  uint   `json:"plugin_id"`
	PluginKey string `json:"plugin_key"`
	pluginkit.WorkflowContribution
}

func parseStoredManifest(p model.Plugin) (*pluginkit.Manifest, bool) {
	m, _, err := pluginkit.ParseManifest([]byte(p.Manifest))
	return m, err == nil
}

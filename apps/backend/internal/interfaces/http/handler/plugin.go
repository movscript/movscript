package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	pluginapp "github.com/movscript/movscript/internal/app/plugin"
	"github.com/movscript/movscript/internal/infra/pluginkit"
	audit "github.com/movscript/movscript/internal/interfaces/http/auditlog"
	"gorm.io/gorm"
)

type PluginHandler struct {
	service *pluginapp.Service
	db      *gorm.DB
}

func NewPluginHandler(db *gorm.DB) *PluginHandler {
	return &PluginHandler{service: pluginapp.NewService(db), db: db}
}

func (h *PluginHandler) List(c *gin.Context) {
	plugins, err := h.service.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, plugins)
}

func (h *PluginHandler) Import(c *gin.Context) {
	var req pluginkit.ImportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.service.Import(c.Request.Context(), req)
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
	plugin := result.Plugin
	audit.Record(c, h.db, audit.Event{
		Action:     action,
		TargetType: "plugin",
		TargetID:   audit.TargetID(plugin.ID),
		Metadata: map[string]any{
			"plugin_key": plugin.PluginKey,
			"version":    plugin.Version,
		},
	})
	c.JSON(status, plugin)
}

func (h *PluginHandler) Enable(c *gin.Context) {
	h.setEnabled(c, true)
}

func (h *PluginHandler) Disable(c *gin.Context) {
	h.setEnabled(c, false)
}

func (h *PluginHandler) setEnabled(c *gin.Context, enabled bool) {
	plugin, err := h.service.SetEnabled(c.Request.Context(), parseID(c.Param("id")), enabled)
	if err != nil {
		if !errors.Is(err, pluginapp.ErrNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "plugin not found"})
		return
	}
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
	id := parseID(c.Param("id"))
	plugin, err := h.service.Delete(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "plugin.deleted",
		TargetType: "plugin",
		TargetID:   audit.TargetID(id),
		Metadata: map[string]any{
			"plugin_key": plugin.PluginKey,
		},
	})
	c.Status(http.StatusNoContent)
}

func (h *PluginHandler) ToolCatalog(c *gin.Context) {
	tools, err := h.service.ToolCatalog(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tools)
}

func (h *PluginHandler) CardCatalog(c *gin.Context) {
	out, err := h.service.CardCatalog(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *PluginHandler) CanvasNodeCatalog(c *gin.Context) {
	out, err := h.service.CanvasNodeCatalog(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, out)
}

func (h *PluginHandler) WorkflowCatalog(c *gin.Context) {
	out, err := h.service.WorkflowCatalog(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, out)
}

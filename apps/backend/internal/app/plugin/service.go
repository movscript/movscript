package plugin

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/pluginkit"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("plugin not found")

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

type ImportResult struct {
	Plugin  model.Plugin
	Created bool
}

type CardContribution struct {
	PluginID  uint   `json:"plugin_id"`
	PluginKey string `json:"plugin_key"`
	pluginkit.CardContribution
}

type CanvasNodeContribution struct {
	PluginID  uint   `json:"plugin_id"`
	PluginKey string `json:"plugin_key"`
	pluginkit.CanvasNodeContribution
}

type WorkflowContribution struct {
	PluginID  uint   `json:"plugin_id"`
	PluginKey string `json:"plugin_key"`
	pluginkit.WorkflowContribution
}

func (s *Service) List(ctx context.Context) ([]model.Plugin, error) {
	plugins := make([]model.Plugin, 0)
	err := s.db.WithContext(ctx).Preload("Tools").Order("id").Find(&plugins).Error
	return plugins, err
}

func (s *Service) Import(ctx context.Context, req pluginkit.ImportRequest) (ImportResult, error) {
	result, err := pluginkit.Import(s.db.WithContext(ctx), req)
	if err != nil {
		return ImportResult{}, err
	}
	return ImportResult{Plugin: result.Plugin, Created: result.Created}, nil
}

func (s *Service) SetEnabled(ctx context.Context, id uint, enabled bool) (model.Plugin, error) {
	var plugin model.Plugin
	if err := s.db.WithContext(ctx).First(&plugin, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return plugin, ErrNotFound
		}
		return plugin, err
	}
	if err := s.db.WithContext(ctx).Model(&plugin).Update("enabled", enabled).Error; err != nil {
		return plugin, err
	}
	plugin.Enabled = enabled
	return plugin, nil
}

func (s *Service) Delete(ctx context.Context, id uint) (model.Plugin, error) {
	var plugin model.Plugin
	_ = s.db.WithContext(ctx).First(&plugin, id).Error
	if err := s.db.WithContext(ctx).Where("plugin_id = ?", id).Delete(&model.PluginTool{}).Error; err != nil {
		return plugin, err
	}
	if err := s.db.WithContext(ctx).Delete(&model.Plugin{}, id).Error; err != nil {
		return plugin, err
	}
	return plugin, nil
}

func (s *Service) ToolCatalog(ctx context.Context) ([]model.PluginTool, error) {
	tools := make([]model.PluginTool, 0)
	err := s.db.WithContext(ctx).Preload("Plugin").Joins("JOIN plugins ON plugins.id = plugin_tools.plugin_id").
		Where("plugins.enabled = ? AND plugins.deleted_at IS NULL AND plugin_tools.enabled = ?", true, true).
		Order("plugin_tools.tool_key").Find(&tools).Error
	return tools, err
}

func (s *Service) CardCatalog(ctx context.Context) ([]CardContribution, error) {
	plugins, err := s.enabledPlugins(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]CardContribution, 0)
	for _, p := range plugins {
		m, ok := parseStoredManifest(p)
		if !ok {
			continue
		}
		for _, card := range m.Contributes.Cards {
			out = append(out, CardContribution{PluginID: p.ID, PluginKey: p.PluginKey, CardContribution: card})
		}
	}
	return out, nil
}

func (s *Service) CanvasNodeCatalog(ctx context.Context) ([]CanvasNodeContribution, error) {
	plugins, err := s.enabledPlugins(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]CanvasNodeContribution, 0)
	for _, p := range plugins {
		m, ok := parseStoredManifest(p)
		if !ok {
			continue
		}
		for _, node := range m.Contributes.CanvasNodes {
			out = append(out, CanvasNodeContribution{PluginID: p.ID, PluginKey: p.PluginKey, CanvasNodeContribution: node})
		}
	}
	return out, nil
}

func (s *Service) WorkflowCatalog(ctx context.Context) ([]WorkflowContribution, error) {
	plugins, err := s.enabledPlugins(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]WorkflowContribution, 0)
	for _, p := range plugins {
		m, ok := parseStoredManifest(p)
		if !ok {
			continue
		}
		for _, workflow := range m.Contributes.Workflows {
			out = append(out, WorkflowContribution{PluginID: p.ID, PluginKey: p.PluginKey, WorkflowContribution: workflow})
		}
	}
	return out, nil
}

func (s *Service) enabledPlugins(ctx context.Context) ([]model.Plugin, error) {
	plugins := make([]model.Plugin, 0)
	err := s.db.WithContext(ctx).Where("enabled = ?", true).Order("id").Find(&plugins).Error
	return plugins, err
}

func parseStoredManifest(p model.Plugin) (*pluginkit.Manifest, bool) {
	m, _, err := pluginkit.ParseManifest([]byte(p.Manifest))
	return m, err == nil
}

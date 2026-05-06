package plugin

import (
	"context"
	"errors"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/pluginkit"
	"gorm.io/gorm"
)

type repository interface {
	ListPlugins(ctx context.Context) ([]model.Plugin, error)
	ImportPlugin(ctx context.Context, req pluginkit.ImportRequest) (pluginkit.ImportResult, error)
	GetPlugin(ctx context.Context, id uint) (model.Plugin, error)
	SetEnabled(ctx context.Context, plugin *model.Plugin, enabled bool) error
	DeletePlugin(ctx context.Context, id uint) error
	ToolCatalog(ctx context.Context) ([]model.PluginTool, error)
	EnabledPlugins(ctx context.Context) ([]model.Plugin, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListPlugins(ctx context.Context) ([]model.Plugin, error) {
	plugins := make([]model.Plugin, 0)
	err := r.db.WithContext(ctx).Preload("Tools").Order("id").Find(&plugins).Error
	return plugins, err
}

func (r *gormRepository) ImportPlugin(ctx context.Context, req pluginkit.ImportRequest) (pluginkit.ImportResult, error) {
	result, err := pluginkit.Import(r.db.WithContext(ctx), req)
	if err != nil {
		return pluginkit.ImportResult{}, err
	}
	if result == nil {
		return pluginkit.ImportResult{}, nil
	}
	return *result, nil
}

func (r *gormRepository) GetPlugin(ctx context.Context, id uint) (model.Plugin, error) {
	var plugin model.Plugin
	if err := r.db.WithContext(ctx).First(&plugin, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return plugin, ErrNotFound
		}
		return plugin, err
	}
	return plugin, nil
}

func (r *gormRepository) SetEnabled(ctx context.Context, plugin *model.Plugin, enabled bool) error {
	return r.db.WithContext(ctx).Model(plugin).Update("enabled", enabled).Error
}

func (r *gormRepository) DeletePlugin(ctx context.Context, id uint) error {
	if err := r.db.WithContext(ctx).Where("plugin_id = ?", id).Delete(&model.PluginTool{}).Error; err != nil {
		return err
	}
	return r.db.WithContext(ctx).Delete(&model.Plugin{}, id).Error
}

func (r *gormRepository) ToolCatalog(ctx context.Context) ([]model.PluginTool, error) {
	tools := make([]model.PluginTool, 0)
	err := r.db.WithContext(ctx).Preload("Plugin").Joins("JOIN plugins ON plugins.id = plugin_tools.plugin_id").
		Where("plugins.enabled = ? AND plugins.deleted_at IS NULL AND plugin_tools.enabled = ?", true, true).
		Order("plugin_tools.tool_key").Find(&tools).Error
	return tools, err
}

func (r *gormRepository) EnabledPlugins(ctx context.Context) ([]model.Plugin, error) {
	plugins := make([]model.Plugin, 0)
	err := r.db.WithContext(ctx).Where("enabled = ?", true).Order("id").Find(&plugins).Error
	return plugins, err
}

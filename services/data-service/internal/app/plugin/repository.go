package plugin

import (
	"context"
	"errors"

	domainplugin "github.com/movscript/movscript/internal/domain/plugin"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/plugin"
	"gorm.io/gorm"
)

type repository interface {
	ListPlugins(ctx context.Context) ([]domainplugin.Plugin, error)
	ImportPlugin(ctx context.Context, req plugin.ImportRequest) (domainplugin.Plugin, bool, error)
	GetPlugin(ctx context.Context, id uint) (domainplugin.Plugin, error)
	SetEnabled(ctx context.Context, plugin domainplugin.Plugin, enabled bool) (domainplugin.Plugin, error)
	DeletePlugin(ctx context.Context, id uint) error
	ToolCatalog(ctx context.Context) ([]domainplugin.PluginTool, error)
	EnabledPlugins(ctx context.Context) ([]domainplugin.Plugin, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) ListPlugins(ctx context.Context) ([]domainplugin.Plugin, error) {
	plugins := make([]persistencemodel.Plugin, 0)
	err := r.db.WithContext(ctx).Preload("Tools").Order("id").Find(&plugins).Error
	if err != nil {
		return nil, err
	}
	return domainplugin.PluginsFromModels(plugins), nil
}

func (r *gormRepository) ImportPlugin(ctx context.Context, req plugin.ImportRequest) (domainplugin.Plugin, bool, error) {
	result, err := plugin.Import(r.db.WithContext(ctx), req)
	if err != nil {
		return domainplugin.Plugin{}, false, err
	}
	if result == nil {
		return domainplugin.Plugin{}, false, nil
	}
	return domainplugin.PluginFromModel(result.Plugin), result.Created, nil
}

func (r *gormRepository) GetPlugin(ctx context.Context, id uint) (domainplugin.Plugin, error) {
	var plugin persistencemodel.Plugin
	if err := r.db.WithContext(ctx).First(&plugin, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domainplugin.Plugin{}, ErrNotFound
		}
		return domainplugin.Plugin{}, err
	}
	return domainplugin.PluginFromModel(plugin), nil
}

func (r *gormRepository) SetEnabled(ctx context.Context, plugin domainplugin.Plugin, enabled bool) (domainplugin.Plugin, error) {
	row := persistencemodel.Plugin{Model: gorm.Model{ID: plugin.ID}}
	if err := r.db.WithContext(ctx).Model(&row).Update("enabled", enabled).Error; err != nil {
		return plugin, err
	}
	plugin.Enabled = enabled
	return plugin, nil
}

func (r *gormRepository) DeletePlugin(ctx context.Context, id uint) error {
	if err := r.db.WithContext(ctx).Where("plugin_id = ?", id).Delete(&persistencemodel.PluginTool{}).Error; err != nil {
		return err
	}
	return r.db.WithContext(ctx).Delete(&persistencemodel.Plugin{}, id).Error
}

func (r *gormRepository) ToolCatalog(ctx context.Context) ([]domainplugin.PluginTool, error) {
	tools := make([]persistencemodel.PluginTool, 0)
	err := r.db.WithContext(ctx).Preload("Plugin").Joins("JOIN plugins ON plugins.id = plugin_tools.plugin_id").
		Where("plugins.enabled = ? AND plugins.deleted_at IS NULL AND plugin_tools.enabled = ?", true, true).
		Order("plugin_tools.tool_key").Find(&tools).Error
	if err != nil {
		return nil, err
	}
	return domainplugin.PluginToolsFromModels(tools), nil
}

func (r *gormRepository) EnabledPlugins(ctx context.Context) ([]domainplugin.Plugin, error) {
	plugins := make([]persistencemodel.Plugin, 0)
	err := r.db.WithContext(ctx).Where("enabled = ?", true).Order("id").Find(&plugins).Error
	if err != nil {
		return nil, err
	}
	return domainplugin.PluginsFromModels(plugins), nil
}

package plugin

import "github.com/movscript/movscript/internal/domain/model"

func PluginFromModel(plugin model.Plugin) Plugin {
	return Plugin{
		ID:          plugin.ID,
		PluginKey:   plugin.PluginKey,
		Name:        plugin.Name,
		Version:     plugin.Version,
		Description: plugin.Description,
		Manifest:    plugin.Manifest,
		InstallPath: plugin.InstallPath,
		Enabled:     plugin.Enabled,
		Trusted:     plugin.Trusted,
		Source:      plugin.Source,
		Tools:       PluginToolsFromModels(plugin.Tools),
		CreatedAt:   plugin.CreatedAt,
		UpdatedAt:   plugin.UpdatedAt,
	}
}

func PluginsFromModels(plugins []model.Plugin) []Plugin {
	result := make([]Plugin, 0, len(plugins))
	for _, plugin := range plugins {
		result = append(result, PluginFromModel(plugin))
	}
	return result
}

func PluginToolFromModel(tool model.PluginTool) PluginTool {
	item := PluginTool{
		ID:           tool.ID,
		PluginID:     tool.PluginID,
		ToolKey:      tool.ToolKey,
		Title:        tool.Title,
		Description:  tool.Description,
		InputSchema:  tool.InputSchema,
		OutputSchema: tool.OutputSchema,
		Permissions:  tool.Permissions,
		RuntimeKind:  tool.RuntimeKind,
		Runtime:      tool.Runtime,
		Enabled:      tool.Enabled,
		CreatedAt:    tool.CreatedAt,
		UpdatedAt:    tool.UpdatedAt,
	}
	if tool.Plugin.ID != 0 {
		plugin := PluginFromModel(tool.Plugin)
		item.Plugin = &plugin
	}
	return item
}

func PluginToolsFromModels(tools []model.PluginTool) []PluginTool {
	result := make([]PluginTool, 0, len(tools))
	for _, tool := range tools {
		result = append(result, PluginToolFromModel(tool))
	}
	return result
}

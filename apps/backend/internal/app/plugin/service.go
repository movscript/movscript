package plugin

import (
	"context"
	"errors"

	domainplugin "github.com/movscript/movscript/internal/domain/plugin"
	"github.com/movscript/movscript/internal/infra/plugin"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("plugin not found")

type Service struct {
	repo repository
}

func NewService(db *gorm.DB) *Service {
	return &Service{repo: &gormRepository{db: db}}
}

type ImportResult struct {
	Plugin  domainplugin.Plugin
	Created bool
}

type CardContribution struct {
	PluginID  uint   `json:"plugin_id"`
	PluginKey string `json:"plugin_key"`
	plugin.CardContribution
}

type CanvasNodeContribution struct {
	PluginID  uint   `json:"plugin_id"`
	PluginKey string `json:"plugin_key"`
	plugin.CanvasNodeContribution
}

type WorkflowContribution struct {
	PluginID  uint   `json:"plugin_id"`
	PluginKey string `json:"plugin_key"`
	plugin.WorkflowContribution
}

func (s *Service) List(ctx context.Context) ([]domainplugin.Plugin, error) {
	return s.repo.ListPlugins(ctx)
}

func (s *Service) Import(ctx context.Context, req plugin.ImportRequest) (ImportResult, error) {
	plugin, created, err := s.repo.ImportPlugin(ctx, req)
	if err != nil {
		return ImportResult{}, err
	}
	return ImportResult{Plugin: plugin, Created: created}, nil
}

func (s *Service) SetEnabled(ctx context.Context, id uint, enabled bool) (domainplugin.Plugin, error) {
	plugin, err := s.repo.GetPlugin(ctx, id)
	if err != nil {
		return plugin, err
	}
	plugin, err = s.repo.SetEnabled(ctx, plugin, enabled)
	if err != nil {
		return plugin, err
	}
	return plugin, nil
}

func (s *Service) Delete(ctx context.Context, id uint) (domainplugin.Plugin, error) {
	plugin, err := s.repo.GetPlugin(ctx, id)
	if err != nil {
		return plugin, err
	}
	if err := s.repo.DeletePlugin(ctx, id); err != nil {
		return plugin, err
	}
	return plugin, nil
}

func (s *Service) ToolCatalog(ctx context.Context) ([]domainplugin.PluginTool, error) {
	return s.repo.ToolCatalog(ctx)
}

func (s *Service) CardCatalog(ctx context.Context) ([]CardContribution, error) {
	plugins, err := s.repo.EnabledPlugins(ctx)
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
	plugins, err := s.repo.EnabledPlugins(ctx)
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
	plugins, err := s.repo.EnabledPlugins(ctx)
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

func parseStoredManifest(p domainplugin.Plugin) (*plugin.Manifest, bool) {
	m, _, err := plugin.ParseManifest([]byte(p.Manifest))
	return m, err == nil
}

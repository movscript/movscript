package pluginkit

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ManifestFilename    = "movplugin.json"
	AltManifestFilename = "plugin.json"
)

type ImportRequest struct {
	Path     string          `json:"path"`
	Manifest json.RawMessage `json:"manifest"`
	Source   string          `json:"source"`
	Trusted  bool            `json:"trusted"`
	Enabled  *bool           `json:"enabled"`
}

type ImportResult struct {
	Plugin  model.Plugin `json:"plugin"`
	Created bool         `json:"created"`
}

func LoadManifestFromPath(path string) ([]byte, string, error) {
	if strings.TrimSpace(path) == "" {
		return nil, "", errors.New("path is required")
	}
	stat, err := os.Stat(path)
	if err != nil {
		return nil, "", err
	}
	if stat.IsDir() {
		for _, name := range []string{ManifestFilename, AltManifestFilename} {
			p := filepath.Join(path, name)
			if _, err := os.Stat(p); err == nil {
				raw, readErr := os.ReadFile(p)
				return raw, path, readErr
			}
		}
		return nil, "", fmt.Errorf("%s or %s not found in %s", ManifestFilename, AltManifestFilename, path)
	}
	if strings.EqualFold(filepath.Ext(path), ".zip") || strings.EqualFold(filepath.Ext(path), ".movplugin") {
		raw, err := readManifestFromZip(path)
		return raw, path, err
	}
	raw, err := os.ReadFile(path)
	return raw, filepath.Dir(path), err
}

func readManifestFromZip(path string) ([]byte, error) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	defer zr.Close()
	for _, f := range zr.File {
		base := filepath.Base(f.Name)
		if base != ManifestFilename && base != AltManifestFilename {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		defer rc.Close()
		var buf bytes.Buffer
		if _, err := io.Copy(&buf, rc); err != nil {
			return nil, err
		}
		return buf.Bytes(), nil
	}
	return nil, fmt.Errorf("%s not found in package", ManifestFilename)
}

func Import(db *gorm.DB, req ImportRequest) (*ImportResult, error) {
	var raw []byte
	installPath := ""
	source := firstNonEmpty(req.Source, "manifest")
	if len(req.Manifest) > 0 {
		raw = req.Manifest
	} else if req.Path != "" {
		var err error
		raw, installPath, err = LoadManifestFromPath(req.Path)
		if err != nil {
			return nil, err
		}
		if req.Source == "" {
			source = "local_path"
		}
	} else {
		return nil, errors.New("manifest or path is required")
	}

	m, normalized, err := ParseManifest(raw)
	if err != nil {
		return nil, err
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	plugin := model.Plugin{
		PluginKey:   m.ID,
		Name:        m.Name,
		Version:     m.Version,
		Description: m.Description,
		Manifest:    normalized,
		InstallPath: installPath,
		Enabled:     enabled,
		Trusted:     req.Trusted,
		Source:      source,
	}

	var created bool
	err = db.Transaction(func(tx *gorm.DB) error {
		var existing model.Plugin
		if err := tx.Where("plugin_key = ?", m.ID).First(&existing).Error; err == nil {
			plugin.ID = existing.ID
			if err := tx.Model(&existing).Updates(map[string]any{
				"name":         plugin.Name,
				"version":      plugin.Version,
				"description":  plugin.Description,
				"manifest":     plugin.Manifest,
				"install_path": plugin.InstallPath,
				"enabled":      plugin.Enabled,
				"trusted":      plugin.Trusted,
				"source":       plugin.Source,
			}).Error; err != nil {
				return err
			}
			if err := tx.Where("plugin_id = ?", existing.ID).Delete(&model.PluginTool{}).Error; err != nil {
				return err
			}
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			if err := tx.Create(&plugin).Error; err != nil {
				return err
			}
			created = true
		} else {
			return err
		}

		tools := toolRows(plugin.ID, m)
		for _, tool := range tools {
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "tool_key"}},
				UpdateAll: true,
			}).Create(&tool).Error; err != nil {
				return err
			}
		}
		return tx.Preload("Tools").First(&plugin, plugin.ID).Error
	})
	if err != nil {
		return nil, err
	}
	return &ImportResult{Plugin: plugin, Created: created}, nil
}

func toolRows(pluginID uint, m *Manifest) []model.PluginTool {
	rows := make([]model.PluginTool, 0, len(m.Contributes.Tools))
	for _, tool := range m.Contributes.Tools {
		input := string(tool.InputSchema)
		output := string(tool.OutputSchema)
		perms := tool.Permissions
		if len(perms) == 0 {
			perms = m.Permissions
		}
		permsRaw, _ := json.Marshal(perms)
		rt := effectiveRuntime(m.Runtime, tool.Runtime)
		rtRaw, _ := json.Marshal(rt)
		rows = append(rows, model.PluginTool{
			PluginID:     pluginID,
			ToolKey:      ToolKey(m.ID, tool.ID),
			Title:        tool.Title,
			Description:  tool.Description,
			InputSchema:  input,
			OutputSchema: output,
			Permissions:  string(permsRaw),
			RuntimeKind:  rt.Kind,
			Runtime:      string(rtRaw),
			Enabled:      true,
		})
	}
	return rows
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

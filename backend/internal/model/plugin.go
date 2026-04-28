package model

import (
	"gorm.io/gorm"
)

// Plugin is an installed extension package. The manifest is the source of
// truth for contributed tools, cards, and canvas nodes.
type Plugin struct {
	gorm.Model
	PluginKey   string `gorm:"uniqueIndex;not null;size:128" json:"plugin_key"`
	Name        string `gorm:"not null;size:128" json:"name"`
	Version     string `gorm:"not null;size:64" json:"version"`
	Description string `gorm:"size:512" json:"description"`
	Manifest    string `gorm:"type:text;not null" json:"manifest"`
	InstallPath string `gorm:"size:1024" json:"install_path"`
	Enabled     bool   `gorm:"default:true;index" json:"enabled"`
	Trusted     bool   `gorm:"default:false;index" json:"trusted"`
	Source      string `gorm:"size:64" json:"source"` // manifest | local_path | package | builtin
	Tools       []PluginTool
}

// PluginTool is a flattened index for model/system callable plugin tools.
type PluginTool struct {
	gorm.Model
	PluginID     uint   `gorm:"not null;index" json:"plugin_id"`
	ToolKey      string `gorm:"uniqueIndex;not null;size:160" json:"tool_key"`
	Title        string `gorm:"not null;size:128" json:"title"`
	Description  string `gorm:"size:512" json:"description"`
	InputSchema  string `gorm:"type:text" json:"input_schema"`
	OutputSchema string `gorm:"type:text" json:"output_schema"`
	Permissions  string `gorm:"type:text" json:"permissions"`
	RuntimeKind  string `gorm:"size:32" json:"runtime_kind"`
	Runtime      string `gorm:"type:text" json:"runtime"`
	Enabled      bool   `gorm:"default:true;index" json:"enabled"`
	Plugin       Plugin `json:"plugin,omitempty"`
}

// PluginSecret stores encrypted plugin-specific secrets.
type PluginSecret struct {
	gorm.Model
	PluginID       uint   `gorm:"not null;index" json:"plugin_id"`
	Key            string `gorm:"not null;size:128" json:"key"`
	EncryptedValue string `gorm:"type:text;not null" json:"-"`
}

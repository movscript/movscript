package plugin

import "time"

type Plugin struct {
	ID          uint         `json:"ID"`
	PluginKey   string       `json:"plugin_key"`
	Name        string       `json:"name"`
	Version     string       `json:"version"`
	Description string       `json:"description"`
	Manifest    string       `json:"manifest"`
	InstallPath string       `json:"install_path"`
	Enabled     bool         `json:"enabled"`
	Trusted     bool         `json:"trusted"`
	Source      string       `json:"source"`
	Tools       []PluginTool `json:"Tools,omitempty"`
	CreatedAt   time.Time    `json:"CreatedAt"`
	UpdatedAt   time.Time    `json:"UpdatedAt"`
}

type PluginTool struct {
	ID           uint      `json:"ID"`
	PluginID     uint      `json:"plugin_id"`
	ToolKey      string    `json:"tool_key"`
	Title        string    `json:"title"`
	Description  string    `json:"description"`
	InputSchema  string    `json:"input_schema"`
	OutputSchema string    `json:"output_schema"`
	Permissions  string    `json:"permissions"`
	RuntimeKind  string    `json:"runtime_kind"`
	Runtime      string    `json:"runtime"`
	Enabled      bool      `json:"enabled"`
	Plugin       *Plugin   `json:"plugin,omitempty"`
	CreatedAt    time.Time `json:"CreatedAt"`
	UpdatedAt    time.Time `json:"UpdatedAt"`
}

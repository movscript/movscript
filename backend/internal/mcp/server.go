// Package mcp implements a Model Context Protocol (MCP) server.
// Transport: Streamable HTTP (POST /mcp).
// Protocol: JSON-RPC 2.0, MCP version 2024-11-05.
package mcp

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Server handles MCP JSON-RPC requests.
type Server struct {
	db       *gorm.DB
	registry *Registry
	token    string // optional Bearer token; empty = no auth
}

func NewServer(db *gorm.DB, token string) *Server {
	return &Server{
		db:       db,
		registry: NewRegistry(db),
		token:    token,
	}
}

// Handle is the Gin handler for POST /mcp.
func (s *Server) Handle(c *gin.Context) {
	// Optional token auth.
	if s.token != "" {
		auth := c.GetHeader("Authorization")
		if auth != "Bearer "+s.token {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid MCP token"})
			return
		}
	}

	var req Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, s.errResp(nil, ErrParse, "parse error"))
		return
	}

	if req.Jsonrpc != "2.0" {
		c.JSON(http.StatusOK, s.errResp(req.ID, ErrInvalidRequest, "jsonrpc must be '2.0'"))
		return
	}

	resp := s.dispatch(c, req)
	// Notifications (no ID) have no response.
	if req.ID == nil {
		c.Status(http.StatusAccepted)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (s *Server) dispatch(c *gin.Context, req Request) Response {
	switch req.Method {
	case "initialize":
		return s.handleInitialize(req)
	case "initialized":
		// Notification — nothing to return.
		return Response{}
	case "ping":
		return s.ok(req.ID, map[string]string{})
	case "tools/list":
		return s.ok(req.ID, ToolsListResult{Tools: s.registry.List()})
	case "tools/call":
		return s.handleToolCall(c, req)
	case "resources/list":
		return s.ok(req.ID, map[string]any{"resources": []any{}})
	case "prompts/list":
		return s.ok(req.ID, map[string]any{"prompts": []any{}})
	default:
		return s.errResp(req.ID, ErrMethodNotFound, "method not found: "+req.Method)
	}
}

func (s *Server) handleInitialize(req Request) Response {
	return s.ok(req.ID, InitializeResult{
		ProtocolVersion: ProtocolVersion,
		ServerInfo:      ServerInfo{Name: "movscript", Version: "1.0.0"},
		Capabilities: Capabilities{
			Tools: &ToolsCapability{},
		},
	})
}

func (s *Server) handleToolCall(c *gin.Context, req Request) Response {
	var params ToolCallParams
	if err := json.Unmarshal(req.Params, &params); err != nil {
		return s.errResp(req.ID, ErrInvalidParams, "invalid params")
	}
	result := s.registry.Call(c.Request.Context(), params.Name, params.Arguments, s.db)
	return s.ok(req.ID, result)
}

func (s *Server) ok(id *json.RawMessage, result any) Response {
	return Response{Jsonrpc: "2.0", ID: id, Result: result}
}

func (s *Server) errResp(id *json.RawMessage, code int, msg string) Response {
	return Response{Jsonrpc: "2.0", ID: id, Error: &RPCError{Code: code, Message: msg}}
}

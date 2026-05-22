package handler

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	adminsettings "github.com/movscript/movscript/internal/app/admin/settings"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	audit "github.com/movscript/movscript/internal/interfaces/http/audit"
	"gorm.io/gorm"
)

type AdminSettingsHandler struct {
	db      *gorm.DB
	service *adminsettings.Service
}

var generationToolHTTPClient = http.DefaultClient

func NewAdminSettingsHandler(db *gorm.DB, encryptionKeyHex string) *AdminSettingsHandler {
	return &AdminSettingsHandler{db: db, service: adminsettings.NewService(db, encryptionKeyHex)}
}

func (h *AdminSettingsHandler) GetAuthSettings(c *gin.Context) {
	settings, err := h.service.PublicAuthSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询认证设置失败"))
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminSettingsHandler) UpdateAuthSettings(c *gin.Context) {
	var req adminsettings.AuthSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.UpdateAuthSettings(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, adminsettings.ErrInvalidAuthSettings) {
			c.JSON(http.StatusBadRequest, api.InvalidInput("认证设置无效：开放注册必须启用邮箱验证码并配置 SMTP"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("保存认证设置失败"))
		return
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.auth.admin_updated",
		TargetType: "admin_setting",
		TargetID:   adminsettings.AuthSettingsKey,
		Metadata: map[string]any{
			"registration_enabled":       updated.RegistrationEnabled,
			"require_email_verification": updated.RequireEmailVerification,
			"email_enabled":              updated.Email.Enabled,
			"smtp_host":                  updated.Email.Host,
			"smtp_port":                  updated.Email.Port,
			"smtp_username_set":          updated.Email.Username != "",
			"smtp_password_set":          updated.Email.PasswordSet,
			"from_email":                 updated.Email.FromEmail,
			"use_tls":                    updated.Email.UseTLS,
			"use_start_tls":              updated.Email.UseStartTLS,
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *AdminSettingsHandler) GetGenerationToolsSettings(c *gin.Context) {
	settings, err := h.service.PublicGenerationToolsSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询生成工具设置失败"))
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminSettingsHandler) UpdateGenerationToolsSettings(c *gin.Context) {
	var req adminsettings.GenerationToolsSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.UpdateGenerationToolsSettings(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, adminsettings.ErrInvalidGenerationToolsSettings) {
			c.JSON(http.StatusBadRequest, api.InvalidInput("生成工具设置无效：启用服务器必须填写 http/https Base URL，超时需在 1000-600000ms 之间"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("保存生成工具设置失败"))
		return
	}
	serverMeta := make([]map[string]any, 0, len(updated.Servers))
	for _, server := range updated.Servers {
		serverMeta = append(serverMeta, map[string]any{
			"id":           server.ID,
			"type":         server.Type,
			"name":         server.Name,
			"enabled":      server.Enabled,
			"base_url":     server.BaseURL,
			"timeout_ms":   server.TimeoutMS,
			"priority":     server.Priority,
			"auth_kind":    server.AuthKind,
			"username_set": server.Username != "",
			"password_set": server.PasswordSet,
			"token_set":    server.TokenSet,
			"tags":         server.Tags,
		})
	}
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.generation_tools.admin_updated",
		TargetType: "admin_setting",
		TargetID:   adminsettings.GenerationToolsSettingsKey,
		Metadata: map[string]any{
			"allow_local":        updated.AllowLocal,
			"default_server_id":  updated.DefaultServerID,
			"default_server_ids": updated.DefaultServerIDs,
			"server_count":       len(updated.Servers),
			"servers":            serverMeta,
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *AdminSettingsHandler) GetOrgGenerationToolsSettings(c *gin.Context) {
	member := currentOrgMember(c)
	if member == nil {
		c.JSON(http.StatusForbidden, api.Forbidden("无工作区信息"))
		return
	}
	settings, err := h.service.PublicOrgGenerationToolsSettings(c.Request.Context(), member.OrgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询组织生成工具设置失败"))
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *AdminSettingsHandler) UpdateOrgGenerationToolsSettings(c *gin.Context) {
	member := currentOrgMember(c)
	if member == nil {
		c.JSON(http.StatusForbidden, api.Forbidden("无工作区信息"))
		return
	}
	var req adminsettings.GenerationToolsSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	updated, err := h.service.UpdateOrgGenerationToolsSettings(c.Request.Context(), member.OrgID, req)
	if err != nil {
		if errors.Is(err, adminsettings.ErrInvalidGenerationToolsSettings) {
			c.JSON(http.StatusBadRequest, api.InvalidInput("组织生成工具设置无效：启用服务器必须填写 http/https Base URL，超时需在 1000-600000ms 之间"))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Internal("保存组织生成工具设置失败"))
		return
	}
	var actorID *uint
	if user := currentUser(c); user != nil {
		actorID = &user.ID
	}
	orgID := member.OrgID
	audit.Record(c, h.db, audit.Event{
		Action:     "settings.generation_tools.org_updated",
		TargetType: "org_setting",
		TargetID:   adminsettings.OrgGenerationToolsSettingsKey(orgID),
		ActorID:    actorID,
		OrgID:      &orgID,
		Metadata: map[string]any{
			"allow_local":        updated.AllowLocal,
			"default_server_id":  updated.DefaultServerID,
			"default_server_ids": updated.DefaultServerIDs,
			"server_count":       len(updated.Servers),
		},
	})
	c.JSON(http.StatusOK, updated)
}

func (h *AdminSettingsHandler) GetRuntimeGenerationToolsSettings(c *gin.Context) {
	settings, err := h.publicRuntimeGenerationToolsSettings(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询生成工具设置失败"))
		return
	}
	c.JSON(http.StatusOK, settings)
}

type generationToolCallRequest struct {
	ToolType    string         `json:"tool_type"`
	ServerID    string         `json:"server_id"`
	ServerScope string         `json:"server_scope,omitempty"`
	Operation   string         `json:"operation"`
	Path        string         `json:"path,omitempty"`
	Workflow    map[string]any `json:"workflow,omitempty"`
	Payload     map[string]any `json:"payload,omitempty"`
	ClientID    string         `json:"client_id,omitempty"`
	PromptID    string         `json:"prompt_id,omitempty"`
	Filename    string         `json:"filename,omitempty"`
	Subfolder   string         `json:"subfolder,omitempty"`
	FileType    string         `json:"file_type,omitempty"`
}

func (h *AdminSettingsHandler) ProxyGenerationToolCall(c *gin.Context) {
	var req generationToolCallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	settings, err := h.privateRuntimeGenerationToolsSettings(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal("查询生成工具设置失败"))
		return
	}
	server, ok := findRuntimeGenerationToolServer(settings, req.ToolType, req.ServerID, req.ServerScope)
	if !ok {
		c.JSON(http.StatusNotFound, api.NotFound("生成工具服务器不存在或未启用"))
		return
	}
	path, body, err := generationToolProxyRequest(server, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	if server.Type == "comfyui" && strings.TrimSpace(strings.ToLower(req.Operation)) == "view" {
		data, statusCode, err := callGenerationToolServerBytes(c, server, path)
		if err != nil {
			c.JSON(statusCode, api.Internal(err.Error()))
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
			"server": runtimeGenerationToolServerPublic(server),
			"data":   data,
		})
		return
	}
	data, statusCode, err := callGenerationToolServer(c, server, path, body)
	if err != nil {
		c.JSON(statusCode, api.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"server": runtimeGenerationToolServerPublic(server),
		"data":   data,
	})
}

func (h *AdminSettingsHandler) publicRuntimeGenerationToolsSettings(c *gin.Context) (adminsettings.GenerationToolsSettings, error) {
	adminSettings, err := h.service.PublicGenerationToolsSettings(c.Request.Context())
	if err != nil {
		return adminSettings, err
	}
	member := currentOrgMember(c)
	if member == nil {
		return adminSettings, nil
	}
	orgSettings, err := h.service.PublicOrgGenerationToolsSettings(c.Request.Context(), member.OrgID)
	if err != nil {
		return adminSettings, err
	}
	return mergeRuntimeGenerationToolsSettings(adminSettings, orgSettings), nil
}

func (h *AdminSettingsHandler) privateRuntimeGenerationToolsSettings(c *gin.Context) (adminsettings.GenerationToolsSettings, error) {
	adminSettings, err := h.service.GenerationToolsSettings(c.Request.Context())
	if err != nil {
		return adminSettings, err
	}
	member := currentOrgMember(c)
	if member == nil {
		return adminSettings, nil
	}
	orgSettings, err := h.service.OrgGenerationToolsSettings(c.Request.Context(), member.OrgID)
	if err != nil {
		return adminSettings, err
	}
	return mergeRuntimeGenerationToolsSettings(adminSettings, orgSettings), nil
}

func mergeRuntimeGenerationToolsSettings(adminSettings adminsettings.GenerationToolsSettings, orgSettings adminsettings.GenerationToolsSettings) adminsettings.GenerationToolsSettings {
	merged := adminsettings.GenerationToolsSettings{
		AllowLocal:       adminSettings.AllowLocal && orgSettings.AllowLocal,
		DefaultServerID:  adminSettings.DefaultServerID,
		DefaultServerIDs: mergeRuntimeGenerationToolDefaultServerIDs(adminSettings.DefaultServerIDs, orgSettings.DefaultServerIDs),
		Servers:          make([]adminsettings.GenerationToolServer, 0, len(orgSettings.Servers)+len(adminSettings.Servers)),
	}
	if orgSettings.DefaultServerID != "" {
		merged.DefaultServerID = orgSettings.DefaultServerID
	}
	merged.Servers = append(merged.Servers, orgSettings.Servers...)
	merged.Servers = append(merged.Servers, adminSettings.Servers...)
	return merged
}

func mergeRuntimeGenerationToolDefaultServerIDs(adminDefaults, orgDefaults map[string]string) map[string]string {
	merged := map[string]string{}
	for key, value := range adminDefaults {
		if value != "" {
			merged[key] = value
		}
	}
	for key, value := range orgDefaults {
		if value != "" {
			merged[key] = value
		}
	}
	if len(merged) == 0 {
		return nil
	}
	return merged
}

func findRuntimeGenerationToolServer(settings adminsettings.GenerationToolsSettings, toolType, serverID, serverScope string) (adminsettings.GenerationToolServer, bool) {
	toolType = strings.TrimSpace(strings.ToLower(toolType))
	serverID = strings.TrimSpace(serverID)
	serverScope = strings.TrimSpace(strings.ToLower(serverScope))
	defaultServerID := strings.TrimSpace(settings.DefaultServerIDs[toolType])
	if defaultServerID == "" {
		defaultServerID = strings.TrimSpace(settings.DefaultServerID)
	}
	var fallback *adminsettings.GenerationToolServer
	for i := range settings.Servers {
		server := settings.Servers[i]
		if !server.Enabled || server.Type != toolType {
			continue
		}
		if serverScope != "" && server.Scope != serverScope {
			continue
		}
		if serverID != "" && server.ID == serverID {
			return server, true
		}
		if serverID == "" && defaultServerID != "" && server.ID == defaultServerID {
			return server, true
		}
		if serverID == "" && betterRuntimeGenerationToolFallback(server, fallback) {
			current := server
			fallback = &current
		}
	}
	if serverID == "" && fallback != nil {
		return *fallback, true
	}
	return adminsettings.GenerationToolServer{}, false
}

func betterRuntimeGenerationToolFallback(server adminsettings.GenerationToolServer, current *adminsettings.GenerationToolServer) bool {
	if current == nil {
		return true
	}
	return generationToolRuntimeScopeRank(server.Scope) < generationToolRuntimeScopeRank(current.Scope) ||
		(generationToolRuntimeScopeRank(server.Scope) == generationToolRuntimeScopeRank(current.Scope) && server.Priority < current.Priority)
}

func generationToolRuntimeScopeRank(scope string) int {
	switch scope {
	case "org":
		return 0
	case "admin":
		return 1
	default:
		return 2
	}
}

func generationToolProxyRequest(server adminsettings.GenerationToolServer, req generationToolCallRequest) (string, map[string]any, error) {
	operation := strings.TrimSpace(strings.ToLower(req.Operation))
	switch server.Type {
	case "comfyui":
		switch operation {
		case "status":
			return "/system_stats", nil, nil
		case "object_info":
			return "/object_info", nil, nil
		case "queue":
			return "/queue", nil, nil
		case "history":
			if strings.TrimSpace(req.PromptID) == "" {
				return "/history", nil, nil
			}
			return "/history/" + urlPathEscape(req.PromptID), nil, nil
		case "view":
			if strings.TrimSpace(req.Filename) == "" {
				return "", nil, errors.New("view requires filename")
			}
			values := url.Values{}
			values.Set("filename", strings.TrimSpace(req.Filename))
			if strings.TrimSpace(req.Subfolder) != "" {
				values.Set("subfolder", strings.TrimSpace(req.Subfolder))
			}
			fileType := strings.TrimSpace(req.FileType)
			if fileType == "" {
				fileType = "output"
			}
			values.Set("type", fileType)
			return "/view?" + values.Encode(), nil, nil
		case "queue_prompt":
			if req.Workflow == nil {
				return "", nil, errors.New("queue_prompt requires workflow")
			}
			body := map[string]any{"prompt": req.Workflow}
			if strings.TrimSpace(req.ClientID) != "" {
				body["client_id"] = strings.TrimSpace(req.ClientID)
			}
			return "/prompt", body, nil
		default:
			return "", nil, errors.New("unsupported ComfyUI operation")
		}
	case "webui":
		switch operation {
		case "status", "progress":
			return "/sdapi/v1/progress?skip_current_image=true", nil, nil
		case "models":
			return "/sdapi/v1/sd-models", nil, nil
		case "txt2img":
			if req.Payload == nil {
				return "", nil, errors.New("txt2img requires payload")
			}
			return "/sdapi/v1/txt2img", req.Payload, nil
		case "img2img":
			if req.Payload == nil {
				return "", nil, errors.New("img2img requires payload")
			}
			return "/sdapi/v1/img2img", req.Payload, nil
		case "get":
			if !strings.HasPrefix(req.Path, "/sdapi/v1/") || strings.Contains(req.Path, "://") {
				return "", nil, errors.New("get requires a safe /sdapi/v1/... path")
			}
			return req.Path, nil, nil
		default:
			return "", nil, errors.New("unsupported WebUI operation")
		}
	default:
		return "", nil, errors.New("unsupported generation tool type")
	}
}

func callGenerationToolServerBytes(c *gin.Context, server adminsettings.GenerationToolServer, path string) (any, int, error) {
	upstreamReq, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, strings.TrimRight(server.BaseURL, "/")+path, nil)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	if server.AuthKind == "bearer" && server.Token != "" {
		upstreamReq.Header.Set("Authorization", "Bearer "+server.Token)
	} else if server.AuthKind == "basic" && server.Username != "" && server.Password != "" {
		upstreamReq.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(server.Username+":"+server.Password)))
	}
	client := *generationToolHTTPClient
	client.Timeout = time.Duration(server.TimeoutMS) * time.Millisecond
	res, err := client.Do(upstreamReq)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 24<<20))
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, http.StatusBadGateway, errors.New("生成工具服务器调用失败")
	}
	mimeType := strings.TrimSpace(strings.Split(res.Header.Get("Content-Type"), ";")[0])
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	return gin.H{
		"mime_type": mimeType,
		"base64":    base64.StdEncoding.EncodeToString(raw),
	}, http.StatusOK, nil
}

func callGenerationToolServer(c *gin.Context, server adminsettings.GenerationToolServer, path string, body map[string]any) (any, int, error) {
	var reader io.Reader
	method := http.MethodGet
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		reader = bytes.NewReader(raw)
		method = http.MethodPost
	}
	upstreamReq, err := http.NewRequestWithContext(c.Request.Context(), method, strings.TrimRight(server.BaseURL, "/")+path, reader)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	if body != nil {
		upstreamReq.Header.Set("Content-Type", "application/json")
	}
	if server.AuthKind == "bearer" && server.Token != "" {
		upstreamReq.Header.Set("Authorization", "Bearer "+server.Token)
	} else if server.AuthKind == "basic" && server.Username != "" && server.Password != "" {
		upstreamReq.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(server.Username+":"+server.Password)))
	}
	client := *generationToolHTTPClient
	client.Timeout = time.Duration(server.TimeoutMS) * time.Millisecond
	res, err := client.Do(upstreamReq)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 24<<20))
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	var data any
	if len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, &data); err != nil {
			data = string(raw)
		}
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return data, http.StatusBadGateway, errors.New("生成工具服务器调用失败")
	}
	return data, http.StatusOK, nil
}

func runtimeGenerationToolServerPublic(server adminsettings.GenerationToolServer) gin.H {
	return gin.H{
		"id":           server.ID,
		"scope":        server.Scope,
		"type":         server.Type,
		"name":         server.Name,
		"enabled":      server.Enabled,
		"base_url":     server.BaseURL,
		"timeout_ms":   server.TimeoutMS,
		"priority":     server.Priority,
		"auth_kind":    server.AuthKind,
		"password_set": server.Password != "",
		"token_set":    server.Token != "",
		"tags":         server.Tags,
	}
}

func urlPathEscape(value string) string {
	return url.PathEscape(strings.TrimSpace(value))
}

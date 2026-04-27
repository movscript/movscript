package router

import (
	"encoding/hex"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/config"
	"github.com/movscript/movscript/internal/handler"
	"github.com/movscript/movscript/internal/mcp"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/storage"
	"gorm.io/gorm"
)

func New(db *gorm.DB, cfg *config.Config, store storage.Storage) *gin.Engine {
	r := gin.Default()
	r.Use(middleware.CORS())
	r.Use(middleware.Identity(db))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	encKey, _ := hex.DecodeString(cfg.EncryptionKey)
	registry := ai.NewRegistry(db, encKey)
	aiService := ai.NewAIService(db, registry)
	projects := handler.NewProjectHandler(db)
	scripts := handler.NewScriptHandler(db, aiService)
	assets := handler.NewAssetHandler(db, store)
	episodes := handler.NewEpisodeHandler(db)
	storyboards := handler.NewStoryboardHandler(db)
	scenes := handler.NewSceneHandler(db)
	shots := handler.NewShotHandler(db)
	tasks := handler.NewTaskHandler(db)
	settings := handler.NewSettingHandler(db)
	users := handler.NewUserHandler(db)
	authH := handler.NewAuthHandler(db)
	aiH := handler.NewAIHandler(db, cfg.EncryptionKey, registry)
	resources := handler.NewResourceHandler(db, store)
	resourceFolders := handler.NewResourceFolderHandler(db)
	resourceAdmin := handler.NewResourceAdminHandler(db, store)
	canvases := handler.NewCanvasHandler(db, registry, aiService, store)
	modelsH := handler.NewModelsHandler(aiService)
	featureH := handler.NewFeatureHandler(db, aiService)
	genJobs := handler.NewGenJobHandler(db, aiService)
	chatH := handler.NewChatHandler(db, aiService)
	debugH := handler.NewDebugHandler(db, encKey, registry)
	pipelineH := handler.NewPipelineHandler(db)
	agentDefH := handler.NewAgentDefHandler(db)
	userAgentH := handler.NewUserAgentHandler(db)
	mcpServer := mcp.NewServer(db, cfg.MCPToken)

	cloudFileCfgH := handler.NewCloudFileConfigHandler(db, cfg.EncryptionKey)

	// MCP endpoint — accessible at /mcp (outside /api/v1 for external agent clients).
	r.POST("/mcp", mcpServer.Handle)

	v1 := r.Group("/api/v1")
	{
		// public auth routes
		v1.POST("/auth/register", authH.Register)
		v1.POST("/auth/login", authH.Login)

		// model discovery (user-facing, no provider info)
		v1.GET("/models", modelsH.ListByCapability)

		// feature definitions (user-facing, for tool pages to load input slot definitions)
		v1.GET("/features/:key", featureH.GetPublic)

		// AI chat (brainstorm)
		v1.POST("/ai/chat", chatH.Chat)

		// user quota & usage (requires login)
		v1.GET("/user/quota", aiH.GetMyQuota)
		v1.GET("/user/usage-logs", aiH.GetMyUsageLogs)

		// users (read-only, for collaboration member picker)
		v1.GET("/users", users.List)

		// raw resources
		v1.GET("/resources", resources.List)
		v1.POST("/resources/upload", resources.Upload)
		v1.GET("/resources/:id/file", resources.ServeFile)
		v1.PUT("/resources/:id", resources.Update)
		v1.DELETE("/resources/:id", resources.Delete)
		v1.POST("/resources/:id/to-asset", resources.AddToAsset)

		// resource folders
		v1.GET("/resource-folders", resourceFolders.List)
		v1.POST("/resource-folders", resourceFolders.Create)
		v1.PUT("/resource-folders/:id", resourceFolders.Update)
		v1.DELETE("/resource-folders/:id", resourceFolders.Delete)
		// folder permissions (owner only)
		v1.GET("/resource-folders/:id/permissions", resourceFolders.ListPermissions)
		v1.POST("/resource-folders/:id/permissions", resourceFolders.GrantPermission)
		v1.DELETE("/resource-folders/:id/permissions/:userId", resourceFolders.RevokePermission)

		// gen jobs (async AI generation tasks)
		v1.POST("/gen-jobs", genJobs.Create)
		v1.GET("/gen-jobs", genJobs.List)
		v1.GET("/gen-jobs/:id", genJobs.Get)
		v1.POST("/gen-jobs/:id/cancel", genJobs.Cancel)
		v1.POST("/gen-jobs/:id/retry", genJobs.Retry)
		v1.DELETE("/gen-jobs/:id", genJobs.Delete)

		// canvases
		v1.GET("/canvases", canvases.List)
		v1.POST("/canvases", canvases.Create)
		v1.GET("/canvases/:id", canvases.Get)
		v1.PUT("/canvases/:id", canvases.Save)
		v1.DELETE("/canvases/:id", canvases.Delete)
		v1.POST("/canvases/:id/nodes/:nodeId/run", canvases.RunNode)
		v1.GET("/canvases/:id/nodes/:nodeId/task", canvases.GetNodeTask)
		v1.GET("/canvases/:id/nodes/:nodeId/tasks", canvases.ListNodeTasks)
		v1.POST("/canvases/:id/run", canvases.RunCanvas)
		v1.GET("/canvases/:id/runs", canvases.ListRuns)
		v1.GET("/canvases/:id/runs/:runId", canvases.GetRun)
		v1.GET("/canvases/:id/runs/:runId/tasks", canvases.ListRunTasks)

		// projects
		v1.GET("/projects", projects.List)
		v1.POST("/projects", projects.Create)
		v1.GET("/projects/:id", projects.Get)
		v1.PUT("/projects/:id", projects.Update)
		v1.DELETE("/projects/:id", projects.Delete)
		v1.GET("/projects/:id/progress", projects.Progress)
		v1.POST("/projects/:id/members", projects.AddMember)
		v1.DELETE("/projects/:id/members/:memberId", projects.RemoveMember)

		// collaboration dashboard
		v1.GET("/projects/:id/collaboration", tasks.Collaboration)

		// tasks nested under project
		v1.GET("/projects/:id/tasks", tasks.List)
		v1.POST("/projects/:id/tasks", tasks.Create)
		v1.PUT("/projects/:id/tasks/:taskId", tasks.Update)
		v1.DELETE("/projects/:id/tasks/:taskId", tasks.Delete)
		v1.GET("/projects/:id/tasks/:taskId/comments", tasks.ListComments)
		v1.POST("/projects/:id/tasks/:taskId/comments", tasks.AddComment)

		// pipeline DAG
		v1.GET("/projects/:id/pipeline", pipelineH.GetPipeline)
		v1.POST("/projects/:id/pipeline/nodes", pipelineH.CreateNode)
		v1.PUT("/pipeline/nodes/:nodeId", pipelineH.UpdateNode)
		v1.DELETE("/pipeline/nodes/:nodeId", pipelineH.DeleteNode)
		v1.POST("/projects/:id/pipeline/edges", pipelineH.CreateEdge)
		v1.DELETE("/pipeline/edges/:edgeId", pipelineH.DeleteEdge)
		v1.POST("/pipeline/nodes/:nodeId/submit", pipelineH.Submit)
		v1.POST("/pipeline/nodes/:nodeId/approve", pipelineH.Approve)
		v1.POST("/pipeline/nodes/:nodeId/reject", pipelineH.Reject)
		v1.POST("/pipeline/nodes/:nodeId/reopen", pipelineH.Reopen)

		// project-level listings
		v1.GET("/projects/:id/scenes", scenes.List)
		v1.POST("/projects/:id/scenes", scenes.Create)
		v1.GET("/projects/:id/storyboards", storyboards.ListByProject)
		v1.POST("/projects/:id/storyboards", storyboards.CreateByProject)
		v1.GET("/projects/:id/episodes", episodes.ListByProject)
		v1.GET("/projects/:id/shots", shots.ListByProject)
		v1.POST("/projects/:id/shots", shots.CreateByProject)

		// settings nested under project
		v1.GET("/projects/:id/settings", settings.List)
		v1.POST("/projects/:id/settings", settings.Create)

		// scripts nested under project
		v1.GET("/projects/:id/scripts", scripts.List)
		v1.POST("/projects/:id/scripts", scripts.Create)
		v1.GET("/projects/:id/scripts/:scriptId", scripts.Get)
		v1.PUT("/projects/:id/scripts/:scriptId", scripts.Update)
		v1.DELETE("/projects/:id/scripts/:scriptId", scripts.Delete)
		v1.POST("/projects/:id/scripts/:scriptId/analyze", scripts.Analyze)

		// episodes directly under project (script optional)
		v1.POST("/projects/:id/episodes", episodes.CreateUnderProject)

		// assets nested under project
		v1.GET("/projects/:id/assets", assets.List)
		v1.POST("/projects/:id/assets", assets.Create)
		v1.POST("/projects/:id/assets/upload", assets.Upload)
		v1.GET("/projects/:id/assets/:assetId", assets.Get)
		v1.PUT("/projects/:id/assets/:assetId", assets.Update)
		v1.DELETE("/projects/:id/assets/:assetId", assets.Delete)
		// asset views
		v1.POST("/projects/:id/assets/:assetId/views", assets.AddView)
		v1.POST("/projects/:id/assets/:assetId/views/upload", assets.UploadView)
		v1.DELETE("/projects/:id/assets/:assetId/views/:viewId", assets.DeleteView)

		// episodes nested under script
		v1.GET("/scripts/:id/episodes", episodes.List)
		v1.POST("/scripts/:id/episodes", episodes.Create)
		v1.PUT("/episodes/:id", episodes.Update)
		v1.DELETE("/episodes/:id", episodes.Delete)

		// episode ↔ scene links (many-to-many)
		v1.GET("/episodes/:id/scenes", scenes.ListEpisodeScenes)
		v1.POST("/episodes/:id/scenes", scenes.AddEpisodeScene)
		v1.DELETE("/episodes/:id/scenes/:sceneId", scenes.RemoveEpisodeScene)
		v1.GET("/episodes/:id/storyboards", storyboards.ListByEpisode)

		// scenes (update/delete by scene id)
		v1.PUT("/scenes/:sceneId", scenes.Update)
		v1.DELETE("/scenes/:sceneId", scenes.Delete)

		// storyboards nested under scene
		v1.GET("/scenes/:id/storyboards", storyboards.List)
		v1.POST("/scenes/:id/storyboards", storyboards.Create)
		v1.PUT("/storyboards/:id", storyboards.Update)
		v1.DELETE("/storyboards/:id", storyboards.Delete)

		// shots (flat routes by shot ID)
		v1.PUT("/shots/:id", shots.Update)
		v1.DELETE("/shots/:id", shots.Delete)

		// shots nested under storyboard (kept for listing)
		v1.GET("/storyboards/:id/shots", shots.List)
		v1.POST("/storyboards/:id/shots", shots.Create)

		// settings (update/delete by setting id)
		v1.PUT("/settings/:id", settings.Update)
		v1.DELETE("/settings/:id", settings.Delete)

		// agent templates (public read, admin write)
		v1.GET("/agents", agentDefH.List)

		// user agents (per-user CRUD, requires login)
		v1.GET("/agents/my", userAgentH.List)
		v1.POST("/agents/my", userAgentH.Create)
		v1.PUT("/agents/my/:id", userAgentH.Update)
		v1.DELETE("/agents/my/:id", userAgentH.Delete)

		// admin routes — super_admin only
		admin := v1.Group("/admin", middleware.RequireSystemRole("super_admin"))
		{
			// adapters and model presets (read-only UI templates, not used at runtime)
			admin.GET("/adapters", aiH.ListAdapters)
			admin.GET("/model-presets", aiH.ListModelPresets)

			// credentials (one per adapter type)
			admin.GET("/credentials", aiH.ListCredentials)
			admin.POST("/credentials", aiH.CreateCredential)
			admin.PUT("/credentials/:id", aiH.UpdateCredential)
			admin.DELETE("/credentials/:id", aiH.DeleteCredential)
			admin.POST("/credentials/:id/test", aiH.TestCredential)
			admin.GET("/credentials/:id/remote-models", aiH.ListRemoteModels)

			// model configs (admin-declared model activation per credential)
			admin.GET("/credentials/:id/models", aiH.ListModelConfigs)
			admin.POST("/credentials/:id/models", aiH.CreateModelConfig)
			admin.PUT("/credentials/:id/models/:modelId", aiH.UpdateModelConfig)
			admin.DELETE("/credentials/:id/models/:modelId", aiH.DeleteModelConfig)
			admin.POST("/credentials/:id/models/:modelId/test", aiH.TestModelConfig)
			admin.POST("/credentials/:id/models/:modelId/debug", aiH.DebugModelConfig)

			// flat model-config patch (no credential_id in path — used by feature config tab)
			admin.PATCH("/model-configs/:id", aiH.PatchModelConfig)

			// feature model config
			admin.GET("/feature-defs", featureH.ListDefs)
			admin.GET("/features", featureH.List)
			admin.PUT("/features/:key", featureH.Update)
			admin.PUT("/features/:key/prompt", featureH.UpdatePrompt)

			// user management
			admin.GET("/users", aiH.ListUsersWithQuota)
			admin.PUT("/users/:id/quota", aiH.SetUserQuota)
			admin.GET("/usage-logs", aiH.ListUsageLogs)

			// resource storage management
			admin.GET("/resource-storage/backends", resourceAdmin.StorageBackends)
			admin.GET("/resource-storage/stats", resourceAdmin.StorageStats)

			// agent definitions
			admin.POST("/agents", agentDefH.Create)
			admin.PUT("/agents/:id", agentDefH.Update)
			admin.DELETE("/agents/:id", agentDefH.Delete)

			// cloud file storage configs
			admin.GET("/cloud-file-configs", cloudFileCfgH.List)
			admin.POST("/cloud-file-configs", cloudFileCfgH.Create)
			admin.PUT("/cloud-file-configs/:id", cloudFileCfgH.Update)
			admin.DELETE("/cloud-file-configs/:id", cloudFileCfgH.Delete)

			// debug
			admin.POST("/debug/raw-call", debugH.RawCall)
			admin.POST("/debug/provider-call", debugH.ProviderCall)
			admin.GET("/debug/jobs", debugH.ListJobs)
			admin.GET("/debug/jobs/:id", debugH.GetJob)
		}
	}

	return r
}

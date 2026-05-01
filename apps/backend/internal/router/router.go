package router

import (
	"encoding/hex"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/ai"
	"github.com/movscript/movscript/internal/auth"
	"github.com/movscript/movscript/internal/config"
	"github.com/movscript/movscript/internal/handler"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/observability"
	"github.com/movscript/movscript/internal/storage"
	"gorm.io/gorm"
)

func New(db *gorm.DB, cfg *config.Config, store storage.Storage) *gin.Engine {
	tokens, err := auth.NewManager(cfg.AuthTokenSecret, time.Duration(cfg.AuthTokenTTLHours)*time.Hour)
	if err != nil {
		log.Fatalf("invalid auth configuration: %v", err)
	}

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(observability.RequestID())
	r.Use(observability.RequestLogger())
	r.Use(middleware.CORS())
	r.Use(middleware.Identity(db, tokens))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	encKey, _ := hex.DecodeString(cfg.EncryptionKey)
	registry := ai.NewRegistry(db, encKey)
	aiService := ai.NewAIService(db, registry)
	projects := handler.NewProjectHandler(db)
	scripts := handler.NewScriptHandler(db)
	assets := handler.NewAssetHandler(db, store)
	episodes := handler.NewEpisodeHandler(db)
	storyboards := handler.NewStoryboardHandler(db)
	scenes := handler.NewSceneHandler(db)
	shots := handler.NewShotHandler(db)
	finalVideos := handler.NewFinalVideoHandler(db)
	artifactRefs := handler.NewArtifactRefHandler(db)
	settings := handler.NewSettingHandler(db)
	users := handler.NewUserHandler(db)
	authH := handler.NewAuthHandler(db, tokens)
	aiH := handler.NewAIHandler(db, cfg.EncryptionKey, registry)
	resources := handler.NewResourceHandler(db, store)
	resourceBindings := handler.NewResourceBindingHandler(db)
	v2Semantics := handler.NewV2SemanticHandler(db)
	scriptPreview := handler.NewScriptPreviewHandler(db)
	resourceFolders := handler.NewResourceFolderHandler(db)
	resourceAdmin := handler.NewResourceAdminHandler(db, store)
	canvases := handler.NewCanvasHandler(db, registry, aiService, store)
	modelsH := handler.NewModelsHandler(aiService)
	featureH := handler.NewFeatureHandler(db, aiService)
	jobs := handler.NewJobHandler(db, aiService)
	chatH := handler.NewChatHandler(db, aiService)
	modelGatewayH := handler.NewModelGatewayHandler(db, aiService)
	debugH := handler.NewDebugHandler(db, encKey, registry)
	pluginH := handler.NewPluginHandler(db)
	registryH := handler.NewRegistryHandler()
	workflowSchemas := handler.NewWorkflowSchemaHandler(db)
	workflowMarketH := handler.NewWorkflowMarketHandler(db)
	auditH := handler.NewAuditHandler(db)

	cloudFileCfgH := handler.NewCloudFileConfigHandler(db, cfg.EncryptionKey)

	// MCP endpoint removed — tools are now provided by the client.

	openAIV1 := r.Group("/v1")
	{
		openAIV1.GET("/models", modelGatewayH.ListModels)
		openAIV1.POST("/chat/completions", modelGatewayH.ChatCompletions)
	}

	v1 := r.Group("/api/v1")
	{
		// public auth routes
		v1.POST("/auth/register", authH.Register)
		v1.POST("/auth/login", authH.Login)
		v1.POST("/auth/logout", authH.Logout)

		// model discovery (user-facing, no provider info)
		v1.GET("/models", modelsH.ListByCapability)

		// feature definitions (user-facing, for tool pages to load input slot definitions)
		v1.GET("/features/:key", featureH.GetPublic)

		// Model gateway execution accepts either signed sessions or gateway API keys.
		v1.POST("/model-gateway/chat/completions", modelGatewayH.ChatCompletions)

		protected := v1.Group("", middleware.RequireAuth())
		{
			// AI chat (brainstorm)
			protected.POST("/ai/chat", chatH.Chat)
			protected.GET("/model-gateway/models", modelGatewayH.ListModels)
			protected.GET("/model-gateway/api-keys", modelGatewayH.ListAPIKeys)
			protected.POST("/model-gateway/api-keys", modelGatewayH.CreateAPIKey)
			protected.PATCH("/model-gateway/api-keys/:id", modelGatewayH.UpdateAPIKey)
			protected.DELETE("/model-gateway/api-keys/:id", modelGatewayH.DeleteAPIKey)

			// user quota & usage (requires login)
			protected.GET("/user/quota", aiH.GetMyQuota)
			protected.GET("/user/usage-logs", aiH.GetMyUsageLogs)

			// users (read-only, for collaboration member picker)
			protected.GET("/users", users.List)

			// raw resources
			protected.GET("/resources", resources.List)
			protected.POST("/resources/upload", resources.Upload)
			protected.GET("/resources/:id/file", resources.ServeFile)
			protected.PUT("/resources/:id", resources.Update)
			protected.DELETE("/resources/:id", resources.Delete)
			protected.POST("/resources/:id/to-asset", resources.AddToAsset)
			protected.PATCH("/resource-bindings/:id", resourceBindings.Patch)
			protected.DELETE("/resource-bindings/:id", resourceBindings.Delete)

			// resource folders
			protected.GET("/resource-folders", resourceFolders.List)
			protected.POST("/resource-folders", resourceFolders.Create)
			protected.PUT("/resource-folders/:id", resourceFolders.Update)
			protected.DELETE("/resource-folders/:id", resourceFolders.Delete)
			// folder permissions (owner only)
			protected.GET("/resource-folders/:id/permissions", resourceFolders.ListPermissions)
			protected.POST("/resource-folders/:id/permissions", resourceFolders.GrantPermission)
			protected.DELETE("/resource-folders/:id/permissions/:userId", resourceFolders.RevokePermission)

			// jobs (async AI generation tasks)
			protected.POST("/jobs", jobs.Create)
			protected.GET("/jobs", jobs.List)
			protected.GET("/jobs/:id", jobs.Get)
			protected.POST("/jobs/:id/cancel", jobs.Cancel)
			protected.POST("/jobs/:id/retry", jobs.Retry)
			protected.DELETE("/jobs/:id", jobs.Delete)

			// plugins (client-side JS runtime; backend stores manifests only)
			protected.GET("/plugins", pluginH.List)
			protected.POST("/plugins", pluginH.Import)
			protected.POST("/plugins/:id/enable", pluginH.Enable)
			protected.POST("/plugins/:id/disable", pluginH.Disable)
			protected.DELETE("/plugins/:id", pluginH.Delete)
			protected.GET("/plugins/tools", pluginH.ToolCatalog)
			protected.GET("/plugins/cards", pluginH.CardCatalog)
			protected.GET("/plugins/canvas-nodes", pluginH.CanvasNodeCatalog)
			protected.GET("/plugins/workflows", pluginH.WorkflowCatalog)

			// registry proxy (avoids CORS; reads PLUGIN_REGISTRY_URL env)
			v1.GET("/registry/plugins", registryH.ListPlugins)
			v1.GET("/registry/plugins/:id", registryH.GetPlugin)
			v1.GET("/registry/workflows", registryH.ListWorkflows)
			v1.GET("/registry/workflows/:id", registryH.GetWorkflow)

			// entity schemas and workflow projections
			protected.GET("/entities/semantic-schemas", workflowSchemas.ListEntitySemanticSchemas)
			protected.GET("/entities/semantic-schemas/:kind", workflowSchemas.GetEntitySemanticSchema)
			protected.GET("/entities/semantic-schemas/:kind/migration-report", workflowSchemas.GetEntitySchemaMigrationReport)
			protected.GET("/entities/:kind/:id/semantic-values", workflowSchemas.GetEntitySemanticValues)
			protected.GET("/workflow/entity-schemas", workflowSchemas.ListEntitySchemas)
			protected.GET("/workflow/entity-schemas/:kind", workflowSchemas.GetEntitySchema)
			protected.GET("/workflows/templates", workflowMarketH.ListTemplates)
			protected.POST("/workflows/templates/:key/install", workflowMarketH.InstallTemplate)
			protected.GET("/workflows/market", workflowMarketH.ListMarket)
			protected.GET("/workflows/by-key/:key", workflowMarketH.GetByKey)
			protected.POST("/workflows/:id/publish", workflowMarketH.Publish)
			protected.POST("/workflows/:id/unpublish", workflowMarketH.Unpublish)
			protected.POST("/workflows/:id/clone", workflowMarketH.Clone)

			// canvases
			protected.GET("/canvases", canvases.List)
			protected.GET("/canvas-entity-write-audits", canvases.ListEntityWriteAudits)
			protected.POST("/canvases", canvases.Create)
			protected.GET("/canvases/:id", canvases.Get)
			protected.PATCH("/canvases/:id", canvases.Patch)
			protected.PUT("/canvases/:id", canvases.Save)
			protected.DELETE("/canvases/:id", canvases.Delete)
			protected.POST("/canvases/:id/nodes/:nodeId/run", canvases.RunNode)
			protected.GET("/canvases/:id/nodes/:nodeId/task", canvases.GetNodeTask)
			protected.GET("/canvases/:id/nodes/:nodeId/tasks", canvases.ListNodeTasks)
			protected.POST("/canvases/:id/run", canvases.RunCanvas)
			protected.GET("/canvases/:id/runs", canvases.ListRuns)
			protected.GET("/canvases/:id/runs/:runId", canvases.GetRun)
			protected.GET("/canvases/:id/runs/:runId/tasks", canvases.ListRunTasks)

			// projects
			protected.GET("/projects", projects.List)
			protected.POST("/projects", projects.Create)
			protected.GET("/projects/:id", projects.Get)
			protected.PUT("/projects/:id", projects.Update)
			protected.DELETE("/projects/:id", projects.Delete)
			protected.GET("/projects/:id/progress", projects.Progress)
			protected.GET("/projects/:id/artifact-refs", artifactRefs.ListByProject)
			protected.GET("/projects/:id/resource-bindings", resourceBindings.ListByProject)
			protected.POST("/projects/:id/resource-bindings", resourceBindings.CreateByProject)
			protected.GET("/projects/:id/entities/:ownerType/:ownerId/resources", resourceBindings.ListByEntity)
			protected.GET("/projects/:id/members", projects.ListMembers)
			protected.POST("/projects/:id/members", projects.AddMember)
			protected.DELETE("/projects/:id/members/:memberId", projects.RemoveMember)

			// project-level listings
			protected.GET("/projects/:id/scenes", scenes.List)
			protected.POST("/projects/:id/scenes", scenes.Create)
			protected.GET("/projects/:id/storyboards", storyboards.ListByProject)
			protected.POST("/projects/:id/storyboards", storyboards.CreateByProject)
			protected.GET("/projects/:id/episodes", episodes.ListByProject)
			protected.GET("/projects/:id/shots", shots.ListByProject)
			protected.POST("/projects/:id/shots", shots.CreateByProject)
			protected.GET("/projects/:id/final-videos", finalVideos.ListByProject)
			protected.POST("/projects/:id/final-videos", finalVideos.CreateByProject)

			// settings nested under project
			protected.GET("/projects/:id/settings", settings.List)
			protected.POST("/projects/:id/settings", settings.Create)
			protected.GET("/projects/:id/setting-refs", settings.ListRefs)
			protected.POST("/projects/:id/setting-refs", settings.CreateRef)
			protected.GET("/projects/:id/setting-relationships", settings.ListRelationships)
			protected.POST("/projects/:id/setting-relationships", settings.CreateRelationship)

			// scripts nested under project
			protected.GET("/projects/:id/scripts", scripts.List)
			protected.POST("/projects/:id/scripts", scripts.Create)
			protected.GET("/projects/:id/scripts/:scriptId", scripts.Get)
			protected.PUT("/projects/:id/scripts/:scriptId", scripts.Update)
			protected.DELETE("/projects/:id/scripts/:scriptId", scripts.Delete)
			protected.PATCH("/scripts/:id", scripts.Patch)

			// V2 semantic skeleton
			protected.GET("/projects/:id/script-preview/draft", scriptPreview.GetLatestDraft)
			protected.POST("/projects/:id/script-preview/draft", scriptPreview.SaveDraft)
			protected.POST("/projects/:id/script-preview/analyze", scriptPreview.AnalyzeScriptToSections)
			protected.POST("/projects/:id/script-preview/generate-preview", scriptPreview.GenerateKeyframesForContentUnits)
			protected.GET("/projects/:id/v2/script-versions", v2Semantics.ListScriptVersions)
			protected.POST("/projects/:id/v2/script-versions", v2Semantics.CreateScriptVersion)
			protected.PATCH("/projects/:id/v2/script-versions/:versionId", v2Semantics.PatchScriptVersion)
			protected.GET("/projects/:id/v2/script-sections", v2Semantics.ListScriptSections)
			protected.POST("/projects/:id/v2/script-sections", v2Semantics.CreateScriptSection)
			protected.PATCH("/projects/:id/v2/script-sections/:sectionId", v2Semantics.PatchScriptSection)
			protected.GET("/projects/:id/v2/situations", v2Semantics.ListSituations)
			protected.POST("/projects/:id/v2/situations", v2Semantics.CreateSituation)
			protected.PATCH("/projects/:id/v2/situations/:situationId", v2Semantics.PatchSituation)
			protected.GET("/projects/:id/v2/content-units", v2Semantics.ListContentUnits)
			protected.POST("/projects/:id/v2/content-units", v2Semantics.CreateContentUnit)
			protected.PATCH("/projects/:id/v2/content-units/:contentUnitId", v2Semantics.PatchContentUnit)
			protected.GET("/projects/:id/v2/keyframes", v2Semantics.ListKeyframes)
			protected.POST("/projects/:id/v2/keyframes", v2Semantics.CreateKeyframe)
			protected.GET("/projects/:id/v2/preview-timelines", v2Semantics.ListPreviewTimelines)
			protected.POST("/projects/:id/v2/preview-timelines", v2Semantics.CreatePreviewTimeline)
			protected.GET("/projects/:id/v2/preview-timelines/:timelineId/items", v2Semantics.ListPreviewTimelineItems)
			protected.POST("/projects/:id/v2/preview-timelines/:timelineId/items", v2Semantics.CreatePreviewTimelineItem)
			protected.GET("/projects/:id/v2/creative-references", v2Semantics.ListCreativeReferences)
			protected.POST("/projects/:id/v2/creative-references", v2Semantics.CreateCreativeReference)
			protected.GET("/projects/:id/v2/creative-reference-states", v2Semantics.ListCreativeReferenceStates)
			protected.POST("/projects/:id/v2/creative-reference-states", v2Semantics.CreateCreativeReferenceState)
			protected.GET("/projects/:id/v2/asset-requirements", v2Semantics.ListAssetRequirements)
			protected.POST("/projects/:id/v2/asset-requirements", v2Semantics.CreateAssetRequirement)
			protected.GET("/projects/:id/v2/work-items", v2Semantics.ListWorkItems)
			protected.POST("/projects/:id/v2/work-items", v2Semantics.CreateWorkItem)
			protected.GET("/projects/:id/v2/delivery-versions", v2Semantics.ListDeliveryVersions)
			protected.POST("/projects/:id/v2/delivery-versions", v2Semantics.CreateDeliveryVersion)

			// episodes directly under project (script optional)
			protected.POST("/projects/:id/episodes", episodes.CreateUnderProject)

			// assets nested under project
			protected.GET("/projects/:id/assets", assets.List)
			protected.POST("/projects/:id/assets", assets.Create)
			protected.POST("/projects/:id/assets/upload", assets.Upload)
			protected.GET("/projects/:id/assets/:assetId", assets.Get)
			protected.PUT("/projects/:id/assets/:assetId", assets.Update)
			protected.PATCH("/projects/:id/assets/:assetId", assets.Patch)
			protected.DELETE("/projects/:id/assets/:assetId", assets.Delete)
			// asset views
			protected.POST("/projects/:id/assets/:assetId/views", assets.AddView)
			protected.POST("/projects/:id/assets/:assetId/views/upload", assets.UploadView)
			protected.DELETE("/projects/:id/assets/:assetId/views/:viewId", assets.DeleteView)

			// episodes nested under script
			protected.GET("/scripts/:id/episodes", episodes.List)
			protected.POST("/scripts/:id/episodes", episodes.Create)
			protected.PUT("/episodes/:id", episodes.Update)
			protected.PATCH("/episodes/:id", episodes.Patch)
			protected.DELETE("/episodes/:id", episodes.Delete)

			// episode ↔ scene links (many-to-many)
			protected.GET("/episodes/:id/scenes", scenes.ListEpisodeScenes)
			protected.POST("/episodes/:id/scenes", scenes.AddEpisodeScene)
			protected.DELETE("/episodes/:id/scenes/:sceneId", scenes.RemoveEpisodeScene)
			protected.GET("/episodes/:id/storyboards", storyboards.ListByEpisode)

			// scenes (update/delete by scene id)
			protected.PUT("/scenes/:sceneId", scenes.Update)
			protected.PATCH("/scenes/:sceneId", scenes.Patch)
			protected.DELETE("/scenes/:sceneId", scenes.Delete)

			// storyboards nested under scene
			protected.GET("/scenes/:id/storyboards", storyboards.List)
			protected.POST("/scenes/:id/storyboards", storyboards.Create)
			protected.PUT("/storyboards/:id", storyboards.Update)
			protected.PATCH("/storyboards/:id", storyboards.Patch)
			protected.DELETE("/storyboards/:id", storyboards.Delete)

			// shots (flat routes by shot ID)
			protected.PUT("/shots/:id", shots.Update)
			protected.PATCH("/shots/:id", shots.Patch)
			protected.DELETE("/shots/:id", shots.Delete)

			// final videos (flat routes by final video ID)
			protected.PUT("/final-videos/:id", finalVideos.Update)
			protected.PATCH("/final-videos/:id", finalVideos.Patch)
			protected.DELETE("/final-videos/:id", finalVideos.Delete)

			// shots nested under storyboard (kept for listing)
			protected.GET("/storyboards/:id/shots", shots.List)
			protected.POST("/storyboards/:id/shots", shots.Create)

			// settings (update/delete by setting id)
			protected.PUT("/settings/:id", settings.Update)
			protected.DELETE("/settings/:id", settings.Delete)
			protected.PUT("/setting-refs/:id", settings.UpdateRef)
			protected.DELETE("/setting-refs/:id", settings.DeleteRef)
			protected.PUT("/setting-relationships/:id", settings.UpdateRelationship)
			protected.DELETE("/setting-relationships/:id", settings.DeleteRelationship)

			// admin routes — super_admin only
			admin := protected.Group("/admin", middleware.RequireSystemRole("super_admin"))
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
				admin.GET("/audit-logs", auditH.List)
				admin.GET("/projects", projects.AdminList)
				admin.PUT("/projects/:id/owner", projects.AdminForceSetOwner)

				// resource storage management
				admin.GET("/resource-storage/backends", resourceAdmin.StorageBackends)
				admin.GET("/resource-storage/stats", resourceAdmin.StorageStats)

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
	}

	return r
}

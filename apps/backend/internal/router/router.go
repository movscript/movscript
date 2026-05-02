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
	"github.com/movscript/movscript/internal/model"
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
	artifactRefs := handler.NewArtifactRefHandler(db)
	settings := handler.NewSettingHandler(db)
	users := handler.NewUserHandler(db)
	authH := handler.NewAuthHandler(db, tokens)
	aiH := handler.NewAIHandler(db, cfg.EncryptionKey, registry)
	resources := handler.NewResourceHandler(db, store)
	resourceBindings := handler.NewResourceBindingHandler(db)
	semanticEntities := handler.NewSemanticEntityHandler(db)
	projectPreview := handler.NewProjectPreviewHandler(db)
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

			// semantic entity skeleton
			protected.GET("/projects/:id/production-management/draft", projectPreview.GetLatestDraft)
			protected.POST("/projects/:id/production-management/draft", projectPreview.SaveDraft)
			protected.POST("/projects/:id/production-management/analyze", projectPreview.AnalyzeScriptToSections)
			protected.POST("/projects/:id/production-management/generate-preview", projectPreview.GenerateKeyframesForContentUnits)
			protected.POST("/projects/:id/production-management/confirm-preview", projectPreview.ConfirmPreview)
			protected.POST("/projects/:id/production-management/storyboard-suggestions/accept", projectPreview.AcceptStoryboardSuggestion)
			protected.POST("/projects/:id/production-management/storyboard-suggestions/reject", projectPreview.RejectStoryboardSuggestion)
			protected.POST("/projects/:id/production-management/keyframe-candidates/accept", projectPreview.AcceptKeyframeCandidate)
			protected.POST("/projects/:id/production-management/keyframe-candidates/reject", projectPreview.RejectKeyframeCandidate)
			protected.POST("/projects/:id/production-management/asset-gaps/accept", projectPreview.AcceptAssetGap)
			protected.POST("/projects/:id/production-management/asset-gaps/resolve", projectPreview.ResolveAssetGap)
			protected.POST("/projects/:id/production-management/asset-gaps/reject", projectPreview.RejectAssetGap)
			protected.GET("/projects/:id/production-preview/draft", projectPreview.GetLatestDraft)
			protected.POST("/projects/:id/production-preview/draft", projectPreview.SaveDraft)
			protected.POST("/projects/:id/production-preview/analyze", projectPreview.AnalyzeScriptToSections)
			protected.POST("/projects/:id/production-preview/generate-preview", projectPreview.GenerateKeyframesForContentUnits)
			protected.POST("/projects/:id/production-preview/confirm-preview", projectPreview.ConfirmPreview)
			protected.POST("/projects/:id/production-preview/storyboard-suggestions/accept", projectPreview.AcceptStoryboardSuggestion)
			protected.POST("/projects/:id/production-preview/storyboard-suggestions/reject", projectPreview.RejectStoryboardSuggestion)
			protected.POST("/projects/:id/production-preview/keyframe-candidates/accept", projectPreview.AcceptKeyframeCandidate)
			protected.POST("/projects/:id/production-preview/keyframe-candidates/reject", projectPreview.RejectKeyframeCandidate)
			protected.POST("/projects/:id/production-preview/asset-gaps/accept", projectPreview.AcceptAssetGap)
			protected.POST("/projects/:id/production-preview/asset-gaps/resolve", projectPreview.ResolveAssetGap)
			protected.POST("/projects/:id/production-preview/asset-gaps/reject", projectPreview.RejectAssetGap)
			protected.GET("/projects/:id/project-preview/draft", projectPreview.GetLatestDraft)
			protected.POST("/projects/:id/project-preview/draft", projectPreview.SaveDraft)
			protected.POST("/projects/:id/project-preview/analyze", projectPreview.AnalyzeScriptToSections)
			protected.POST("/projects/:id/project-preview/generate-preview", projectPreview.GenerateKeyframesForContentUnits)
			protected.POST("/projects/:id/project-preview/confirm-preview", projectPreview.ConfirmPreview)
			protected.POST("/projects/:id/project-preview/storyboard-suggestions/accept", projectPreview.AcceptStoryboardSuggestion)
			protected.POST("/projects/:id/project-preview/storyboard-suggestions/reject", projectPreview.RejectStoryboardSuggestion)
			protected.POST("/projects/:id/project-preview/keyframe-candidates/accept", projectPreview.AcceptKeyframeCandidate)
			protected.POST("/projects/:id/project-preview/keyframe-candidates/reject", projectPreview.RejectKeyframeCandidate)
			protected.POST("/projects/:id/project-preview/asset-gaps/accept", projectPreview.AcceptAssetGap)
			protected.POST("/projects/:id/project-preview/asset-gaps/resolve", projectPreview.ResolveAssetGap)
			protected.POST("/projects/:id/project-preview/asset-gaps/reject", projectPreview.RejectAssetGap)
			protected.GET("/projects/:id/entities/script-versions", semanticEntities.ListScriptVersions)
			protected.POST("/projects/:id/entities/script-versions", semanticEntities.CreateScriptVersion)
			protected.PATCH("/projects/:id/entities/script-versions/:versionId", semanticEntities.PatchScriptVersion)
			protected.DELETE("/projects/:id/entities/script-versions/:versionId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.ScriptVersion{}, c.Param("versionId"))
			})
			protected.GET("/projects/:id/entities/segments", semanticEntities.ListSegments)
			protected.POST("/projects/:id/entities/segments", semanticEntities.CreateSegment)
			protected.PATCH("/projects/:id/entities/segments/:segmentId", semanticEntities.PatchSegment)
			protected.DELETE("/projects/:id/entities/segments/:segmentId", func(c *gin.Context) { semanticEntities.DeleteSemanticItem(c, &model.Segment{}, c.Param("segmentId")) })
			protected.GET("/projects/:id/entities/scene-moments", semanticEntities.ListSceneMoments)
			protected.POST("/projects/:id/entities/scene-moments", semanticEntities.CreateSceneMoment)
			protected.PATCH("/projects/:id/entities/scene-moments/:sceneMomentId", semanticEntities.PatchSceneMoment)
			protected.DELETE("/projects/:id/entities/scene-moments/:sceneMomentId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.SceneMoment{}, c.Param("sceneMomentId"))
			})
			protected.GET("/projects/:id/entities/storyboard-scripts", semanticEntities.ListStoryboardScripts)
			protected.POST("/projects/:id/entities/storyboard-scripts", semanticEntities.CreateStoryboardScript)
			protected.PATCH("/projects/:id/entities/storyboard-scripts/:storyboardScriptId", semanticEntities.PatchStoryboardScript)
			protected.DELETE("/projects/:id/entities/storyboard-scripts/:storyboardScriptId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.StoryboardScript{}, c.Param("storyboardScriptId"))
			})
			protected.GET("/projects/:id/entities/storyboard-versions", semanticEntities.ListStoryboardVersions)
			protected.POST("/projects/:id/entities/storyboard-versions", semanticEntities.CreateStoryboardVersion)
			protected.PATCH("/projects/:id/entities/storyboard-versions/:storyboardVersionId", semanticEntities.PatchStoryboardVersion)
			protected.DELETE("/projects/:id/entities/storyboard-versions/:storyboardVersionId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.StoryboardVersion{}, c.Param("storyboardVersionId"))
			})
			protected.GET("/projects/:id/entities/storyboard-lines", semanticEntities.ListStoryboardLines)
			protected.POST("/projects/:id/entities/storyboard-lines", semanticEntities.CreateStoryboardLine)
			protected.PATCH("/projects/:id/entities/storyboard-lines/:storyboardLineId", semanticEntities.PatchStoryboardLine)
			protected.DELETE("/projects/:id/entities/storyboard-lines/:storyboardLineId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.StoryboardLine{}, c.Param("storyboardLineId"))
			})
			protected.GET("/projects/:id/entities/productions", semanticEntities.ListProductions)
			protected.POST("/projects/:id/entities/productions", semanticEntities.CreateProduction)
			protected.PATCH("/projects/:id/entities/productions/:productionId", semanticEntities.PatchProduction)
			protected.DELETE("/projects/:id/entities/productions/:productionId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.Production{}, c.Param("productionId"))
			})
			protected.GET("/projects/:id/entities/content-units", semanticEntities.ListContentUnits)
			protected.POST("/projects/:id/entities/content-units", semanticEntities.CreateContentUnit)
			protected.PATCH("/projects/:id/entities/content-units/:contentUnitId", semanticEntities.PatchContentUnit)
			protected.DELETE("/projects/:id/entities/content-units/:contentUnitId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.ContentUnit{}, c.Param("contentUnitId"))
			})
			protected.GET("/projects/:id/entities/keyframes", semanticEntities.ListKeyframes)
			protected.POST("/projects/:id/entities/keyframes", semanticEntities.CreateKeyframe)
			protected.PATCH("/projects/:id/entities/keyframes/:keyframeId", semanticEntities.PatchKeyframe)
			protected.DELETE("/projects/:id/entities/keyframes/:keyframeId", func(c *gin.Context) { semanticEntities.DeleteSemanticItem(c, &model.Keyframe{}, c.Param("keyframeId")) })
			protected.GET("/projects/:id/entities/preview-timelines", semanticEntities.ListPreviewTimelines)
			protected.POST("/projects/:id/entities/preview-timelines", semanticEntities.CreatePreviewTimeline)
			protected.PATCH("/projects/:id/entities/preview-timelines/:timelineId", semanticEntities.PatchPreviewTimeline)
			protected.DELETE("/projects/:id/entities/preview-timelines/:timelineId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.PreviewTimeline{}, c.Param("timelineId"))
			})
			protected.GET("/projects/:id/entities/preview-timeline-items", semanticEntities.ListPreviewTimelineItemsFlat)
			protected.POST("/projects/:id/entities/preview-timeline-items", semanticEntities.CreatePreviewTimelineItemFlat)
			protected.PATCH("/projects/:id/entities/preview-timeline-items/:itemId", semanticEntities.PatchPreviewTimelineItemFlat)
			protected.DELETE("/projects/:id/entities/preview-timeline-items/:itemId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.PreviewTimelineItem{}, c.Param("itemId"))
			})
			protected.GET("/projects/:id/entities/preview-timelines/:timelineId/items", semanticEntities.ListPreviewTimelineItems)
			protected.POST("/projects/:id/entities/preview-timelines/:timelineId/items", semanticEntities.CreatePreviewTimelineItem)
			protected.PATCH("/projects/:id/entities/preview-timelines/:timelineId/items/:itemId", semanticEntities.PatchPreviewTimelineItem)
			protected.DELETE("/projects/:id/entities/preview-timelines/:timelineId/items/:itemId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.PreviewTimelineItem{}, c.Param("itemId"))
			})
			protected.GET("/projects/:id/entities/creative-references", semanticEntities.ListCreativeReferences)
			protected.POST("/projects/:id/entities/creative-references", semanticEntities.CreateCreativeReference)
			protected.PATCH("/projects/:id/entities/creative-references/:referenceId", semanticEntities.PatchCreativeReference)
			protected.DELETE("/projects/:id/entities/creative-references/:referenceId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.CreativeReference{}, c.Param("referenceId"))
			})
			protected.GET("/projects/:id/entities/creative-reference-states", semanticEntities.ListCreativeReferenceStates)
			protected.POST("/projects/:id/entities/creative-reference-states", semanticEntities.CreateCreativeReferenceState)
			protected.PATCH("/projects/:id/entities/creative-reference-states/:stateId", semanticEntities.PatchCreativeReferenceState)
			protected.DELETE("/projects/:id/entities/creative-reference-states/:stateId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.CreativeReferenceState{}, c.Param("stateId"))
			})
			protected.GET("/projects/:id/entities/creative-reference-usages", semanticEntities.ListCreativeReferenceUsages)
			protected.POST("/projects/:id/entities/creative-reference-usages", semanticEntities.CreateCreativeReferenceUsage)
			protected.PATCH("/projects/:id/entities/creative-reference-usages/:usageId", semanticEntities.PatchCreativeReferenceUsage)
			protected.DELETE("/projects/:id/entities/creative-reference-usages/:usageId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.CreativeReferenceUsage{}, c.Param("usageId"))
			})
			protected.GET("/projects/:id/entities/creative-relationships", semanticEntities.ListCreativeRelationships)
			protected.POST("/projects/:id/entities/creative-relationships", semanticEntities.CreateCreativeRelationship)
			protected.PATCH("/projects/:id/entities/creative-relationships/:relationshipId", semanticEntities.PatchCreativeRelationship)
			protected.DELETE("/projects/:id/entities/creative-relationships/:relationshipId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.CreativeRelationship{}, c.Param("relationshipId"))
			})
			protected.GET("/projects/:id/entities/asset-slots", semanticEntities.ListAssetSlots)
			protected.POST("/projects/:id/entities/asset-slots", semanticEntities.CreateAssetSlot)
			protected.PATCH("/projects/:id/entities/asset-slots/:slotId", semanticEntities.PatchAssetSlot)
			protected.DELETE("/projects/:id/entities/asset-slots/:slotId", func(c *gin.Context) { semanticEntities.DeleteSemanticItem(c, &model.AssetSlot{}, c.Param("slotId")) })
			protected.GET("/projects/:id/entities/asset-slot-candidates", semanticEntities.ListAssetSlotCandidates)
			protected.POST("/projects/:id/entities/asset-slot-candidates", semanticEntities.CreateAssetSlotCandidate)
			protected.PATCH("/projects/:id/entities/asset-slot-candidates/:candidateId", semanticEntities.PatchAssetSlotCandidate)
			protected.DELETE("/projects/:id/entities/asset-slot-candidates/:candidateId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.AssetSlotCandidate{}, c.Param("candidateId"))
			})
			protected.GET("/projects/:id/entities/candidate-decisions", semanticEntities.ListCandidateDecisions)
			protected.POST("/projects/:id/entities/candidate-decisions", semanticEntities.CreateCandidateDecision)
			protected.PATCH("/projects/:id/entities/candidate-decisions/:decisionId", semanticEntities.PatchCandidateDecision)
			protected.DELETE("/projects/:id/entities/candidate-decisions/:decisionId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.CandidateDecision{}, c.Param("decisionId"))
			})
			protected.GET("/projects/:id/entities/review-events", semanticEntities.ListReviewEvents)
			protected.POST("/projects/:id/entities/review-events", semanticEntities.CreateReviewEvent)
			protected.PATCH("/projects/:id/entities/review-events/:eventId", semanticEntities.PatchReviewEvent)
			protected.DELETE("/projects/:id/entities/review-events/:eventId", func(c *gin.Context) { semanticEntities.DeleteSemanticItem(c, &model.ReviewEvent{}, c.Param("eventId")) })
			protected.GET("/projects/:id/entities/work-items", semanticEntities.ListWorkItems)
			protected.POST("/projects/:id/entities/work-items", semanticEntities.CreateWorkItem)
			protected.PATCH("/projects/:id/entities/work-items/:workItemId", semanticEntities.PatchWorkItem)
			protected.DELETE("/projects/:id/entities/work-items/:workItemId", func(c *gin.Context) { semanticEntities.DeleteSemanticItem(c, &model.WorkItem{}, c.Param("workItemId")) })
			protected.GET("/projects/:id/entities/work-reviews", semanticEntities.ListWorkReviews)
			protected.POST("/projects/:id/entities/work-reviews", semanticEntities.CreateWorkReview)
			protected.PATCH("/projects/:id/entities/work-reviews/:reviewId", semanticEntities.PatchWorkReview)
			protected.DELETE("/projects/:id/entities/work-reviews/:reviewId", func(c *gin.Context) { semanticEntities.DeleteSemanticItem(c, &model.WorkReview{}, c.Param("reviewId")) })
			protected.GET("/projects/:id/entities/work-dependencies", semanticEntities.ListWorkDependencies)
			protected.POST("/projects/:id/entities/work-dependencies", semanticEntities.CreateWorkDependency)
			protected.PATCH("/projects/:id/entities/work-dependencies/:dependencyId", semanticEntities.PatchWorkDependency)
			protected.DELETE("/projects/:id/entities/work-dependencies/:dependencyId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.WorkDependency{}, c.Param("dependencyId"))
			})
			protected.GET("/projects/:id/entities/delivery-versions", semanticEntities.ListDeliveryVersions)
			protected.POST("/projects/:id/entities/delivery-versions", semanticEntities.CreateDeliveryVersion)
			protected.PATCH("/projects/:id/entities/delivery-versions/:deliveryVersionId", semanticEntities.PatchDeliveryVersion)
			protected.DELETE("/projects/:id/entities/delivery-versions/:deliveryVersionId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.DeliveryVersion{}, c.Param("deliveryVersionId"))
			})
			protected.GET("/projects/:id/entities/delivery-timeline-items", semanticEntities.ListDeliveryTimelineItems)
			protected.POST("/projects/:id/entities/delivery-timeline-items", semanticEntities.CreateDeliveryTimelineItem)
			protected.PATCH("/projects/:id/entities/delivery-timeline-items/:itemId", semanticEntities.PatchDeliveryTimelineItem)
			protected.DELETE("/projects/:id/entities/delivery-timeline-items/:itemId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.DeliveryTimelineItem{}, c.Param("itemId"))
			})
			protected.GET("/projects/:id/entities/export-records", semanticEntities.ListExportRecords)
			protected.POST("/projects/:id/entities/export-records", semanticEntities.CreateExportRecord)
			protected.PATCH("/projects/:id/entities/export-records/:exportId", semanticEntities.PatchExportRecord)
			protected.DELETE("/projects/:id/entities/export-records/:exportId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.ExportRecord{}, c.Param("exportId"))
			})
			protected.GET("/projects/:id/entities/canvas-outputs", semanticEntities.ListCanvasOutputs)
			protected.POST("/projects/:id/entities/canvas-outputs", semanticEntities.CreateCanvasOutput)
			protected.PATCH("/projects/:id/entities/canvas-outputs/:outputId", semanticEntities.PatchCanvasOutput)
			protected.DELETE("/projects/:id/entities/canvas-outputs/:outputId", func(c *gin.Context) {
				semanticEntities.DeleteSemanticItem(c, &model.CanvasOutput{}, c.Param("outputId"))
			})

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

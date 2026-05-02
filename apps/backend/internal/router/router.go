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
	assets := handler.NewAssetHandler(db, store)
	artifactRefs := handler.NewArtifactRefHandler(db)
	settings := handler.NewSettingHandler(db)
	users := handler.NewUserHandler(db)
	authH := handler.NewAuthHandler(db, tokens)
	aiH := handler.NewAIHandler(db, cfg.EncryptionKey, registry)
	resources := handler.NewResourceHandler(db, store)
	resourceBindings := handler.NewResourceBindingHandler(db)
	v2Semantics := handler.NewV2SemanticHandler(db)
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
			protected.GET("/projects/:id/v2/script-versions", v2Semantics.ListScriptVersions)
			protected.POST("/projects/:id/v2/script-versions", v2Semantics.CreateScriptVersion)
			protected.PATCH("/projects/:id/v2/script-versions/:versionId", v2Semantics.PatchScriptVersion)
			protected.DELETE("/projects/:id/v2/script-versions/:versionId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.ScriptVersion{}, c.Param("versionId")) })
			protected.GET("/projects/:id/v2/segments", v2Semantics.ListSegments)
			protected.POST("/projects/:id/v2/segments", v2Semantics.CreateSegment)
			protected.PATCH("/projects/:id/v2/segments/:segmentId", v2Semantics.PatchSegment)
			protected.DELETE("/projects/:id/v2/segments/:segmentId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.Segment{}, c.Param("segmentId")) })
			protected.GET("/projects/:id/v2/scene-moments", v2Semantics.ListSceneMoments)
			protected.POST("/projects/:id/v2/scene-moments", v2Semantics.CreateSceneMoment)
			protected.PATCH("/projects/:id/v2/scene-moments/:sceneMomentId", v2Semantics.PatchSceneMoment)
			protected.DELETE("/projects/:id/v2/scene-moments/:sceneMomentId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.SceneMoment{}, c.Param("sceneMomentId")) })
			protected.GET("/projects/:id/v2/storyboard-scripts", v2Semantics.ListStoryboardScripts)
			protected.POST("/projects/:id/v2/storyboard-scripts", v2Semantics.CreateStoryboardScript)
			protected.PATCH("/projects/:id/v2/storyboard-scripts/:storyboardScriptId", v2Semantics.PatchStoryboardScript)
			protected.DELETE("/projects/:id/v2/storyboard-scripts/:storyboardScriptId", func(c *gin.Context) {
				v2Semantics.DeleteV2Item(c, &model.StoryboardScript{}, c.Param("storyboardScriptId"))
			})
			protected.GET("/projects/:id/v2/storyboard-versions", v2Semantics.ListStoryboardVersions)
			protected.POST("/projects/:id/v2/storyboard-versions", v2Semantics.CreateStoryboardVersion)
			protected.PATCH("/projects/:id/v2/storyboard-versions/:storyboardVersionId", v2Semantics.PatchStoryboardVersion)
			protected.DELETE("/projects/:id/v2/storyboard-versions/:storyboardVersionId", func(c *gin.Context) {
				v2Semantics.DeleteV2Item(c, &model.StoryboardVersion{}, c.Param("storyboardVersionId"))
			})
			protected.GET("/projects/:id/v2/storyboard-lines", v2Semantics.ListStoryboardLines)
			protected.POST("/projects/:id/v2/storyboard-lines", v2Semantics.CreateStoryboardLine)
			protected.PATCH("/projects/:id/v2/storyboard-lines/:storyboardLineId", v2Semantics.PatchStoryboardLine)
			protected.DELETE("/projects/:id/v2/storyboard-lines/:storyboardLineId", func(c *gin.Context) {
				v2Semantics.DeleteV2Item(c, &model.StoryboardLine{}, c.Param("storyboardLineId"))
			})
			protected.GET("/projects/:id/v2/content-units", v2Semantics.ListContentUnits)
			protected.POST("/projects/:id/v2/content-units", v2Semantics.CreateContentUnit)
			protected.PATCH("/projects/:id/v2/content-units/:contentUnitId", v2Semantics.PatchContentUnit)
			protected.DELETE("/projects/:id/v2/content-units/:contentUnitId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.ContentUnit{}, c.Param("contentUnitId")) })
			protected.GET("/projects/:id/v2/keyframes", v2Semantics.ListKeyframes)
			protected.POST("/projects/:id/v2/keyframes", v2Semantics.CreateKeyframe)
			protected.PATCH("/projects/:id/v2/keyframes/:keyframeId", v2Semantics.PatchKeyframe)
			protected.DELETE("/projects/:id/v2/keyframes/:keyframeId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.Keyframe{}, c.Param("keyframeId")) })
			protected.GET("/projects/:id/v2/preview-timelines", v2Semantics.ListPreviewTimelines)
			protected.POST("/projects/:id/v2/preview-timelines", v2Semantics.CreatePreviewTimeline)
			protected.PATCH("/projects/:id/v2/preview-timelines/:timelineId", v2Semantics.PatchPreviewTimeline)
			protected.DELETE("/projects/:id/v2/preview-timelines/:timelineId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.PreviewTimeline{}, c.Param("timelineId")) })
			protected.GET("/projects/:id/v2/preview-timeline-items", v2Semantics.ListPreviewTimelineItemsFlat)
			protected.POST("/projects/:id/v2/preview-timeline-items", v2Semantics.CreatePreviewTimelineItemFlat)
			protected.PATCH("/projects/:id/v2/preview-timeline-items/:itemId", v2Semantics.PatchPreviewTimelineItemFlat)
			protected.DELETE("/projects/:id/v2/preview-timeline-items/:itemId", func(c *gin.Context) {
				v2Semantics.DeleteV2Item(c, &model.PreviewTimelineItem{}, c.Param("itemId"))
			})
			protected.GET("/projects/:id/v2/preview-timelines/:timelineId/items", v2Semantics.ListPreviewTimelineItems)
			protected.POST("/projects/:id/v2/preview-timelines/:timelineId/items", v2Semantics.CreatePreviewTimelineItem)
			protected.PATCH("/projects/:id/v2/preview-timelines/:timelineId/items/:itemId", v2Semantics.PatchPreviewTimelineItem)
			protected.DELETE("/projects/:id/v2/preview-timelines/:timelineId/items/:itemId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.PreviewTimelineItem{}, c.Param("itemId")) })
			protected.GET("/projects/:id/v2/creative-references", v2Semantics.ListCreativeReferences)
			protected.POST("/projects/:id/v2/creative-references", v2Semantics.CreateCreativeReference)
			protected.PATCH("/projects/:id/v2/creative-references/:referenceId", v2Semantics.PatchCreativeReference)
			protected.DELETE("/projects/:id/v2/creative-references/:referenceId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.CreativeReference{}, c.Param("referenceId")) })
			protected.GET("/projects/:id/v2/creative-reference-states", v2Semantics.ListCreativeReferenceStates)
			protected.POST("/projects/:id/v2/creative-reference-states", v2Semantics.CreateCreativeReferenceState)
			protected.PATCH("/projects/:id/v2/creative-reference-states/:stateId", v2Semantics.PatchCreativeReferenceState)
			protected.DELETE("/projects/:id/v2/creative-reference-states/:stateId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.CreativeReferenceState{}, c.Param("stateId")) })
			protected.GET("/projects/:id/v2/creative-reference-usages", v2Semantics.ListCreativeReferenceUsages)
			protected.POST("/projects/:id/v2/creative-reference-usages", v2Semantics.CreateCreativeReferenceUsage)
			protected.PATCH("/projects/:id/v2/creative-reference-usages/:usageId", v2Semantics.PatchCreativeReferenceUsage)
			protected.DELETE("/projects/:id/v2/creative-reference-usages/:usageId", func(c *gin.Context) {
				v2Semantics.DeleteV2Item(c, &model.CreativeReferenceUsage{}, c.Param("usageId"))
			})
			protected.GET("/projects/:id/v2/creative-relationships", v2Semantics.ListCreativeRelationships)
			protected.POST("/projects/:id/v2/creative-relationships", v2Semantics.CreateCreativeRelationship)
			protected.PATCH("/projects/:id/v2/creative-relationships/:relationshipId", v2Semantics.PatchCreativeRelationship)
			protected.DELETE("/projects/:id/v2/creative-relationships/:relationshipId", func(c *gin.Context) {
				v2Semantics.DeleteV2Item(c, &model.CreativeRelationship{}, c.Param("relationshipId"))
			})
			protected.GET("/projects/:id/v2/asset-slots", v2Semantics.ListAssetSlots)
			protected.POST("/projects/:id/v2/asset-slots", v2Semantics.CreateAssetSlot)
			protected.PATCH("/projects/:id/v2/asset-slots/:slotId", v2Semantics.PatchAssetSlot)
			protected.DELETE("/projects/:id/v2/asset-slots/:slotId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.AssetSlot{}, c.Param("slotId")) })
			protected.GET("/projects/:id/v2/asset-slot-candidates", v2Semantics.ListAssetSlotCandidates)
			protected.POST("/projects/:id/v2/asset-slot-candidates", v2Semantics.CreateAssetSlotCandidate)
			protected.PATCH("/projects/:id/v2/asset-slot-candidates/:candidateId", v2Semantics.PatchAssetSlotCandidate)
			protected.DELETE("/projects/:id/v2/asset-slot-candidates/:candidateId", func(c *gin.Context) {
				v2Semantics.DeleteV2Item(c, &model.AssetSlotCandidate{}, c.Param("candidateId"))
			})
			protected.GET("/projects/:id/v2/candidate-decisions", v2Semantics.ListCandidateDecisions)
			protected.POST("/projects/:id/v2/candidate-decisions", v2Semantics.CreateCandidateDecision)
			protected.PATCH("/projects/:id/v2/candidate-decisions/:decisionId", v2Semantics.PatchCandidateDecision)
			protected.DELETE("/projects/:id/v2/candidate-decisions/:decisionId", func(c *gin.Context) {
				v2Semantics.DeleteV2Item(c, &model.CandidateDecision{}, c.Param("decisionId"))
			})
			protected.GET("/projects/:id/v2/review-events", v2Semantics.ListReviewEvents)
			protected.POST("/projects/:id/v2/review-events", v2Semantics.CreateReviewEvent)
			protected.PATCH("/projects/:id/v2/review-events/:eventId", v2Semantics.PatchReviewEvent)
			protected.DELETE("/projects/:id/v2/review-events/:eventId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.ReviewEvent{}, c.Param("eventId")) })
			protected.GET("/projects/:id/v2/work-items", v2Semantics.ListWorkItems)
			protected.POST("/projects/:id/v2/work-items", v2Semantics.CreateWorkItem)
			protected.PATCH("/projects/:id/v2/work-items/:workItemId", v2Semantics.PatchWorkItem)
			protected.DELETE("/projects/:id/v2/work-items/:workItemId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.WorkItem{}, c.Param("workItemId")) })
			protected.GET("/projects/:id/v2/work-reviews", v2Semantics.ListWorkReviews)
			protected.POST("/projects/:id/v2/work-reviews", v2Semantics.CreateWorkReview)
			protected.PATCH("/projects/:id/v2/work-reviews/:reviewId", v2Semantics.PatchWorkReview)
			protected.DELETE("/projects/:id/v2/work-reviews/:reviewId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.WorkReview{}, c.Param("reviewId")) })
			protected.GET("/projects/:id/v2/work-dependencies", v2Semantics.ListWorkDependencies)
			protected.POST("/projects/:id/v2/work-dependencies", v2Semantics.CreateWorkDependency)
			protected.PATCH("/projects/:id/v2/work-dependencies/:dependencyId", v2Semantics.PatchWorkDependency)
			protected.DELETE("/projects/:id/v2/work-dependencies/:dependencyId", func(c *gin.Context) {
				v2Semantics.DeleteV2Item(c, &model.WorkDependency{}, c.Param("dependencyId"))
			})
			protected.GET("/projects/:id/v2/delivery-versions", v2Semantics.ListDeliveryVersions)
			protected.POST("/projects/:id/v2/delivery-versions", v2Semantics.CreateDeliveryVersion)
			protected.PATCH("/projects/:id/v2/delivery-versions/:deliveryVersionId", v2Semantics.PatchDeliveryVersion)
			protected.DELETE("/projects/:id/v2/delivery-versions/:deliveryVersionId", func(c *gin.Context) {
				v2Semantics.DeleteV2Item(c, &model.DeliveryVersion{}, c.Param("deliveryVersionId"))
			})
			protected.GET("/projects/:id/v2/delivery-timeline-items", v2Semantics.ListDeliveryTimelineItems)
			protected.POST("/projects/:id/v2/delivery-timeline-items", v2Semantics.CreateDeliveryTimelineItem)
			protected.PATCH("/projects/:id/v2/delivery-timeline-items/:itemId", v2Semantics.PatchDeliveryTimelineItem)
			protected.DELETE("/projects/:id/v2/delivery-timeline-items/:itemId", func(c *gin.Context) {
				v2Semantics.DeleteV2Item(c, &model.DeliveryTimelineItem{}, c.Param("itemId"))
			})
			protected.GET("/projects/:id/v2/export-records", v2Semantics.ListExportRecords)
			protected.POST("/projects/:id/v2/export-records", v2Semantics.CreateExportRecord)
			protected.PATCH("/projects/:id/v2/export-records/:exportId", v2Semantics.PatchExportRecord)
			protected.DELETE("/projects/:id/v2/export-records/:exportId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.ExportRecord{}, c.Param("exportId")) })
			protected.GET("/projects/:id/v2/canvas-outputs", v2Semantics.ListCanvasOutputs)
			protected.POST("/projects/:id/v2/canvas-outputs", v2Semantics.CreateCanvasOutput)
			protected.PATCH("/projects/:id/v2/canvas-outputs/:outputId", v2Semantics.PatchCanvasOutput)
			protected.DELETE("/projects/:id/v2/canvas-outputs/:outputId", func(c *gin.Context) { v2Semantics.DeleteV2Item(c, &model.CanvasOutput{}, c.Param("outputId")) })

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

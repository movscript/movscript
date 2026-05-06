package router

import (
	"github.com/movscript/movscript/internal/interfaces/http/handler"
	wsiface "github.com/movscript/movscript/internal/interfaces/ws"
)

type handlers struct {
	projects         *handler.ProjectHandler
	scripts          *handler.ScriptHandler
	artifactRefs     *handler.ArtifactRefHandler
	settings         *handler.SettingHandler
	users            *handler.UserHandler
	auth             *handler.AuthHandler
	ai               *handler.AIHandler
	resources        *handler.ResourceHandler
	resourceBindings *handler.ResourceBindingHandler
	semanticEntities *handler.SemanticEntityHandler
	preview          *handler.PreviewHandler
	resourceFolders  *handler.ResourceFolderHandler
	resourceAdmin    *handler.ResourceAdminHandler
	canvases         *handler.CanvasHandler
	models           *handler.ModelsHandler
	feature          *handler.FeatureHandler
	jobs             *handler.JobHandler
	modelGateway     *handler.ModelGatewayHandler
	debug            *handler.DebugHandler
	plugin           *handler.PluginHandler
	hub              *handler.HubHandler
	registry         *handler.RegistryHandler
	workflowSchemas  *handler.WorkflowSchemaHandler
	workflowMarket   *handler.WorkflowMarketHandler
	audit            *handler.AuditHandler
	cloudFileConfig  *handler.CloudFileConfigHandler
	entitlement      *handler.EntitlementHandler
	org              *handler.OrgHandler
	ws               *wsiface.Handler
}

func newHandlers(deps Dependencies) handlers {
	db := deps.DB
	cfg := deps.Config
	store := deps.Store
	tokens := deps.Tokens
	registry := deps.Registry
	aiService := deps.AIService
	cacheStore := deps.Cache

	return handlers{
		projects:         handler.NewProjectHandler(db, cacheStore),
		scripts:          handler.NewScriptHandler(db, cacheStore),
		artifactRefs:     handler.NewArtifactRefHandler(db),
		settings:         handler.NewSettingHandler(db),
		users:            handler.NewUserHandler(db),
		auth:             handler.NewAuthHandlerWithConfig(db, tokens, cfg),
		ai:               handler.NewAIHandler(db, cfg.EncryptionKey, registry),
		resources:        handler.NewResourceHandler(db, store, cacheStore),
		resourceBindings: handler.NewResourceBindingHandler(db),
		semanticEntities: handler.NewSemanticEntityHandler(db, cacheStore),
		preview:          handler.NewPreviewHandler(db),
		resourceFolders:  handler.NewResourceFolderHandler(db, cacheStore),
		resourceAdmin:    handler.NewResourceAdminHandler(db, store),
		canvases:         handler.NewCanvasHandler(db, registry, aiService, store),
		models:           handler.NewModelsHandler(aiService, cacheStore),
		feature:          handler.NewFeatureHandler(db),
		jobs:             handler.NewJobHandler(db, aiService),
		modelGateway:     handler.NewModelGatewayHandler(db, aiService),
		debug:            handler.NewDebugHandler(db, deps.EncryptionKey),
		plugin:           handler.NewPluginHandler(db),
		hub:              handler.NewHubHandler(db, store, cfg.HubAdminToken),
		registry:         handler.NewRegistryHandler(),
		workflowSchemas:  handler.NewWorkflowSchemaHandler(db),
		workflowMarket:   handler.NewWorkflowMarketHandler(db),
		audit:            handler.NewAuditHandler(db),
		cloudFileConfig:  handler.NewCloudFileConfigHandler(db, cfg.EncryptionKey),
		entitlement:      handler.NewEntitlementHandler(deps.Entitlements),
		org:              handler.NewOrgHandler(db),
		ws:               wsiface.NewHandler(),
	}
}

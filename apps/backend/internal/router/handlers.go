package router

import "github.com/movscript/movscript/internal/handler"

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
	chat             *handler.ChatHandler
	modelGateway     *handler.ModelGatewayHandler
	debug            *handler.DebugHandler
	plugin           *handler.PluginHandler
	registry         *handler.RegistryHandler
	workflowSchemas  *handler.WorkflowSchemaHandler
	workflowMarket   *handler.WorkflowMarketHandler
	audit            *handler.AuditHandler
	cloudFileConfig  *handler.CloudFileConfigHandler
	org              *handler.OrgHandler
}

func newHandlers(deps Dependencies) handlers {
	db := deps.DB
	cfg := deps.Config
	store := deps.Store
	tokens := deps.Tokens
	registry := deps.Registry
	aiService := deps.AIService

	return handlers{
		projects:         handler.NewProjectHandler(db),
		scripts:          handler.NewScriptHandler(db),
		artifactRefs:     handler.NewArtifactRefHandler(db),
		settings:         handler.NewSettingHandler(db),
		users:            handler.NewUserHandler(db),
		auth:             handler.NewAuthHandler(db, tokens),
		ai:               handler.NewAIHandler(db, cfg.EncryptionKey, registry),
		resources:        handler.NewResourceHandler(db, store),
		resourceBindings: handler.NewResourceBindingHandler(db),
		semanticEntities: handler.NewSemanticEntityHandler(db),
		preview:          handler.NewPreviewHandler(db),
		resourceFolders:  handler.NewResourceFolderHandler(db),
		resourceAdmin:    handler.NewResourceAdminHandler(db, store),
		canvases:         handler.NewCanvasHandler(db, registry, aiService, store),
		models:           handler.NewModelsHandler(aiService),
		feature:          handler.NewFeatureHandler(db, aiService),
		jobs:             handler.NewJobHandler(db, aiService),
		chat:             handler.NewChatHandler(db, aiService),
		modelGateway:     handler.NewModelGatewayHandler(db, aiService),
		debug:            handler.NewDebugHandler(db, deps.EncryptionKey, registry),
		plugin:           handler.NewPluginHandler(db),
		registry:         handler.NewRegistryHandler(),
		workflowSchemas:  handler.NewWorkflowSchemaHandler(db),
		workflowMarket:   handler.NewWorkflowMarketHandler(db),
		audit:            handler.NewAuditHandler(db),
		cloudFileConfig:  handler.NewCloudFileConfigHandler(db, cfg.EncryptionKey),
		org:              handler.NewOrgHandler(db),
	}
}

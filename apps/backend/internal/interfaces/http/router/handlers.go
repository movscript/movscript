package router

import (
	"github.com/movscript/movscript/internal/interfaces/http/handler"
	wsiface "github.com/movscript/movscript/internal/interfaces/ws"
)

type handlers struct {
	editionHandlers

	projects          *handler.ProjectHandler
	decisions         *handler.DecisionHandler
	users             *handler.UserHandler
	userAdmin         *handler.UserAdminHandler
	auth              *handler.AuthHandler
	ai                *handler.AIHandler
	resources         *handler.ResourceHandler
	mediaStreams      *handler.MediaStreamHandler
	externalResources *handler.ExternalResourceHandler
	shotReferences    *handler.ShotReferenceHandler
	resourceFolders   *handler.ResourceFolderHandler
	resourceAdmin     *handler.ResourceAdminHandler
	canvases          *handler.CanvasHandler
	models            *handler.ModelsHandler
	jobs              *handler.JobHandler
	modelGateway      *handler.ModelGatewayHandler
	debug             *handler.DebugHandler
	plugin            *handler.PluginHandler
	hub               *handler.HubHandler
	registry          *handler.RegistryHandler
	audit             *handler.AuditHandler
	usageAdmin        *handler.UsageAdminHandler
	cloudFileConfig   *handler.CloudFileConfigHandler
	adminSettings     *handler.AdminSettingsHandler
	entitlement       *handler.EntitlementHandler
	org               *handler.OrgHandler
	orgAdmin          *handler.OrgAdminHandler
	adminOverview     *handler.AdminOverviewHandler
	agentTelemetry    *handler.AgentTelemetryHandler
	agentRuntime      *handler.AgentRuntimeHandler
	audio             *handler.AudioHandler
	ws                *wsiface.Handler
}

func newHandlers(deps Dependencies) handlers {
	db := deps.DB
	cfg := deps.Config
	store := deps.Store
	tokens := deps.Tokens
	registry := deps.Registry
	aiService := deps.AIService
	cacheStore := deps.Cache
	imageVerifier := deps.ImageVerifier

	return handlers{
		editionHandlers:   newEditionHandlers(deps),
		projects:          handler.NewProjectHandlerWithConfigEncryptionAndTokens(db, cfg, deps.EncryptionKey, tokens, cacheStore),
		decisions:         handler.NewDecisionHandler(db),
		users:             handler.NewUserHandler(db),
		userAdmin:         handler.NewUserAdminHandler(db),
		auth:              handler.NewAuthHandlerWithConfigAndEncryption(db, tokens, cfg, deps.EncryptionKey),
		ai:                handler.NewAIHandlerWithConfig(db, cfg, cfg.EncryptionKey, registry),
		resources:         handler.NewResourceHandler(db, store, imageVerifier, cfg.MaxUploadBytes, cacheStore),
		mediaStreams:      handler.NewMediaStreamHandler(db, store, cfg.MaxUploadBytes),
		externalResources: handler.NewExternalResourceHandler(db, cfg.EncryptionKey),
		shotReferences:    handler.NewShotReferenceHandlerWithVectorIndex(db, store, imageVerifier, deps.VectorIndex, cfg.MaxUploadBytes, cacheStore),
		resourceFolders:   handler.NewResourceFolderHandler(db, cacheStore),
		resourceAdmin:     handler.NewResourceAdminHandler(db, store),
		canvases:          handler.NewCanvasHandler(db, registry, aiService, store),
		models:            handler.NewModelsHandler(aiService, cacheStore),
		jobs:              handler.NewJobHandler(db, aiService, deps.SystemMessages),
		modelGateway:      handler.NewModelGatewayHandler(db, aiService, tokens),
		debug:             handler.NewDebugHandlerWithGatewayHealth(db, deps.EncryptionKey, aiService),
		plugin:            handler.NewPluginHandler(db),
		hub:               handler.NewHubHandler(db, store, cfg.HubAdminToken),
		registry:          handler.NewRegistryHandler(),
		audit:             handler.NewAuditHandler(db),
		usageAdmin:        handler.NewUsageAdminHandler(db),
		cloudFileConfig:   handler.NewCloudFileConfigHandler(db, cfg.EncryptionKey),
		adminSettings:     handler.NewAdminSettingsHandler(db, cfg.EncryptionKey),
		entitlement:       handler.NewEntitlementHandler(deps.Entitlements),
		org:               handler.NewOrgHandler(db, tokens),
		orgAdmin:          handler.NewOrgAdminHandler(db),
		adminOverview:     handler.NewAdminOverviewHandler(db),
		agentTelemetry:    handler.NewAgentTelemetryHandler(nil),
		agentRuntime:      handler.NewAgentRuntimeHandler(db, cfg),
		audio:             handler.NewAudioHandler(db, aiService, store),
		ws:                wsiface.NewHandler(deps.SystemMessages),
	}
}

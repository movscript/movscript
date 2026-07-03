package router

import (
	"github.com/movscript/movscript/internal/interfaces/http/handler"
	wsiface "github.com/movscript/movscript/internal/interfaces/ws"
)

type handlers struct {
	distributionProfileHandlers

	projects          *handler.ProjectHandler
	decisions         *handler.DecisionHandler
	projectData       *handler.ProjectDataHandler
	contentCandidates *handler.ContentCandidateHandler
	users             *handler.UserHandler
	userAdmin         *handler.UserAdminHandler
	ai                *handler.AIHandler
	resources         *handler.ResourceHandler
	resourceAccess    *handler.ResourceAccessHandler
	providerAssets    *handler.ProviderAssetHandler
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
		distributionProfileHandlers: newDistributionProfileHandlers(deps),
		projects:                    handler.NewProjectHandlerWithConfigEncryptionTokensAndIdentity(db, cfg, deps.EncryptionKey, tokens, deps.AuthIdentity, cacheStore),
		decisions:                   handler.NewDecisionHandler(db),
		projectData:                 handler.NewProjectDataHandler(db),
		contentCandidates:           handler.NewContentCandidateHandler(db, aiService),
		users:                       handler.NewUserHandler(deps.AuthIdentity),
		userAdmin:                   handler.NewUserAdminHandler(db, deps.AuthIdentity),
		ai:                          handler.NewAIHandlerWithConfig(db, cfg, cfg.EncryptionKey, registry),
		resources:                   handler.NewResourceHandlerWithIdentity(db, store, imageVerifier, cfg.MaxUploadBytes, deps.AuthIdentity, cacheStore),
		resourceAccess:              handler.NewResourceAccessHandler(db, store, cfg.EncryptionKey, imageVerifier, cacheStore),
		providerAssets:              handler.NewProviderAssetHandler(db, cfg, store, imageVerifier, cfg.EncryptionKey, cacheStore),
		mediaStreams:                handler.NewMediaStreamHandler(db, store, cfg.MaxUploadBytes),
		externalResources:           handler.NewExternalResourceHandler(db, cfg.EncryptionKey),
		shotReferences:              handler.NewShotReferenceHandlerWithVectorIndex(db, store, imageVerifier, deps.VectorIndex, cfg.MaxUploadBytes, cacheStore),
		resourceFolders:             handler.NewResourceFolderHandlerWithIdentity(db, deps.AuthIdentity, cacheStore),
		resourceAdmin:               handler.NewResourceAdminHandler(db, store, deps.AuthIdentity),
		canvases:                    handler.NewCanvasHandlerWithIdentity(db, deps.AuthIdentity),
		models:                      handler.NewModelsHandler(aiService, cacheStore),
		jobs:                        handler.NewJobHandlerWithIdentity(db, aiService, deps.AuthIdentity, deps.SystemMessages),
		modelGateway:                handler.NewModelGatewayHandler(db, aiService, deps.AuthIdentity),
		debug:                       handler.NewDebugHandlerWithGatewayHealth(db, deps.EncryptionKey, aiService, deps.AuthIdentity),
		plugin:                      handler.NewPluginHandler(db),
		hub:                         handler.NewHubHandler(db, store, cfg.HubAdminToken),
		registry:                    handler.NewRegistryHandler(),
		audit:                       handler.NewAuditHandler(db),
		usageAdmin:                  handler.NewUsageAdminHandler(db, deps.AuthIdentity),
		cloudFileConfig:             handler.NewCloudFileConfigHandler(db, cfg.EncryptionKey),
		adminSettings:               handler.NewAdminSettingsHandler(db, cfg.EncryptionKey),
		entitlement:                 handler.NewEntitlementHandler(deps.Entitlements),
		org:                         handler.NewOrgHandler(db, deps.AuthIdentity),
		orgAdmin:                    handler.NewOrgAdminHandler(db, deps.AuthIdentity),
		adminOverview:               handler.NewAdminOverviewHandler(db, deps.AuthIdentity),
		agentTelemetry:              handler.NewAgentTelemetryHandler(nil),
		agentRuntime:                handler.NewAgentRuntimeHandler(db, cfg),
		audio:                       handler.NewAudioHandler(db, aiService, store),
		ws:                          wsiface.NewHandler(deps.SystemMessages),
	}
}

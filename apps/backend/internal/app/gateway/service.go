package gateway

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	domaingateway "github.com/movscript/movscript/internal/domain/gateway"
	"github.com/movscript/movscript/internal/infra/ai"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

var (
	ErrAPIKeyNotFound            = errors.New("gateway api key not found")
	ErrProjectNotFound           = errors.New("gateway project not found")
	ErrProjectOutsideOrg         = errors.New("gateway project is outside current org")
	ErrGatewayUsageLimitExceeded = errors.New("gateway usage limit exceeded")
	ErrGatewayRateLimited        = errors.New("gateway rate limit exceeded")
	ErrInsufficientScope         = errors.New("gateway key is not allowed to use requested scope")
	ErrCatalogEntryNotAllowed    = errors.New("gateway key is not allowed to use this catalog entry")
	ErrProjectNotAllowed         = errors.New("gateway key is not allowed to use this project scope")
	ErrModelNotFound             = errors.New("gateway model not found")
	ErrUnsupportedParameter      = errors.New("unsupported gateway request parameter")
	ErrModelUnavailable          = errors.New("gateway model unavailable")
)

type Service struct {
	repo    repository
	ai      *ai.AIService
	catalog providercontract.AIGatewayModelCatalog
	routing providercontract.AIGatewayRoutingPolicy
	policy  *PolicyService
}

func NewService(db *gorm.DB, aiService ...*ai.AIService) *Service {
	var svc *ai.AIService
	if len(aiService) > 0 {
		svc = aiService[0]
	}
	repo := &gormRepository{db: db}
	service := &Service{repo: repo, ai: svc, policy: &PolicyService{repo: repo}}
	if svc != nil {
		service.catalog = svc
		service.routing = svc
	}
	return service
}

type CreateAPIKeyInput struct {
	OwnerUserID            uint
	OrgID                  *uint
	Name                   string
	ProjectID              *uint
	AllowedCatalogEntryIDs []uint
	AllowedScopes          []string
	Runtime                APIKeyCreateRuntimeInput
}

type UpdateAPIKeyInput struct {
	ID                     uint
	OwnerUserID            uint
	OrgID                  *uint
	Name                   *string
	ProjectID              *uint
	ProjectIDSet           bool
	AllowedCatalogEntryIDs []uint
	AllowedScopes          []string
	IsEnabled              *bool
	Runtime                APIKeyUpdateRuntimeInput
}

type CreateAPIKeyResult struct {
	Key    domaingateway.APIKey
	RawKey string
}

type Principal struct {
	UserID uint
	Key    *domaingateway.APIKey
}

type ChatInput struct {
	Principal   Principal
	Model       string
	Text        ai.TextRequest
	ProjectID   *uint
	RequireChat bool
}

type ResponsesInput struct {
	Principal Principal
	Model     string
	Text      ai.TextRequest
	Responses ai.ResponsesRequest
	ProjectID *uint
}

type OpenAIProxyInput struct {
	Principal    Principal
	Model        string
	ProjectID    *uint
	Capabilities []string
}

type OpenAIProxyRoute struct {
	ModelConfigID uint
	ResponseModel string
	Target        ai.OpenAIProxyTarget
}

type ChatResult struct {
	ModelConfigID uint
	ResponseModel string
	Response      ai.TextResponse
}

type ChatStreamResult struct {
	ModelConfigID uint
	ResponseModel string
	Events        <-chan ai.TextStreamEvent
}

type ResponsesStreamResult struct {
	ModelConfigID uint
	ResponseModel string
	Events        <-chan ai.ResponsesStreamEvent
}

type ModelNotFoundError struct {
	Message string
}

func (e ModelNotFoundError) Error() string {
	return e.Message
}

func (e ModelNotFoundError) Unwrap() error {
	return ErrModelNotFound
}

func IsUsageLimitExceeded(err error) bool {
	return errors.Is(err, ai.ErrUsageLimitExceeded)
}

func (s *Service) ListAPIKeys(ctx context.Context, ownerUserID uint, orgID *uint) ([]domaingateway.APIKey, error) {
	includeLegacy := orgID != nil && s.policy.IsPersonalOrg(ctx, *orgID)
	return s.repo.ListAPIKeys(ctx, ownerUserID, orgID, includeLegacy)
}

func (s *Service) CreateAPIKey(ctx context.Context, input CreateAPIKeyInput) (CreateAPIKeyResult, error) {
	if err := s.policy.EnsureProjectInOrg(ctx, input.ProjectID, input.OrgID); err != nil {
		return CreateAPIKeyResult{}, err
	}
	rawKey := GenerateAPIKey()
	domainKey := domaingateway.NewAPIKey(domaingateway.NewAPIKeySpec{
		Name:                   input.Name,
		KeyPrefix:              KeyPrefix(rawKey),
		KeyHash:                HashAPIKey(rawKey),
		OwnerUserID:            input.OwnerUserID,
		OrgID:                  input.OrgID,
		ProjectID:              input.ProjectID,
		AllowedCatalogEntryIDs: input.AllowedCatalogEntryIDs,
		AllowedScopes:          input.AllowedScopes,
	})
	applyAPIKeyRuntimeCreateFields(&domainKey, input.Runtime)
	if err := s.repo.CreateAPIKey(ctx, &domainKey); err != nil {
		return CreateAPIKeyResult{}, err
	}
	return CreateAPIKeyResult{Key: domainKey, RawKey: rawKey}, nil
}

func (s *Service) UpdateAPIKey(ctx context.Context, input UpdateAPIKeyInput) (domaingateway.APIKey, error) {
	key, err := s.policy.FindOwnedAPIKey(ctx, input.ID, input.OwnerUserID, input.OrgID)
	if err != nil {
		return key, err
	}
	if input.ProjectIDSet {
		if err := s.policy.EnsureProjectInOrg(ctx, input.ProjectID, input.OrgID); err != nil {
			return key, err
		}
	}
	key.ApplyUpdate(domaingateway.APIKeyUpdateSpec{
		Name:                   input.Name,
		ProjectID:              input.ProjectID,
		ProjectIDSet:           input.ProjectIDSet,
		AllowedCatalogEntryIDs: input.AllowedCatalogEntryIDs,
		AllowedScopes:          input.AllowedScopes,
		IsEnabled:              input.IsEnabled,
	})
	applyAPIKeyRuntimeUpdateFields(&key, input.Runtime)
	if err := s.repo.UpdateAPIKey(ctx, &key); err != nil {
		return key, err
	}
	if err := s.repo.ReloadAPIKey(ctx, &key); err != nil {
		return key, err
	}
	return key, nil
}

func (s *Service) DeleteAPIKey(ctx context.Context, id uint, ownerUserID uint, orgID *uint) (domaingateway.APIKey, error) {
	key, err := s.policy.FindOwnedAPIKey(ctx, id, ownerUserID, orgID)
	if err != nil {
		return domaingateway.APIKey{}, err
	}
	if err := s.repo.DeleteAPIKey(ctx, &key); err != nil {
		return key, err
	}
	return key, nil
}

func (s *Service) PrincipalForAPIKey(ctx context.Context, rawKey string) (Principal, bool, error) {
	hash := HashAPIKey(rawKey)
	key, err := s.repo.FindAPIKeyByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, ErrAPIKeyNotFound) {
			return Principal{}, false, nil
		}
		return Principal{}, false, err
	}
	userExists, err := s.repo.UserExists(ctx, key.OwnerUserID)
	if err != nil {
		return Principal{}, false, err
	}
	if !userExists {
		return Principal{}, false, nil
	}
	now := time.Now()
	if err := s.repo.TouchAPIKeyLastUsed(ctx, &key, now); err != nil {
		return Principal{}, false, err
	}
	key.LastUsedAt = &now
	return Principal{UserID: key.OwnerUserID, Key: &key}, true, nil
}

func (s *Service) ListChatModels(ctx context.Context, principal Principal) ([]ChatModel, error) {
	if err := s.policy.CanListChatModels(principal); err != nil {
		return nil, err
	}
	if s.catalog == nil {
		return nil, ErrModelUnavailable
	}
	ctx = s.providerRouteContextForPrincipal(ctx, principal)
	descriptors, err := s.catalog.ListModels(ctx, providercontract.AIModelListFilter{
		Capabilities: []string{ai.CapabilityText, ai.CapabilityReasoning},
	})
	if err != nil {
		return nil, err
	}
	models := make([]ChatModel, 0, len(descriptors))
	for _, descriptor := range descriptors {
		model := chatModelFromDescriptor(descriptor)
		if !principalCanListChatModel(principal, model) {
			continue
		}
		models = append(models, model)
	}
	return models, nil
}

func (s *Service) CallChat(ctx context.Context, input ChatInput) (ChatResult, error) {
	route, responseModel, textReq, err := s.prepareChat(ctx, input)
	if err != nil {
		return ChatResult{}, err
	}
	ctx = s.providerRouteContextForPrincipal(ctx, input.Principal)
	resp, err := s.ai.CallTextWithRouteUsage(ctx, input.Principal.UserID, aiRouteFromGateway(route), textReq, UsageContext(input.Principal.Key, input.ProjectID))
	if err != nil {
		return ChatResult{}, err
	}
	return ChatResult{ModelConfigID: route.ModelConfigID, ResponseModel: responseModel, Response: resp}, nil
}

func (s *Service) CallResponses(ctx context.Context, input ResponsesInput) (ChatResult, error) {
	route, responseModel, textReq, err := s.prepareChat(ctx, ChatInput{
		Principal: input.Principal,
		Model:     input.Model,
		Text:      input.Text,
		ProjectID: input.ProjectID,
	})
	if err != nil {
		return ChatResult{}, err
	}
	responsesReq := input.Responses
	responsesReq.Text = textReq
	ctx = s.providerRouteContextForPrincipal(ctx, input.Principal)
	resp, err := s.ai.CallResponsesWithRouteUsage(ctx, input.Principal.UserID, aiRouteFromGateway(route), responsesReq, UsageContext(input.Principal.Key, input.ProjectID))
	if err != nil {
		return ChatResult{}, err
	}
	return ChatResult{ModelConfigID: route.ModelConfigID, ResponseModel: responseModel, Response: resp}, nil
}

func (s *Service) CallChatStream(ctx context.Context, input ChatInput) (ChatStreamResult, error) {
	route, responseModel, textReq, err := s.prepareChat(ctx, input)
	if err != nil {
		return ChatStreamResult{}, err
	}
	ctx = s.providerRouteContextForPrincipal(ctx, input.Principal)
	events, err := s.ai.CallTextStreamWithRouteUsage(ctx, input.Principal.UserID, aiRouteFromGateway(route), textReq, UsageContext(input.Principal.Key, input.ProjectID))
	if err != nil {
		return ChatStreamResult{}, err
	}
	return ChatStreamResult{ModelConfigID: route.ModelConfigID, ResponseModel: responseModel, Events: events}, nil
}

func (s *Service) CallResponsesStream(ctx context.Context, input ResponsesInput) (ResponsesStreamResult, error) {
	route, responseModel, textReq, err := s.prepareChat(ctx, ChatInput{
		Principal: input.Principal,
		Model:     input.Model,
		Text:      input.Text,
		ProjectID: input.ProjectID,
	})
	if err != nil {
		return ResponsesStreamResult{}, err
	}
	responsesReq := input.Responses
	responsesReq.Text = textReq
	ctx = s.providerRouteContextForPrincipal(ctx, input.Principal)
	events, err := s.ai.CallResponsesStreamWithRouteUsage(ctx, input.Principal.UserID, aiRouteFromGateway(route), responsesReq, UsageContext(input.Principal.Key, input.ProjectID))
	if err != nil {
		return ResponsesStreamResult{}, err
	}
	return ResponsesStreamResult{ModelConfigID: route.ModelConfigID, ResponseModel: responseModel, Events: events}, nil
}

func (s *Service) PrepareOpenAIProxy(ctx context.Context, input OpenAIProxyInput) (OpenAIProxyRoute, error) {
	if s.ai == nil {
		return OpenAIProxyRoute{}, ErrModelUnavailable
	}
	ctx = s.providerRouteContextForPrincipal(ctx, input.Principal)
	capabilities := compactOpenAIProxyCapabilities(input.Capabilities)
	routeLookupID, responseModel, capability, err := s.resolveOpenAIProxyModel(ctx, input.Model, capabilities)
	if err != nil {
		return OpenAIProxyRoute{}, err
	}
	route, err := s.resolveRuntimeRouteForProxyRequest(ctx, input.Model, routeLookupID, capability)
	if err != nil {
		return OpenAIProxyRoute{}, err
	}
	if input.Principal.Key != nil {
		if err := s.policy.CanCallChat(ctx, input.Principal, input.ProjectID, 0, routeAllowedCatalogEntryID(route)); err != nil {
			return OpenAIProxyRoute{}, err
		}
	}
	if input.Principal.Key != nil && input.Principal.Key.OrgID != nil {
		ctx = ai.WithProviderOrgID(ctx, *input.Principal.Key.OrgID)
	}
	target, err := s.ai.OpenAIProxyTargetForRoute(ctx, input.Principal.UserID, aiRouteFromGateway(route), capability)
	if err != nil {
		return OpenAIProxyRoute{}, fmt.Errorf("%w: %v", ErrModelUnavailable, err)
	}
	return OpenAIProxyRoute{ModelConfigID: route.ModelConfigID, ResponseModel: responseModel, Target: target}, nil
}

func (s *Service) prepareChat(ctx context.Context, input ChatInput) (providercontract.AIGatewayModelRoute, string, ai.TextRequest, error) {
	ctx = s.providerRouteContextForPrincipal(ctx, input.Principal)
	routeLookupID, responseModel, err := s.ResolveTextModel(ctx, input.Model)
	if err != nil {
		return providercontract.AIGatewayModelRoute{}, responseModel, ai.TextRequest{}, err
	}
	route, err := s.resolveRuntimeTextRouteForRequest(ctx, input.Model, routeLookupID)
	if err != nil {
		return providercontract.AIGatewayModelRoute{}, responseModel, ai.TextRequest{}, err
	}

	textReq := input.Text
	if _, err := s.ai.PreflightTextRoute(ctx, input.Principal.UserID, aiRouteFromGateway(route), &textReq); err != nil {
		return providercontract.AIGatewayModelRoute{}, responseModel, ai.TextRequest{}, wrapErr(ErrUnsupportedParameter, err)
	}
	if input.Principal.Key != nil {
		estimate, err := s.ai.EstimateTextRouteCost(ctx, input.Principal.UserID, aiRouteFromGateway(route), textReq)
		if err != nil {
			return providercontract.AIGatewayModelRoute{}, responseModel, ai.TextRequest{}, err
		}
		if err := s.policy.CanCallChat(ctx, input.Principal, input.ProjectID, estimate.Cost, routeAllowedCatalogEntryID(route)); err != nil {
			return providercontract.AIGatewayModelRoute{}, responseModel, ai.TextRequest{}, err
		}
	}
	return route, responseModel, textReq, nil
}

func routeAllowedCatalogEntryID(route providercontract.AIGatewayModelRoute) uint {
	return route.CatalogEntryID
}

func aiRouteFromGateway(route providercontract.AIGatewayModelRoute) ai.ModelRoute {
	return ai.ModelRoute{
		ModelID:         route.ModelID,
		ModelConfigID:   route.ModelConfigID,
		CatalogEntryID:  route.CatalogEntryID,
		CredentialID:    route.CredentialID,
		SourceType:      route.SourceType,
		RouteGroup:      route.RouteGroup,
		ProviderModelID: route.ProviderModelID,
		SelectionReason: route.SelectionReason,
		EstimatedCost:   route.EstimatedCost,
	}
}

func (s *Service) resolveRuntimeTextRoute(ctx context.Context, catalogEntryID uint) (providercontract.AIGatewayModelRoute, error) {
	return s.resolveRuntimeRoute(ctx, catalogEntryID, ai.CapabilityText, ai.CapabilityReasoning)
}

func (s *Service) resolveRuntimeTextRouteForRequest(ctx context.Context, requestedModel string, catalogEntryID uint) (providercontract.AIGatewayModelRoute, error) {
	requested := strings.TrimSpace(requestedModel)
	if requested != "" && requested != DefaultChatModel {
		return s.resolveRuntimeModelIDRoute(ctx, requested, ai.CapabilityText, ai.CapabilityReasoning)
	}
	return s.resolveRuntimeTextRoute(ctx, catalogEntryID)
}

func (s *Service) resolveRuntimeRouteForProxyRequest(ctx context.Context, requestedModel string, catalogEntryID uint, capability string) (providercontract.AIGatewayModelRoute, error) {
	requested := strings.TrimSpace(requestedModel)
	if requested != "" {
		return s.resolveRuntimeModelIDRoute(ctx, requested, capability)
	}
	return s.resolveRuntimeRoute(ctx, catalogEntryID, capability)
}

func (s *Service) resolveRuntimeModelIDRoute(ctx context.Context, modelID string, capabilities ...string) (providercontract.AIGatewayModelRoute, error) {
	if s.routing == nil {
		return providercontract.AIGatewayModelRoute{}, ErrModelUnavailable
	}
	var lastErr error
	for _, capability := range compactOpenAIProxyCapabilities(capabilities) {
		route, err := s.routing.ResolveGatewayModelRoute(ctx, providercontract.AIGatewayRouteRequest{
			ModelID:    modelID,
			Capability: capability,
		})
		if err == nil {
			return route, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return providercontract.AIGatewayModelRoute{}, lastErr
	}
	return providercontract.AIGatewayModelRoute{}, ErrModelUnavailable
}

func (s *Service) resolveRuntimeRoute(ctx context.Context, catalogEntryID uint, capabilities ...string) (providercontract.AIGatewayModelRoute, error) {
	if s.routing == nil {
		return providercontract.AIGatewayModelRoute{}, ErrModelUnavailable
	}
	var lastErr error
	for _, capability := range compactOpenAIProxyCapabilities(capabilities) {
		route, err := s.routing.ResolveGatewayModelRoute(ctx, providercontract.AIGatewayRouteRequest{
			CatalogEntryID: catalogEntryID,
			Capability:     capability,
		})
		if err == nil {
			return route, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return providercontract.AIGatewayModelRoute{}, lastErr
	}
	return providercontract.AIGatewayModelRoute{}, ErrModelUnavailable
}

func (s *Service) resolveOpenAIProxyModel(ctx context.Context, modelID string, capabilities []string) (uint, string, string, error) {
	if s.catalog == nil {
		return 0, strings.TrimSpace(modelID), "", ErrModelUnavailable
	}
	var lastErr error
	for _, capability := range capabilities {
		catalogEntryID, responseModel, err := s.resolveModelForCapability(ctx, modelID, capability)
		if err == nil {
			return catalogEntryID, responseModel, capability, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return 0, strings.TrimSpace(modelID), "", lastErr
	}
	return 0, strings.TrimSpace(modelID), "", ErrModelUnavailable
}

func (s *Service) resolveModelForCapability(ctx context.Context, modelID string, capability string) (uint, string, error) {
	descriptors, err := s.catalog.ListModels(ctx, providercontract.AIModelListFilter{Capability: capability})
	if err != nil {
		return 0, strings.TrimSpace(modelID), err
	}
	models := make([]ChatModel, 0, len(descriptors))
	for _, descriptor := range descriptors {
		models = append(models, chatModelFromDescriptor(descriptor))
	}
	var defaultID uint
	var defaultErr error
	if strings.TrimSpace(modelID) == "" {
		if s.routing == nil {
			defaultErr = ErrModelUnavailable
		} else {
			route, err := s.routing.ResolveGatewayModelRoute(ctx, providercontract.AIGatewayRouteRequest{Capability: capability})
			if err != nil {
				defaultErr = err
			} else {
				defaultID = route.ModelConfigID
			}
		}
	}
	id, responseModel, err := ResolveTextModel(models, modelID, defaultID, defaultErr)
	if err != nil {
		if route, routeErr := s.resolveModelIDRouteForCapability(ctx, modelID, capability); routeErr == nil {
			return route.ModelConfigID, strings.TrimSpace(modelID), nil
		}
		return id, responseModel, ModelNotFoundError{Message: err.Error()}
	}
	return id, responseModel, nil
}

func (s *Service) resolveModelIDRouteForCapability(ctx context.Context, modelID string, capability string) (providercontract.AIGatewayModelRoute, error) {
	if s.routing == nil || strings.TrimSpace(modelID) == "" || strings.TrimSpace(modelID) == DefaultChatModel {
		return providercontract.AIGatewayModelRoute{}, ErrModelUnavailable
	}
	return s.routing.ResolveGatewayModelRoute(ctx, providercontract.AIGatewayRouteRequest{
		ModelID:    strings.TrimSpace(modelID),
		Capability: capability,
	})
}

func compactOpenAIProxyCapabilities(capabilities []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(capabilities))
	for _, capability := range capabilities {
		capability = strings.TrimSpace(capability)
		if capability == "" || seen[capability] {
			continue
		}
		seen[capability] = true
		out = append(out, capability)
	}
	if len(out) == 0 {
		return []string{ai.CapabilityText, ai.CapabilityReasoning}
	}
	return out
}

func (s *Service) ResolveTextModel(ctx context.Context, modelID string) (uint, string, error) {
	if s.catalog == nil {
		return 0, strings.TrimSpace(modelID), ErrModelUnavailable
	}
	descriptors, err := s.catalog.ListModels(ctx, providercontract.AIModelListFilter{
		Capabilities: []string{ai.CapabilityText, ai.CapabilityReasoning},
	})
	if err != nil {
		return 0, strings.TrimSpace(modelID), err
	}
	models := make([]ChatModel, 0, len(descriptors))
	for _, descriptor := range descriptors {
		models = append(models, chatModelFromDescriptor(descriptor))
	}
	var defaultID uint
	var defaultErr error
	if s.routing == nil {
		defaultErr = ErrModelUnavailable
	} else {
		route, err := s.routing.ResolveGatewayTextModelRoute(ctx, "")
		if err != nil {
			defaultErr = err
		} else {
			defaultID = route.ModelConfigID
		}
	}
	id, responseModel, err := ResolveTextModel(models, modelID, defaultID, defaultErr)
	if err != nil {
		return id, responseModel, ModelNotFoundError{Message: err.Error()}
	}
	return id, responseModel, nil
}

func chatModelFromDescriptor(descriptor providercontract.AIModelDescriptor) ChatModel {
	return ChatModel{
		ID:              descriptor.ModelConfigID,
		CatalogEntryID:  descriptor.CatalogEntryID,
		ModelID:         descriptor.ModelID,
		ModelDefID:      descriptor.ModelDefID,
		ModelIDOverride: descriptor.ModelIDOverride,
		LogicalModelID:  descriptor.LogicalModelID,
	}
}

func principalCanListChatModel(principal Principal, model ChatModel) bool {
	if principal.Key == nil {
		return true
	}
	return KeyAllowsCatalogEntry(principal.Key, model.CatalogEntryID)
}

func sameOrg(a, b *uint) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func GenerateAPIKey() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "mgw_" + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return "mgw_" + base64.RawURLEncoding.EncodeToString(buf)
}

func HashAPIKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func KeyPrefix(raw string) string {
	if len(raw) <= 12 {
		return raw
	}
	return raw[:12]
}

func wrapErr(base error, err error) error {
	if err == nil {
		return base
	}
	return fmt.Errorf("%w: %w", base, err)
}

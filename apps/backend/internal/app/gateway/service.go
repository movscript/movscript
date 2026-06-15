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
	ErrModelNotAllowed           = errors.New("gateway key is not allowed to use this model")
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
	OwnerUserID     uint
	OrgID           *uint
	Name            string
	ProjectID       *uint
	AllowedModelIDs []uint
	AllowedScopes   []string
	Runtime         APIKeyCreateRuntimeInput
}

type UpdateAPIKeyInput struct {
	ID              uint
	OwnerUserID     uint
	OrgID           *uint
	Name            *string
	ProjectID       *uint
	ProjectIDSet    bool
	AllowedModelIDs []uint
	AllowedScopes   []string
	IsEnabled       *bool
	Runtime         APIKeyUpdateRuntimeInput
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
		Name:            input.Name,
		KeyPrefix:       KeyPrefix(rawKey),
		KeyHash:         HashAPIKey(rawKey),
		OwnerUserID:     input.OwnerUserID,
		OrgID:           input.OrgID,
		ProjectID:       input.ProjectID,
		AllowedModelIDs: input.AllowedModelIDs,
		AllowedScopes:   input.AllowedScopes,
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
		Name:            input.Name,
		ProjectID:       input.ProjectID,
		ProjectIDSet:    input.ProjectIDSet,
		AllowedModelIDs: input.AllowedModelIDs,
		AllowedScopes:   input.AllowedScopes,
		IsEnabled:       input.IsEnabled,
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
	descriptors, err := s.catalog.ListModels(ctx, providercontract.AIModelListFilter{
		Capabilities: []string{ai.CapabilityText, ai.CapabilityReasoning},
	})
	if err != nil {
		return nil, err
	}
	models := make([]ChatModel, 0, len(descriptors))
	for _, descriptor := range descriptors {
		models = append(models, chatModelFromDescriptor(descriptor))
	}
	return models, nil
}

func (s *Service) CallChat(ctx context.Context, input ChatInput) (ChatResult, error) {
	modelConfigID, responseModel, textReq, err := s.prepareChat(ctx, input)
	if err != nil {
		return ChatResult{}, err
	}
	ctx = ai.WithProviderNewAPIGroup(ctx, s.newAPIGroupForPrincipal(ctx, input.Principal))
	resp, err := s.ai.CallTextWithUsage(ctx, input.Principal.UserID, modelConfigID, textReq, UsageContext(input.Principal.Key, input.ProjectID))
	if err != nil {
		return ChatResult{}, err
	}
	return ChatResult{ModelConfigID: modelConfigID, ResponseModel: responseModel, Response: resp}, nil
}

func (s *Service) CallResponses(ctx context.Context, input ResponsesInput) (ChatResult, error) {
	modelConfigID, responseModel, textReq, err := s.prepareChat(ctx, ChatInput{
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
	ctx = ai.WithProviderNewAPIGroup(ctx, s.newAPIGroupForPrincipal(ctx, input.Principal))
	resp, err := s.ai.CallResponsesWithUsage(ctx, input.Principal.UserID, modelConfigID, responsesReq, UsageContext(input.Principal.Key, input.ProjectID))
	if err != nil {
		return ChatResult{}, err
	}
	return ChatResult{ModelConfigID: modelConfigID, ResponseModel: responseModel, Response: resp}, nil
}

func (s *Service) CallChatStream(ctx context.Context, input ChatInput) (ChatStreamResult, error) {
	modelConfigID, responseModel, textReq, err := s.prepareChat(ctx, input)
	if err != nil {
		return ChatStreamResult{}, err
	}
	ctx = ai.WithProviderNewAPIGroup(ctx, s.newAPIGroupForPrincipal(ctx, input.Principal))
	events, err := s.ai.CallTextStreamWithUsage(ctx, input.Principal.UserID, modelConfigID, textReq, UsageContext(input.Principal.Key, input.ProjectID))
	if err != nil {
		return ChatStreamResult{}, err
	}
	return ChatStreamResult{ModelConfigID: modelConfigID, ResponseModel: responseModel, Events: events}, nil
}

func (s *Service) PrepareOpenAIProxy(ctx context.Context, input OpenAIProxyInput) (OpenAIProxyRoute, error) {
	if s.ai == nil {
		return OpenAIProxyRoute{}, ErrModelUnavailable
	}
	capabilities := compactOpenAIProxyCapabilities(input.Capabilities)
	modelConfigID, responseModel, capability, err := s.resolveOpenAIProxyModel(ctx, input.Model, capabilities)
	if err != nil {
		return OpenAIProxyRoute{}, err
	}
	route, err := s.resolveRuntimeRoute(ctx, modelConfigID, capability)
	if err != nil {
		return OpenAIProxyRoute{}, err
	}
	if input.Principal.Key != nil {
		if err := s.policy.CanCallChat(ctx, input.Principal, modelConfigID, input.ProjectID, 0); err != nil {
			return OpenAIProxyRoute{}, err
		}
	}
	ctx = ai.WithProviderNewAPIGroup(ctx, s.newAPIGroupForPrincipal(ctx, input.Principal))
	target, err := s.ai.OpenAIProxyTargetForCapability(ctx, input.Principal.UserID, route.ModelConfigID, capability)
	if err != nil {
		return OpenAIProxyRoute{}, fmt.Errorf("%w: %v", ErrModelUnavailable, err)
	}
	return OpenAIProxyRoute{ModelConfigID: route.ModelConfigID, ResponseModel: responseModel, Target: target}, nil
}

func (s *Service) prepareChat(ctx context.Context, input ChatInput) (uint, string, ai.TextRequest, error) {
	modelConfigID, responseModel, err := s.ResolveTextModel(ctx, input.Model)
	if err != nil {
		return 0, responseModel, ai.TextRequest{}, err
	}
	route, err := s.resolveRuntimeTextRoute(ctx, modelConfigID)
	if err != nil {
		return 0, responseModel, ai.TextRequest{}, err
	}

	textReq := input.Text
	if _, err := s.ai.PreflightText(route.ModelConfigID, &textReq); err != nil {
		return 0, responseModel, ai.TextRequest{}, wrapErr(ErrUnsupportedParameter, err)
	}
	if input.Principal.Key != nil {
		estimate, err := s.ai.EstimateTextCost(route.ModelConfigID, textReq)
		if err != nil {
			return 0, responseModel, ai.TextRequest{}, err
		}
		if err := s.policy.CanCallChat(ctx, input.Principal, modelConfigID, input.ProjectID, estimate.Cost); err != nil {
			return 0, responseModel, ai.TextRequest{}, err
		}
	}
	return route.ModelConfigID, responseModel, textReq, nil
}

func (s *Service) resolveRuntimeTextRoute(ctx context.Context, modelConfigID uint) (providercontract.AIGatewayModelRoute, error) {
	return s.resolveRuntimeRoute(ctx, modelConfigID, ai.CapabilityText, ai.CapabilityReasoning)
}

func (s *Service) resolveRuntimeRoute(ctx context.Context, modelConfigID uint, capabilities ...string) (providercontract.AIGatewayModelRoute, error) {
	if s.routing == nil {
		return providercontract.AIGatewayModelRoute{}, ErrModelUnavailable
	}
	var lastErr error
	for _, capability := range compactOpenAIProxyCapabilities(capabilities) {
		route, err := s.routing.ResolveGatewayModelRoute(ctx, providercontract.AIGatewayRouteRequest{
			ModelConfigID: modelConfigID,
			Capability:    capability,
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
		modelConfigID, responseModel, err := s.resolveModelForCapability(ctx, modelID, capability)
		if err == nil {
			return modelConfigID, responseModel, capability, nil
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
		return id, responseModel, ModelNotFoundError{Message: err.Error()}
	}
	return id, responseModel, nil
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
		ModelID:         descriptor.ModelID,
		ModelDefID:      descriptor.ModelDefID,
		ModelIDOverride: descriptor.ModelIDOverride,
		LogicalModelID:  descriptor.LogicalModelID,
	}
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

package assembly

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/infra/config"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type AgentRuntimeProvider struct {
	adapter string
	baseURL string
	token   string
	client  *http.Client
}

func BuildAgentRuntimeProvider(cfg *config.Config) (providercontract.AgentRuntimeProvider, providercontract.HealthChecker, bool) {
	adapter := providercontract.AdapterDesktopManagedAgent
	if cfg != nil && strings.TrimSpace(cfg.AgentRuntimeProvider) != "" {
		adapter = strings.TrimSpace(cfg.AgentRuntimeProvider)
	}
	switch adapter {
	case providercontract.AdapterDesktopManagedAgent,
		providercontract.AdapterRemoteAgentRuntime,
		providercontract.AdapterMova,
		providercontract.AdapterAppServer:
		provider := AgentRuntimeProvider{adapter: adapter, client: &http.Client{Timeout: 5 * time.Second}}
		if cfg != nil {
			provider.baseURL = strings.TrimSpace(cfg.AgentRuntimeBaseURL)
			provider.token = strings.TrimSpace(cfg.AgentRuntimeToken)
		}
		return provider, provider, true
	default:
		return nil, nil, false
	}
}

func (p AgentRuntimeProvider) Health(ctx context.Context) providercontract.ProviderHealth {
	health := providercontract.ProviderHealth{
		Type:         providercontract.TypeAgentRuntime,
		Adapter:      p.adapter,
		Assembly:     providercontract.AssemblyStartup,
		Status:       providercontract.HealthStatusOK,
		Capabilities: agentRuntimeCapabilities(p.adapter),
	}
	switch p.adapter {
	case providercontract.AdapterDesktopManagedAgent:
		health.Message = "agent runtime is managed by the desktop host"
	case providercontract.AdapterRemoteAgentRuntime:
		if strings.TrimSpace(p.baseURL) == "" {
			health.Status = providercontract.HealthStatusMissingConfig
			health.Message = "remote agent runtime base URL is required"
			return health
		}
		if err := p.probeRemoteRuntime(ctx); err != nil {
			health.Status = providercontract.HealthStatusError
			health.Message = err.Error()
			return health
		}
		capabilities, err := p.probeRemoteRuntimeCapabilities(ctx)
		if err == nil {
			health.Capabilities = mergeStringSets(health.Capabilities, capabilities.Capabilities)
		}
		health.Message = "remote agent runtime health probe succeeded"
	case providercontract.AdapterMova:
		health.Message = "Mova app-server runtime is managed by the desktop host"
	case providercontract.AdapterAppServer:
		health.Message = "app-server runtime is managed by the desktop host"
	default:
		health.Status = providercontract.HealthStatusMissingConfig
		health.Message = "agent runtime provider is not configured"
	}
	return health
}

func (p AgentRuntimeProvider) probeRemoteRuntime(ctx context.Context) error {
	endpoint := strings.TrimRight(strings.TrimSpace(p.baseURL), "/") + providercontract.AgentRuntimeEndpointHealth
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("remote agent runtime health request is invalid: %w", err)
	}
	if p.token != "" {
		req.Header.Set("Authorization", "Bearer "+p.token)
	}
	client := p.client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("remote agent runtime health probe failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("remote agent runtime health probe returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func (p AgentRuntimeProvider) probeRemoteRuntimeCapabilities(ctx context.Context) (providercontract.AgentRuntimeCapabilities, error) {
	endpoint := strings.TrimRight(strings.TrimSpace(p.baseURL), "/") + providercontract.AgentRuntimeEndpointCapabilities
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return providercontract.AgentRuntimeCapabilities{}, fmt.Errorf("remote agent runtime capability request is invalid: %w", err)
	}
	if p.token != "" {
		req.Header.Set("Authorization", "Bearer "+p.token)
	}
	client := p.client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return providercontract.AgentRuntimeCapabilities{}, fmt.Errorf("remote agent runtime capability probe failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusMethodNotAllowed {
		return providercontract.AgentRuntimeCapabilities{}, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return providercontract.AgentRuntimeCapabilities{}, fmt.Errorf("remote agent runtime capability probe returned HTTP %d", resp.StatusCode)
	}
	var capabilities providercontract.AgentRuntimeCapabilities
	if err := json.NewDecoder(resp.Body).Decode(&capabilities); err != nil {
		return providercontract.AgentRuntimeCapabilities{}, fmt.Errorf("remote agent runtime capability response is invalid: %w", err)
	}
	return capabilities, nil
}

func (p AgentRuntimeProvider) EnsureRuntime(_ context.Context, profile providercontract.AgentRuntimeProfile) (providercontract.AgentRuntimeSession, error) {
	id := strings.TrimSpace(profile.ID)
	if id == "" {
		id = p.adapter
	}
	return providercontract.AgentRuntimeSession{
		ID:    id,
		State: agentRuntimeState(p.adapter),
	}, nil
}

func (p AgentRuntimeProvider) StartSession(context.Context, providercontract.AgentSessionRequest) (providercontract.AgentSessionRef, error) {
	return providercontract.AgentSessionRef{}, p.unsupportedDirectSessionError()
}

func (p AgentRuntimeProvider) SendMessage(context.Context, providercontract.AgentSessionRef, providercontract.AgentMessage) (<-chan providercontract.AgentEvent, error) {
	return nil, p.unsupportedDirectSessionError()
}

func (p AgentRuntimeProvider) ListTools(context.Context, providercontract.AgentSessionRef) ([]providercontract.AgentToolDescriptor, error) {
	return nil, p.unsupportedDirectSessionError()
}

func (p AgentRuntimeProvider) StopSession(context.Context, providercontract.AgentSessionRef) error {
	return p.unsupportedDirectSessionError()
}

func (p AgentRuntimeProvider) unsupportedDirectSessionError() error {
	return fmt.Errorf("agent runtime %q is assembled as a control-plane provider; session lifecycle is owned by the configured runtime host", p.adapter)
}

func agentRuntimeState(adapter string) string {
	switch adapter {
	case providercontract.AdapterDesktopManagedAgent,
		providercontract.AdapterMova,
		providercontract.AdapterAppServer:
		return "desktop_managed"
	case providercontract.AdapterRemoteAgentRuntime:
		return "remote_configured"
	default:
		return "not_configured"
	}
}

func agentRuntimeCapabilities(adapter string) []string {
	switch adapter {
	case providercontract.AdapterDesktopManagedAgent:
		return []string{providercontract.AgentRuntimeCapabilityDesktop, "agent_session.local", "agent_tool.local", providercontract.AgentRuntimeCapabilityHealthProbe}
	case providercontract.AdapterRemoteAgentRuntime:
		return []string{providercontract.AgentRuntimeCapabilityRemote, providercontract.AgentRuntimeCapabilityHealthProbe}
	case providercontract.AdapterMova,
		providercontract.AdapterAppServer:
		return []string{"agent_runtime.ensure", "agent_session.start", "agent_session.message", "agent_tool.list", "agent_session.stop", providercontract.AgentRuntimeCapabilityHealthProbe}
	default:
		return nil
	}
}

func mergeStringSets(base []string, extra []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(base)+len(extra))
	for _, item := range append(append([]string{}, base...), extra...) {
		item = strings.TrimSpace(item)
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		out = append(out, item)
	}
	return out
}

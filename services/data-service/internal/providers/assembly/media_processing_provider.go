package assembly

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/infra/config"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

type ControlPlaneMediaProcessingProvider struct {
	adapter string
	baseURL string
	token   string
	client  *http.Client
}

func BuildMediaProcessingProvider(cfg *config.Config) (providercontract.MediaProcessingProvider, providercontract.HealthChecker, bool) {
	adapter := providercontract.AdapterDesktopManagedMedia
	if cfg != nil && strings.TrimSpace(cfg.MediaProcessingProvider) != "" {
		adapter = strings.TrimSpace(cfg.MediaProcessingProvider)
	}
	switch adapter {
	case providercontract.AdapterDesktopManagedMedia,
		providercontract.AdapterExternalMediaWorker:
		provider := ControlPlaneMediaProcessingProvider{adapter: adapter, client: &http.Client{Timeout: 5 * time.Second}}
		if cfg != nil {
			provider.baseURL = strings.TrimSpace(cfg.MediaWorkerBaseURL)
			provider.token = strings.TrimSpace(cfg.MediaWorkerToken)
		}
		return provider, provider, true
	default:
		return nil, nil, false
	}
}

func (p ControlPlaneMediaProcessingProvider) Health(ctx context.Context) providercontract.ProviderHealth {
	health := providercontract.ProviderHealth{
		Type:         providercontract.TypeMediaProcessing,
		Adapter:      p.adapter,
		Assembly:     providercontract.AssemblyStartup,
		Status:       providercontract.HealthStatusOK,
		Capabilities: mediaProcessingCapabilities(p.adapter),
	}
	switch p.adapter {
	case providercontract.AdapterDesktopManagedMedia:
		health.Message = "media processing is managed by the desktop host"
	case providercontract.AdapterExternalMediaWorker:
		if strings.TrimSpace(p.baseURL) == "" {
			health.Status = providercontract.HealthStatusMissingConfig
			health.Message = "external media worker base URL is required"
			return health
		}
		if err := p.probeExternalWorker(ctx); err != nil {
			health.Status = providercontract.HealthStatusError
			health.Message = err.Error()
			return health
		}
		health.Message = "external media worker health probe succeeded"
	default:
		health.Status = providercontract.HealthStatusMissingConfig
		health.Message = "media processing provider is not configured"
	}
	return health
}

func (p ControlPlaneMediaProcessingProvider) probeExternalWorker(ctx context.Context) error {
	endpoint := strings.TrimRight(strings.TrimSpace(p.baseURL), "/") + "/health"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("external media worker health request is invalid: %w", err)
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
		return fmt.Errorf("external media worker health probe failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("external media worker health probe returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func (p ControlPlaneMediaProcessingProvider) Probe(context.Context, providercontract.MediaProbeRequest) (providercontract.MediaProbeResult, error) {
	return providercontract.MediaProbeResult{}, p.unsupportedDirectProcessingError()
}

func (p ControlPlaneMediaProcessingProvider) Transcode(context.Context, providercontract.MediaTranscodeRequest) (providercontract.MediaTranscodeResult, error) {
	return providercontract.MediaTranscodeResult{}, p.unsupportedDirectProcessingError()
}

func (p ControlPlaneMediaProcessingProvider) ExtractFrame(context.Context, providercontract.MediaFrameRequest) (providercontract.MediaFrameResult, error) {
	return providercontract.MediaFrameResult{}, p.unsupportedDirectProcessingError()
}

func (p ControlPlaneMediaProcessingProvider) unsupportedDirectProcessingError() error {
	return fmt.Errorf("media processing %q is assembled as a control-plane provider; media execution is owned by the configured runtime host", p.adapter)
}

func mediaProcessingCapabilities(adapter string) []string {
	switch adapter {
	case providercontract.AdapterDesktopManagedMedia:
		return []string{"media.desktop_runtime", "media.local_export", "media.local_clip", "health.probe"}
	case providercontract.AdapterExternalMediaWorker:
		return []string{"media.worker.submit", "media.worker.status", "media.worker.result", "health.probe"}
	default:
		return nil
	}
}

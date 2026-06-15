package ai

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/movscript/movscript/internal/domain/media"
	"github.com/movscript/movscript/internal/infra/newapi"
	"gorm.io/gorm"
)

// NewAPIForwardAdapter forwards OpenAI-compatible calls to an external new-api
// relay using the relay token provisioned for the MovScript user in context.
type NewAPIForwardAdapter struct {
	BaseURL  string
	cfg      newapi.Config
	identity *newapi.IdentityService
}

func NewNewAPIForwardAdapter(db *gorm.DB, encryptionKey []byte, cfg newapi.Config, httpClient *http.Client) *NewAPIForwardAdapter {
	return &NewAPIForwardAdapter{
		BaseURL:  cfg.RelayBaseURL(),
		cfg:      cfg,
		identity: newapi.NewIdentityService(db, encryptionKey, cfg, newapi.NewClient(cfg, httpClient)),
	}
}

func (a *NewAPIForwardAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	adapter, err := a.adapterForContext(ctx)
	if err != nil {
		return TextResponse{}, err
	}
	return adapter.TextGenerate(ctx, req)
}

func (a *NewAPIForwardAdapter) ResponsesGenerate(ctx context.Context, req ResponsesRequest) (TextResponse, error) {
	adapter, err := a.adapterForContext(ctx)
	if err != nil {
		return TextResponse{}, err
	}
	return adapter.ResponsesGenerate(ctx, req)
}

func (a *NewAPIForwardAdapter) TextStream(ctx context.Context, req TextRequest) (<-chan TextStreamEvent, error) {
	adapter, err := a.adapterForContext(ctx)
	if err != nil {
		return nil, err
	}
	return adapter.TextStream(ctx, req)
}

func (a *NewAPIForwardAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	adapter, err := a.adapterForContext(ctx)
	if err != nil {
		return ImageResponse{}, err
	}
	return adapter.ImageGenerate(ctx, req)
}

func (a *NewAPIForwardAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	adapter, err := a.adapterForContext(ctx)
	if err != nil {
		return VideoResponse{}, err
	}
	return adapter.VideoGenerate(ctx, req)
}

func (a *NewAPIForwardAdapter) VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	adapter, err := a.adapterForContext(ctx)
	if err != nil {
		return VideoResponse{}, err
	}
	return adapter.VideoStart(ctx, req)
}

func (a *NewAPIForwardAdapter) VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	adapter, err := a.adapterForContext(ctx)
	if err != nil {
		return VideoResponse{}, err
	}
	return adapter.VideoPoll(ctx, req)
}

func (a *NewAPIForwardAdapter) VideoCancel(ctx context.Context, req VideoCancelRequest) (VideoResponse, error) {
	adapter, err := a.adapterForContext(ctx)
	if err != nil {
		return VideoResponse{}, err
	}
	return adapter.VideoCancel(ctx, req)
}

func (a *NewAPIForwardAdapter) Synthesize(ctx context.Context, req media.TTSRequest) (media.TTSResponse, error) {
	adapter, err := a.adapterForContext(ctx)
	if err != nil {
		return media.TTSResponse{}, err
	}
	return adapter.Synthesize(ctx, req)
}

func (a *NewAPIForwardAdapter) Transcribe(ctx context.Context, req media.TranscribeRequest) (media.SubtitleResponse, error) {
	adapter, err := a.adapterForContext(ctx)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	return adapter.Transcribe(ctx, req)
}

func (a *NewAPIForwardAdapter) Align(ctx context.Context, req media.AlignRequest) (media.SubtitleResponse, error) {
	adapter, err := a.adapterForContext(ctx)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	return adapter.Align(ctx, req)
}

func (a *NewAPIForwardAdapter) Ping(ctx context.Context) error {
	_, err := a.adapterForContext(ctx)
	return err
}

func (a *NewAPIForwardAdapter) FetchModels(ctx context.Context) ([]string, error) {
	adapter, err := a.adapterForContextOrFallback(ctx)
	if err != nil {
		return nil, err
	}
	return adapter.FetchModels(ctx)
}

func (a *NewAPIForwardAdapter) ProxyTarget(ctx context.Context) (string, string, error) {
	adapter, err := a.adapterForContext(ctx)
	if err != nil {
		return "", "", err
	}
	return adapter.BaseURL, adapter.APIKey, nil
}

func (a *NewAPIForwardAdapter) adapterForContext(ctx context.Context) (*OpenAIAdapter, error) {
	userID := providerUserIDFromContext(ctx)
	if userID == 0 {
		return nil, fmt.Errorf("movscript user id is required for new-api forwarding")
	}
	token, err := a.identity.RelayTokenForUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	return NewOpenAIAdapter(a.BaseURL, token), nil
}

func (a *NewAPIForwardAdapter) adapterForContextOrFallback(ctx context.Context) (*OpenAIAdapter, error) {
	if providerUserIDFromContext(ctx) != 0 {
		return a.adapterForContext(ctx)
	}
	token := normalizeNewAPIRelayToken(a.cfg.RelayTokenFallback)
	if token == "" {
		return nil, fmt.Errorf("movscript user id or MOVSCRIPT_NEW_API_RELAY_TOKEN is required for new-api forwarding")
	}
	return NewOpenAIAdapter(a.BaseURL, token), nil
}

func normalizeNewAPIRelayToken(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}
	if strings.HasPrefix(token, "sk-") {
		return token
	}
	return "sk-" + token
}

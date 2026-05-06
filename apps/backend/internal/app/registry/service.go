package registry

import (
	"context"
	"io"
	"net/http"
	"os"
)

const defaultURL = "https://registry.movscript.com"

type Service struct{}

func NewService() *Service {
	return &Service{}
}

type Response struct {
	StatusCode int
	Body       []byte
}

func (s *Service) ListPlugins(ctx context.Context) (Response, error) {
	return s.fetch(ctx, "/plugins/index.json")
}

func (s *Service) GetPlugin(ctx context.Context, id string) (Response, error) {
	return s.fetch(ctx, "/plugins/"+id+"/manifest.json")
}

func (s *Service) ListWorkflows(ctx context.Context) (Response, error) {
	return s.fetch(ctx, "/workflows/index.json")
}

func (s *Service) GetWorkflow(ctx context.Context, id string) (Response, error) {
	return s.fetch(ctx, "/workflows/"+id+"/manifest.json")
}

func (s *Service) fetch(ctx context.Context, path string) (Response, error) {
	base := os.Getenv("PLUGIN_REGISTRY_URL")
	if base == "" {
		base = defaultURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+path, nil)
	if err != nil {
		return Response{}, err
	}
	resp, err := http.DefaultClient.Do(req) //nolint:gosec
	if err != nil {
		return Response{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return Response{}, err
	}
	return Response{StatusCode: resp.StatusCode, Body: body}, nil
}

package ai

import (
	"net/url"
	"strings"

	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
)

const (
	RouteEndpointModeInherit     = "inherit"
	RouteEndpointModeReplacePath = "replace_path"
	RouteEndpointModeAbsolute    = "absolute"
)

type routeEndpointConfig struct {
	BaseURL    string
	PathPrefix string
	Mode       string
}

func routeEndpointConfigFromRoute(route ModelRoute) routeEndpointConfig {
	return routeEndpointConfig{
		BaseURL:    route.EndpointBaseURL,
		PathPrefix: route.EndpointPathPrefix,
		Mode:       route.EndpointMode,
	}
}

func routeEndpointConfigFromBinding(binding persistencemodel.AIModelRouteBinding) routeEndpointConfig {
	return routeEndpointConfig{
		BaseURL:    binding.EndpointBaseURL,
		PathPrefix: binding.EndpointPathPrefix,
		Mode:       binding.EndpointMode,
	}
}

func routeEndpointHasConfig(config routeEndpointConfig) bool {
	return strings.TrimSpace(config.BaseURL) != "" ||
		strings.TrimSpace(config.PathPrefix) != ""
}

func effectiveRouteBaseURL(providerBaseURL string, config routeEndpointConfig) string {
	providerBaseURL = strings.TrimRight(strings.TrimSpace(providerBaseURL), "/")
	routeBaseURL := strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	pathPrefix := normalizeRouteEndpointPathPrefix(config.PathPrefix)
	mode := normalizeRouteEndpointMode(config.Mode)

	switch mode {
	case RouteEndpointModeReplacePath:
		baseURL := firstNonEmptyAI(routeBaseURL, providerBaseURL)
		if pathPrefix == "" {
			return baseURL
		}
		return replaceURLPath(baseURL, pathPrefix)
	case RouteEndpointModeAbsolute:
		baseURL := firstNonEmptyAI(routeBaseURL, providerBaseURL)
		if pathPrefix == "" {
			return baseURL
		}
		return appendURLPath(baseURL, pathPrefix)
	default:
		baseURL := firstNonEmptyAI(routeBaseURL, providerBaseURL)
		if pathPrefix == "" {
			return baseURL
		}
		return appendURLPath(baseURL, pathPrefix)
	}
}

func normalizeRouteEndpointMode(mode string) string {
	switch strings.TrimSpace(mode) {
	case RouteEndpointModeReplacePath:
		return RouteEndpointModeReplacePath
	case RouteEndpointModeAbsolute:
		return RouteEndpointModeAbsolute
	default:
		return RouteEndpointModeInherit
	}
}

func normalizeRouteEndpointPathPrefix(pathPrefix string) string {
	pathPrefix = strings.TrimSpace(pathPrefix)
	if pathPrefix == "" {
		return ""
	}
	if !strings.HasPrefix(pathPrefix, "/") {
		pathPrefix = "/" + pathPrefix
	}
	return strings.TrimRight(pathPrefix, "/")
}

func replaceURLPath(baseURL, pathPrefix string) string {
	parsed, err := url.Parse(strings.TrimRight(strings.TrimSpace(baseURL), "/"))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return strings.TrimRight(strings.TrimSpace(baseURL), "/") + pathPrefix
	}
	parsed.Path = pathPrefix
	parsed.RawPath = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/")
}

func appendURLPath(baseURL, pathPrefix string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return pathPrefix
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return baseURL + pathPrefix
	}
	basePath := strings.TrimRight(parsed.Path, "/")
	prefix := normalizeRouteEndpointPathPrefix(pathPrefix)
	if prefix == "" {
		return baseURL
	}
	if basePath == prefix || strings.HasSuffix(basePath, prefix) {
		return baseURL
	}
	parsed.Path = basePath + prefix
	parsed.RawPath = ""
	return strings.TrimRight(parsed.String(), "/")
}

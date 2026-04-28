package handler

import (
	"io"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

const defaultRegistryURL = "https://registry.movscript.com"

// RegistryHandler proxies requests to the plugin registry to avoid CORS issues.
type RegistryHandler struct{}

func NewRegistryHandler() *RegistryHandler {
	return &RegistryHandler{}
}

func (h *RegistryHandler) ListPlugins(c *gin.Context) {
	h.proxy(c, "/plugins/index.json")
}

func (h *RegistryHandler) GetPlugin(c *gin.Context) {
	id := c.Param("id")
	h.proxy(c, "/plugins/"+id+"/manifest.json")
}

func (h *RegistryHandler) proxy(c *gin.Context, path string) {
	base := os.Getenv("PLUGIN_REGISTRY_URL")
	if base == "" {
		base = defaultRegistryURL
	}
	url := base + path
	resp, err := http.Get(url) //nolint:gosec
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(resp.StatusCode, "application/json", body)
}

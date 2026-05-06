package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	registryapp "github.com/movscript/movscript/internal/app/registry"
)

// RegistryHandler proxies requests to the plugin registry to avoid CORS issues.
type RegistryHandler struct {
	service *registryapp.Service
}

func NewRegistryHandler() *RegistryHandler {
	return &RegistryHandler{service: registryapp.NewService()}
}

func (h *RegistryHandler) ListPlugins(c *gin.Context) {
	resp, err := h.service.ListPlugins(c.Request.Context())
	h.write(c, resp, err)
}

func (h *RegistryHandler) GetPlugin(c *gin.Context) {
	resp, err := h.service.GetPlugin(c.Request.Context(), c.Param("id"))
	h.write(c, resp, err)
}

func (h *RegistryHandler) ListWorkflows(c *gin.Context) {
	resp, err := h.service.ListWorkflows(c.Request.Context())
	h.write(c, resp, err)
}

func (h *RegistryHandler) GetWorkflow(c *gin.Context) {
	resp, err := h.service.GetWorkflow(c.Request.Context(), c.Param("id"))
	h.write(c, resp, err)
}

func (h *RegistryHandler) write(c *gin.Context, resp registryapp.Response, err error) {
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(resp.StatusCode, "application/json", resp.Body)
}

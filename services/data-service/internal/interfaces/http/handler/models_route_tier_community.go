//go:build !runtime_overlay

package handler

import "github.com/gin-gonic/gin"

func modelCatalogRequestedRouteGroup(c *gin.Context) (string, error) {
	return "", nil
}

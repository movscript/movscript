package router

import "github.com/gin-gonic/gin"

func registerOpenAIGatewayRoutes(r *gin.Engine, h handlers) {
	openAIV1 := r.Group("/v1")
	{
		openAIV1.GET("/models", h.modelGateway.ListModels)
		openAIV1.POST("/chat/completions", h.modelGateway.ChatCompletions)
	}
}

func registerPublicAPIRoutes(v1 *gin.RouterGroup, h handlers) {
	v1.POST("/auth/register", h.auth.Register)
	v1.POST("/auth/login", h.auth.Login)
	v1.POST("/auth/logout", h.auth.Logout)

	v1.GET("/models", h.models.ListByCapability)
	v1.GET("/features/:key", h.feature.GetPublic)
	v1.POST("/model-gateway/chat/completions", h.modelGateway.ChatCompletions)

	v1.GET("/invitations/:token", h.org.GetInvitation)
	v1.POST("/invitations/:token/accept", h.org.AcceptInvitation)
}

package router

import "github.com/gin-gonic/gin"

func registerOpenAIGatewayRoutes(r *gin.Engine, h handlers) {
	openAIV1 := r.Group("/v1")
	{
		openAIV1.GET("/models", h.modelGateway.ListModels)
		openAIV1.POST("/chat/completions", h.modelGateway.ChatCompletions)
		openAIV1.POST("/responses", h.modelGateway.Responses)
		openAIV1.POST("/messages", h.modelGateway.AnthropicMessages)
		openAIV1.POST("/openai-proxy/*path", h.modelGateway.OpenAIProxy)
	}
}

func registerPublicAPIRoutes(v1 *gin.RouterGroup, h handlers) {
	v1.GET("/auth/config", h.auth.Config)
	v1.GET("/auth/me", h.auth.Me)
	v1.POST("/auth/code/start", h.auth.StartCode)
	v1.POST("/auth/code/verify", h.auth.VerifyCode)
	v1.POST("/auth/register", h.auth.Register)
	v1.POST("/auth/local-bootstrap", h.auth.LocalBootstrap)
	v1.POST("/auth/login", h.auth.Login)
	v1.POST("/auth/logout", h.auth.Logout)
	v1.PATCH("/auth/profile", h.auth.UpdateProfile)

	v1.GET("/models", h.models.ListByCapability)
	v1.GET("/features/:key", h.feature.GetPublic)
	v1.GET("/ws", h.ws.Connect)

	v1.GET("/invitations/:token", h.org.GetInvitation)
	v1.POST("/invitations/:token/accept", h.org.AcceptInvitation)
}

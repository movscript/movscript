package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	userapp "github.com/movscript/movscript/internal/app/user"
	"github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

type UserHandler struct {
	service *userapp.Service
}

func NewUserHandler(db *gorm.DB) *UserHandler {
	return &UserHandler{service: userapp.NewService(db)}
}

func (h *UserHandler) List(c *gin.Context) {
	users, err := h.service.List(c.Request.Context(), userapp.ListFilter{Query: c.Query("q")})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, users)
}

func (h *UserHandler) Create(c *gin.Context) {
	var req service.UserCreateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	u, err := h.service.Create(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, u)
}

package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
	"github.com/movscript/movscript/internal/service"
	"gorm.io/gorm"
)

type UserHandler struct{ db *gorm.DB }

func NewUserHandler(db *gorm.DB) *UserHandler { return &UserHandler{db: db} }

func (h *UserHandler) List(c *gin.Context) {
	q := c.Query("q")
	var users []model.User
	qb := h.db
	if q != "" {
		qb = qb.Where("username ILIKE ?", "%"+q+"%").Limit(10)
	}
	qb.Find(&users)
	c.JSON(http.StatusOK, users)
}

func (h *UserHandler) Create(c *gin.Context) {
	var req service.UserCreateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	u := service.NewUser(req)
	h.db.Create(&u)
	c.JSON(http.StatusCreated, u)
}

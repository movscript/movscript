package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	modelgatewayapp "github.com/movscript/movscript/internal/app/modelgateway"
)

func gatewayMessageContent(raw json.RawMessage) (string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return "", nil
	}

	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s, nil
	}

	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &parts); err != nil {
		return "", fmt.Errorf("must be a string or an array of text parts")
	}

	var builder strings.Builder
	for _, part := range parts {
		if part.Type == "" || part.Type == "text" {
			builder.WriteString(part.Text)
		}
	}
	return builder.String(), nil
}

func rawJSONPresent(raw json.RawMessage) bool {
	s := strings.TrimSpace(string(raw))
	return s != "" && s != "null" && s != "[]"
}

func parseStringArray(raw string) []string {
	var values []string
	if strings.TrimSpace(raw) == "" {
		return values
	}
	_ = json.Unmarshal([]byte(raw), &values)
	return values
}

func parseUintArray(raw string) []uint {
	var values []uint
	if strings.TrimSpace(raw) == "" {
		return values
	}
	_ = json.Unmarshal([]byte(raw), &values)
	return values
}

func mustJSONString(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return "[]"
	}
	return string(data)
}

func generateGatewayAPIKey() string {
	return modelgatewayapp.GenerateAPIKey()
}

func hashGatewayAPIKey(raw string) string {
	return modelgatewayapp.HashAPIKey(raw)
}

func gatewayKeyPrefix(raw string) string {
	return modelgatewayapp.KeyPrefix(raw)
}

func writeOpenAIError(c *gin.Context, status int, message, typ, param, code string) {
	c.JSON(status, openAIErrorResponse{Error: openAIError{
		Message: message,
		Type:    typ,
		Param:   param,
		Code:    code,
	}})
}

func randomHex(bytes int) string {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return hex.EncodeToString(buf)
}

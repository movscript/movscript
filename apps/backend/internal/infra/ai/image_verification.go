package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

var ErrImageVerificationRequired = errors.New("image verification required")

type ImageVerificationStatus string

const (
	ImageVerificationPending  ImageVerificationStatus = "pending"
	ImageVerificationVerified ImageVerificationStatus = "verified"
	ImageVerificationRejected ImageVerificationStatus = "rejected"
	ImageVerificationUnknown  ImageVerificationStatus = ""
)

type ImageVerificationResult struct {
	Status    ImageVerificationStatus
	Ref       string
	Provider  string
	Message   string
	CheckedAt time.Time
}

type ImageVerificationRequest struct {
	ImageURL string
	MimeType string
}

type ImageVerificationClient interface {
	VerifyImage(ctx context.Context, req ImageVerificationRequest) (ImageVerificationResult, error)
}

type HTTPImageVerificationClient struct {
	BaseURL string
	APIKey  string
	Client  *http.Client
}

func NewHTTPImageVerificationClient(baseURL, apiKey string) *HTTPImageVerificationClient {
	return &HTTPImageVerificationClient{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		Client:  &http.Client{Timeout: 90 * time.Second},
	}
}

func (c *HTTPImageVerificationClient) VerifyImage(ctx context.Context, req ImageVerificationRequest) (ImageVerificationResult, error) {
	if strings.TrimSpace(c.BaseURL) == "" {
		return ImageVerificationResult{}, ErrImageVerificationRequired
	}
	body := map[string]any{
		"image_url": req.ImageURL,
		"mime_type": req.MimeType,
	}
	b, err := json.Marshal(body)
	if err != nil {
		return ImageVerificationResult{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/image-verifications", strings.NewReader(string(b)))
	if err != nil {
		return ImageVerificationResult{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	}
	resp, err := c.Client.Do(httpReq)
	if err != nil {
		return ImageVerificationResult{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return ImageVerificationResult{}, fmt.Errorf("image verification API returned %d", resp.StatusCode)
	}
	var out struct {
		Status   string `json:"status"`
		Ref      string `json:"ref"`
		Provider string `json:"provider"`
		Message  string `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return ImageVerificationResult{}, err
	}
	return ImageVerificationResult{
		Status:    ImageVerificationStatus(out.Status),
		Ref:       out.Ref,
		Provider:  out.Provider,
		Message:   out.Message,
		CheckedAt: time.Now().UTC(),
	}, nil
}

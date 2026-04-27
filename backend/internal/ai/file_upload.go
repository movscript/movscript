package ai

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"github.com/volcengine/volcengine-go-sdk/service/arkruntime"
	arkfile "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model/file"
)

// FileUploader uploads a file to a provider-side Files API and returns the file ID.
type FileUploader interface {
	UploadFile(ctx context.Context, data []byte, filename, mimeType, purpose string) (string, error)
	DeleteFile(ctx context.Context, fileID string) error
}

// OpenAIFileUploader uploads files to an OpenAI-compatible Files API endpoint.
type OpenAIFileUploader struct {
	client openai.Client
}

func NewFileUploader(baseURL, apiKey string) *OpenAIFileUploader {
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	return &OpenAIFileUploader{
		client: openai.NewClient(
			option.WithAPIKey(apiKey),
			option.WithBaseURL(baseURL),
		),
	}
}

// UploadFile uploads raw bytes to POST /files and returns the provider file ID.
func (u *OpenAIFileUploader) UploadFile(ctx context.Context, data []byte, filename, mimeType, purpose string) (string, error) {
	if purpose == "" {
		purpose = "vision"
	}
	f, err := u.client.Files.New(ctx, openai.FileNewParams{
		File:    bytes.NewReader(data),
		Purpose: openai.FilePurpose(purpose),
	})
	if err != nil {
		return "", fmt.Errorf("upload file: %w", err)
	}
	if f.ID == "" {
		return "", fmt.Errorf("files API returned no file ID")
	}
	return f.ID, nil
}

// DeleteFile removes a file from the provider's Files API.
func (u *OpenAIFileUploader) DeleteFile(ctx context.Context, fileID string) error {
	_, err := u.client.Files.Delete(ctx, fileID)
	return err
}

// VolcenFileUploader uploads files to Volcengine Ark's Files API.
type VolcenFileUploader struct {
	client *arkruntime.Client
}

func NewVolcenFileUploader(baseURL, apiKey string) *VolcenFileUploader {
	if baseURL == "" {
		baseURL = "https://ark.cn-beijing.volces.com/api/v3"
	}
	return &VolcenFileUploader{
		client: arkruntime.NewClientWithApiKey(apiKey,
			arkruntime.WithBaseUrl(baseURL),
			arkruntime.WithHTTPClient(&http.Client{Timeout: 2 * time.Minute}),
		),
	}
}

func (u *VolcenFileUploader) UploadFile(ctx context.Context, data []byte, filename, mimeType, purpose string) (string, error) {
	p := arkfile.Purpose(purpose)
	if p == "" || p == arkfile.Purpose("vision") {
		p = arkfile.PurposeUserData
	}
	f, err := u.client.UploadFile(ctx, &arkfile.UploadFileRequest{
		File:    bytes.NewReader(data),
		Purpose: p,
	})
	if err != nil {
		return "", fmt.Errorf("upload volcengine file: %w", err)
	}
	if f.ID == "" {
		return "", fmt.Errorf("volcengine files API returned no file ID")
	}
	return f.ID, nil
}

func (u *VolcenFileUploader) DeleteFile(ctx context.Context, fileID string) error {
	_, err := u.client.DeleteFile(ctx, fileID)
	return err
}

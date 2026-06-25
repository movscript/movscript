package upload

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/volcengine/ve-tos-golang-sdk/v2/tos"
	"github.com/volcengine/ve-tos-golang-sdk/v2/tos/enum"
)

type TOSConfig struct {
	Endpoint      string `json:"endpoint"`
	Region        string `json:"region"`
	Bucket        string `json:"bucket"`
	AccessKey     string `json:"access_key"`
	SecretKey     string `json:"secret_key"`
	PublicBaseURL string `json:"public_base_url"`
}

type tosUploader struct {
	cfg    TOSConfig
	client *tos.ClientV2
}

func NewTOSUploader(configJSON string) (*tosUploader, error) {
	var cfg TOSConfig
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return nil, fmt.Errorf("tos: parse config: %w", err)
	}

	cred := tos.NewStaticCredentials(cfg.AccessKey, cfg.SecretKey)
	client, err := tos.NewClientV2(
		cfg.Endpoint,
		tos.WithCredentials(cred),
		tos.WithRegion(cfg.Region),
	)
	if err != nil {
		return nil, fmt.Errorf("tos: create client: %w", err)
	}

	return &tosUploader{cfg: cfg, client: client}, nil
}

func (u *tosUploader) Type() string { return "tos" }

func (u *tosUploader) Upload(ctx context.Context, data []byte, filename, mimeType string) (UploadResult, error) {
	key := "movscript/" + filename

	_, err := u.client.PutObjectV2(ctx, &tos.PutObjectV2Input{
		PutObjectBasicInput: tos.PutObjectBasicInput{
			Bucket:      u.cfg.Bucket,
			Key:         key,
			ContentType: mimeType,
			ACL:         enum.ACLPublicRead,
		},
		Content: bytes.NewReader(data),
	})
	if err != nil {
		return UploadResult{}, fmt.Errorf("tos: put object: %w", err)
	}

	url := strings.TrimRight(u.cfg.PublicBaseURL, "/") + "/" + key
	return UploadResult{URL: url}, nil
}

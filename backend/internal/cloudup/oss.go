package cloudup

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type OSSConfig struct {
	Endpoint        string `json:"endpoint"`
	Bucket          string `json:"bucket"`
	AccessKeyID     string `json:"access_key_id"`
	AccessKeySecret string `json:"access_key_secret"`
	PublicBaseURL   string `json:"public_base_url"`
}

type ossUploader struct {
	cfg OSSConfig
}

func NewOSSUploader(configJSON string) (*ossUploader, error) {
	var cfg OSSConfig
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return nil, fmt.Errorf("oss: parse config: %w", err)
	}
	return &ossUploader{cfg: cfg}, nil
}

func (u *ossUploader) Type() string { return "oss" }

func (u *ossUploader) Upload(ctx context.Context, data []byte, filename, mimeType string) (UploadResult, error) {
	key := "movscript/" + filename
	endpoint := fmt.Sprintf("https://%s.%s/%s", u.cfg.Bucket, u.cfg.Endpoint, key)

	now := time.Now().UTC()
	date := now.Format(http.TimeFormat)

	contentMD5 := ""
	canonicalResource := fmt.Sprintf("/%s/%s", u.cfg.Bucket, key)
	stringToSign := strings.Join([]string{
		"PUT",
		contentMD5,
		mimeType,
		date,
		canonicalResource,
	}, "\n")

	mac := hmac.New(sha1.New, []byte(u.cfg.AccessKeySecret))
	mac.Write([]byte(stringToSign))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	authHeader := fmt.Sprintf("OSS %s:%s", u.cfg.AccessKeyID, signature)

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, endpoint, bytes.NewReader(data))
	if err != nil {
		return UploadResult{}, fmt.Errorf("oss: build request: %w", err)
	}
	req.Header.Set("Content-Type", mimeType)
	req.Header.Set("Date", date)
	req.Header.Set("Authorization", authHeader)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return UploadResult{}, fmt.Errorf("oss: do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return UploadResult{}, fmt.Errorf("oss: unexpected status %d: %s", resp.StatusCode, body)
	}

	url := strings.TrimRight(u.cfg.PublicBaseURL, "/") + "/" + key
	return UploadResult{URL: url}, nil
}

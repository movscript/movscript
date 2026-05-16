package upload

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type S3Config struct {
	Region        string `json:"region"`
	Bucket        string `json:"bucket"`
	AccessKey     string `json:"access_key"`
	SecretKey     string `json:"secret_key"`
	PublicBaseURL string `json:"public_base_url"`
}

type s3Uploader struct {
	cfg S3Config
}

func NewS3Uploader(configJSON string) (*s3Uploader, error) {
	var cfg S3Config
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return nil, fmt.Errorf("s3: parse config: %w", err)
	}
	return &s3Uploader{cfg: cfg}, nil
}

func (u *s3Uploader) Type() string { return "s3" }

func (u *s3Uploader) Upload(ctx context.Context, data []byte, filename, mimeType string) (UploadResult, error) {
	key := "movscript/" + filename
	endpoint := fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", u.cfg.Bucket, u.cfg.Region, key)

	now := time.Now().UTC()
	dateStamp := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")

	payloadHash := sha256Hex(data)

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, endpoint, bytes.NewReader(data))
	if err != nil {
		return UploadResult{}, fmt.Errorf("s3: build request: %w", err)
	}
	req.Header.Set("Content-Type", mimeType)
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", payloadHash)
	req.Header.Set("x-amz-acl", "public-read")
	req.Header.Set("Host", fmt.Sprintf("%s.s3.%s.amazonaws.com", u.cfg.Bucket, u.cfg.Region))

	signedHeaders := "content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date"
	canonicalHeaders := fmt.Sprintf(
		"content-type:%s\nhost:%s\nx-amz-acl:public-read\nx-amz-content-sha256:%s\nx-amz-date:%s\n",
		mimeType,
		fmt.Sprintf("%s.s3.%s.amazonaws.com", u.cfg.Bucket, u.cfg.Region),
		payloadHash,
		amzDate,
	)

	canonicalURI := "/" + key
	canonicalQueryString := ""
	canonicalRequest := strings.Join([]string{
		"PUT",
		canonicalURI,
		canonicalQueryString,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	}, "\n")

	credentialScope := fmt.Sprintf("%s/%s/s3/aws4_request", dateStamp, u.cfg.Region)
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		sha256Hex([]byte(canonicalRequest)),
	}, "\n")

	signingKey := s3DeriveSigningKey(u.cfg.SecretKey, dateStamp, u.cfg.Region, "s3")
	signature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	authHeader := fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		u.cfg.AccessKey, credentialScope, signedHeaders, signature,
	)
	req.Header.Set("Authorization", authHeader)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return UploadResult{}, fmt.Errorf("s3: do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return UploadResult{}, fmt.Errorf("s3: unexpected status %d: %s", resp.StatusCode, body)
	}

	url := strings.TrimRight(u.cfg.PublicBaseURL, "/") + "/" + key
	return UploadResult{URL: url}, nil
}

func sha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func hmacSHA256(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return mac.Sum(nil)
}

func s3DeriveSigningKey(secretKey, dateStamp, region, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secretKey), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte(service))
	kSigning := hmacSHA256(kService, []byte("aws4_request"))
	return kSigning
}

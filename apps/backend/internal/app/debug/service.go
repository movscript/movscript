package debug

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/crypto"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("debug item not found")

type Service struct {
	repo          repository
	encryptionKey []byte
}

func NewService(db *gorm.DB, encryptionKey ...[]byte) *Service {
	var key []byte
	if len(encryptionKey) > 0 {
		key = encryptionKey[0]
	}
	return &Service{repo: &gormRepository{db: db}, encryptionKey: key}
}

type JobPage struct {
	Items []model.Job
	Total int64
}

type RawCallInput struct {
	CredentialID *uint
	URL          string
	Method       string
	Headers      map[string]string
	Body         string
}

type RawCallResult struct {
	URL            string            `json:"url"`
	Method         string            `json:"method"`
	RequestHeaders map[string]string `json:"request_headers"`
	RequestBody    string            `json:"request_body"`
	ResponseStatus int               `json:"response_status"`
	ResponseBody   string            `json:"response_body"`
	LatencyMs      int64             `json:"latency_ms"`
	Error          string            `json:"error,omitempty"`
}

type ProviderCallInput struct {
	AdapterType string
	BaseURL     string
	APIKey      string
	EndpointURL string
	Capability  string
	Model       string
	Prompt      string
	Params      map[string]any
	DryRun      bool
}

type JobDetail struct {
	model.Job
	DebugDetail *ai.DebugCallResult `json:"debug_detail,omitempty"`
}

func (s *Service) GetCredential(ctx context.Context, id uint) (model.AICredential, error) {
	return s.repo.GetCredential(ctx, id)
}

func (s *Service) RawCall(ctx context.Context, input RawCallInput) RawCallResult {
	headers := make(map[string]string)
	for k, v := range input.Headers {
		headers[k] = v
	}

	if input.CredentialID != nil {
		if cred, err := s.GetCredential(ctx, *input.CredentialID); err == nil {
			apiKey := ""
			if cred.EncryptedKey != "" {
				if plain, err := crypto.Decrypt(cred.EncryptedKey, s.encryptionKey); err == nil {
					apiKey = plain
				}
			}
			if apiKey != "" {
				switch cred.AdapterType {
				case ai.AdapterAnthropic:
					headers["x-api-key"] = apiKey
					headers["anthropic-version"] = "2023-06-01"
				default:
					headers["Authorization"] = "Bearer " + apiKey
				}
			}
		}
	}

	return doRawHTTP(ctx, input.Method, input.URL, headers, input.Body)
}

func doRawHTTP(ctx context.Context, method, url string, headers map[string]string, body string) RawCallResult {
	var bodyReader io.Reader
	if body != "" {
		bodyReader = bytes.NewBufferString(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return RawCallResult{URL: url, Method: method, Error: err.Error()}
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if body != "" && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	reqHeaders := make(map[string]string)
	for k := range req.Header {
		v := req.Header.Get(k)
		if k == "Authorization" || k == "X-Api-Key" {
			v = maskHeader(v)
		}
		reqHeaders[k] = v
	}

	start := time.Now()
	resp, err := http.DefaultClient.Do(req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return RawCallResult{URL: url, Method: method, RequestHeaders: reqHeaders,
			RequestBody: body, LatencyMs: latency, Error: err.Error()}
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	errMsg := ""
	if resp.StatusCode >= 400 {
		errMsg = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return RawCallResult{
		URL: url, Method: method,
		RequestHeaders: reqHeaders, RequestBody: body,
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody),
		LatencyMs: latency, Error: errMsg,
	}
}

func maskHeader(v string) string {
	if len(v) > 12 {
		return v[:7] + "..." + v[len(v)-4:]
	}
	return "***"
}

func (s *Service) ProviderCall(ctx context.Context, input ProviderCallInput) ai.DebugCallResult {
	return ai.ProviderDebugCall(ctx, ai.ProviderDebugCallRequest{
		AdapterType: input.AdapterType,
		BaseURL:     input.BaseURL,
		APIKey:      input.APIKey,
		EndpointURL: input.EndpointURL,
		Capability:  input.Capability,
		Model:       input.Model,
		Prompt:      input.Prompt,
		Params:      input.Params,
		DryRun:      input.DryRun,
	})
}

func (s *Service) ListJobs(ctx context.Context, status string, limit, offset int) (JobPage, error) {
	return s.repo.ListJobs(ctx, status, limit, offset)
}

func (s *Service) ListJobDetails(ctx context.Context, status string, limit, offset int) ([]JobDetail, int64, error) {
	page, err := s.ListJobs(ctx, status, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	return jobDetails(page.Items), page.Total, nil
}

func (s *Service) GetJob(ctx context.Context, id string) (model.Job, error) {
	return s.repo.GetJob(ctx, id)
}

func (s *Service) GetJobDetail(ctx context.Context, id string) (JobDetail, error) {
	job, err := s.GetJob(ctx, id)
	if err != nil {
		return JobDetail{}, err
	}
	return jobDetail(job), nil
}

func jobDetails(jobs []model.Job) []JobDetail {
	out := make([]JobDetail, 0, len(jobs))
	for _, job := range jobs {
		out = append(out, jobDetail(job))
	}
	return out
}

func jobDetail(job model.Job) JobDetail {
	d := JobDetail{Job: job}
	if job.DebugInfo != "" {
		var dr ai.DebugCallResult
		if err := json.Unmarshal([]byte(job.DebugInfo), &dr); err == nil {
			d.DebugDetail = &dr
		}
	}
	return d
}

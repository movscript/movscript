package debug

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	neturl "net/url"
	"strings"
	"time"

	domainaiadmin "github.com/movscript/movscript/internal/domain/aiadmin"
	domainjob "github.com/movscript/movscript/internal/domain/job"
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
	Items []domainjob.Job
	Total int64
}

type JobStatusCount struct {
	Status string `json:"status"`
	Count  int64  `json:"count"`
}

type JobStats struct {
	Total        int64            `json:"total"`
	ByStatus     []JobStatusCount `json:"by_status"`
	RecentFailed []JobDetail      `json:"recent_failed"`
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
	domainjob.Job
	DebugDetail *ai.DebugCallResult `json:"debug_detail,omitempty"`
}

func (s *Service) getCredential(ctx context.Context, id uint) (domainaiadmin.Credential, error) {
	return s.repo.GetCredential(ctx, id)
}

func (s *Service) RawCall(ctx context.Context, input RawCallInput) RawCallResult {
	headers := make(map[string]string)
	for k, v := range input.Headers {
		headers[k] = v
	}

	if input.CredentialID != nil {
		if cred, err := s.getCredential(ctx, *input.CredentialID); err == nil {
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
	if err := validateRawCallURL(ctx, url); err != nil {
		return RawCallResult{URL: url, Method: method, Error: err.Error()}
	}
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
	client := *http.DefaultClient
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		return validateRawCallURL(req.Context(), req.URL.String())
	}
	resp, err := client.Do(req)
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

func validateRawCallURL(ctx context.Context, rawURL string) error {
	return validateDebugOutboundURL(ctx, rawURL, "raw call URL")
}

func validateDebugOutboundURL(ctx context.Context, rawURL string, label string) error {
	parsed, err := neturl.Parse(rawURL)
	if err != nil {
		return err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("%s scheme must be http or https", label)
	}
	host := parsed.Hostname()
	if host == "" {
		return fmt.Errorf("%s host is required", label)
	}
	normalizedHost := strings.ToLower(strings.TrimSuffix(host, "."))
	if normalizedHost == "localhost" || strings.HasSuffix(normalizedHost, ".localhost") {
		return fmt.Errorf("%s host is not allowed", label)
	}
	if ip := net.ParseIP(host); ip != nil {
		if blockedDebugIP(ip) {
			return fmt.Errorf("%s host is not allowed", label)
		}
		return nil
	}
	addrs, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return err
	}
	if len(addrs) == 0 {
		return fmt.Errorf("%s host could not be resolved", label)
	}
	for _, addr := range addrs {
		if blockedDebugIP(addr.IP) {
			return fmt.Errorf("%s host is not allowed", label)
		}
	}
	return nil
}

func blockedDebugIP(ip net.IP) bool {
	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified()
}

func maskHeader(v string) string {
	if len(v) > 12 {
		return v[:7] + "..." + v[len(v)-4:]
	}
	return "***"
}

func (s *Service) ProviderCall(ctx context.Context, input ProviderCallInput) ai.DebugCallResult {
	baseURL := strings.TrimSpace(input.BaseURL)
	if baseURL == "" {
		if def := ai.GetAdapterDef(input.AdapterType); def != nil {
			baseURL = def.DefaultBaseURL
		}
	}
	if baseURL != "" {
		if err := validateDebugOutboundURL(ctx, baseURL, "provider base_url"); err != nil {
			return ai.DebugCallResult{ModelID: input.Model, Error: err.Error()}
		}
	}
	endpointURL := strings.TrimSpace(input.EndpointURL)
	if endpointURL != "" {
		if err := validateDebugOutboundURL(ctx, endpointURL, "provider endpoint_url"); err != nil {
			return ai.DebugCallResult{ModelID: input.Model, Error: err.Error()}
		}
	}
	return ai.ProviderDebugCall(ctx, ai.ProviderDebugCallRequest{
		AdapterType: input.AdapterType,
		BaseURL:     baseURL,
		APIKey:      input.APIKey,
		EndpointURL: endpointURL,
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

func (s *Service) JobStats(ctx context.Context, recentLimit int) (JobStats, error) {
	if recentLimit <= 0 {
		recentLimit = 10
	}
	if recentLimit > 50 {
		recentLimit = 50
	}
	stats, err := s.repo.JobStats(ctx, recentLimit)
	if err != nil {
		return stats, err
	}
	return stats, nil
}

func (s *Service) GetJob(ctx context.Context, id string) (domainjob.Job, error) {
	return s.repo.GetJob(ctx, id)
}

func (s *Service) GetJobDetail(ctx context.Context, id string) (JobDetail, error) {
	job, err := s.GetJob(ctx, id)
	if err != nil {
		return JobDetail{}, err
	}
	return jobDetail(job), nil
}

func jobDetails(jobs []domainjob.Job) []JobDetail {
	return jobDetailsFromJobs(jobs)
}

func jobDetailsFromJobs(jobs []domainjob.Job) []JobDetail {
	out := make([]JobDetail, 0, len(jobs))
	for _, job := range jobs {
		out = append(out, jobDetail(job))
	}
	return out
}

func jobDetail(job domainjob.Job) JobDetail {
	d := JobDetail{Job: job}
	if job.DebugInfo != "" {
		var dr ai.DebugCallResult
		if err := json.Unmarshal([]byte(job.DebugInfo), &dr); err == nil {
			d.DebugDetail = &dr
		}
	}
	return d
}

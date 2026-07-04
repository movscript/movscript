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

	"github.com/movscript/auth-service/pkg/authidentity"
	domainidentity "github.com/movscript/auth-service/pkg/authidentity/identity"
	domainai "github.com/movscript/movscript/internal/domain/ai"
	domainjob "github.com/movscript/movscript/internal/domain/job"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/crypto"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("debug item not found")
var ErrInvalidLLMCallLogSettings = errors.New("invalid llm call log settings")

type Service struct {
	repo          repository
	auditReader   providercontract.AIGatewayAuditLogReader
	encryptionKey []byte
	identity      authidentity.Reader
}

func NewService(db *gorm.DB, encryptionKey ...[]byte) *Service {
	return NewServiceWithIdentity(db, nil, encryptionKey...)
}

func NewServiceWithIdentity(db *gorm.DB, identity authidentity.Reader, encryptionKey ...[]byte) *Service {
	var key []byte
	if len(encryptionKey) > 0 {
		key = encryptionKey[0]
	}
	repo := &gormRepository{db: db}
	return &Service{repo: repo, auditReader: repo, encryptionKey: key, identity: identity}
}

func NewServiceWithAuditLogReader(repo repository, reader providercontract.AIGatewayAuditLogReader, encryptionKey []byte, identity ...authidentity.Reader) *Service {
	service := &Service{repo: repo, auditReader: reader, encryptionKey: encryptionKey}
	if len(identity) > 0 {
		service.identity = identity[0]
	}
	return service
}

type JobPage struct {
	Items []domainjob.Job
	Total int64
}

type JobFilters struct {
	JobID      *uint
	Status     string
	JobType    string
	FeatureKey string
	UserID     *uint
	OrgID      *uint
	ProjectID  *uint
	ModelID    string
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

type LLMCallLogSettings struct {
	RetentionDays int `json:"retention_days"`
}

type LLMCallLogFilter struct {
	UserID          string
	OrgID           string
	ProjectID       string
	ModelID         string
	CredentialID    string
	GatewayAPIKeyID string
	OperationType   string
	Status          string
	Provider        string
	PromptName      string
	Since           *time.Time
	Until           *time.Time
	IncludeExpired  bool
	ExpiredOnly     bool
	Page            int
	PageSize        int
}

type LLMCallLogPage struct {
	Items    []LLMCallLog `json:"items"`
	Total    int64        `json:"total"`
	Page     int          `json:"page"`
	PageSize int          `json:"page_size"`
}

type LLMCallLogSummary struct {
	Total             int64        `json:"total"`
	Success           int64        `json:"success"`
	Errors            int64        `json:"errors"`
	ErrorRate         float64      `json:"error_rate"`
	AvgLatencyMs      float64      `json:"avg_latency_ms"`
	InputTokens       int64        `json:"input_tokens"`
	OutputTokens      int64        `json:"output_tokens"`
	CachedInputTokens int64        `json:"cached_input_tokens"`
	ReasoningTokens   int64        `json:"reasoning_tokens"`
	RecentErrors      []LLMCallLog `json:"recent_errors"`
	GeneratedAt       time.Time    `json:"generated_at"`
}

type LLMCallLogUserRef struct {
	ID         uint   `json:"ID"`
	Username   string `json:"username"`
	SystemRole string `json:"system_role"`
}

type LLMCallLog struct {
	ID                uint               `json:"ID"`
	RequestID         string             `json:"request_id,omitempty"`
	UserID            uint               `json:"user_id"`
	User              *LLMCallLogUserRef `json:"user,omitempty"`
	OrgID             *uint              `json:"org_id,omitempty"`
	ProjectID         *uint              `json:"project_id,omitempty"`
	GatewayAPIKeyID   *uint              `json:"gateway_api_key_id,omitempty"`
	CatalogEntryID    *uint              `json:"ai_model_catalog_entry_id,omitempty"`
	RouteBindingID    *uint              `json:"route_binding_id,omitempty"`
	ModelID           string             `json:"model_id,omitempty"`
	CredentialID      uint               `json:"credential_id"`
	OperationType     string             `json:"operation_type"`
	PromptName        string             `json:"prompt_name,omitempty"`
	Provider          string             `json:"provider,omitempty"`
	RequestModel      string             `json:"request_model,omitempty"`
	ResponseModel     string             `json:"response_model,omitempty"`
	Status            string             `json:"status"`
	Error             string             `json:"error,omitempty"`
	LatencyMs         int64              `json:"latency_ms"`
	InputTokens       int                `json:"input_tokens"`
	OutputTokens      int                `json:"output_tokens"`
	CachedInputTokens int                `json:"cached_input_tokens"`
	ReasoningTokens   int                `json:"reasoning_tokens"`
	RequestJSON       string             `json:"request_json,omitempty"`
	ResponseJSON      string             `json:"response_json,omitempty"`
	PayloadTruncated  bool               `json:"payload_truncated"`
	ExpiresAt         *time.Time         `json:"expires_at,omitempty"`
	RetentionDays     int                `json:"retention_days"`
	CreatedAt         time.Time          `json:"CreatedAt"`
	UpdatedAt         time.Time          `json:"UpdatedAt"`
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

func (s *Service) getCredential(ctx context.Context, id uint) (domainai.Credential, error) {
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
			return ai.DebugCallResult{ModelID: input.Model, Error: ai.SanitizeDebugErrorMessage(err.Error())}
		}
	}
	endpointURL := strings.TrimSpace(input.EndpointURL)
	if endpointURL != "" {
		if err := validateDebugOutboundURL(ctx, endpointURL, "provider endpoint_url"); err != nil {
			return ai.DebugCallResult{ModelID: input.Model, Error: ai.SanitizeDebugErrorMessage(err.Error())}
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

func (s *Service) ListLLMCallLogs(ctx context.Context, filter LLMCallLogFilter) (LLMCallLogPage, error) {
	page, err := s.auditReader.ListGatewayCallLogs(ctx, llmCallLogFilterToContract(filter))
	if err != nil {
		return LLMCallLogPage{}, err
	}
	out := llmCallLogPageFromContract(page)
	s.enrichLLMCallLogs(ctx, out.Items)
	return out, nil
}

func (s *Service) LLMCallLogSummary(ctx context.Context, filter LLMCallLogFilter) (LLMCallLogSummary, error) {
	summary, err := s.auditReader.SummarizeGatewayCallLogs(ctx, llmCallLogFilterToContract(filter))
	if err != nil {
		return LLMCallLogSummary{}, err
	}
	out := llmCallLogSummaryFromContract(summary)
	if out.GeneratedAt.IsZero() {
		out.GeneratedAt = time.Now().UTC()
	}
	s.enrichLLMCallLogs(ctx, out.RecentErrors)
	return out, nil
}

func (s *Service) LLMCallLogSettings(ctx context.Context) (LLMCallLogSettings, error) {
	settings := defaultLLMCallLogSettings()
	record, err := s.repo.GetAdminSetting(ctx, llmCallLogSettingsKey)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return settings, nil
		}
		return settings, err
	}
	if err := json.Unmarshal([]byte(record), &settings); err != nil {
		return defaultLLMCallLogSettings(), nil
	}
	return normalizeLLMCallLogSettings(settings), nil
}

func (s *Service) UpdateLLMCallLogSettings(ctx context.Context, settings LLMCallLogSettings) (LLMCallLogSettings, error) {
	settings = normalizeLLMCallLogSettings(settings)
	if settings.RetentionDays <= 0 || settings.RetentionDays > 365 {
		return settings, ErrInvalidLLMCallLogSettings
	}
	raw, err := json.Marshal(settings)
	if err != nil {
		return settings, err
	}
	if err := s.repo.SaveAdminSetting(ctx, llmCallLogSettingsKey, string(raw)); err != nil {
		return settings, err
	}
	return settings, nil
}

func (s *Service) PurgeExpiredLLMCallLogs(ctx context.Context, now time.Time) (int64, error) {
	return s.repo.PurgeExpiredLLMCallLogs(ctx, now)
}

func (s *Service) UpdateLLMCallLogExpiration(ctx context.Context, id uint, expiresAt *time.Time) (LLMCallLog, error) {
	item, err := s.repo.UpdateLLMCallLogExpiration(ctx, id, expiresAt)
	if err != nil {
		return LLMCallLog{}, err
	}
	s.enrichLLMCallLog(ctx, &item)
	return item, nil
}

func (s *Service) enrichLLMCallLogs(ctx context.Context, rows []LLMCallLog) {
	if s.identity == nil {
		return
	}
	userIDs := make([]uint, 0, len(rows))
	seen := make(map[uint]struct{})
	for _, row := range rows {
		if row.UserID == 0 || row.User != nil {
			continue
		}
		if _, ok := seen[row.UserID]; ok {
			continue
		}
		seen[row.UserID] = struct{}{}
		userIDs = append(userIDs, row.UserID)
	}
	users := s.llmUserRefs(ctx, userIDs)
	for i := range rows {
		if rows[i].User == nil {
			if ref, ok := users[rows[i].UserID]; ok {
				rows[i].User = &ref
			}
		}
	}
}

func (s *Service) enrichLLMCallLog(ctx context.Context, row *LLMCallLog) {
	if row == nil || row.User != nil || row.UserID == 0 || s.identity == nil {
		return
	}
	if profile, err := s.identity.UserProfile(ctx, row.UserID); err == nil {
		ref := llmUserRefFromProfile(profile)
		row.User = &ref
	}
}

func (s *Service) llmUserRefs(ctx context.Context, userIDs []uint) map[uint]LLMCallLogUserRef {
	out := make(map[uint]LLMCallLogUserRef, len(userIDs))
	for _, userID := range userIDs {
		profile, err := s.identity.UserProfile(ctx, userID)
		if err != nil {
			continue
		}
		out[userID] = llmUserRefFromProfile(profile)
	}
	return out
}

func llmUserRefFromProfile(profile domainidentity.UserProfile) LLMCallLogUserRef {
	return LLMCallLogUserRef{ID: profile.ID, Username: profile.Username, SystemRole: profile.SystemRole}
}

const llmCallLogSettingsKey = "llm_call_log_settings"

func defaultLLMCallLogSettings() LLMCallLogSettings {
	return LLMCallLogSettings{RetentionDays: 14}
}

func normalizeLLMCallLogSettings(settings LLMCallLogSettings) LLMCallLogSettings {
	if settings.RetentionDays == 0 {
		settings.RetentionDays = defaultLLMCallLogSettings().RetentionDays
	}
	return settings
}

func (s *Service) ListJobs(ctx context.Context, filters JobFilters, limit, offset int) (JobPage, error) {
	return s.repo.ListJobs(ctx, filters, limit, offset)
}

func (s *Service) ListJobDetails(ctx context.Context, filters JobFilters, limit, offset int) ([]JobDetail, int64, error) {
	page, err := s.ListJobs(ctx, filters, limit, offset)
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

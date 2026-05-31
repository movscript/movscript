package externalresource

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/infra/crypto"
	"gorm.io/gorm"
)

const (
	ProviderPexels  = "pexels"
	ProviderPixabay = "pixabay"
)

var (
	ErrNotFound       = errors.New("external resource source not found")
	ErrForbidden      = errors.New("external resource source access denied")
	ErrInvalidConfig  = errors.New("invalid external resource source config")
	ErrInvalidQuery   = errors.New("invalid external resource query")
	ErrProviderFailed = errors.New("external resource provider request failed")
)

type Service struct {
	repo          repository
	encryptionKey []byte
	httpClient    *http.Client
}

func NewService(db *gorm.DB, encryptionKeyHex string) *Service {
	key, _ := hex.DecodeString(encryptionKeyHex)
	return &Service{
		repo:          &gormRepository{db: db},
		encryptionKey: key,
		httpClient:    &http.Client{Timeout: 15 * time.Second},
	}
}

type Source struct {
	ID           uint      `json:"ID"`
	OwnerID      uint      `json:"owner_id"`
	OrgID        *uint     `json:"org_id,omitempty"`
	Name         string    `json:"name"`
	ProviderKey  string    `json:"provider_key"`
	Priority     int       `json:"priority"`
	IsEnabled    bool      `json:"is_enabled"`
	MaskedConfig string    `json:"masked_config,omitempty"`
	CreatedAt    time.Time `json:"CreatedAt"`
	UpdatedAt    time.Time `json:"UpdatedAt"`
	configJSON   string
}

type CreateSourceInput struct {
	UserID      uint
	OrgID       *uint
	Name        string
	ProviderKey string
	Config      map[string]string
	Priority    int
	IsEnabled   bool
}

type UpdateSourceInput struct {
	UserID    uint
	OrgID     *uint
	ID        uint
	Name      *string
	Config    map[string]string
	Priority  *int
	IsEnabled *bool
}

type SearchInput struct {
	UserID      uint
	OrgID       *uint
	SourceID    uint
	Query       string
	MediaType   string
	Orientation string
	Page        int
	PageSize    int
}

type SearchResult struct {
	Items      []ExternalResourceItem `json:"items"`
	Total      int                    `json:"total"`
	Page       int                    `json:"page"`
	PageSize   int                    `json:"page_size"`
	Provider   string                 `json:"provider"`
	NextPage   string                 `json:"next_page,omitempty"`
	SourceName string                 `json:"source_name,omitempty"`
}

type ExternalResourceItem struct {
	ProviderKey     string `json:"provider_key"`
	ExternalID      string `json:"external_id"`
	MediaType       string `json:"media_type"`
	Title           string `json:"title,omitempty"`
	Description     string `json:"description,omitempty"`
	ThumbnailURL    string `json:"thumbnail_url"`
	PreviewURL      string `json:"preview_url,omitempty"`
	SourceURL       string `json:"source_url"`
	Width           int    `json:"width,omitempty"`
	Height          int    `json:"height,omitempty"`
	DurationSeconds int    `json:"duration_seconds,omitempty"`
	AuthorName      string `json:"author_name,omitempty"`
	AuthorURL       string `json:"author_url,omitempty"`
	AttributionText string `json:"attribution_text,omitempty"`
	LicenseLabel    string `json:"license_label,omitempty"`
}

func (s *Service) ListSources(ctx context.Context, userID uint, orgID *uint) ([]Source, error) {
	sources, err := s.repo.ListSources(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}
	for i := range sources {
		sources[i].MaskedConfig = maskConfig(s.decryptConfig(sources[i].configJSON))
	}
	return sources, nil
}

func (s *Service) CreateSource(ctx context.Context, input CreateSourceInput) (Source, error) {
	providerKey := strings.TrimSpace(input.ProviderKey)
	if providerKey == "" {
		providerKey = ProviderPexels
	}
	if !supportedProvider(providerKey) {
		return Source{}, ErrInvalidConfig
	}
	if !validProviderConfig(providerKey, input.Config) {
		return Source{}, ErrInvalidConfig
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = providerDisplayName(providerKey)
	}
	configJSON, err := s.encryptConfig(input.Config)
	if err != nil {
		return Source{}, err
	}
	source := Source{
		OwnerID:     input.UserID,
		OrgID:       input.OrgID,
		Name:        name,
		ProviderKey: providerKey,
		configJSON:  configJSON,
		Priority:    input.Priority,
		IsEnabled:   input.IsEnabled,
	}
	if err := s.repo.CreateSource(ctx, &source); err != nil {
		return Source{}, err
	}
	source.MaskedConfig = maskConfig(input.Config)
	return source, nil
}

func (s *Service) UpdateSource(ctx context.Context, input UpdateSourceInput) (Source, error) {
	source, err := s.repo.GetOwnedSource(ctx, input.ID, input.UserID, input.OrgID)
	if err != nil {
		return Source{}, err
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name != "" {
			source.Name = name
		}
	}
	if input.Config != nil {
		merged := mergeConfigUpdate(s.decryptConfig(source.configJSON), input.Config)
		if !validProviderConfig(source.ProviderKey, merged) {
			return Source{}, ErrInvalidConfig
		}
		configJSON, err := s.encryptConfig(merged)
		if err != nil {
			return Source{}, err
		}
		source.configJSON = configJSON
	}
	if input.Priority != nil {
		source.Priority = *input.Priority
	}
	if input.IsEnabled != nil {
		source.IsEnabled = *input.IsEnabled
	}
	if err := s.repo.SaveSource(ctx, &source); err != nil {
		return Source{}, err
	}
	source.MaskedConfig = maskConfig(s.decryptConfig(source.configJSON))
	return source, nil
}

func (s *Service) Search(ctx context.Context, input SearchInput) (SearchResult, error) {
	query := strings.TrimSpace(input.Query)
	if query == "" {
		return SearchResult{}, ErrInvalidQuery
	}
	source, err := s.repo.GetOwnedSource(ctx, input.SourceID, input.UserID, input.OrgID)
	if err != nil {
		return SearchResult{}, err
	}
	if !source.IsEnabled {
		return SearchResult{}, ErrForbidden
	}
	config := s.decryptConfig(source.configJSON)
	switch source.ProviderKey {
	case ProviderPexels:
		result, err := s.searchPexels(ctx, config, SearchInput{
			Query:       query,
			MediaType:   input.MediaType,
			Orientation: input.Orientation,
			Page:        input.Page,
			PageSize:    input.PageSize,
		})
		result.SourceName = source.Name
		return result, err
	case ProviderPixabay:
		result, err := s.searchPixabay(ctx, config, SearchInput{
			Query:       query,
			MediaType:   input.MediaType,
			Orientation: input.Orientation,
			Page:        input.Page,
			PageSize:    input.PageSize,
		})
		result.SourceName = source.Name
		return result, err
	default:
		return SearchResult{}, ErrInvalidConfig
	}
}

func (s *Service) encryptConfig(config map[string]string) (string, error) {
	raw, err := json.Marshal(config)
	if err != nil {
		return "", err
	}
	if len(s.encryptionKey) == 0 {
		return string(raw), nil
	}
	return crypto.Encrypt(string(raw), s.encryptionKey)
}

func (s *Service) decryptConfig(configJSON string) map[string]string {
	if configJSON == "" {
		return map[string]string{}
	}
	raw := configJSON
	if len(s.encryptionKey) > 0 {
		if plain, err := crypto.Decrypt(configJSON, s.encryptionKey); err == nil {
			raw = plain
		}
	}
	var config map[string]string
	if err := json.Unmarshal([]byte(raw), &config); err != nil {
		return map[string]string{}
	}
	return config
}

func validProviderConfig(providerKey string, config map[string]string) bool {
	switch providerKey {
	case ProviderPexels:
		return strings.TrimSpace(config["api_key"]) != "" && !isMaskedSecret(config["api_key"])
	case ProviderPixabay:
		return strings.TrimSpace(config["api_key"]) != "" && !isMaskedSecret(config["api_key"])
	default:
		return false
	}
}

func supportedProvider(providerKey string) bool {
	switch providerKey {
	case ProviderPexels, ProviderPixabay:
		return true
	default:
		return false
	}
}

func providerDisplayName(providerKey string) string {
	switch providerKey {
	case ProviderPixabay:
		return "Pixabay"
	case ProviderPexels:
		return "Pexels"
	default:
		return providerKey
	}
}

func mergeConfigUpdate(existing map[string]string, incoming map[string]string) map[string]string {
	merged := make(map[string]string, len(existing)+len(incoming))
	for key, value := range existing {
		merged[key] = value
	}
	for key, value := range incoming {
		if key == "api_key" && (strings.TrimSpace(value) == "" || isMaskedSecret(value)) {
			continue
		}
		merged[key] = value
	}
	return merged
}

func maskConfig(config map[string]string) string {
	masked := make(map[string]string, len(config))
	for key, value := range config {
		if key == "api_key" {
			masked[key] = maskSecret(value)
			continue
		}
		masked[key] = value
	}
	raw, err := json.Marshal(masked)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func maskSecret(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "****"
	}
	if len(value) <= 4 {
		return "****"
	}
	return value[:4] + "****"
}

func isMaskedSecret(value string) bool {
	return strings.TrimSpace(value) == "****" || strings.HasSuffix(strings.TrimSpace(value), "****")
}

func normalizeSearchPage(page int) int {
	if page < 1 {
		return 1
	}
	return page
}

func normalizeSearchPageSize(pageSize int) int {
	if pageSize < 1 {
		return 24
	}
	if pageSize > 80 {
		return 80
	}
	return pageSize
}

type pexelsPhotoSearchResponse struct {
	Page         int           `json:"page"`
	PerPage      int           `json:"per_page"`
	TotalResults int           `json:"total_results"`
	NextPage     string        `json:"next_page"`
	Photos       []pexelsPhoto `json:"photos"`
}

type pexelsPhoto struct {
	ID              int               `json:"id"`
	Width           int               `json:"width"`
	Height          int               `json:"height"`
	URL             string            `json:"url"`
	Photographer    string            `json:"photographer"`
	PhotographerURL string            `json:"photographer_url"`
	Alt             string            `json:"alt"`
	Src             map[string]string `json:"src"`
}

type pexelsVideoSearchResponse struct {
	Page         int           `json:"page"`
	PerPage      int           `json:"per_page"`
	TotalResults int           `json:"total_results"`
	NextPage     string        `json:"next_page"`
	Videos       []pexelsVideo `json:"videos"`
}

type pexelsVideo struct {
	ID         int               `json:"id"`
	Width      int               `json:"width"`
	Height     int               `json:"height"`
	Duration   int               `json:"duration"`
	URL        string            `json:"url"`
	Image      string            `json:"image"`
	User       pexelsVideoUser   `json:"user"`
	VideoFiles []pexelsVideoFile `json:"video_files"`
}

type pexelsVideoUser struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type pexelsVideoFile struct {
	Quality  string `json:"quality"`
	FileType string `json:"file_type"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	Link     string `json:"link"`
}

type pixabaySearchResponse struct {
	Total     int          `json:"total"`
	TotalHits int          `json:"totalHits"`
	Hits      []pixabayHit `json:"hits"`
}

type pixabayHit struct {
	ID            int                    `json:"id"`
	PageURL       string                 `json:"pageURL"`
	Type          string                 `json:"type"`
	Tags          string                 `json:"tags"`
	PreviewURL    string                 `json:"previewURL"`
	WebformatURL  string                 `json:"webformatURL"`
	LargeImageURL string                 `json:"largeImageURL"`
	ImageWidth    int                    `json:"imageWidth"`
	ImageHeight   int                    `json:"imageHeight"`
	Duration      int                    `json:"duration"`
	PictureID     string                 `json:"picture_id"`
	User          string                 `json:"user"`
	Videos        map[string]pixabayFile `json:"videos"`
	UserImageURL  string                 `json:"userImageURL"`
	UserID        int                    `json:"user_id"`
}

type pixabayFile struct {
	URL       string `json:"url"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Size      int    `json:"size"`
	Thumbnail string `json:"thumbnail"`
}

func (s *Service) searchPexels(ctx context.Context, config map[string]string, input SearchInput) (SearchResult, error) {
	apiKey := strings.TrimSpace(config["api_key"])
	if apiKey == "" {
		return SearchResult{}, ErrInvalidConfig
	}
	mediaType := strings.TrimSpace(input.MediaType)
	if mediaType == "" || mediaType == "all" {
		mediaType = "image"
	}
	page := normalizeSearchPage(input.Page)
	pageSize := normalizeSearchPageSize(input.PageSize)
	endpointPath := "/v1/search"
	if mediaType == "video" {
		endpointPath = "/videos/search"
	} else if mediaType != "image" {
		return SearchResult{}, ErrInvalidQuery
	}
	values := url.Values{}
	values.Set("query", strings.TrimSpace(input.Query))
	values.Set("page", strconv.Itoa(page))
	values.Set("per_page", strconv.Itoa(pageSize))
	if orientation := strings.TrimSpace(input.Orientation); orientation != "" && orientation != "all" {
		values.Set("orientation", orientation)
	}
	endpoint := "https://api.pexels.com" + endpointPath + "?" + values.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return SearchResult{}, err
	}
	req.Header.Set("Authorization", apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return SearchResult{}, fmt.Errorf("%w: %v", ErrProviderFailed, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return SearchResult{}, providerHTTPError("pexels", resp)
	}
	if mediaType == "video" {
		var decoded pexelsVideoSearchResponse
		if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
			return SearchResult{}, err
		}
		items := make([]ExternalResourceItem, 0, len(decoded.Videos))
		for _, video := range decoded.Videos {
			items = append(items, pexelsVideoItem(video))
		}
		return SearchResult{Items: items, Total: decoded.TotalResults, Page: page, PageSize: pageSize, Provider: ProviderPexels, NextPage: decoded.NextPage}, nil
	}
	var decoded pexelsPhotoSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return SearchResult{}, err
	}
	items := make([]ExternalResourceItem, 0, len(decoded.Photos))
	for _, photo := range decoded.Photos {
		items = append(items, pexelsPhotoItem(photo))
	}
	return SearchResult{Items: items, Total: decoded.TotalResults, Page: page, PageSize: pageSize, Provider: ProviderPexels, NextPage: decoded.NextPage}, nil
}

func (s *Service) searchPixabay(ctx context.Context, config map[string]string, input SearchInput) (SearchResult, error) {
	apiKey := strings.TrimSpace(config["api_key"])
	if apiKey == "" {
		return SearchResult{}, ErrInvalidConfig
	}
	mediaType := strings.TrimSpace(input.MediaType)
	if mediaType == "" || mediaType == "all" {
		mediaType = "image"
	}
	if mediaType != "image" && mediaType != "video" {
		return SearchResult{}, ErrInvalidQuery
	}
	page := normalizeSearchPage(input.Page)
	pageSize := normalizeSearchPageSize(input.PageSize)
	values := url.Values{}
	values.Set("key", apiKey)
	values.Set("q", strings.TrimSpace(input.Query))
	values.Set("page", strconv.Itoa(page))
	values.Set("per_page", strconv.Itoa(pageSize))
	values.Set("safesearch", "true")
	if pixabayLang := pixabaySearchLanguage(input.Query); pixabayLang != "" {
		values.Set("lang", pixabayLang)
	}
	if mediaType == "image" {
		values.Set("image_type", "photo")
		if orientation := pixabayOrientation(input.Orientation); orientation != "" {
			values.Set("orientation", orientation)
		}
	} else {
		values.Set("video_type", "all")
	}
	endpointPath := ""
	if mediaType == "video" {
		endpointPath = "videos/"
	}
	endpoint := "https://pixabay.com/api/" + endpointPath + "?" + values.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return SearchResult{}, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return SearchResult{}, fmt.Errorf("%w: %v", ErrProviderFailed, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return SearchResult{}, providerHTTPError("pixabay", resp)
	}
	var decoded pixabaySearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return SearchResult{}, err
	}
	items := make([]ExternalResourceItem, 0, len(decoded.Hits))
	for _, hit := range decoded.Hits {
		if mediaType == "video" {
			items = append(items, pixabayVideoItem(hit))
		} else {
			items = append(items, pixabayImageItem(hit))
		}
	}
	return SearchResult{Items: items, Total: decoded.TotalHits, Page: page, PageSize: pageSize, Provider: ProviderPixabay}, nil
}

func pixabayOrientation(orientation string) string {
	switch strings.TrimSpace(orientation) {
	case "landscape":
		return "horizontal"
	case "portrait":
		return "vertical"
	default:
		return ""
	}
}

func pixabaySearchLanguage(query string) string {
	for _, r := range query {
		if r >= '\u4E00' && r <= '\u9FFF' {
			return "zh"
		}
	}
	return ""
}

func providerHTTPError(provider string, resp *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	message := strings.TrimSpace(string(body))
	if message == "" {
		return fmt.Errorf("%w: %s http %d", ErrProviderFailed, provider, resp.StatusCode)
	}
	return fmt.Errorf("%w: %s http %d: %s", ErrProviderFailed, provider, resp.StatusCode, message)
}

func pexelsPhotoItem(photo pexelsPhoto) ExternalResourceItem {
	preview := firstNonEmpty(photo.Src["large"], photo.Src["medium"], photo.Src["original"])
	thumb := firstNonEmpty(photo.Src["medium"], photo.Src["small"], photo.Src["tiny"], preview)
	return ExternalResourceItem{
		ProviderKey:     ProviderPexels,
		ExternalID:      strconv.Itoa(photo.ID),
		MediaType:       "image",
		Title:           firstNonEmpty(photo.Alt, "Pexels photo "+strconv.Itoa(photo.ID)),
		Description:     photo.Alt,
		ThumbnailURL:    thumb,
		PreviewURL:      preview,
		SourceURL:       photo.URL,
		Width:           photo.Width,
		Height:          photo.Height,
		AuthorName:      photo.Photographer,
		AuthorURL:       photo.PhotographerURL,
		AttributionText: attribution("Photo", photo.Photographer),
		LicenseLabel:    "Pexels",
	}
}

func pexelsVideoItem(video pexelsVideo) ExternalResourceItem {
	preview := bestVideoLink(video.VideoFiles)
	return ExternalResourceItem{
		ProviderKey:     ProviderPexels,
		ExternalID:      strconv.Itoa(video.ID),
		MediaType:       "video",
		Title:           "Pexels video " + strconv.Itoa(video.ID),
		ThumbnailURL:    video.Image,
		PreviewURL:      preview,
		SourceURL:       video.URL,
		Width:           video.Width,
		Height:          video.Height,
		DurationSeconds: video.Duration,
		AuthorName:      video.User.Name,
		AuthorURL:       video.User.URL,
		AttributionText: attribution("Video", video.User.Name),
		LicenseLabel:    "Pexels",
	}
}

func pixabayImageItem(hit pixabayHit) ExternalResourceItem {
	preview := firstNonEmpty(hit.LargeImageURL, hit.WebformatURL, hit.PreviewURL)
	thumb := firstNonEmpty(hit.WebformatURL, hit.PreviewURL, preview)
	return ExternalResourceItem{
		ProviderKey:     ProviderPixabay,
		ExternalID:      strconv.Itoa(hit.ID),
		MediaType:       "image",
		Title:           firstNonEmpty(hit.Tags, "Pixabay image "+strconv.Itoa(hit.ID)),
		Description:     hit.Tags,
		ThumbnailURL:    thumb,
		PreviewURL:      preview,
		SourceURL:       hit.PageURL,
		Width:           hit.ImageWidth,
		Height:          hit.ImageHeight,
		AuthorName:      hit.User,
		AuthorURL:       pixabayAuthorURL(hit.User, hit.UserID),
		AttributionText: pixabayAttribution("Image", hit.User),
		LicenseLabel:    "Pixabay Content License",
	}
}

func pixabayVideoItem(hit pixabayHit) ExternalResourceItem {
	file := bestPixabayVideo(hit.Videos)
	thumb := firstNonEmpty(file.Thumbnail, pixabayThumbnailURL(hit.PictureID))
	return ExternalResourceItem{
		ProviderKey:     ProviderPixabay,
		ExternalID:      strconv.Itoa(hit.ID),
		MediaType:       "video",
		Title:           firstNonEmpty(hit.Tags, "Pixabay video "+strconv.Itoa(hit.ID)),
		Description:     hit.Tags,
		ThumbnailURL:    thumb,
		PreviewURL:      file.URL,
		SourceURL:       hit.PageURL,
		Width:           file.Width,
		Height:          file.Height,
		DurationSeconds: hit.Duration,
		AuthorName:      hit.User,
		AuthorURL:       pixabayAuthorURL(hit.User, hit.UserID),
		AttributionText: pixabayAttribution("Video", hit.User),
		LicenseLabel:    "Pixabay Content License",
	}
}

func bestVideoLink(files []pexelsVideoFile) string {
	for _, file := range files {
		if strings.HasPrefix(file.FileType, "video/") && file.Quality == "sd" && file.Link != "" {
			return file.Link
		}
	}
	for _, file := range files {
		if strings.HasPrefix(file.FileType, "video/") && file.Link != "" {
			return file.Link
		}
	}
	return ""
}

func bestPixabayVideo(files map[string]pixabayFile) pixabayFile {
	for _, key := range []string{"medium", "small", "large", "tiny"} {
		if file, ok := files[key]; ok && file.URL != "" {
			return file
		}
	}
	for _, file := range files {
		if file.URL != "" {
			return file
		}
	}
	return pixabayFile{}
}

func pixabayThumbnailURL(pictureID string) string {
	if strings.TrimSpace(pictureID) == "" {
		return ""
	}
	return "https://i.vimeocdn.com/video/" + pictureID + "_640x360.jpg"
}

func pixabayAuthorURL(author string, userID int) string {
	author = strings.TrimSpace(author)
	if author == "" || userID <= 0 {
		return ""
	}
	return "https://pixabay.com/users/" + url.PathEscape(author) + "-" + strconv.Itoa(userID) + "/"
}

func attribution(kind string, author string) string {
	author = strings.TrimSpace(author)
	if author == "" {
		return kind + " from Pexels"
	}
	return kind + " by " + author + " on Pexels"
}

func pixabayAttribution(kind string, author string) string {
	author = strings.TrimSpace(author)
	if author == "" {
		return kind + " from Pixabay"
	}
	return kind + " by " + author + " on Pixabay"
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

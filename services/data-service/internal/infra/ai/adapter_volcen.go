package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/movscript/movscript/internal/domain/media"
	"github.com/volcengine/volcengine-go-sdk/service/arkruntime"
	arkmodel "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
)

// VolcenAdapter implements Provider for the Volcengine Ark platform,
// covering text (doubao), image (Seedream), and async video (Seedance).
type VolcenAdapter struct {
	baseURL    string
	apiKey     string
	speech     volcenSpeechCredentials
	client     *arkruntime.Client
	rawHTTP    *http.Client
	speechHTTP *http.Client
}

const volcenTextMaxTokensLimit = 131072
const volcenHTTPTimeout = 10 * time.Minute
const volcenDefaultSpeechBaseURL = "https://openspeech.bytedance.com"
const volcenRealtimeDialogueResourceID = "volc.speech.dialog"
const volcenRealtimeDialogueAppKey = "PlgvMymc7f3tQnJ6"

const (
	volcenRealtimeEventStartConnection  = 1
	volcenRealtimeEventFinishConnection = 2
	volcenRealtimeEventStartSession     = 100
	volcenRealtimeEventFinishSession    = 102
	volcenRealtimeEventTaskRequest      = 200
	volcenRealtimeEventEndASR           = 400
	volcenRealtimeEventChatTextQuery    = 501

	volcenRealtimeEventConnectionStarted = 50
	volcenRealtimeEventConnectionFailed  = 51
	volcenRealtimeEventSessionStarted    = 150
	volcenRealtimeEventSessionFailed     = 153
	volcenRealtimeEventTTSResponse       = 352
	volcenRealtimeEventTTSEnded          = 359
	volcenRealtimeEventASRResponse       = 451
	volcenRealtimeEventASREnded          = 459
	volcenRealtimeEventChatResponse      = 550
	volcenRealtimeEventChatEnded         = 559
	volcenRealtimeEventDialogError       = 599
)

const (
	volcenRoleReferenceImage = "reference_image"
	volcenRoleReferenceVideo = "reference_video"
	volcenRoleReferenceAudio = "reference_audio"
)

type volcenSpeechCredentials struct {
	AppID   string `json:"speech_app_id,omitempty"`
	Token   string `json:"speech_token,omitempty"`
	Cluster string `json:"speech_cluster,omitempty"`
	BaseURL string `json:"speech_base_url,omitempty"`
}

func NewVolcenAdapter(baseURL, apiKey string) *VolcenAdapter {
	return NewVolcenAdapterWithSpeech(baseURL, apiKey, volcenSpeechCredentials{})
}

func NewVolcenAdapterWithSpeech(baseURL, apiKey string, speech volcenSpeechCredentials) *VolcenAdapter {
	if baseURL == "" {
		baseURL = "https://ark.cn-beijing.volces.com/api/v3"
	}
	httpClient := debugHTTPClient(apiKey, volcenHTTPTimeout)
	c := arkruntime.NewClientWithApiKey(apiKey,
		arkruntime.WithBaseUrl(baseURL),
		arkruntime.WithHTTPClient(httpClient),
	)
	if speech.Cluster == "" {
		speech.Cluster = "volcano_tts"
	}
	if speech.BaseURL == "" {
		speech.BaseURL = volcenDefaultSpeechBaseURL
	}
	return &VolcenAdapter{baseURL: baseURL, apiKey: apiKey, speech: speech, client: c, rawHTTP: httpClient, speechHTTP: debugHTTPClient(speech.Token, volcenHTTPTimeout)}
}

func (a *VolcenAdapter) TextGenerate(ctx context.Context, req TextRequest) (TextResponse, error) {
	attachTextPromptDebug(ctx, req)
	arkReq := buildVolcenChatRequest(req)

	resp, err := a.client.CreateChatCompletion(ctx, arkReq)
	if err != nil {
		return TextResponse{}, fmt.Errorf("volcen text: %w", err)
	}
	if len(resp.Choices) == 0 {
		return TextResponse{}, fmt.Errorf("volcen text: no choices in response")
	}
	choice := resp.Choices[0]
	text := ""
	if c := choice.Message.Content; c != nil && c.StringValue != nil {
		text = *c.StringValue
	}
	toolCalls := convertVolcenToolCalls(choice.Message.ToolCalls)
	// Fallback: some Doubao models embed tool calls in content as <|FunctionCallBegin|>...<|FunctionCallEnd|>
	if len(toolCalls) == 0 && text != "" {
		if parsed, remaining := parseVolcenFunctionCallContent(text); len(parsed) > 0 {
			toolCalls = parsed
			text = remaining
		}
	}
	return TextResponse{
		Content:      text,
		ToolCalls:    toolCalls,
		FinishReason: string(choice.FinishReason),
		Usage: TokenUsage{
			InputTokens:  resp.Usage.PromptTokens,
			OutputTokens: resp.Usage.CompletionTokens,
		},
		Debug: takeDebug(ctx),
	}, nil
}

func (a *VolcenAdapter) TextStream(ctx context.Context, req TextRequest) (<-chan TextStreamEvent, error) {
	attachTextPromptDebug(ctx, req)
	arkReq := buildVolcenChatRequest(req)
	arkReq.StreamOptions = &arkmodel.StreamOptions{IncludeUsage: true}

	stream, err := a.client.CreateChatCompletionStream(ctx, arkReq)
	if err != nil {
		return nil, fmt.Errorf("volcen text stream: %w", err)
	}

	out := make(chan TextStreamEvent)
	go func() {
		defer close(out)
		defer stream.Close()
		for {
			resp, err := stream.Recv()
			if err == io.EOF {
				out <- TextStreamEvent{Done: true}
				return
			}
			if err != nil {
				out <- TextStreamEvent{Error: fmt.Sprintf("volcen text stream receive: %v", err)}
				return
			}
			event := TextStreamEvent{}
			if len(resp.Choices) > 0 && resp.Choices[0] != nil {
				choice := resp.Choices[0]
				event.Role = choice.Delta.Role
				event.ContentDelta = choice.Delta.Content
				if choice.Delta.ReasoningContent != nil {
					event.ReasoningDelta = *choice.Delta.ReasoningContent
				}
				if len(choice.Delta.ToolCalls) > 0 {
					deltas := make([]ToolCallDelta, 0, len(choice.Delta.ToolCalls))
					for _, tc := range choice.Delta.ToolCalls {
						d := ToolCallDelta{
							ID:   tc.ID,
							Type: string(tc.Type),
							Function: ToolFunction{
								Name:      tc.Function.Name,
								Arguments: tc.Function.Arguments,
							},
						}
						if tc.Index != nil {
							d.Index = *tc.Index
						}
						deltas = append(deltas, d)
					}
					event.ToolCallDeltas = deltas
				}
				if choice.FinishReason != "" {
					event.FinishReason = string(choice.FinishReason)
				}
			}
			if resp.Usage != nil {
				event.Usage = TokenUsage{
					InputTokens:  resp.Usage.PromptTokens,
					OutputTokens: resp.Usage.CompletionTokens,
				}
			}
			out <- event
		}
	}()
	return out, nil
}

func (a *VolcenAdapter) Synthesize(ctx context.Context, req media.TTSRequest) (media.TTSResponse, error) {
	token := strings.TrimSpace(a.speech.Token)
	if token == "" {
		return media.TTSResponse{}, fmt.Errorf("volcen speech_token is required for text-to-speech")
	}
	text := strings.TrimSpace(req.Text)
	if text == "" {
		return media.TTSResponse{}, fmt.Errorf("text is required")
	}
	if volcenUseTTSV3(req) {
		return a.synthesizeV3(ctx, req, text, token)
	}
	voice := firstNonEmptyAI(strings.TrimSpace(req.Voice), stringParam(req.Params, "speaker", ""), stringParam(req.Params, "voice_type", "zh_female_vv_jupiter_bigtts"))
	audioFormat := volcenTTSAudioFormat(req)
	reqID := firstNonEmptyAI(stringParam(req.Params, "reqid", ""), fmt.Sprintf("movscript-%d", time.Now().UnixNano()))
	body := map[string]any{
		"app": map[string]any{
			"appid":   a.speech.AppID,
			"token":   token,
			"cluster": firstNonEmptyAI(stringParam(req.Params, "cluster", ""), a.speech.Cluster, "volcano_tts"),
		},
		"user": map[string]any{
			"uid": stringParam(req.Params, "uid", "movscript"),
		},
		"audio": map[string]any{
			"voice_type":  voice,
			"encoding":    audioFormat,
			"speed_ratio": numberParamOrDefault(req.Params, "speed_ratio", 1),
		},
		"request": map[string]any{
			"reqid":     reqID,
			"text":      text,
			"operation": stringParam(req.Params, "operation", "submit"),
		},
	}
	audio := body["audio"].(map[string]any)
	if sampleRate := intParamOrDefault(req.Params, "sample_rate", 0); sampleRate > 0 {
		audio["sample_rate"] = sampleRate
	}
	if speechRate := intParamOrDefault(req.Params, "speech_rate", 0); speechRate != 0 {
		audio["speech_rate"] = speechRate
	}
	if loudnessRate := intParamOrDefault(req.Params, "loudness_rate", 0); loudnessRate != 0 {
		audio["loudness_rate"] = loudnessRate
	}
	if emotion := stringParam(req.Params, "emotion", ""); emotion != "" {
		audio["emotion"] = emotion
	}
	if volume := numberParamOrDefault(req.Params, "volume_ratio", 0); volume != 0 {
		audio["volume_ratio"] = volume
	}
	if pitch := numberParamOrDefault(req.Params, "pitch_ratio", 0); pitch != 0 {
		audio["pitch_ratio"] = pitch
	}
	if req.Language != "" {
		audio["language"] = req.Language
	} else if language := stringParam(req.Params, "language", ""); language != "" {
		audio["language"] = language
	}
	requestBody := body["request"].(map[string]any)
	if model := strings.TrimSpace(req.Model); model != "" {
		requestBody["model"] = model
	}
	if textType := stringParam(req.Params, "text_type", ""); textType != "" {
		requestBody["text_type"] = textType
	}
	if extraParam, ok := req.Params["extra_param"]; ok {
		requestBody["extra_param"] = extraParam
	}

	rawBody, _ := json.Marshal(body)
	endpoint := strings.TrimRight(firstNonEmptyAI(a.speech.BaseURL, volcenDefaultSpeechBaseURL), "/") + "/api/v1/tts"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(rawBody))
	if err != nil {
		return media.TTSResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer; "+token)
	httpReq.Header.Set("Content-Type", "application/json")
	reqHeaders := map[string]string{
		"Authorization": "Bearer; " + maskKey(token),
		"Content-Type":  "application/json",
	}
	client := a.speechHTTP
	if client == nil {
		client = a.rawHTTP
	}
	start := time.Now()
	resp, err := client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: endpoint, Method: "POST",
			RequestHeaders: reqHeaders, RequestBody: mustJSON(redactVolcenTTSBody(body)), LatencyMs: latency, Error: err.Error(),
		})
		return media.TTSResponse{}, err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return media.TTSResponse{}, readErr
	}
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, ModelID: req.Model, Endpoint: endpoint, Method: "POST",
		RequestHeaders: reqHeaders, RequestBody: mustJSON(redactVolcenTTSBody(body)),
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		return media.TTSResponse{}, fmt.Errorf("volcen TTS HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	var parsed volcenTTSResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return media.TTSResponse{}, fmt.Errorf("decode volcen TTS response: %w", err)
	}
	if parsed.Code != 0 && parsed.Code != 3000 {
		return media.TTSResponse{}, fmt.Errorf("volcen TTS error %d: %s", parsed.Code, parsed.Message)
	}
	audioData := strings.TrimSpace(parsed.Data)
	if idx := strings.Index(audioData, ","); strings.HasPrefix(audioData, "data:") && idx >= 0 {
		audioData = audioData[idx+1:]
	}
	audioBytes, err := base64.StdEncoding.DecodeString(audioData)
	if err != nil {
		return media.TTSResponse{}, fmt.Errorf("decode volcen TTS audio: %w", err)
	}
	if len(audioBytes) == 0 {
		return media.TTSResponse{}, fmt.Errorf("volcen TTS returned empty audio")
	}
	return media.TTSResponse{
		Audio:       audioBytes,
		MimeType:    mimeTypeForVolcenTTSAudioFormat(audioFormat),
		DurationMs:  parsed.DurationMs,
		ProviderRef: firstNonEmptyAI(parsed.ReqID, reqID),
	}, nil
}

func (a *VolcenAdapter) Transcribe(ctx context.Context, req media.TranscribeRequest) (media.SubtitleResponse, error) {
	if len(req.Audio) == 0 {
		return media.SubtitleResponse{}, fmt.Errorf("audio is required")
	}
	appID := strings.TrimSpace(a.speech.AppID)
	token := strings.TrimSpace(a.speech.Token)
	if appID == "" {
		return media.SubtitleResponse{}, fmt.Errorf("volcen speech_app_id is required for speech-to-text")
	}
	if token == "" {
		return media.SubtitleResponse{}, fmt.Errorf("volcen speech_token is required for speech-to-text")
	}
	resourceID := firstNonEmptyAI(strings.TrimSpace(req.Model), stringParam(req.Params, "resource_id", ""), "volc.seedasr.auc")
	requestID := firstNonEmptyAI(stringParam(req.Params, "request_id", ""), fmt.Sprintf("movscript-%d", time.Now().UnixNano()))
	format := volcenASRAudioFormat(req.MimeType, req.Params)
	submitBody := map[string]any{
		"user": map[string]any{
			"uid": stringParam(req.Params, "uid", "movscript"),
		},
		"audio": map[string]any{
			"data":   base64.StdEncoding.EncodeToString(req.Audio),
			"format": format,
		},
		"request": map[string]any{
			"model_name":          stringParam(req.Params, "model_name", "bigmodel"),
			"enable_itn":          boolParamOrDefault(req.Params, "enable_itn", true),
			"enable_punc":         boolParamOrDefault(req.Params, "enable_punc", true),
			"show_utterances":     boolParamOrDefault(req.Params, "show_utterances", true),
			"enable_speaker_info": boolParamOrDefault(req.Params, "enable_speaker_info", false),
		},
	}
	if language := strings.TrimSpace(req.Language); language != "" {
		submitBody["audio"].(map[string]any)["language"] = language
	} else if language := stringParam(req.Params, "language", ""); language != "" {
		submitBody["audio"].(map[string]any)["language"] = language
	}
	if hotwords, ok := req.Params["hotwords"]; ok {
		submitBody["request"].(map[string]any)["hotwords"] = hotwords
	}
	endpointBase := strings.TrimRight(firstNonEmptyAI(a.speech.BaseURL, volcenDefaultSpeechBaseURL), "/")
	submitEndpoint := endpointBase + "/api/v3/auc/bigmodel/submit"
	if err := a.postVolcenASR(ctx, submitEndpoint, appID, token, resourceID, requestID, submitBody, "submit"); err != nil {
		return media.SubtitleResponse{}, err
	}
	queryEndpoint := endpointBase + "/api/v3/auc/bigmodel/query"
	raw, err := a.pollVolcenASR(ctx, queryEndpoint, appID, token, resourceID, requestID, req.Params)
	if err != nil {
		return media.SubtitleResponse{}, err
	}
	timing, transcript := parseVolcenASRResult(raw, req.Language)
	content, _ := json.Marshal(raw)
	if transcript != "" {
		content = []byte(transcript)
	}
	return media.SubtitleResponse{
		Timing:      timing,
		Format:      "json",
		Content:     content,
		MimeType:    "application/json",
		ProviderRef: requestID,
	}, nil
}

func (a *VolcenAdapter) Align(ctx context.Context, req media.AlignRequest) (media.SubtitleResponse, error) {
	return a.Transcribe(ctx, media.TranscribeRequest{
		AudioResourceID: req.AudioResourceID,
		Audio:           req.Audio,
		MimeType:        req.MimeType,
		Language:        req.Language,
		Model:           req.Model,
		Params:          req.Params,
	})
}

func (a *VolcenAdapter) GenerateSpeechToSpeech(ctx context.Context, req media.SpeechToSpeechRequest) (media.SpeechToSpeechResponse, error) {
	appID := strings.TrimSpace(a.speech.AppID)
	token := strings.TrimSpace(a.speech.Token)
	if appID == "" {
		return media.SpeechToSpeechResponse{}, fmt.Errorf("volcen speech_app_id is required for realtime voice")
	}
	if token == "" {
		return media.SpeechToSpeechResponse{}, fmt.Errorf("volcen speech_token is required for realtime voice")
	}
	endpoint := volcenRealtimeDialogueURL(a.speech.BaseURL, req.Params)
	resourceID := firstNonEmptyAI(stringParam(req.Params, "resource_id", ""), volcenRealtimeDialogueResourceID)
	connectID := firstNonEmptyAI(stringParam(req.Params, "connect_id", ""), fmt.Sprintf("movscript-%d", time.Now().UnixNano()))
	sessionID := firstNonEmptyAI(stringParam(req.Params, "session_id", ""), fmt.Sprintf("session-%d", time.Now().UnixNano()))
	headers := http.Header{}
	headers.Set("X-Api-App-ID", appID)
	headers.Set("X-Api-Access-Key", token)
	headers.Set("X-Api-Resource-Id", resourceID)
	headers.Set("X-Api-App-Key", stringParam(req.Params, "app_key", volcenRealtimeDialogueAppKey))
	headers.Set("X-Api-Connect-Id", connectID)
	debugHeaders := map[string]string{
		"X-Api-App-ID":      maskKey(appID),
		"X-Api-Access-Key":  maskKey(token),
		"X-Api-Resource-Id": resourceID,
		"X-Api-App-Key":     headers.Get("X-Api-App-Key"),
		"X-Api-Connect-Id":  connectID,
	}

	start := time.Now()
	conn, resp, err := websocket.DefaultDialer.DialContext(ctx, endpoint, headers)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: endpoint, Method: "WEBSOCKET",
			RequestHeaders: debugHeaders, ResponseStatus: status, LatencyMs: latency, Error: err.Error(),
		})
		return media.SpeechToSpeechResponse{}, fmt.Errorf("volcen realtime voice dial: %w", err)
	}
	defer conn.Close()
	recordDebug(ctx, DebugCallResult{
		Success: true, ModelID: req.Model, Endpoint: endpoint, Method: "WEBSOCKET",
		RequestHeaders: debugHeaders, ResponseStatus: http.StatusSwitchingProtocols, LatencyMs: latency,
	})

	if err := conn.WriteMessage(websocket.BinaryMessage, volcenRealtimeJSONFrame(volcenRealtimeEventStartConnection, "", map[string]any{})); err != nil {
		return media.SpeechToSpeechResponse{}, err
	}
	if err := volcenRealtimeWaitForEvent(ctx, conn, volcenRealtimeEventConnectionStarted, volcenRealtimeEventConnectionFailed); err != nil {
		return media.SpeechToSpeechResponse{}, err
	}
	config := volcenRealtimeDialogueConfig(req)
	if err := conn.WriteMessage(websocket.BinaryMessage, volcenRealtimeJSONFrame(volcenRealtimeEventStartSession, sessionID, config)); err != nil {
		return media.SpeechToSpeechResponse{}, err
	}
	if err := volcenRealtimeWaitForEvent(ctx, conn, volcenRealtimeEventSessionStarted, volcenRealtimeEventSessionFailed); err != nil {
		return media.SpeechToSpeechResponse{}, err
	}

	if len(req.Audio) > 0 {
		if err := conn.WriteMessage(websocket.BinaryMessage, volcenRealtimeAudioFrame(sessionID, req.Audio)); err != nil {
			return media.SpeechToSpeechResponse{}, err
		}
		if boolParamOrDefault(req.Params, "end_asr", true) {
			if err := conn.WriteMessage(websocket.BinaryMessage, volcenRealtimeJSONFrame(volcenRealtimeEventEndASR, sessionID, map[string]any{})); err != nil {
				return media.SpeechToSpeechResponse{}, err
			}
		}
	} else if strings.TrimSpace(req.Prompt) != "" {
		query := map[string]any{"content": strings.TrimSpace(req.Prompt)}
		if err := conn.WriteMessage(websocket.BinaryMessage, volcenRealtimeJSONFrame(volcenRealtimeEventChatTextQuery, sessionID, query)); err != nil {
			return media.SpeechToSpeechResponse{}, err
		}
	} else {
		return media.SpeechToSpeechResponse{}, fmt.Errorf("audio or prompt is required")
	}

	audio, text, providerRef, err := volcenRealtimeReadSpeechToSpeech(ctx, conn, sessionID, req.Params)
	if err != nil {
		return media.SpeechToSpeechResponse{}, err
	}
	_ = conn.WriteMessage(websocket.BinaryMessage, volcenRealtimeJSONFrame(volcenRealtimeEventFinishSession, sessionID, map[string]any{}))
	_ = conn.WriteMessage(websocket.BinaryMessage, volcenRealtimeJSONFrame(volcenRealtimeEventFinishConnection, "", map[string]any{}))
	if len(audio) == 0 && strings.TrimSpace(text) == "" {
		return media.SpeechToSpeechResponse{}, fmt.Errorf("volcen realtime voice returned empty response")
	}
	format := stringParam(req.Params, "output_audio_format", "")
	if format == "" {
		format = stringParam(req.Params, "tts_audio_format", "ogg")
	}
	return media.SpeechToSpeechResponse{
		Audio:       audio,
		Text:        text,
		MimeType:    mimeTypeForVolcenRealtimeAudio(format),
		ProviderRef: firstNonEmptyAI(providerRef, sessionID),
	}, nil
}

func (a *VolcenAdapter) CloneVoice(ctx context.Context, req media.VoiceCloneRequest) (media.VoiceProfileResponse, error) {
	appID := strings.TrimSpace(a.speech.AppID)
	token := strings.TrimSpace(a.speech.Token)
	if appID == "" {
		return media.VoiceProfileResponse{}, fmt.Errorf("volcen speech_app_id is required for voice clone")
	}
	if token == "" {
		return media.VoiceProfileResponse{}, fmt.Errorf("volcen speech_token is required for voice clone")
	}
	if len(req.Samples) == 0 {
		return media.VoiceProfileResponse{}, fmt.Errorf("at least one voice sample is required")
	}
	speakerID := firstNonEmptyAI(stringParam(req.Params, "speaker_id", ""), volcenGeneratedSpeakerID(req.Name))
	audios := make([]map[string]any, 0, len(req.Samples))
	for _, sample := range req.Samples {
		if len(sample.Audio) == 0 {
			continue
		}
		format := strings.TrimPrefix(extFromAudioMime(sample.MimeType), ".")
		if format == "" {
			format = stringParam(req.Params, "audio_format", "wav")
		}
		audios = append(audios, map[string]any{
			"audio_bytes":  base64.StdEncoding.EncodeToString(sample.Audio),
			"audio_format": format,
		})
	}
	if len(audios) == 0 {
		return media.VoiceProfileResponse{}, fmt.Errorf("at least one non-empty voice sample is required")
	}
	resourceID := firstNonEmptyAI(stringParam(req.Params, "resource_id", ""), "seed-icl-2.0")
	modelType := intParamOrDefault(req.Params, "model_type", 4)
	body := map[string]any{
		"appid":      appID,
		"speaker_id": speakerID,
		"audios":     audios,
		"source":     intParamOrDefault(req.Params, "source", 2),
		"language":   intParamOrDefault(req.Params, "language", 0),
		"model_type": modelType,
	}
	if strings.TrimSpace(req.Description) != "" {
		body["description"] = strings.TrimSpace(req.Description)
	}
	if displayName := strings.TrimSpace(req.Name); displayName != "" {
		body["speaker_name"] = displayName
	}
	endpointBase := strings.TrimRight(firstNonEmptyAI(a.speech.BaseURL, volcenDefaultSpeechBaseURL), "/")
	uploadEndpoint := endpointBase + "/api/v1/mega_tts/audio/upload"
	raw, err := a.postVolcenVoiceClone(ctx, uploadEndpoint, token, resourceID, body, "upload")
	if err != nil {
		return media.VoiceProfileResponse{}, err
	}
	profile := parseVolcenVoiceCloneProfile(raw, speakerID, req)
	if boolParamOrDefault(req.Params, "wait_for_ready", false) {
		statusEndpoint := endpointBase + "/api/v1/mega_tts/status"
		statusRaw, err := a.pollVolcenVoiceCloneStatus(ctx, statusEndpoint, appID, token, resourceID, speakerID, req.Params)
		if err != nil {
			return media.VoiceProfileResponse{}, err
		}
		profile = parseVolcenVoiceCloneProfile(statusRaw, speakerID, req)
	}
	return profile, nil
}

func (a *VolcenAdapter) DesignVoice(ctx context.Context, req media.VoiceDesignRequest) (media.VoiceProfileResponse, error) {
	token := strings.TrimSpace(a.speech.Token)
	if token == "" {
		return media.VoiceProfileResponse{}, fmt.Errorf("volcen speech_token is required for voice design")
	}
	description := strings.TrimSpace(req.Description)
	if description == "" {
		return media.VoiceProfileResponse{}, fmt.Errorf("voice description is required")
	}
	resourceID := firstNonEmptyAI(stringParam(req.Params, "resource_id", ""), strings.TrimSpace(req.Model), "doubao-seed-voice-design")
	requestID := firstNonEmptyAI(stringParam(req.Params, "request_id", ""), stringParam(req.Params, "reqid", ""), fmt.Sprintf("movscript-%d", time.Now().UnixNano()))
	prompt := map[string]any{"text_prompt": description}
	imagePrompt := map[string]any{}
	if imageBytes := strings.TrimSpace(stringParam(req.Params, "image_bytes", "")); imageBytes != "" {
		imagePrompt["image_bytes"] = imageBytes
	}
	if imageURL := strings.TrimSpace(stringParam(req.Params, "image_url", "")); imageURL != "" {
		imagePrompt["image_url"] = imageURL
	}
	if len(imagePrompt) > 0 {
		prompt["image_prompt"] = imagePrompt
	}
	body := map[string]any{
		"prompt": prompt,
	}
	if previewText := strings.TrimSpace(req.PreviewText); previewText != "" {
		body["preview_text"] = previewText
	} else if previewText := strings.TrimSpace(stringParam(req.Params, "preview_text", "")); previewText != "" {
		body["preview_text"] = previewText
	}
	if speakerID := strings.TrimSpace(stringParam(req.Params, "speaker_id", "")); speakerID != "" {
		body["speaker_id"] = speakerID
	}
	if displayName := strings.TrimSpace(req.Name); displayName != "" {
		body["speaker_name"] = displayName
	}
	if language := intParamOrDefault(req.Params, "language", -1); language >= 0 {
		body["language"] = language
	}
	if sampleRate := intParamOrDefault(req.Params, "sample_rate", 0); sampleRate > 0 {
		body["sample_rate"] = sampleRate
	}
	endpoint := strings.TrimSpace(stringParam(req.Params, "endpoint", ""))
	if endpoint == "" {
		endpoint = strings.TrimRight(firstNonEmptyAI(a.speech.BaseURL, volcenDefaultSpeechBaseURL), "/") + "/api/v3/tts/voice_design"
	}
	raw, err := a.postVolcenVoiceDesign(ctx, endpoint, token, resourceID, requestID, body)
	if err != nil {
		return media.VoiceProfileResponse{}, err
	}
	return parseVolcenVoiceDesignProfile(raw, req), nil
}

func (a *VolcenAdapter) postVolcenVoiceDesign(ctx context.Context, endpoint, token, resourceID, requestID string, body map[string]any) (map[string]any, error) {
	rawBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(rawBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Api-Key", token)
	httpReq.Header.Set("X-Api-Resource-Id", resourceID)
	httpReq.Header.Set("X-Api-Request-Id", requestID)
	headers := map[string]string{
		"Content-Type":      "application/json",
		"X-Api-Key":         maskKey(token),
		"X-Api-Resource-Id": resourceID,
		"X-Api-Request-Id":  requestID,
	}
	client := a.speechHTTP
	if client == nil {
		client = a.rawHTTP
	}
	start := time.Now()
	resp, err := client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: resourceID, Endpoint: endpoint, Method: http.MethodPost,
			RequestHeaders: headers, RequestBody: mustJSON(redactVolcenVoiceDesignBody(body)), LatencyMs: latency, Error: err.Error(),
		})
		return nil, err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, readErr
	}
	var raw map[string]any
	if len(strings.TrimSpace(string(respBody))) > 0 {
		_ = json.Unmarshal(respBody, &raw)
	}
	if raw == nil {
		raw = map[string]any{}
	}
	err = volcenVoiceCloneError(raw)
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400 && err == nil, ModelID: resourceID, Endpoint: endpoint, Method: http.MethodPost,
		RequestHeaders: headers, RequestBody: mustJSON(redactVolcenVoiceDesignBody(body)),
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		return raw, fmt.Errorf("volcen voice design HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	if err != nil {
		return raw, fmt.Errorf("volcen voice design failed: %w", err)
	}
	return raw, nil
}

func (a *VolcenAdapter) postVolcenVoiceClone(ctx context.Context, endpoint, token, resourceID string, body map[string]any, stage string) (map[string]any, error) {
	rawBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(rawBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer; "+token)
	httpReq.Header.Set("Resource-Id", resourceID)
	httpReq.Header.Set("Content-Type", "application/json")
	headers := map[string]string{
		"Authorization": "Bearer; " + maskKey(token),
		"Resource-Id":   resourceID,
		"Content-Type":  "application/json",
	}
	client := a.speechHTTP
	if client == nil {
		client = a.rawHTTP
	}
	start := time.Now()
	resp, err := client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: resourceID, Endpoint: endpoint, Method: http.MethodPost,
			RequestHeaders: headers, RequestBody: mustJSON(redactVolcenVoiceCloneBody(body)), LatencyMs: latency, Error: err.Error(),
		})
		return nil, err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, readErr
	}
	var raw map[string]any
	if len(strings.TrimSpace(string(respBody))) > 0 {
		_ = json.Unmarshal(respBody, &raw)
	}
	if raw == nil {
		raw = map[string]any{}
	}
	err = volcenVoiceCloneError(raw)
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400 && err == nil, ModelID: resourceID, Endpoint: endpoint, Method: http.MethodPost,
		RequestHeaders: headers, RequestBody: mustJSON(redactVolcenVoiceCloneBody(body)),
		ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		return raw, fmt.Errorf("volcen voice clone %s HTTP %d: %s", stage, resp.StatusCode, string(respBody))
	}
	if err != nil {
		return raw, fmt.Errorf("volcen voice clone %s failed: %w", stage, err)
	}
	return raw, nil
}

func (a *VolcenAdapter) pollVolcenVoiceCloneStatus(ctx context.Context, endpoint, appID, token, resourceID, speakerID string, params map[string]any) (map[string]any, error) {
	timeout := time.Duration(intParamOrDefault(params, "poll_timeout_ms", 5*60*1000)) * time.Millisecond
	if timeout <= 0 {
		timeout = 5 * time.Minute
	}
	interval := time.Duration(intParamOrDefault(params, "poll_interval_ms", 5*1000)) * time.Millisecond
	if interval < 500*time.Millisecond {
		interval = 500 * time.Millisecond
	}
	body := map[string]any{
		"appid":      appID,
		"speaker_id": speakerID,
	}
	deadline := time.Now().Add(timeout)
	for {
		raw, err := a.postVolcenVoiceClone(ctx, endpoint, token, resourceID, body, "status")
		if err != nil {
			return raw, err
		}
		status := int(floatField(raw, "status", "Status"))
		switch status {
		case 2, 4:
			return raw, nil
		case 3:
			return raw, fmt.Errorf("volcen voice clone task %s failed: %s", speakerID, stringField(raw, "message", "msg", "status_text"))
		}
		if time.Now().Add(interval).After(deadline) {
			return raw, fmt.Errorf("volcen voice clone task %s timed out", speakerID)
		}
		select {
		case <-ctx.Done():
			return raw, ctx.Err()
		case <-time.After(interval):
		}
	}
}

func (a *VolcenAdapter) postVolcenASR(ctx context.Context, endpoint, appID, token, resourceID, requestID string, body map[string]any, stage string) error {
	rawBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(rawBody))
	if err != nil {
		return err
	}
	volcenASRHeaders(httpReq, appID, token, resourceID, requestID)
	headers := redactedVolcenASRHeaders(appID, token, resourceID, requestID)
	client := a.speechHTTP
	if client == nil {
		client = a.rawHTTP
	}
	start := time.Now()
	resp, err := client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: resourceID, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: mustJSON(redactVolcenASRBody(body)), LatencyMs: latency, Error: err.Error()})
		return err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return readErr
	}
	statusCode := resp.Header.Get("X-Api-Status-Code")
	message := resp.Header.Get("X-Api-Message")
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400 && volcenASRStatusComplete(statusCode), ModelID: resourceID, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: mustJSON(redactVolcenASRBody(body)), ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return fmt.Errorf("volcen ASR %s HTTP %d: %s", stage, resp.StatusCode, string(respBody))
	}
	if statusCode != "" && !volcenASRStatusComplete(statusCode) {
		return fmt.Errorf("volcen ASR %s failed: %s %s", stage, statusCode, message)
	}
	return nil
}

func (a *VolcenAdapter) pollVolcenASR(ctx context.Context, endpoint, appID, token, resourceID, requestID string, params map[string]any) (map[string]any, error) {
	timeout := time.Duration(intParamOrDefault(params, "poll_timeout_ms", 10*60*1000)) * time.Millisecond
	if timeout <= 0 {
		timeout = 10 * time.Minute
	}
	interval := time.Duration(intParamOrDefault(params, "poll_interval_ms", 5*1000)) * time.Millisecond
	if interval < 500*time.Millisecond {
		interval = 500 * time.Millisecond
	}
	deadline := time.Now().Add(timeout)
	for {
		raw, status, message, err := a.queryVolcenASR(ctx, endpoint, appID, token, resourceID, requestID)
		if err != nil {
			return raw, err
		}
		if volcenASRStatusComplete(status) {
			return raw, nil
		}
		if !volcenASRStatusProcessing(status) {
			return raw, fmt.Errorf("volcen ASR query failed: %s %s", status, message)
		}
		if time.Now().Add(interval).After(deadline) {
			return raw, fmt.Errorf("volcen ASR task %s timed out", requestID)
		}
		select {
		case <-ctx.Done():
			return raw, ctx.Err()
		case <-time.After(interval):
		}
	}
}

func (a *VolcenAdapter) queryVolcenASR(ctx context.Context, endpoint, appID, token, resourceID, requestID string) (map[string]any, string, string, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader("{}"))
	if err != nil {
		return nil, "", "", err
	}
	volcenASRHeaders(httpReq, appID, token, resourceID, requestID)
	headers := redactedVolcenASRHeaders(appID, token, resourceID, requestID)
	client := a.speechHTTP
	if client == nil {
		client = a.rawHTTP
	}
	start := time.Now()
	resp, err := client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{Success: false, ModelID: resourceID, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: "{}", LatencyMs: latency, Error: err.Error()})
		return nil, "", "", err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, "", "", readErr
	}
	statusCode := resp.Header.Get("X-Api-Status-Code")
	message := resp.Header.Get("X-Api-Message")
	var raw map[string]any
	if len(strings.TrimSpace(string(respBody))) > 0 {
		_ = json.Unmarshal(respBody, &raw)
	}
	if raw == nil {
		raw = map[string]any{}
	}
	if statusCode == "" {
		statusCode = volcenASRStatusFromBody(raw)
	}
	if message == "" {
		message = volcenASRMessageFromBody(raw)
	}
	recordDebug(ctx, DebugCallResult{Success: resp.StatusCode < 400 && (volcenASRStatusComplete(statusCode) || volcenASRStatusProcessing(statusCode)), ModelID: resourceID, Endpoint: endpoint, Method: http.MethodPost, RequestHeaders: headers, RequestBody: "{}", ResponseStatus: resp.StatusCode, ResponseBody: string(respBody), LatencyMs: latency})
	if resp.StatusCode >= 400 {
		return raw, statusCode, message, fmt.Errorf("volcen ASR query HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	return raw, statusCode, message, nil
}

func buildVolcenChatRequest(req TextRequest) arkmodel.CreateChatCompletionRequest {
	msgs := make([]*arkmodel.ChatCompletionMessage, 0, len(req.Messages))
	for _, m := range req.Messages {
		msg := &arkmodel.ChatCompletionMessage{Role: m.Role}
		switch {
		case m.Role == "tool":
			content := arkmodel.ChatCompletionMessageContent{StringValue: &m.Content}
			msg.Content = &content
			msg.ToolCallID = m.ToolCallID
		case len(m.ToolCalls) > 0:
			if m.Content != "" {
				content := arkmodel.ChatCompletionMessageContent{StringValue: &m.Content}
				msg.Content = &content
			}
			arkCalls := make([]*arkmodel.ToolCall, 0, len(m.ToolCalls))
			for _, tc := range m.ToolCalls {
				arkCalls = append(arkCalls, &arkmodel.ToolCall{
					ID:   tc.ID,
					Type: arkmodel.ToolTypeFunction,
					Function: arkmodel.FunctionCall{
						Name:      tc.Function.Name,
						Arguments: tc.Function.Arguments,
					},
				})
			}
			msg.ToolCalls = arkCalls
		default:
			content := arkmodel.ChatCompletionMessageContent{StringValue: &m.Content}
			msg.Content = &content
		}
		msgs = append(msgs, msg)
	}

	arkReq := arkmodel.CreateChatCompletionRequest{
		Model:    req.Model,
		Messages: msgs,
	}
	if req.MaxTokens > 0 {
		n := req.MaxTokens
		if n > volcenTextMaxTokensLimit {
			n = volcenTextMaxTokensLimit
		}
		arkReq.MaxTokens = &n
	}
	if req.Temperature >= 0 {
		t := req.Temperature
		arkReq.Temperature = &t
	}
	for key, value := range req.ExtraParams {
		switch key {
		case "top_p":
			if n, ok := numberValue(value); ok {
				v := float32(n)
				arkReq.TopP = &v
			}
		case "presence_penalty":
			if n, ok := numberValue(value); ok {
				v := float32(n)
				arkReq.PresencePenalty = &v
			}
		case "frequency_penalty":
			if n, ok := numberValue(value); ok {
				v := float32(n)
				arkReq.FrequencyPenalty = &v
			}
		}
	}
	if rawJSONPresentAI(req.Tools) {
		var tools []*arkmodel.Tool
		if err := json.Unmarshal(req.Tools, &tools); err == nil {
			arkReq.Tools = tools
		}
	}
	if rawJSONPresentAI(req.ToolChoice) {
		var toolChoice any
		if err := json.Unmarshal(req.ToolChoice, &toolChoice); err == nil {
			arkReq.ToolChoice = toolChoice
		}
	}
	return arkReq
}

func (a *VolcenAdapter) ImageGenerate(ctx context.Context, req ImageRequest) (ImageResponse, error) {
	arkReq := arkmodel.GenerateImagesRequest{
		Model:  req.Model,
		Prompt: req.Prompt,
	}
	if imageInput := buildVolcenImageInput(req); imageInput != nil {
		arkReq.Image = imageInput
	}
	if req.Size != "" {
		s := req.Size
		arkReq.Size = &s
	} else if req.AspectRatio != "" {
		// Ark accepts size in WxH or "adaptive"; map common ratios.
		s := aspectRatioToArkSize(req.AspectRatio)
		if s != "" {
			arkReq.Size = &s
		}
	}
	urlFmt := arkmodel.GenerateImagesResponseFormatURL
	arkReq.ResponseFormat = &urlFmt
	if req.Seed != nil {
		arkReq.Seed = req.Seed
	}
	if req.GuidanceScale > 0 {
		arkReq.GuidanceScale = &req.GuidanceScale
	}
	if req.Watermark != nil {
		arkReq.Watermark = req.Watermark
	}
	if req.SequentialMode != "" {
		mode := arkmodel.SequentialImageGeneration(req.SequentialMode)
		arkReq.SequentialImageGeneration = &mode
	}
	if req.SequentialMaxImages > 0 {
		maxImages := req.SequentialMaxImages
		arkReq.SequentialImageGenerationOptions = &arkmodel.SequentialImageGenerationOptions{MaxImages: &maxImages}
	}
	if req.OutputFormat != "" {
		format := arkmodel.OutputFormat(req.OutputFormat)
		arkReq.OutputFormat = &format
	}
	if req.OptimizePromptMode != "" {
		mode := arkmodel.OptimizePromptMode(req.OptimizePromptMode)
		arkReq.OptimizePromptOptions = &arkmodel.OptimizePromptOptions{Mode: &mode}
	}
	if req.WebSearch {
		arkReq.Tools = []*arkmodel.ContentGenerationTool{{Type: arkmodel.ToolTypeWebSearch}}
	}

	debugBody := map[string]any{"model": req.Model, "prompt": req.Prompt}
	if arkReq.Image != nil {
		debugBody["image"] = "[media]"
	}
	if arkReq.Size != nil {
		debugBody["size"] = *arkReq.Size
	}
	if arkReq.Seed != nil {
		debugBody["seed"] = *arkReq.Seed
	}
	if arkReq.GuidanceScale != nil {
		debugBody["guidance_scale"] = *arkReq.GuidanceScale
	}
	if arkReq.Watermark != nil {
		debugBody["watermark"] = *arkReq.Watermark
	}
	if arkReq.SequentialImageGeneration != nil {
		debugBody["sequential_image_generation"] = *arkReq.SequentialImageGeneration
	}
	if req.SequentialMaxImages > 0 {
		debugBody["sequential_image_generation_options"] = map[string]any{"max_images": req.SequentialMaxImages}
	}
	if arkReq.OutputFormat != nil {
		debugBody["output_format"] = *arkReq.OutputFormat
	}
	if req.OptimizePromptMode != "" {
		debugBody["optimize_prompt_options"] = map[string]any{"mode": req.OptimizePromptMode}
	}
	if req.WebSearch {
		debugBody["tools"] = []map[string]any{{"type": "web_search"}}
	}
	debugBodyJSON, _ := json.Marshal(debugBody)
	debugEndpoint := a.baseURL + "/images/generations"

	start := time.Now()
	resp, err := a.client.GenerateImages(ctx, arkReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model,
			Endpoint: debugEndpoint, Method: "POST",
			RequestBody: string(debugBodyJSON),
			LatencyMs:   latency, Error: err.Error(),
		})
		return ImageResponse{}, fmt.Errorf("volcen image: %w", err)
	}
	if resp.Error != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model,
			Endpoint: debugEndpoint, Method: "POST",
			RequestBody:    string(debugBodyJSON),
			ResponseStatus: http.StatusBadRequest,
			ResponseBody:   resp.Error.Message,
			LatencyMs:      latency, Error: resp.Error.Message,
		})
		return ImageResponse{}, fmt.Errorf("volcen image: %s", resp.Error.Message)
	}
	var urls []string
	for _, img := range resp.Data {
		if img.Url != nil && *img.Url != "" {
			urls = append(urls, *img.Url)
		} else if img.B64Json != nil && *img.B64Json != "" {
			urls = append(urls, "data:image/png;base64,"+*img.B64Json)
		}
	}
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.Model,
		Endpoint: debugEndpoint, Method: "POST",
		RequestBody:    string(debugBodyJSON),
		ResponseStatus: http.StatusOK,
		ResponseBody:   fmt.Sprintf(`{"images":%d}`, len(urls)),
		LatencyMs:      latency,
	})
	return ImageResponse{URLs: urls, Debug: takeDebug(ctx)}, nil
}

func (a *VolcenAdapter) GenerateAudio(ctx context.Context, req media.AudioGenerationRequest) (media.AudioGenerationResponse, error) {
	if req.Kind != media.AudioGenerationKindMusic && req.Kind != media.AudioGenerationKindSoundEffect {
		return media.AudioGenerationResponse{}, fmt.Errorf("unsupported volcen audio generation kind %q", req.Kind)
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("prompt is required")
	}
	createReq := buildVolcenAudioTaskRequest(req, prompt)
	debugBody := map[string]any{
		"model":   createReq.Model,
		"content": volcenVideoDebugContent(prompt, nil, nil, nil),
	}
	if createReq.Duration != nil {
		debugBody["duration"] = *createReq.Duration
	}
	if createReq.Seed != nil {
		debugBody["seed"] = *createReq.Seed
	}
	for key, value := range createReq.ExtraBody {
		debugBody[key] = value
	}
	debugBodyJSON, _ := json.Marshal(debugBody)
	debugEndpoint := a.baseURL + "/contents/generations/tasks"

	start := time.Now()
	taskResp, err := a.client.CreateContentGenerationTask(ctx, createReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: debugEndpoint, Method: "POST",
			RequestBody: string(debugBodyJSON), LatencyMs: latency, Error: err.Error(),
		})
		return media.AudioGenerationResponse{}, fmt.Errorf("volcen audio create task: %w", err)
	}
	taskID := taskResp.ID
	if taskID == "" {
		return media.AudioGenerationResponse{}, fmt.Errorf("volcen audio create task: no task id returned")
	}
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.Model, Endpoint: debugEndpoint, Method: "POST",
		RequestBody: string(debugBodyJSON), ResponseStatus: http.StatusOK,
		ResponseBody: fmt.Sprintf(`{"task_id":%q,"status":"submitted"}`, taskID),
		LatencyMs:    latency,
	})

	pollResp, err := a.pollVolcenAudioTask(ctx, taskID, req.Params)
	if err != nil {
		return media.AudioGenerationResponse{ProviderRef: taskID}, err
	}
	audioURL := volcenAudioTaskURL(pollResp)
	if audioURL == "" {
		return media.AudioGenerationResponse{ProviderRef: taskID}, fmt.Errorf("volcen audio task %s completed without an audio URL", taskID)
	}
	audio, mimeType, err := fetchURLBytes(ctx, audioURL, "")
	if err != nil {
		return media.AudioGenerationResponse{ProviderRef: taskID}, fmt.Errorf("download volcen audio task result: %w", err)
	}
	mimeType = stripContentTypeParams(mimeType)
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = mimeTypeForVolcenGeneratedAudio(volcenAudioOutputFormat(req))
	}
	return media.AudioGenerationResponse{
		Audio:       audio,
		MimeType:    mimeType,
		DurationMs:  volcenAudioDurationMs(req, pollResp),
		ProviderRef: taskID,
	}, nil
}

func (a *VolcenAdapter) VideoGenerate(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	startResp, err := a.VideoStart(ctx, req)
	if err != nil {
		return VideoResponse{}, err
	}
	if startResp.URL != "" || len(startResp.ContentBytes) > 0 || startResp.TaskID == "" {
		return startResp, nil
	}

	// Legacy synchronous path for direct callers. The job worker uses
	// VideoStart/VideoPoll so submitted task IDs are persisted before polling.
	for i := 0; i < 60; i++ {
		select {
		case <-ctx.Done():
			return VideoResponse{TaskID: startResp.TaskID, TaskKind: startResp.TaskKind, Status: VideoStatusProcessing}, ctx.Err()
		case <-time.After(5 * time.Second):
		}

		pollResp, err := a.VideoPoll(ctx, VideoPollRequest{
			Model:    req.Model,
			TaskID:   startResp.TaskID,
			TaskKind: startResp.TaskKind,
		})
		if err != nil {
			return pollResp, err
		}
		if pollResp.Status == VideoStatusSucceeded {
			return pollResp, nil
		}
		if pollResp.Status == VideoStatusFailed {
			msg := pollResp.Message
			if msg == "" {
				msg = "video generation failed"
			}
			return pollResp, fmt.Errorf("video task %s failed: %s", startResp.TaskID, msg)
		}
		if pollResp.Status == VideoStatusCancelled {
			msg := pollResp.Message
			if msg == "" {
				msg = "video generation cancelled"
			}
			return pollResp, fmt.Errorf("video task %s cancelled: %s", startResp.TaskID, msg)
		}
	}
	return VideoResponse{TaskID: startResp.TaskID, TaskKind: startResp.TaskKind, Status: VideoStatusProcessing}, fmt.Errorf("video generation timed out (task %s)", startResp.TaskID)
}

func (a *VolcenAdapter) VideoStart(ctx context.Context, req VideoRequest) (VideoResponse, error) {
	createReq, debugBody, buildErr := buildVolcenVideoTaskRequest(req)
	debugBodyJSON, _ := json.Marshal(debugBody)
	debugEndpoint := a.baseURL + "/contents/generations/tasks"

	if buildErr != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model,
			Endpoint: debugEndpoint, Method: "POST",
			RequestBody: string(debugBodyJSON),
			Error:       buildErr.Error(),
		})
		return VideoResponse{}, buildErr
	}

	start := time.Now()
	taskResp, err := a.client.CreateContentGenerationTask(ctx, createReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.Model,
			Endpoint: debugEndpoint, Method: "POST",
			RequestBody: string(debugBodyJSON),
			LatencyMs:   latency, Error: err.Error(),
		})
		return VideoResponse{}, fmt.Errorf("volcen create task: %w", err)
	}
	taskID := taskResp.ID
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.Model,
		Endpoint: debugEndpoint, Method: "POST",
		RequestBody:    string(debugBodyJSON),
		ResponseStatus: http.StatusOK,
		ResponseBody:   fmt.Sprintf(`{"task_id":%q,"status":"submitted"}`, taskID),
		LatencyMs:      latency,
	})
	if taskID == "" {
		return VideoResponse{}, fmt.Errorf("volcen create task: no task id returned")
	}
	return VideoResponse{TaskID: taskID, TaskKind: "content_generation", Status: VideoStatusSubmitted, Debug: takeDebug(ctx)}, nil
}

func (a *VolcenAdapter) VideoPoll(ctx context.Context, req VideoPollRequest) (VideoResponse, error) {
	if req.TaskID == "" {
		return VideoResponse{}, fmt.Errorf("volcen poll task: task id is required")
	}

	debugEndpoint := a.baseURL + "/contents/generations/tasks/" + req.TaskID
	start := time.Now()
	pollResp, err := a.client.GetContentGenerationTask(ctx, arkmodel.GetContentGenerationTaskRequest{ID: req.TaskID})
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.TaskID,
			Endpoint: debugEndpoint, Method: "GET",
			LatencyMs: latency, Error: err.Error(),
		})
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind}, fmt.Errorf("volcen poll task: %w", err)
	}

	responseBody := map[string]any{
		"task_id": pollResp.ID,
		"status":  pollResp.Status,
	}
	if pollResp.Content.VideoURL != "" {
		responseBody["video_url"] = pollResp.Content.VideoURL
	}
	if pollResp.Content.FileURL != "" {
		responseBody["file_url"] = pollResp.Content.FileURL
	}
	if pollResp.Error != nil {
		responseBody["error"] = pollResp.Error
	}
	responseBodyJSON, _ := json.Marshal(responseBody)
	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.TaskID,
		Endpoint: debugEndpoint, Method: "GET",
		ResponseStatus: http.StatusOK, ResponseBody: string(responseBodyJSON),
		LatencyMs: latency,
	})

	switch pollResp.Status {
	case arkmodel.StatusSucceeded:
		url := pollResp.Content.VideoURL
		if url == "" {
			url = pollResp.Content.FileURL
		}
		if url == "" {
			return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: "task succeeded but no video URL in response", Debug: takeDebug(ctx)}, fmt.Errorf("task succeeded but no video URL in response")
		}
		durSec := 0
		if pollResp.Duration != nil {
			durSec = int(*pollResp.Duration)
		}
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusSucceeded, URL: url, DurationSec: durSec, Debug: takeDebug(ctx)}, nil
	case arkmodel.StatusCancelled:
		msg := "video generation cancelled"
		if pollResp.Error != nil && pollResp.Error.Message != "" {
			msg = pollResp.Error.Message
		}
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusCancelled, Message: msg, Debug: takeDebug(ctx)}, nil
	case arkmodel.StatusFailed:
		msg := "video generation failed"
		if pollResp.Error != nil && pollResp.Error.Message != "" {
			msg = pollResp.Error.Message
		}
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusFailed, Message: msg, Debug: takeDebug(ctx)}, fmt.Errorf("video task %s failed: %s", req.TaskID, msg)
	case arkmodel.StatusQueued:
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusQueued, Debug: takeDebug(ctx)}, nil
	default:
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusProcessing, Debug: takeDebug(ctx)}, nil
	}
}

func (a *VolcenAdapter) VideoCancel(ctx context.Context, req VideoCancelRequest) (VideoResponse, error) {
	if req.TaskID == "" {
		return VideoResponse{}, fmt.Errorf("volcen cancel task: task id is required")
	}

	debugEndpoint := a.baseURL + "/contents/generations/tasks/" + req.TaskID
	start := time.Now()
	err := a.client.DeleteContentGenerationTask(ctx, arkmodel.DeleteContentGenerationTaskRequest{ID: req.TaskID})
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebugIfEmpty(ctx, DebugCallResult{
			Success: false, ModelID: req.TaskID,
			Endpoint: debugEndpoint, Method: "DELETE",
			LatencyMs: latency, Error: err.Error(),
		})
		return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusProcessing}, fmt.Errorf("volcen cancel task: %w", err)
	}

	recordDebugIfEmpty(ctx, DebugCallResult{
		Success: true, ModelID: req.TaskID,
		Endpoint: debugEndpoint, Method: "DELETE",
		ResponseStatus: http.StatusOK,
		ResponseBody:   fmt.Sprintf(`{"task_id":%q,"status":"cancelled"}`, req.TaskID),
		LatencyMs:      latency,
	})
	return VideoResponse{TaskID: req.TaskID, TaskKind: req.TaskKind, Status: VideoStatusCancelled, Message: "video task cancelled", Debug: takeDebug(ctx)}, nil
}

func buildVolcenVideoTaskRequest(req VideoRequest) (arkmodel.CreateContentGenerationTaskRequest, map[string]any, error) {
	prompt := req.Prompt
	content := []*arkmodel.CreateContentGenerationContentItem{
		{Type: arkmodel.ContentGenerationContentItemTypeText, Text: &prompt},
	}

	imageURLs := volcenVideoImageURLs(req)
	for _, imageURL := range imageURLs {
		role := volcenRoleReferenceImage
		content = append(content, &arkmodel.CreateContentGenerationContentItem{
			Type:     arkmodel.ContentGenerationContentItemTypeImage,
			ImageURL: &arkmodel.ImageURL{URL: imageURL},
			Role:     &role,
		})
	}

	videoURLs, err := volcenVideoURLs(req)
	if err != nil {
		return arkmodel.CreateContentGenerationTaskRequest{}, nil, err
	}
	for _, videoURL := range videoURLs {
		role := volcenRoleReferenceVideo
		content = append(content, &arkmodel.CreateContentGenerationContentItem{
			Type:     arkmodel.ContentGenerationContentItemTypeVideo,
			VideoURL: &arkmodel.VideoUrl{Url: videoURL},
			Role:     &role,
		})
	}

	audioURLs, err := volcenAudioURLs(req)
	if err != nil {
		return arkmodel.CreateContentGenerationTaskRequest{}, nil, err
	}
	for _, audioURL := range audioURLs {
		role := volcenRoleReferenceAudio
		content = append(content, &arkmodel.CreateContentGenerationContentItem{
			Type:     arkmodel.ContentGenerationContentItemTypeAudio,
			AudioURL: &arkmodel.AudioUrl{Url: audioURL},
			Role:     &role,
		})
	}

	createReq := arkmodel.CreateContentGenerationTaskRequest{
		Model:   req.Model,
		Content: content,
	}
	if req.Frames > 0 {
		frames := int64(req.Frames)
		createReq.Frames = &frames
	} else if req.Duration != 0 {
		dur := int64(req.Duration)
		createReq.Duration = &dur
	}
	if req.Seed != nil {
		createReq.Seed = req.Seed
	}
	ratio := req.Ratio
	if ratio == "" {
		ratio = req.AspectRatio
	}
	if ratio != "" {
		createReq.Ratio = &ratio
	}
	if req.ResolutionName != "" {
		createReq.Resolution = &req.ResolutionName
	}
	if req.CameraFixed != nil {
		createReq.CameraFixed = req.CameraFixed
	}
	if req.Watermark != nil {
		createReq.Watermark = req.Watermark
	}
	if req.GenerateAudio != nil {
		createReq.GenerateAudio = req.GenerateAudio
	}
	if req.ReturnLastFrame != nil {
		createReq.ReturnLastFrame = req.ReturnLastFrame
	}
	if req.ServiceTier != "" {
		createReq.ServiceTier = &req.ServiceTier
	}
	if req.ExecutionExpiresAfter > 0 {
		expires := int64(req.ExecutionExpiresAfter)
		createReq.ExecutionExpiresAfter = &expires
	}
	if req.Priority > 0 {
		createReq.ExtraBody = arkmodel.ExtraBody{"priority": req.Priority}
	}
	if req.Workspace != nil {
		createReq.Draft = req.Workspace
	}
	if req.WebSearch {
		createReq.Tools = []*arkmodel.ContentGenerationTool{{Type: arkmodel.ToolTypeWebSearch}}
	}

	debugBody := map[string]any{
		"model":   req.Model,
		"content": volcenVideoDebugContent(req.Prompt, imageURLs, videoURLs, audioURLs),
	}
	if bindings := volcenReferenceAssetBindings(req.ReferenceAssets); len(bindings) > 0 {
		debugBody["reference_asset_bindings"] = bindings
	}
	if req.Frames > 0 {
		debugBody["frames"] = req.Frames
	} else if req.Duration != 0 {
		debugBody["duration"] = req.Duration
	}
	if req.Seed != nil {
		debugBody["seed"] = *req.Seed
	}
	if ratio != "" {
		debugBody["ratio"] = ratio
	}
	if req.ResolutionName != "" {
		debugBody["resolution"] = req.ResolutionName
	}
	if req.CameraFixed != nil {
		debugBody["camera_fixed"] = *req.CameraFixed
	}
	if req.Watermark != nil {
		debugBody["watermark"] = *req.Watermark
	}
	if req.GenerateAudio != nil {
		debugBody["generate_audio"] = *req.GenerateAudio
	}
	if req.ReturnLastFrame != nil {
		debugBody["return_last_frame"] = *req.ReturnLastFrame
	}
	if req.ServiceTier != "" {
		debugBody["service_tier"] = req.ServiceTier
	}
	if req.ExecutionExpiresAfter > 0 {
		debugBody["execution_expires_after"] = req.ExecutionExpiresAfter
	}
	if req.Priority > 0 {
		debugBody["priority"] = req.Priority
	}
	if req.Workspace != nil {
		debugBody["draft"] = *req.Workspace
	}
	if req.WebSearch {
		debugBody["tools"] = []map[string]any{{"type": "web_search"}}
	}
	return createReq, debugBody, nil
}

func volcenReferenceAssetBindings(assets []ReferenceAsset) []map[string]any {
	out := make([]map[string]any, 0, len(assets))
	for _, asset := range assets {
		role := strings.TrimSpace(asset.Role)
		mediaType := strings.TrimSpace(asset.MediaType)
		if role == "" && mediaType == "" && asset.ResourceID == 0 {
			continue
		}
		providerField, providerRole := volcenProviderFieldForReferenceAsset(mediaType)
		item := map[string]any{
			"role":           role,
			"media_type":     mediaType,
			"provider_field": providerField,
			"provider_role":  providerRole,
		}
		if asset.ResourceID != 0 {
			item["resource_id"] = asset.ResourceID
		}
		out = append(out, item)
	}
	return out
}

func volcenProviderFieldForReferenceAsset(mediaType string) (string, string) {
	switch strings.TrimSpace(strings.ToLower(mediaType)) {
	case "video":
		return "content[].video_url", volcenRoleReferenceVideo
	case "audio":
		return "content[].audio_url", volcenRoleReferenceAudio
	default:
		return "content[].image_url", volcenRoleReferenceImage
	}
}

func buildVolcenAudioTaskRequest(req media.AudioGenerationRequest, prompt string) arkmodel.CreateContentGenerationTaskRequest {
	createReq := arkmodel.CreateContentGenerationTaskRequest{
		Model: strings.TrimSpace(req.Model),
		Content: []*arkmodel.CreateContentGenerationContentItem{
			{Type: arkmodel.ContentGenerationContentItemTypeText, Text: &prompt},
		},
	}
	if createReq.Model == "" {
		createReq.Model = "doubao-seed-audio-1-0"
	}
	if req.DurationSec > 0 {
		duration := int64(req.DurationSec)
		createReq.Duration = &duration
	}
	if seed := intParamOrDefault(req.Params, "seed", 0); seed != 0 {
		v := int64(seed)
		createReq.Seed = &v
	}
	createReq.ExtraBody = arkmodel.ExtraBody{}
	if outputFormat := volcenAudioOutputFormat(req); outputFormat != "" {
		createReq.ExtraBody["output_format"] = outputFormat
	}
	if req.NegativePrompt != "" {
		createReq.ExtraBody["negative_prompt"] = req.NegativePrompt
	} else if negative := stringParam(req.Params, "negative_prompt", ""); negative != "" {
		createReq.ExtraBody["negative_prompt"] = negative
	}
	if style := stringParam(req.Params, "style", ""); style != "" {
		createReq.ExtraBody["style"] = style
	}
	if ref := stringParam(req.Params, "reference_audio_url", ""); ref != "" {
		createReq.Content = append(createReq.Content, &arkmodel.CreateContentGenerationContentItem{
			Type:     arkmodel.ContentGenerationContentItemTypeAudio,
			AudioURL: &arkmodel.AudioUrl{Url: ref},
			Role:     stringPtrAI("reference_audio"),
		})
	}
	for _, key := range []string{"voice", "language", "callback_url", "service_tier"} {
		if value := stringParam(req.Params, key, ""); value != "" {
			createReq.ExtraBody[key] = value
		}
	}
	return createReq
}

func (a *VolcenAdapter) pollVolcenAudioTask(ctx context.Context, taskID string, params map[string]any) (arkmodel.GetContentGenerationTaskResponse, error) {
	timeout := time.Duration(intParamOrDefault(params, "poll_timeout_ms", 10*60*1000)) * time.Millisecond
	if timeout <= 0 {
		timeout = 10 * time.Minute
	}
	interval := time.Duration(intParamOrDefault(params, "poll_interval_ms", 5*1000)) * time.Millisecond
	if interval < 500*time.Millisecond {
		interval = 500 * time.Millisecond
	}
	deadline := time.Now().Add(timeout)
	for {
		resp, err := a.client.GetContentGenerationTask(ctx, arkmodel.GetContentGenerationTaskRequest{ID: taskID})
		if err != nil {
			return resp, fmt.Errorf("volcen audio poll task: %w", err)
		}
		switch resp.Status {
		case arkmodel.StatusSucceeded:
			return resp, nil
		case arkmodel.StatusFailed:
			msg := "audio generation failed"
			if resp.Error != nil && resp.Error.Message != "" {
				msg = resp.Error.Message
			}
			return resp, fmt.Errorf("volcen audio task %s failed: %s", taskID, msg)
		case arkmodel.StatusCancelled:
			return resp, fmt.Errorf("volcen audio task %s cancelled", taskID)
		}
		if time.Now().Add(interval).After(deadline) {
			return resp, fmt.Errorf("volcen audio generation timed out (task %s)", taskID)
		}
		select {
		case <-ctx.Done():
			return resp, ctx.Err()
		case <-time.After(interval):
		}
	}
}

func volcenAudioTaskURL(resp arkmodel.GetContentGenerationTaskResponse) string {
	return firstNonEmptyAI(resp.Content.FileURL, resp.Content.VideoURL)
}

func volcenAudioDurationMs(req media.AudioGenerationRequest, resp arkmodel.GetContentGenerationTaskResponse) int {
	if resp.Duration != nil && *resp.Duration > 0 {
		return int(*resp.Duration) * 1000
	}
	if req.DurationSec > 0 {
		return req.DurationSec * 1000
	}
	return 0
}

func volcenAudioOutputFormat(req media.AudioGenerationRequest) string {
	return strings.ToLower(strings.TrimSpace(stringParam(req.Params, "output_format", firstNonEmptyAI(req.AudioFormat, "mp3"))))
}

func mimeTypeForVolcenGeneratedAudio(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "wav":
		return "audio/wav"
	case "ogg", "opus":
		return "audio/ogg"
	case "flac":
		return "audio/flac"
	case "m4a":
		return "audio/mp4"
	default:
		return "audio/mpeg"
	}
}

func volcenVideoImageURLs(req VideoRequest) []string {
	urls := make([]string, 0, 1+len(req.InputImages)+len(req.InputImageDataList))
	if req.Image != "" {
		urls = append(urls, req.Image)
	}
	for _, url := range req.InputImages {
		if strings.TrimSpace(url) != "" {
			urls = append(urls, url)
		}
	}
	for _, img := range req.InputImageDataList {
		if img.PresignedURL != "" {
			urls = append(urls, img.PresignedURL)
			continue
		}
		if len(img.Bytes) > 0 {
			mimeType := img.MimeType
			if mimeType == "" {
				mimeType = "image/png"
			}
			// Ark accepts base64 data URLs for image_url. The worker still
			// prefers public object URLs so provider-side media fetches are stable.
			urls = append(urls, "data:"+mimeType+";base64,"+base64Encode(img.Bytes))
		}
	}
	return urls
}

func volcenVideoURLs(req VideoRequest) ([]string, error) {
	urls := compactTrimmed(req.InputVideos)
	urls = appendUniqueTrimmed(urls, req.InputVideo)
	if len(req.InputVideoDataList) > 0 {
		for i := range req.InputVideoDataList {
			url, err := volcenVideoURLFromData(&req.InputVideoDataList[i])
			if err != nil {
				return nil, err
			}
			urls = appendUniqueTrimmed(urls, url)
		}
		return urls, nil
	}
	url, err := volcenVideoURLFromData(req.InputVideoData)
	if err != nil {
		return nil, err
	}
	return appendUniqueTrimmed(urls, url), nil
}

func volcenVideoURLFromData(vd *MediaData) (string, error) {
	if vd == nil {
		return "", nil
	}
	if vd.PresignedURL != "" {
		return vd.PresignedURL, nil
	}
	if len(vd.Bytes) > 0 {
		// Volcen's contents/generations/tasks endpoint does not accept base64
		// data URLs for video_url. If we reach this branch, the worker failed
		// to upload the reference video to a public object relay (e.g. TOS).
		return "", fmt.Errorf("volcen video reference requires a public URL; configure a cloud file relay (TOS/S3/OSS) for this credential")
	}
	return "", nil
}

func volcenAudioURLs(req VideoRequest) ([]string, error) {
	urls := compactTrimmed(req.InputAudios)
	urls = appendUniqueTrimmed(urls, req.InputAudio)
	if len(req.InputAudioDataList) > 0 {
		for i := range req.InputAudioDataList {
			url, err := volcenAudioURLFromData(&req.InputAudioDataList[i])
			if err != nil {
				return nil, err
			}
			urls = appendUniqueTrimmed(urls, url)
		}
		return urls, nil
	}
	url, err := volcenAudioURLFromData(req.InputAudioData)
	if err != nil {
		return nil, err
	}
	return appendUniqueTrimmed(urls, url), nil
}

func volcenAudioURLFromData(ad *MediaData) (string, error) {
	if ad == nil {
		return "", nil
	}
	if ad.PresignedURL != "" {
		return ad.PresignedURL, nil
	}
	if len(ad.Bytes) > 0 {
		return "", fmt.Errorf("volcen audio reference requires a public URL; configure a cloud file relay (TOS/S3/OSS) for this credential")
	}
	return "", nil
}

func volcenVideoDebugContent(prompt string, imageURLs []string, videoURLs []string, audioURLs []string) []map[string]any {
	items := []map[string]any{{"type": "text", "text": prompt}}
	for _, url := range imageURLs {
		items = append(items, map[string]any{
			"type":      "image_url",
			"image_url": map[string]any{"url": url},
			"role":      volcenRoleReferenceImage,
		})
	}
	for _, videoURL := range videoURLs {
		items = append(items, map[string]any{
			"type":      "video_url",
			"video_url": map[string]any{"url": videoURL},
			"role":      volcenRoleReferenceVideo,
		})
	}
	for _, audioURL := range audioURLs {
		items = append(items, map[string]any{
			"type":      "audio_url",
			"audio_url": map[string]any{"url": audioURL},
			"role":      volcenRoleReferenceAudio,
		})
	}
	return items
}

func buildVolcenImageInput(req ImageRequest) any {
	if len(req.InputImageDataList) > 0 {
		images := make([]string, 0, len(req.InputImageDataList))
		for _, img := range req.InputImageDataList {
			if img.PresignedURL != "" {
				images = append(images, img.PresignedURL)
				continue
			}
			if len(img.Bytes) > 0 {
				mimeType := img.MimeType
				if mimeType == "" {
					mimeType = "image/png"
				}
				images = append(images, "data:"+mimeType+";base64,"+base64Encode(img.Bytes))
			}
		}
		switch len(images) {
		case 0:
			return nil
		case 1:
			return images[0]
		default:
			return images
		}
	}
	if len(req.InputImageBytes) > 0 {
		mimeType := req.InputImageMime
		if mimeType == "" {
			mimeType = "image/png"
		}
		return "data:" + mimeType + ";base64," + base64Encode(req.InputImageBytes)
	}
	if req.InputImage != "" {
		return req.InputImage
	}
	return nil
}

func (a *VolcenAdapter) Ping(ctx context.Context) error {
	_, err := a.FetchModels(ctx)
	return err
}

func (a *VolcenAdapter) FetchModels(ctx context.Context) ([]string, error) {
	baseURL := a.baseURL
	if baseURL == "" {
		baseURL = "https://ark.cn-beijing.volces.com/api/v3"
	}
	endpoint := strings.TrimRight(baseURL, "/") + "/models"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if a.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+a.apiKey)
	}

	client := a.rawHTTP
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("volcen models HTTP %d: %s", resp.StatusCode, string(body))
	}

	var parsed struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("decode volcen models: %w", err)
	}
	ids := make([]string, 0, len(parsed.Data))
	for _, model := range parsed.Data {
		if model.ID != "" {
			ids = append(ids, model.ID)
		}
	}
	return ids, nil
}

// aspectRatioToArkSize maps common ratio strings to Ark image size strings.
func aspectRatioToArkSize(ratio string) string {
	switch ratio {
	case "1:1":
		return "1024x1024"
	case "16:9":
		return "1280x720"
	case "9:16":
		return "720x1280"
	case "4:3":
		return "1024x768"
	case "3:4":
		return "768x1024"
	}
	return ""
}

func base64Encode(b []byte) string {
	return base64.StdEncoding.EncodeToString(b)
}

func stringPtrAI(value string) *string {
	return &value
}

type volcenTTSResponse struct {
	ReqID      string `json:"reqid"`
	Code       int    `json:"code"`
	Operation  string `json:"operation"`
	Message    string `json:"message"`
	Sequence   int    `json:"sequence"`
	Data       string `json:"data"`
	DurationMs int    `json:"duration_ms"`
}

func volcenTTSAudioFormat(req media.TTSRequest) string {
	format := strings.TrimSpace(req.AudioFormat)
	if format == "" {
		format = stringParam(req.Params, "encoding", "mp3")
	}
	format = strings.TrimPrefix(format, "audio/")
	if format == "mpeg" || format == "mpga" {
		return "mp3"
	}
	if format == "opus" {
		return "ogg_opus"
	}
	switch format {
	case "mp3", "wav", "pcm", "ogg_opus":
		return format
	default:
		return "mp3"
	}
}

func volcenUseTTSV3(req media.TTSRequest) bool {
	model := strings.TrimSpace(req.Model)
	if strings.HasPrefix(model, "seed-tts-2.0") {
		return true
	}
	return boolParamOrDefault(req.Params, "tts_v3", false)
}

func (a *VolcenAdapter) synthesizeV3(ctx context.Context, req media.TTSRequest, text string, token string) (media.TTSResponse, error) {
	audioFormat := volcenTTSAudioFormat(req)
	requestID := firstNonEmptyAI(stringParam(req.Params, "request_id", ""), stringParam(req.Params, "reqid", ""), fmt.Sprintf("movscript-%d", time.Now().UnixNano()))
	resourceID := firstNonEmptyAI(stringParam(req.Params, "resource_id", ""), "seed-tts-2.0")
	reqParams := map[string]any{
		"text":    text,
		"speaker": firstNonEmptyAI(strings.TrimSpace(req.Voice), stringParam(req.Params, "speaker", ""), stringParam(req.Params, "voice_type", "zh_female_vv_uranus_bigtts")),
		"model":   firstNonEmptyAI(strings.TrimSpace(req.Model), stringParam(req.Params, "model", ""), "seed-tts-2.0-expressive"),
		"audio_params": map[string]any{
			"format": audioFormat,
		},
	}
	audioParams := reqParams["audio_params"].(map[string]any)
	if sampleRate := intParamOrDefault(req.Params, "sample_rate", 0); sampleRate > 0 {
		audioParams["sample_rate"] = sampleRate
	}
	if bitRate := intParamOrDefault(req.Params, "bit_rate", 0); bitRate > 0 {
		audioParams["bit_rate"] = bitRate
	}
	if speechRate := intParamOrDefault(req.Params, "speech_rate", 0); speechRate != 0 {
		audioParams["speech_rate"] = speechRate
	}
	if loudnessRate := intParamOrDefault(req.Params, "loudness_rate", 0); loudnessRate != 0 {
		audioParams["loudness_rate"] = loudnessRate
	}
	if emotion := stringParam(req.Params, "emotion", ""); emotion != "" {
		audioParams["emotion"] = emotion
	}
	additions := map[string]any{}
	if explicitLanguage := firstNonEmptyAI(strings.TrimSpace(req.Language), stringParam(req.Params, "explicit_language", "")); explicitLanguage != "" {
		additions["explicit_language"] = explicitLanguage
	}
	if disableMarkdown := boolParamOrDefault(req.Params, "disable_markdown_filter", false); disableMarkdown {
		additions["disable_markdown_filter"] = true
	}
	if len(additions) > 0 {
		reqParams["additions"] = additions
	}
	body := map[string]any{
		"user": map[string]any{
			"uid": stringParam(req.Params, "uid", "movscript"),
		},
		"req_params": reqParams,
	}
	endpoint := strings.TrimRight(firstNonEmptyAI(a.speech.BaseURL, volcenDefaultSpeechBaseURL), "/") + "/api/v3/tts/unidirectional"
	rawBody, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(rawBody))
	if err != nil {
		return media.TTSResponse{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Api-Key", token)
	httpReq.Header.Set("X-Api-Resource-Id", resourceID)
	httpReq.Header.Set("X-Api-Request-Id", requestID)
	httpReq.Header.Set("X-Control-Require-Usage-Tokens-Return", "*")
	reqHeaders := map[string]string{
		"Content-Type":                          "application/json",
		"X-Api-Key":                             maskKey(token),
		"X-Api-Resource-Id":                     resourceID,
		"X-Api-Request-Id":                      requestID,
		"X-Control-Require-Usage-Tokens-Return": "*",
	}
	client := a.speechHTTP
	if client == nil {
		client = a.rawHTTP
	}
	start := time.Now()
	resp, err := client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		recordDebug(ctx, DebugCallResult{
			Success: false, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost,
			RequestHeaders: reqHeaders, RequestBody: mustJSON(body), LatencyMs: latency, Error: err.Error(),
		})
		return media.TTSResponse{}, err
	}
	defer resp.Body.Close()
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return media.TTSResponse{}, readErr
	}
	recordDebug(ctx, DebugCallResult{
		Success: resp.StatusCode < 400, ModelID: req.Model, Endpoint: endpoint, Method: http.MethodPost,
		RequestHeaders: reqHeaders, RequestBody: mustJSON(body),
		ResponseStatus: resp.StatusCode, ResponseBody: volcenTTSV3DebugResponseBody(respBody, resp.Header.Get("Content-Type")), LatencyMs: latency,
	})
	if resp.StatusCode >= 400 {
		return media.TTSResponse{}, fmt.Errorf("volcen TTS v3 HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	audioBytes, providerRef, err := parseVolcenTTSV3AudioResponse(respBody, resp.Header.Get("Content-Type"), requestID)
	if err != nil {
		return media.TTSResponse{}, err
	}
	if len(audioBytes) == 0 {
		return media.TTSResponse{}, fmt.Errorf("volcen TTS v3 returned empty audio")
	}
	return media.TTSResponse{
		Audio:       audioBytes,
		MimeType:    mimeTypeForVolcenTTSAudioFormat(audioFormat),
		ProviderRef: providerRef,
	}, nil
}

func parseVolcenTTSV3AudioResponse(respBody []byte, contentType string, fallbackRef string) ([]byte, string, error) {
	if strings.Contains(strings.ToLower(contentType), "json") || bytes.HasPrefix(bytes.TrimSpace(respBody), []byte("{")) {
		var raw map[string]any
		if err := json.Unmarshal(respBody, &raw); err != nil {
			return nil, fallbackRef, fmt.Errorf("decode volcen TTS v3 response: %w", err)
		}
		if code := int(floatField(raw, "code", "Code")); code != 0 {
			return nil, fallbackRef, fmt.Errorf("volcen TTS v3 error %d: %s", code, stringField(raw, "message", "msg", "Message"))
		}
		audioData := firstNonEmptyAI(stringField(raw, "data", "audio", "audio_data"), stringField(nestedMap(raw, "result"), "data", "audio", "audio_data"))
		if idx := strings.Index(audioData, ","); strings.HasPrefix(audioData, "data:") && idx >= 0 {
			audioData = audioData[idx+1:]
		}
		if audioData == "" {
			return nil, fallbackRef, fmt.Errorf("volcen TTS v3 JSON response did not contain audio data")
		}
		audioBytes, err := base64.StdEncoding.DecodeString(audioData)
		if err != nil {
			return nil, fallbackRef, fmt.Errorf("decode volcen TTS v3 audio: %w", err)
		}
		return audioBytes, firstNonEmptyAI(stringField(raw, "reqid", "request_id", "id"), fallbackRef), nil
	}
	return respBody, fallbackRef, nil
}

func volcenTTSV3DebugResponseBody(respBody []byte, contentType string) string {
	if strings.Contains(strings.ToLower(contentType), "json") || bytes.HasPrefix(bytes.TrimSpace(respBody), []byte("{")) {
		return string(respBody)
	}
	return fmt.Sprintf(`{"audio_bytes":%d}`, len(respBody))
}

func nestedMap(raw map[string]any, key string) map[string]any {
	if value, ok := raw[key].(map[string]any); ok {
		return value
	}
	return nil
}

func mimeTypeForVolcenTTSAudioFormat(format string) string {
	switch strings.TrimSpace(format) {
	case "wav":
		return "audio/wav"
	case "pcm":
		return "audio/L16"
	case "ogg_opus":
		return "audio/ogg"
	default:
		return "audio/mpeg"
	}
}

func volcenRealtimeDialogueURL(baseURL string, params map[string]any) string {
	if raw := strings.TrimSpace(stringParam(params, "realtime_url", "")); raw != "" {
		return raw
	}
	raw := strings.TrimRight(firstNonEmptyAI(baseURL, volcenDefaultSpeechBaseURL), "/")
	u, err := url.Parse(raw)
	if err != nil {
		return "wss://openspeech.bytedance.com/api/v3/realtime/dialogue"
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https", "":
		u.Scheme = "wss"
	}
	if u.Host == "" {
		u.Host = "openspeech.bytedance.com"
	}
	if strings.HasSuffix(u.Path, "/api/v3/realtime/dialogue") {
		return u.String()
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/api/v3/realtime/dialogue"
	return u.String()
}

func volcenRealtimeDialogueConfig(req media.SpeechToSpeechRequest) map[string]any {
	inputMode := stringParam(req.Params, "input_mod", "")
	if inputMode == "" {
		if len(req.Audio) > 0 {
			inputMode = "audio_file"
		} else {
			inputMode = "text"
		}
	}
	dialogExtra := map[string]any{
		"strict_audit":                 boolParamOrDefault(req.Params, "strict_audit", true),
		"input_mod":                    inputMode,
		"model":                        stringParam(req.Params, "model_version", "1.2.1.1"),
		"enable_music":                 boolParamOrDefault(req.Params, "enable_music", false),
		"enable_loudness_norm":         boolParamOrDefault(req.Params, "enable_loudness_norm", false),
		"enable_conversation_truncate": boolParamOrDefault(req.Params, "enable_conversation_truncate", false),
		"enable_user_query_exit":       boolParamOrDefault(req.Params, "enable_user_query_exit", false),
	}
	for _, key := range []string{"audit_response", "volc_websearch_type", "volc_websearch_api_key", "volc_websearch_bot_id", "volc_websearch_no_result_message"} {
		if value := stringParam(req.Params, key, ""); value != "" {
			dialogExtra[key] = value
		}
	}
	if n := intParamOrDefault(req.Params, "volc_websearch_result_count", 0); n > 0 {
		dialogExtra["volc_websearch_result_count"] = n
	}
	dialog := map[string]any{
		"bot_name": strings.TrimSpace(stringParam(req.Params, "bot_name", "豆包")),
		"extra":    dialogExtra,
	}
	if prompt := strings.TrimSpace(req.Prompt); prompt != "" && inputMode != "text" {
		dialog["system_role"] = prompt
	}
	for _, key := range []string{"system_role", "speaking_style", "dialog_id", "character_manifest"} {
		if value := stringParam(req.Params, key, ""); value != "" {
			dialog[key] = value
		}
	}
	asr := map[string]any{
		"audio_info": map[string]any{
			"format":      stringParam(req.Params, "input_audio_format", "pcm"),
			"sample_rate": intParamOrDefault(req.Params, "input_sample_rate", 16000),
			"channel":     intParamOrDefault(req.Params, "input_channel", 1),
		},
		"extra": map[string]any{
			"end_smooth_window_ms": intParamOrDefault(req.Params, "end_smooth_window_ms", 1500),
			"enable_custom_vad":    boolParamOrDefault(req.Params, "enable_custom_vad", false),
			"enable_asr_twopass":   boolParamOrDefault(req.Params, "enable_asr_twopass", false),
		},
	}
	tts := map[string]any{
		"speaker": firstNonEmptyAI(strings.TrimSpace(req.Voice), stringParam(req.Params, "speaker", ""), "zh_female_vv_jupiter_bigtts"),
		"audio_config": map[string]any{
			"channel":       intParamOrDefault(req.Params, "output_channel", 1),
			"format":        stringParam(req.Params, "output_audio_format", "pcm_s16le"),
			"sample_rate":   intParamOrDefault(req.Params, "output_sample_rate", 24000),
			"speech_rate":   intParamOrDefault(req.Params, "speech_rate", 0),
			"loudness_rate": intParamOrDefault(req.Params, "loudness_rate", 0),
		},
	}
	if explicitDialect := stringParam(req.Params, "explicit_dialect", ""); explicitDialect != "" {
		tts["extra"] = map[string]any{"explicit_dialect": explicitDialect}
	}
	return map[string]any{"dialog": dialog, "asr": asr, "tts": tts}
}

func volcenRealtimeJSONFrame(event int, sessionID string, meta map[string]any) []byte {
	payload, _ := json.Marshal(meta)
	return volcenRealtimeFrame(0x1, 0x1, event, sessionID, payload)
}

func volcenRealtimeAudioFrame(sessionID string, audio []byte) []byte {
	return volcenRealtimeFrame(0x2, 0x1, volcenRealtimeEventTaskRequest, sessionID, audio)
}

func volcenRealtimeFrame(messageType byte, serialization byte, event int, sessionID string, payload []byte) []byte {
	out := []byte{0x11, (messageType << 4) | 0x04, serialization << 4, 0x00}
	buf := make([]byte, 4)
	binary.BigEndian.PutUint32(buf, uint32(event))
	out = append(out, buf...)
	if sessionID != "" {
		sessionBytes := []byte(sessionID)
		binary.BigEndian.PutUint32(buf, uint32(len(sessionBytes)))
		out = append(out, buf...)
		out = append(out, sessionBytes...)
	}
	binary.BigEndian.PutUint32(buf, uint32(len(payload)))
	out = append(out, buf...)
	out = append(out, payload...)
	return out
}

type volcenRealtimeFrameData struct {
	MessageType byte
	Event       int
	SessionID   string
	Payload     []byte
}

func parseVolcenRealtimeFrame(data []byte) (volcenRealtimeFrameData, error) {
	if len(data) < 8 {
		return volcenRealtimeFrameData{}, fmt.Errorf("volcen realtime frame too short")
	}
	messageType := data[1] >> 4
	flags := data[1] & 0x0f
	offset := 4
	frame := volcenRealtimeFrameData{MessageType: messageType}
	if messageType == 0x0f {
		frame.Event = int(binary.BigEndian.Uint32(data[offset : offset+4]))
		offset += 4
	} else if flags&0x04 != 0 {
		frame.Event = int(binary.BigEndian.Uint32(data[offset : offset+4]))
		offset += 4
	}
	if frame.Event != 0 && !volcenRealtimeConnectionEvent(frame.Event) && len(data[offset:]) >= 8 {
		sessionLen := int(binary.BigEndian.Uint32(data[offset : offset+4]))
		if sessionLen >= 0 && sessionLen <= len(data[offset+4:])-4 {
			offset += 4
			frame.SessionID = string(data[offset : offset+sessionLen])
			offset += sessionLen
		}
	}
	if len(data[offset:]) < 4 {
		return frame, fmt.Errorf("volcen realtime frame missing payload length")
	}
	payloadLen := int(binary.BigEndian.Uint32(data[offset : offset+4]))
	offset += 4
	if payloadLen < 0 || payloadLen > len(data[offset:]) {
		return frame, fmt.Errorf("volcen realtime frame invalid payload length %d", payloadLen)
	}
	frame.Payload = data[offset : offset+payloadLen]
	return frame, nil
}

func volcenRealtimeConnectionEvent(event int) bool {
	switch event {
	case volcenRealtimeEventConnectionStarted, volcenRealtimeEventConnectionFailed:
		return true
	default:
		return false
	}
}

func volcenRealtimeWaitForEvent(ctx context.Context, conn *websocket.Conn, successEvent, failEvent int) error {
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return err
		}
		frame, err := parseVolcenRealtimeFrame(data)
		if err != nil {
			return err
		}
		switch frame.Event {
		case successEvent:
			return nil
		case failEvent, volcenRealtimeEventDialogError:
			return fmt.Errorf("volcen realtime event %d failed: %s", frame.Event, volcenRealtimePayloadMessage(frame.Payload))
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
	}
}

func volcenRealtimeReadSpeechToSpeech(ctx context.Context, conn *websocket.Conn, sessionID string, params map[string]any) ([]byte, string, string, error) {
	timeout := time.Duration(intParamOrDefault(params, "read_timeout_ms", 2*60*1000)) * time.Millisecond
	if timeout <= 0 {
		timeout = 2 * time.Minute
	}
	deadline := time.Now().Add(timeout)
	var audio bytes.Buffer
	var text strings.Builder
	providerRef := sessionID
	for {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return audio.Bytes(), text.String(), providerRef, fmt.Errorf("volcen realtime voice read timed out")
		}
		_ = conn.SetReadDeadline(time.Now().Add(remaining))
		_, data, err := conn.ReadMessage()
		if err != nil {
			return audio.Bytes(), text.String(), providerRef, err
		}
		frame, err := parseVolcenRealtimeFrame(data)
		if err != nil {
			return audio.Bytes(), text.String(), providerRef, err
		}
		switch frame.Event {
		case volcenRealtimeEventTTSResponse:
			audio.Write(frame.Payload)
		case volcenRealtimeEventChatResponse, volcenRealtimeEventASRResponse:
			if delta := volcenRealtimePayloadText(frame.Payload); delta != "" {
				if text.Len() > 0 && frame.Event == volcenRealtimeEventASRResponse {
					text.WriteString("\n")
				}
				text.WriteString(delta)
			}
			if ref := volcenRealtimePayloadRef(frame.Payload); ref != "" {
				providerRef = ref
			}
		case volcenRealtimeEventTTSEnded, volcenRealtimeEventChatEnded:
			return audio.Bytes(), text.String(), providerRef, nil
		case volcenRealtimeEventSessionFailed, volcenRealtimeEventDialogError:
			return audio.Bytes(), text.String(), providerRef, fmt.Errorf("volcen realtime voice failed: %s", volcenRealtimePayloadMessage(frame.Payload))
		}
		select {
		case <-ctx.Done():
			return audio.Bytes(), text.String(), providerRef, ctx.Err()
		default:
		}
	}
}

func volcenRealtimePayloadText(payload []byte) string {
	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return ""
	}
	if content := stringField(raw, "content", "text"); content != "" {
		return content
	}
	if results, ok := raw["results"].([]any); ok {
		parts := make([]string, 0, len(results))
		for _, item := range results {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if value := stringField(m, "text", "content"); value != "" {
				parts = append(parts, value)
			}
		}
		return strings.Join(parts, "")
	}
	return ""
}

func volcenRealtimePayloadRef(payload []byte) string {
	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return ""
	}
	return firstNonEmptyAI(stringField(raw, "reply_id"), stringField(raw, "question_id"), stringField(raw, "dialog_id"))
}

func volcenRealtimePayloadMessage(payload []byte) string {
	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return string(payload)
	}
	return firstNonEmptyAI(stringField(raw, "error"), stringField(raw, "message"), stringField(raw, "status_message"), mustJSON(raw))
}

func mimeTypeForVolcenRealtimeAudio(format string) string {
	switch strings.TrimSpace(format) {
	case "pcm", "pcm_s16le":
		return "audio/L16"
	case "wav":
		return "audio/wav"
	case "mp3":
		return "audio/mpeg"
	default:
		return "audio/ogg"
	}
}

func redactVolcenTTSBody(body map[string]any) map[string]any {
	raw, _ := json.Marshal(body)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	if app, ok := out["app"].(map[string]any); ok {
		if token, ok := app["token"].(string); ok && token != "" {
			app["token"] = maskKey(token)
		}
	}
	return out
}

func parseVolcenVoiceCloneProfile(raw map[string]any, fallbackSpeakerID string, req media.VoiceCloneRequest) media.VoiceProfileResponse {
	voiceID := firstNonEmptyAI(
		stringField(raw, "speaker_id", "speakerID", "voice_id"),
		fallbackSpeakerID,
	)
	generatedVoiceID := firstNonEmptyAI(
		stringField(raw, "icl_speaker_id", "generated_voice_id"),
		voiceID,
	)
	status := int(floatField(raw, "status", "Status"))
	return media.VoiceProfileResponse{
		VoiceID:              voiceID,
		Name:                 req.Name,
		Description:          req.Description,
		PreviewURL:           stringField(raw, "demo_audio", "preview_url"),
		GeneratedVoiceID:     generatedVoiceID,
		RequiresVerification: status != 0 && status != 2 && status != 4,
		ProviderRef:          voiceID,
		Metadata:             raw,
	}
}

func parseVolcenVoiceDesignProfile(raw map[string]any, req media.VoiceDesignRequest) media.VoiceProfileResponse {
	payload := raw
	for _, key := range []string{"data", "result", "Result"} {
		if nested, ok := raw[key].(map[string]any); ok {
			payload = nested
			break
		}
	}
	voiceID := firstNonEmptyAI(
		stringField(payload, "speaker_id", "speakerID", "voice_id", "voiceID"),
		stringField(raw, "speaker_id", "speakerID", "voice_id", "voiceID"),
	)
	generatedVoiceID := firstNonEmptyAI(
		stringField(payload, "generated_voice_id", "generatedVoiceID", "voice_id", "voiceID"),
		stringField(raw, "generated_voice_id", "generatedVoiceID", "voice_id", "voiceID"),
		voiceID,
	)
	statusText := strings.ToLower(strings.TrimSpace(firstNonEmptyAI(
		stringField(payload, "status", "Status", "status_text", "statusText"),
		stringField(raw, "status", "Status", "status_text", "statusText"),
	)))
	statusCode := int(floatField(payload, "status", "Status", "status_code", "statusCode"))
	if statusCode == 0 {
		statusCode = int(floatField(raw, "status", "Status", "status_code", "statusCode"))
	}
	requiresVerification := false
	switch statusText {
	case "pending", "processing", "running", "creating", "auditing", "reviewing":
		requiresVerification = true
	case "success", "succeeded", "complete", "completed", "done", "ready", "passed":
		requiresVerification = false
	default:
		requiresVerification = statusCode != 0 && statusCode != 2 && statusCode != 4 && statusCode != 20000000
	}
	return media.VoiceProfileResponse{
		VoiceID:              voiceID,
		Name:                 req.Name,
		Description:          req.Description,
		PreviewURL:           firstNonEmptyAI(stringField(payload, "audio_url", "audioUrl", "demo_audio", "preview_url", "previewUrl"), stringField(raw, "audio_url", "audioUrl", "demo_audio", "preview_url", "previewUrl")),
		GeneratedVoiceID:     generatedVoiceID,
		RequiresVerification: requiresVerification,
		ProviderRef:          voiceID,
		Metadata:             raw,
	}
}

func volcenVoiceCloneError(raw map[string]any) error {
	for _, key := range []string{"BaseResp", "base_resp"} {
		base, ok := raw[key].(map[string]any)
		if !ok {
			continue
		}
		code := int(floatField(base, "StatusCode", "status_code", "code"))
		if code != 0 {
			message := stringField(base, "StatusMessage", "status_message", "message", "msg")
			return fmt.Errorf("%d %s", code, strings.TrimSpace(message))
		}
	}
	code := int(floatField(raw, "code", "Code"))
	if code != 0 {
		return fmt.Errorf("%d %s", code, strings.TrimSpace(stringField(raw, "message", "msg", "Message")))
	}
	return nil
}

func redactVolcenVoiceDesignBody(body map[string]any) map[string]any {
	raw, _ := json.Marshal(body)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	prompt, ok := out["prompt"].(map[string]any)
	if !ok {
		return out
	}
	imagePrompt, ok := prompt["image_prompt"].(map[string]any)
	if !ok {
		return out
	}
	if data, ok := imagePrompt["image_bytes"].(string); ok && data != "" {
		imagePrompt["image_bytes"] = fmt.Sprintf("(base64 image, %d chars)", len(data))
	}
	return out
}

func redactVolcenVoiceCloneBody(body map[string]any) map[string]any {
	raw, _ := json.Marshal(body)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	if audios, ok := out["audios"].([]any); ok {
		for _, item := range audios {
			audio, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if data, ok := audio["audio_bytes"].(string); ok && data != "" {
				audio["audio_bytes"] = fmt.Sprintf("(base64 audio, %d chars)", len(data))
			}
		}
	}
	return out
}

func volcenGeneratedSpeakerID(name string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '_' || r == '-':
			b.WriteRune('_')
		}
		if b.Len() >= 24 {
			break
		}
	}
	prefix := strings.Trim(b.String(), "_")
	if prefix == "" {
		prefix = "voice"
	}
	return fmt.Sprintf("S_%s_%d", prefix, time.Now().UnixNano())
}

func volcenASRHeaders(req *http.Request, appID, token, resourceID, requestID string) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Api-App-Key", appID)
	req.Header.Set("X-Api-Access-Key", token)
	req.Header.Set("X-Api-Resource-Id", resourceID)
	req.Header.Set("X-Api-Request-Id", requestID)
	req.Header.Set("X-Api-Sequence", "-1")
}

func redactedVolcenASRHeaders(appID, token, resourceID, requestID string) map[string]string {
	return map[string]string{
		"Content-Type":      "application/json",
		"X-Api-App-Key":     maskKey(appID),
		"X-Api-Access-Key":  maskKey(token),
		"X-Api-Resource-Id": resourceID,
		"X-Api-Request-Id":  requestID,
		"X-Api-Sequence":    "-1",
	}
}

func redactVolcenASRBody(body map[string]any) map[string]any {
	raw, _ := json.Marshal(body)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	if audio, ok := out["audio"].(map[string]any); ok {
		if data, ok := audio["data"].(string); ok && data != "" {
			audio["data"] = fmt.Sprintf("(base64 audio, %d chars)", len(data))
		}
	}
	return out
}

func volcenASRAudioFormat(mimeType string, params map[string]any) string {
	if format := stringParam(params, "format", ""); format != "" {
		return format
	}
	mimeType = strings.ToLower(strings.TrimSpace(mimeType))
	if idx := strings.Index(mimeType, ";"); idx >= 0 {
		mimeType = mimeType[:idx]
	}
	switch mimeType {
	case "audio/mpeg", "audio/mp3", "audio/mpga":
		return "mp3"
	case "audio/mp4", "audio/m4a", "audio/x-m4a":
		return "m4a"
	case "audio/wav", "audio/x-wav":
		return "wav"
	case "audio/ogg", "audio/opus":
		return "ogg"
	case "audio/webm":
		return "webm"
	case "audio/flac":
		return "flac"
	default:
		return "mp3"
	}
}

func volcenASRStatusComplete(status string) bool {
	return strings.TrimSpace(status) == "20000000"
}

func volcenASRStatusProcessing(status string) bool {
	switch strings.TrimSpace(status) {
	case "20000001", "20000002", "40000001":
		return true
	default:
		return false
	}
}

func volcenASRStatusFromBody(raw map[string]any) string {
	if header, ok := raw["header"].(map[string]any); ok {
		if code := stringField(header, "code", "status_code"); code != "" {
			return code
		}
		if code, ok := numberValue(header["code"]); ok {
			return fmt.Sprintf("%.0f", code)
		}
	}
	return ""
}

func volcenASRMessageFromBody(raw map[string]any) string {
	if header, ok := raw["header"].(map[string]any); ok {
		return stringField(header, "message", "msg")
	}
	return ""
}

func parseVolcenASRResult(raw map[string]any, language string) (media.TimingMetadata, string) {
	result, _ := raw["result"].(map[string]any)
	text := stringField(result, "text", "transcript")
	segments := parseVolcenASRUtterances(result["utterances"])
	if len(segments) == 0 && text != "" {
		segments = []media.TimedTextUnit{{ID: "segment_1", Text: text}}
	}
	durationMs := 0
	for _, segment := range segments {
		if segment.EndMs > durationMs {
			durationMs = segment.EndMs
		}
	}
	return media.TimingMetadata{
		Source:     media.TimingSourceSpeechToText,
		Provider:   "volcen",
		Language:   language,
		DurationMs: durationMs,
		Segments:   segments,
	}, text
}

func parseVolcenASRUtterances(value any) []media.TimedTextUnit {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]media.TimedTextUnit, 0, len(items))
	for i, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		unit := media.TimedTextUnit{
			ID:      fmt.Sprintf("utt_%d", i+1),
			Text:    stringField(m, "text", "utterance", "transcript"),
			StartMs: volcenASRTimeMs(m, "start_time", "start_ms", "start"),
			EndMs:   volcenASRTimeMs(m, "end_time", "end_ms", "end"),
			Speaker: stringField(m, "speaker", "speaker_id", "speaker_name"),
		}
		if confidence, ok := numberValue(m["confidence"]); ok {
			v := confidence
			unit.Confidence = &v
		}
		if unit.Text != "" {
			out = append(out, unit)
		}
	}
	return out
}

func volcenASRTimeMs(m map[string]any, keys ...string) int {
	for _, key := range keys {
		if value, ok := numberValue(m[key]); ok {
			if value > 0 && value < 100 && value != float64(int(value)) {
				return int(value * 1000)
			}
			return int(value)
		}
	}
	return 0
}

func boolParamOrDefault(params map[string]any, key string, fallback bool) bool {
	if value, ok := boolParam(params, key); ok {
		return value
	}
	return fallback
}

// convertVolcenToolCalls converts Volcengine SDK tool calls to the internal format.
func convertVolcenToolCalls(arkCalls []*arkmodel.ToolCall) []ToolCall {
	if len(arkCalls) == 0 {
		return nil
	}
	result := make([]ToolCall, 0, len(arkCalls))
	for _, tc := range arkCalls {
		result = append(result, ToolCall{
			ID:   tc.ID,
			Type: string(tc.Type),
			Function: ToolFunction{
				Name:      tc.Function.Name,
				Arguments: tc.Function.Arguments,
			},
		})
	}
	return result
}

// parseVolcenFunctionCallContent parses the <|FunctionCallBegin|>...<|FunctionCallEnd|> format
// that some Doubao models use when standard tool_calls are not returned.
// Returns the parsed tool calls and the remaining content with the marker stripped.
func parseVolcenFunctionCallContent(content string) ([]ToolCall, string) {
	const begin = "<|FunctionCallBegin|>"
	const end = "<|FunctionCallEnd|>"
	startIdx := strings.Index(content, begin)
	if startIdx < 0 {
		return nil, content
	}
	endIdx := strings.Index(content, end)
	if endIdx < 0 {
		return nil, content
	}
	jsonStr := content[startIdx+len(begin) : endIdx]
	remaining := strings.TrimSpace(content[:startIdx] + content[endIdx+len(end):])

	var calls []struct {
		Name       string          `json:"name"`
		Parameters json.RawMessage `json:"parameters"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &calls); err != nil {
		return nil, content
	}
	result := make([]ToolCall, 0, len(calls))
	for i, c := range calls {
		args := "{}"
		if len(c.Parameters) > 0 {
			args = string(c.Parameters)
		}
		result = append(result, ToolCall{
			ID:   fmt.Sprintf("call_%d", i),
			Type: "function",
			Function: ToolFunction{
				Name:      c.Name,
				Arguments: args,
			},
		})
	}
	return result, remaining
}

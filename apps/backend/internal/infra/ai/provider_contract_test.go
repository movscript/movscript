package ai

import (
	"github.com/movscript/movscript/internal/domain/media"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

var (
	_ providercontract.AIGatewayModelCatalog            = (*AIService)(nil)
	_ providercontract.AIGatewayRoutingPolicy           = (*AIService)(nil)
	_ providercontract.AIGatewayGovernancePolicy        = (*AIService)(nil)
	_ providercontract.AIGatewayUsageGovernor           = (*AIService)(nil)
	_ providercontract.AIGatewayCallAuditor             = (*AIService)(nil)
	_ providercontract.AIGatewayHealthProbe             = (*AIService)(nil)
	_ providercontract.AIGatewayProvider                = (*LocalAdapter)(nil)
	_ providercontract.AIGatewayTextStreamProvider      = (*LocalAdapter)(nil)
	_ providercontract.AIGatewayResponsesProvider       = (*LocalAdapter)(nil)
	_ providercontract.AIGatewayProvider                = (*OpenAIAdapter)(nil)
	_ providercontract.AIGatewayTextStreamProvider      = (*OpenAIAdapter)(nil)
	_ providercontract.AIGatewayResponsesProvider       = (*OpenAIAdapter)(nil)
	_ providercontract.AIGatewayVideoTaskProvider       = (*OpenAIAdapter)(nil)
	_ providercontract.AIGatewayVideoTaskCancelProvider = (*OpenAIAdapter)(nil)
	_ media.TTSProvider                                 = (*OpenAIAdapter)(nil)
	_ media.SubtitleProvider                            = (*OpenAIAdapter)(nil)
	_ providercontract.AIGatewayProvider                = (*NewAPIForwardAdapter)(nil)
	_ providercontract.AIGatewayTextStreamProvider      = (*NewAPIForwardAdapter)(nil)
	_ providercontract.AIGatewayResponsesProvider       = (*NewAPIForwardAdapter)(nil)
	_ providercontract.AIGatewayVideoTaskProvider       = (*NewAPIForwardAdapter)(nil)
	_ providercontract.AIGatewayVideoTaskCancelProvider = (*NewAPIForwardAdapter)(nil)
	_ media.TTSProvider                                 = (*NewAPIForwardAdapter)(nil)
	_ media.SubtitleProvider                            = (*NewAPIForwardAdapter)(nil)
	_ providercontract.AIGatewayVideoTaskCancelProvider = (*ViduAdapter)(nil)
	_ providercontract.AIGatewayVideoTaskCancelProvider = (*VolcenAdapter)(nil)
	_ providercontract.AIGatewayFileUploader            = (*OpenAIFileUploader)(nil)
	_ providercontract.AIGatewayFileUploader            = (*VolcenFileUploader)(nil)
)

package semantic

const ProposalDraftStatusValue = "draft"

func SemanticDraftStatus(input string) string {
	return FallbackString(input, ProposalDraftStatusValue)
}

func ProposalDraftStatus(input string) string {
	return SemanticDraftStatus(input)
}

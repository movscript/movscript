package semantic

const WorkspaceWorkspaceStatusValue = "workspace"

func SemanticWorkspaceStatus(input string) string {
	return FallbackString(input, WorkspaceWorkspaceStatusValue)
}

func WorkspaceWorkspaceStatus(input string) string {
	return SemanticWorkspaceStatus(input)
}

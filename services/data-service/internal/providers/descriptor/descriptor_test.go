package descriptor

import (
	"testing"

	"github.com/movscript/movscript/internal/providers/contract"
)

func TestBuiltInDescriptorLabelsStartupAdapters(t *testing.T) {
	tests := []struct {
		providerType string
		adapter      string
		label        string
	}{
		{contract.TypeDatabase, contract.AdapterSQLite, "SQLite"},
		{contract.TypeBlobStorage, contract.AdapterMinIO, "MinIO"},
		{contract.TypeWorkspaceRepository, contract.AdapterGitea, "Gitea"},
		{contract.TypeWorkspaceRepository, contract.AdapterGitHubSelfHosted, "GitHub Self-hosted"},
		{contract.TypeWorkspaceRepository, contract.AdapterGitLab, "GitLab"},
		{contract.TypeAIGateway, contract.AdapterLocal, "Local AI Gateway"},
		{contract.TypeCache, contract.AdapterRedis, "Redis"},
	}
	for _, tt := range tests {
		got := BuiltIn(tt.providerType, tt.adapter)
		if got.Type != tt.providerType || got.Adapter != tt.adapter || got.Label != tt.label || got.Assembly != contract.AssemblyStartup {
			t.Fatalf("BuiltIn(%q, %q) = %+v, want label %q startup descriptor", tt.providerType, tt.adapter, got, tt.label)
		}
		if got.ID == "" || got.Kind != "provider_descriptor" || got.Version == "" || len(got.Capabilities) == 0 {
			t.Fatalf("BuiltIn(%q, %q) descriptor metadata = %+v, want id/kind/version/capabilities", tt.providerType, tt.adapter, got)
		}
	}
}

func TestBuiltInDescriptorDeclaresAdapterCapabilities(t *testing.T) {
	got := BuiltIn(contract.TypeAIGateway, contract.AdapterLocal)
	want := map[string]bool{
		"model.list":       true,
		"model.resolve":    true,
		"chat.completions": true,
		"image.generate":   true,
		"video.generate":   true,
		"usage.reserve":    true,
		"usage.settle":     true,
	}
	for _, cap := range got.Capabilities {
		delete(want, cap)
	}
	if len(want) != 0 {
		t.Fatalf("local AI gateway capabilities = %+v, missing %+v", got.Capabilities, want)
	}

	vector := BuiltIn(contract.TypeVectorIndex, contract.AdapterPgVector)
	wantVector := map[string]bool{
		"vector.search": true,
		"health.probe":  true,
	}
	for _, cap := range vector.Capabilities {
		delete(wantVector, cap)
	}
	if len(wantVector) != 0 {
		t.Fatalf("pgvector capabilities = %+v, missing %+v", vector.Capabilities, wantVector)
	}

	for _, adapter := range []string{contract.AdapterGitHubSelfHosted, contract.AdapterGitLab} {
		repo := BuiltIn(contract.TypeWorkspaceRepository, adapter)
		wantRepo := map[string]bool{
			"repository.collaborator.ensure": true,
			"repository.access.probe":        true,
			"repository.clone_url.strategy":  true,
			"git.http_proxy":                 true,
		}
		for _, cap := range repo.Capabilities {
			delete(wantRepo, cap)
		}
		if len(wantRepo) != 0 {
			t.Fatalf("%s capabilities = %+v, missing %+v", adapter, repo.Capabilities, wantRepo)
		}
	}
}

func TestBuiltInDescriptorFallsBackToAdapterName(t *testing.T) {
	got := BuiltIn("future_provider", "future-adapter")
	if got.Label != "future-adapter" {
		t.Fatalf("BuiltIn fallback label = %q, want adapter name", got.Label)
	}
}

func TestBuiltInsIncludesStartupProviderSurface(t *testing.T) {
	got := BuiltIns()
	seen := map[string]bool{}
	for _, desc := range got {
		seen[desc.Type+":"+desc.Adapter] = true
		if desc.Assembly != contract.AssemblyStartup {
			t.Fatalf("BuiltIns descriptor = %+v, want startup assembly", desc)
		}
	}
	for _, key := range []string{
		contract.TypeDatabase + ":" + contract.AdapterSQLite,
		contract.TypeDatabase + ":" + contract.AdapterPostgres,
		contract.TypeBlobStorage + ":" + contract.AdapterFilesystem,
		contract.TypeBlobStorage + ":" + contract.AdapterMinIO,
		contract.TypeWorkspaceRepository + ":" + contract.AdapterGitHTTP,
		contract.TypeWorkspaceRepository + ":" + contract.AdapterGitea,
		contract.TypeWorkspaceRepository + ":" + contract.AdapterGitHubSelfHosted,
		contract.TypeWorkspaceRepository + ":" + contract.AdapterGitLab,
		contract.TypeAIGateway + ":" + contract.AdapterLocal,
		contract.TypeCache + ":" + contract.AdapterRedis,
		contract.TypeVectorIndex + ":" + contract.AdapterLocalIndex,
		contract.TypeMediaProcessing + ":" + contract.AdapterDesktopManagedMedia,
		contract.TypeMediaProcessing + ":" + contract.AdapterExternalMediaWorker,
		contract.TypeExternalResource + ":" + contract.AdapterPexels,
		contract.TypeAgentRuntime + ":" + contract.AdapterDesktopManagedAgent,
		contract.TypeAgentRuntime + ":" + contract.AdapterRemoteAgentRuntime,
		contract.TypeAgentRuntime + ":" + contract.AdapterMova,
	} {
		if !seen[key] {
			t.Fatalf("BuiltIns missing %s in %+v", key, got)
		}
	}
}

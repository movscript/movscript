package descriptor

import (
	"strings"

	"github.com/movscript/movscript/internal/providers/contract"
)

type Descriptor struct {
	ID           string   `json:"id"`
	Kind         string   `json:"kind"`
	Type         string   `json:"type"`
	Adapter      string   `json:"adapter"`
	Label        string   `json:"label"`
	Version      string   `json:"version"`
	Assembly     string   `json:"assembly"`
	Capabilities []string `json:"capabilities"`
}

func BuiltIns() []Descriptor {
	pairs := []struct {
		providerType string
		adapter      string
	}{
		{contract.TypeDatabase, contract.AdapterSQLite},
		{contract.TypeDatabase, contract.AdapterPostgres},
		{contract.TypeBlobStorage, contract.AdapterFilesystem},
		{contract.TypeBlobStorage, contract.AdapterMinIO},
		{contract.TypeWorkspaceRepository, contract.AdapterGitHTTP},
		{contract.TypeWorkspaceRepository, contract.AdapterGitea},
		{contract.TypeWorkspaceRepository, contract.AdapterGitHubEnterprise},
		{contract.TypeWorkspaceRepository, contract.AdapterGitLab},
		{contract.TypeAIGateway, contract.AdapterLocal},
		{contract.TypeAIGateway, contract.AdapterBuiltin},
		{contract.TypeAIGateway, contract.AdapterNewAPI},
		{contract.TypeCache, contract.AdapterMemory},
		{contract.TypeCache, contract.AdapterRedis},
		{contract.TypeCache, contract.AdapterNoop},
		{contract.TypeVectorIndex, contract.AdapterLocalIndex},
		{contract.TypeVectorIndex, contract.AdapterPgVector},
		{contract.TypeVectorIndex, contract.AdapterQdrant},
		{contract.TypeMediaProcessing, contract.AdapterDesktopManagedMedia},
		{contract.TypeMediaProcessing, contract.AdapterExternalMediaWorker},
		{contract.TypeExternalResource, contract.AdapterPexels},
		{contract.TypeExternalResource, contract.AdapterPixabay},
		{contract.TypeAgentRuntime, contract.AdapterDesktopManagedAgent},
		{contract.TypeAgentRuntime, contract.AdapterRemoteAgentRuntime},
		{contract.TypeAgentRuntime, contract.AdapterMova},
		{contract.TypeAgentRuntime, contract.AdapterAppServer},
	}
	out := make([]Descriptor, 0, len(pairs))
	for _, pair := range pairs {
		out = append(out, BuiltIn(pair.providerType, pair.adapter))
	}
	return out
}

func BuiltIn(providerType string, adapter string) Descriptor {
	providerType = strings.TrimSpace(providerType)
	adapter = strings.TrimSpace(adapter)
	return Descriptor{
		ID:           id(providerType, adapter),
		Kind:         "provider_descriptor",
		Type:         providerType,
		Adapter:      adapter,
		Label:        label(providerType, adapter),
		Version:      "1.0.0",
		Assembly:     contract.AssemblyStartup,
		Capabilities: capabilities(providerType, adapter),
	}
}

func id(providerType string, adapter string) string {
	if providerType == "" || adapter == "" {
		return ""
	}
	return "provider." + strings.ReplaceAll(providerType, "_", "-") + "." + strings.ReplaceAll(adapter, "_", "-")
}

func label(providerType string, adapter string) string {
	switch providerType + ":" + adapter {
	case contract.TypeDatabase + ":" + contract.AdapterSQLite:
		return "SQLite"
	case contract.TypeDatabase + ":" + contract.AdapterPostgres:
		return "PostgreSQL"
	case contract.TypeBlobStorage + ":" + contract.AdapterFilesystem:
		return "Filesystem"
	case contract.TypeBlobStorage + ":" + contract.AdapterMinIO:
		return "MinIO"
	case contract.TypeWorkspaceRepository + ":" + contract.AdapterGitHTTP:
		return "Local Git HTTP"
	case contract.TypeWorkspaceRepository + ":" + contract.AdapterGitea:
		return "Gitea"
	case contract.TypeWorkspaceRepository + ":" + contract.AdapterGitHubEnterprise:
		return "GitHub Enterprise"
	case contract.TypeWorkspaceRepository + ":" + contract.AdapterGitLab:
		return "GitLab"
	case contract.TypeAIGateway + ":" + contract.AdapterLocal:
		return "Local AI Gateway"
	case contract.TypeAIGateway + ":" + contract.AdapterBuiltin:
		return "Built-in AI Gateway"
	case contract.TypeAIGateway + ":" + contract.AdapterNewAPI:
		return "new-api"
	case contract.TypeCache + ":" + contract.AdapterMemory:
		return "Memory"
	case contract.TypeCache + ":" + contract.AdapterRedis:
		return "Redis"
	case contract.TypeCache + ":" + contract.AdapterNoop:
		return "No-op"
	case contract.TypeVectorIndex + ":" + contract.AdapterLocalIndex:
		return "Local Vector Index"
	case contract.TypeVectorIndex + ":" + contract.AdapterPgVector:
		return "pgvector"
	case contract.TypeVectorIndex + ":" + contract.AdapterQdrant:
		return "Qdrant"
	case contract.TypeMediaProcessing + ":" + contract.AdapterDesktopManagedMedia:
		return "Desktop-managed Media Runtime"
	case contract.TypeMediaProcessing + ":" + contract.AdapterExternalMediaWorker:
		return "External Media Worker"
	case contract.TypeExternalResource + ":" + contract.AdapterPexels:
		return "Pexels"
	case contract.TypeExternalResource + ":" + contract.AdapterPixabay:
		return "Pixabay"
	case contract.TypeAgentRuntime + ":" + contract.AdapterDesktopManagedAgent:
		return "Desktop-managed Agent Runtime"
	case contract.TypeAgentRuntime + ":" + contract.AdapterRemoteAgentRuntime:
		return "Remote Agent Runtime"
	case contract.TypeAgentRuntime + ":" + contract.AdapterMova:
		return "Mova"
	case contract.TypeAgentRuntime + ":" + contract.AdapterAppServer:
		return "App Server"
	default:
		if adapter == "" {
			return "Not configured"
		}
		return adapter
	}
}

func capabilities(providerType string, adapter string) []string {
	switch providerType + ":" + adapter {
	case contract.TypeDatabase + ":" + contract.AdapterSQLite,
		contract.TypeDatabase + ":" + contract.AdapterPostgres:
		return []string{"metadata.persistence", "transaction.sql", "migration.schema", "health.probe"}
	case contract.TypeBlobStorage + ":" + contract.AdapterFilesystem:
		return []string{"blob.put", "blob.get", "blob.range_read", "blob.delete", "blob.direct_url", "health.probe"}
	case contract.TypeBlobStorage + ":" + contract.AdapterMinIO:
		return []string{"blob.put", "blob.get", "blob.range_read", "blob.delete", "blob.presign_get", "blob.direct_url", "health.probe"}
	case contract.TypeWorkspaceRepository + ":" + contract.AdapterGitHTTP:
		return []string{"repository.ensure", "repository.clone_url", "repository.clone_url.strategy", "git.http_proxy"}
	case contract.TypeWorkspaceRepository + ":" + contract.AdapterGitea:
		return []string{"repository.ensure", "repository.user.ensure", "repository.collaborator.ensure", "repository.clone_url", "repository.clone_url.strategy", "git.http_proxy"}
	case contract.TypeWorkspaceRepository + ":" + contract.AdapterGitHubEnterprise:
		return []string{"repository.ensure", "repository.collaborator.ensure", "repository.access.probe", "repository.clone_url", "repository.clone_url.strategy", "git.http_proxy", "health.probe"}
	case contract.TypeWorkspaceRepository + ":" + contract.AdapterGitLab:
		return []string{"repository.ensure", "repository.collaborator.ensure", "repository.access.probe", "repository.clone_url", "repository.clone_url.strategy", "git.http_proxy", "health.probe"}
	case contract.TypeAIGateway + ":" + contract.AdapterLocal:
		return []string{"model.list", "model.resolve", "chat.completions", "image.generate", "video.generate", "usage.reserve", "usage.settle", "audit.record", "health.probe", "runtime_health.snapshot"}
	case contract.TypeAIGateway + ":" + contract.AdapterBuiltin:
		return []string{"model.list", "model.resolve", "chat.completions", "image.generate", "video.generate", "file.upload", "usage.reserve", "usage.settle", "audit.record", "health.probe", "runtime_health.snapshot"}
	case contract.TypeAIGateway + ":" + contract.AdapterNewAPI:
		return []string{"model.list", "model.resolve", "chat.completions", "responses", "image.generate", "video.generate", "file.upload", "usage.query", "usage.reserve", "usage.settle", "audit.record", "health.probe", "runtime_health.snapshot"}
	case contract.TypeCache + ":" + contract.AdapterMemory,
		contract.TypeCache + ":" + contract.AdapterRedis:
		return []string{"cache.get_json", "cache.set_json", "cache.delete", "cache.version"}
	case contract.TypeCache + ":" + contract.AdapterNoop:
		return []string{"cache.noop"}
	case contract.TypeVectorIndex + ":" + contract.AdapterLocalIndex,
		contract.TypeVectorIndex + ":" + contract.AdapterPgVector,
		contract.TypeVectorIndex + ":" + contract.AdapterQdrant:
		return []string{"vector.upsert", "vector.search", "vector.delete", "vector.stats", "vector.rebuild", "health.probe"}
	case contract.TypeMediaProcessing + ":" + contract.AdapterDesktopManagedMedia:
		return []string{"media.desktop_runtime", "media.local_export", "media.local_clip"}
	case contract.TypeMediaProcessing + ":" + contract.AdapterExternalMediaWorker:
		return []string{"media.worker.submit", "media.worker.status", "media.worker.result"}
	case contract.TypeExternalResource + ":" + contract.AdapterPexels,
		contract.TypeExternalResource + ":" + contract.AdapterPixabay:
		return []string{"external_resource.search", "external_resource.attribution"}
	case contract.TypeAgentRuntime + ":" + contract.AdapterDesktopManagedAgent:
		return []string{"agent_runtime.desktop", "agent_session.local", "agent_tool.local"}
	case contract.TypeAgentRuntime + ":" + contract.AdapterRemoteAgentRuntime:
		return []string{
			contract.AgentRuntimeCapabilityRemote,
			contract.AgentRuntimeCapabilitySessionProxy,
			contract.AgentRuntimeCapabilityPermissionProbe,
		}
	case contract.TypeAgentRuntime + ":" + contract.AdapterMova,
		contract.TypeAgentRuntime + ":" + contract.AdapterAppServer:
		return []string{"agent_runtime.ensure", "agent_session.start", "agent_session.message", "agent_tool.list", "agent_session.stop"}
	default:
		return nil
	}
}

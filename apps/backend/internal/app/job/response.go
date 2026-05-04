package job

import (
	"context"

	"github.com/movscript/movscript/internal/model"
)

type Response struct {
	model.Job
	InputResources  []model.RawResource  `json:"input_resources,omitempty"`
	ModelConfig     *model.AIModelConfig `json:"model_config,omitempty"`
	ProviderName    string               `json:"provider_name,omitempty"`
	ModelDisplay    string               `json:"model_display,omitempty"`
	ModelIdentifier string               `json:"model_identifier,omitempty"`
}

type ResourceURLFunc func(uint) string

func (s *Service) BuildResponses(ctx context.Context, jobs []model.Job, resourceURL ResourceURLFunc) []Response {
	if len(jobs) == 0 {
		return []Response{}
	}

	resourceIDSet := make(map[uint]bool)
	modelConfigIDSet := make(map[uint]bool)
	for i := range jobs {
		if jobs[i].OutputResource != nil && resourceURL != nil {
			jobs[i].OutputResource.URL = resourceURL(jobs[i].OutputResource.ID)
		}
		modelConfigIDSet[jobs[i].ModelConfigID] = true
		for _, id := range ParseInputIDs(jobs[i]) {
			resourceIDSet[id] = true
		}
	}

	resourceIDs := make([]uint, 0, len(resourceIDSet))
	for id := range resourceIDSet {
		resourceIDs = append(resourceIDs, id)
	}

	modelConfigIDs := make([]uint, 0, len(modelConfigIDSet))
	for id := range modelConfigIDSet {
		modelConfigIDs = append(modelConfigIDs, id)
	}

	lookups, err := s.ResponseLookups(ctx, resourceIDs, modelConfigIDs)
	if err != nil {
		return []Response{}
	}
	if resourceURL != nil {
		for id, resource := range lookups.ResourcesByID {
			resource.URL = resourceURL(resource.ID)
			lookups.ResourcesByID[id] = resource
		}
	}

	resp := make([]Response, 0, len(jobs))
	for _, job := range jobs {
		item := Response{Job: job}
		inputIDs := ParseInputIDs(job)
		item.InputResources = make([]model.RawResource, 0, len(inputIDs))
		seenResources := make(map[uint]bool, len(inputIDs))
		for _, id := range inputIDs {
			if seenResources[id] {
				continue
			}
			seenResources[id] = true
			if r, ok := lookups.ResourcesByID[id]; ok {
				item.InputResources = append(item.InputResources, r)
			}
		}
		if cfg, ok := lookups.ConfigsByID[job.ModelConfigID]; ok {
			cfgCopy := cfg
			item.ModelConfig = &cfgCopy
			item.ModelDisplay = ModelDisplay(cfg)
			item.ModelIdentifier = ModelIdentifier(cfg)
			if cred, ok := lookups.CredentialsByID[cfg.CredentialID]; ok {
				item.ProviderName = cred.DisplayName
			}
		}
		resp = append(resp, item)
	}
	return resp
}

package commercial

import "context"

type DeploymentMode string

const (
	DeploymentPersonalLocal     DeploymentMode = "personal-local"
	DeploymentSelfHostedTeam    DeploymentMode = "self-hosted-team"
	DeploymentHostedCloud       DeploymentMode = "hosted-cloud"
	DeploymentEnterprisePrivate DeploymentMode = "enterprise-private"
)

type Plan string

const (
	PlanPersonal   Plan = "personal"
	PlanFree       Plan = "free"
	PlanTeam       Plan = "team"
	PlanEnterprise Plan = "enterprise"
)

type Status string

const (
	StatusActive    Status = "active"
	StatusTrialing  Status = "trialing"
	StatusPastDue   Status = "past_due"
	StatusSuspended Status = "suspended"
)

type Capability string

const (
	CapabilityLocalWorkspace        Capability = "workspace.local"
	CapabilitySelfHostedWorkspace   Capability = "workspace.self_hosted"
	CapabilityBasicCollaboration    Capability = "collaboration.basic"
	CapabilityBasicGateway          Capability = "gateway.basic"
	CapabilityGatewayAPIKeys        Capability = "gateway.api_keys"
	CapabilityOrgBudget             Capability = "billing.org_budget"
	CapabilityUsageLogging          Capability = "billing.usage_logging"
	CapabilityBasicAudit            Capability = "audit.basic"
	CapabilityAuditExport           Capability = "audit.export"
	CapabilityEnterpriseLicense     Capability = "license.enterprise"
	CapabilitySSO                   Capability = "identity.sso"
	CapabilitySCIM                  Capability = "identity.scim"
	CapabilityHostedStorage         Capability = "storage.hosted"
	CapabilityHostedWorker          Capability = "worker.hosted"
	CapabilityCommercialMarketplace Capability = "marketplace.commercial"
)

type SubjectRef struct {
	UserID    uint  `json:"user_id"`
	OrgID     *uint `json:"org_id,omitempty"`
	ProjectID *uint `json:"project_id,omitempty"`
}

type Decision struct {
	Allowed bool   `json:"allowed"`
	Code    string `json:"code,omitempty"`
	Reason  string `json:"reason,omitempty"`
}

type LimitSnapshot struct {
	MonthlyBudget float64 `json:"monthly_budget,omitempty"`
}

type EntitlementSnapshot struct {
	Subject             SubjectRef      `json:"subject"`
	Plan                Plan            `json:"plan"`
	Status              Status          `json:"status"`
	DeploymentMode      DeploymentMode  `json:"deployment_mode"`
	EnabledCapabilities []Capability    `json:"enabled_capabilities"`
	Limits              LimitSnapshot   `json:"limits"`
	CommercialFlags     map[string]bool `json:"commercial_flags"`
}

type EntitlementService interface {
	Resolve(ctx context.Context, subject SubjectRef) (EntitlementSnapshot, error)
	CanUse(ctx context.Context, subject SubjectRef, capability Capability) (Decision, error)
	CanAccessFeature(ctx context.Context, subject SubjectRef, featureKey string) (Decision, error)
}

type ModelAccessPolicy struct {
	Allowed          bool     `json:"allowed"`
	Reason           string   `json:"reason,omitempty"`
	AllowedModelIDs  []uint   `json:"allowed_model_ids,omitempty"`
	AllowedProviders []string `json:"allowed_providers,omitempty"`
}

type GatewayPolicyService interface {
	ResolveModelAccess(ctx context.Context, subject SubjectRef, featureKey string) (ModelAccessPolicy, error)
	CanSeeRawKey(ctx context.Context, subject SubjectRef, orgID uint) (bool, error)
}

type UsageRequest struct {
	Capability      string  `json:"capability"`
	FeatureKey      string  `json:"feature_key,omitempty"`
	EstimatedCost   float64 `json:"estimated_cost"`
	GatewayAPIKeyID *uint   `json:"gateway_api_key_id,omitempty"`
}

type UsageEstimate struct {
	EstimatedCost float64 `json:"estimated_cost"`
}

type Reservation struct {
	ID            uint    `json:"id"`
	EstimatedCost float64 `json:"estimated_cost"`
}

type UsageResult struct {
	ActualCost float64 `json:"actual_cost"`
}

type QuotaService interface {
	Estimate(ctx context.Context, subject SubjectRef, req UsageRequest) (UsageEstimate, error)
	Reserve(ctx context.Context, subject SubjectRef, estimate UsageEstimate) (Reservation, error)
	Settle(ctx context.Context, reservationID uint, actual UsageResult) error
	Release(ctx context.Context, reservationID uint, reason string) error
}

type AuditEvent struct {
	ActorID        *uint           `json:"actor_id,omitempty"`
	Subject        SubjectRef      `json:"subject"`
	Action         string          `json:"action"`
	TargetType     string          `json:"target_type,omitempty"`
	TargetID       string          `json:"target_id,omitempty"`
	Plan           Plan            `json:"plan,omitempty"`
	PolicyDecision *Decision       `json:"policy_decision,omitempty"`
	UsageRefs      map[string]uint `json:"usage_refs,omitempty"`
	Metadata       map[string]any  `json:"metadata,omitempty"`
}

type AuditSink interface {
	Record(ctx context.Context, event AuditEvent) error
}

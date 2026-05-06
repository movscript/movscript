package commercial

import "context"

type Money struct {
	Currency string  `json:"currency"`
	Amount   float64 `json:"amount"`
}

type WalletStatus string

const (
	WalletStatusActive    WalletStatus = "active"
	WalletStatusSuspended WalletStatus = "suspended"
)

type WalletSnapshot struct {
	Subject SubjectRef   `json:"subject"`
	Status  WalletStatus `json:"status"`
	Balance Money        `json:"balance"`
}

type LedgerEntryType string

const (
	LedgerEntryCredit  LedgerEntryType = "credit"
	LedgerEntryDebit   LedgerEntryType = "debit"
	LedgerEntryRefund  LedgerEntryType = "refund"
	LedgerEntryHold    LedgerEntryType = "hold"
	LedgerEntryRelease LedgerEntryType = "release"
)

type LedgerEntry struct {
	ID          uint            `json:"id"`
	Subject     SubjectRef      `json:"subject"`
	Type        LedgerEntryType `json:"type"`
	Amount      Money           `json:"amount"`
	ReferenceID string          `json:"reference_id,omitempty"`
	Metadata    map[string]any  `json:"metadata,omitempty"`
}

type WalletService interface {
	GetWallet(ctx context.Context, subject SubjectRef) (WalletSnapshot, error)
	ListLedger(ctx context.Context, subject SubjectRef) ([]LedgerEntry, error)
	Hold(ctx context.Context, subject SubjectRef, amount Money, referenceID string) (LedgerEntry, error)
	Capture(ctx context.Context, ledgerEntryID uint, actual Money) error
	Release(ctx context.Context, ledgerEntryID uint, reason string) error
}

type PaymentProvider string

const (
	PaymentProviderStripe PaymentProvider = "stripe"
	PaymentProviderAlipay PaymentProvider = "alipay"
	PaymentProviderWechat PaymentProvider = "wechat"
)

type PaymentStatus string

const (
	PaymentStatusPending   PaymentStatus = "pending"
	PaymentStatusSucceeded PaymentStatus = "succeeded"
	PaymentStatusFailed    PaymentStatus = "failed"
	PaymentStatusRefunded  PaymentStatus = "refunded"
)

type PaymentIntent struct {
	ID          uint            `json:"id"`
	Provider    PaymentProvider `json:"provider"`
	Status      PaymentStatus   `json:"status"`
	Amount      Money           `json:"amount"`
	Subject     SubjectRef      `json:"subject"`
	ReferenceID string          `json:"reference_id,omitempty"`
}

type PaymentIntentInput struct {
	Subject     SubjectRef      `json:"subject"`
	Amount      Money           `json:"amount"`
	Provider    PaymentProvider `json:"provider"`
	ReferenceID string          `json:"reference_id,omitempty"`
	Metadata    map[string]any  `json:"metadata,omitempty"`
}

type PaymentNotification struct {
	Provider    PaymentProvider `json:"provider"`
	IntentID    string          `json:"intent_id"`
	Status      PaymentStatus   `json:"status"`
	Amount      Money           `json:"amount"`
	ReferenceID string          `json:"reference_id,omitempty"`
}

type PaymentService interface {
	CreateIntent(ctx context.Context, input PaymentIntentInput) (PaymentIntent, error)
	HandleNotification(ctx context.Context, notification PaymentNotification) error
}

type OrderStatus string

const (
	OrderStatusPending   OrderStatus = "pending"
	OrderStatusPaid      OrderStatus = "paid"
	OrderStatusCancelled OrderStatus = "cancelled"
)

type OrderLine struct {
	Name     string `json:"name"`
	Quantity int    `json:"quantity"`
	Unit     Money  `json:"unit"`
}

type Order struct {
	ID        uint        `json:"id"`
	Subject   SubjectRef  `json:"subject"`
	Status    OrderStatus `json:"status"`
	Total     Money       `json:"total"`
	Lines     []OrderLine `json:"lines"`
	Reference string      `json:"reference,omitempty"`
}

type InvoiceStatus string

const (
	InvoiceStatusDraft  InvoiceStatus = "draft"
	InvoiceStatusIssued InvoiceStatus = "issued"
	InvoiceStatusPaid   InvoiceStatus = "paid"
	InvoiceStatusVoided InvoiceStatus = "voided"
)

type Invoice struct {
	ID      uint          `json:"id"`
	OrderID uint          `json:"order_id"`
	Status  InvoiceStatus `json:"status"`
	Total   Money         `json:"total"`
}

type SubscriptionStatus string

const (
	SubscriptionStatusActive   SubscriptionStatus = "active"
	SubscriptionStatusTrialing SubscriptionStatus = "trialing"
	SubscriptionStatusPastDue  SubscriptionStatus = "past_due"
	SubscriptionStatusCanceled SubscriptionStatus = "canceled"
)

type Subscription struct {
	ID       uint               `json:"id"`
	Subject  SubjectRef         `json:"subject"`
	Status   SubscriptionStatus `json:"status"`
	Plan     Plan               `json:"plan"`
	StartsAt string             `json:"starts_at,omitempty"`
	EndsAt   string             `json:"ends_at,omitempty"`
}

type CommerceService interface {
	Wallet() WalletService
	Payments() PaymentService
}

package mail

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"
)

var ErrInvalidConfig = errors.New("invalid mail config")

type SMTPConfig struct {
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username,omitempty"`
	Password    string `json:"password,omitempty"`
	FromEmail   string `json:"from_email"`
	FromName    string `json:"from_name,omitempty"`
	UseTLS      bool   `json:"use_tls"`
	UseStartTLS bool   `json:"use_start_tls"`
}

type Message struct {
	To      string
	Subject string
	Text    string
}

type Sender interface {
	Send(ctx context.Context, cfg SMTPConfig, msg Message) error
}

type SMTPSender struct{}

func (SMTPSender) Send(ctx context.Context, cfg SMTPConfig, msg Message) error {
	cfg = NormalizeSMTPConfig(cfg)
	if err := ValidateSMTPConfig(cfg); err != nil {
		return err
	}
	to := strings.TrimSpace(msg.To)
	if to == "" || strings.TrimSpace(msg.Subject) == "" || strings.TrimSpace(msg.Text) == "" {
		return ErrInvalidConfig
	}
	addr := net.JoinHostPort(cfg.Host, fmt.Sprint(cfg.Port))
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return err
	}
	defer conn.Close()
	if cfg.UseTLS {
		tlsConn := tls.Client(conn, &tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12})
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			return err
		}
		conn = tlsConn
	}
	client, err := smtp.NewClient(conn, cfg.Host)
	if err != nil {
		return err
	}
	defer client.Close()
	if cfg.UseStartTLS {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12}); err != nil {
				return err
			}
		}
	}
	if cfg.Username != "" || cfg.Password != "" {
		if err := client.Auth(smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)); err != nil {
			return err
		}
	}
	if err := client.Mail(cfg.FromEmail); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write([]byte(formatMessage(cfg, msg))); err != nil {
		_ = w.Close()
		return err
	}
	return w.Close()
}

func NormalizeSMTPConfig(cfg SMTPConfig) SMTPConfig {
	cfg.Host = strings.TrimSpace(cfg.Host)
	cfg.Username = strings.TrimSpace(cfg.Username)
	cfg.FromEmail = strings.TrimSpace(cfg.FromEmail)
	cfg.FromName = strings.TrimSpace(cfg.FromName)
	if cfg.Port == 0 {
		cfg.Port = 587
	}
	if !cfg.UseTLS && !cfg.UseStartTLS {
		cfg.UseStartTLS = true
	}
	return cfg
}

func ValidateSMTPConfig(cfg SMTPConfig) error {
	if strings.TrimSpace(cfg.Host) == "" || cfg.Port <= 0 || strings.TrimSpace(cfg.FromEmail) == "" {
		return ErrInvalidConfig
	}
	if strings.ContainsAny(cfg.FromEmail, "\r\n") {
		return ErrInvalidConfig
	}
	return nil
}

func formatMessage(cfg SMTPConfig, msg Message) string {
	from := cfg.FromEmail
	if cfg.FromName != "" {
		from = fmt.Sprintf("%s <%s>", headerSafe(cfg.FromName), cfg.FromEmail)
	}
	return strings.Join([]string{
		"From: " + from,
		"To: " + headerSafe(msg.To),
		"Subject: " + headerSafe(msg.Subject),
		"Content-Type: text/plain; charset=UTF-8",
		"",
		msg.Text,
	}, "\r\n")
}

func headerSafe(value string) string {
	value = strings.ReplaceAll(value, "\r", "")
	return strings.ReplaceAll(value, "\n", "")
}

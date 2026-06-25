# @movscript/auth-client

Shared AuthProvider contracts and Auth Service client helpers for MovScript application owners, MCP hosts, surfaces, and services.

This package does not implement the Auth Service server. It defines the client-side `AuthContext` contract, providers for opaque-key, local-owner, no-auth, and test flows, plus Auth Service client helpers for introspection and explicit management-token-protected opaque key issue/revoke calls.

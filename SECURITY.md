# Security Policy

## Supported Versions

Currently, only the latest deployment on the `master` branch (or production deployment) is supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please prioritize reporting it via email rather than opening a public issue.

**Email:** [jxjin2010@gmail.com]

For sensitive issues, please provide:
1.  Type of issue (e.g., SQL Injection, XSS, RLS Bypass).
2.  Steps to reproduce.
3.  Impact assessment.

## Security Measures

This project implements several security layers to protect ticket data and personal information:

### 1. Database (Supabase)
*   **Row Level Security (RLS)**: Enforced on all tables. Public access is strictly verified via Postgres functions and policies.
*   **Secure RPC**: Sensitive operations (e.g., check-in, seat updates) are wrapped in `SECURITY DEFINER` functions to prevent unauthorized direct table manipulation.
*   **Minimal Exposure**: `anon` role has `SELECT` only permissions where strictly necessary.

### 2. Backend (Google Apps Script)
*   **Source Validation**: API endpoints verify the origin and valid session tokens where applicable.
*   **Environment Variables**: API keys and secrets are managed via Script Properties, not hardcoded in the repository.
*   **Access Control**: Admin API endpoints require authentication via encrypted session tokens.

### 3. Frontend
*   **Sanitization**: All user inputs are sanitized before rendering to prevent XSS.
*   **Caching**: `localStorage` is used for non-sensitive master data only. Personal information is not persistently stored in client storage beyond the active session.

## Responsible Disclosure

We ask that you allow us reasonable time to fix the issue before public disclosure. We will make every effort to acknowledge your report and address valid vulnerabilities promptly.

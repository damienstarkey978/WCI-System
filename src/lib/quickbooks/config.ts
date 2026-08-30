/**
 * QuickBooks Online endpoint hosts and scopes, per
 * https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
 *
 * The OAuth authorize/token endpoints are the same for sandbox and production — only
 * the *data* API hosts differ by environment (accountingBaseUrl below).
 */

export const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

/**
 * Accounting scope only — Customers/Invoices sync (this phase's scope) needs nothing
 * else. Payments requires separate app enablement and isn't used here.
 */
export const QBO_SCOPES = "com.intuit.quickbooks.accounting";

export function accountingBaseUrl(environment: "sandbox" | "production"): string {
  return environment === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com";
}

import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { setCookie } from "hono/cookie";
import {
	AuthResponseSchema,
	GuestLoginRequestSchema,
	SendCodeRequestSchema,
	VerifyCodeRequestSchema,
	GenerateInvitationRequestSchema,
} from "./auth.schemas";
import {
	sendVerificationCode,
	verifyCodeAndLogin,
	createGuestUser,
	createInvitationCode,
	listInvitationCodes,
} from "./auth.service";
import { getConfig } from "../../config";
import { resolveAuth, type AuthPayload } from "../../middleware/auth";

export const authRouter = new Hono<AppEnv>();

const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;
const ONE_DAY_SECONDS = 24 * 60 * 60;

function resolveCookieOptions(hostHeader?: string, isGuest = false) {
	const host = (hostHeader || "").toLowerCase().split(":")[0];
	const isLocalhost =
		host.includes("localhost") || host.includes("127.0.0.1");

	const maxAge = isGuest ? ONE_DAY_SECONDS : ONE_WEEK_SECONDS;

	if (isLocalhost) {
		return {
			path: "/",
			sameSite: "Lax" as const,
			secure: false,
			httpOnly: false,
			maxAge,
		};
	}

	const domain = host.endsWith(".tapcanvas.com")
		? ".tapcanvas.com"
		: host === "tapcanvas.com"
			? ".tapcanvas.com"
			: undefined;

	return {
		path: "/",
		sameSite: "None" as const,
		secure: true,
		httpOnly: false,
		maxAge,
		...(domain ? { domain } : {}),
	};
}

function attachAuthCookie(c: any, token: string, isGuest = false) {
	const options = resolveCookieOptions(c.req.header("host"), isGuest);
	setCookie(c, "tap_token", token, options);
}

function normalizeRedirectTarget(
	raw: string | null,
	base?: string | null
): string | null {
	if (!raw) return null;
	try {
		const candidate = base ? new URL(raw, base) : new URL(raw);
		if (
			candidate.protocol === "http:" ||
			candidate.protocol === "https:"
		) {
			return candidate.toString();
		}
		return null;
	} catch {
		return null;
	}
}

function buildLoginRedirectUrl(
	loginUrl: string | null,
	redirectTarget: string | null
): string | null {
	if (!loginUrl) return null;
	try {
		const url = new URL(loginUrl);
		if (redirectTarget) {
			url.searchParams.set("redirect", redirectTarget);
		}
		return url.toString();
	} catch {
		if (!redirectTarget) return loginUrl;
		const separator = loginUrl.includes("?") ? "&" : "?";
		return `${loginUrl}${separator}redirect=${encodeURIComponent(
			redirectTarget
		)}`;
	}
}

function appendAuthParams(
	redirectTarget: string,
	token: string,
	user: AuthPayload
): string | null {
	try {
		const url = new URL(redirectTarget);
		url.searchParams.set("tap_token", token);
		url.searchParams.set("tap_user", encodeURIComponent(JSON.stringify(user)));
		return url.toString();
	} catch {
		return null;
	}
}

// Session check endpoint
authRouter.get("/session", async (c) => {
	const config = getConfig(c.env);
	const requestedRedirect =
		c.req.query("redirect") || c.req.query("redirect_uri") || null;
	const normalizedRedirect = normalizeRedirectTarget(
		requestedRedirect,
		config.loginUrl ?? c.req.url
	);

	const resolved = await resolveAuth(c);

	if (resolved) {
		if (normalizedRedirect) {
			const redirectWithAuth = appendAuthParams(
				normalizedRedirect,
				resolved.token,
				resolved.payload
			);
			if (redirectWithAuth) {
				return c.redirect(redirectWithAuth, 302);
			}
		}
		return c.json({
			authenticated: true,
			token: resolved.token,
			user: resolved.payload,
		});
	}

	const loginRedirect = buildLoginRedirectUrl(
		config.loginUrl,
		normalizedRedirect
	);

	if (loginRedirect && normalizedRedirect) {
		return c.redirect(loginRedirect, 302);
	}

	if (loginRedirect) {
		return c.json(
			{
				authenticated: false,
				error: "Unauthorized",
				loginUrl: loginRedirect,
			},
			401
		);
	}

	return c.json({ authenticated: false, error: "Unauthorized" }, 401);
});

// Send email verification code
authRouter.post("/email/send-code", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const parsed = SendCodeRequestSchema.safeParse(body);
	if (!parsed.success) {
		return c.json(
			{ success: false, error: "请输入有效的邮箱地址", issues: parsed.error.issues },
			400
		);
	}

	const result = await sendVerificationCode(c, parsed.data.email);
	if (!result.success) {
		return c.json({ success: false, error: result.error }, 500);
	}

	return c.json({ success: true, message: "验证码已发送" });
});

// Verify code and login
authRouter.post("/email/verify", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const parsed = VerifyCodeRequestSchema.safeParse(body);
	if (!parsed.success) {
		return c.json(
			{ success: false, error: "请求参数错误", issues: parsed.error.issues },
			400
		);
	}

	const result = await verifyCodeAndLogin(
		c,
		parsed.data.email,
		parsed.data.code,
		parsed.data.invitationCode
	);

	if ("error" in result) {
		return c.json({ success: false, error: result.error }, 400);
	}

	const validated = AuthResponseSchema.parse(result);
	attachAuthCookie(c, validated.token);
	return c.json({ success: true, ...validated });
});

// Guest login (stateless)
authRouter.post("/guest", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) ?? {};
	const parsed = GuestLoginRequestSchema.safeParse(body);
	if (!parsed.success) {
		return c.json(
			{ error: "Invalid request body", issues: parsed.error.issues },
			400
		);
	}

	const result = await createGuestUser(c, parsed.data.nickname);
	const validated = AuthResponseSchema.parse(result);
	attachAuthCookie(c, validated.token, true);
	return c.json(validated);
});

// Generate invitation code (admin only)
authRouter.post("/invitation/generate", async (c) => {
	const resolved = await resolveAuth(c);
	if (!resolved) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const body = await c.req.json().catch(() => ({}));
	const parsed = GenerateInvitationRequestSchema.safeParse(body);

	const result = await createInvitationCode(
		c,
		resolved.payload.sub,
		parsed.success ? parsed.data.expiresInDays : undefined
	);

	if ("error" in result) {
		return c.json({ success: false, error: result.error }, 403);
	}

	return c.json({ success: true, ...result });
});

// List invitation codes (admin only)
authRouter.get("/invitation/list", async (c) => {
	const resolved = await resolveAuth(c);
	if (!resolved) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const result = await listInvitationCodes(c, resolved.payload.sub);

	if ("error" in result) {
		return c.json({ success: false, error: result.error }, 403);
	}

	return c.json({ success: true, codes: result });
});

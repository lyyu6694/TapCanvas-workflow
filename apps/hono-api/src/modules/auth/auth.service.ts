import { getConfig } from "../../config";
import type { AppContext } from "../../types";
import { signJwtHS256 } from "../../jwt";
import type { UserPayload } from "./auth.schemas";
import {
	generateVerificationCode,
	generateInvitationCode as generateInvitationCodeStr,
	sendVerificationEmail,
	isAdminEmail,
} from "./email.service";

const VERIFICATION_CODE_EXPIRY_MINUTES = 5;

/**
 * Send verification code to email
 */
export async function sendVerificationCode(
	c: AppContext,
	email: string
): Promise<{ success: boolean; error?: string }> {
	const normalizedEmail = email.toLowerCase().trim();
	if (!normalizedEmail || !normalizedEmail.includes("@")) {
		return { success: false, error: "请输入有效的邮箱地址" };
	}

	const code = generateVerificationCode();
	const nowIso = new Date().toISOString();
	const expiresAt = new Date(
		Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000
	).toISOString();
	const id = crypto.randomUUID();

	// Store verification code in database
	try {
		await c.env.DB.prepare(
			`INSERT INTO email_verification_codes (id, email, code, expires_at, verified, created_at)
			 VALUES (?, ?, ?, ?, 0, ?)`
		)
			.bind(id, normalizedEmail, code, expiresAt, nowIso)
			.run();
	} catch (err: any) {
		console.error("[auth] save verification code failed", err);
		return { success: false, error: "保存验证码失败" };
	}

	// Send email
	const result = await sendVerificationEmail(c, normalizedEmail, code);
	if (!result.success) {
		return { success: false, error: result.error || "发送邮件失败" };
	}

	return { success: true };
}

/**
 * Verify code and login/register user
 */
export async function verifyCodeAndLogin(
	c: AppContext,
	email: string,
	code: string,
	invitationCode?: string
): Promise<{ token: string; user: UserPayload } | { error: string }> {
	const config = getConfig(c.env);
	const normalizedEmail = email.toLowerCase().trim();
	const nowIso = new Date().toISOString();

	// Find valid verification code
	const record = await c.env.DB.prepare(
		`SELECT id, code, expires_at, verified FROM email_verification_codes
		 WHERE email = ? AND verified = 0
		 ORDER BY created_at DESC LIMIT 1`
	)
		.bind(normalizedEmail)
		.first<any>();

	if (!record) {
		return { error: "验证码不存在或已过期，请重新获取" };
	}

	if (record.code !== code) {
		return { error: "验证码错误" };
	}

	if (new Date(record.expires_at) < new Date()) {
		return { error: "验证码已过期，请重新获取" };
	}

	// Mark code as verified
	await c.env.DB.prepare(
		`UPDATE email_verification_codes SET verified = 1 WHERE id = ?`
	)
		.bind(record.id)
		.run();

	// Check if user exists
	const existingUser = await c.env.DB.prepare(
		`SELECT id, login, name, avatar_url, email, role, guest FROM users WHERE email = ? LIMIT 1`
	)
		.bind(normalizedEmail)
		.first<any>();

	if (existingUser) {
		// Existing user - login directly
		const payload: UserPayload = {
			sub: existingUser.id,
			login: existingUser.login,
			name: existingUser.name,
			avatarUrl: existingUser.avatar_url,
			email: existingUser.email,
			role: existingUser.role || null,
			guest: false,
		};

		// Update last_seen_at
		await c.env.DB.prepare(
			`UPDATE users SET last_seen_at = ?, updated_at = ?, guest = 0 WHERE id = ?`
		)
			.bind(nowIso, nowIso, existingUser.id)
			.run();

		const token = await signJwtHS256(payload, config.jwtSecret, 7 * 24 * 60 * 60);
		return { token, user: payload };
	}

	// New user - require invitation code
	if (!invitationCode || !invitationCode.trim()) {
		return { error: "首次注册需要邀请码" };
	}

	// Validate invitation code
	const invitation = await c.env.DB.prepare(
		`SELECT id, is_used, expires_at FROM invitation_codes WHERE code = ? LIMIT 1`
	)
		.bind(invitationCode.trim())
		.first<any>();

	if (!invitation) {
		return { error: "邀请码无效" };
	}

	if (invitation.is_used) {
		return { error: "邀请码已被使用" };
	}

	if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
		return { error: "邀请码已过期" };
	}

	// Create new user
	const userId = crypto.randomUUID();
	const login = normalizedEmail.split("@")[0].replace(/[^\w-]/g, "").slice(0, 32) || `user_${userId.slice(0, 8)}`;
	const name = login;
	const isAdmin = isAdminEmail(c, normalizedEmail);

	await c.env.DB.prepare(
		`INSERT INTO users (id, login, name, avatar_url, email, role, guest, last_seen_at, created_at, updated_at)
		 VALUES (?, ?, ?, NULL, ?, ?, 0, ?, ?, ?)`
	)
		.bind(userId, login, name, normalizedEmail, isAdmin ? "admin" : null, nowIso, nowIso, nowIso)
		.run();

	// Mark invitation code as used
	await c.env.DB.prepare(
		`UPDATE invitation_codes SET is_used = 1, used_by = ?, used_at = ? WHERE id = ?`
	)
		.bind(userId, nowIso, invitation.id)
		.run();

	const payload: UserPayload = {
		sub: userId,
		login,
		name,
		email: normalizedEmail,
		role: isAdmin ? "admin" : null,
		guest: false,
	};

	const token = await signJwtHS256(payload, config.jwtSecret, 7 * 24 * 60 * 60);
	return { token, user: payload };
}

/**
 * Generate invitation code (admin only)
 */
export async function createInvitationCode(
	c: AppContext,
	adminUserId: string,
	expiresInDays?: number
): Promise<{ code: string; id: string } | { error: string }> {
	// Verify admin
	const user = await c.env.DB.prepare(
		`SELECT email, role FROM users WHERE id = ? LIMIT 1`
	)
		.bind(adminUserId)
		.first<any>();

	if (!user) {
		return { error: "用户不存在" };
	}

	const isAdmin = user.role === "admin" || isAdminEmail(c, user.email || "");
	if (!isAdmin) {
		return { error: "无权限生成邀请码" };
	}

	const id = crypto.randomUUID();
	const code = generateInvitationCodeStr();
	const nowIso = new Date().toISOString();
	const expiresAt = expiresInDays && expiresInDays > 0
		? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
		: null;

	await c.env.DB.prepare(
		`INSERT INTO invitation_codes (id, code, created_by, is_used, expires_at, created_at)
		 VALUES (?, ?, ?, 0, ?, ?)`
	)
		.bind(id, code, adminUserId, expiresAt, nowIso)
		.run();

	return { code, id };
}

/**
 * List invitation codes (admin only)
 */
export async function listInvitationCodes(
	c: AppContext,
	adminUserId: string
): Promise<any[] | { error: string }> {
	// Verify admin
	const user = await c.env.DB.prepare(
		`SELECT email, role FROM users WHERE id = ? LIMIT 1`
	)
		.bind(adminUserId)
		.first<any>();

	if (!user) {
		return { error: "用户不存在" };
	}

	const isAdmin = user.role === "admin" || isAdminEmail(c, user.email || "");
	if (!isAdmin) {
		return { error: "无权限查看邀请码" };
	}

	const result = await c.env.DB.prepare(
		`SELECT ic.id, ic.code, ic.is_used, ic.expires_at, ic.created_at, ic.used_at,
		        u.email as used_by_email
		 FROM invitation_codes ic
		 LEFT JOIN users u ON ic.used_by = u.id
		 WHERE ic.created_by = ?
		 ORDER BY ic.created_at DESC
		 LIMIT 100`
	)
		.bind(adminUserId)
		.all();

	return result.results || [];
}

/**
 * Create a guest user (stateless - no server storage)
 * Returns a JWT token with guest=true flag, valid for session only
 */
export async function createGuestUser(c: AppContext, nickname?: string) {
	const config = getConfig(c.env);

	const id = crypto.randomUUID();
	const trimmed = typeof nickname === "string" ? nickname.trim().slice(0, 32) : "";
	const normalizedLogin = trimmed
		? trimmed.replace(/[^\w-]/g, "").toLowerCase()
		: "";
	const login = normalizedLogin || `guest_${id.slice(0, 8)}`;
	const name = trimmed || `Guest ${id.slice(0, 4).toUpperCase()}`;

	// NOTE: Guest users are NOT stored in the database (stateless)
	// They only exist as JWT tokens valid for the session

	const payload: UserPayload = {
		sub: id,
		login,
		name,
		role: null,
		guest: true,
	};

	// Guest tokens expire in 24 hours (shorter than regular users)
	const token = await signJwtHS256(payload, config.jwtSecret, 24 * 60 * 60);

	return {
		token,
		user: payload,
	};
}

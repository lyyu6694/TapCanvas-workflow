import type { WorkerEnv } from "./types";

export type AppConfig = {
	jwtSecret: string;
	loginUrl: string | null;
	// Email SMTP (163)
	smtp163User: string | null;
	smtp163Pass: string | null;
	// Admin emails (comma-separated)
	adminEmails: string[];
};

export function getConfig(env: WorkerEnv): AppConfig {
	const adminEmailsRaw = env.ADMIN_EMAILS || "admin@example.com";
	const adminEmails = adminEmailsRaw
		.split(",")
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);

	return {
		jwtSecret: env.JWT_SECRET || "dev-secret",
		loginUrl: env.LOGIN_URL ?? null,
		smtp163User: env.SMTP_163_USER ?? null,
		smtp163Pass: env.SMTP_163_PASS ?? null,
		adminEmails,
	};
}


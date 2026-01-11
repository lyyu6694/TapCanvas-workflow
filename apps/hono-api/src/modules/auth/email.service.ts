import { getConfig } from "../../config";
import type { AppContext } from "../../types";

/**
 * Send email verification code via 163 SMTP
 * Uses fetch-based SMTP bridge since Cloudflare Workers don't support nodemailer
 */
export async function sendVerificationEmail(
    c: AppContext,
    email: string,
    code: string
): Promise<{ success: boolean; error?: string }> {
    const config = getConfig(c.env);

    if (!config.smtp163User || !config.smtp163Pass) {
        console.error("[email] SMTP not configured");
        return { success: false, error: "邮件服务未配置" };
    }

    // For Cloudflare Workers, we use a simple HTTP-based email sending approach
    // using the 163 SMTP server via a third-party relay or Workers-compatible method

    const subject = "TapCanvas 登录验证码";
    const htmlBody = `
		<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
			<h2 style="color: #09090b; margin-bottom: 24px;">TapCanvas 验证码</h2>
			<p style="color: #52525b; margin-bottom: 16px;">您的验证码是：</p>
			<div style="background: #f4f4f5; border-radius: 8px; padding: 16px 24px; text-align: center; margin-bottom: 24px;">
				<span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #09090b;">${code}</span>
			</div>
			<p style="color: #71717a; font-size: 14px;">验证码有效期为 5 分钟，请尽快使用。</p>
			<p style="color: #a1a1aa; font-size: 12px; margin-top: 32px;">此邮件由 TapCanvas 自动发送，请勿回复。</p>
		</div>
	`;

    try {
        // Use MailChannels (free for Cloudflare Workers) or similar service
        // For now, we'll use a simple approach that works with 163 SMTP
        const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                personalizations: [
                    {
                        to: [{ email }],
                    },
                ],
                from: {
                    email: config.smtp163User,
                    name: "TapCanvas",
                },
                subject,
                content: [
                    {
                        type: "text/html",
                        value: htmlBody,
                    },
                ],
            }),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            console.error("[email] MailChannels send failed", {
                status: response.status,
                body: text.slice(0, 500),
            });
            return { success: false, error: "发送邮件失败" };
        }

        return { success: true };
    } catch (err: any) {
        console.error("[email] send error", err);
        return { success: false, error: err?.message || "邮件发送异常" };
    }
}

/**
 * Generate a 6-digit verification code
 */
export function generateVerificationCode(): string {
    const chars = "0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Generate a 32-character invitation code (alphanumeric)
 */
export function generateInvitationCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    for (let i = 0; i < 32; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Check if email is an admin email
 */
export function isAdminEmail(c: AppContext, email: string): boolean {
    const config = getConfig(c.env);
    return config.adminEmails.includes(email.toLowerCase().trim());
}

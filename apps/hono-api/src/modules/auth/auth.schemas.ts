import { z } from "zod";

export const UserPayloadSchema = z.object({
	sub: z.string(),
	login: z.string(),
	name: z.string().optional(),
	avatarUrl: z.string().nullable().optional(),
	email: z.string().nullable().optional(),
	role: z.string().nullable().optional(),
	guest: z.boolean().default(false),
});

export type UserPayload = z.infer<typeof UserPayloadSchema>;

export const AuthResponseSchema = z.object({
	token: z.string(),
	user: UserPayloadSchema,
});

export const GuestLoginRequestSchema = z.object({
	nickname: z.string().optional(),
});

// Email verification schemas
export const SendCodeRequestSchema = z.object({
	email: z.string().email("请输入有效的邮箱地址"),
});

export const VerifyCodeRequestSchema = z.object({
	email: z.string().email("请输入有效的邮箱地址"),
	code: z.string().min(6, "验证码为6位数字").max(6, "验证码为6位数字"),
	invitationCode: z.string().optional(),
});

// Invitation code schemas
export const GenerateInvitationRequestSchema = z.object({
	expiresInDays: z.number().int().positive().optional(),
});

export const InvitationCodeSchema = z.object({
	id: z.string(),
	code: z.string(),
	isUsed: z.boolean(),
	expiresAt: z.string().nullable(),
	createdAt: z.string(),
	usedAt: z.string().nullable(),
	usedByEmail: z.string().nullable().optional(),
});

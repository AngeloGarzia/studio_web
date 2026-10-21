import { z } from "zod";
import { PasswordSchema } from "../../shared/password.js";
import { SendQuittanceBodySchema } from "../booking/booking.dto.js";

export const RentalKindSchema = z.enum(["FURNISHED_TOURISM", "UNFURNISHED_MONTHLY"]);

export const CreateEstablishmentBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  rentalKind: RentalKindSchema.default("FURNISHED_TOURISM")
});
export type CreateEstablishmentBody = z.infer<typeof CreateEstablishmentBodySchema>;

export const CreateOwnerBodySchema = z.object({
  firstName: z.string().trim().max(80).default(""),
  lastName: z.string().trim().min(1).max(120),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  phone: z.string().trim().max(40).optional()
});
export type CreateOwnerBody = z.infer<typeof CreateOwnerBodySchema>;

export const OwnerSignatureBodySchema = z.object({
  png: z.string().trim().min(32).max(1_500_000)
});

export const UpdateOwnerBodySchema = z.object({
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().min(1).max(120),
  email: z.union([z.string().trim().email(), z.literal("")]),
  phone: z.string().trim().max(40)
});
export type UpdateOwnerBody = z.infer<typeof UpdateOwnerBodySchema>;

const AccountBodySchema = z.object({
  email: z.string().trim().email(),
  profileName: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  role: z.enum(["ADMIN", "OWNER", "CLIENT"]),
  password: z.union([z.string().trim().min(10).max(128).regex(/[A-Za-z]/).regex(/[0-9]/), z.literal("")])
});

const ownerLegalFields = {
  address: z.string().trim().max(300).default(""),
  isCompany: z.boolean().default(false),
  companyName: z.string().trim().max(160).default("")
};

export const UpdateDirectoryOwnerBodySchema = z.object({
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().min(1).max(120),
  email: z.union([z.string().trim().email(), z.literal("")]),
  phone: z.string().trim().max(40),
  ...ownerLegalFields,
  userId: z.union([z.string().trim().min(1), z.literal("")]),
  account: AccountBodySchema.nullable()
});
export type UpdateDirectoryOwnerBody = z.infer<typeof UpdateDirectoryOwnerBodySchema>;

export const AttachOwnerBodySchema = z.object({
  ownerId: z.string().trim().min(1)
});
export type AttachOwnerBody = z.infer<typeof AttachOwnerBodySchema>;

export const UpdateEstablishmentBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(80).optional(),
  description: z.string().max(4000).optional(),
  coverMediaId: z.union([z.string().trim().min(1), z.null()]).optional(),
  rentalKind: RentalKindSchema.optional(),
  tenantName: z.string().trim().max(200).nullable().optional(),
  tenantEmail: z.union([z.string().trim().email(), z.literal("")]).nullable().optional(),
  monthlyRentCents: z.number().int().nonnegative().max(100_000_000).optional(),
  monthlyChargesCents: z.number().int().nonnegative().max(100_000_000).optional()
});
export type UpdateEstablishmentBody = z.infer<typeof UpdateEstablishmentBodySchema>;

export const CreateMonthlyTenantBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  phone: z.string().trim().max(40).optional()
});
export type CreateMonthlyTenantBody = z.infer<typeof CreateMonthlyTenantBodySchema>;

const optionalDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]);

export const UpdateMonthlyTenantBodySchema = z.object({
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().min(1).max(120),
  formerAddress: z.string().trim().max(300),
  phone: z.string().trim().max(40),
  email: z.union([z.string().trim().email(), z.literal("")]),
  visaNumber: z.string().trim().max(60),
  nationality: z.string().trim().max(80),
  birthDate: optionalDate,
  leaseStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
export type UpdateMonthlyTenantBody = z.infer<typeof UpdateMonthlyTenantBodySchema>;

export const UpdateDirectoryTenantBodySchema = UpdateMonthlyTenantBodySchema.extend({
  establishmentId: z.string().trim().min(1),
  userId: z.union([z.string().trim().min(1), z.literal("")]),
  account: AccountBodySchema.nullable()
});
export type UpdateDirectoryTenantBody = z.infer<typeof UpdateDirectoryTenantBodySchema>;

export const NewAccountSchema = z.object({
  email: z.string().trim().email(),
  profileName: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  role: z.enum(["ADMIN", "OWNER", "CLIENT"]),
  password: z.union([PasswordSchema, z.literal("")])
});
export type NewAccountBody = z.infer<typeof NewAccountSchema>;

export const CreateDirectoryOwnerBodySchema = z.object({
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().min(1).max(120),
  email: z.union([z.string().trim().email(), z.literal("")]),
  phone: z.string().trim().max(40),
  ...ownerLegalFields,
  account: NewAccountSchema.nullable()
});
export type CreateDirectoryOwnerBody = z.infer<typeof CreateDirectoryOwnerBodySchema>;

export const CreateDirectoryTenantBodySchema = CreateDirectoryOwnerBodySchema.extend({
  establishmentId: z.string().trim().min(1),
  leaseStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
export type CreateDirectoryTenantBody = z.infer<typeof CreateDirectoryTenantBodySchema>;

export const SendAccountConfirmationBodySchema = z.object({
  password: z.union([PasswordSchema, z.literal("")])
});
export type SendAccountConfirmationBody = z.infer<typeof SendAccountConfirmationBodySchema>;

export const QuittanceOccupantSchema = z.object({
  tenantId: z.string().trim().min(1),
  tenantName: z.string().trim().min(1).max(200),
  tenantEmail: z.union([z.string().trim().email(), z.literal("")]),
  phone: z.string().trim().max(40).optional(),
  rentCents: z.number().int().nonnegative().max(100_000_000).optional(),
  chargesCents: z.number().int().nonnegative().max(100_000_000).optional(),
  receivedCents: z.number().int().nonnegative().max(100_000_000).optional()
});

export const SendMonthlyQuittanceBodySchema = SendQuittanceBodySchema.and(
  z.object({
    establishmentId: z.string().trim().min(1).optional(),
    tenantId: z.string().trim().min(1),
    tenantEmail: z.string().trim().email(),
    splitByTenant: z.boolean().optional(),
    occupants: z.array(QuittanceOccupantSchema).max(20).optional()
  })
).refine((body) => body.rentCents + body.chargesCents > 0, {
  message: "Le total dû doit être supérieur à zéro.",
  path: ["rentCents"]
});
export type SendMonthlyQuittanceBody = z.infer<typeof SendMonthlyQuittanceBodySchema>;

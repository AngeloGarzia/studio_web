import { DEFAULT_PUBLIC_SETTINGS, type UpdateSettingsBody } from "./settings.dto.js";
import type { SettingsRepository } from "./settings.repository.js";

export class SettingsService {
  constructor(private readonly settings: SettingsRepository) {}

  async getPublic() {
    const row = await this.settings.findFirst();
    if (!row) return DEFAULT_PUBLIC_SETTINGS;
    // Pas de flags d’exploitation internes (auto-confirm) sur l’API publique.
    return {
      studioName: row.studioName,
      heroPoints: row.heroPoints,
      ownerName: row.ownerName,
      address: row.address,
      city: row.city,
      phone: row.phone,
      publicEmail: row.publicEmail,
      lodgingType: row.lodgingType,
      surfaceM2: row.surfaceM2,
      equipments: row.equipments,
      socialLinks: row.socialLinks,
      minNights: row.minNights,
      checkInTime: row.checkInTime,
      checkOutTime: row.checkOutTime,
      maintenanceMode: row.maintenanceMode
    };
  }

  async getAdmin() {
    return this.settings.findFirst();
  }

  async upsert(body: UpdateSettingsBody) {
    const data: Record<string, unknown> = {};
    const set = (k: string, v: unknown) => {
      if (v !== undefined) data[k] = v;
    };
    set("studioName", body.studioName);
    set("heroPoints", body.heroPoints);
    set("ownerName", body.ownerName);
    set("address", body.address);
    set("city", body.city);
    set("phone", body.phone);
    set("publicEmail", body.publicEmail);
    set("lodgingType", body.lodgingType);
    set("surfaceM2", body.surfaceM2);
    set("equipments", body.equipments);
    set("socialLinks", body.socialLinks);
    set("minNights", body.minNights);
    set("checkInTime", body.checkInTime);
    set("checkOutTime", body.checkOutTime);
    set("bookingAutoConfirm", body.bookingAutoConfirm);
    set("maintenanceMode", body.maintenanceMode);

    const existing = await this.settings.findFirst();
    if (existing) return this.settings.update(existing.id, data);
    return this.settings.create({
      studioName: body.studioName ?? "Studio des Grenadiers",
      ...data
    });
  }
}

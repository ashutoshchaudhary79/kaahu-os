export type SettingValue = string | number | boolean | null | SettingValue[] | { [key: string]: SettingValue };
export type SettingsRecord = { [key: string]: SettingValue };
export type AdSettings = {
  adId: string; accountId: string; retrievedAt: string; currency: string;
  identity: SettingsRecord; creative: SettingsRecord; audience: SettingsRecord;
  placements: SettingsRecord; delivery: SettingsRecord; warnings: string[];
};

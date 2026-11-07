/**
 * بديل محلي لحزم Capacitor يُستخدم فقط عند البناء دون تثبيتها (مثل بيئة بلا إنترنت).
 * في بناء Android الحقيقي تُستخدم الحزم الأصلية من node_modules.
 */
// __previewNative: لالتقاط صور معاينة لشكل التطبيق على Android فقط
export const Capacitor = {
  isNativePlatform: () => !!(globalThis as { __previewNative?: boolean }).__previewNative,
  getPlatform: () => 'web',
};
export const Directory = { Documents: 'DOCUMENTS', ExternalStorage: 'EXTERNAL_STORAGE', Cache: 'CACHE' } as const;
const unavailable = async (): Promise<never> => {
  throw new Error('native-unavailable');
};
export const Filesystem = {
  writeFile: unavailable as (o: { path: string; data: string; directory: string; recursive?: boolean }) => Promise<{ uri: string }>,
};
export const Share = {
  share: unavailable as (o: { title?: string; files?: string[]; dialogTitle?: string }) => Promise<unknown>,
};

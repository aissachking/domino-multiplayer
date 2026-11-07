/**
 * حفظ صورة التشكيلة ومشاركتها.
 * داخل تطبيق Android (Capacitor): نكتب الملف في الهاتف ونفتح قائمة المشاركة الأصلية.
 * في المتصفح: تنزيل عادي، والمشاركة عبر Web Share عند توفرها.
 * كل دالة تُستدعى مباشرة من ضغطة زر حتى لا يرفض المتصفح المشاركة أو التنزيل.
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** يحفظ الصورة في ذاكرة الهاتف ويعيد اسم المكان بالعربية */
export async function saveToPhone(blob: Blob, name: string): Promise<string> {
  if (!isNative()) {
    downloadInBrowser(blob, name);
    return 'التنزيلات';
  }
  const data = await toBase64(blob);
  const places = [
    // مجلد الصور: تظهر الصورة في المعرض
    { directory: Directory.ExternalStorage, path: `Pictures/Tashkila/${name}`, label: 'المعرض ← Pictures/Tashkila' },
    { directory: Directory.ExternalStorage, path: `Download/${name}`, label: 'التنزيلات' },
    { directory: Directory.Documents, path: `Tashkila/${name}`, label: 'المستندات ← Tashkila' },
  ];
  for (const p of places) {
    try {
      await Filesystem.writeFile({ path: p.path, data, directory: p.directory, recursive: true });
      return p.label;
    } catch {
      /* نجرب المكان التالي */
    }
  }
  throw new Error('save-failed');
}

/** يفتح قائمة المشاركة (واتساب وغيره). يعيد false إن لم تكن المشاركة متاحة */
export async function shareImage(blob: Blob, name: string): Promise<boolean> {
  if (isNative()) {
    const data = await toBase64(blob);
    const { uri } = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    await Share.share({ title: 'تشكيلة المباراة', files: [uri], dialogTitle: 'مشاركة التشكيلة' });
    return true;
  }
  const file = new File([blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], title: 'تشكيلة المباراة' });
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') throw e;
  }
  return true;
}

export function canShareImage(): boolean {
  if (isNative()) return true;
  try {
    const file = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    return !!nav.share && !!nav.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

export function downloadInBrowser(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

import { RASM_MAX_BAYT, type RasmYuklashResponse } from '@yh/shared';
import { useId, useRef, useState, type DragEvent } from 'react';
import { adminUpload, ApiError } from './api';
import { Icon } from './icons';
import './rasm.css';

/** Longest side after shrinking: sharp on a phone at 3x, a fraction of a camera original. */
const MAX_PX = 1920;

/**
 * Shrinks a photo in the browser before upload (a 6 MB camera JPEG becomes a few
 * hundred KB): WebP for the Mini App, JPEG where Telegram fetches it (Rassilka).
 * GIFs and images that would not get smaller go up as they are.
 */
async function tayyorla(file: File, format: 'image/webp' | 'image/jpeg'): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#fff'; // JPEG has no transparency
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, 0.86));
  if (!blob) return file;
  return scale === 1 && blob.size >= file.size && file.type === format ? file : blob;
}

async function yukla(file: File, format: 'image/webp' | 'image/jpeg'): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Faqat rasm: JPG, PNG, WebP yoki GIF');
  const blob = await tayyorla(file, format);
  if (blob.size > RASM_MAX_BAYT) throw new Error('Rasm juda katta (8 MB dan oshmasin)');
  try {
    return (await adminUpload<RasmYuklashResponse>('/rasm', blob, blob.type || file.type)).url;
  } catch (e) {
    if (e instanceof ApiError && e.status === 415) throw new Error('Bu fayl rasm emas yoki turi qo‘llanmaydi');
    if (e instanceof ApiError && e.status === 403) throw new Error('Rasm yuklash faqat Administrator uchun');
    throw new Error('Yuklab bo‘lmadi, qayta urinib ko‘ring');
  }
}

const rasmlar = (files: FileList | null | undefined) => [...(files ?? [])].filter((f) => f.type.startsWith('image/'));

/** Shared drop-target behaviour: highlight while a file hovers, hand the files over on drop. */
function useDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const files = rasmlar(e.dataTransfer.files);
        if (files.length) onFiles(files);
      },
    },
  };
}

/** One image (Planirovka chizmasi, «Biz haqimizda» rasmi, Rassilka foto). */
export function RasmYuklash({
  label,
  hint,
  value,
  onChange,
  format = 'image/webp',
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null) => void;
  format?: 'image/webp' | 'image/jpeg';
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await yukla(file, format));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const drop = useDrop((files) => void take(files[0]));

  return (
    <div className="field rasm-field">
      <span id={`${id}-l`}>{label}</span>
      <div className={drop.over ? 'rasm-one over' : 'rasm-one'} {...drop.handlers}>
        <button
          type="button"
          className={value ? 'rasm-tile filled' : 'rasm-tile'}
          aria-labelledby={`${id}-l`}
          aria-describedby={hint ? `${id}-h` : undefined}
          aria-busy={busy || undefined}
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          {value ? <img src={value} alt="" /> : <Icon name="imagePlus" size={24} />}
          {busy && (
            <span className="rasm-busy">
              <Icon name="loader" size={20} className="spin" />
            </span>
          )}
        </button>
        <div className="rasm-side">
          <div className="rasm-actions">
            <button type="button" className="small" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? 'Yuklanmoqda…' : value ? 'Almashtirish' : 'Rasm tanlash'}
            </button>
            {value && !busy && (
              <button type="button" className="small rasm-remove" onClick={() => onChange(null)}>
                O‘chirish
              </button>
            )}
          </div>
          <p className="rasm-hint" id={`${id}-h`}>
            {hint ?? 'JPG, PNG yoki WebP. Shu yerga tashlab qo‘yish ham mumkin.'}
          </p>
          {error && (
            <p className="rasm-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** An ordered list of photos (Loyiha fotolari): the first one is the cover. */
export function RasmlarYuklash({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (urls: string[]) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState('');
  // Uploads finish one by one; each appends to the list as it was when it finished.
  const latest = useRef(value);
  latest.current = value;

  async function take(files: File[]) {
    if (!files.length) return;
    setError('');
    setBusy((n) => n + files.length);
    for (const file of files) {
      try {
        const url = await yukla(file, 'image/webp');
        if (!latest.current.includes(url)) {
          latest.current = [...latest.current, url];
          onChange(latest.current);
        }
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      } finally {
        setBusy((n) => n - 1);
      }
    }
  }
  const drop = useDrop((files) => void take(files));

  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    onChange(next);
  };

  return (
    <div className="field rasm-field">
      <span id={`${id}-l`}>{label}</span>
      <ul className={drop.over ? 'rasm-grid over' : 'rasm-grid'} aria-labelledby={`${id}-l`} {...drop.handlers}>
        {value.map((src, i) => (
          <li key={src} className="rasm-item">
            <img src={src} alt={`${i + 1}-rasm`} />
            {i === 0 && <span className="rasm-cover">Muqova</span>}
            <div className="rasm-tools">
              <button type="button" aria-label="Chapga" disabled={i === 0} onClick={() => move(i, -1)}>
                <Icon name="chevronLeft" size={16} />
              </button>
              <button type="button" aria-label="O‘ngga" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                <Icon name="chevronRight" size={16} />
              </button>
              <button type="button" aria-label="O‘chirish" onClick={() => onChange(value.filter((x) => x !== src))}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          </li>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <li key={`busy-${i}`} className="rasm-item pending" aria-busy>
            <Icon name="loader" size={20} className="spin" />
          </li>
        ))}
        <li>
          <button type="button" className="rasm-add" onClick={() => input.current?.click()}>
            <Icon name="imagePlus" size={22} />
            <span>Rasm qo‘shish</span>
          </button>
        </li>
      </ul>
      <p className="rasm-hint">Bir nechtasini birdaniga tanlash yoki shu yerga tashlash mumkin. Birinchisi — muqova.</p>
      {error && (
        <p className="rasm-error" role="alert">
          {error}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          void take(rasmlar(e.target.files));
          e.target.value = '';
        }}
      />
    </div>
  );
}

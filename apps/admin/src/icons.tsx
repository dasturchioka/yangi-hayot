import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  Building2,
  CalendarDays,
  Circle,
  History,
  ImagePlus,
  Link2,
  LoaderCircle,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Send,
  Settings,
  Upload,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

/**
 * Admin icons: the same set and line style as the Mini App (lucide-react, 1.8 stroke).
 * Sections by name, so sections added later (#15, #17, #18) only add a line here; unknown ones get a dot.
 */
const SECTION_ICONS: Record<string, LucideIcon> = {
  Xonadonlar: LayoutGrid,
  Import: Upload,
  Loyihalar: Building2,
  Yozilishlar: CalendarDays,
  Jurnal: History,
  Rassilka: Send,
  Takliflar: UserPlus,
  Analitika: BarChart3,
  Hisobot: BarChart3,
  'Matnlar va sozlamalar': Settings,
  Foydalanuvchilar: Users,
};

export function SectionIcon({ name }: { name: string }) {
  const Icon = SECTION_ICONS[name] ?? Circle;
  return <Icon size={20} strokeWidth={1.8} aria-hidden focusable={false} />;
}

const make = (Icon: LucideIcon) => () => <Icon size={20} strokeWidth={1.8} aria-hidden focusable={false} />;

export const LogoutIcon = make(LogOut);
export const MenuIcon = make(Menu);
export const CollapseIcon = make(PanelLeftClose);
export const ExpandIcon = make(PanelLeftOpen);
export const XIcon = () => <X size={16} strokeWidth={1.8} aria-hidden focusable={false} />;
export const ArrowUpIcon = () => <ArrowUp size={16} strokeWidth={1.8} aria-hidden focusable={false} />;
export const ArrowDownIcon = () => <ArrowDown size={16} strokeWidth={1.8} aria-hidden focusable={false} />;
export const UploadLargeIcon = () => <Upload size={28} strokeWidth={1.8} aria-hidden focusable={false} />;

/** Inline icons by name for screens (#22 Xonadonlar): same lucide set and stroke as the shell. */
const ICONS = {
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  check: Check,
  arrowRight: ArrowRight,
  search: Search,
  plus: Plus,
  upload: Upload,
  pencil: Pencil,
  trash: Trash2,
  x: X,
  imagePlus: ImagePlus,
  link: Link2,
  loader: LoaderCircle,
  send: Send,
  play: Play,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={1.8} aria-hidden focusable={false} className={className} />;
}

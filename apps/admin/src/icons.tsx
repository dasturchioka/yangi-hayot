import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Building2,
  CalendarDays,
  Circle,
  History,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
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

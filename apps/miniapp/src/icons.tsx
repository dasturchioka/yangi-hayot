import {
  Baby,
  BookOpen,
  Building2,
  Calculator,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  ClipboardList,
  FileText,
  GraduationCap,
  Heart,
  House,
  Images,
  Info,
  Landmark,
  LayoutPanelLeft,
  MapPin,
  Phone,
  Play,
  Search,
  Send,
  Share,
  ShoppingCart,
  SlidersHorizontal,
  Stethoscope,
  TramFront,
  Trees,
  User,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';

/**
 * The Mini App's one icon set: lucide-react with the kit's line style
 * (22px, 1.8 stroke, round caps, currentColor). Every screen takes icons from
 * here (kontent/icons.tsx and yozilish/icons.tsx re-export these).
 */
type P = { size?: number; strokeWidth?: number; className?: string };

function icon(Icon: LucideIcon, defaultSize = 22) {
  const Wrapped = ({ size = defaultSize, strokeWidth = 1.8, className }: P) => (
    <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden focusable={false} />
  );
  return Wrapped;
}

export const HomeIcon = icon(House);
export const BuildingIcon = icon(Building2);
export const UserIcon = icon(User);
export const CalendarIcon = icon(CalendarDays);
export const CalculatorIcon = icon(Calculator);
export const PhoneIcon = icon(Phone);
export const PinIcon = icon(MapPin);
export const PhotoIcon = icon(Images);
export const ShareIcon = icon(Share);
export const BookIcon = icon(BookOpen);
export const InfoIcon = icon(Info);
export const GiftIcon = icon(UserPlus);
export const ListIcon = icon(ClipboardList);
export const ChevronRightIcon = icon(ChevronRight, 20);
export const ChevronDownIcon = icon(ChevronDown, 20);
export const SearchIcon = icon(Search, 20);
export const FiltrIcon = icon(SlidersHorizontal, 20);
export const PlanIcon = icon(LayoutPanelLeft);
export const ClockIcon = icon(Clock);
export const SendIcon = icon(Send);
export const DocIcon = icon(FileText, 20);
export const XIcon = icon(X, 14);
export const CheckIcon = ({ size = 18 }: { size?: number }) => (
  <Check size={size} strokeWidth={2.6} aria-hidden focusable={false} />
);

export const HeartIcon = ({ size = 22, filled = false }: { size?: number; filled?: boolean }) => (
  <Heart size={size} strokeWidth={1.8} fill={filled ? 'currentColor' : 'none'} aria-hidden focusable={false} />
);

export const PlayIcon = ({ size = 22 }: { size?: number }) => (
  <Play size={size} strokeWidth={0} fill="currentColor" aria-hidden focusable={false} />
);

// ---- Infratuzilma kategoriyalari

const INFRA: Record<string, LucideIcon> = {
  talim: GraduationCap,
  bogcha: Baby,
  transport: TramFront,
  dokon: ShoppingCart,
  dam_olish: Trees,
  masjid: Landmark,
  tibbiyot: Stethoscope,
};

export function InfraIcon({ kategoriya }: { kategoriya: string }) {
  const Icon = INFRA[kategoriya] ?? Trees;
  return <Icon size={20} strokeWidth={1.8} aria-hidden focusable={false} />;
}

import {
  Apple, Baby, Bed, Bell, BookOpen, Brain, Briefcase, Brush, Cake, Calendar,
  CalendarCheck, CalendarDays, Camera, Car, Cat, ChefHat, ClipboardCheck,
  ClipboardList, Clock, Coffee, CreditCard, Dog, Dumbbell, FileText, Flag,
  Folder, Gift, Globe, GraduationCap, Hammer, Heart, HeartPulse, Home, Leaf,
  Lightbulb, ListChecks, Luggage, Mail, Map, MapPin, Moon, Music, Package,
  PartyPopper, Pencil, Phone, PiggyBank, Pill, Plane, Receipt, Rocket, Salad,
  ShoppingBag, ShoppingCart, Snowflake, Sparkles, Star, Store, Sun, Sunrise,
  Sunset, Target, Timer, Trash2, TreePine, Trophy, Truck, UserPlus, Users,
  Utensils, Wallet, Wrench, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * The only icons templates may reference. Keeping this an explicit, imported map
 * means a bad icon name in the catalog can never break the build — it falls back
 * to `ListChecks` via `resolveTemplateIcon`.
 */
export const TEMPLATE_ICONS = {
  Apple, Baby, Bed, Bell, BookOpen, Brain, Briefcase, Brush, Cake, Calendar,
  CalendarCheck, CalendarDays, Camera, Car, Cat, ChefHat, ClipboardCheck,
  ClipboardList, Clock, Coffee, CreditCard, Dog, Dumbbell, FileText, Flag,
  Folder, Gift, Globe, GraduationCap, Hammer, Heart, HeartPulse, Home, Leaf,
  Lightbulb, ListChecks, Luggage, Mail, Map, MapPin, Moon, Music, Package,
  PartyPopper, Pencil, Phone, PiggyBank, Pill, Plane, Receipt, Rocket, Salad,
  ShoppingBag, ShoppingCart, Snowflake, Sparkles, Star, Store, Sun, Sunrise,
  Sunset, Target, Timer, Trash2, TreePine, Trophy, Truck, UserPlus, Users,
  Utensils, Wallet, Wrench, Zap,
} satisfies Record<string, LucideIcon>

export type TemplateIconName = keyof typeof TEMPLATE_ICONS

/** Resolve a catalog icon name to a component, falling back to a safe default. */
export function resolveTemplateIcon(name: string): LucideIcon {
  return (TEMPLATE_ICONS as Record<string, LucideIcon>)[name] ?? TEMPLATE_ICONS.ListChecks
}

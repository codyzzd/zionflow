"use client";

import {
  ChartColumnIncreasing,
  FileText,
  Handshake,
  KeyRound,
  LayoutDashboard,
  LayoutPanelLeft,
  LogOut,
  MoreHorizontal,
  RotateCcw,
  Settings,
  ShieldCheck,
  Utensils,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { User } from "@/types/domain";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const mainItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/members", label: "Membros", icon: Users },
  { href: "/minutes", label: "Atas Sacramentais", icon: FileText },
  { href: "/frequency", label: "Frequência", icon: ChartColumnIncreasing },
  { href: "/missionarios", label: "Missionários", icon: Handshake },
  { href: "/patrol", label: "Ronda", icon: ShieldCheck },
  { href: "/lunch-calendar", label: "Calendário de almoços", icon: Utensils },
];

const secondaryItems: NavItem[] = [
  { href: "/users", label: "Usuários e acessos", icon: KeyRound },
  { href: "/settings", label: "Configurações", icon: Settings },
];

type SidebarNavProps = {
  currentPath: string;
  currentUser: User;
  onLogout: () => void;
  onResetDemo: () => void;
  wardName: string;
};

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "U";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function NavItems({
  currentPath,
  items,
  onNavigate,
}: {
  currentPath: string;
  items: NavItem[];
  onNavigate: () => void;
}) {
  return (
    <SidebarMenu className="gap-0.5 px-2">
      {items.map((item) => {
        const isActive = currentPath === item.href || currentPath.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              className={cn(
                "h-8 rounded-md px-3 text-sm transition-colors duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-stone-600 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              isActive={isActive}
              tooltip={item.label}
            >
              <Link href={item.href} onClick={onNavigate}>
                <Icon className="size-4" />
                <span className="font-medium">{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function SidebarNav({ currentPath, currentUser, onLogout, onResetDemo, wardName }: SidebarNavProps) {
  const { isMobile, setOpenMobile } = useSidebar();

  function handleNavigate() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  return (
    <>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-foreground text-sidebar">
            <LayoutPanelLeft className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">Zionflow</p>
            <p className="truncate text-xs text-sidebar-foreground/60">{wardName}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="border-t border-sidebar-border/80 py-4">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <NavItems currentPath={currentPath} items={mainItems} onNavigate={handleNavigate} />
            <div className="my-2 px-5">
              <div className="h-px bg-sidebar-border/80" />
            </div>
            <NavItems currentPath={currentPath} items={secondaryItems} onNavigate={handleNavigate} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Abrir menu do usuário"
            className="flex w-full items-center gap-2 rounded-lg bg-sidebar-accent/45 p-2 text-left transition-[background-color,color,transform] outline-none active:scale-[0.96] hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sidebar-foreground text-sm font-semibold text-sidebar">
              {getInitials(currentUser.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{currentUser.name}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{currentUser.email}</p>
            </div>
            <MoreHorizontal className="size-4 shrink-0 text-sidebar-foreground/55" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" side="top" sideOffset={8}>
            <DropdownMenuLabel>
              <span className="block truncate">{currentUser.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onResetDemo}>
              <RotateCcw className="size-3.5" />
              Resetar demo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onLogout}>
              <LogOut className="size-3.5" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </>
  );
}

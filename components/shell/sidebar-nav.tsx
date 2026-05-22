"use client";

import {
  Building2,
  BusFront,
  ChartColumnIncreasing,
  FileText,
  Handshake,
  HeartHandshake,
  KeyRound,
  LayoutDashboard,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { PermissionKey, User } from "@/types/domain";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  viewPermission?: PermissionKey;
  alwaysVisible?: boolean;
  children?: Array<{
    href: string;
    label: string;
    viewPermission?: PermissionKey;
    alwaysVisible?: boolean;
  }>;
};

const mainItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, viewPermission: "dashboard.view" },
  { href: "/members", label: "Membros", icon: Users, viewPermission: "members.view" },
  { href: "/meetings", label: "Atas Sacramentais", icon: FileText, viewPermission: "minutes.view" },
  { href: "/frequency", label: "Frequência", icon: ChartColumnIncreasing, viewPermission: "frequency.view" },
  { href: "/missionaries", label: "Missionários", icon: Handshake, viewPermission: "missionary.view" },
  {
    href: "/caravans",
    label: "Caravanas",
    icon: BusFront,
    children: [
      { href: "/caravans", label: "Reservar", alwaysVisible: true },
      { href: "/caravans/approve", label: "Aprovar", viewPermission: "caravan.approve.view" },
      { href: "/caravans/manage", label: "Gerenciar", viewPermission: "caravan.manage.view" },
      { href: "/caravans/people", label: "Pessoas", alwaysVisible: true },
    ],
  },
  { href: "/patrol", label: "Ronda", icon: ShieldCheck, viewPermission: "patrol.view" },
  { href: "/lunch-calendar", label: "Calendário de almoços", icon: Utensils, viewPermission: "lunch.view" },
];

const secondaryItems: NavItem[] = [
  { href: "/ward", label: "Ala", icon: Building2, viewPermission: "ward.view" },
  { href: "/users", label: "Usuários e acessos", icon: KeyRound, viewPermission: "users.view" },
  { href: "/settings", label: "Configurações", icon: Settings, alwaysVisible: true },
];

type SidebarNavProps = {
  currentPath: string;
  currentUser: User;
  hasPermission: (permission: PermissionKey) => boolean;
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
  hasPermission,
}: {
  currentPath: string;
  items: NavItem[];
  onNavigate: () => void;
  hasPermission: (permission: PermissionKey) => boolean;
}) {
  return (
    <SidebarMenu className="gap-0.5 px-2 group-data-[collapsible=icon]:px-1">
      {items.map((item) => {
        const visibleChildren = item.children?.filter((child) => child.alwaysVisible || !child.viewPermission || hasPermission(child.viewPermission)) ?? [];
        const itemIsVisible = item.alwaysVisible || (item.viewPermission ? hasPermission(item.viewPermission) : visibleChildren.length > 0);
        if (!itemIsVisible) return null;

        const href = item.viewPermission && !hasPermission(item.viewPermission) && visibleChildren.length ? visibleChildren[0].href : item.href;
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
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              isActive={isActive}
              tooltip={item.label}
            >
              <Link href={href} onClick={onNavigate}>
                <Icon className="size-4" />
                <span className="font-medium">{item.label}</span>
              </Link>
            </SidebarMenuButton>
            {visibleChildren.length ? (
              <SidebarMenuSub>
                {visibleChildren.map((child) => {
                  const isChildActive = child.href === item.href ? currentPath === child.href : currentPath === child.href || currentPath.startsWith(`${child.href}/`);

                  return (
                    <SidebarMenuSubItem key={child.href}>
                      <SidebarMenuSubButton asChild className="text-sidebar-foreground/70" isActive={isChildActive}>
                        <Link href={child.href} onClick={onNavigate}>
                          <span>{child.label}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  );
                })}
              </SidebarMenuSub>
            ) : null}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function SidebarNav({
  currentPath,
  currentUser,
  hasPermission,
  onLogout,
  onResetDemo,
  wardName,
}: SidebarNavProps) {
  const { isMobile, setOpenMobile } = useSidebar();

  function handleNavigate() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  return (
    <>
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center justify-between">
          <div className="group/header-logo relative flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-foreground text-sidebar transition-opacity group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:group-hover/header-logo:opacity-0">
              <HeartHandshake className="size-5" />
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">Zionwise</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{wardName}</p>
            </div>

            <div className="absolute inset-0 hidden items-center justify-center group-data-[collapsible=icon]:group-hover/header-logo:flex">
              <SidebarTrigger className="h-7 w-7" />
            </div>
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <SidebarTrigger />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="border-t border-sidebar-border/80 py-4 group-data-[collapsible=icon]:py-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <NavItems currentPath={currentPath} items={mainItems} onNavigate={handleNavigate} hasPermission={hasPermission} />
            <div className="my-2 px-5 group-data-[collapsible=icon]:px-2">
              <div className="h-px bg-sidebar-border/80" />
            </div>
            <NavItems currentPath={currentPath} items={secondaryItems} onNavigate={handleNavigate} hasPermission={hasPermission} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80 p-3 group-data-[collapsible=icon]:p-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Abrir menu do usuário"
            className="flex w-full items-center gap-2 rounded-lg bg-sidebar-accent/45 p-2 text-left transition-[background-color,color,transform] outline-none active:scale-[0.96] hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:hover:bg-transparent"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sidebar-foreground text-sm font-semibold text-sidebar group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:text-xs">
              {getInitials(currentUser.name)}
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{currentUser.name}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{currentUser.email}</p>
            </div>
            <MoreHorizontal className="size-4 shrink-0 text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" side="top" sideOffset={8}>
            <DropdownMenuGroup>
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
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </>
  );
}

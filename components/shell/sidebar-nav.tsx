"use client";

import {
  Building2,
  BusFront,
  ChevronRight,
  Cog,
  FileText,
  Handshake,
  HeartHandshake,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Map,
  MoreHorizontal,
  NotebookTabs,
  Settings,
  ShieldCheck,
  Utensils,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isSystemAdmin } from "@/lib/system-access";
import { cn } from "@/lib/utils";
import type { PermissionKey, User } from "@/types/domain";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  viewPermission?: PermissionKey;
  alwaysVisible?: boolean;
  systemOnly?: boolean;
  children?: Array<{
    href: string;
    label: string;
    viewPermission?: PermissionKey;
    alwaysVisible?: boolean;
    systemOnly?: boolean;
  }>;
};

const mainItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, viewPermission: "dashboard.view" },
  {
    href: "/meetings",
    label: "Atas Sacramentais",
    icon: FileText,
    children: [
      { href: "/meetings", label: "Atas", viewPermission: "minutes.view" },
      { href: "/meetings/hymns", label: "Hinos", viewPermission: "hymns.view" },
      { href: "/frequency", label: "Frequência", viewPermission: "frequency.view" },
    ],
  },
  {
    href: "/members",
    label: "Membros",
    icon: Users,
    viewPermission: "members.view",
    children: [
      { href: "/members", label: "Lista", viewPermission: "members.view" },
      { href: "/members/birthdays", label: "Aniversariantes", viewPermission: "members.view" },
    ],
  },
  { href: "/mapa", label: "Mapa", icon: Map, viewPermission: "map.view" },
  { href: "/progress", label: "Progressos", icon: NotebookTabs, viewPermission: "progress.view" },
  { href: "/missionaries", label: "Missionários", icon: Handshake, viewPermission: "missionary.view" },
  { href: "/lunch-calendar", label: "Almoços", icon: Utensils, viewPermission: "lunch.view" },
  { href: "/patrol", label: "Ronda", icon: ShieldCheck, viewPermission: "patrol.view" },
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
];

const secondaryItems: NavItem[] = [
  {
    href: "/system/wards",
    label: "Sistema",
    icon: Cog,
    systemOnly: true,
    children: [
      { href: "/system/wards", label: "Alas", systemOnly: true },
      { href: "/system/stakes", label: "Estacas", systemOnly: true },
      { href: "/system/hymn-books", label: "Livros de hinos", systemOnly: true },
      { href: "/system/hymns", label: "Hinos", systemOnly: true },
      { href: "/system/users", label: "Usuários", systemOnly: true },
      { href: "/system/access-templates", label: "Templates de acesso", systemOnly: true },
    ],
  },
  { href: "/users", label: "Usuários e acessos", icon: KeyRound, viewPermission: "users.view" },
  { href: "/audit", label: "Auditoria", icon: HeartHandshake, viewPermission: "audit.view" },
  { href: "/ward", label: "Ala", icon: Building2, viewPermission: "ward.view" },
  { href: "/stake", label: "Estaca", icon: Landmark, viewPermission: "stake.view" },
  { href: "/settings", label: "Configurações", icon: Settings, alwaysVisible: true },
];

type SidebarNavProps = {
  currentPath: string;
  currentUser: User;
  hasPermission: (permission: PermissionKey) => boolean;
  onLogout: () => void;
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
  canViewSystem,
}: {
  currentPath: string;
  items: NavItem[];
  onNavigate: () => void;
  hasPermission: (permission: PermissionKey) => boolean;
  canViewSystem: boolean;
}) {
  const visibleItems = items
    .map((item) => {
      const visibleChildren =
        item.children?.filter((child) => {
          if (child.systemOnly && !canViewSystem) return false;
          return child.alwaysVisible || !child.viewPermission || hasPermission(child.viewPermission);
        }) ?? [];
      const itemIsVisible =
        (!item.systemOnly || canViewSystem) &&
        (item.alwaysVisible || (item.viewPermission ? hasPermission(item.viewPermission) : visibleChildren.length > 0));

      return itemIsVisible ? { item, visibleChildren } : null;
    })
    .filter((entry): entry is { item: NavItem; visibleChildren: NonNullable<NavItem["children"]> } => Boolean(entry));

  return (
    <SidebarMenu className="gap-0.5 px-2 group-data-[collapsible=icon]:px-1">
      {visibleItems.map(({ item, visibleChildren }) => (
        <NavMenuItem key={item.href} currentPath={currentPath} item={item} visibleChildren={visibleChildren} onNavigate={onNavigate} hasPermission={hasPermission} />
      ))}
    </SidebarMenu>
  );
}

function NavMenuItem({
  currentPath,
  item,
  visibleChildren,
  onNavigate,
  hasPermission,
}: {
  currentPath: string;
  item: NavItem;
  visibleChildren: NonNullable<NavItem["children"]>;
  onNavigate: () => void;
  hasPermission: (permission: PermissionKey) => boolean;
}) {
  const href = item.viewPermission && !hasPermission(item.viewPermission) && visibleChildren.length ? visibleChildren[0].href : item.href;
  const hasActiveChild = visibleChildren.some((child) => (child.href === item.href ? currentPath === child.href : currentPath === child.href || currentPath.startsWith(`${child.href}/`)));
  const isActive = currentPath === item.href || currentPath.startsWith(`${item.href}/`) || hasActiveChild;
  const Icon = item.icon;
  const hasChildren = visibleChildren.length > 0;
  const [isOpen, setIsOpen] = useState(isActive);
  const open = isActive || isOpen;

  if (!hasChildren) {
    return (
      <SidebarMenuItem>
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
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild open={open} onOpenChange={setIsOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            className={cn(
              "h-8 rounded-md px-3 text-sm transition-colors duration-200",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
            isActive={isActive}
            tooltip={item.label}
          >
            <Icon className="size-4" />
            <span className="font-medium">{item.label}</span>
            <ChevronRight className="ml-auto size-4 text-sidebar-foreground/55 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
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
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function SidebarNav({
  currentPath,
  currentUser,
  hasPermission,
  onLogout,
  wardName,
}: SidebarNavProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const canViewSystem = isSystemAdmin(currentUser);

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
            <NavItems currentPath={currentPath} items={mainItems} onNavigate={handleNavigate} hasPermission={hasPermission} canViewSystem={canViewSystem} />
            <div className="my-2 px-5 group-data-[collapsible=icon]:px-2">
              <div className="h-px bg-sidebar-border/80" />
            </div>
            <NavItems currentPath={currentPath} items={secondaryItems} onNavigate={handleNavigate} hasPermission={hasPermission} canViewSystem={canViewSystem} />
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

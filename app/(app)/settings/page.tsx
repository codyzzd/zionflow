"use client";

import { CalendarDays, Monitor, Moon, SunMedium } from "lucide-react";

import { useAppContext } from "@/components/providers/app-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CalendarWeekStartsOn, DateFormat } from "@/types/domain";
import type { ThemePreference } from "@/lib/theme";

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  {
    value: "light",
    label: "Light",
    description: "Mantém a interface sempre no tema claro.",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Mantém a interface sempre no tema escuro.",
  },
  {
    value: "system",
    label: "System",
    description: "Segue automaticamente o tema configurado no dispositivo.",
  },
];

const dateOptions: Array<{
  value: DateFormat;
  label: string;
  example: string;
}> = [
  {
    value: "short",
    label: "Curto",
    example: "18/04/1983",
  },
  {
    value: "medium",
    label: "Médio",
    example: "18 abr 1983",
  },
  {
    value: "long",
    label: "Longo",
    example: "18 de abril de 1983",
  },
];

export default function SettingsPage() {
  const { appPreferences, updateCalendarWeekStartsOn, updateDateFormat } = useAppContext();
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div className="mx-auto max-w-[800px]">
      <PageHeader
        eyebrow="Configurações"
        title="Preferências do sistema"
        description="Começamos com a personalização de aparência para cada usuário escolher como quer navegar no Zionflow."
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Aparência</CardTitle>
            <CardDescription>Escolha se o sistema deve abrir em `light`, `dark` ou seguir o tema do seu dispositivo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="theme-preference">Tema</Label>
              <Select value={theme} onValueChange={(value) => value && setTheme(value as ThemePreference)}>
                <SelectTrigger className="h-10 w-full max-w-sm">
                  <SelectValue placeholder="Selecione o tema" />
                </SelectTrigger>
                <SelectContent>
                  {themeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                Tema ativo agora: <span className="font-medium text-foreground">{resolvedTheme}</span>.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border bg-background p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <SunMedium className="size-4 text-primary" />
                  Light
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Ideal para ambientes claros e leitura com mais contraste sobre fundo branco.</p>
              </div>

              <div className="rounded-xl border bg-background p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Moon className="size-4 text-primary" />
                  Dark
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Reduz o brilho geral da interface e mantém a navegação mais confortável à noite.</p>
              </div>

              <div className="rounded-xl border bg-background p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Monitor className="size-4 text-primary" />
                  System
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Acompanha automaticamente a preferência configurada no sistema operacional.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Formatos e Calendários</CardTitle>
            <CardDescription>Defina como datas e semanas aparecem no sistema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="date-format">Formato de exibição de data</Label>
              <Select
                value={appPreferences.dateFormat}
                onValueChange={(value) => value && updateDateFormat(value as DateFormat)}
              >
                <SelectTrigger className="h-10 w-full max-w-sm" id="date-format">
                  <SelectValue placeholder="Selecione o formato de data" />
                </SelectTrigger>
                <SelectContent>
                  {dateOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({option.example})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Essa preferência altera como as datas são exibidas em textos e listas. A edição continua em dd/mm/yyyy.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calendar-week-start">Início da semana</Label>
              <Select
                value={appPreferences.calendarWeekStartsOn}
                onValueChange={(value) => value && updateCalendarWeekStartsOn(value as CalendarWeekStartsOn)}
              >
                <SelectTrigger className="h-10 w-full max-w-sm" id="calendar-week-start">
                  <SelectValue placeholder="Selecione o início da semana" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sunday">Domingo</SelectItem>
                  <SelectItem value="monday">Segunda-feira</SelectItem>
                </SelectContent>
              </Select>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4" />
                Essa preferência altera os calendários de almoços e segurança.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

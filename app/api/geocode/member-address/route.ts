import { NextResponse, type NextRequest } from "next/server";

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  importance?: number;
  class?: string;
  type?: string;
};

function parseCoordinate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { address?: unknown } | null;
  const address = typeof body?.address === "string" ? body.address.trim().replace(/\s+/g, " ") : "";

  if (!address) {
    return NextResponse.json({ error: "Informe um endereço para geocodificar." }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", address);
  url.searchParams.set("limit", "3");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "pt-BR");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Referer: request.nextUrl.origin,
      "User-Agent": "SuperAla/0.1 member-geocoding",
    },
  }).catch(() => null);

  if (!response?.ok) {
    return NextResponse.json({ error: "O serviço de geocodificação não respondeu agora." }, { status: 502 });
  }

  const data = (await response.json().catch(() => [])) as NominatimResult[];
  const results = data.flatMap((item) => {
    const latitude = parseCoordinate(item.lat);
    const longitude = parseCoordinate(item.lon);

    if (latitude === undefined || longitude === undefined) return [];

    return [
      {
        displayName: item.display_name ?? address,
        importance: item.importance,
        latitude,
        longitude,
        osmClass: item.class,
        type: item.type,
      },
    ];
  });

  return NextResponse.json({ results });
}

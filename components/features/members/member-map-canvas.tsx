"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import "leaflet.markercluster";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

import type { Member } from "@/types/domain";

type MappedMember = Member & { latitude: number; longitude: number };
type MapMarkerMember = Pick<Member, "address" | "id" | "name"> & {
  churchActivityStatus: Member["churchActivityStatus"];
  latitude: number;
  longitude: number;
};
export type MemberMapMarkerStyle = "classic_pin" | "compact_pin" | "circle";
type MarkerVisualKey = Member["churchActivityStatus"];
type MemberMarker = L.Marker & { memberVisualKey?: MarkerVisualKey };

const fallbackCenter: [number, number] = [-14.235, -51.9253];

const visualMeta: Record<MarkerVisualKey, { className: string; color: string; label: string; priority: number }> = {
  attending: { className: "member-map-marker-attending", color: "#059669", label: "Frequentando", priority: 2 },
  not_attending: { className: "member-map-marker-not-attending", color: "#dc2626", label: "Não frequentando", priority: 1 },
  away: { className: "member-map-marker-away", color: "#71717a", label: "Afastado", priority: 0 },
};
const visualKeyOrder: MarkerVisualKey[] = ["attending", "not_attending", "away"];

const markerStyleMeta: Record<MemberMapMarkerStyle, { className: string; iconAnchor: [number, number]; iconSize: [number, number]; popupAnchor: [number, number] }> = {
  classic_pin: { className: "member-map-marker-classic-pin", iconAnchor: [14, 32], iconSize: [28, 34], popupAnchor: [0, -30] },
  compact_pin: { className: "member-map-marker-compact-pin", iconAnchor: [11, 26], iconSize: [22, 28], popupAnchor: [0, -25] },
  circle: { className: "member-map-marker-circle", iconAnchor: [10, 10], iconSize: [20, 20], popupAnchor: [0, -12] },
};

function createMarkerIcon(visualKey: MarkerVisualKey, selected: boolean, markerStyle: MemberMapMarkerStyle) {
  const meta = visualMeta[visualKey];
  const styleMeta = markerStyleMeta[markerStyle];

  return L.divIcon({
    className: `member-map-marker ${styleMeta.className} ${meta.className}${selected ? " member-map-marker-selected" : ""}`,
    html: `<span aria-hidden="true" style="background:${meta.color}"></span>`,
    iconAnchor: styleMeta.iconAnchor,
    iconSize: styleMeta.iconSize,
    popupAnchor: styleMeta.popupAnchor,
  });
}

function getMarkerZIndexOffset(visualKey: MarkerVisualKey, selected: boolean) {
  return 1000 + visualMeta[visualKey].priority * 100000 + (selected ? 1000 : 0);
}

function createClusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  const counts = cluster
    .getAllChildMarkers()
    .map((marker) => (marker as MemberMarker).memberVisualKey)
    .filter((visualKey): visualKey is MarkerVisualKey => Boolean(visualKey))
    .reduce<Record<MarkerVisualKey, number>>(
      (result, visualKey) => ({ ...result, [visualKey]: result[visualKey] + 1 }),
      { attending: 0, away: 0, not_attending: 0 },
    );
  let cumulativePercent = 0;
  const gradientSegments = visualKeyOrder.flatMap((visualKey) => {
    const visualCount = counts[visualKey];
    if (!visualCount) return [];

    const startPercent = cumulativePercent;
    cumulativePercent += (visualCount / count) * 100;

    return [`${visualMeta[visualKey].color} ${startPercent}% ${cumulativePercent}%`];
  });
  const breakdown = visualKeyOrder
    .filter((visualKey) => counts[visualKey] > 0)
    .map((visualKey) => `${visualMeta[visualKey].label}: ${counts[visualKey]}`)
    .join("; ");
  const clusterStyle = [
    `background:conic-gradient(${gradientSegments.join(", ")})`,
    "border:3px solid #fff",
    "border-radius:999px",
    "box-shadow:0 0 0 3px rgb(63 63 70 / 0.9),0 10px 24px rgb(0 0 0 / 0.22)",
    "box-sizing:border-box",
    "color:#fff",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font-size:0.75rem",
    "font-variant-numeric:tabular-nums",
    "font-weight:700",
    "height:30px",
    "line-height:1",
    "margin:3px",
    "text-shadow:0 1px 2px rgb(0 0 0 / 0.28)",
    "width:30px",
  ].join(";");

  return L.divIcon({
    className: "member-map-cluster-chart",
    html: `<span title="${breakdown}" style="${clusterStyle}">+${count}</span>`,
    iconAnchor: [18, 18],
    iconSize: [36, 36],
  });
}

function createPopupContent(member: MapMarkerMember) {
  const container = document.createElement("div");
  const name = document.createElement("strong");
  const status = document.createElement("span");
  const address = document.createElement("span");

  name.textContent = member.name;
  status.textContent = visualMeta[member.churchActivityStatus].label;
  address.textContent = member.address || "Endereço não informado";

  container.append(name, document.createElement("br"), status, document.createElement("br"), address);

  return container;
}

function serializeMapMarkerMembers(members: MappedMember[]) {
  const markerMembers: MapMarkerMember[] = members
    .map(({ address, churchActivityStatus, id, latitude, longitude, name }) => ({
      address,
      churchActivityStatus,
      id,
      latitude,
      longitude,
      name,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return JSON.stringify(markerMembers);
}

function FlyToSelectedMember({ focusKey, member }: { focusKey: number; member?: MappedMember }) {
  const map = useMap();

  useEffect(() => {
    if (member && focusKey > 0) {
      map.flyTo([member.latitude, member.longitude], Math.max(map.getZoom(), 14), { duration: 0.6 });
    }
  }, [focusKey, map, member]);

  return null;
}

function MemberMarkerLayer({
  clusterEnabled,
  markerStyle,
  members,
  onSelectMember,
  selectedMemberId,
}: {
  clusterEnabled: boolean;
  markerStyle: MemberMapMarkerStyle;
  members: MappedMember[];
  onSelectMember: (memberId: string) => void;
  selectedMemberId?: string;
}) {
  const map = useMap();
  const serializedMembers = serializeMapMarkerMembers(members);
  const markersByMemberIdRef = useRef(new Map<string, MemberMarker>());

  useEffect(() => {
    const markersByMemberId = markersByMemberIdRef.current;
    const markerMembers = JSON.parse(serializedMembers) as MapMarkerMember[];
    markersByMemberId.clear();

    const markers = markerMembers.map((member) => {
      const visualKey = member.churchActivityStatus;
      const marker = L.marker([member.latitude, member.longitude], {
        icon: createMarkerIcon(visualKey, false, markerStyle),
        zIndexOffset: getMarkerZIndexOffset(visualKey, false),
      }) as MemberMarker;

      marker.memberVisualKey = visualKey;
      marker.bindPopup(createPopupContent(member));
      marker.on("click", () => onSelectMember(member.id));
      markersByMemberId.set(member.id, marker);

      return marker;
    });

    if (!clusterEnabled) {
      markers.forEach((marker) => map.addLayer(marker));

      return () => {
        markers.forEach((marker) => map.removeLayer(marker));
        markersByMemberId.clear();
      };
    }

    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      iconCreateFunction: createClusterIcon,
      maxClusterRadius: 8,
      removeOutsideVisibleBounds: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      spiderLegPolylineOptions: { color: "#525252", opacity: 0.55, weight: 1.5 },
      zoomToBoundsOnClick: true,
    });

    clusterGroup.addLayers(markers);
    map.addLayer(clusterGroup);

    return () => {
      map.removeLayer(clusterGroup);
      markersByMemberId.clear();
    };
  }, [clusterEnabled, map, markerStyle, onSelectMember, serializedMembers]);

  useEffect(() => {
    markersByMemberIdRef.current.forEach((marker, memberId) => {
      const visualKey = marker.memberVisualKey;
      if (!visualKey) return;

      const selected = memberId === selectedMemberId;
      marker.setIcon(createMarkerIcon(visualKey, selected, markerStyle));
      marker.setZIndexOffset(getMarkerZIndexOffset(visualKey, selected));
    });
  }, [markerStyle, selectedMemberId]);

  return null;
}

export function MemberMapCanvas({
  clusterEnabled = false,
  markerStyle = "circle",
  members,
  onSelectMember,
  selectedMemberFocusKey = 0,
  selectedMemberId,
}: {
  clusterEnabled?: boolean;
  markerStyle?: MemberMapMarkerStyle;
  members: MappedMember[];
  onSelectMember: (memberId: string) => void;
  selectedMemberFocusKey?: number;
  selectedMemberId?: string;
}) {
  const selectedMember = members.find((member) => member.id === selectedMemberId);
  const center = useMemo<[number, number]>(() => {
    const firstMember = members[0];

    return firstMember ? [firstMember.latitude, firstMember.longitude] : fallbackCenter;
  }, [members]);

  return (
    <MapContainer center={center} className="member-map h-full min-h-[420px] w-full rounded-lg border" scrollWheelZoom zoom={members.length ? 13 : 4}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyToSelectedMember focusKey={selectedMemberFocusKey} member={selectedMember} />
      <MemberMarkerLayer
        clusterEnabled={clusterEnabled}
        markerStyle={markerStyle}
        members={members}
        onSelectMember={onSelectMember}
        selectedMemberId={selectedMemberId}
      />
    </MapContainer>
  );
}

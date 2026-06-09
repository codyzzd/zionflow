"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import "leaflet.markercluster";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

import type { AttendanceBucketKey } from "@/lib/member-attendance-summary";
import type { Member } from "@/types/domain";

export type MemberMapAttendanceBucket = AttendanceBucketKey | "no_history";
type MappedMember = Member & { attendanceBucketKey: MemberMapAttendanceBucket; latitude: number; longitude: number };
type MapMarkerMember = Pick<Member, "address" | "id" | "name"> & {
  attendanceBucketKey: MemberMapAttendanceBucket;
  latitude: number;
  longitude: number;
};
export type MemberMapMarkerStyle = "classic_pin" | "compact_pin" | "circle";
type MemberMarker = L.Marker & { memberAttendanceBucket?: MemberMapAttendanceBucket };

const fallbackCenter: [number, number] = [-14.235, -51.9253];

const attendanceMeta: Record<MemberMapAttendanceBucket, { className: string; label: string; priority: number }> = {
  present_last_sunday: { className: "member-map-marker-present-last-sunday", label: "Veio no último domingo", priority: 0 },
  missed_1: { className: "member-map-marker-missed-1", label: "Faltou 1 domingo", priority: 1 },
  missed_2: { className: "member-map-marker-missed-2", label: "Faltou 2 domingos", priority: 2 },
  missed_3: { className: "member-map-marker-missed-3", label: "Faltou 3 domingos", priority: 3 },
  missed_4_plus: { className: "member-map-marker-missed-4-plus", label: "Não vem há 4+ domingos", priority: 4 },
  no_history: { className: "member-map-marker-no-history", label: "Sem histórico importado", priority: -1 },
};
const attendanceBucketOrder: MemberMapAttendanceBucket[] = [
  "present_last_sunday",
  "missed_1",
  "missed_2",
  "missed_3",
  "missed_4_plus",
  "no_history",
];
const attendanceBucketColors: Record<MemberMapAttendanceBucket, string> = {
  present_last_sunday: "#059669",
  missed_1: "#ca8a04",
  missed_2: "#ea580c",
  missed_3: "#dc2626",
  missed_4_plus: "#7e22ce",
  no_history: "#71717a",
};

const markerStyleMeta: Record<MemberMapMarkerStyle, { className: string; iconAnchor: [number, number]; iconSize: [number, number]; popupAnchor: [number, number] }> = {
  classic_pin: { className: "member-map-marker-classic-pin", iconAnchor: [14, 32], iconSize: [28, 34], popupAnchor: [0, -30] },
  compact_pin: { className: "member-map-marker-compact-pin", iconAnchor: [11, 26], iconSize: [22, 28], popupAnchor: [0, -25] },
  circle: { className: "member-map-marker-circle", iconAnchor: [10, 10], iconSize: [20, 20], popupAnchor: [0, -12] },
};

function createMarkerIcon(attendanceBucket: MemberMapAttendanceBucket, selected: boolean, markerStyle: MemberMapMarkerStyle) {
  const meta = attendanceMeta[attendanceBucket];
  const styleMeta = markerStyleMeta[markerStyle];

  return L.divIcon({
    className: `member-map-marker ${styleMeta.className} ${meta.className}${selected ? " member-map-marker-selected" : ""}`,
    html: `<span aria-hidden="true"></span>`,
    iconAnchor: styleMeta.iconAnchor,
    iconSize: styleMeta.iconSize,
    popupAnchor: styleMeta.popupAnchor,
  });
}

function getMarkerZIndexOffset(attendanceBucket: MemberMapAttendanceBucket, selected: boolean) {
  if (selected) return 2000;

  return 1000 + attendanceMeta[attendanceBucket].priority * 100;
}

function createClusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  const attendanceBuckets = cluster
    .getAllChildMarkers()
    .map((marker) => (marker as MemberMarker).memberAttendanceBucket)
    .filter((bucket): bucket is MemberMapAttendanceBucket => Boolean(bucket));
  const counts = attendanceBuckets.reduce<Record<MemberMapAttendanceBucket, number>>(
    (result, bucket) => ({ ...result, [bucket]: result[bucket] + 1 }),
    {
      present_last_sunday: 0,
      missed_1: 0,
      missed_2: 0,
      missed_3: 0,
      missed_4_plus: 0,
      no_history: 0,
    },
  );
  let cumulativePercent = 0;
  const gradientSegments = attendanceBucketOrder.flatMap((bucket) => {
    const bucketCount = counts[bucket];
    if (!bucketCount) return [];

    const startPercent = cumulativePercent;
    cumulativePercent += (bucketCount / count) * 100;

    return [`${attendanceBucketColors[bucket]} ${startPercent}% ${cumulativePercent}%`];
  });
  const gradient = `conic-gradient(${gradientSegments.join(", ")})`;
  const breakdown = attendanceBucketOrder
    .filter((bucket) => counts[bucket] > 0)
    .map((bucket) => `${attendanceMeta[bucket].label}: ${counts[bucket]}`)
    .join("; ");
  const clusterStyle = [
    `background:${gradient}`,
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
  status.textContent = attendanceMeta[member.attendanceBucketKey].label;
  address.textContent = member.address || "Endereço não informado";

  container.append(name, document.createElement("br"), status, document.createElement("br"), address);

  return container;
}

function serializeMapMarkerMembers(members: MappedMember[]) {
  const markerMembers: MapMarkerMember[] = members
    .map(({ address, attendanceBucketKey, id, latitude, longitude, name }) => ({
      address,
      attendanceBucketKey,
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

function MemberMarkerClusterLayer({
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
      const marker = L.marker([member.latitude, member.longitude], {
        icon: createMarkerIcon(member.attendanceBucketKey, false, markerStyle),
        zIndexOffset: getMarkerZIndexOffset(member.attendanceBucketKey, false),
      }) as MemberMarker;

      marker.memberAttendanceBucket = member.attendanceBucketKey;
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
      const attendanceBucket = marker.memberAttendanceBucket;
      if (!attendanceBucket) return;

      const selected = memberId === selectedMemberId;
      marker.setIcon(createMarkerIcon(attendanceBucket, selected, markerStyle));
      marker.setZIndexOffset(getMarkerZIndexOffset(attendanceBucket, selected));
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
      <MemberMarkerClusterLayer
        clusterEnabled={clusterEnabled}
        markerStyle={markerStyle}
        members={members}
        onSelectMember={onSelectMember}
        selectedMemberId={selectedMemberId}
      />
    </MapContainer>
  );
}

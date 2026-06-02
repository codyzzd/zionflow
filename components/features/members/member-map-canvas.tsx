"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import "leaflet.markercluster";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

import type { Member } from "@/types/domain";

type MappedMember = Member & { latitude: number; longitude: number };
export type MemberMapMarkerStyle = "classic_pin" | "compact_pin" | "circle";
type MemberMarker = L.Marker & { memberActivityStatus?: Member["churchActivityStatus"] };

const fallbackCenter: [number, number] = [-14.235, -51.9253];

const statusMeta: Record<Member["churchActivityStatus"], { className: string; label: string }> = {
  away: { className: "member-map-marker-away", label: "Afastado" },
  attending: { className: "member-map-marker-attending", label: "Frequentando" },
  not_attending: { className: "member-map-marker-not-attending", label: "Não frequentando" },
};

const markerStyleMeta: Record<MemberMapMarkerStyle, { className: string; iconAnchor: [number, number]; iconSize: [number, number]; popupAnchor: [number, number] }> = {
  classic_pin: { className: "member-map-marker-classic-pin", iconAnchor: [14, 32], iconSize: [28, 34], popupAnchor: [0, -30] },
  compact_pin: { className: "member-map-marker-compact-pin", iconAnchor: [11, 26], iconSize: [22, 28], popupAnchor: [0, -25] },
  circle: { className: "member-map-marker-circle", iconAnchor: [10, 10], iconSize: [20, 20], popupAnchor: [0, -12] },
};

function createMarkerIcon(status: Member["churchActivityStatus"], selected: boolean, markerStyle: MemberMapMarkerStyle) {
  const meta = statusMeta[status];
  const styleMeta = markerStyleMeta[markerStyle];

  return L.divIcon({
    className: `member-map-marker ${styleMeta.className} ${meta.className}${selected ? " member-map-marker-selected" : ""}`,
    html: `<span aria-hidden="true"></span>`,
    iconAnchor: styleMeta.iconAnchor,
    iconSize: styleMeta.iconSize,
    popupAnchor: styleMeta.popupAnchor,
  });
}

function getMarkerZIndexOffset(status: Member["churchActivityStatus"], selected: boolean) {
  if (selected) return 2000;
  if (status === "attending") return 1000;

  return 0;
}

function createClusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  const statuses = cluster
    .getAllChildMarkers()
    .map((marker) => (marker as MemberMarker).memberActivityStatus)
    .filter((status): status is Member["churchActivityStatus"] => status === "attending" || status === "not_attending" || status === "away");
  const hasAway = statuses.includes("away");
  const hasAttending = statuses.includes("attending");
  const hasNotAttending = statuses.includes("not_attending");
  const presentStatusCount = [hasAway, hasAttending, hasNotAttending].filter(Boolean).length;
  const statusClassName =
    presentStatusCount > 1
      ? `member-map-cluster-mixed-${hasAttending ? "attending" : ""}${hasNotAttending ? "not-attending" : ""}${hasAway ? "away" : ""}`
      : hasAway
        ? "member-map-cluster-away"
        : hasAttending
          ? "member-map-cluster-attending"
          : "member-map-cluster-not-attending";

  return L.divIcon({
    className: `member-map-cluster ${statusClassName}`,
    html: `<span class="member-map-cluster-count"><span>+${count}</span></span>`,
    iconAnchor: [18, 40],
    iconSize: [36, 42],
  });
}

function createPopupContent(member: MappedMember) {
  const container = document.createElement("div");
  const name = document.createElement("strong");
  const status = document.createElement("span");
  const address = document.createElement("span");

  name.textContent = member.name;
  status.textContent = statusMeta[member.churchActivityStatus].label;
  address.textContent = member.address || "Endereço não informado";

  container.append(name, document.createElement("br"), status, document.createElement("br"), address);

  return container;
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
  const markersByMemberIdRef = useRef(new Map<string, MemberMarker>());

  useEffect(() => {
    const markersByMemberId = markersByMemberIdRef.current;
    markersByMemberId.clear();

    const markers = members.map((member) => {
      const marker = L.marker([member.latitude, member.longitude], {
        icon: createMarkerIcon(member.churchActivityStatus, false, markerStyle),
        zIndexOffset: getMarkerZIndexOffset(member.churchActivityStatus, false),
      }) as MemberMarker;

      marker.memberActivityStatus = member.churchActivityStatus;
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
  }, [clusterEnabled, map, markerStyle, members, onSelectMember]);

  useEffect(() => {
    markersByMemberIdRef.current.forEach((marker, memberId) => {
      const status = marker.memberActivityStatus;
      if (!status) return;

      const selected = memberId === selectedMemberId;
      marker.setIcon(createMarkerIcon(status, selected, markerStyle));
      marker.setZIndexOffset(getMarkerZIndexOffset(status, selected));
    });
  }, [markerStyle, selectedMemberId]);

  return null;
}

export function MemberMapCanvas({
  clusterEnabled = false,
  markerStyle = "classic_pin",
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

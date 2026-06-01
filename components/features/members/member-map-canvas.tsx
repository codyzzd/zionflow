"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

import type { Member } from "@/types/domain";

type MappedMember = Member & { latitude: number; longitude: number };

const fallbackCenter: [number, number] = [-14.235, -51.9253];

const statusMeta: Record<Member["churchActivityStatus"], { className: string; label: string }> = {
  attending: { className: "member-map-marker-attending", label: "Frequentando" },
  not_attending: { className: "member-map-marker-not-attending", label: "Não frequentando" },
};

function createMarkerIcon(status: Member["churchActivityStatus"], selected: boolean) {
  const meta = statusMeta[status];

  return L.divIcon({
    className: `member-map-marker ${meta.className}${selected ? " member-map-marker-selected" : ""}`,
    html: `<span aria-hidden="true"></span>`,
    iconAnchor: [10, 10],
    iconSize: [20, 20],
    popupAnchor: [0, -12],
  });
}

function FlyToSelectedMember({ member }: { member?: MappedMember }) {
  const map = useMap();

  useEffect(() => {
    if (member) {
      map.flyTo([member.latitude, member.longitude], Math.max(map.getZoom(), 14), { duration: 0.6 });
    }
  }, [map, member]);

  return null;
}

export function MemberMapCanvas({
  members,
  onSelectMember,
  selectedMemberId,
}: {
  members: MappedMember[];
  onSelectMember: (memberId: string) => void;
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
      <FlyToSelectedMember member={selectedMember} />
      {members.map((member) => (
        <Marker
          eventHandlers={{ click: () => onSelectMember(member.id) }}
          icon={createMarkerIcon(member.churchActivityStatus, member.id === selectedMemberId)}
          key={member.id}
          position={[member.latitude, member.longitude]}
        >
          <Popup>
            <div>
              <strong>{member.name}</strong>
              <br />
              {statusMeta[member.churchActivityStatus].label}
              <br />
              {member.address || "Endereço não informado"}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

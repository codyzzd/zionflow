import { normalizeDateInput } from "@/lib/utils";
import type { Caravan, CaravanRegistration } from "@/types/domain";

function getCaravanReturnTimestamp(caravan: Caravan) {
  const returnDate = normalizeDateInput(caravan.returnDate);
  if (!returnDate) return Number.POSITIVE_INFINITY;

  const returnTime = caravan.returnTime.trim() || "23:59";
  const timestamp = new Date(`${returnDate}T${returnTime}`).getTime();

  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export function isCaravanActiveForPersonArchive(caravan: Caravan, now = new Date()) {
  if (caravan.archivedAt) return false;

  return getCaravanReturnTimestamp(caravan) >= now.getTime();
}

export function findBlockingCaravanForPersonArchive({
  caravans,
  now = new Date(),
  personId,
  registrations,
}: {
  caravans: Caravan[];
  now?: Date;
  personId: string;
  registrations: CaravanRegistration[];
}) {
  const caravansById = new Map(caravans.map((caravan) => [caravan.id, caravan]));

  return registrations
    .filter((registration) => registration.personId === personId && !registration.archivedAt)
    .map((registration) => caravansById.get(registration.caravanId))
    .find((caravan): caravan is Caravan => Boolean(caravan && isCaravanActiveForPersonArchive(caravan, now)));
}

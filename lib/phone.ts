const BRAZIL_AREA_CODES = new Set([
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "24",
  "27",
  "28",
  "31",
  "32",
  "33",
  "34",
  "35",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "53",
  "54",
  "55",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "71",
  "73",
  "74",
  "75",
  "77",
  "79",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
]);

function isValidBrazilNationalPhone(digits: string) {
  if (!/^\d{10,11}$/.test(digits)) return false;

  const areaCode = digits.slice(0, 2);
  const subscriberNumber = digits.slice(2);

  return BRAZIL_AREA_CODES.has(areaCode) && /^\d{8,9}$/.test(subscriberNumber);
}

export function normalizeBrazilPhoneForWhatsApp(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  const candidates = [digits];

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    candidates.push(digits.slice(2));
  }

  if (digits.startsWith("0")) {
    candidates.push(digits.slice(1));

    if (digits.length >= 13) {
      candidates.push(digits.slice(3));
    }
  }

  const nationalPhone = candidates.find(isValidBrazilNationalPhone);

  return nationalPhone ? `55${nationalPhone}` : null;
}

export function buildBrazilWhatsAppUrl(value: string) {
  const normalizedPhone = normalizeBrazilPhoneForWhatsApp(value);

  return normalizedPhone ? `https://wa.me/${normalizedPhone}` : null;
}

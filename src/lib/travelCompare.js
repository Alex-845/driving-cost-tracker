import { roundTo, toNumber } from "./drivingMath.js";

export const NO_RECORDED_ROUTE = "__NO_RECORDED_ROUTE__";

export const defaultCompareForm = () => ({
  entryStation: "",
  exitStation: "",
  distance: "",
  fuelPrice: "7.5",
  consumption: "6",
  passengers: "1",
  outboundTollSegment1: "",
  outboundTollSegment2: "",
  returnTollSegment1: "",
  returnTollSegment2: "",
  parking: "0",
  drivingOther: "0",
  publicOutboundFare1: "",
  publicOutboundFare2: "",
  publicReturnFare1: "",
  publicReturnFare2: "",
  publicTransfer: "0",
  publicOther: "0"
});

const normalizePlace = (value) => String(value || "").trim();

const getRouteValue = (record) => (
  normalizePlace(record.highway) || NO_RECORDED_ROUTE
);

const getRouteLabel = (routeValue) => (
  routeValue === NO_RECORDED_ROUTE ? "未记录路线" : routeValue
);

const getRouteSignature = (routeValue) => {
  if (routeValue === NO_RECORDED_ROUTE) return NO_RECORDED_ROUTE;
  return normalizePlace(routeValue)
    .split(/[-—→/、\s]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .join("|");
};

const summarizeTravelRoute = (routeRecords, routeValue) => {
  const latestRecord = [...routeRecords].sort((a, b) => (
    String(b.date || "").localeCompare(String(a.date || ""))
    || (Number(b.id) || 0) - (Number(a.id) || 0)
  ))[0];
  const totalDistance = routeRecords.reduce((sum, record) => sum + toNumber(record.distance), 0);
  const totalFuelLiters = routeRecords.reduce((sum, record) => (
    sum + toNumber(record.distance) * toNumber(record.consumption) / 100
  ), 0);
  const tolls = routeRecords.map(record => toNumber(record.toll));
  const averageDistance = roundTo(totalDistance / routeRecords.length, 1);
  const averageConsumption = totalDistance > 0
    ? roundTo(totalFuelLiters / totalDistance * 100, 1)
    : 0;
  const latestFuelPrice = roundTo(toNumber(latestRecord?.price), 2);
  const averageToll = roundTo(
    tolls.reduce((sum, toll) => sum + toll, 0) / routeRecords.length,
    2
  );
  const estimatedFuelCost = roundTo(
    averageDistance * averageConsumption / 100 * latestFuelPrice,
    2
  );

  return {
    routeValue,
    routeLabel: getRouteLabel(routeValue),
    routeSignature: getRouteSignature(routeValue),
    count: routeRecords.length,
    averageDistance,
    averageConsumption,
    latestFuelPrice,
    averageToll,
    tollMin: Math.min(...tolls),
    tollMax: Math.max(...tolls),
    estimatedFuelCost,
    estimatedTotalCost: roundTo(estimatedFuelCost + averageToll, 2),
    latestDate: latestRecord?.date || "",
    latestRecord
  };
};

export const getTravelRouteProfiles = (records, from, to) => {
  const normalizedFrom = normalizePlace(from);
  const normalizedTo = normalizePlace(to);
  if (!normalizedFrom || !normalizedTo) return [];

  const groups = new Map();
  records.forEach(record => {
    if (
      normalizePlace(record.from) !== normalizedFrom
      || normalizePlace(record.to) !== normalizedTo
    ) return;

    const routeValue = getRouteValue(record);
    if (!groups.has(routeValue)) groups.set(routeValue, []);
    groups.get(routeValue).push(record);
  });

  return [...groups.entries()]
    .map(([routeValue, routeRecords]) => summarizeTravelRoute(routeRecords, routeValue))
    .sort((a, b) => b.count - a.count || a.routeLabel.localeCompare(b.routeLabel, "zh-CN"));
};

export const getReverseTravelRouteProfile = (records, from, to, routeValue) => {
  if (!routeValue) return null;
  const signature = getRouteSignature(routeValue);
  return getTravelRouteProfiles(records, to, from)
    .find(profile => profile.routeSignature === signature) || null;
};

export const fillCompareFormFromRoute = (form, outboundProfile, returnProfile) => {
  if (!outboundProfile) return form;
  const equivalentOneWayDistance = returnProfile
    ? roundTo((outboundProfile.averageDistance + returnProfile.averageDistance) / 2, 1)
    : outboundProfile.averageDistance;
  const combinedDistance = outboundProfile.averageDistance + (returnProfile?.averageDistance || 0);
  const combinedConsumption = returnProfile && combinedDistance > 0
    ? roundTo((
      outboundProfile.averageDistance * outboundProfile.averageConsumption
      + returnProfile.averageDistance * returnProfile.averageConsumption
    ) / combinedDistance, 1)
    : outboundProfile.averageConsumption;
  const latestPriceProfile = returnProfile?.latestDate > outboundProfile.latestDate
    ? returnProfile
    : outboundProfile;
  const returnToll = returnProfile?.averageToll ?? outboundProfile.averageToll;
  return {
    ...form,
    distance: String(equivalentOneWayDistance),
    fuelPrice: String(latestPriceProfile.latestFuelPrice),
    consumption: String(combinedConsumption),
    outboundTollSegment1: String(outboundProfile.averageToll),
    outboundTollSegment2: "0",
    returnTollSegment1: String(returnToll),
    returnTollSegment2: "0"
  };
};

export const pickRecommendedFare = (fares) => {
  if (!fares.length) return null;
  return [...fares].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const timeSort = b.latestRecord.exitTime.localeCompare(a.latestRecord.exitTime);
    if (timeSort) return timeSort;
    return a.amount - b.amount;
  })[0];
};

export const calcTravelComparison = (form, recommendedOutbound, recommendedReturn) => {
  const passengers = Math.max(1, Math.floor(toNumber(form.passengers, 1)));
  const oneWayDistance = toNumber(form.distance);
  const roundTripDistance = oneWayDistance * 2;
  const fuelCostPer100Km = roundTo(toNumber(form.consumption) * toNumber(form.fuelPrice), 2);
  const fuelCost = roundTo(roundTripDistance / 100 * fuelCostPer100Km, 2);
  const outboundTollSegments = [
    toNumber(form.outboundTollSegment1, recommendedOutbound?.amount || 0),
    toNumber(form.outboundTollSegment2)
  ];
  const returnTollSegments = [
    toNumber(form.returnTollSegment1, recommendedReturn?.amount || 0),
    toNumber(form.returnTollSegment2)
  ];
  const outboundToll = roundTo(outboundTollSegments[0] + outboundTollSegments[1], 2);
  const returnToll = roundTo(returnTollSegments[0] + returnTollSegments[1], 2);
  const tollCost = roundTo(outboundToll + returnToll, 2);
  const drivingTotal = roundTo(fuelCost + tollCost + toNumber(form.parking) + toNumber(form.drivingOther), 2);
  const drivingPerPerson = roundTo(drivingTotal / passengers, 2);

  const publicFareSegments = [
    toNumber(form.publicOutboundFare1),
    toNumber(form.publicOutboundFare2),
    toNumber(form.publicReturnFare1),
    toNumber(form.publicReturnFare2)
  ];
  const publicFarePerPerson = roundTo(publicFareSegments.reduce((sum, fare) => sum + fare, 0), 2);
  const publicTicketCost = roundTo(publicFarePerPerson * passengers, 2);
  const publicTotal = roundTo(publicTicketCost + toNumber(form.publicTransfer) + toNumber(form.publicOther), 2);
  const publicPerPerson = roundTo(publicTotal / passengers, 2);
  const diff = roundTo(Math.abs(drivingTotal - publicTotal), 2);
  const winner = drivingTotal === publicTotal ? "tie" : drivingTotal < publicTotal ? "driving" : "public";

  return {
    passengers,
    roundTripDistance,
    fuelCostPer100Km,
    fuelCost,
    outboundTollSegments,
    returnTollSegments,
    outboundToll,
    returnToll,
    tollCost,
    drivingTotal,
    drivingPerPerson,
    publicFareSegments,
    publicFarePerPerson,
    publicTicketCost,
    publicTotal,
    publicPerPerson,
    diff,
    winner
  };
};

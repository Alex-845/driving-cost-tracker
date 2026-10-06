import { roundTo, toNumber } from "./drivingMath.js";

export const NO_RECORDED_ROUTE = "__NO_RECORDED_ROUTE__";

export const defaultCompareForm = () => ({
  entryStation: "",
  exitStation: "",
  distance: "",
  fuelPrice: "7.5",
  consumption: "6",
  passengers: "1",
  // 每个数组元素是一段（上下高速一次算一段），可随意增删
  outboundTolls: [""],
  returnTolls: [""],
  parking: "0",
  drivingOther: "0",
  drivingMinutes: "",
  publicOutboundFares: [""],
  publicReturnFares: [""],
  publicTransfer: "0",
  publicOther: "0",
  publicMinutes: ""
});

const normalizePlace = (value) => String(value || "").trim();

const getRouteValue = (record) => (
  normalizePlace(record.highway) || NO_RECORDED_ROUTE
);

const getRouteLabel = (routeValue) => (
  routeValue === NO_RECORDED_ROUTE ? "未记录路线" : routeValue
);

// 逗号、分号、括号之后是"上下高速说明"，不属于道路顺序
const ANNOTATION_SPLIT = /[，,；;（(]/;
// 道路之间的分隔：半角/全角连字符、破折号、箭头、斜杠、顿号、空白
const ROAD_SPLIT = /[-—–－→>/、\s]+/;

/** 路线名里的道路顺序，如"昆磨－弥楚，峨山下易门南上" → ["昆磨","弥楚"]。 */
export const getRoadOrder = (routeValue) => {
  if (!routeValue || routeValue === NO_RECORDED_ROUTE) return [];
  const main = normalizePlace(routeValue).split(ANNOTATION_SPLIT)[0];
  return main.split(ROAD_SPLIT).map(part => part.trim()).filter(Boolean);
};

/** 宽松签名：只看道路组合，不看顺序。 */
const getLooseSignature = (routeValue) => {
  if (routeValue === NO_RECORDED_ROUTE) return NO_RECORDED_ROUTE;
  return [...getRoadOrder(routeValue)].sort((a, b) => a.localeCompare(b, "zh-CN")).join("|");
};

const sameList = (a, b) => a.length === b.length && a.every((item, index) => item === b[index]);

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
  const paidTolls = tolls.filter(toll => toll > 0);
  // 路线有收费样本时，0 元样本（节假日免费、未记录）不拉低平均过路费
  const tollSamples = paidTolls.length ? paidTolls : tolls;
  const zeroTollExcluded = paidTolls.length ? tolls.length - paidTolls.length : 0;
  const averageDistance = roundTo(totalDistance / routeRecords.length, 1);
  const averageConsumption = totalDistance > 0
    ? roundTo(totalFuelLiters / totalDistance * 100, 1)
    : 0;
  const latestFuelPrice = roundTo(toNumber(latestRecord?.price), 2);
  const averageToll = roundTo(
    tollSamples.reduce((sum, toll) => sum + toll, 0) / tollSamples.length,
    2
  );
  const estimatedFuelCost = roundTo(
    averageDistance * averageConsumption / 100 * latestFuelPrice,
    2
  );

  return {
    routeValue,
    routeLabel: getRouteLabel(routeValue),
    routeSignature: getLooseSignature(routeValue),
    roadOrder: getRoadOrder(routeValue),
    count: routeRecords.length,
    averageDistance,
    averageConsumption,
    latestFuelPrice,
    averageToll,
    zeroTollExcluded,
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

/**
 * 找返程路线。优先"道路顺序恰好相反"（strict）；找不到时退回
 * "道路组合相同但顺序不同"（loose），并用 matchQuality 标出，界面应提示用户核对。
 */
export const getReverseTravelRouteProfile = (records, from, to, routeValue) => {
  if (!routeValue) return null;
  const reverseProfiles = getTravelRouteProfiles(records, to, from);

  if (routeValue === NO_RECORDED_ROUTE) {
    const found = reverseProfiles.find(profile => profile.routeValue === NO_RECORDED_ROUTE);
    return found ? { ...found, matchQuality: "strict" } : null;
  }

  const outboundOrder = getRoadOrder(routeValue);
  if (!outboundOrder.length) return null;
  const reversedOrder = [...outboundOrder].reverse();

  const strict = reverseProfiles.find(profile => sameList(profile.roadOrder, reversedOrder));
  if (strict) return { ...strict, matchQuality: "strict" };

  const looseSignature = getLooseSignature(routeValue);
  const loose = reverseProfiles.find(profile => profile.routeSignature === looseSignature);
  return loose ? { ...loose, matchQuality: "loose" } : null;
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
    outboundTolls: [String(outboundProfile.averageToll)],
    returnTolls: [String(returnToll)]
  };
};

/** 描述一次 ETC 查询匹配到了什么，供界面提示（歧义、被排除的 0 元记录）。 */
export const describeFareMatch = (fares) => {
  const pairs = new Set(fares.map(fare => `${fare.entryStation}|${fare.exitStation}`));
  const zeroRecords = fares.filter(fare => !(fare.amount > 0)).reduce((sum, fare) => sum + fare.count, 0);
  return { pairCount: pairs.size, zeroRecords, ambiguous: pairs.size > 1 };
};

/**
 * 推荐 ETC 金额：默认排除 0 元（节假日免费等）记录；
 * 若匹配到多个不同的"入口站→出口站"组合则不推荐（返回 null），避免跨站点比较次数。
 */
export const pickRecommendedFare = (fares, { excludeZero = true } = {}) => {
  const candidates = fares.filter(fare => !(excludeZero && !(fare.amount > 0)));
  if (!candidates.length) return null;
  const pairs = new Set(candidates.map(fare => `${fare.entryStation}|${fare.exitStation}`));
  if (pairs.size > 1) return null;
  return [...candidates].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const timeSort = String(b.latestRecord.exitTime || "").localeCompare(String(a.latestRecord.exitTime || ""));
    if (timeSort) return timeSort;
    return a.amount - b.amount;
  })[0];
};

const isBlank = (value) => value === "" || value === null || value === undefined;
const sumList = (list = []) => roundTo(list.reduce((sum, value) => sum + toNumber(value), 0), 2);

export const calcTravelComparison = (form, recommendedOutbound, recommendedReturn) => {
  const passengers = Math.max(1, Math.floor(toNumber(form.passengers, 1)));
  const oneWayDistance = toNumber(form.distance);
  const roundTripDistance = oneWayDistance * 2;
  const fuelPrice = toNumber(form.fuelPrice);
  const consumption = toNumber(form.consumption);
  const fuelCostPer100Km = roundTo(consumption * fuelPrice, 2);
  const fuelCost = roundTo(roundTripDistance / 100 * fuelCostPer100Km, 2);

  const outboundList = form.outboundTolls || [];
  const returnList = form.returnTolls || [];
  // 只有整个方向一段都没填时才采用 ETC 参考价；填了任意一段就完全按用户输入计算，避免重复计入
  const outboundEstimated = outboundList.every(isBlank) && Boolean(recommendedOutbound);
  const returnEstimated = returnList.every(isBlank) && Boolean(recommendedReturn);
  const outboundTollSegments = outboundEstimated ? [recommendedOutbound.amount] : outboundList.map(value => toNumber(value));
  const returnTollSegments = returnEstimated ? [recommendedReturn.amount] : returnList.map(value => toNumber(value));
  const outboundToll = sumList(outboundTollSegments);
  const returnToll = sumList(returnTollSegments);
  const tollCost = roundTo(outboundToll + returnToll, 2);
  const drivingTotal = roundTo(fuelCost + tollCost + toNumber(form.parking) + toNumber(form.drivingOther), 2);
  const drivingPerPerson = roundTo(drivingTotal / passengers, 2);

  const publicFareSegments = [
    ...(form.publicOutboundFares || []).map(value => toNumber(value)),
    ...(form.publicReturnFares || []).map(value => toNumber(value))
  ];
  const publicFarePerPerson = sumList(publicFareSegments);
  const publicTicketCost = roundTo(publicFarePerPerson * passengers, 2);
  const publicTotal = roundTo(publicTicketCost + toNumber(form.publicTransfer) + toNumber(form.publicOther), 2);
  const publicPerPerson = roundTo(publicTotal / passengers, 2);
  const diff = roundTo(Math.abs(drivingTotal - publicTotal), 2);

  const missing = [];
  if (!(oneWayDistance > 0)) missing.push("自驾单程公里数");
  if (!(consumption > 0)) missing.push("百公里油耗");
  if (!(fuelPrice > 0)) missing.push("油价");
  if (!(publicFarePerPerson > 0)) missing.push("公共交通票价");
  const comparable = missing.length === 0;
  const winner = !comparable
    ? "incomplete"
    : drivingTotal === publicTotal ? "tie" : drivingTotal < publicTotal ? "driving" : "public";

  // 时间：两边都填了单程耗时才比较；只有"便宜的更慢"时才换算每小时代价
  const drivingRoundTripMinutes = toNumber(form.drivingMinutes) > 0 ? toNumber(form.drivingMinutes) * 2 : null;
  const publicRoundTripMinutes = toNumber(form.publicMinutes) > 0 ? toNumber(form.publicMinutes) * 2 : null;
  let timeComparison = null;
  if (comparable && drivingRoundTripMinutes && publicRoundTripMinutes) {
    const minutesDiff = Math.abs(drivingRoundTripMinutes - publicRoundTripMinutes);
    const faster = drivingRoundTripMinutes === publicRoundTripMinutes
      ? "tie"
      : drivingRoundTripMinutes < publicRoundTripMinutes ? "driving" : "public";
    const cheaper = winner;
    let perHour = null;
    let tradeoff = "";
    if (faster !== "tie" && cheaper !== "tie" && faster !== cheaper && minutesDiff >= 5 && diff > 0) {
      perHour = roundTo(diff / (minutesDiff / 60), 2);
      tradeoff = faster === "driving"
        ? `自驾多花 ¥${diff.toFixed(2)}，往返快 ${Math.round(minutesDiff)} 分钟，约合每节省 1 小时多花 ¥${perHour.toFixed(2)}`
        : `公共交通多花 ¥${diff.toFixed(2)}，往返快 ${Math.round(minutesDiff)} 分钟，约合每节省 1 小时多花 ¥${perHour.toFixed(2)}`;
    }
    timeComparison = { minutesDiff, faster, cheaper, perHour, tradeoff };
  }

  return {
    passengers,
    roundTripDistance,
    fuelCostPer100Km,
    fuelCost,
    outboundTollSegments,
    returnTollSegments,
    outboundTollEstimated: outboundEstimated,
    returnTollEstimated: returnEstimated,
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
    drivingRoundTripMinutes,
    publicRoundTripMinutes,
    timeComparison,
    diff,
    missing,
    comparable,
    winner
  };
};

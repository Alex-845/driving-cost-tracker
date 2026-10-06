import { ETC_STATION_ALIASES } from "../config/etcStationAliases.js";

const normalizeText = (value) => String(value || "").trim().toLowerCase();

export const getStationAlias = (station) => ETC_STATION_ALIASES[station] || "";

export const getStationLabel = (station) => {
  const alias = getStationAlias(station);
  return alias ? `${alias}（${station}）` : station;
};

const stationSearchText = (station) => normalizeText(`${station} ${getStationAlias(station)}`);

export const getEtcStations = (records) => {
  const stations = new Set();
  records.forEach((record) => {
    if (record.entryStation) stations.add(record.entryStation);
    if (record.exitStation) stations.add(record.exitStation);
  });
  Object.values(ETC_STATION_ALIASES).forEach((alias) => stations.add(alias));
  return [...stations].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
};

export const isFreeEtcAmount = (amount) => !(Number(amount) > 0);

export const getEtcSummary = (records) => {
  const routeKeys = new Set();
  const fareKeys = new Set();
  let totalAmount = 0;
  let zeroCount = 0;

  records.forEach((record) => {
    routeKeys.add(`${record.entryStation}|${record.exitStation}`);
    fareKeys.add(`${record.entryStation}|${record.exitStation}|${record.amount}`);
    totalAmount += Number(record.amount) || 0;
    if (isFreeEtcAmount(record.amount)) zeroCount += 1;
  });

  return {
    recordCount: records.length,
    zeroCount,
    paidCount: records.length - zeroCount,
    routeCount: routeKeys.size,
    fareCount: fareKeys.size,
    totalAmount
  };
};

/**
 * 站名匹配器。
 * exactFirst=true 时，如果输入恰好等于某个站名或别称，则只匹配这些站点
 * （例如"玉溪"只匹配别称为玉溪的通站，不会连带"玉溪九龙池""玉溪高仓"）；
 * 没有精确命中才退回子串匹配。ETC 查询页保持子串匹配以便探索。
 */
const buildStationMatcher = (query, records, exactFirst) => {
  const needle = normalizeText(query);
  if (!needle) return () => true;

  if (exactFirst) {
    const exact = new Set();
    records.forEach((record) => {
      [record.entryStation, record.exitStation].forEach((station) => {
        if (!station) return;
        if (normalizeText(station) === needle || normalizeText(getStationAlias(station)) === needle) exact.add(station);
      });
    });
    if (exact.size) return (station) => exact.has(station);
  }

  return (station) => stationSearchText(station).includes(needle);
};

export const queryEtcFares = (records, entryStation, exitStation, { exactFirst = false } = {}) => {
  const matchEntry = buildStationMatcher(entryStation, records, exactFirst);
  const matchExit = buildStationMatcher(exitStation, records, exactFirst);
  const matched = records.filter((record) => matchEntry(record.entryStation) && matchExit(record.exitStation));

  const fareMap = new Map();
  matched.forEach((record) => {
    const key = `${record.entryStation}|${record.exitStation}|${record.amount}`;
    const current = fareMap.get(key);
    if (!current) {
      fareMap.set(key, {
        entryStation: record.entryStation,
        exitStation: record.exitStation,
        entryLabel: getStationLabel(record.entryStation),
        exitLabel: getStationLabel(record.exitStation),
        amount: record.amount,
        isFree: isFreeEtcAmount(record.amount),
        count: 1,
        latestRecord: record,
        records: [record]
      });
      return;
    }

    current.count += 1;
    current.records.push(record);
    if (String(record.exitTime || "") > String(current.latestRecord.exitTime || "")) current.latestRecord = record;
  });

  return [...fareMap.values()].sort((a, b) => {
    const routeSort = a.entryStation.localeCompare(b.entryStation, "zh-Hans-CN")
      || a.exitStation.localeCompare(b.exitStation, "zh-Hans-CN");
    if (routeSort) return routeSort;
    return a.amount - b.amount;
  });
};

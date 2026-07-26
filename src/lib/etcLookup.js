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

export const getEtcSummary = (records) => {
  const routeKeys = new Set();
  const fareKeys = new Set();
  let totalAmount = 0;

  records.forEach((record) => {
    routeKeys.add(`${record.entryStation}|${record.exitStation}`);
    fareKeys.add(`${record.entryStation}|${record.exitStation}|${record.amount}`);
    totalAmount += record.amount;
  });

  return {
    recordCount: records.length,
    routeCount: routeKeys.size,
    fareCount: fareKeys.size,
    totalAmount
  };
};

export const queryEtcFares = (records, entryStation, exitStation) => {
  const entryQuery = normalizeText(entryStation);
  const exitQuery = normalizeText(exitStation);
  const matched = records.filter((record) => {
    const entry = stationSearchText(record.entryStation);
    const exit = stationSearchText(record.exitStation);
    return (!entryQuery || entry.includes(entryQuery)) && (!exitQuery || exit.includes(exitQuery));
  });

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
        count: 1,
        latestRecord: record,
        records: [record]
      });
      return;
    }

    current.count += 1;
    current.records.push(record);
    if (record.exitTime > current.latestRecord.exitTime) current.latestRecord = record;
  });

  return [...fareMap.values()].sort((a, b) => {
    const routeSort = a.entryStation.localeCompare(b.entryStation, "zh-Hans-CN")
      || a.exitStation.localeCompare(b.exitStation, "zh-Hans-CN");
    if (routeSort) return routeSort;
    return a.amount - b.amount;
  });
};

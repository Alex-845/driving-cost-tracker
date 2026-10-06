import { describe, expect, it } from "vitest";
import { getEtcSummary, queryEtcFares } from "../src/lib/etcLookup.js";
import {
  calcTravelComparison, defaultCompareForm, describeFareMatch, fillCompareFormFromRoute, getReverseTravelRouteProfile,
  getRoadOrder, getTravelRouteProfiles, pickRecommendedFare
} from "../src/lib/travelCompare.js";

const passage = (entry, exit, amount, n, tag = "") => Array.from({ length: n }, (_, i) => ({
  entryStation: entry, exitStation: exit, amount,
  entryTime: `2026-0${(i % 9) + 1}-01 08:00:00`, exitTime: `2026-0${(i % 9) + 1}-01 09:00:00`, sourceNo: `${tag}${i}`
}));

describe("ETC 站名匹配与推荐金额", () => {
  const etc = [
    ...passage("云南程家坝站", "云南通站站", 60, 2),
    ...passage("云南程家坝站", "云南九龙池站", 95, 5),
    ...passage("云南程家坝站", "云南高仓站", 110, 3)
  ];
  it("ETC 查询页保持子串匹配（可探索）", () => {
    expect(queryEtcFares(etc, "楚雄东", "玉溪").length).toBe(3);
  });
  it("精确优先：别称'玉溪'只匹配通站", () => {
    const fares = queryEtcFares(etc, "楚雄东", "玉溪", { exactFirst: true });
    expect(fares.map(f => f.exitStation)).toEqual(["云南通站站"]);
    expect(pickRecommendedFare(fares).amount).toBe(60);
  });
  it("精确优先找不到时退回子串，但跨多个站点不给推荐", () => {
    const fares = queryEtcFares(etc, "楚雄东", "玉溪九", { exactFirst: true });
    expect(fares.length).toBe(1);
    const broad = queryEtcFares(etc, "楚雄东", "玉", { exactFirst: true });
    expect(describeFareMatch(broad).ambiguous).toBe(true);
    expect(pickRecommendedFare(broad)).toBeNull();
  });
  it("默认排除 0 元记录，可关闭", () => {
    const withFree = [...etc.slice(0, 2), ...passage("云南程家坝站", "云南通站站", 0, 9, "z")];
    const fares = queryEtcFares(withFree, "云南程家坝站", "云南通站站", { exactFirst: true });
    expect(pickRecommendedFare(fares).amount).toBe(60);
    expect(pickRecommendedFare(fares, { excludeZero: false }).amount).toBe(0);
    expect(describeFareMatch(fares).zeroRecords).toBe(9);
    const onlyFree = queryEtcFares(passage("A", "B", 0, 3), "A", "B", { exactFirst: true });
    expect(pickRecommendedFare(onlyFree)).toBeNull();
  });
  it("汇总含 0 元计数", () => {
    const summary = getEtcSummary([...etc, ...passage("云南程家坝站", "云南通站站", 0, 4, "z")]);
    expect(summary.zeroCount).toBe(4);
    expect(summary.paidCount).toBe(10);
  });
});

describe("路线匹配", () => {
  const rec = (id, from, to, highway, toll = 50, date = "2026-01-01") => ({ id, from, to, highway, distance: 200, consumption: 6, price: 7.5, toll, date });
  it("道路顺序解析：全角连字符与逗号后的说明", () => {
    expect(getRoadOrder("昆磨－弥楚，峨山下易门南上")).toEqual(["昆磨", "弥楚"]);
    expect(getRoadOrder("杭瑞-昆磨")).toEqual(["杭瑞", "昆磨"]);
    expect(getRoadOrder("")).toEqual([]);
  });
  it("全角命名的返程能匹配（strict）", () => {
    const rs = [rec(1, "楚雄", "扬武", "昆磨－弥楚，峨山下易门南上"), rec(2, "扬武", "楚雄", "弥楚－昆磨，峨山下易门南上")];
    const out = getTravelRouteProfiles(rs, "楚雄", "扬武")[0];
    expect(getReverseTravelRouteProfile(rs, "楚雄", "扬武", out.routeValue)?.matchQuality).toBe("strict");
  });
  it("顺序相反为 strict，仅组合相同为 loose，不同为 null", () => {
    const outbound = rec(1, "楚雄", "扬武", "弥楚-昆磨-杭瑞");
    const strict = [outbound, rec(2, "扬武", "楚雄", "杭瑞-昆磨-弥楚")];
    const loose = [outbound, rec(2, "扬武", "楚雄", "昆磨-弥楚-杭瑞")];
    const none = [outbound, rec(2, "扬武", "楚雄", "杭瑞-昆磨")];
    const route = "弥楚-昆磨-杭瑞";
    expect(getReverseTravelRouteProfile(strict, "楚雄", "扬武", route)?.matchQuality).toBe("strict");
    expect(getReverseTravelRouteProfile(loose, "楚雄", "扬武", route)?.matchQuality).toBe("loose");
    expect(getReverseTravelRouteProfile(none, "楚雄", "扬武", route)).toBeNull();
  });
  it("历史平均过路费不被 0 元样本拉低", () => {
    const rs = [rec(1, "A", "B", "x", 100), rec(2, "A", "B", "x", 100), rec(3, "A", "B", "x", 0)];
    const profile = getTravelRouteProfiles(rs, "A", "B")[0];
    expect(profile.averageToll).toBe(100);
    expect(profile.zeroTollExcluded).toBe(1);
    expect(profile.tollMin).toBe(0);
    const free = getTravelRouteProfiles([rec(1, "A", "B", "", 0)], "A", "B")[0];
    expect(free.averageToll).toBe(0);
  });
  it("填入对比表时生成分段数组", () => {
    const rs = [rec(1, "A", "B", "x", 80)];
    const out = getTravelRouteProfiles(rs, "A", "B")[0];
    const form = fillCompareFormFromRoute(defaultCompareForm(), out, null);
    expect(form.outboundTolls).toEqual(["80"]);
    expect(form.returnTolls).toEqual(["80"]);
  });
});

describe("出行对比计算", () => {
  const f = defaultCompareForm();
  it("手册 7.3 算例", () => {
    const r = calcTravelComparison({
      ...f, distance: "250", fuelPrice: "7.34", consumption: "5.5", passengers: "2",
      outboundTolls: ["21.85", "92.63"], returnTolls: ["21.85", "92.63"], parking: "20",
      publicOutboundFares: ["80", "20"], publicReturnFares: ["80", "20"], publicTransfer: "30"
    }, null, null);
    expect(r.drivingTotal).toBe(450.81);
    expect(r.drivingPerPerson).toBe(225.41);
    expect(r.publicTotal).toBe(430);
    expect(r.publicPerPerson).toBe(215);
    expect(r.winner).toBe("public");
    expect(r.diff).toBe(20.81);
  });
  it("信息不全时不给结论", () => {
    const r = calcTravelComparison({ ...f, distance: "230" }, null, null);
    expect(r.winner).toBe("incomplete");
    expect(r.missing).toContain("公共交通票价");
    expect(calcTravelComparison(f, null, null).winner).toBe("incomplete");
  });
  it("任意段数", () => {
    const r = calcTravelComparison({
      ...f, distance: "100", outboundTolls: ["10", "20", "30"], returnTolls: ["5", "5"],
      publicOutboundFares: ["1", "2", "3"], publicReturnFares: ["4"]
    }, null, null);
    expect(r.outboundToll).toBe(60);
    expect(r.returnToll).toBe(10);
    expect(r.publicFarePerPerson).toBe(10);
  });
  it("只填第2段时不再叠加 ETC 全程参考价；整个方向留空才使用参考价", () => {
    const rec = { amount: 60 };
    const partial = calcTravelComparison({ ...f, distance: "100", outboundTolls: ["", "30"] }, rec, rec);
    expect(partial.outboundToll).toBe(30);
    expect(partial.outboundTollEstimated).toBe(false);
    const blank = calcTravelComparison({ ...f, distance: "100" }, rec, rec);
    expect(blank.outboundToll).toBe(60);
    expect(blank.outboundTollEstimated).toBe(true);
  });
  it("时间维度：便宜但更慢时换算每小时代价；某项缺时间则不下结论", () => {
    const base = {
      ...f, distance: "250", fuelPrice: "7.34", consumption: "5.5", passengers: "1",
      outboundTolls: ["100"], returnTolls: ["100"], publicOutboundFares: ["60"], publicReturnFares: ["60"]
    };
    const noTime = calcTravelComparison(base, null, null);
    expect(noTime.timeComparison).toBeNull();
    const r = calcTravelComparison({ ...base, drivingMinutes: "180", publicMinutes: "240" }, null, null);
    // 公共交通便宜，自驾快：自驾多花 diff，往返快 120 分钟
    expect(r.winner).toBe("public");
    expect(r.timeComparison.faster).toBe("driving");
    expect(r.timeComparison.perHour).toBeCloseTo(r.diff / 2, 2);
    const dominated = calcTravelComparison({ ...base, drivingMinutes: "300", publicMinutes: "200" }, null, null);
    expect(dominated.timeComparison.perHour).toBeNull();
  });
});

// Test Centers API helpers — mirrors the SVP individual_labor_space Vuex
// `testCenters` module. All requests proxy through the svp-proxy edge function.

import { api } from "./api";

function qs(params?: Record<string, any>) {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return "";
  const usp = new URLSearchParams();
  entries.forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((x) => usp.append(k, String(x)));
    else usp.append(k, String(v));
  });
  return `?${usp.toString()}`;
}

const BASE = "/test_centers";

export const TestCentersApi = {
  getTestCenters: (params?: Record<string, any>) =>
    api(`${BASE}${qs(params)}`),
  createNewTestCenter: (data: any) =>
    api(`${BASE}`, { method: "POST", body: data }),
  updateTestCenter: (id: string | number, payload: any) =>
    api(`${BASE}/${id}`, { method: "PUT", body: payload }),
  getTestCenterById: (id: string | number) =>
    api(`${BASE}/${id}?locale=en`),
  updateTestCenterStatus: (id: string | number, data: any) =>
    api(`${BASE}/${id}/status`, { method: "PUT", body: data }),
};

// Pull the canonical test_center_id from any SVP node (session, reservation,
// or test_center payload). Prefers `test_center_id` (canonical FK) over the
// row's internal `id`, then falls back through nested shapes.
export function extractTestCenterId(node: any): string {
  if (!node) return "";
  const tc = node.test_center || {};
  const candidates = [
    node?.test_center_id,
    tc?.test_center_id,
    tc?.id,
    node?.site?.test_center_id,
    node?.site?.id,
  ];
  for (const v of candidates) {
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

export default TestCentersApi;

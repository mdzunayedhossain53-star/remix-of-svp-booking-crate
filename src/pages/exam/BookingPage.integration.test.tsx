import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks ---------------------------------------------------------------

// Mock the SVP/api gateway. Drive responses based on the URL.
vi.mock("@/lib/api", () => {
  const api = vi.fn(async (path: string) => {
    // eslint-disable-next-line no-console
    console.log("API CALL:", path);
    if (path.startsWith("/occupations")) {
      return {
        data: [
          {
            id: 555,
            name: "Welder",
            category_id: 42,
            methodology_type: "in_person",
            prometric_codes: [{ code: "en", english_name: "English" }],
          },
        ],
      };
    }
    if (path.startsWith("/available-dates")) {
      return {
        data: [
          { date: "2026-06-15", city: "Bogura" },
        ],
      };
    }
    if (path.startsWith("/exam-sessions/")) {
      // detail fetch returns the real test_center.name but no site_id (null)
      return {
        exam_session: {
          id: 9001,
          test_center: {
            name: "Technical Training Centre (TTC), Bogura",
            city: "Bogura",
            site_id: null,
          },
        },
      };
    }
    if (path.startsWith("/exam-sessions")) {
      // list returns sessions with site_id null
      return {
        exam_sessions: [
          {
            id: 9001,
            site_id: null,
            site_city: "Bogura",
            available_seats: 5,
          },
        ],
      };
    }
    if (path.startsWith("/user-balance")) {
      return { reservation_credits: 1, free_certificates_total: 0 };
    }
    return null;
  });
  return {
    api,
    getSession: () => ({ accessToken: "t", refreshToken: "r", sessionId: "s" }),
    getBackendUrl: () => "http://localhost",
  };
});

// Mock supabase client: respond to test_centers queries.
vi.mock("@/integrations/supabase/client", () => {
  const rowsByCity = [
    { site_id: 107, name: "Technical Training Centre (TTC), Bogura", city: "Bogura" },
  ];
  const builder = (table: string) => {
    const state: any = { table, filters: {}, columns: "" };
    const chain: any = {
      select(cols: string) {
        state.columns = cols;
        return chain;
      },
      in(col: string, vals: any[]) {
        state.filters[col] = vals;
        // Resolve immediately when awaited.
        return Promise.resolve({
          data: rowsByCity.filter((row: any) =>
            vals.map(String).includes(String(row[col as keyof typeof row]))
          ),
          error: null,
        });
      },
    };
    return chain;
  };
  return { supabase: { from: builder } };
});

import BookingPage from "./BookingPage";

beforeEach(() => {
  // BookingPage reads from URL: occupationId, categoryId, siteCity, examDate
  // MemoryRouter handles routing.
});

describe("BookingPage integration: sessionsWithResolvedCenters → UI", () => {
  it("stamps site_id from DB name→site_id map and renders resolved center name in the dropdown", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/booking?occupationId=555&siteCity=Bogura&examDate=2026-06-15&languageCode=en",
        ]}
      >
        <BookingPage />
      </MemoryRouter>
    );

    // Wait for the center dropdown to display the resolved name + site_id.
    await new Promise((r) => setTimeout(r, 200));
    // eslint-disable-next-line no-console
    console.log("BODY:", document.body.innerHTML.slice(0, 3000));
    await waitFor(
      () => {
        const opts = Array.from(
          document.querySelectorAll("option")
        ) as HTMLOptionElement[];
        const match = opts.find(
          (o) =>
            o.textContent?.includes("Technical Training Centre (TTC), Bogura") &&
            o.textContent?.includes("Site #107")
        );
        expect(match).toBeTruthy();
      },
      { timeout: 10000 }
    );

    // And the session dropdown also shows the resolved name + stamped site_id.
    await waitFor(() => {
      const opts = Array.from(
        document.querySelectorAll("option")
      ) as HTMLOptionElement[];
      const sessionOpt = opts.find(
        (o) =>
          o.textContent?.includes("Session #9001") &&
          o.textContent?.includes("Site #107")
      );
      expect(sessionOpt).toBeTruthy();
    });
  });
});

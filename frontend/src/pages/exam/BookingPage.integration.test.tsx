import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- Mocks ---------------------------------------------------------------

const { apiMock, getCachedCenterMock, setCachedCenterMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  getCachedCenterMock: vi.fn(),
  setCachedCenterMock: vi.fn(),
}));

// Mock the SVP/api gateway. Drive responses based on the URL.
vi.mock("@/lib/api", () => {
  apiMock.mockImplementation(async (path: string) => {
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
      return { data: [{ date: "2026-06-15", city: "Bogura" }] };
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
      // list returns sessions with site_id null (the SVP gap we are filling in)
      return {
        exam_sessions: [
          { id: 9001, site_id: null, site_city: "Bogura", available_seats: 5 },
        ],
      };
    }
    if (path.startsWith("/user-balance")) {
      return { reservation_credits: 1, free_certificates_total: 0 };
    }
    if (path.startsWith("/temporary-seats")) {
      return { id: 1234 };
    }
    if (path.startsWith("/exam-reservations")) {
      return {
        id: 7777,
        exam_session: {
          id: 9001,
          test_center: {
            test_center_id: 451,
            test_center_name: "Verified Real Test Centre, Bogura",
            test_center_city: "Bogura",
            address: "Real Road, Bogura",
          },
        },
      };
    }
    return null;
  });
  return {
    api: apiMock,
    getSession: () => ({ accessToken: "t", refreshToken: "r", sessionId: "s" }),
    getBackendUrl: () => "http://localhost",
  };
});

// Mock Supabase: respond to test_centers DB queries.
vi.mock("@/integrations/supabase/client", () => {
  const rows = [
    { site_id: 107, name: "Technical Training Centre (TTC), Bogura", city: "Bogura" },
  ];
  const from = () => {
    const chain: any = {
      select() {
        return chain;
      },
      in(col: string, vals: any[]) {
        return Promise.resolve({
          data: rows.filter((row: any) =>
            vals.map(String).includes(String(row[col as keyof typeof row]))
          ),
          error: null,
        });
      },
    };
    return chain;
  };
  return { supabase: { from } };
});

vi.mock("@/lib/revealed-centers-cache", () => ({
  getCachedCenter: getCachedCenterMock,
  setCachedCenter: setCachedCenterMock,
}));

import BookingPage from "./BookingPage";

describe("BookingPage integration: sessionsWithResolvedCenters → UI", () => {
  beforeEach(() => {
    vi.useRealTimers();
    apiMock.mockClear();
    getCachedCenterMock.mockReset();
    getCachedCenterMock.mockResolvedValue(null);
    setCachedCenterMock.mockReset();
    setCachedCenterMock.mockImplementation((_key, value) => {
      getCachedCenterMock.mockResolvedValue({
        ...value,
        revealedAt: new Date().toISOString(),
        source: "local",
      });
    });
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("stamps site_id via DB name→site_id lookup and renders the resolved center in both dropdowns", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/booking?occupationId=555&siteCity=Bogura&examDate=2026-06-15&languageCode=en",
        ]}
      >
        <BookingPage />
      </MemoryRouter>
    );

    // Center dropdown shows resolved name + the site_id stamped from the DB lookup.
    await waitFor(
      () => {
        const opts = Array.from(document.querySelectorAll("option")) as HTMLOptionElement[];
        const match = opts.find(
          (o) =>
            o.value === "107" &&
            o.textContent?.includes("Technical Training Centre (TTC), Bogura") &&
            o.textContent?.includes("Site #107")
        );
        expect(match).toBeTruthy();
      },
      { timeout: 5000 }
    );

    // Session dropdown reflects the same resolved name + stamped site_id,
    // proving resolveSessionCenter wrote site_id onto the session object.
    await waitFor(() => {
      const opts = Array.from(document.querySelectorAll("option")) as HTMLOptionElement[];
      const sessionOpt = opts.find(
        (o) =>
          o.textContent?.includes("Session #9001") &&
          o.textContent?.includes("Site #107") &&
          o.textContent?.includes("Technical Training Centre (TTC), Bogura")
      );
      expect(sessionOpt).toBeTruthy();
    });
  });

  it("shows an already verified shared SQL centre without creating a reservation", async () => {
    getCachedCenterMock.mockResolvedValue({
      id: "451",
      name: "Verified Real Test Centre, Bogura",
      address: "Real Road, Bogura",
      city: "Bogura",
      revealedAt: new Date().toISOString(),
      source: "shared",
    });

    render(
      <MemoryRouter
        initialEntries={[
          "/booking?occupationId=555&siteCity=Bogura&examDate=2026-06-15&languageCode=en",
        ]}
      >
        <BookingPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("reveal-real-center-name"))
        .toHaveTextContent("Verified Real Test Centre, Bogura");
    }, { timeout: 3000 });

    await waitFor(() => {
      const testCenterSelect = screen.getByLabelText("Test Center *") as HTMLSelectElement;
      const centerOptions = Array.from(testCenterSelect.options).filter((option) => option.value);
      expect(centerOptions).toHaveLength(1);
      expect(centerOptions[0].value).toBe("451");
    });

    const reservationPosts = apiMock.mock.calls.filter(
      ([path, options]) => path === "/exam-reservations" && options?.method === "POST"
    );
    expect(reservationPosts).toHaveLength(0);
    expect(screen.queryByTestId("reveal-real-center-btn")).not.toBeInTheDocument();
  });

  it("reads an existing category/city/date SQL reveal when no exact session row exists", async () => {
    getCachedCenterMock.mockImplementation(async (key: string) => {
      if (key !== "cat-42|city-bogura|date-2026-06-15") return null;
      return {
        id: "107",
        name: "Bogura Technical Training Centre",
        address: "",
        city: "Bogura",
        revealedAt: new Date().toISOString(),
        source: "shared",
      };
    });

    render(
      <MemoryRouter
        initialEntries={[
          "/booking?occupationId=555&siteCity=Bogura&examDate=2026-06-15&languageCode=en",
        ]}
      >
        <BookingPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("reveal-real-center-name"))
        .toHaveTextContent("Bogura Technical Training Centre");
    });
    expect(getCachedCenterMock).toHaveBeenCalledWith("cat-42|city-bogura|date-2026-06-15");
    expect(setCachedCenterMock).not.toHaveBeenCalled();

    const reservationPosts = apiMock.mock.calls.filter(
      ([path, options]) => path === "/exam-reservations" && options?.method === "POST"
    );
    expect(reservationPosts).toHaveLength(0);
  });
});

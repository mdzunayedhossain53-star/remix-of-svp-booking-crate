import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET_RAW = Deno.env.get("JWT_ACCESS_SECRET") || "access-backend-secret-key-change-me";

async function getJwtKey() {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw", encoder.encode(JWT_SECRET_RAW),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function publicAccount(a: any) {
  return {
    id: a.id, name: a.name, email: a.email, role: a.role, status: a.status,
    agency_id: a.agency_id, created_by_id: a.created_by_id,
    created_at: a.created_at, updated_at: a.updated_at,
  };
}

async function getAuth(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const key = await getJwtKey();
    const payload = await verify(token, key);
    return payload as { sub: string; role: string };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await getAuth(req);
  if (!auth || auth.role !== "ADMIN") {
    return new Response(JSON.stringify({ message: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/access-admin/, "");
  const supabase = getSupabase();

  try {
    // POST /agencies
    if (path === "/agencies" && req.method === "POST") {
      const { name, email, password, status } = await req.json();
      if (!name || !email || !password) {
        return new Response(JSON.stringify({ message: "name, email, password required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await supabase.from("accounts").select("id").eq("email", email.toLowerCase()).single();
      if (existing) {
        return new Response(JSON.stringify({ message: "Email already in use" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hash = bcrypt.hashSync(password);
      const { data: account, error } = await supabase.from("accounts").insert({
        name, email: email.toLowerCase(), password: hash,
        role: "AGENCY", status: status || "PENDING", created_by_id: auth.sub,
      }).select().single();

      if (error) throw error;
      return new Response(JSON.stringify({ message: "Agency created", agency: publicAccount(account) }), {
        status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /users
    if (path === "/users" && req.method === "POST") {
      const { name, email, password, agencyId, status } = await req.json();
      if (!name || !email || !password) {
        return new Response(JSON.stringify({ message: "name, email, password required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await supabase.from("accounts").select("id").eq("email", email.toLowerCase()).single();
      if (existing) {
        return new Response(JSON.stringify({ message: "Email already in use" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (agencyId) {
        const { data: agency } = await supabase.from("accounts").select("id,role").eq("id", agencyId).single();
        if (!agency || agency.role !== "AGENCY") {
          return new Response(JSON.stringify({ message: "Invalid agencyId" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const hash = bcrypt.hashSync(password);
      const { data: account, error } = await supabase.from("accounts").insert({
        name, email: email.toLowerCase(), password: hash,
        role: "USER", status: status || "PENDING",
        agency_id: agencyId || null, created_by_id: auth.sub,
      }).select().single();

      if (error) throw error;
      return new Response(JSON.stringify({ message: "User created", user: publicAccount(account) }), {
        status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PATCH /accounts/:id/status
    const statusMatch = path.match(/^\/accounts\/([^/]+)\/status$/);
    if (statusMatch && req.method === "PATCH") {
      const id = statusMatch[1];
      const { status } = await req.json();
      if (!["PENDING", "ACTIVE", "BLOCKED"].includes(status)) {
        return new Response(JSON.stringify({ message: "Invalid status" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: account } = await supabase.from("accounts").select("*").eq("id", id).single();
      if (!account) {
        return new Response(JSON.stringify({ message: "Account not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (account.id === auth.sub) {
        return new Response(JSON.stringify({ message: "Cannot change own status" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: updated, error } = await supabase.from("accounts").update({ status }).eq("id", id).select().single();
      if (error) throw error;
      return new Response(JSON.stringify({ message: "Status updated", account: publicAccount(updated) }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PATCH /accounts/:id/password
    const pwMatch = path.match(/^\/accounts\/([^/]+)\/password$/);
    if (pwMatch && req.method === "PATCH") {
      const id = pwMatch[1];
      const { password } = await req.json();
      if (!password || password.length < 8) {
        return new Response(JSON.stringify({ message: "Password must be at least 8 characters" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: account } = await supabase.from("accounts").select("id").eq("id", id).single();
      if (!account) {
        return new Response(JSON.stringify({ message: "Account not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hash = bcrypt.hashSync(password);
      const { error } = await supabase.from("accounts").update({ password: hash }).eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ message: "Password updated successfully" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /accounts
    if (path === "/accounts" && req.method === "GET") {
      const role = url.searchParams.get("role");
      const status = url.searchParams.get("status");

      let query = supabase.from("accounts").select("*").order("created_at", { ascending: false });
      if (role) query = query.eq("role", role);
      if (status) query = query.eq("status", status);

      const { data: accounts, error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify({ accounts: (accounts || []).map(publicAccount) }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ message: "Not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ message: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GUMROAD_ACCESS_TOKEN = Deno.env.get("GUMROAD_ACCESS_TOKEN") || "";
const GUMROAD_PRODUCT_ID = Deno.env.get("GUMROAD_PRODUCT_ID") || "";
const GUMROAD_PRODUCT_PERMALINK = Deno.env.get("GUMROAD_PRODUCT_PERMALINK") || "";
const TRIAL_DURATION_DAYS = Number(Deno.env.get("TRIAL_DURATION_DAYS") || "1");
const DEVICE_STALE_AFTER_HOURS = Number(
  Deno.env.get("DEVICE_STALE_AFTER_HOURS") || "1",
);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type LicensePlan = "free" | "trial" | "pro";

type LicenseRow = {
  id: string;
  email: string;
  license_key: string | null;
  license_key_masked: string | null;
  plan: LicensePlan;
  trial_device_id: string | null;
  trial_start: string | null;
  trial_end: string | null;
  purchase_date: string | null;
  gumroad_sale_id: string | null;
  gumroad_product_id: string | null;
  gumroad_variant_id: string | null;
  gumroad_refunded: boolean | null;
  gumroad_disputed: boolean | null;
  raw_gumroad: Record<string, unknown> | null;
  updated_at?: string;
};

type DeviceRow = {
  id: string;
  license_id: string;
  device_id: string;
  device_name: string | null;
  app_version: string | null;
  first_seen_at: string;
  last_seen_at: string;
  released_at: string | null;
  is_active: boolean;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLicenseKey(value: unknown) {
  return String(value || "").trim();
}

function normalizeDeviceId(value: unknown) {
  return String(value || "").trim();
}

function normalizeDeviceName(value: unknown) {
  return String(value || "").trim();
}

function normalizeAppVersion(value: unknown) {
  return String(value || "").trim();
}

function maskLicenseKey(licenseKey: string) {
  if (!licenseKey) return "";
  if (licenseKey.length <= 8) return licenseKey;
  return `${licenseKey.slice(0, 4)}...${licenseKey.slice(-4)}`;
}

function assertEmail(email: string) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Invalid email");
  }
}

function assertLicenseKey(licenseKey: string) {
  if (licenseKey.length < 8) {
    throw new Error("Invalid license key");
  }
}

function assertDeviceId(deviceId: string) {
  if (deviceId.length < 8) {
    throw new Error("Invalid device_id");
  }
}

function activePlanFromRow(row: Partial<LicenseRow> | null | undefined): LicensePlan {
  if (!row) return "free";
  if (row.plan === "pro") return "pro";
  if (row.plan === "trial" && row.trial_end) {
    return new Date(row.trial_end).getTime() > Date.now() ? "trial" : "free";
  }
  return "free";
}

function isDeviceStale(device: Partial<DeviceRow> | null | undefined) {
  if (!device?.last_seen_at) return true;
  const staleAfterMs = Math.max(1, DEVICE_STALE_AFTER_HOURS) * 60 * 60 * 1000;
  return Date.now() - new Date(device.last_seen_at).getTime() > staleAfterMs;
}

function serializeLicense(
  row: Partial<LicenseRow> | null | undefined,
  device: Partial<DeviceRow> | null | undefined = null,
) {
  const plan = activePlanFromRow(row);
  return {
    plan,
    email: row?.email || "",
    licenseKeyMasked: row?.license_key_masked || "",
    trial_end: row?.trial_end || null,
    purchase_date: row?.purchase_date || null,
    device_id: device?.device_id || null,
    device_name: device?.device_name || null,
    device_last_seen_at: device?.last_seen_at || null,
    source: "supabase",
  };
}

async function getLicenseByEmail(email: string) {
  const { data, error } = await supabase
    .from("licenses")
    .select("*")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as LicenseRow | null;
}

async function getLicenseByKey(licenseKey: string) {
  const { data, error } = await supabase
    .from("licenses")
    .select("*")
    .eq("license_key", licenseKey)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as LicenseRow | null;
}

async function getTrialByDevice(deviceId: string) {
  const { data, error } = await supabase
    .from("licenses")
    .select("*")
    .eq("trial_device_id", deviceId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as LicenseRow | null;
}

async function upsertLicense(row: Partial<LicenseRow>) {
  const payload = {
    email: normalizeEmail(row.email),
    license_key: row.license_key ?? null,
    license_key_masked: row.license_key_masked ?? null,
    plan: row.plan ?? "free",
    trial_device_id: row.trial_device_id ?? null,
    trial_start: row.trial_start ?? null,
    trial_end: row.trial_end ?? null,
    purchase_date: row.purchase_date ?? null,
    gumroad_sale_id: row.gumroad_sale_id ?? null,
    gumroad_product_id: row.gumroad_product_id ?? null,
    gumroad_variant_id: row.gumroad_variant_id ?? null,
    gumroad_refunded: row.gumroad_refunded ?? false,
    gumroad_disputed: row.gumroad_disputed ?? false,
    raw_gumroad: row.raw_gumroad ?? null,
    updated_at: nowIso(),
  };

  const { data, error } = await supabase
    .from("licenses")
    .upsert(payload, { onConflict: "email" })
    .select("*")
    .single();

  if (error) throw error;
  return data as LicenseRow;
}

async function listActiveDevices(licenseId: string) {
  const { data, error } = await supabase
    .from("license_devices")
    .select("*")
    .eq("license_id", licenseId)
    .eq("is_active", true)
    .is("released_at", null)
    .order("last_seen_at", { ascending: false });

  if (error) throw error;
  return (data || []) as DeviceRow[];
}

async function releaseDeviceById(id: string) {
  const { error } = await supabase
    .from("license_devices")
    .update({
      is_active: false,
      released_at: nowIso(),
      last_seen_at: nowIso(),
    })
    .eq("id", id);

  if (error) throw error;
}

async function releaseAllDevices(licenseId: string) {
  const { error } = await supabase
    .from("license_devices")
    .update({
      is_active: false,
      released_at: nowIso(),
      last_seen_at: nowIso(),
    })
    .eq("license_id", licenseId)
    .eq("is_active", true)
    .is("released_at", null);

  if (error) throw error;
}

async function getDeviceRecord(licenseId: string, deviceId: string) {
  const { data, error } = await supabase
    .from("license_devices")
    .select("*")
    .eq("license_id", licenseId)
    .eq("device_id", deviceId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as DeviceRow | null;
}

async function upsertDevice(params: {
  licenseId: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
}) {
  const existing = await getDeviceRecord(params.licenseId, params.deviceId);
  const payload = {
    license_id: params.licenseId,
    device_id: params.deviceId,
    device_name: params.deviceName || null,
    app_version: params.appVersion || null,
    first_seen_at: existing?.first_seen_at || nowIso(),
    last_seen_at: nowIso(),
    released_at: null,
    is_active: true,
  };

  const { data, error } = await supabase
    .from("license_devices")
    .upsert(payload, { onConflict: "license_id,device_id" })
    .select("*")
    .single();

  if (error) throw error;
  return data as DeviceRow;
}

async function ensureDeviceAccess(params: {
  license: LicenseRow;
  deviceId: string;
  deviceName: string;
  appVersion: string;
}) {
  const activeDevices = await listActiveDevices(params.license.id);
  const current = activeDevices.find((item) => item.device_id === params.deviceId) || null;

  if (current) {
    const device = await upsertDevice({
      licenseId: params.license.id,
      deviceId: params.deviceId,
      deviceName: params.deviceName || current.device_name || "",
      appVersion: params.appVersion || current.app_version || "",
    });
    return {
      ok: true as const,
      device,
    };
  }

  const conflict = activeDevices[0] || null;
  if (conflict && !isDeviceStale(conflict)) {
    return {
      ok: false as const,
      error: "LICENSE_IN_USE",
      status: 409,
      device: conflict,
    };
  }

  if (conflict) {
    await releaseDeviceById(conflict.id);
  }

  const device = await upsertDevice({
    licenseId: params.license.id,
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    appVersion: params.appVersion,
  });

  return {
    ok: true as const,
    device,
  };
}

async function verifyWithGumroad(licenseKey: string) {
  if (!GUMROAD_ACCESS_TOKEN || (!GUMROAD_PRODUCT_ID && !GUMROAD_PRODUCT_PERMALINK)) {
    throw new Error(
      "Missing GUMROAD_ACCESS_TOKEN and product identifier (GUMROAD_PRODUCT_ID or GUMROAD_PRODUCT_PERMALINK)",
    );
  }

  const body = new URLSearchParams();
  body.set("access_token", GUMROAD_ACCESS_TOKEN);
  body.set("license_key", licenseKey);
  body.set("increment_uses_count", "false");
  if (GUMROAD_PRODUCT_ID) {
    body.set("product_id", GUMROAD_PRODUCT_ID);
  } else if (GUMROAD_PRODUCT_PERMALINK) {
    body.set("product_permalink", GUMROAD_PRODUCT_PERMALINK);
  }

  const response = await fetch("https://api.gumroad.com/v2/licenses/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      String(
        (payload as Record<string, unknown>)?.message ||
          `Gumroad verify failed (${response.status})`,
      ),
    );
  }

  return payload as Record<string, any>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const email = normalizeEmail(body?.email);
    const licenseKey = normalizeLicenseKey(body?.licenseKey);
    const deviceId = normalizeDeviceId(body?.deviceId ?? body?.device_id);
    const deviceName = normalizeDeviceName(body?.deviceName ?? body?.device_name);
    const appVersion = normalizeAppVersion(body?.appVersion ?? body?.app_version);

    if (!["activate", "status", "start_trial", "release_device"].includes(action)) {
      return json({ error: "Invalid action" }, 400);
    }

    if (action === "start_trial") {
      assertEmail(email);
      assertDeviceId(deviceId);
      const existing = await getLicenseByEmail(email);
      const existingTrialDevice = await getTrialByDevice(deviceId);
      const existingPlan = activePlanFromRow(existing);

      if (
        existingTrialDevice &&
        String(existingTrialDevice.email || "").trim().toLowerCase() !== email
      ) {
        return json({ error: "Trial already used on this device" }, 403);
      }

      if (existingPlan === "pro" && existing) {
        const access = await ensureDeviceAccess({
          license: existing,
          deviceId,
          deviceName,
          appVersion,
        });
        if (!access.ok) {
          return json(
            {
              error: access.error,
              active_device_id: access.device.device_id,
              active_device_name: access.device.device_name,
            },
            access.status,
          );
        }
        return json(serializeLicense(existing, access.device));
      }

      if (existing?.trial_end) {
        const trialStillActive = new Date(existing.trial_end).getTime() > Date.now();
        if (trialStillActive) {
          const access = await ensureDeviceAccess({
            license: existing,
            deviceId,
            deviceName,
            appVersion,
          });
          if (!access.ok) {
            return json(
              {
                error: access.error,
                active_device_id: access.device.device_id,
                active_device_name: access.device.device_name,
              },
              access.status,
            );
          }
          return json(serializeLicense(existing, access.device));
        }

        return json({ error: "Trial already used" }, 403);
      }

      const trialRow = await upsertLicense({
        email,
        plan: "trial",
        trial_device_id: deviceId,
        trial_start: nowIso(),
        trial_end: addDaysIso(TRIAL_DURATION_DAYS),
      });

      const access = await ensureDeviceAccess({
        license: trialRow,
        deviceId,
        deviceName,
        appVersion,
      });
      if (!access.ok) {
        return json(
          {
            error: access.error,
            active_device_id: access.device.device_id,
            active_device_name: access.device.device_name,
          },
          access.status,
        );
      }

      return json(serializeLicense(trialRow, access.device));
    }

    if (action === "release_device") {
      assertDeviceId(deviceId);
      let existing = licenseKey ? await getLicenseByKey(licenseKey) : null;
      if (!existing && email) {
        assertEmail(email);
        existing = await getLicenseByEmail(email);
      }
      if (!existing) {
        return json({
          released: true,
          plan: "free",
          email,
          device_id: deviceId,
        });
      }

      if (licenseKey && existing.license_key && licenseKey !== existing.license_key) {
        return json({ error: "License key mismatch" }, 403);
      }

      const { data, error } = await supabase
        .from("license_devices")
        .update({
          is_active: false,
          released_at: nowIso(),
          last_seen_at: nowIso(),
        })
        .eq("license_id", existing.id)
        .eq("device_id", deviceId)
        .select("*")
        .maybeSingle();

      if (error) throw error;

      return json({
        released: true,
        plan: activePlanFromRow(existing),
        email,
        device_id: deviceId,
        device_name: data?.device_name || null,
      });
    }

    const existing =
      (licenseKey ? await getLicenseByKey(licenseKey) : null) ||
      (email ? await getLicenseByEmail(email) : null);
    if (action === "status") {
      assertDeviceId(deviceId);
      if (!existing) {
        return json({
          plan: "free",
          email,
          licenseKeyMasked: "",
          trial_end: null,
          purchase_date: null,
          device_id: null,
          device_name: null,
          device_last_seen_at: null,
          source: "supabase",
        });
      }

      let license = existing;
      if (existing.plan === "pro" && existing.license_key) {
        try {
          const gumroad = await verifyWithGumroad(existing.license_key);
          const sale = gumroad.sale || {};
          license = await upsertLicense({
            ...existing,
            email,
            plan: sale.refunded || sale.disputed ? "free" : "pro",
            purchase_date: sale.created_at || existing.purchase_date,
            gumroad_sale_id: sale.id || existing.gumroad_sale_id,
            gumroad_product_id: sale.product_id || existing.gumroad_product_id,
            gumroad_variant_id: sale.variant_id || existing.gumroad_variant_id,
            gumroad_refunded: !!sale.refunded,
            gumroad_disputed: !!sale.disputed,
            raw_gumroad: gumroad,
          });
          if (license.plan === "free") {
            await releaseAllDevices(license.id);
          }
        } catch (_) {
          // Keep the last known license state if Gumroad is temporarily unavailable.
        }
      }

      const plan = activePlanFromRow(license);
      if (plan === "free") {
        return json(serializeLicense(license));
      }

      const access = await ensureDeviceAccess({
        license,
        deviceId,
        deviceName,
        appVersion,
      });
      if (!access.ok) {
        return json(
          {
            error: access.error,
            active_device_id: access.device.device_id,
            active_device_name: access.device.device_name,
          },
          access.status,
        );
      }

      return json(serializeLicense(license, access.device));
    }

    assertLicenseKey(licenseKey);
    assertDeviceId(deviceId);

    const gumroad = await verifyWithGumroad(licenseKey);
    const success = !!gumroad?.success;
    const sale = gumroad?.sale || {};

    if (!success) {
      return json({ error: "License not valid" }, 403);
    }

    const purchaseEmail = normalizeEmail(sale.email || email);
    if (email) {
      assertEmail(email);
    }
    if (email && purchaseEmail && purchaseEmail !== email) {
      return json({ error: "License email does not match purchase email" }, 403);
    }

    if (sale.refunded || sale.disputed) {
      const revoked = await upsertLicense({
        email: purchaseEmail || email,
        license_key: licenseKey,
        license_key_masked: maskLicenseKey(licenseKey),
        plan: "free",
        purchase_date: sale.created_at || null,
        gumroad_sale_id: sale.id || null,
        gumroad_product_id: sale.product_id || null,
        gumroad_variant_id: sale.variant_id || null,
        gumroad_refunded: !!sale.refunded,
        gumroad_disputed: !!sale.disputed,
        raw_gumroad: gumroad,
      });
      await releaseAllDevices(revoked.id);
      return json(serializeLicense(revoked), 403);
    }

    const licensed = await upsertLicense({
      email: purchaseEmail || email,
      license_key: licenseKey,
      license_key_masked: maskLicenseKey(licenseKey),
      plan: "pro",
      trial_start: null,
      trial_end: null,
      purchase_date: sale.created_at || nowIso(),
      gumroad_sale_id: sale.id || null,
      gumroad_product_id: sale.product_id || null,
      gumroad_variant_id: sale.variant_id || null,
      gumroad_refunded: !!sale.refunded,
      gumroad_disputed: !!sale.disputed,
      raw_gumroad: gumroad,
    });

    const access = await ensureDeviceAccess({
      license: licensed,
      deviceId,
      deviceName,
      appVersion,
    });
    if (!access.ok) {
      return json(
        {
          error: access.error,
          active_device_id: access.device.device_id,
          active_device_name: access.device.device_name,
        },
        access.status,
      );
    }

    return json(serializeLicense(licensed, access.device));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      400,
    );
  }
});

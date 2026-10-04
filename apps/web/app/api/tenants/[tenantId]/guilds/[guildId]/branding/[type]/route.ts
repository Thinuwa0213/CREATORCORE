import { NextRequest, NextResponse } from "next/server";
import { callApiServer } from "@/lib/api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; guildId: string; type: string }> },
) {
  const { tenantId, guildId, type } = await params;
  if (!tenantId || !guildId || (type !== "avatar" && type !== "banner")) {
    return NextResponse.json({ error: "INVALID_PARAMETERS" }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const res = await callApiServer<{
      ok: boolean;
      avatarUrl?: string;
      bannerUrl?: string;
      fileSizeBytes?: number;
      usedStorageBytes?: number;
      maxStorageBytes?: number;
      message?: string;
      error?: string;
    }>(`/app/tenants/${encodeURIComponent(tenantId)}/guilds/${encodeURIComponent(guildId)}/branding/${type}`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error || "Failed to upload file to storage" },
        { status: res.status || 500 },
      );
    }

    return NextResponse.json(res.data);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal upload error" },
      { status: 500 },
    );
  }
}
